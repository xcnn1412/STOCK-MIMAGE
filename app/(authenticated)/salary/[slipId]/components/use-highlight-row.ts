'use client'

// ============================================================================
// jump-to-row — คลิกงานค้างแล้วเลื่อนไปแถววันนั้น + ไฮไลต์ 2 วินาที
// spec: docs/specs/salary-slip-daily-ui.md §UI ("jump-to-row")
//
// แถววันในตารางมี id="day-<date>" อยู่แล้ว (slip-day-table.tsx) — hook นี้เก็บแค่
// "วันไหนกำลังไฮไลต์" ให้ตัวเรียกส่งต่อเป็น prop `highlightDate` ของตาราง
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'

/** ระยะเวลาที่แถวค้างไฮไลต์ไว้หลังคลิก (มิลลิวินาที) */
const HIGHLIGHT_MS = 2000

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
    if (typeof document !== 'undefined') {
      document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setHighlightDate(date)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHighlightDate(null), HIGHLIGHT_MS)
  }, [])

  return { highlightDate, jumpToDay }
}
