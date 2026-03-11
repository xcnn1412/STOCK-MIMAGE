'use client'

import { useState, useTransition, useRef, useEffect, useCallback } from 'react'
import { SmilePlus } from 'lucide-react'
import { toggleTicketReaction } from '../actions'
import type { TicketReaction, JobSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Reaction Bar — Discord-style emoji reactions
// ============================================================================

interface ReactionBarProps {
    ticketId: string
    replyId?: string | null
    reactions: TicketReaction[]
    availableEmojis: JobSetting[]
    currentUserId: string
}

/** Group raw reactions by emoji for a specific target (ticket or reply) */
function groupReactions(
    reactions: TicketReaction[],
    replyId: string | null | undefined,
) {
    const targetReactions = reactions.filter(r =>
        replyId ? r.reply_id === replyId : r.reply_id === null
    )

    const grouped = new Map<string, { emoji: string; users: { id: string; name: string }[]; count: number }>()

    targetReactions.forEach(r => {
        if (!grouped.has(r.emoji)) {
            grouped.set(r.emoji, { emoji: r.emoji, users: [], count: 0 })
        }
        const group = grouped.get(r.emoji)!
        group.users.push({ id: r.user_id, name: r.profiles?.full_name || 'Unknown' })
        group.count++
    })

    return Array.from(grouped.values())
}

export function ReactionBar({ ticketId, replyId, reactions, availableEmojis, currentUserId }: ReactionBarProps) {
    const { locale } = useLocale()
    const [isPending, startTransition] = useTransition()
    const [showPicker, setShowPicker] = useState(false)
    const pickerRef = useRef<HTMLDivElement>(null)

    const groups = groupReactions(reactions, replyId)

    // Close picker on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowPicker(false)
            }
        }
        if (showPicker) {
            document.addEventListener('mousedown', handler)
            return () => document.removeEventListener('mousedown', handler)
        }
    }, [showPicker])

    const handleToggle = useCallback((emoji: string) => {
        startTransition(async () => {
            await toggleTicketReaction(ticketId, emoji, replyId || null)
        })
        setShowPicker(false)
    }, [ticketId, replyId, startTransition])

    return (
        <div className="flex items-center flex-wrap gap-1.5">
            {/* Existing Reaction Badges */}
            {groups.map(g => {
                const userReacted = g.users.some(u => u.id === currentUserId)
                const tooltipNames = g.users.map(u => u.name).join(', ')
                return (
                    <button
                        key={g.emoji}
                        onClick={() => handleToggle(g.emoji)}
                        disabled={isPending}
                        title={tooltipNames}
                        className={`
                            inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm
                            transition-all duration-150 select-none
                            ${userReacted
                                ? 'bg-violet-100 dark:bg-violet-900/30 ring-1 ring-violet-400/40 dark:ring-violet-500/30'
                                : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }
                            ${isPending ? 'opacity-60 pointer-events-none' : 'cursor-pointer hover:scale-105 active:scale-95'}
                        `}
                    >
                        <span className="text-base leading-none">{g.emoji}</span>
                        <span className={`text-xs font-bold tabular-nums ${
                            userReacted
                                ? 'text-violet-600 dark:text-violet-400'
                                : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                            {g.count}
                        </span>
                    </button>
                )
            })}

            {/* Add Reaction Button */}
            {availableEmojis.length > 0 && (
                <div className="relative" ref={pickerRef}>
                    <button
                        onClick={() => setShowPicker(!showPicker)}
                        disabled={isPending}
                        className={`
                            inline-flex items-center justify-center h-7 w-7 rounded-full
                            transition-all duration-150
                            ${showPicker
                                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-500'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300'
                            }
                            ${isPending ? 'opacity-60' : 'cursor-pointer'}
                        `}
                        title={locale === 'th' ? 'เพิ่ม Reaction' : 'Add Reaction'}
                    >
                        <SmilePlus className="h-3.5 w-3.5" />
                    </button>

                    {/* Emoji Picker Popover */}
                    {showPicker && (
                        <div className="absolute bottom-full left-0 mb-1.5 z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
                            <div className="flex items-center gap-0.5 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl">
                                {availableEmojis.map(e => {
                                    const alreadyReacted = groups.some(
                                        g => g.emoji === e.value && g.users.some(u => u.id === currentUserId)
                                    )
                                    return (
                                        <button
                                            key={e.id}
                                            onClick={() => handleToggle(e.value)}
                                            title={`${e.value} ${locale === 'th' ? e.label_th : e.label_en}`}
                                            className={`
                                                flex items-center justify-center h-8 w-8 rounded-lg text-lg
                                                transition-all duration-100
                                                hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:scale-110 active:scale-95
                                                ${alreadyReacted ? 'bg-violet-50 dark:bg-violet-900/20 ring-1 ring-violet-300 dark:ring-violet-600' : ''}
                                            `}
                                        >
                                            {e.value}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
