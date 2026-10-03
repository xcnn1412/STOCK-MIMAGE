// กรอบการ์ดของหน้าแรก — ที่เดียวสำหรับสีพื้น/เส้นขอบ/เงา ที่เคยเขียนซ้ำในทุกแผง
// ไม่มี hook: ใช้ได้ทั้งใน server component และ client component

import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

/** พื้น + เส้นขอบ + เงาของการ์ด (ไม่รวมมุมโค้ง/ระยะใน — ช่องตัวเลขใช้มุมเล็กกว่า) */
export const DASH_SURFACE = 'border border-zinc-200/60 bg-white shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80'
/** การ์ดมาตรฐาน — ใช้ตรงๆ กับ element ที่ไม่ใช่ <DashCard> (เช่นโครงระหว่างโหลด) */
export const DASH_CARD = `rounded-2xl p-4 ${DASH_SURFACE}`

const ACCENT = {
    amber: 'bg-amber-400 dark:bg-amber-500',
    red: 'bg-red-500',
}

/**
 * การ์ดของหน้าแรก — accent = แถบสีบนขอบบอกความด่วน (แดง = เลยวัน/≤3 วัน · เหลือง = ใกล้ถึง/มีงานค้าง)
 * className ทับค่าเริ่มต้นได้ (เช่น p-3)
 */
export function DashCard({
    as: Tag = 'section',
    accent,
    className,
    children,
    ...rest
}: { as?: 'section' | 'div'; accent?: keyof typeof ACCENT } & ComponentPropsWithoutRef<'section'>) {
    return (
        <Tag className={cn(DASH_CARD, accent && 'relative overflow-hidden', className)} {...rest}>
            {accent && <div aria-hidden className={cn('absolute inset-x-0 top-0 h-1', ACCENT[accent])} />}
            {children}
        </Tag>
    )
}
