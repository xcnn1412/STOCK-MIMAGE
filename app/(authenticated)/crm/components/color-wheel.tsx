'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Check } from 'lucide-react'

interface ColorPickerProps {
    size?: number
    value?: string
    name?: string
    onChange?: (color: string) => void
}

const QUICK_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6',
    '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b',
    '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488',
    '#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#475569',
    '#fca5a5', '#fdba74', '#fde047', '#86efac', '#5eead4',
    '#93c5fd', '#a5b4fc', '#c4b5fd', '#f9a8d4', '#cbd5e1',
]

/* ---- HSV <-> Hex helpers ---- */
function hsvToHex(h: number, s: number, v: number): string {
    const f = (n: number) => {
        const k = (n + h / 60) % 6
        return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0)
    }
    const toHex = (x: number) =>
        Math.round(x * 255)
            .toString(16)
            .padStart(2, '0')
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

function hexToHsv(hex: string): [number, number, number] {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!m) return [0, 1, 1]
    const r = parseInt(m[1], 16) / 255
    const g = parseInt(m[2], 16) / 255
    const b = parseInt(m[3], 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    const v = max
    const s = max === 0 ? 0 : d / max
    let h = 0
    if (d !== 0) {
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
        else if (max === g) h = ((b - r) / d + 2) * 60
        else h = ((r - g) / d + 4) * 60
    }
    return [h, s, v]
}

