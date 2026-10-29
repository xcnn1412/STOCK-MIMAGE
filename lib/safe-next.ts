/** หน้าที่จะพากลับหลัง login (?next=) — รับเฉพาะ path ภายในเว็บ กัน open redirect ไปเว็บอื่น */
export function safeNext(value: unknown): string {
  const next = typeof value === 'string' ? value : ''
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) return '/dashboard'
  // control char / ช่องว่าง (เบราว์เซอร์ตัดทิ้งแล้ว /\t/evil.com กลายเป็น //evil.com) และ backslash (อ่านเป็น /)
  // ตรวจทั้งค่าดิบและค่าที่ถอด %xx แล้ว (/%09/evil.com) — ถอดไม่ได้ = ไม่รับ
  let decoded: string
  try {
    decoded = decodeURIComponent(next)
  } catch {
    return '/dashboard'
  }
  if (/[\s\u0000-\u001f\u007f\\]/.test(next)) return '/dashboard'
  // ค่าที่ถอดแล้วไม่นับช่องว่าง — ?q=a%20b เป็นค่าปกติ
  if (/[\u0000-\u001f\u007f\\]/.test(decoded) || decoded.startsWith('//')) return '/dashboard'
  return next
}
