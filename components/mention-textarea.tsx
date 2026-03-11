'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

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
// Mention regex & conversion helpers
// ============================================================================

const MENTION_RAW_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g

/**
 * Convert raw format → display format
 * @[Name](uuid) → @Name
 * Also builds a name→id map for reverse conversion
 */
function rawToDisplay(raw: string, map: Map<string, string>): string {
  return raw.replace(new RegExp(MENTION_RAW_REGEX.source, 'g'), (_match, name, id) => {
    map.set(name, id)
    return `@${name}`
  })
}

/**
 * Convert display format → raw format using the name→id map
 * @Name → @[Name](uuid)
 * Uses simple string replacement (no regex) for reliable Unicode support
 */
function displayToRaw(display: string, map: Map<string, string>): string {
  if (map.size === 0) return display

  // Sort by name length descending to prevent partial matches
  const entries = [...map.entries()].sort((a, b) => b[0].length - a[0].length)

  let result = display
  for (const [name, id] of entries) {
    const displayMention = `@${name}`
    const rawMention = `@[${name}](${id})`

    // Only replace if not already in raw format
    // Use replaceAll for Unicode safety (no regex escaping needed)
    while (result.includes(displayMention)) {
      const idx = result.indexOf(displayMention)
      // Check that the character before @ isn't '[' (would mean it's already raw)
      const charAfterMention = result[idx + displayMention.length] || ''
      if (charAfterMention === ']' || charAfterMention === '(') break // already raw

      result = result.slice(0, idx) + rawMention + result.slice(idx + displayMention.length)
    }
  }
  return result
}

function extractMentionIds(text: string): string[] {
  const ids: string[] = []
  let match
  const regex = new RegExp(MENTION_RAW_REGEX.source, 'g')
  while ((match = regex.exec(text)) !== null) {
    ids.push(match[2])
  }
  return ids
}

// ============================================================================
// Caret position helper — measures cursor Y offset inside a textarea
// using a mirror div that replicates the textarea's text layout.
// ============================================================================

function getCaretOffset(textarea: HTMLTextAreaElement, position: number): number {
  const cs = getComputedStyle(textarea)
  const mirror = document.createElement('div')
  mirror.style.cssText = `
    position:absolute;visibility:hidden;overflow:hidden;
    white-space:pre-wrap;word-wrap:break-word;
    width:${cs.width};font:${cs.font};
    letter-spacing:${cs.letterSpacing};line-height:${cs.lineHeight};
    padding:${cs.padding};border:${cs.border};box-sizing:${cs.boxSizing};
  `
  mirror.textContent = textarea.value.substring(0, position)

  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const top = marker.offsetTop - textarea.scrollTop
  document.body.removeChild(mirror)
  return top
}

// ============================================================================
// MentionTextarea Component
//
// Shows @Name in the textarea (clean display), but stores @[Name](uuid) in
// the parent value for backend processing. No overlay needed.
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
  const [caretTop, setCaretTop] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Persistent map of displayName → userId for converting display↔raw
  const mentionsMapRef = useRef<Map<string, string>>(new Map())

  // Convert raw parent value to display value
  const displayValue = useMemo(() => {
    return rawToDisplay(value, mentionsMapRef.current)
  }, [value])

  // Filter users based on search
  const filteredUsers = users.filter(u => {
    if (!search) return true
    const name = (u.full_name || '').toLowerCase()
    const nick = (u.nickname || '').toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || nick.includes(q)
  }).slice(0, 8)

  // Extract mentioned user IDs from raw value
  useEffect(() => {
    if (!onMentionedUsersChange) return
    onMentionedUsersChange(extractMentionIds(value))
  }, [value, onMentionedUsersChange])

  // Handle textarea input
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDisplayValue = e.target.value
    const cursorPos = e.target.selectionStart || 0

    // Convert display text back to raw format for parent
    const rawValue = displayToRaw(newDisplayValue, mentionsMapRef.current)
    onChange(rawValue)

    // Detect @ trigger for mention dropdown
    const textBeforeCursor = newDisplayValue.slice(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' '
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1)
        // Allow query with spaces (Thai names like กฤษณะ สิงห์ทอง)
        // Only close if newline or bracket detected
        if (!query.includes('\n') && !query.includes('[')) {
          // Don't trigger for already-completed mentions
          const isExistingMention = mentionsMapRef.current.has(query.trim())
          if (!isExistingMention) {
            // Calculate caret Y position for dropdown placement
            const textarea = textareaRef.current
            if (textarea) {
              setCaretTop(getCaretOffset(textarea, cursorPos))
            }
            setSearch(query)
            setMentionStart(atIndex)
            setShowDropdown(true)
            setSelectedIndex(0)
            return
          }
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
    const displayName = user.nickname || user.full_name || user.id.slice(0, 8)

    // Store the mapping for raw conversion
    mentionsMapRef.current.set(displayName, user.id)

    // Insert clean display text: @Name (no UUID visible)
    const before = displayValue.slice(0, mentionStart)
    const after = displayValue.slice(cursorPos)
    const mentionDisplay = `@${displayName} `
    const newDisplayValue = before + mentionDisplay + after

    // Convert to raw for parent
    const rawValue = displayToRaw(newDisplayValue, mentionsMapRef.current)
    onChange(rawValue)
    setShowDropdown(false)
    setMentionStart(null)

    // Refocus after state update
    setTimeout(() => {
      textarea.focus()
      const newPos = before.length + mentionDisplay.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }, [mentionStart, displayValue, onChange])

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
      {/* Clean textarea — shows @Name directly, no overlay needed */}
      <textarea
        ref={textareaRef}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`
          w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900
          px-2 py-2 text-sm leading-normal text-zinc-900 dark:text-zinc-100
          focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400
          dark:focus:ring-violet-500/20 dark:focus:border-violet-500
          transition-colors duration-200
          ${className || ''}
        `}
      />

      {/* Mention Dropdown */}
      {showDropdown && filteredUsers.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 w-full max-w-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 -translate-y-full"
          style={{ top: `${caretTop - 4}px` }}
        >
          <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
            แท็กเพื่อแจ้งเตือน
          </div>
          <div className="max-h-[200px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {filteredUsers.map((user, i) => (
              <button
                key={user.id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectUser(user)
                }}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors
                  ${i === selectedIndex ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}
                `}
              >
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
