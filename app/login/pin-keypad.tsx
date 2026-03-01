'use client'

import { useState, useCallback, useEffect } from 'react'
import { Delete } from 'lucide-react'

interface PinKeypadProps {
    value: string
    onChange: (value: string) => void
    length?: number
    disabled?: boolean
    onComplete?: () => void
}

export default function PinKeypad({ value, onChange, length = 6, disabled = false, onComplete }: PinKeypadProps) {
    const [activeKey, setActiveKey] = useState<string | null>(null)

    const handlePress = useCallback((digit: string) => {
        if (disabled) return
        if (value.length < length) {
            const newVal = value + digit
            onChange(newVal)
            if (newVal.length === length && onComplete) {
                setTimeout(onComplete, 150)
            }
        }
    }, [value, length, disabled, onChange, onComplete])

    const handleDelete = useCallback(() => {
        if (disabled) return
        onChange(value.slice(0, -1))
    }, [value, disabled, onChange])

    // Keyboard support
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (disabled) return
            if (/^\d$/.test(e.key)) {
                handlePress(e.key)
                setActiveKey(e.key)
                setTimeout(() => setActiveKey(null), 150)
            }
            if (e.key === 'Backspace') {
                handleDelete()
                setActiveKey('del')
                setTimeout(() => setActiveKey(null), 150)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [disabled, handlePress, handleDelete])

    const keys = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['', '0', 'del'],
    ]

    return (
        <div className="flex flex-col items-center gap-6">
            {/* PIN Dots */}
            <div className="flex items-center gap-3">
                {Array.from({ length }).map((_, i) => {
                    const filled = i < value.length
                    const isActive = i === value.length
                    return (
                        <div
                            key={i}
                            className={`
                                relative w-3.5 h-3.5 rounded-full
                                transition-all duration-200 ease-out
                                ${filled
                                    ? 'bg-zinc-900 dark:bg-white scale-110 shadow-sm'
                                    : isActive
                                        ? 'bg-zinc-200 dark:bg-zinc-700 ring-2 ring-zinc-400 dark:ring-zinc-500 animate-pulse'
                                        : 'bg-zinc-200 dark:bg-zinc-800 ring-1 ring-zinc-300 dark:ring-zinc-700'
                                }
                            `}
                        />
                    )
                })}
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
                {keys.flat().map((key, i) => {
                    if (key === '') return <div key={i} className="w-[80px] h-[56px]" />

                    const isDelete = key === 'del'
                    const isPressed = activeKey === key

                    return (
                        <button
                            key={i}
                            type="button"
                            disabled={disabled || (!isDelete && value.length >= length)}
                            onClick={() => isDelete ? handleDelete() : handlePress(key)}
                            onPointerDown={() => setActiveKey(key)}
                            onPointerUp={() => setTimeout(() => setActiveKey(null), 100)}
                            onPointerLeave={() => setActiveKey(null)}
                            className={`
                                relative flex items-center justify-center
                                w-[80px] h-[56px] mx-auto
                                rounded-2xl
                                transition-all duration-100 ease-out
                                select-none
                                ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
                                ${isDelete
                                    ? 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    : isPressed
                                        ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm scale-95'
                                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }
                            `}
                        >
                            {isDelete ? (
                                <Delete className="h-5 w-5" />
                            ) : (
                                <span className="text-xl font-medium">{key}</span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
