'use client'

import { useState, useEffect, useTransition, useRef, useCallback } from 'react'
import { Smile, ImagePlus, Send, Trash2, Loader2, X, MessageSquare } from 'lucide-react'
import {
    getMyJobComments, getMyTicketComments,
    addMyJobComment, addMyTicketComment,
    deleteMyJobComment, deleteMyTicketComment,
    uploadMyCommentAttachments,
} from '../actions'
import type { MyJobComment, MyTicketComment } from '../actions'
import { getCustomEmojis } from '../../actions'
import type { CustomEmoji } from '../../actions'
import { EmojiPicker } from '../../components/emoji-picker'
import { isCustomShortcode } from '@/components/twemoji'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Types
// ============================================================================

type AnyComment = MyJobComment | MyTicketComment

interface MyCommentThreadProps {
    itemId: string
    itemType: 'job' | 'ticket'
    currentUserId: string
    isAdmin: boolean
    onCommentCountChange?: (count: number) => void
}

// ============================================================================
// Helpers
// ============================================================================

/** Renders plain text that may contain custom emoji shortcodes as inline stickers */
function CommentContent({
    text,
    customEmojiMap,
}: {
    text: string
    customEmojiMap: Map<string, string>
}) {
    const parts = text.split(/(:[a-z0-9_]+:)/g)
    return (
        <>
            {parts.map((part, i) => {
                if (isCustomShortcode(part)) {
                    const url = customEmojiMap.get(part)
                    if (url) {
                        return (
                            <img
                                key={i}
                                src={url}
                                alt={part}
                                title={part}
                                className="inline-block h-8 w-8 object-contain align-middle mx-0.5"
                            />
                        )
                    }
                }
                return <span key={i}>{part}</span>
            })}
        </>
    )
}

/** Generate consistent avatar colour from a name string */
function avatarColor(name: string): string {
    const colors = [
        '#7c3aed', '#2563eb', '#059669', '#d97706',
        '#dc2626', '#db2777', '#0891b2', '#65a30d',
    ]
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return colors[h % colors.length]
}

