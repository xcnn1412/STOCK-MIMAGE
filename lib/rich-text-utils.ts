/**
 * Rich Text Content Renderer
 *
 * Renders content that may be HTML (from Tiptap editor) or plain text
 * (legacy replies). Provides backward compatibility with old @[Name](uuid)
 * mention format and plain text content.
 */
import DOMPurify from 'isomorphic-dompurify'
import { escapeHtml } from './escape-html'

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
 * ล้าง HTML ด้วย DOMPurify — allowlist เดียวของทั้งระบบ (documents/doc-types.ts ใช้ตัวนี้ด้วย)
 * แท็ก = เท่าที่ TipTap ของเราผลิตจริง (StarterKit + Color + Highlight + TextStyle + Mention)
 * href ผ่านเฉพาะ http/https/mailto (URI regexp ค่าเริ่มต้นของ DOMPurify) · ไม่มี img/svg/iframe/form
 */
const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'mark', 'span', 'a',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'hr',
]
const ALLOWED_ATTR = ['class', 'style', 'data-type', 'data-id', 'data-label', 'href', 'target', 'rel']

export function sanitizeHtml(html: string): string {
    return DOMPurify.sanitize(String(html ?? ''), { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: true })
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

    // Plain text: escape ก่อน แล้วค่อยแปลง mention แบบเก่า (ไม่งั้น <script> ในข้อความดิบหลุดเป็น HTML)
    const withMentions = convertLegacyMentions(escapeHtml(content))
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