export default function ColorWheel({
    size = 200,
    value = '#3b82f6',
    name = 'color',
    onChange,
}: ColorPickerProps) {
    const squareRef = useRef<HTMLCanvasElement>(null)
    const hueRef = useRef<HTMLCanvasElement>(null)
    const [isDraggingSquare, setIsDraggingSquare] = useState(false)
    const [isDraggingHue, setIsDraggingHue] = useState(false)

    const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(value))
    const [currentColor, setCurrentColor] = useState(value)

    const hueBarHeight = 16
    const sqSize = size

    // ---- Draw saturation-brightness square ----
    useEffect(() => {
        const canvas = squareRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        canvas.width = sqSize * dpr
        canvas.height = sqSize * dpr
        ctx.scale(dpr, dpr)

        ctx.fillStyle = `hsl(${hsv[0]}, 100%, 50%)`
        ctx.fillRect(0, 0, sqSize, sqSize)

        const whiteGrad = ctx.createLinearGradient(0, 0, sqSize, 0)
        whiteGrad.addColorStop(0, 'rgba(255,255,255,1)')
        whiteGrad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = whiteGrad
        ctx.fillRect(0, 0, sqSize, sqSize)

        const blackGrad = ctx.createLinearGradient(0, 0, 0, sqSize)
        blackGrad.addColorStop(0, 'rgba(0,0,0,0)')
        blackGrad.addColorStop(1, 'rgba(0,0,0,1)')
        ctx.fillStyle = blackGrad
        ctx.fillRect(0, 0, sqSize, sqSize)
    }, [sqSize, hsv[0]])

    // ---- Draw hue bar ----
    useEffect(() => {
        const canvas = hueRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        canvas.width = sqSize * dpr
        canvas.height = hueBarHeight * dpr
        ctx.scale(dpr, dpr)

        const grad = ctx.createLinearGradient(0, 0, sqSize, 0)
            ;[0, 60, 120, 180, 240, 300, 360].forEach((deg) => {
                grad.addColorStop(deg / 360, `hsl(${deg}, 100%, 50%)`)
            })
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(0, 0, sqSize, hueBarHeight, 4)
        ctx.fill()
    }, [sqSize, hueBarHeight])

    // Sync external value
    useEffect(() => {
        const newHsv = hexToHsv(value)
        setHsv(newHsv)
        setCurrentColor(value)
    }, [value])

    const updateFromHsv = useCallback(
        (h: number, s: number, v: number) => {
            const hex = hsvToHex(h, s, v)
            setHsv([h, s, v])
            setCurrentColor(hex)
            onChange?.(hex)
        },
        [onChange]
    )

    // Quick pick from palette
    const pickPreset = useCallback(
        (hex: string) => {
            const newHsv = hexToHsv(hex)
            setHsv(newHsv)
            setCurrentColor(hex)
            onChange?.(hex)
        },
        [onChange]
    )

    // ---- Square interaction ----
    const pickSquare = useCallback(
        (clientX: number, clientY: number) => {
            const canvas = squareRef.current
            if (!canvas) return
            const rect = canvas.getBoundingClientRect()
            const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
            const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
            updateFromHsv(hsv[0], x, 1 - y)
        },
        [hsv[0], updateFromHsv]
    )

    const onSquareDown = useCallback(
        (e: React.PointerEvent) => {
            setIsDraggingSquare(true)
                ; (e.target as HTMLElement).setPointerCapture(e.pointerId)
            pickSquare(e.clientX, e.clientY)
        },
        [pickSquare]
    )
    const onSquareMove = useCallback(
        (e: React.PointerEvent) => {
            if (!isDraggingSquare) return
            pickSquare(e.clientX, e.clientY)
        },
        [isDraggingSquare, pickSquare]
    )
    const onSquareUp = useCallback(() => setIsDraggingSquare(false), [])

    // ---- Hue bar interaction ----
    const pickHue = useCallback(
        (clientX: number) => {
            const canvas = hueRef.current
            if (!canvas) return
            const rect = canvas.getBoundingClientRect()
            const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
            updateFromHsv(x * 360, hsv[1], hsv[2])
        },
        [hsv[1], hsv[2], updateFromHsv]
    )

    const onHueDown = useCallback(
        (e: React.PointerEvent) => {
            setIsDraggingHue(true)
                ; (e.target as HTMLElement).setPointerCapture(e.pointerId)
            pickHue(e.clientX)
        },
        [pickHue]
    )
    const onHueMove = useCallback(
        (e: React.PointerEvent) => {
            if (!isDraggingHue) return
            pickHue(e.clientX)
        },
        [isDraggingHue, pickHue]
    )
    const onHueUp = useCallback(() => setIsDraggingHue(false), [])

    const sqX = hsv[1] * 100
    const sqY = (1 - hsv[2]) * 100
    const hueX = (hsv[0] / 360) * 100

    return (
        <div className="flex gap-3">
            {/* Left: Square picker + hue bar */}
            <div className="flex flex-col gap-2" style={{ width: sqSize }}>
                {/* Sat-Brightness Square */}
                <div
                    className="relative select-none touch-none rounded-lg overflow-hidden shadow-sm ring-1 ring-black/10"
                    style={{ width: sqSize, height: sqSize }}
                >
                    <canvas
                        ref={squareRef}
                        className="w-full h-full cursor-crosshair"
                        style={{ width: sqSize, height: sqSize }}
                        onPointerDown={onSquareDown}
                        onPointerMove={onSquareMove}
                        onPointerUp={onSquareUp}
                        onPointerLeave={onSquareUp}
                    />
                    <div
                        className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${sqX}%`, top: `${sqY}%` }}
                    >
                        <div className="w-4 h-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.3)]" />
                    </div>
                </div>

                {/* Hue Bar */}
                <div className="relative select-none touch-none" style={{ height: hueBarHeight }}>
                    <canvas
                        ref={hueRef}
                        className="w-full cursor-pointer rounded"
                        style={{ width: sqSize, height: hueBarHeight }}
                        onPointerDown={onHueDown}
                        onPointerMove={onHueMove}
                        onPointerUp={onHueUp}
                        onPointerLeave={onHueUp}
                    />
                    <div
                        className="absolute pointer-events-none -translate-x-1/2 top-[-2px]"
                        style={{ left: `${hueX}%` }}
                    >
                        <div
                            className="w-3 rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_1px_3px_rgba(0,0,0,0.3)]"
                            style={{ height: hueBarHeight + 4 }}
                        />
                    </div>
                </div>

                {/* Preview + hex */}
                <div className="flex items-center gap-2">
                    <span
                        className="h-6 w-6 rounded-md ring-1 ring-black/10 shadow-sm shrink-0"
                        style={{ backgroundColor: currentColor }}
                    />
                    <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        {currentColor}
                    </span>
                </div>
            </div>

            {/* Right: Quick palette */}
            <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-zinc-400 font-medium">Quick Pick</span>
                <div className="grid grid-cols-5 gap-1">
                    {QUICK_COLORS.map((hex) => (
                        <button
                            key={hex}
                            type="button"
                            onClick={() => pickPreset(hex)}
                            className="relative h-6 w-6 rounded-md ring-1 ring-black/10 transition-all hover:scale-110 hover:shadow-md focus:outline-none"
                            style={{ backgroundColor: hex }}
                            title={hex}
                        >
                            {currentColor.toLowerCase() === hex.toLowerCase() && (
                                <span className="absolute inset-0 flex items-center justify-center">
                                    <Check className="h-3 w-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Hidden input for form */}
            <input type="hidden" name={name} value={currentColor} />
        </div>
    )
}
