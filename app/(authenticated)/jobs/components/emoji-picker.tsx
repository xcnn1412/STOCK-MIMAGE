'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { TwemojiImg } from '@/components/twemoji'

// ============================================================================
// Full Emoji Picker — Categorized like native emoji keyboards
// ============================================================================

interface EmojiPickerProps {
    onSelect: (emoji: string) => void
    onClose: () => void
}

// Category definitions
const CATEGORIES = [
    { key: 'frequent', icon: '🕐', label: 'ใช้บ่อย', labelEn: 'Frequently Used' },
    { key: 'smileys', icon: '😀', label: 'หน้ายิ้ม', labelEn: 'Smileys & People' },
    { key: 'gestures', icon: '👋', label: 'มือ & ท่าทาง', labelEn: 'Hands & Gestures' },
    { key: 'animals', icon: '🐶', label: 'สัตว์ & ธรรมชาติ', labelEn: 'Animals & Nature' },
    { key: 'food', icon: '🍔', label: 'อาหาร & เครื่องดื่ม', labelEn: 'Food & Drink' },
    { key: 'activities', icon: '⚽', label: 'กิจกรรม', labelEn: 'Activities' },
    { key: 'travel', icon: '🚗', label: 'ท่องเที่ยว & สถานที่', labelEn: 'Travel & Places' },
    { key: 'objects', icon: '💡', label: 'วัตถุ', labelEn: 'Objects' },
    { key: 'symbols', icon: '❤️', label: 'สัญลักษณ์', labelEn: 'Symbols' },
    { key: 'flags', icon: '🏁', label: 'ธง', labelEn: 'Flags' },
]

