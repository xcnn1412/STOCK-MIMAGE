export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * "27 สิงหาคม 2569" — full Thai month + พ.ศ. year. Empty string for falsy input.
 * เวลาไทยเสมอ: สตริง YYYY-MM-DD อ่านตรงๆ ไม่ผ่าน Date (กัน timezone เลื่อนวัน)
 * ส่วน Date/ISO เต็มรูปแบบแปลงผ่านโซนเวลา Asia/Bangkok
 */
export function formatThaiDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''

  if (typeof dateStr === 'string') {
    const m = DATE_ONLY_RE.exec(dateStr.trim())
    if (m) {
      const [, y, mo, d] = m
      const month = THAI_MONTHS[Number(mo) - 1]
      if (!month) return ''
      return `${Number(d)} ${month} ${Number(y) + 543}`
    }
  }

  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)

  const month = THAI_MONTHS[get('month') - 1]
  if (!month) return ''
  return `${get('day')} ${month} ${get('year') + 543}`
}

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * วันนี้ตามเวลาไทย เป็น 'YYYY-MM-DD' — ใช้เป็นค่าเริ่มต้นของช่องวันที่
 * ห้ามใช้ new Date().toISOString().slice(0, 10): นั่นคือวันตามเวลาสากล ก่อน 07:00 จะได้วันเมื่อวาน
 */
export function thaiTodayIso(now: Date = new Date()): string {
  return new Date(now.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
}

/** เดือนนี้ตามเวลาไทย เป็น 'YYYYMM' — ใช้ในเลขที่เอกสาร */
export function thaiYearMonth(now: Date = new Date()): string {
  return thaiTodayIso(now).slice(0, 7).replace('-', '')
}
