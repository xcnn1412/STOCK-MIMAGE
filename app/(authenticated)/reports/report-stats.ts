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

// ---------------------------------------------------------------------------
// ช่วงเวลา (ตั๋ว 02) — สัปดาห์เริ่มวันจันทร์ · เดือน/ปีตามปฏิทิน ค.ศ. ของ `today`
// คำนวณด้วย Date.UTC ล้วนแบบเดียวกับ nextDay() ใน page.tsx — ห้ามใช้ new Date(สตริง)
// ตรงๆ เพราะ timezone ของเครื่องจะเลื่อนวัน (ผลลัพธ์ต้องเท่ากันทั้ง server และ browser)
// ---------------------------------------------------------------------------

/** ช่วงเวลาที่ชิปบนหัวหน้าเลือกได้ */
export type StatPeriod = 'all' | 'week' | 'month' | 'year'

/** ลำดับชิปบนหน้าจอ */
export const STAT_PERIODS: readonly StatPeriod[] = ['all', 'week', 'month', 'year']

/** ป้ายชิปภาษาไทย */
export const STAT_PERIOD_LABELS_TH: Record<StatPeriod, string> = {
    all: 'ภาพรวม',
    week: 'สัปดาห์นี้',
    month: 'เดือนนี้',
    year: 'ปีนี้',
}

/** ช่วงวันแบบปิดหัวปิดท้าย (นับ from และ to ด้วย) รูปแบบ YYYY-MM-DD */
export interface DateRange {
    from: string
    to: string
}

/** YYYY-MM-DD → เวลา epoch ที่เที่ยงคืน UTC (คืน NaN ถ้ารูปแบบผิด) */
function ymdToUTC(ymd: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
    if (!m) return NaN
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** epoch UTC → YYYY-MM-DD */
function utcToYmd(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10)
}

const DAY_MS = 86_400_000

/**
 * ช่วงวันของ period ที่ครอบ `today` (YYYY-MM-DD)
 * — `'all'` คืน null (ไม่กรอง) · วันที่รูปแบบผิดก็คืน null เพื่อไม่ให้หน้าพัง
 * — สัปดาห์เริ่ม **วันจันทร์** ถึงวันอาทิตย์ (วันอาทิตย์อยู่สัปดาห์ที่เริ่มวันจันทร์ก่อนหน้า)
 * — เดือน/ปี = เดือน/ปีปฏิทินที่ `today` อยู่ (ครบเดือน/ครบปี ไม่ตัดที่วันนี้)
 */
export function periodRange(period: StatPeriod, today: string): DateRange | null {
    if (period === 'all') return null
    const base = ymdToUTC(today)
    if (Number.isNaN(base)) return null

    if (period === 'week') {
        // getUTCDay(): 0=อาทิตย์ … 6=เสาร์ → แปลงเป็น "ห่างจากวันจันทร์กี่วัน" (จันทร์=0, อาทิตย์=6)
        const sinceMonday = (new Date(base).getUTCDay() + 6) % 7
        const from = base - sinceMonday * DAY_MS
        return { from: utcToYmd(from), to: utcToYmd(from + 6 * DAY_MS) }
    }

    const d = new Date(base)
    const y = d.getUTCFullYear()
    if (period === 'month') {
        const mo = d.getUTCMonth()
        // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้ (ครอบปีอธิกสุรทินให้เอง)
        return { from: utcToYmd(Date.UTC(y, mo, 1)), to: utcToYmd(Date.UTC(y, mo + 1, 0)) }
    }
    return { from: utcToYmd(Date.UTC(y, 0, 1)), to: utcToYmd(Date.UTC(y, 11, 31)) }
}

/**
 * กรองแถวตามช่วงเวลา — เทียบสตริง YYYY-MM-DD ตรงๆ (เรียงตามตัวอักษร = เรียงตามวัน)
 * แถวที่ `date === null` (ไม่รู้วันที่อ้างอิง) นับ **เฉพาะใน 'all'** เพราะวางในช่วงไหนไม่ได้
 */
export function filterByPeriod(rows: StatRow[], period: StatPeriod, today: string): StatRow[] {
    const range = periodRange(period, today)
    if (!range) return rows
    return rows.filter(r => r.date !== null && r.date >= range.from && r.date <= range.to)
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