// Comprehensive emoji data by category
const EMOJI_DATA: Record<string, string[]> = {
    frequent: [
        '👍', '❤️', '😂', '🔥', '✅', '🙏', '😮', '😢', '👏', '💯',
        '🎉', '😍', '🤔', '👀', '💪', '⭐', '🙌',  '😊', '🥰', '💕',
    ],
    smileys: [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
        '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
        '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫',
        '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒',
        '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
        '🤕', '🤢', '🤮', '🥴', '😵', '🤯', '🥳', '🥸', '😎', '🤓',
        '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺',
        '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖',
        '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
        '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽',
        '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿',
        '😾', '🫠', '🫢', '🫣', '🫨',
    ],
    gestures: [
        '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
        '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
        '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
        '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅',
        '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠',
        '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '🫦',
    ],
    animals: [
        '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨',
        '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊',
        '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉',
        '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌',
        '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️', '🦂', '🐢',
        '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡',
        '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🪸', '🐊', '🐅', '🐆',
        '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒',
        '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙',
        '🐐', '🦌', '🐕', '🐩', '🦮', '🐈', '🐓', '🦃', '🦤', '🦚',
        '🦜', '🦢', '🦩', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥',
        '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱',
        '🪴', '🌲', '🌳', '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁',
        '🍂', '🍃', '🪹', '🪺', '🍄', '🌰', '🦔', '🐿️',
    ],
    food: [
        '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏',
        '🍐', '🍑', '🍒', '🍓', '🫐', '🥝', '🍅', '🫒', '🥥', '🥑',
        '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄',
        '🧅', '🍄', '🥜', '🫘', '🌰', '🍞', '🥐', '🥖', '🫓', '🥨',
        '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟',
        '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥚', '🍳',
        '🥘', '🍲', '🫕', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱',
        '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤',
        '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦀', '🦞', '🦐', '🦑',
        '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧',
        '🍫', '🍬', '🍭', '🍮', '🍯', '☕', '🫖', '🍵', '🍶', '🍾',
        '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🫗', '🥤', '🧋',
        '🧃', '🧉', '🧊',
    ],
    activities: [
        '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
        '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
        '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
        '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤸', '🤼', '🤽',
        '🤾', '🤺', '🏄', '🏇', '🧘', '🏊', '🚴', '🚵', '🎪', '🎭',
        '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺',
        '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩',
        '🎃', '🎄', '🎆', '🎇', '🧨', '✨', '🎈', '🎉', '🎊', '🎋',
        '🎍', '🎎', '🎏', '🎐', '🎑', '🧧', '🎀', '🎁', '🎗️', '🎟️',
        '🎫', '🏆', '🏅', '🥇', '🥈', '🥉', '⚽',
    ],
    travel: [
        '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
        '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🛺', '🚲', '🛴', '🚏',
        '🛣️', '🛤️', '⛽', '🛞', '🚨', '🚥', '🚦', '🚧', '⚓', '🛟',
        '⛵', '🛶', '🚤', '🛳️', '⛴️', '🛥️', '🚢', '✈️', '🛩️', '🛫',
        '🛬', '🪂', '💺', '🚁', '🚟', '🚠', '🚡', '🛰️', '🚀', '🛸',
        '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤',
        '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌',
        '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🌁', '🌃', '🏙️', '🌄',
        '🌅', '🌆', '🌇', '🌉', '🗼', '🗽', '🗻', '🏔️', '🌋', '🗾',
        '🏕️', '⛱️', '🏖️', '🏜️', '🏝️', '🎢', '🎡', '🎠',
    ],
    objects: [
        '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '💽',
        '💾', '💿', '📀', '🧮', '🎥', '🎞️', '📽️', '📺', '📷', '📸',
        '📹', '📼', '🔍', '🔎', '🕯️', '💡', '🔦', '🏮', '🪔', '📔',
        '📕', '📖', '📗', '📘', '📙', '📚', '📓', '📒', '📃', '📜',
        '📄', '📰', '🗞️', '📑', '🔖', '🏷️', '💰', '🪙', '💴', '💵',
        '💶', '💷', '💸', '💳', '🧾', '💹', '✉️', '📧', '📨', '📩',
        '📤', '📥', '📦', '📫', '📪', '📬', '📭', '📮', '🗳️', '✏️',
        '✒️', '🖋️', '🖊️', '🖌️', '🖍️', '📝', '📁', '📂', '🗂️', '📅',
        '📆', '🗒️', '🗓️', '📇', '📈', '📉', '📊', '📋', '📌', '📍',
        '📎', '🖇️', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '🔒', '🔓',
        '🔏', '🔐', '🔑', '🗝️', '🔨', '🪓', '⛏️', '⚒️', '🛠️', '🗡️',
        '⚔️', '🔫', '🪃', '🏹', '🛡️', '🪚', '🔧', '🪛', '🔩', '⚙️',
        '🗜️', '⚖️', '🦯', '🔗', '⛓️', '🪝', '🧰', '🧲', '🪜',
    ],
    symbols: [
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
        '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '❤️‍🔥', '❤️‍🩹',
        '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️',
        '🗨️', '🗯️', '💭', '💤', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣',
        '🟤', '⚫', '⚪', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫',
        '⬛', '⬜', '◼️', '◻️', '▪️', '▫️', '🔶', '🔷', '🔸', '🔹',
        '🔺', '🔻', '💠', '🔘', '🔳', '🔲', '✅', '☑️', '✔️', '❌',
        '❎', '➕', '➖', '➗', '✖️', '♾️', '‼️', '⁉️', '❓', '❔',
        '❕', '❗', '〰️', '⭕', '🔃', '🔄', '🔙', '🔚', '🔛', '🔜',
        '🔝', '⭐', '🌟', '💫', '⚡', '🔥', '💥', '☀️', '🌈',
        '🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️',
    ],
    flags: [
        '🇹🇭', '🇺🇸', '🇬🇧', '🇯🇵', '🇰🇷', '🇨🇳', '🇫🇷', '🇩🇪', '🇮🇹', '🇪🇸',
        '🇧🇷', '🇮🇳', '🇷🇺', '🇦🇺', '🇨🇦', '🇲🇽', '🇳🇱', '🇸🇬', '🇲🇾', '🇮🇩',
        '🇻🇳', '🇵🇭', '🇭🇰', '🇹🇼', '🇦🇪', '🇸🇦', '🇹🇷', '🇪🇬', '🇿🇦', '🇳🇬',
        '🇦🇷', '🇨🇱', '🇨🇴', '🇵🇪', '🇵🇱', '🇺🇦', '🇸🇪', '🇳🇴', '🇩🇰', '🇫🇮',
        '🇨🇭', '🇦🇹', '🇧🇪', '🇵🇹', '🇮🇪', '🇬🇷', '🇭🇺', '🇨🇿', '🇷🇴', '🇳🇿',
    ],
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
    const [activeCategory, setActiveCategory] = useState('frequent')
    const [search, setSearch] = useState('')
    const pickerRef = useRef<HTMLDivElement>(null)
    const searchRef = useRef<HTMLInputElement>(null)

    // Focus search on open
    useEffect(() => {
        searchRef.current?.focus()
    }, [])

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                onClose()
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose])

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [onClose])

    // Filter emojis if searching
    const displayEmojis = useMemo(() => {
        if (!search.trim()) {
            return EMOJI_DATA[activeCategory] || []
        }
        // When searching, show all emojis that match
        const all = Object.values(EMOJI_DATA).flat()
        // Remove duplicates
        return [...new Set(all)]
    }, [activeCategory, search])

    const handleSelect = (emoji: string) => {
        onSelect(emoji)
        onClose()
    }

    return (
        <div
            ref={pickerRef}
            className="w-[340px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl shadow-zinc-300/40 dark:shadow-black/40 overflow-hidden"
        >
            {/* Search Bar */}
            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                    <input
                        ref={searchRef}
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="ค้นหา emoji..."
                        className="w-full pl-8 pr-8 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-800 rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-violet-400/50 placeholder:text-zinc-400"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Category Tabs */}
            {!search && (
                <div className="flex gap-0.5 px-1.5 py-1 border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto"
                    style={{ scrollbarWidth: 'none' }}
                >
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.key}
                            onClick={() => setActiveCategory(cat.key)}
                            title={cat.label}
                            className={`
                                flex items-center justify-center h-8 w-8 rounded-lg text-base shrink-0
                                transition-all duration-100
                                ${activeCategory === cat.key
                                    ? 'bg-violet-100 dark:bg-violet-900/30 scale-110'
                                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 opacity-60 hover:opacity-100'
                                }
                            `}
                        >
                            <TwemojiImg emoji={cat.icon} size={18} />
                        </button>
                    ))}
                </div>
            )}

            {/* Category Label */}
            <div className="px-3 py-1.5">
                <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                    {search
                        ? `ผลลัพธ์ทั้งหมด`
                        : CATEGORIES.find(c => c.key === activeCategory)?.label
                    }
                </p>
            </div>

            {/* Emoji Grid */}
            <div className="px-2 pb-2 h-[260px] overflow-y-auto"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
            >
                <div className="grid grid-cols-8 gap-0.5">
                    {displayEmojis.map((emoji, idx) => (
                        <button
                            key={`${emoji}-${idx}`}
                            onClick={() => handleSelect(emoji)}
                            className="flex items-center justify-center h-9 w-9 rounded-lg text-xl
                                transition-all duration-100
                                hover:bg-violet-100 dark:hover:bg-violet-900/30 hover:scale-125 active:scale-95"
                        >
                            <TwemojiImg emoji={emoji} size={24} />
                        </button>
                    ))}
                </div>

                {displayEmojis.length === 0 && (
                    <div className="flex items-center justify-center h-32 text-sm text-zinc-400">
                        ไม่พบ emoji
                    </div>
                )}
            </div>
        </div>
    )
}
