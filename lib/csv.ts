/**
 * เซลล์ CSV หนึ่งช่อง — กัน formula injection (L2) และ escape ตาม RFC 4180
 * - ค่าที่ขึ้นต้นด้วย = + - @ tab CR (หรือช่องว่างตามด้วยตัวเหล่านั้น) เติม ' นำหน้าให้ Excel/Sheets อ่านเป็นข้อความ
 * - ตัวเลขล้วน (เช่น -100.0) ไม่เติม เพื่อให้ยังคำนวณได้
 * - มี , " ขึ้นบรรทัด → ครอบ "..." และ " เป็น ""
 */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value)
  if (/^\s*[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
