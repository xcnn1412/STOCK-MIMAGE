/**
 * Rich Text Content Renderer
 *
 * Renders content that may be HTML (from Tiptap editor) or plain text
 * (legacy replies). Provides backward compatibility with old @[Name](uuid)
 * mention format and plain text content.
 */

/**
 * Check if content is HTML (from Tiptap) or plain text (legacy)
 */
export function isHtmlContent(content: string): boolean {
    return content.startsWith('<') && (content.includes('<p>') || content.includes('<br'))
}

/**
 * Convert legacy plain text mentions @[Name](uuid) to HTML mention spans
 * for consistent rendering.
 */
export function convertLegacyMentions(text: string): string {
    return text.replace(
        /@\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="mention" data-type="mention" data-id="$2">@$1</span>'
    )
}

/**
 * Sanitize HTML content to prevent XSS while keeping rich text formatting.
 * Allows: p, br, strong, em, span (with style/class/data-*), mark
 */
export function sanitizeHtml(html: string): string {
    // Basic sanitization — strip script tags and event handlers
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\bon\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/\bon\w+\s*=\s*'[^']*'/gi, '')
        .replace(/javascript:/gi, '')
}

/**
 * Prepare content for safe HTML rendering.
 * - If HTML content: sanitize and return
 * - If plain text: convert newlines to <br>, convert legacy mentions
 */
export function prepareContentForRender(content: string): string {
    if (!content) return ''

    if (isHtmlContent(content)) {
        return sanitizeHtml(content)
    }

    // Plain text: convert to HTML
    const withMentions = convertLegacyMentions(content)
    // Convert newlines to <br> but preserve existing HTML from mention conversion
    const lines = withMentions.split('\n')
    return lines.map(line => `<p>${line || '<br>'}</p>`).join('')
}

/**
 * Extract plain text from HTML content (for previews, search, etc.)
 */
export function htmlToPlainText(html: string): string {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
}
