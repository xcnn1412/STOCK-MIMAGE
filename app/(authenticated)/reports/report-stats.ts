// ตรรกะนับสถิติทีมของหน้า /reports — pure ล้วน (ไม่มี React ไม่มี IO) เพื่อให้ทดสอบด้วย
// report-stats.check.ts ได้ตรงๆ
//
// นิยามการนับล็อกไว้ที่ docs/specs/team-reports.md — ห้ามเปลี่ยนโดยไม่กลับไปแก้ spec:
//   ออกงานอีเวนต์ = จำนวนอีเวนต์ไม่ซ้ำที่ถูกจัดชื่อเข้า และถึงวันแล้ว (event_date ≤ วันนี้)
//   จัดคน / จัดรถ / จัดกระเป๋า = หนึ่งแถวใน lead_duty_claims ต่อหนึ่งหน้าที่ที่รับไว้
//   รับงานกราฟิก = ใบงาน job_type='graphic' ที่มีคนกดรับ (claimed_by)
// การกรอง "ไม่ซ้ำ" ของอีเวนต์ทำที่ฝั่ง server ตอนสร้างแถว — ที่นี่นับแถวตรงๆ

/** ประเภทสถิติ — หนึ่งค่า = หนึ่งคอลัมน์ในตารางและหนึ่งการ์ดสรุป */
export type StatKind = 'onsite' | 'staffing' | 'vehicle' | 'kits' | 'graphic'

/** ลำดับที่ใช้ทั้งหน้า (การ์ดสรุป + คอลัมน์ตาราง) */
export const STAT_KINDS: readonly StatKind[] = ['onsite', 'staffing', 'vehicle', 'kits', 'graphic']

/** ป้ายเต็ม — ใช้บนการ์ดสรุป */
export const STAT_LABELS_TH: Record<StatKind, string> = {
    onsite: 'ออกงานอีเวนต์',
    staffing: 'จัดคน',
    vehicle: 'จัดรถ',
    kits: 'จัดกระเป๋า',
    graphic: 'รับงานกราฟิก',
}

/** ป้ายสั้น — ใช้เป็นหัวคอลัมน์ให้ตารางไม่กว้างเกินจอมือถือ */
export const STAT_SHORT_LABELS_TH: Record<StatKind, string> = {
    onsite: 'ออกงาน',
    staffing: 'จัดคน',
    vehicle: 'จัดรถ',
    kits: 'จัดกระเป๋า',
    graphic: 'กราฟิก',
}

/**
 * หนึ่งเหตุการณ์ที่นับได้หนึ่งหน่วย — แบนที่สุดเท่าที่จะทำได้เพื่อส่งข้ามไป client ได้ถูก
 * `date` คือ "วันที่อ้างอิง" ตาม spec (ออกงาน = วันงาน, ที่เหลือ = วันที่กดรับ) รูปแบบ YYYY-MM-DD
 * — เก็บไว้เพื่อให้กรองตามช่วงเวลาฝั่ง client ได้โดยไม่ต้องโหลดใหม่ (ตั๋ว 02)
 */
export interface StatRow {
    userId: string
    kind: StatKind
    date: string | null
}

/** คนหนึ่งคนที่อนุมัติแล้ว — เฉพาะฟิลด์ที่ตารางต้องใช้ */
export interface ReportPerson {
    id: string
    fullName: string
    nickname: string | null
    department: string | null
}

/** หนึ่งแถวในตารางรายคน */
export interface PersonStats {
    userId: string
    name: string
    department: string | null
    onsite: number
    staffing: number
    vehicle: number
    kits: number
    graphic: number
    total: number
}

/** ยอดรวมทั้งทีมต่อประเภท — ตัวเลขบนการ์ดสรุป */
export type TeamTotals = Record<StatKind, number>

export interface StatsSummary {
    /** เรียงยอดรวมมากสุดก่อน · คนที่ทุกช่องเป็น 0 ถูกตัดออกแล้ว */
    people: PersonStats[]
    /** เท่ากับผลรวมของคอลัมน์ใน `people` เสมอ (คนนอกรายชื่อไม่ถูกนับทั้งสองที่) */
    totals: TeamTotals
}

/** ชื่อที่แสดง: "ชื่อเล่น | ชื่อเต็ม" ตามสำนวนเดียวกับช่องเลือกคนในพูลงาน */
export function personLabel(p: ReportPerson): string {
    const full = (p.fullName || '').trim() || p.id.slice(0, 8)
    const nick = (p.nickname || '').trim()
    return nick ? `${nick} | ${full}` : full
}

/** ตัวนับเปล่าหนึ่งชุด */
export function emptyTotals(): TeamTotals {
    return { onsite: 0, staffing: 0, vehicle: 0, kits: 0, graphic: 0 }
}

/**
 * รวมแถวเหตุการณ์เป็นสถิติรายคน + ยอดรวมทีม
 * — นับเฉพาะ userId ที่อยู่ในรายชื่อ `people` (คนที่อนุมัติแล้ว) แถวของคนนอกรายชื่อถูกทิ้ง
 * — คนที่ทุกช่องเป็น 0 ไม่ถูกส่งกลับ
 */
export function aggregateStats(rows: StatRow[], people: ReportPerson[]): StatsSummary {
    const byUser = new Map<string, PersonStats>()
    for (const p of people) {
        byUser.set(p.id, {
            userId: p.id,
            name: personLabel(p),
            department: (p.department || '').trim() || null,
            ...emptyTotals(),
            total: 0,
        })
    }

    const totals = emptyTotals()
    for (const r of rows) {
        const stats = byUser.get(r.userId)
        if (!stats) continue // ไม่อยู่ในรายชื่อที่อนุมัติแล้ว → ไม่นับ
        if (!(r.kind in totals)) continue // กันค่าแปลกที่หลุดมาจาก DB
        stats[r.kind] += 1
        stats.total += 1
        totals[r.kind] += 1
    }

    const list = [...byUser.values()].filter(s => s.total > 0)
    list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'th'))

    return { people: list, totals }
}
