const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** "27 สิงหาคม 2569" — full Thai month + พ.ศ. year. Empty string for falsy input. */
export function formatThaiDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return ''
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}
