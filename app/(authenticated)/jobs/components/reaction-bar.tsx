'use client'

import { useState, useTransition, useRef, useEffect, useCallback, useOptimistic } from 'react'
import { SmilePlus } from 'lucide-react'
import { toggleTicketReaction } from '../actions'
import type { TicketReaction, JobSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Reaction Bar — Discord-style emoji reactions with optimistic updates
// ============================================================================

interface ReactionBarProps {
    ticketId: string
    replyId?: string | null
    reactions: TicketReaction[]
    availableEmojis: JobSetting[]
    currentUserId: string
}

interface ReactionGroup {
    emoji: string
    users: { id: string; name: string }[]
    count: number
}

/** Group raw reactions by emoji for a specific target (ticket or reply) */
function groupReactions(
    reactions: TicketReaction[],
    replyId: string | null | undefined,
): ReactionGroup[] {
    const targetReactions = reactions.filter(r =>
        replyId ? r.reply_id === replyId : r.reply_id === null
    )

    const grouped = new Map<string, ReactionGroup>()

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

/** Apply optimistic toggle to reaction groups */
function applyOptimisticToggle(
    groups: ReactionGroup[],
    emoji: string,
    userId: string,
): ReactionGroup[] {
    const existingGroup = groups.find(g => g.emoji === emoji)
    const userReacted = existingGroup?.users.some(u => u.id === userId)

    if (userReacted && existingGroup) {
        // Remove user's reaction
        const newUsers = existingGroup.users.filter(u => u.id !== userId)
        if (newUsers.length === 0) {
            return groups.filter(g => g.emoji !== emoji)
        }
        return groups.map(g =>
            g.emoji === emoji
                ? { ...g, users: newUsers, count: newUsers.length }
                : g
        )
    } else {
        // Add user's reaction
        if (existingGroup) {
            return groups.map(g =>
                g.emoji === emoji
                    ? { ...g, users: [...g.users, { id: userId, name: 'คุณ' }], count: g.count + 1 }
                    : g
            )
        } else {
            return [...groups, { emoji, users: [{ id: userId, name: 'คุณ' }], count: 1 }]
        }
    }
}

export function ReactionBar({ ticketId, replyId, reactions, availableEmojis, currentUserId }: ReactionBarProps) {
    const { locale } = useLocale()
    const [isPending, startTransition] = useTransition()
    const [showPicker, setShowPicker] = useState(false)
    const pickerRef = useRef<HTMLDivElement>(null)

    // Compute server-side groups
    const serverGroups = groupReactions(reactions, replyId)

    // Optimistic state
    const [optimisticGroups, setOptimisticGroups] = useOptimistic(
        serverGroups,
        (currentGroups: ReactionGroup[], emoji: string) =>
            applyOptimisticToggle(currentGroups, emoji, currentUserId)
    )

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
        setShowPicker(false)
        startTransition(async () => {
            setOptimisticGroups(emoji)
            await toggleTicketReaction(ticketId, emoji, replyId || null)
        })
    }, [ticketId, replyId, startTransition, setOptimisticGroups])

    // Total reaction count
    const totalCount = optimisticGroups.reduce((sum, g) => sum + g.count, 0)

    return (
        <div className="flex items-center flex-wrap gap-1.5 mt-2">
            {/* Existing Reaction Badges */}
            {optimisticGroups.map(g => {
                const userReacted = g.users.some(u => u.id === currentUserId)
                const tooltipNames = g.users.map(u => u.name).join(', ')
                return (
                    <button
                        key={g.emoji}
                        onClick={() => handleToggle(g.emoji)}
                        disabled={isPending}
                        title={tooltipNames}
                        className={`
                            inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm
                            transition-all duration-200 select-none border
                            ${userReacted
                                ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 shadow-sm shadow-violet-100 dark:shadow-violet-900/20'
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300'
                            }
                            ${isPending ? 'opacity-70 pointer-events-none' : 'cursor-pointer hover:scale-105 active:scale-95'}
                        `}
                    >
                        <span className="text-base leading-none">{g.emoji}</span>
                        <span className={`text-xs font-extrabold tabular-nums min-w-[1ch] text-center ${
                            userReacted
                                ? 'text-violet-600 dark:text-violet-400'
                                : 'text-zinc-600 dark:text-zinc-300'
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
                            inline-flex items-center justify-center h-8 w-8 rounded-full border
                            transition-all duration-200
                            ${showPicker
                                ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 text-violet-500'
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 hover:border-zinc-300'
                            }
                            ${isPending ? 'opacity-60' : 'cursor-pointer hover:scale-105'}
                        `}
                        title={locale === 'th' ? 'เพิ่ม Reaction' : 'Add Reaction'}
                    >
                        <SmilePlus className="h-4 w-4" />
                    </button>

                    {/* Emoji Picker Popover */}
                    {showPicker && (
                        <div className="absolute bottom-full left-0 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex items-center gap-1 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl shadow-zinc-200/50 dark:shadow-black/30">
                                {availableEmojis.map(e => {
                                    const alreadyReacted = optimisticGroups.some(
                                        g => g.emoji === e.value && g.users.some(u => u.id === currentUserId)
                                    )
                                    return (
                                        <button
                                            key={e.id}
                                            onClick={() => handleToggle(e.value)}
                                            title={`${e.value} ${locale === 'th' ? e.label_th : e.label_en}`}
                                            className={`
                                                flex items-center justify-center h-9 w-9 rounded-xl text-xl
                                                transition-all duration-150
                                                hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:scale-125 active:scale-95
                                                ${alreadyReacted ? 'bg-violet-50 dark:bg-violet-900/20 ring-2 ring-violet-400 dark:ring-violet-500 scale-110' : ''}
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

            {/* Total Reaction Count */}
            {totalCount > 0 && (
                <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 ml-1 tabular-nums">
                    {totalCount} {locale === 'th' ? 'reaction' : totalCount === 1 ? 'reaction' : 'reactions'}
                </span>
            )}
        </div>
    )
}
