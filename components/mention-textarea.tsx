'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Textarea } from '@/components/ui/textarea'

// ============================================================================
// Types
// ============================================================================

interface MentionUser {
  id: string
  full_name: string | null
  department?: string | null
  nickname?: string | null
}

interface MentionTextareaProps {
  value: string
  onChange: (value: string) => void
  users: MentionUser[]
  placeholder?: string
  rows?: number
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onMentionedUsersChange?: (userIds: string[]) => void
}

// ============================================================================
// MentionTextarea Component
// ============================================================================

export default function MentionTextarea({
  value,
  onChange,
  users,
  placeholder,
  rows = 2,
  className,
  onKeyDown,
  onMentionedUsersChange,
}: MentionTextareaProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter users based on search
  const filteredUsers = users.filter(u => {
    if (!search) return true
    const name = (u.full_name || '').toLowerCase()
    const nick = (u.nickname || '').toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || nick.includes(q)
  }).slice(0, 8)

  // Extract mentioned user IDs from value
  useEffect(() => {
    if (!onMentionedUsersChange) return
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
    const ids: string[] = []
    let match
    while ((match = mentionRegex.exec(value)) !== null) {
      ids.push(match[2])
    }
    onMentionedUsersChange(ids)
  }, [value, onMentionedUsersChange])

  // Handle textarea input to detect @
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart || 0

    onChange(newValue)

    // Detect @ trigger
    const textBeforeCursor = newValue.slice(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    if (atIndex >= 0) {
      // Check if @ is at start or preceded by space/newline
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1)
        // Don't show if query contains space (already selected or just typing)
        if (!query.includes(' ') && !query.includes('\n')) {
          setSearch(query)
          setMentionStart(atIndex)
          setShowDropdown(true)
          setSelectedIndex(0)
          return
        }
      }
    }

    setShowDropdown(false)
    setMentionStart(null)
  }, [onChange])

  // Select a user from dropdown
  const selectUser = useCallback((user: MentionUser) => {
    if (mentionStart === null) return

    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart || 0
    const before = value.slice(0, mentionStart)
    const after = value.slice(cursorPos)
    const displayName = user.nickname || user.full_name || user.id.slice(0, 8)

    // Insert mention in format: @[Name](userId) 
    const mention = `@${displayName} `
    const newValue = before + mention + after

    onChange(newValue)
    setShowDropdown(false)
    setMentionStart(null)

    // Track mentioned user
    if (onMentionedUsersChange) {
      const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
      const ids: string[] = [user.id]
      let match
      while ((match = mentionRegex.exec(newValue)) !== null) {
        ids.push(match[2])
      }
      onMentionedUsersChange([...new Set(ids)])
    }

    // Refocus after state update
    setTimeout(() => {
      textarea.focus()
      const newPos = before.length + mention.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }, [mentionStart, value, onChange, onMentionedUsersChange])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDropdown && filteredUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % filteredUsers.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + filteredUsers.length) % filteredUsers.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        selectUser(filteredUsers[selectedIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowDropdown(false)
        return
      }
    }
    // Forward other key events
    onKeyDown?.(e)
  }, [showDropdown, filteredUsers, selectedIndex, selectUser, onKeyDown])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative flex-1">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />

      {/* Mention Dropdown */}
      {showDropdown && filteredUsers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full mb-1 left-0 w-full max-w-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
            แท็กเพื่อแจ้งเตือน
          </div>
          <div className="max-h-[200px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {filteredUsers.map((user, i) => (
              <button
                key={user.id}
                onMouseDown={(e) => {
                  e.preventDefault() // prevent textarea blur
                  selectUser(user)
                }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors
                  ${i === selectedIndex ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}
                `}
              >
                {/* Avatar circle */}
                <div className={`
                  flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold shrink-0
                  ${i === selectedIndex ? 'bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-200' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}
                `}>
                  {(user.nickname || user.full_name || '?')[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.full_name || 'ไม่ระบุชื่อ'}
                  </p>
                  {user.department && (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate">
                      {user.department}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
