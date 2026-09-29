const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** ข้อความ → ปลอดภัยสำหรับใส่ใน HTML ที่ประกอบเป็นสตริง (หน้าพิมพ์) */
export function escapeHtml(value: unknown): string {
  // null/undefined = ช่องว่าง ไม่ใช่คำว่า "null" บนกระดาษ
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"']/g, ch => HTML_ENTITIES[ch])
}
