'use client'

import { useState } from 'react'

// ============================================================================
// Twemoji — renders emoji as beautiful SVG images (Twitter/Discord style)
// Falls back to native emoji if image fails to load
// Also supports custom emoji shortcodes (e.g. :ia_logo:)
// ============================================================================

const TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg'

/**
 * Check if a string is a custom emoji shortcode (e.g. ":ia_logo:")
 */
export function isCustomShortcode(emoji: string): boolean {
    return /^:[a-z0-9_]+:$/.test(emoji)
}

/**
 * Convert an emoji character to its Twemoji CDN URL.
 * Following Twemoji's naming convention:
 * - If emoji contains ZWJ (U+200D), keep fe0f variation selectors
 * - If no ZWJ, remove all fe0f 
 */
export function emojiToTwemojiUrl(emoji: string): string {
    const hasZWJ = emoji.includes('\u200D')
    const processed = hasZWJ ? emoji : emoji.replace(/\uFE0F/g, '')

    const codePoints: string[] = []
    for (const char of processed) {
        const cp = char.codePointAt(0)
        if (cp !== undefined) {
            codePoints.push(cp.toString(16))
        }
    }

    return `${TWEMOJI_CDN}/${codePoints.join('-')}.svg`
}

// ============================================================================
// TwemojiImg Component
// ============================================================================

interface TwemojiImgProps {
    emoji: string
    size?: number
    className?: string
    /** Map of shortcode → image_url for custom emojis */
    customEmojiMap?: Map<string, string>
}

/**
 * Renders an emoji as a high-quality Twemoji SVG image.
 * Falls back to native emoji character if image fails.
 * Supports custom emoji shortcodes when customEmojiMap is provided.
 */
export function TwemojiImg({ emoji, size = 20, className = '', customEmojiMap }: TwemojiImgProps) {
    const [failed, setFailed] = useState(false)

    // Check if this is a custom emoji shortcode
    if (isCustomShortcode(emoji)) {
        const customUrl = customEmojiMap?.get(emoji)
        if (customUrl) {
            return (
                <img
                    src={customUrl}
                    alt={emoji}
                    width={size}
                    height={size}
                    className={className}
                    draggable={false}
                    loading="lazy"
                    style={{ display: 'inline-block', verticalAlign: 'middle', objectFit: 'contain' }}
                />
            )
        }
        // No URL found — show shortcode text as fallback
        return (
            <span
                className={className}
                style={{ fontSize: Math.max(size * 0.5, 10), lineHeight: 1, display: 'inline-block', width: size, height: size, textAlign: 'center', verticalAlign: 'middle' }}
                title={emoji}
            >
                {emoji}
            </span>
        )
    }

    if (failed) {
        return (
            <span
                className={className}
                style={{ fontSize: size, lineHeight: 1, display: 'inline-block', width: size, height: size, textAlign: 'center' }}
            >
                {emoji}
            </span>
        )
    }

    return (
        <img
            src={emojiToTwemojiUrl(emoji)}
            alt={emoji}
            width={size}
            height={size}
            className={className}
            draggable={false}
            loading="lazy"
            onError={() => setFailed(true)}
            style={{ display: 'inline-block', verticalAlign: 'middle' }}
        />
    )
}