function formatTime(ts: string, locale: string): string {
    return new Date(ts).toLocaleString(locale === 'th' ? 'th-TH' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

// ============================================================================
// Component
// ============================================================================

export function MyCommentThread({
    itemId,
    itemType,
    currentUserId,
    isAdmin,
    onCommentCountChange,
}: MyCommentThreadProps) {
    const { locale } = useLocale()
    const [isPending, startTransition] = useTransition()
    const [comments, setComments]             = useState<AnyComment[]>([])
    const [loading, setLoading]               = useState(true)
    const [inputText, setInputText]           = useState('')
    const [pendingUrls, setPendingUrls]       = useState<string[]>([])
    const [uploadingImg, setUploadingImg]     = useState(false)
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [customEmojis, setCustomEmojis]     = useState<CustomEmoji[]>([])
    const [customEmojiMap, setCustomEmojiMap] = useState<Map<string, string>>(new Map())

    const scrollRef   = useRef<HTMLDivElement>(null)
    const fileRef     = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // ── Load comments + custom emojis ──────────────────────────────────────
    const loadComments = useCallback(async () => {
        const result = itemType === 'job'
            ? await getMyJobComments(itemId)
            : await getMyTicketComments(itemId)
        const items = result.data || []
        setComments(items)
        onCommentCountChange?.(items.length)
    }, [itemId, itemType, onCommentCountChange])

    useEffect(() => {
        let cancelled = false
        Promise.all([
            getCustomEmojis(),
            itemType === 'job'
                ? getMyJobComments(itemId)
                : getMyTicketComments(itemId),
        ]).then(([emojisResult, commentsResult]) => {
            if (cancelled) return
            if (emojisResult) {
                setCustomEmojis(emojisResult)
                const map = new Map<string, string>()
                emojisResult.forEach(ce => map.set(`:${ce.shortcode}:`, ce.image_url))
                setCustomEmojiMap(map)
            }
            const items = commentsResult.data || []
            setComments(items)
            onCommentCountChange?.(items.length)
            setLoading(false)
        })
        return () => { cancelled = true }
    }, [itemId, itemType]) // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll to bottom whenever comments update
    useEffect(() => {
        if (!loading && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [comments, loading])

    // ── Emoji select ────────────────────────────────────────────────────────
    const handleEmojiSelect = useCallback((emoji: string) => {
        setInputText(prev => prev + emoji)
        setShowEmojiPicker(false)
        textareaRef.current?.focus()
    }, [])

    // ── Image upload ─────────────────────────────────────────────────────────
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        setUploadingImg(true)
        try {
            const fd = new FormData()
            files.forEach(f => fd.append('files', f))
            const result = await uploadMyCommentAttachments(fd)
            if (result.urls.length) setPendingUrls(prev => [...prev, ...result.urls])
        } finally {
            setUploadingImg(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    // ── Send ─────────────────────────────────────────────────────────────────
    const handleSend = () => {
        const text = inputText.trim()
        if (!text && pendingUrls.length === 0) return

        const fd = new FormData()
        fd.set('content', text)
        fd.set('attachments', JSON.stringify(pendingUrls))

        startTransition(async () => {
            const result = itemType === 'job'
                ? await addMyJobComment(itemId, fd)
                : await addMyTicketComment(itemId, fd)

            if (!result.error) {
                setInputText('')
                setPendingUrls([])
                await loadComments()
            }
        })
    }

    // ── Delete ───────────────────────────────────────────────────────────────
    const handleDelete = (commentId: string) => {
        startTransition(async () => {
            const result = itemType === 'job'
                ? await deleteMyJobComment(commentId)
                : await deleteMyTicketComment(commentId)
            if (!result.error) await loadComments()
        })
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col" style={{ minHeight: 380 }}>

            {/* ── Comment list ─────────────────────────────────────────── */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
                style={{ maxHeight: 360, scrollbarWidth: 'thin' }}
            >
                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                    </div>
                ) : comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600">
                            <MessageSquare className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
                            {locale === 'th' ? 'ยังไม่มีความคิดเห็น' : 'No comments yet'}
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {locale === 'th' ? 'เริ่มสนทนาด้านล่าง' : 'Start the conversation below'}
                        </p>
                    </div>
                ) : (
                    comments.map(comment => {
                        const name    = comment.profiles?.full_name || 'User'
                        const initial = name.charAt(0).toUpperCase()
                        const color   = avatarColor(name)
                        const isOwn   = comment.user_id === currentUserId
                        const isCommentByAdmin = comment.profiles?.role === 'admin'

                        return (
                            <div key={comment.id} className="flex items-start gap-2.5 group">
                                {/* Avatar */}
                                <div
                                    className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                                    style={{ backgroundColor: color }}
                                >
                                    {initial}
                                </div>

                                {/* Bubble area */}
                                <div className="flex-1 min-w-0">
                                    {/* Name + meta row */}
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 leading-none">
                                            {name}
                                        </span>
                                        {isCommentByAdmin && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400">
                                                Admin
                                            </span>
                                        )}
                                        <span className="text-[10px] text-zinc-400 leading-none">
                                            {formatTime(comment.created_at, locale)}
                                        </span>
                                        {(isOwn || isAdmin) && (
                                            <button
                                                onClick={() => handleDelete(comment.id)}
                                                disabled={isPending}
                                                className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-zinc-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                title={locale === 'th' ? 'ลบ' : 'Delete'}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Text bubble */}
                                    {comment.content && (
                                        <div className="inline-block bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-tl-md px-3.5 py-2 text-sm text-zinc-800 dark:text-zinc-200 max-w-xs sm:max-w-sm break-words leading-relaxed">
                                            <CommentContent text={comment.content} customEmojiMap={customEmojiMap} />
                                        </div>
                                    )}

                                    {/* Image attachments */}
                                    {comment.attachments?.length > 0 && (
                                        <div className={`mt-1.5 ${comment.attachments.length > 1 ? 'grid grid-cols-2 gap-1' : ''} max-w-[220px]`}>
                                            {comment.attachments.map((url, idx) => (
                                                <a
                                                    key={idx}
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="block rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:opacity-90 transition-opacity"
                                                >
                                                    <img
                                                        src={url}
                                                        alt=""
                                                        className="w-full max-h-44 object-cover"
                                                        loading="lazy"
                                                    />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* ── Pending image previews ───────────────────────────────── */}
            {pendingUrls.length > 0 && (
                <div className="px-4 pb-2 flex gap-2 flex-wrap">
                    {pendingUrls.map((url, i) => (
                        <div key={i} className="relative group/thumb">
                            <img
                                src={url}
                                alt=""
                                className="h-16 w-16 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700"
                            />
                            <button
                                type="button"
                                onClick={() => setPendingUrls(prev => prev.filter((_, j) => j !== i))}
                                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Emoji picker (floats above input) ────────────────────── */}
            {showEmojiPicker && (
                <div className="relative px-4 pb-2">
                    <div className="absolute bottom-full left-4 right-4 z-50 mb-1">
                        <EmojiPicker
                            onSelect={handleEmojiSelect}
                            onClose={() => setShowEmojiPicker(false)}
                            customEmojis={customEmojis}
                            customEmojiMap={customEmojiMap}
                        />
                    </div>
                </div>
            )}

            {/* ── Composer ─────────────────────────────────────────────── */}
            <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-2.5 bg-white dark:bg-zinc-950">
                <div className="flex items-end gap-1.5">
                    <textarea
                        ref={textareaRef}
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                handleSend()
                            }
                        }}
                        onInput={e => {
                            const t = e.target as HTMLTextAreaElement
                            t.style.height = 'auto'
                            t.style.height = `${Math.min(t.scrollHeight, 120)}px`
                        }}
                        placeholder={locale === 'th' ? 'เขียนความคิดเห็น… (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)' : 'Write a comment… (Enter to send, Shift+Enter for new line)'}
                        rows={1}
                        className="flex-1 resize-none rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40 min-h-[38px] max-h-[120px] leading-relaxed"
                        style={{ height: 38 }}
                    />

                    {/* Hidden file input */}
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        multiple
                        className="hidden"
                        onChange={handleImageChange}
                    />

                    {/* Emoji button */}
                    <button
                        type="button"
                        onClick={() => setShowEmojiPicker(prev => !prev)}
                        className={`flex-shrink-0 p-2 rounded-full transition-colors ${
                            showEmojiPicker
                                ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600'
                                : 'text-zinc-400 hover:text-violet-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                        title={locale === 'th' ? 'อีโมจิ / สติกเกอร์' : 'Emoji / Sticker'}
                    >
                        <Smile className="h-5 w-5" />
                    </button>

                    {/* Image button */}
                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploadingImg}
                        className="flex-shrink-0 p-2 rounded-full text-zinc-400 hover:text-violet-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                        title={locale === 'th' ? 'อัปโหลดรูปภาพ' : 'Upload image'}
                    >
                        {uploadingImg
                            ? <Loader2 className="h-5 w-5 animate-spin" />
                            : <ImagePlus className="h-5 w-5" />
                        }
                    </button>

                    {/* Send button */}
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={isPending || (!inputText.trim() && pendingUrls.length === 0)}
                        className="flex-shrink-0 p-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={locale === 'th' ? 'ส่ง' : 'Send'}
                    >
                        {isPending
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Send className="h-4 w-4" />
                        }
                    </button>
                </div>
            </div>
        </div>
    )
}
