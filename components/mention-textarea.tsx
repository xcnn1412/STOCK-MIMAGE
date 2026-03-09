'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

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
// Mention regex & helpers
// ============================================================================

const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g

function extractMentionIds(text: string): string[] {
  const ids: string[] = []
  let match
  const regex = new RegExp(MENTION_REGEX.source, 'g')
  while ((match = regex.exec(text)) !== null) {
    ids.push(match[2])
  }
  return ids
}

// ============================================================================
// MentionTextarea Component
//
// Uses an overlay technique: a transparent textarea handles editing/cursor,
// while a styled div behind it renders mention badges in-place.
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
  const highlightRef = useRef<HTMLDivElement>(null)
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
    onMentionedUsersChange(extractMentionIds(value))
  }, [value, onMentionedUsersChange])

  // Sync scroll between textarea and highlight overlay
  const syncScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

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
        // Only show if typing a fresh mention (not mid-word, not inside an existing mention)
        if (!query.includes(' ') && !query.includes('\n') && !query.includes('[')) {
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
    const mention = `@[${displayName}](${user.id}) `
    const newValue = before + mention + after

    onChange(newValue)
    setShowDropdown(false)
    setMentionStart(null)

    // Track mentioned user
    if (onMentionedUsersChange) {
      onMentionedUsersChange([...new Set([...extractMentionIds(newValue)])])
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

  // Build highlighted content — replace @[Name](userId) with styled span
  // The highlight div mirrors the textarea content but shows styled mentions
  const buildHighlightedContent = () => {
    if (!value) return null

    const regex = new RegExp(MENTION_REGEX.source, 'g')
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match

    while ((match = regex.exec(value)) !== null) {
      // Text before mention
      if (match.index > lastIndex) {
        parts.push(
          <span key={`t-${lastIndex}`} className="invisible">
            {value.slice(lastIndex, match.index)}
          </span>
        )
      }

      const displayName = match[1]
      // The mention badge — visible, positioned exactly where the raw text was
      // We need the badge to take the SAME width as the raw text, so we use an inline approach
      const rawLength = match[0].length
      parts.push(
        <span key={`m-${match.index}`} className="relative">
          {/* Invisible spacer matching raw text length */}
          <span className="invisible whitespace-pre">{match[0]}</span>
          {/* Visible badge overlay */}
          <span className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-semibold whitespace-nowrap pointer-events-none max-w-full">
            <span className="truncate">@{displayName}</span>
          </span>
          {/* Padding to cover the remaining raw text width with invisible text */}
          <span className="invisible">{' '.repeat(Math.max(0, rawLength - displayName.length - 4))}</span>
        </span>
      )

      lastIndex = match.index + match[0].length
    }

    // Remaining text after last mention  
    if (lastIndex < value.length) {
      parts.push(
        <span key={`t-${lastIndex}`} className="invisible">
          {value.slice(lastIndex)}
        </span>
      )
    }

    return parts
  }

  return (
    <div className="relative flex-1">
      {/* Highlight overlay — styled mentions rendered here */}
      <div
        ref={highlightRef}
        className={`absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap break-words text-sm p-2 leading-[1.5] ${className || ''}`}
        aria-hidden="true"
        style={{
          // Match textarea styling exactly
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
          letterSpacing: 'inherit',
          wordSpacing: 'inherit',
        }}
      >
        {buildHighlightedContent()}
      </div>

      {/* Actual textarea — transparent text, handles all user interaction */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        className={`
          w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900
          px-2 py-2 text-sm leading-[1.5]
          focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400
          dark:focus:ring-violet-500/20 dark:focus:border-violet-500
          transition-colors duration-200
          ${value && extractMentionIds(value).length > 0 ? 'text-transparent caret-zinc-900 dark:caret-zinc-100 selection:bg-violet-200/50 dark:selection:bg-violet-800/50' : 'text-zinc-900 dark:text-zinc-100'}
          ${className || ''}
        `}
        style={{ WebkitTextFillColor: value && extractMentionIds(value).length > 0 ? 'transparent' : undefined }}
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
