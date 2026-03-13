'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import {
    useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useMemo,
} from 'react'
import {
    Bold, Italic, Highlighter, Palette, Type, SmilePlus,
} from 'lucide-react'
import { EmojiPicker } from '@/app/(authenticated)/jobs/components/emoji-picker'
import type { CustomEmoji } from '@/app/(authenticated)/jobs/actions'
import { isCustomShortcode } from '@/components/twemoji'

// ============================================================================
// Types
// ============================================================================

interface MentionUser {
    id: string
    full_name: string | null
    department?: string | null
    nickname?: string | null
}

export interface RichTextEditorProps {
    value: string
    onChange: (html: string) => void
    users?: MentionUser[]
    placeholder?: string
    className?: string
    minHeight?: string
    onMentionedUsersChange?: (userIds: string[]) => void
    onKeyDown?: (e: KeyboardEvent) => void
    /** Compact mode hides the toolbar by default, shown on focus */
    compact?: boolean
    /** Custom emojis for the emoji picker */
    customEmojis?: CustomEmoji[]
}

export interface RichTextEditorRef {
    clearContent: () => void
    focus: () => void
    setContent: (html: string) => void
}

// ============================================================================
// Color Palette
// ============================================================================

const TEXT_COLORS = [
    { name: 'Default', value: '' },
    { name: 'Red', value: '#ef4444' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Violet', value: '#8b5cf6' },
    { name: 'Pink', value: '#ec4899' },
]

const HIGHLIGHT_COLORS = [
    { name: 'Yellow', value: '#fef08a' },
    { name: 'Green', value: '#bbf7d0' },
    { name: 'Blue', value: '#bfdbfe' },
    { name: 'Pink', value: '#fbcfe8' },
    { name: 'Orange', value: '#fed7aa' },
]

// ============================================================================
// Mention suggestion renderer
// ============================================================================

function createMentionSuggestion(users: MentionUser[]) {
    return {
        items: ({ query }: { query: string }) => {
            const q = query.toLowerCase()
            return users
                .filter(u => {
                    const name = (u.full_name || '').toLowerCase()
                    const nick = (u.nickname || '').toLowerCase()
                    return name.includes(q) || nick.includes(q)
                })
                .slice(0, 8)
        },
        render: () => {
            let component: MentionListController | null = null
            let popup: HTMLDivElement | null = null

            return {
                onStart: (props: MentionCallbackProps) => {
                    popup = document.createElement('div')
                    popup.className = 'mention-suggestion-popup'
                    popup.setAttribute('data-mention-popup', 'true')
                    document.body.appendChild(popup)

                    component = new MentionListController(popup, props)
                    component.render()
                    updatePopupPosition(popup, props)
                },
                onUpdate: (props: MentionCallbackProps) => {
                    if (component) {
                        component.updateProps(props)
                        component.render()
                    }
                    if (popup) updatePopupPosition(popup, props)
                },
                onKeyDown: (props: { event: KeyboardEvent }) => {
                    if (!component) return false
                    return component.onKeyDown(props.event)
                },
                onExit: () => {
                    if (popup) {
                        popup.remove()
                        popup = null
                    }
                    component = null
                },
            }
        },
    }
}

// ============================================================================
// Mention callback types
// ============================================================================

interface MentionCallbackProps {
    query: string
    items: MentionUser[]
    command: (item: { id: string; label: string }) => void
    clientRect?: (() => DOMRect | null) | null
}

function updatePopupPosition(popup: HTMLDivElement, props: MentionCallbackProps) {
    if (!props.clientRect) return
    const rect = props.clientRect()
    if (!rect) return

    popup.style.position = 'absolute'
    popup.style.zIndex = '99999'
    popup.style.left = `${rect.left + window.scrollX}px`
    popup.style.top = `${rect.top + window.scrollY - 4}px`
    popup.style.transform = 'translateY(-100%)'
}

// ============================================================================
// Vanilla JS mention list controller (no React portal needed)
// ============================================================================

class MentionListController {
    container: HTMLDivElement
    props: MentionCallbackProps
    selectedIndex = 0

    constructor(container: HTMLDivElement, props: MentionCallbackProps) {
        this.container = container
        this.props = props
    }

    updateProps(props: MentionCallbackProps) {
        this.props = props
        this.selectedIndex = 0
    }

    onKeyDown(event: KeyboardEvent): boolean {
        const { items } = this.props
        if (!items.length) return false

        if (event.key === 'ArrowDown') {
            this.selectedIndex = (this.selectedIndex + 1) % items.length
            this.updateSelection()
            return true
        }
        if (event.key === 'ArrowUp') {
            this.selectedIndex = (this.selectedIndex - 1 + items.length) % items.length
            this.updateSelection()
            return true
        }
        if (event.key === 'Enter') {
            this.selectItem(this.selectedIndex)
            return true
        }
        if (event.key === 'Escape') {
            return true
        }
        return false
    }

    selectItem(index: number) {
        const item = this.props.items[index]
        if (item) {
            this.props.command({
                id: item.id,
                label: item.nickname || item.full_name || item.id.slice(0, 8),
            })
        }
    }

    /** Lightweight update — only toggle selected class, no DOM rebuild */
    updateSelection() {
        const items = this.container.querySelectorAll('.rte-mention-item')
        const avatars = this.container.querySelectorAll('.rte-mention-avatar')
        items.forEach((el, i) => {
            if (i === this.selectedIndex) {
                el.classList.add('selected')
                avatars[i]?.classList.add('selected')
                // Scroll into view if needed
                el.scrollIntoView?.({ block: 'nearest' })
            } else {
                el.classList.remove('selected')
                avatars[i]?.classList.remove('selected')
            }
        })
    }

    /** Full render — rebuilds entire DOM (only on item list change) */
    render() {
        const { items } = this.props

        if (items.length === 0) {
            this.container.innerHTML = ''
            return
        }

        this.container.innerHTML = `
            <div class="rte-mention-dropdown">
                <div class="rte-mention-header">แท็กเพื่อแจ้งเตือน</div>
                <div class="rte-mention-list">
                    ${items.map((user, i) => `
                        <button
                            class="rte-mention-item ${i === this.selectedIndex ? 'selected' : ''}"
                            data-index="${i}"
                        >
                            <span class="rte-mention-avatar ${i === this.selectedIndex ? 'selected' : ''}">
                                ${(user.nickname || user.full_name || '?')[0]?.toUpperCase() || '?'}
                            </span>
                            <span class="rte-mention-info">
                                <span class="rte-mention-name">${user.full_name || 'ไม่ระบุชื่อ'}</span>
                                ${user.department ? `<span class="rte-mention-dept">${user.department}</span>` : ''}
                            </span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `

        // Bind click handlers — use both mousedown and pointerdown
        // to prevent Radix Dialog's focus trap from intercepting the event
        this.container.querySelectorAll('.rte-mention-item').forEach(btn => {
            const handler = (e: Event) => {
                e.preventDefault()
                e.stopPropagation()
                const idx = parseInt((btn as HTMLElement).dataset.index || '0')
                this.selectItem(idx)
            }
            btn.addEventListener('mousedown', handler)
            btn.addEventListener('pointerdown', handler)
        })
    }
}


// ============================================================================
// Toolbar Component
// ============================================================================

function Toolbar({ editor, compact, onToggleEmojiPicker, showEmojiPicker }: { editor: Editor | null; compact?: boolean; onToggleEmojiPicker?: () => void; showEmojiPicker?: boolean }) {
    const [showColorPicker, setShowColorPicker] = useState(false)
    const [showHighlightPicker, setShowHighlightPicker] = useState(false)
    const colorRef = useRef<HTMLDivElement>(null)
    const highlightRef = useRef<HTMLDivElement>(null)

    // Close pickers on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
                setShowColorPicker(false)
            }
            if (highlightRef.current && !highlightRef.current.contains(e.target as Node)) {
                setShowHighlightPicker(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    if (!editor) return null

    return (
        <div className={`flex items-center gap-0.5 px-1 py-0.5 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50 rounded-t-lg ${compact ? 'text-xs' : ''}`}>
            {/* Bold */}
            <button
                onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
                className={`p-1.5 rounded-md transition-colors ${editor.isActive('bold')
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                title="Bold (Ctrl+B)"
            >
                <Bold className="h-3.5 w-3.5" />
            </button>

            {/* Italic */}
            <button
                onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
                className={`p-1.5 rounded-md transition-colors ${editor.isActive('italic')
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                title="Italic (Ctrl+I)"
            >
                <Italic className="h-3.5 w-3.5" />
            </button>

            {/* Divider */}
            <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600 mx-0.5" />

            {/* Text Color */}
            <div className="relative" ref={colorRef}>
                <button
                    onMouseDown={e => { e.preventDefault(); setShowColorPicker(!showColorPicker); setShowHighlightPicker(false) }}
                    className={`p-1.5 rounded-md transition-colors ${showColorPicker
                        ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600'
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                    title="Text Color"
                >
                    <Palette className="h-3.5 w-3.5" />
                </button>
                {showColorPicker && (
                    <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 flex gap-1">
                        {TEXT_COLORS.map(c => (
                            <button
                                key={c.name}
                                onMouseDown={e => {
                                    e.preventDefault()
                                    if (c.value) editor.chain().focus().setColor(c.value).run()
                                    else editor.chain().focus().unsetColor().run()
                                    setShowColorPicker(false)
                                }}
                                className="h-6 w-6 rounded-full border-2 border-transparent hover:border-zinc-400 transition-colors flex items-center justify-center"
                                style={{ backgroundColor: c.value || undefined }}
                                title={c.name}
                            >
                                {!c.value && <Type className="h-3.5 w-3.5 text-zinc-500" />}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Highlight */}
            <div className="relative" ref={highlightRef}>
                <button
                    onMouseDown={e => { e.preventDefault(); setShowHighlightPicker(!showHighlightPicker); setShowColorPicker(false) }}
                    className={`p-1.5 rounded-md transition-colors ${showHighlightPicker
                        ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600'
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                        }`}
                    title="Highlight"
                >
                    <Highlighter className="h-3.5 w-3.5" />
                </button>
                {showHighlightPicker && (
                    <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl z-50 flex gap-1">
                        {HIGHLIGHT_COLORS.map(c => (
                            <button
                                key={c.name}
                                onMouseDown={e => {
                                    e.preventDefault()
                                    editor.chain().focus().toggleHighlight({ color: c.value }).run()
                                    setShowHighlightPicker(false)
                                }}
                                className="h-6 w-6 rounded-full border-2 border-transparent hover:border-zinc-400 transition-colors"
                                style={{ backgroundColor: c.value }}
                                title={c.name}
                            />
                        ))}
                        {/* Remove highlight */}
                        <button
                            onMouseDown={e => {
                                e.preventDefault()
                                editor.chain().focus().unsetHighlight().run()
                                setShowHighlightPicker(false)
                            }}
                            className="h-6 w-6 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 hover:border-red-400 transition-colors flex items-center justify-center text-zinc-400 text-xs"
                            title="Remove Highlight"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>

            {/* Divider */}
            <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600 mx-0.5" />

            {/* Emoji */}
            <button
                onMouseDown={e => {
                    e.preventDefault()
                    onToggleEmojiPicker?.()
                }}
                className={`p-1.5 rounded-md transition-colors ${showEmojiPicker
                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                title="Emoji"
            >
                <SmilePlus className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}

// ============================================================================
// Extract mention IDs from HTML
// ============================================================================

function extractMentionIdsFromHtml(html: string): string[] {
    const ids: string[] = []
    const regex = /data-id="([^"]+)"/g
    let match
    while ((match = regex.exec(html)) !== null) {
        ids.push(match[1])
    }
    return [...new Set(ids)]
}

// ============================================================================
// RichTextEditor Component
// ============================================================================

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(({
    value,
    onChange,
    users = [],
    placeholder,
    className,
    minHeight = '100px',
    onMentionedUsersChange,
    onKeyDown,
    compact,
    customEmojis = [],
}, ref) => {
    const [isFocused, setIsFocused] = useState(false)
    const isInternalUpdate = useRef(false)

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
                horizontalRule: false,
                bulletList: false,
                orderedList: false,
                listItem: false,
            }),
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            Placeholder.configure({ placeholder: placeholder || '' }),
            ...(users.length > 0
                ? [
                    Mention.configure({
                        HTMLAttributes: {
                            class: 'mention',
                        },
                        suggestion: createMentionSuggestion(users),
                    }),
                ]
                : []),
        ],
        content: value || '',
        editorProps: {
            attributes: {
                class: 'rte-content',
                style: `min-height: ${minHeight}`,
            },
            handleKeyDown: (_view, event) => {
                if (onKeyDown) onKeyDown(event)
                return false
            },
        },
        onUpdate: ({ editor: ed }) => {
            isInternalUpdate.current = true
            const html = ed.getHTML()
            onChange(html)

            if (onMentionedUsersChange) {
                onMentionedUsersChange(extractMentionIdsFromHtml(html))
            }
        },
        onFocus: () => setIsFocused(true),
        onBlur: () => setIsFocused(false),
    })

    // Sync external value changes (e.g. reset after send)
    useEffect(() => {
        if (!editor) return
        if (isInternalUpdate.current) {
            isInternalUpdate.current = false
            return
        }
        // Only sync if value actually changed from outside
        const currentHtml = editor.getHTML()
        if (value !== currentHtml) {
            editor.commands.setContent(value || '')
        }
    }, [value, editor])

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
        clearContent: () => {
            editor?.commands.clearContent()
        },
        focus: () => {
            editor?.commands.focus()
        },
        setContent: (html: string) => {
            if (editor) {
                editor.commands.setContent(html)
                onChange(html)
            }
        },
    }), [editor, onChange])

    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const emojiBtnRef = useRef<HTMLDivElement>(null)
    const emojiPickerRef = useRef<HTMLDivElement>(null)

    // Build custom emoji map for picker
    const customEmojiMap = useMemo(() => {
        const map = new Map<string, string>()
        customEmojis.forEach(e => map.set(e.shortcode, e.image_url))
        return map
    }, [customEmojis])

    // Insert emoji into editor
    const handleEmojiSelect = useCallback((emoji: string) => {
        if (!editor) return
        editor.chain().focus().insertContent(emoji + ' ').run()
        setShowEmojiPicker(false)
    }, [editor])

    // Close emoji picker on outside click
    useEffect(() => {
        if (!showEmojiPicker) return
        const handler = (e: MouseEvent) => {
            const target = e.target as Node
            if (
                emojiPickerRef.current && !emojiPickerRef.current.contains(target) &&
                emojiBtnRef.current && !emojiBtnRef.current.contains(target)
            ) {
                setShowEmojiPicker(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [showEmojiPicker])

    const showToolbar = compact ? (isFocused || showEmojiPicker) : true

    // Calculate emoji picker position
    const getPickerPos = () => {
        if (!emojiBtnRef.current) return { top: 0, left: 0 }
        const rect = emojiBtnRef.current.getBoundingClientRect()
        const pickerWidth = 340
        let left = rect.left
        if (left + pickerWidth > window.innerWidth - 16) {
            left = window.innerWidth - pickerWidth - 16
        }
        if (left < 8) left = 8
        return { top: rect.top - 8, left }
    }

    return (
        <>
            <div
                ref={emojiBtnRef}
                className={`
                    rounded-lg border transition-colors duration-200 overflow-hidden
                    ${isFocused || showEmojiPicker
                        ? 'border-violet-400 dark:border-violet-500 ring-2 ring-violet-500/20 dark:ring-violet-500/10'
                        : 'border-zinc-200 dark:border-zinc-700'
                    }
                    bg-white dark:bg-zinc-900
                    ${className || ''}
                `}
            >
                {/* Toolbar */}
                <div className={`transition-all duration-200 ${showToolbar ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0 overflow-hidden'}`}>
                    <Toolbar
                        editor={editor}
                        compact={compact}
                        onToggleEmojiPicker={() => setShowEmojiPicker(v => !v)}
                        showEmojiPicker={showEmojiPicker}
                    />
                </div>

                {/* Editor Content */}
                <EditorContent editor={editor} />
            </div>

            {/* Emoji Picker — rendered OUTSIDE overflow-hidden */}
            {showEmojiPicker && (() => {
                const pos = getPickerPos()
                return (
                    <div
                        ref={emojiPickerRef}
                        className="fixed animate-in fade-in slide-in-from-bottom-2 duration-200"
                        style={{
                            top: pos.top,
                            left: pos.left,
                            transform: 'translateY(-100%)',
                            zIndex: 9999,
                        }}
                    >
                        <EmojiPicker
                            onSelect={handleEmojiSelect}
                            onClose={() => setShowEmojiPicker(false)}
                            customEmojis={customEmojis}
                            customEmojiMap={customEmojiMap}
                        />
                    </div>
                )
            })()}
        </>
    )
})

RichTextEditor.displayName = 'RichTextEditor'
export default RichTextEditor
