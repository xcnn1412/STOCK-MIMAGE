// ตรรกะล้วนของไฟล์แนบตั๋ว + สิทธิ์ผูกเช็คอินกับอีเวนต์ — ไม่มี I/O ไม่มี 'use server'
// (ไฟล์ 'use server' export ได้แต่ async function จึงแยกออกมาให้ชุดตรวจ import ได้ตรงๆ)

export const TICKET_ATTACHMENT_BUCKET = 'ticket-attachments'

// โฟลเดอร์ที่ client ส่งมา: 1–2 ท่อน ท่อนละ A-Z a-z 0-9 _ - ไม่เกิน 64 ตัว
// (ของจริงที่ส่งมา: 'tickets', uuid ของตั๋ว, 'kpi_evaluations/<uuid>')
const FOLDER_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/

export function isSafeFolderParts(parts: string[]) {
    return parts.length >= 1 && parts.length <= 2 && parts.every(p => FOLDER_SEGMENT.test(p))
}

/**
 * public URL → path ในบัคเก็ต (ถอดรหัส %xx แล้ว) หรือ null ถ้า URL ไม่ใช่ของบัคเก็ตนี้ / path น่าสงสัย
 * ห้าม: ว่าง, '/' นำหน้า, '..', backslash, '//' — ทั้งแบบตรงๆ และแบบเข้ารหัส %xx
 */
export function attachmentPathFromUrl(url: unknown): string | null {
    if (typeof url !== 'string') return null
    const marker = `/${TICKET_ATTACHMENT_BUCKET}/`
    const idx = url.indexOf(marker)
    if (idx === -1) return null
    const encoded = url.slice(idx + marker.length).split(/[?#]/)[0]
    let path: string
    try {
        path = decodeURIComponent(encoded)
    } catch {
        return null // %xx พัง
    }
    if (!path || path.startsWith('/') || path.includes('..') || path.includes('\\') || path.includes('//')) return null
    return path
}

/** path ของไฟล์ที่ userId อัปโหลดเอง: <โฟลเดอร์ 1–2 ท่อน>/u-<userId>/<ไฟล์> */
export function isOwnAttachmentPath(path: string, userId: string) {
    const parts = path.split('/')
    if (parts.length < 3) return false
    const file = parts[parts.length - 1]
    const owner = parts[parts.length - 2]
    return owner === `u-${userId}` && file.length > 0 && isSafeFolderParts(parts.slice(0, -2))
}

/**
 * ไฟล์แนบที่ผู้เรียกบันทึกลงตั๋ว/คำตอบได้ — เฉพาะ URL ในบัคเก็ต ticket-attachments ใต้ u-<ตัวเอง>
 * ที่เหลือ (ไฟล์คนอื่น บัคเก็ตอื่น ค่าที่ไม่ใช่สตริง) ทิ้งเงียบๆ
 * เหตุผล: ตอนลบตั๋ว ไฟล์แนบทุกไฟล์ถูกลบตาม — ถ้ารับ URL ใดก็ได้ จะใช้ลบไฟล์ของคนอื่นทางอ้อมได้
 */
export function ownTicketAttachmentUrls(urls: unknown, userId: string): string[] {
    if (!Array.isArray(urls) || !userId) return []
    return urls.filter((u): u is string => {
        const path = attachmentPathFromUrl(u)
        return path !== null && isOwnAttachmentPath(path, userId)
    })
}

/**
 * ผูกเช็คอินหน้างานกับอีเวนต์ได้ไหม: แอดมินได้ทุกงาน · คนอื่นต้องอยู่ใน event_staff ของงานนั้น
 * ยกเว้นงานที่ยังไม่ได้จัดทีมเลย (ไม่มีแถว event_staff) — ไม่งั้นงานที่ลืมจัดทีมเช็คอินไม่ได้ทั้งงาน
 */
export function canUseEvent(p: { isAdmin: boolean; isMember: boolean; eventHasStaff: boolean }): boolean {
    return p.isAdmin || p.isMember || !p.eventHasStaff
}
