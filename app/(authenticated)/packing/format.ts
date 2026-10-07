// ตัวช่วยแสดงผลของหน้าใบจัดของ (pure — ใช้ได้ทั้ง server และ client) · วันที่แบบไทย พ.ศ. คิดจาก 'YYYY-MM-DD' ตรงๆ ไม่ขึ้นกับเขตเวลาเครื่อง

/** '2026-10-20' → '20 ต.ค. 2569' · ไม่มี = 'ยังไม่ระบุวันงาน' */
export function thaiDate(d: string | null | undefined): string {
  if (!d) return 'ยังไม่ระบุวันงาน'
  const date = new Date(`${d.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return d
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** '10:00' + '18:00' → '10:00–18:00' · มีแค่เริ่ม = '10:00' · ไม่มี = null */
export function timeRange(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = start ? start.slice(0, 5) : null
  const e = end ? end.slice(0, 5) : null
  if (s && e) return `${s}–${e}`
  return s ?? (e ? `ถึง ${e}` : null)
}

/** วันงาน + เวลา เช่น '20 ต.ค. 2569 · 10:00–18:00' */
export function eventWhen(date: string | null | undefined, start?: string | null, end?: string | null): string {
  const t = timeRange(start, end)
  return t ? `${thaiDate(date)} · ${t}` : thaiDate(date)
}

/** ISO timestamp → '20 ต.ค. 2569 14:05' (เวลาไทย) */
export function thaiDateTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
}
