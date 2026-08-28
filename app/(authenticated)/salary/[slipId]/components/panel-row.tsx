// ============================================================================
// ป้ายซ้าย / ช่องขวา หนึ่งคู่ — หน่วยพื้นฐานของฟอร์มแนวตั้งบนมือถือ
// ใช้ทั้งในแผงแก้ใต้การ์ดรายวัน และฟอร์ม "เพิ่มเช็คอินที่ลืม"
// (จอแคบมากให้ตัดบรรทัดได้ ไม่บีบช่องกรอกจนกดยาก)
// ============================================================================

import type { ReactNode } from 'react'

export default function PanelRow({
  label, children,
}: {
  label: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
