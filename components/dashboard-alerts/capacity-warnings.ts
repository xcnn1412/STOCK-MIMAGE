// ตรรกะล้วนของแผง "แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ" (dashboard-alerts) — ไม่มี React / ไม่มี I/O
// คำเตือนต่องานคิดเสร็จแล้วฝั่ง server (packages/capacity-data.ts → snapshot.capacityWarnings) ที่นี่แค่คัดว่าใครเห็นและเรียง
// สเปค: docs/specs/equipment-flow.md หัวข้อ 5.1 (แสดง 3 ที่ — แผงสดบน /dashboard + /jobs/tracking)

import { daysUntil } from '@/app/(authenticated)/jobs/tracking/tracking-logic'
import type { CapacityWarning } from '@/app/(authenticated)/packages/types'
import { countdownText } from './duty-warnings'

/** ช่วงที่เข้าแผง: วันนี้ → +30 วัน */
export const CAPACITY_PANEL_AHEAD_DAYS = 30

export interface CapacityViewer {
    userId: string | null
    department: string | null
    isAdmin: boolean
    /** แอดมิน/ฝ่ายประสานงาน (snapshot.canManagePool) */
    canManagePool: boolean
}

export interface CapacityRow {
    leadId: string
    customerName: string
    /** สถานที่/ชื่ออีเวนต์ — บรรทัดรอง (ว่างได้) */
    subtitle: string
    eventDate: string
    daysLeft: number
    countdown: string
    /** แดงอย่างน้อยหนึ่งข้อ = ไม่พอแน่นอน */
    level: 'red' | 'yellow'
    warnings: CapacityWarning[]
    href: string
}

export interface CapacityRowsInput {
    leads: { id: string; customer_name: string | null; event_name: string | null; event_date: string | null }[]
    warningsByLead: Record<string, CapacityWarning[]>
    /** ผู้สร้างการ์ดของแต่ละงาน (snapshot.leadCreatedBy) */
    leadCreatedBy: Record<string, string | null>
    /** แผนกที่ดูแลกระเป๋า/อุปกรณ์ (snapshot.dutyDepartments.kits) — ทีมจัดของเห็นทุกงาน */
    kitDepartments: string[]
    /** งานที่ไม่เข้าแผง (archive / กดเสร็จสิ้นแล้ว) */
    excludedLeadIds?: string[]
    viewer: CapacityViewer
    today: Date
}

/** ผู้ใช้คนนี้เห็นคำเตือนของงานนี้ไหม — แอดมิน / ฝ่ายประสานงาน / ผู้สร้างการ์ด / แผนกที่ดูแลอุปกรณ์ */
export function canSeeCapacity(viewer: CapacityViewer, createdBy: string | null | undefined, kitDepartments: string[]): boolean {
    if (viewer.isAdmin || viewer.canManagePool) return true
    if (viewer.userId && createdBy && viewer.userId === createdBy) return true
    return !!viewer.department && kitDepartments.includes(viewer.department)
}

/** ลิงก์ไปแถวของงานในตารางภาพรวม (ไฮไลต์งาน) */
export const capacityHref = (leadId: string) => `/jobs/tracking?lead=${encodeURIComponent(leadId)}`

/**
 * แถวของแผง: งานที่มีคำเตือน วันงานอยู่ใน [วันนี้, +30] และผู้ใช้คนนี้เห็น — เรียงวันงานใกล้สุดก่อน (เท่ากัน = ชื่อลูกค้า)
 */
export function buildCapacityRows(input: CapacityRowsInput): CapacityRow[] {
    const excluded = new Set(input.excludedLeadIds ?? [])
    const rows: CapacityRow[] = []
    for (const lead of input.leads) {
        const warnings = input.warningsByLead[lead.id] ?? []
        if (warnings.length === 0 || !lead.event_date || excluded.has(lead.id)) continue
        const days = daysUntil(lead.event_date, input.today)
        if (days < 0 || days > CAPACITY_PANEL_AHEAD_DAYS) continue
        if (!canSeeCapacity(input.viewer, input.leadCreatedBy[lead.id], input.kitDepartments)) continue
        rows.push({
            leadId: lead.id,
            customerName: lead.customer_name || lead.event_name || 'ไม่ระบุลูกค้า',
            subtitle: lead.customer_name ? lead.event_name || '' : '',
            eventDate: lead.event_date,
            daysLeft: days,
            countdown: countdownText(days),
            level: warnings.some(w => w.level === 'red') ? 'red' : 'yellow',
            warnings,
            href: capacityHref(lead.id),
        })
    }
    return rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.customerName.localeCompare(b.customerName, 'th'))
}
