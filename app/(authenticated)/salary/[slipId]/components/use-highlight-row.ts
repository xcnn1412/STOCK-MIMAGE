'use client'

// ============================================================================
// jump-to-row — คลิกงานค้างแล้วเลื่อนไปแถววันนั้น + ไฮไลต์ 2 วินาที
// spec: docs/specs/salary-slip-daily-ui.md §UI ("jump-to-row")
//
// แถววันในตารางมี id="day-<date>" (slip-day-table.tsx) และการ์ดมือถือมี
// id="day-<date>-m" (slip-day-cards.tsx) — ทั้งคู่อยู่ใน DOM พร้อมกันแล้วสลับ
// ด้วย CSS จึงต้องเลือกกระโดดไปตัวที่ "มองเห็นอยู่" เท่านั้น
// hook นี้เก็บแค่ "วันไหนกำลังไฮไลต์" ให้ตัวเรียกส่งต่อเป็น prop `highlightDate`
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'

/** ระยะเวลาที่แถวค้างไฮไลต์ไว้หลังคลิก (มิลลิวินาที) */
const HIGHLIGHT_MS = 2000

/**
 * แถว/การ์ดของวันนั้นที่กำลังแสดงอยู่จริง — ตัวที่ถูกซ่อนด้วย `hidden`/`md:hidden`
 * มี `offsetParent === null` จึงข้ามไป (ถ้าไม่มีตัวไหนมองเห็นเลย คืนตัวแรกที่เจอ)
 */
function visibleDayElement(date: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const found = [`day-${date}`, `day-${date}-m`]
    .map(id => document.getElementById(id))
    .filter((el): el is HTMLElement => !!el)
  return found.find(el => el.offsetParent !== null) ?? found[0] ?? null
}

export interface HighlightRow {
  /** วันไทย (YYYY-MM-DD) ที่กำลังไฮไลต์ — null = ไม่มี */
  highlightDate: string | null
  /** เลื่อนไปแถวของวันนั้นแล้วไฮไลต์ */
  jumpToDay: (date: string) => void
}

export function useHighlightRow(): HighlightRow {
  const [highlightDate, setHighlightDate] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // กันตั้ง state หลังคอมโพเนนต์ถูกถอดออก (คลิกแล้วเปลี่ยนหน้าทันที)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const jumpToDay = useCallback((date: string) => {
    visibleDayElement(date)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightDate(date)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHighlightDate(null), HIGHLIGHT_MS)
  }, [])

  return { highlightDate, jumpToDay }
}
