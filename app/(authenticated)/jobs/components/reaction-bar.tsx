'use client'

import { useState, useTransition, useRef, useCallback, useOptimistic, useMemo } from 'react'
import { SmilePlus } from 'lucide-react'
import { toggleTicketReaction } from '../actions'
import type { TicketReaction, JobSetting, CustomEmoji } from '../actions'
import { useLocale } from '@/lib/i18n/context'
import { EmojiPicker } from './emoji-picker'
import { TwemojiImg, isCustomShortcode } from '@/components/twemoji'

// ============================================================================
// Reaction Bar — Discord-style emoji reactions with full emoji picker
// Now supports custom emojis
// ============================================================================

interface ReactionBarProps {
    ticketId: string
    replyId?: string | null
    reactions: TicketReaction[]
    availableEmojis: JobSetting[]
    currentUserId: string
    customEmojis?: CustomEmoji[]
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

export function ReactionBar({ ticketId, replyId, reactions, availableEmojis, currentUserId, customEmojis = [] }: ReactionBarProps) {
    const { locale } = useLocale()
    const [isPending, startTransition] = useTransition()
    const [showPicker, setShowPicker] = useState(false)
    const pickerContainerRef = useRef<HTMLDivElement>(null)
    const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null)

    // Build custom emoji map: shortcode → image_url
    const customEmojiMap = useMemo(() => {
        const map = new Map<string, string>()
        customEmojis.forEach(e => map.set(e.shortcode, e.image_url))
        return map
    }, [customEmojis])

    // Compute server-side groups
    const serverGroups = groupReactions(reactions, replyId)

    // Optimistic state
    const [optimisticGroups, setOptimisticGroups] = useOptimistic(
        serverGroups,
        (currentGroups: ReactionGroup[], emoji: string) =>
            applyOptimisticToggle(currentGroups, emoji, currentUserId)
    )

    const handleToggle = useCallback((emoji: string) => {
        setShowPicker(false)
        startTransition(async () => {
            setOptimisticGroups(emoji)
            await toggleTicketReaction(ticketId, emoji, replyId || null)
        })
    }, [ticketId, replyId, startTransition, setOptimisticGroups])

    const handleOpenPicker = useCallback(() => {
        if (!showPicker && pickerContainerRef.current) {
            const rect = pickerContainerRef.current.getBoundingClientRect()
            const pickerWidth = 340
            // Position above the button — and ensure it doesn't overflow viewport edges
            let left = rect.left
            if (left + pickerWidth > window.innerWidth - 16) {
                left = window.innerWidth - pickerWidth - 16
            }
            if (left < 8) left = 8
            setPickerPos({
                top: rect.top - 8, // 8px gap above the button
                left,
            })
        }
        setShowPicker(!showPicker)
    }, [showPicker])

    // Total reaction count
    const totalCount = optimisticGroups.reduce((sum, g) => sum + g.count, 0)

    return (
        <div className="flex items-center flex-wrap gap-1.5 mt-2">
            {/* Existing Reaction Badges */}
            {optimisticGroups.map(g => {
                const userReacted = g.users.some(u => u.id === currentUserId)
                const tooltipNames = g.users.map(u => u.name).join(', ')
                const isCustom = isCustomShortcode(g.emoji)
                return (
                    <button
                        key={g.emoji}
                        onClick={() => handleToggle(g.emoji)}
                        disabled={isPending}
                        title={tooltipNames}
                        className={`
                            inline-flex items-center gap-1.5 rounded-full text-sm
                            transition-all duration-200 select-none border
                            ${isCustom ? 'px-2 py-1 rounded-lg' : 'px-2.5 py-1'}
                            ${userReacted
                                ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 shadow-sm shadow-violet-100 dark:shadow-violet-900/20'
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:border-zinc-300'
                            }
                            ${isPending ? 'opacity-70 pointer-events-none' : 'cursor-pointer hover:scale-105 active:scale-95'}
                        `}
                    >
                        {isCustom ? (
                            <img
                                src={customEmojiMap.get(g.emoji) || ''}
                                alt={g.emoji}
                                width={64}
                                height={64}
                                className="object-contain rounded"
                                draggable={false}
                            />
                        ) : (
                            <TwemojiImg emoji={g.emoji} size={18} />
                        )}
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
            <div className="relative" ref={pickerContainerRef}>
                <button
                    onClick={handleOpenPicker}
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

                {/* Full Emoji Picker — fixed position to avoid container overflow */}
                {showPicker && pickerPos && (
                    <div
                        className="fixed animate-in fade-in slide-in-from-bottom-2 duration-200"
                        style={{
                            top: pickerPos.top,
                            left: pickerPos.left,
                            transform: 'translateY(-100%)',
                            zIndex: 9999,
                        }}
                    >
                        <EmojiPicker
                            onSelect={handleToggle}
                            onClose={() => setShowPicker(false)}
                            customEmojis={customEmojis}
                            customEmojiMap={customEmojiMap}
                        />
                    </div>
                )}
            </div>

            {/* Total Reaction Count */}
            {totalCount > 0 && (
                <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 ml-1 tabular-nums">
                    {totalCount} {locale === 'th' ? 'reaction' : totalCount === 1 ? 'reaction' : 'reactions'}
                </span>
            )}
        </div>
    )
}
