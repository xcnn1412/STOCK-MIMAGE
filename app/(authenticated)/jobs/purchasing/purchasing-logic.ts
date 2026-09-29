// ตรรกะล้วนของ /jobs/purchasing (เช็กลิสต์จัดซื้อ) — สถานะ ความด่วน ความคืบหน้า เงิน ตัวกรอง บอร์ด
// ข้อความคัดลอก การตรวจข้อมูล สิทธิ์ลบ แถวของแผงเตือนหน้าแรก ใบเบิกที่ผูก และของหน้าจอ (ค่าชั่วคราว useOptimistic · สี · รูปแบบเงิน)
// ไม่มี React / ไม่มี I/O: ทุกอย่างเป็นฟังก์ชันของข้อมูล + "วันนี้" (YYYY-MM-DD เวลาไทย ผู้เรียกส่งเข้ามาเอง)
// จึง import ได้ทั้ง server action, server component และ client view
// สเปค: docs/specs/purchasing-checklist.md · ตรวจ: npx tsx "app/(authenticated)/jobs/purchasing/purchasing-logic.check.ts"

// วันที่แบบไทย (พ.ศ.) ของโมดูลค่าคอม — ไฟล์นั้นเป็นตรรกะล้วนทั้งไฟล์ (ไม่มี React / IO)
import { thaiDay, thaiEventRange } from '@/app/(authenticated)/sales-board/commission-logic'
// ใบเบิก (Finance): ชื่อ/สีของสถานะ และยอดของใบ — ค่าคงที่และฟังก์ชันล้วน (types.ts import จากไฟล์ 'use server' แค่ชนิดข้อมูล)
import { getClaimStatusColor, getClaimStatusLabel } from '@/app/(authenticated)/costs/types'
import { claimEffectiveAmount } from '@/app/(authenticated)/costs/lib/crm-cost-grouping'

// --- สถานะ / ประเภท ------------------------------------------------------------

/** สถานะ 4 ขั้นตามลำดับ — "เลื่อนขั้น" = ขั้นถัดไปในลำดับนี้ (เลือกขั้นไหนก็ได้ผ่านเมนู ถอยได้) */
export const PURCHASE_STATUSES = ['planning', 'purchasing', 'awaiting_delivery', 'done'] as const
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number]

export const STATUS_LABELS: Record<PurchaseStatus, string> = {
    planning: 'วางแผน',
    purchasing: 'กำลังจัดซื้อ',
    awaiting_delivery: 'รอจัดส่ง',
    done: 'เสร็จสิ้น',
}

export const PURCHASE_KINDS = ['buy', 'order', 'other'] as const
export type PurchaseKind = (typeof PURCHASE_KINDS)[number]

export const KIND_LABELS: Record<PurchaseKind, string> = {
    buy: 'ซื้อ',
    order: 'สั่ง',
    other: 'อื่นๆ',
}

/** ค่าที่ส่งมาเป็นสถานะจริงไหม (กันค่าที่ client ส่งมามั่ว) */
export function isPurchaseStatus(value: unknown): value is PurchaseStatus {
    return typeof value === 'string' && (PURCHASE_STATUSES as readonly string[]).includes(value)
}

export function isPurchaseKind(value: unknown): value is PurchaseKind {
    return typeof value === 'string' && (PURCHASE_KINDS as readonly string[]).includes(value)
}

/** ขั้นถัดไปของปุ่ม "เลื่อนขั้น" — เสร็จสิ้นแล้วไม่มีขั้นถัดไป (null = ไม่ต้องแสดงปุ่ม) */
export function nextStatus(status: PurchaseStatus): PurchaseStatus | null {
    const i = PURCHASE_STATUSES.indexOf(status)
    return i >= 0 && i < PURCHASE_STATUSES.length - 1 ? PURCHASE_STATUSES[i + 1] : null
}

// --- ชนิดข้อมูล (ตรงกับคอลัมน์ใน supabase/migrations/20260929_purchasing_checklist.sql) ---

/** รายการหนึ่งข้อ (purchase_items) — ราคาเป็นยอดของทั้งรายการ ไม่ใช่ต่อหน่วย · จำนวนเป็นข้อความอิสระ */
export interface PurchaseItem {
    id: string
    list_id: string
    title: string
    kind: PurchaseKind
    status: PurchaseStatus
    quantity: string | null
    est_price: number | null
    actual_price: number | null
    vendor: string | null
    link_url: string | null
    tracking_no: string | null
    assignee_id: string | null
    /** ต้องได้ของภายใน — ว่าง = ใช้วันอ้างอิงของเช็กลิสต์ */
    due_date: string | null
    note: string | null
    /** public URL ในบัคเก็ต purchase-attachments (สูงสุด 4 รูป) */
    images: string[]
    /** ใบเบิก (expense_claims) ที่รายการนี้ผูกอยู่ — null = ยังไม่ผูก · หนึ่งรายการผูกได้ใบเดียว */
    expense_claim_id: string | null
    sort_order: number
    status_changed_at: string | null
    status_changed_by: string | null
    done_at: string | null
    created_by: string | null
    created_at: string
    updated_at: string
}

/** คอลัมน์ของ PurchaseItem — ใช้ทั้ง data.ts และ actions.ts (แก้ interface ต้องแก้ตรงนี้ด้วย) */
export const PURCHASE_ITEM_COLUMNS =
    'id, list_id, title, kind, status, quantity, est_price, actual_price, vendor, link_url, tracking_no, assignee_id, due_date, note, images, expense_claim_id, sort_order, status_changed_at, status_changed_by, done_at, created_by, created_at, updated_at'

/** การ์ด CRM ที่เช็กลิสต์ผูกอยู่ — เฉพาะคอลัมน์ที่หน้านี้ใช้ */
export interface PurchaseLead {
    id: string
    customer_name: string | null
    event_location: string | null
    event_date: string | null // YYYY-MM-DD
    event_end_date: string | null // YYYY-MM-DD
    status: string | null
}

export const PURCHASE_LEAD_COLUMNS = 'id, customer_name, event_location, event_date, event_end_date, status'

/** ผลค้นการ์ด CRM ในหน้าต่างสร้างเช็กลิสต์ — list_id = งานนี้มีเช็กลิสต์แล้ว (กดแล้วเปิดใบเดิม) */
export interface PurchaseLeadOption extends PurchaseLead {
    list_id: string | null
}

/** เช็กลิสต์หนึ่งใบ + การ์ด CRM ที่ผูก (ถ้ามี) + รายการเรียงตาม sort_order แล้ว created_at */
export interface PurchaseList {
    id: string
    crm_lead_id: string | null
    /** ชื่อที่เก็บไว้ — ใบที่ผูกงานเก็บชื่อลูกค้า ณ ตอนสร้าง (หน้าจอใช้ listTitle()) */
    title: string
    note: string | null
    budget: number | null
    due_date: string | null
    owner_id: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    lead: PurchaseLead | null
    items: PurchaseItem[]
}

/** รายการหนึ่งข้อในชุดสำเร็จรูป (purchase_templates.items) */
export interface PurchaseTemplateItem {
    title: string
    kind: PurchaseKind
    quantity: string | null
    est_price: number | null
    vendor: string | null
    link_url: string | null
    note: string | null
}

export interface PurchaseTemplate {
    id: string
    name: string
    items: PurchaseTemplateItem[]
    created_by: string | null
    created_at: string
    updated_at: string
}

/** คนที่อนุมัติแล้วหนึ่งคน — ตัวเลือกผู้รับผิดชอบ / ชื่อในข้อความคัดลอก */
export interface PurchasePerson {
    id: string
    name: string
    nickname: string | null
    department: string | null
}

/** ผู้ใช้ที่กำลังดู — ตัดสินสิทธิ์ลบ ตัวกรอง "ของฉัน" และแผงเตือนหน้าแรก */
export interface Viewer {
    userId: string | null
    isAdmin: boolean
    department: string | null
}

/**
 * แผนกที่ดูแลเช็กลิสต์ทุกใบได้เหมือนแอดมิน (ลบได้ / เห็นแผงเตือนทุกใบ)
 * ค่าเดียวกับ COORDINATOR_DEPARTMENT ใน app/(authenticated)/jobs/actions.ts — ตัวนั้นอยู่ในไฟล์ 'use server'
 * และไม่ได้ export จึง import มาไม่ได้ (เปลี่ยนชื่อแผนกต้องแก้ทั้งสองที่)
 */
export const COORDINATOR_DEPARTMENT = 'ฝ่ายประสานงาน'

// --- วันที่ (สตริง YYYY-MM-DD ล้วน — คิดด้วย Date.UTC ไม่พึ่งโซนเวลาของเครื่องที่รัน) ---

const DAY_MS = 86_400_000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 'YYYY-MM-DD' ที่มีอยู่จริงในปฏิทิน ('2026-02-30' = ไม่ใช่) */
export function isValidDate(value: unknown): value is string {
    if (typeof value !== 'string') return false
    const m = DATE_RE.exec(value)
    if (!m) return false
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const t = new Date(Date.UTC(y, mo - 1, d))
    return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

const utcOf = (date: string) =>
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))

/** จำนวนวันจาก today ถึง date (ติดลบ = เลยมาแล้ว) */
const daysBetween = (today: string, date: string) => Math.round((utcOf(date) - utcOf(today)) / DAY_MS)

/** เลื่อนวันไป n วัน (ติดลบ = ย้อนหลัง) */
export function addDays(date: string, n: number): string {
    return new Date(utcOf(date) + n * DAY_MS).toISOString().slice(0, 10)
}

/** วันที่เวลาไทย (UTC+7 ไม่มี DST) ของเวลา ms — ผู้เรียกส่ง Date.now() เข้ามาเอง ไฟล์นี้จึงยังไม่อ่านนาฬิกา */
export function bangkokDate(ms: number): string {
    return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10)
}

// --- ชื่อ / วันอ้างอิง / ความด่วน ---------------------------------------------------

/** ชื่อที่แสดง — ผูกงานอยู่ใช้ชื่อลูกค้าจาก CRM (ค่าล่าสุด) ไม่งั้นใช้ชื่อที่เก็บไว้ในเช็กลิสต์ */
export function listTitle(list: Pick<PurchaseList, 'title' | 'lead'>): string {
    return list.lead?.customer_name?.trim() || list.title
}

/** วันอ้างอิงของเช็กลิสต์: วันงานจาก CRM → กำหนดของเช็กลิสต์ → ไม่มี */
export function listDate(list: Pick<PurchaseList, 'due_date' | 'lead'>): string | null {
    return list.lead?.event_date || list.due_date || null
}

/** กำหนดของรายการ: กำหนดของรายการเอง ถ้าว่างใช้วันอ้างอิงของเช็กลิสต์ */
export function effectiveDue(
    item: Pick<PurchaseItem, 'due_date'>,
    list: Pick<PurchaseList, 'due_date' | 'lead'>
): string | null {
    return item.due_date || listDate(list)
}

/** ความด่วน: เลยกำหนด / อีก 0–3 วัน / อีก 4–7 วัน (ไกลกว่านั้นหรือไม่มีกำหนด = null) */
export type Urgency = 'overdue' | 'urgent' | 'soon'

/** ลำดับความแรง (น้อย = ด่วนกว่า) — ไม่มีความด่วนอยู่ท้ายสุด */
const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, urgent: 1, soon: 2 }
const rankOf = (u: Urgency | null) => (u ? URGENCY_RANK[u] : 3)

/** เกณฑ์เดียวกับแผง "หน้าที่ยังไม่ครบ" (components/dashboard-alerts/duty-warnings.ts) */
function urgencyOfDays(days: number): Urgency | null {
    if (days < 0) return 'overdue'
    if (days <= 3) return 'urgent'
    if (days <= 7) return 'soon'
    return null
}

/** ความด่วนของรายการ — เสร็จแล้ว (แม้เลยกำหนด) หรือไม่มีกำหนด = ไม่มีความด่วน */
export function urgencyOf(
    item: Pick<PurchaseItem, 'status' | 'due_date'>,
    list: Pick<PurchaseList, 'due_date' | 'lead'>,
    today: string
): Urgency | null {
    if (item.status === 'done') return null
    const due = effectiveDue(item, list)
    return due ? urgencyOfDays(daysBetween(today, due)) : null
}

/** ความด่วนที่แรงที่สุดในเช็กลิสต์ (ป้ายบนการ์ด / กางการ์ดเอง) */
export function listUrgency(list: PurchaseList, today: string): Urgency | null {
    let worst: Urgency | null = null
    for (const item of list.items) {
        const u = urgencyOf(item, list, today)
        if (rankOf(u) < rankOf(worst)) worst = u
    }
    return worst
}

/** ข้อความนับถอยหลัง: 'เลยมา 2 วัน' / 'วันนี้' / 'พรุ่งนี้' / 'อีก 3 วัน' */
export function countdownLabel(date: string, today: string): string {
    const days = daysBetween(today, date)
    if (days < 0) return `เลยมา ${-days} วัน`
    if (days === 0) return 'วันนี้'
    if (days === 1) return 'พรุ่งนี้'
    return `อีก ${days} วัน`
}

// --- ความคืบหน้า / เงิน -------------------------------------------------------------

/** เช็กลิสต์เสร็จ = มีอย่างน้อย 1 รายการ และทุกรายการเสร็จสิ้น (ใบว่าง = ยังไม่เสร็จ) */
export function isListFinished(list: Pick<PurchaseList, 'items'>): boolean {
    return list.items.length > 0 && list.items.every(i => i.status === 'done')
}

export interface Progress {
    total: number
    done: number
    /** ปัดลง — ไม่ขึ้น 100% จนกว่าจะเสร็จครบจริง */
    percent: number
    byStatus: Record<PurchaseStatus, number>
}

export function progressOf(items: Pick<PurchaseItem, 'status'>[]): Progress {
    const byStatus: Record<PurchaseStatus, number> = { planning: 0, purchasing: 0, awaiting_delivery: 0, done: 0 }
    for (const item of items) byStatus[item.status]++
    const total = items.length
    return { total, done: byStatus.done, percent: total ? Math.floor((byStatus.done / total) * 100) : 0, byStatus }
}

export interface Money {
    /** งบรวม = ผลรวม est_price (ช่องว่างนับ 0) */
    est: number
    /** จ่ายจริงรวม = ผลรวม actual_price (ช่องว่างนับ 0) */
    actual: number
    /** จำนวนรายการที่เสร็จแล้วแต่ยังไม่ใส่ยอดจ่ายจริง */
    missingActual: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function moneyOf(items: Pick<PurchaseItem, 'status' | 'est_price' | 'actual_price'>[]): Money {
    let est = 0
    let actual = 0
    let missingActual = 0
    for (const item of items) {
        est += item.est_price ?? 0
        actual += item.actual_price ?? 0
        if (item.status === 'done' && item.actual_price == null) missingActual++
    }
    return { est: round2(est), actual: round2(actual), missingActual }
}

// --- เรียง / กรอง / บอร์ด ---------------------------------------------------------

/** วันน้อยก่อน · ไม่มีวันไว้ท้าย */
function compareDates(a: string | null, b: string | null): number {
    if (a === b) return 0
    if (!a) return 1
    if (!b) return -1
    return a < b ? -1 : 1
}

/**
 * เรียงเช็กลิสต์: ยังไม่เสร็จก่อน → วันอ้างอิงเร็วสุดก่อน (เลยมาแล้วจึงขึ้นก่อนเอง · ไม่มีวันไว้ท้าย) → สร้างล่าสุดก่อน
 * คืน array ใหม่ ไม่แก้ของเดิม · รายการในใบคงลำดับ sort_order เดิม (ไม่ย้ายรายการที่เสร็จลงล่าง)
 */
export function sortLists(lists: PurchaseList[]): PurchaseList[] {
    return [...lists].sort((a, b) =>
        Number(isListFinished(a)) - Number(isListFinished(b)) ||
        compareDates(listDate(a), listDate(b)) ||
        Date.parse(b.created_at) - Date.parse(a.created_at))
}

export interface ListFilter {
    status: PurchaseStatus | 'all'
    /** เฉพาะรายการที่ผู้รับผิดชอบรายการ = ผู้ใช้คนนี้ */
    mine: boolean
    query: string
    /** false = ซ่อนเช็กลิสต์ที่เสร็จครบแล้ว */
    showFinished: boolean
}

/**
 * ตัวกรองทำที่ระดับรายการ — คืนเช็กลิสต์ที่ยังเหลือรายการตรงเงื่อนไข โดย items = เฉพาะรายการที่ตรง
 * (ความคืบหน้า/เงินบนการ์ดให้คิดจากเช็กลิสต์ตัวเต็ม ไม่ใช่จากผลลัพธ์นี้)
 * - ไม่มีตัวกรอง (ทุกสถานะ / ไม่เลือก "ของฉัน" / ไม่มีคำค้น) → ทุกใบตามเดิม รวมใบว่าง
 * - มีตัวกรอง → ใบที่ไม่เหลือรายการตรงเงื่อนไขถูกซ่อน (ใบว่างจึงหายไปด้วย)
 * - คำค้นตรงชื่อเช็กลิสต์หรือสถานที่ = ทุกรายการในใบนั้นตรงคำค้น · ไม่งั้นดูชื่อรายการและร้าน
 */
export function filterLists(lists: PurchaseList[], filter: ListFilter, viewer: Viewer): PurchaseList[] {
    const q = filter.query.trim().toLowerCase()
    const active = filter.status !== 'all' || filter.mine || q !== ''
    const has = (text: string | null | undefined) => !!text && text.toLowerCase().includes(q)

    const out: PurchaseList[] = []
    for (const list of lists) {
        if (!filter.showFinished && isListFinished(list)) continue
        if (!active) {
            out.push(list)
            continue
        }
        const listHit = q === '' || has(listTitle(list)) || has(list.title) || has(list.lead?.event_location)
        const items = list.items.filter(item =>
            (filter.status === 'all' || item.status === filter.status) &&
            (!filter.mine || (!!viewer.userId && item.assignee_id === viewer.userId)) &&
            (listHit || has(item.title) || has(item.vendor)))
        if (items.length > 0) out.push({ ...list, items })
    }
    return out
}

/** การ์ดหนึ่งใบในมุมมองบอร์ด — พกเช็กลิสต์ต้นทางมาด้วย */
export interface BoardCard {
    item: PurchaseItem
    listId: string
    listTitle: string
    due: string | null
    urgency: Urgency | null
}

/**
 * มุมมอง "ตามสถานะ": รายการของทุกเช็กลิสต์แยกคอลัมน์ตามสถานะ
 * ในคอลัมน์: เลยกำหนด → ด่วน → ใกล้ถึง → ไม่มีความด่วน แล้วกำหนดเร็วสุดก่อน (ไม่มีกำหนดไว้ท้าย)
 */
export function boardColumns(lists: PurchaseList[], today: string): Record<PurchaseStatus, BoardCard[]> {
    const columns: Record<PurchaseStatus, BoardCard[]> = { planning: [], purchasing: [], awaiting_delivery: [], done: [] }
    for (const list of lists) {
        const title = listTitle(list)
        for (const item of list.items) {
            columns[item.status].push({
                item,
                listId: list.id,
                listTitle: title,
                due: effectiveDue(item, list),
                urgency: urgencyOf(item, list, today),
            })
        }
    }
    for (const status of PURCHASE_STATUSES) {
        columns[status].sort((a, b) => rankOf(a.urgency) - rankOf(b.urgency) || compareDates(a.due, b.due))
    }
    return columns
}

// --- ข้อความคัดลอก (ส่งต่อใน LINE) ----------------------------------------------------

/**
 * ข้อความสำหรับส่งต่อใน LINE:
 *   🛒 ชื่อเช็กลิสต์
 *   📅 วันงาน … (อีก 3 วัน) · 📍 สถานที่     ← เฉพาะเมื่อมีวันหรือสถานที่
 *   ความคืบหน้า 1/3 รายการ (33%)
 *   (บรรทัดว่าง)
 *   ✅ 1. ชื่อ (จำนวน) — สถานะ · ผู้รับผิดชอบ   ← ✅ เสร็จแล้ว · ⬜ ยังไม่เสร็จ
 * `names` = id ผู้ใช้ → ชื่อที่แสดง
 */
export function copyText(list: PurchaseList, today: string, names: Record<string, string>): string {
    const lines = [`🛒 ${listTitle(list)}`]

    const meta: string[] = []
    const date = listDate(list)
    if (date) {
        const when = list.lead?.event_date
            ? `วันงาน ${thaiEventRange(list.lead.event_date, list.lead.event_end_date)}`
            : `กำหนด ${thaiDay(date)}`
        meta.push(`📅 ${when} (${countdownLabel(date, today)})`)
    }
    if (list.lead?.event_location) meta.push(`📍 ${list.lead.event_location}`)
    if (meta.length > 0) lines.push(meta.join(' · '))

    const progress = progressOf(list.items)
    lines.push(`ความคืบหน้า ${progress.done}/${progress.total} รายการ (${progress.percent}%)`, '')

    if (list.items.length === 0) lines.push('ยังไม่มีรายการ')
    list.items.forEach((item, i) => {
        const mark = item.status === 'done' ? '✅' : '⬜'
        const quantity = item.quantity ? ` (${item.quantity})` : ''
        const who = item.assignee_id && names[item.assignee_id] ? ` · ${names[item.assignee_id]}` : ''
        lines.push(`${mark} ${i + 1}. ${item.title}${quantity} — ${STATUS_LABELS[item.status]}${who}`)
    })
    return lines.join('\n')
}

// --- ตรวจข้อมูลที่ผู้ใช้ส่งมา (server ตรวจทุกครั้ง หน้าจอใช้ตัวเดียวกันเตือนก่อนส่งได้) ---------

/** ขีดจำกัดตามสเปค (หัวข้อ "ขีดจำกัดข้อมูล") */
export const MAX_ITEMS_PER_ADD = 50
export const MAX_TEMPLATE_ITEMS = 50
export const MAX_MONEY = 99_999_999

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string }

const pass = <T>(value: T): { ok: true; value: T } => ({ ok: true, value })
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value)

/** จำนวนตัวอักษรแบบเดียวกับ char_length ของ Postgres (นับ code point ไม่ใช่หน่วย UTF-16) */
function tooLong(text: string, max: number): boolean {
    if (text.length > max * 2) return true // เร็ว: ตัวอักษรหนึ่งตัวกินไม่เกิน 2 หน่วย UTF-16
    return [...text].length > max
}

const fmtLimit = (n: number) => n.toLocaleString('en-US')

function requiredText(raw: unknown, label: string, max: number): Validated<string> {
    if (typeof raw !== 'string' || !raw.trim()) return fail(`กรุณาใส่${label}`)
    const text = raw.trim()
    return tooLong(text, max) ? fail(`${label}ยาวเกิน ${fmtLimit(max)} ตัวอักษร`) : pass(text)
}

/** ข้อความไม่บังคับ: ว่าง/ช่องว่างล้วน → null */
function optionalText(raw: unknown, label: string, max: number): Validated<string | null> {
    if (raw == null) return pass(null)
    if (typeof raw !== 'string') return fail(`${label}ไม่ถูกต้อง`)
    const text = raw.trim()
    if (!text) return pass(null)
    return tooLong(text, max) ? fail(`${label}ยาวเกิน ${fmtLimit(max)} ตัวอักษร`) : pass(text)
}

/**
 * แปลงยอดเงินจากช่องกรอก — รับตัวเลข หรือข้อความที่มีจุลภาค/ช่องว่าง ('1,250.50')
 * ว่าง → null · อ่านไม่ออก → NaN (ให้ตัวตรวจแยก "ไม่ได้กรอก" กับ "กรอกผิด" ได้)
 */
export function parseMoney(raw: unknown): number | null {
    if (raw == null) return null
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
    if (typeof raw !== 'string') return NaN
    const text = raw.replace(/[,\s]/g, '')
    if (!text) return null
    return /^-?(\d+(\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN
}

function money(raw: unknown, label: string): Validated<number | null> {
    const n = parseMoney(raw)
    if (n === null) return pass(null)
    if (Number.isNaN(n)) return fail(`${label}ต้องเป็นตัวเลข`)
    if (n < 0 || n > MAX_MONEY) return fail(`${label}ต้องอยู่ระหว่าง 0 ถึง ${fmtLimit(MAX_MONEY)} บาท`)
    return pass(round2(n))
}

function dateField(raw: unknown, label: string): Validated<string | null> {
    if (raw == null || raw === '') return pass(null)
    return isValidDate(raw) ? pass(raw) : fail(`${label}ไม่ถูกต้อง`)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** id รูป uuid ไหม — ทุก id ที่ client ส่งมาต้องผ่านตัวนี้ก่อนถึงฐานข้อมูล */
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)

function idField(raw: unknown, label: string): Validated<string | null> {
    if (raw == null || raw === '') return pass(null)
    return isUuid(raw) ? pass(raw.toLowerCase()) : fail(`${label}ไม่ถูกต้อง`)
}

function linkField(raw: unknown): Validated<string | null> {
    const checked = optionalText(raw, 'ลิงก์', 500)
    if (!checked.ok || checked.value === null) return checked
    return /^https?:\/\//i.test(checked.value) ? checked : fail('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://')
}

/** กฎของแต่ละช่อง: ค่าดิบ → ค่าที่ตรวจแล้ว (ช่องที่ไม่ได้ส่งมาได้ค่าดิบ undefined) */
type FieldRules<T> = { [K in keyof T]-?: (raw: unknown) => Validated<T[K]> }

function validateFields<T>(input: unknown, rules: FieldRules<T>, partial: boolean): Validated<Partial<T>> {
    if (!isRecord(input)) return fail('ข้อมูลไม่ถูกต้อง')
    const out: Partial<T> = {}
    for (const key of Object.keys(rules) as (keyof T & string)[]) {
        // patch: แตะเฉพาะช่องที่ส่งมา · ช่องที่ไม่รู้จัก (เช่น status, id) ถูกทิ้งเสมอ
        if (partial && !Object.prototype.hasOwnProperty.call(input, key)) continue
        const checked = rules[key](input[key])
        if (!checked.ok) return checked
        out[key] = checked.value
    }
    return pass(out)
}

/** รายการหนึ่งข้อที่ตรวจแล้ว — พร้อมเขียนลง purchase_items */
export interface PurchaseItemInput {
    title: string
    kind: PurchaseKind
    quantity: string | null
    est_price: number | null
    actual_price: number | null
    vendor: string | null
    link_url: string | null
    tracking_no: string | null
    assignee_id: string | null
    due_date: string | null
    note: string | null
}

/** รายการที่หน้าจอส่งมา — ช่องที่ไม่ส่ง = ค่าเริ่มต้น · ราคารับเป็นข้อความจากช่องกรอกได้ */
export interface PurchaseItemDraft {
    title: string
    kind?: PurchaseKind
    quantity?: string | null
    est_price?: number | string | null
    actual_price?: number | string | null
    vendor?: string | null
    link_url?: string | null
    tracking_no?: string | null
    assignee_id?: string | null
    due_date?: string | null
    note?: string | null
}

export type PurchaseItemPatch = Partial<PurchaseItemDraft>

const ITEM_RULES: FieldRules<PurchaseItemInput> = {
    title: raw => requiredText(raw, 'ชื่อรายการ', 200),
    kind: raw => (raw == null || raw === '' ? pass('buy' as const) : isPurchaseKind(raw) ? pass(raw) : fail('ประเภทรายการไม่ถูกต้อง')),
    quantity: raw => optionalText(raw, 'จำนวน', 60),
    est_price: raw => money(raw, 'งบ'),
    actual_price: raw => money(raw, 'ยอดจ่ายจริง'),
    vendor: raw => optionalText(raw, 'ชื่อร้าน', 120),
    link_url: linkField,
    tracking_no: raw => optionalText(raw, 'เลขพัสดุ', 80),
    assignee_id: raw => idField(raw, 'ผู้รับผิดชอบ'),
    due_date: raw => dateField(raw, 'วันที่ต้องได้ของ'),
    note: raw => optionalText(raw, 'หมายเหตุ', 1000),
}

/**
 * ตรวจรายการหนึ่งข้อตามขีดจำกัดในสเปค (ตัดช่องว่างหัวท้าย · ช่องว่าง → null)
 * 'patch' = ตรวจและคืนเฉพาะช่องที่ส่งมา (ใช้กับ updatePurchaseItem)
 */
export function validateItemInput(input: unknown): Validated<PurchaseItemInput>
export function validateItemInput(input: unknown, mode: 'patch'): Validated<Partial<PurchaseItemInput>>
export function validateItemInput(input: unknown, mode?: 'patch'): Validated<Partial<PurchaseItemInput>> {
    return validateFields(input, ITEM_RULES, mode === 'patch')
}

/** เช็กลิสต์ที่ตรวจแล้ว */
export interface PurchaseListInput {
    title: string
    note: string | null
    budget: number | null
    due_date: string | null
    owner_id: string | null
}

/** ช่องที่แก้ได้ของเช็กลิสต์ — ชื่อแก้ได้เฉพาะใบที่ไม่ผูกงาน (server ตรวจ) */
export interface PurchaseListPatch {
    title?: string
    note?: string | null
    budget?: number | string | null
    due_date?: string | null
    owner_id?: string | null
}

/** อาร์กิวเมนต์ของ createPurchaseList — ใส่ leadId = ผูกงาน · ไม่ใส่ = เช็กลิสต์ทั่วไป (ต้องมีชื่อ) */
export interface CreatePurchaseListInput {
    leadId?: string | null
    title?: string | null
    dueDate?: string | null
    note?: string | null
    templateId?: string | null
}

const LIST_RULES: FieldRules<PurchaseListInput> = {
    title: raw => requiredText(raw, 'ชื่อเช็กลิสต์', 120),
    note: raw => optionalText(raw, 'หมายเหตุ', 1000),
    budget: raw => money(raw, 'งบ'),
    due_date: raw => dateField(raw, 'กำหนดวัน'),
    owner_id: raw => idField(raw, 'ผู้รับผิดชอบเช็กลิสต์'),
}

export function validateListInput(input: unknown): Validated<PurchaseListInput>
export function validateListInput(input: unknown, mode: 'patch'): Validated<Partial<PurchaseListInput>>
export function validateListInput(input: unknown, mode?: 'patch'): Validated<Partial<PurchaseListInput>> {
    return validateFields(input, LIST_RULES, mode === 'patch')
}

/** ชุดสำเร็จรูปที่ตรวจแล้ว */
export interface PurchaseTemplateInput {
    name: string
    items: PurchaseTemplateItem[]
}

/** อาร์กิวเมนต์ของ savePurchaseTemplate — มี id = แก้ชุดเดิม · ไม่มี = สร้างใหม่ */
export interface PurchaseTemplateDraft {
    id?: string | null
    name: string
    items: PurchaseItemDraft[]
}

/** ชุดสำเร็จรูป: ชื่อ 1–80 ตัวอักษร · 1–50 รายการ · แต่ละรายการตรวจแบบเดียวกับรายการในเช็กลิสต์ */
export function validateTemplateInput(input: unknown): Validated<PurchaseTemplateInput> {
    if (!isRecord(input)) return fail('ข้อมูลชุดสำเร็จรูปไม่ถูกต้อง')
    const name = requiredText(input.name, 'ชื่อชุดสำเร็จรูป', 80)
    if (!name.ok) return name
    const raw = input.items
    if (!Array.isArray(raw) || raw.length === 0) return fail('ชุดสำเร็จรูปต้องมีอย่างน้อย 1 รายการ')
    if (raw.length > MAX_TEMPLATE_ITEMS) return fail(`ชุดสำเร็จรูปมีได้ไม่เกิน ${MAX_TEMPLATE_ITEMS} รายการ`)

    const items: PurchaseTemplateItem[] = []
    for (let i = 0; i < raw.length; i++) {
        const checked = validateItemInput(raw[i])
        if (!checked.ok) return fail(`รายการที่ ${i + 1}: ${checked.error}`)
        const { title, kind, quantity, est_price, vendor, link_url, note } = checked.value
        items.push({ title, kind, quantity, est_price, vendor, link_url, note })
    }
    return pass({ name: name.value, items })
}

/** ข้อความที่วางมาหลายบรรทัด → ชื่อรายการ (ตัดช่องว่างหัวท้าย ทิ้งบรรทัดว่าง) */
export function splitLines(text: string): string[] {
    return text
        .split(/\r\n|\r|\n/)
        .map(line => line.trim())
        .filter(Boolean)
}

/**
 * คำค้นการ์ด CRM → ข้อความที่ใส่ใน filter or() ของ PostgREST ได้อย่างปลอดภัย
 * ตัด , ( ) ที่แยกเงื่อนไข · % * ที่เป็น wildcard · \ " ที่ใช้ครอบ/หลีกค่า — แล้วตัดเหลือ 80 ตัวอักษร
 */
export function cleanSearchQuery(raw: unknown): string {
    if (typeof raw !== 'string') return ''
    const text = raw.replace(/[,()%*\\"]/g, '').trim()
    return [...text].slice(0, 80).join('').trim()
}

// --- รูปแนบ -----------------------------------------------------------------

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_IMAGES_PER_ITEM = 4
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * ตรวจรูปก่อนอัปโหลด (ชนิด ขนาด และจำนวนรวมกับรูปที่มีอยู่) — ผ่าน = null
 * server ตรวจก่อนอัปโหลดไฟล์แรก หน้าจอใช้ตัวเดียวกันเตือนก่อนส่งได้
 */
export function imageFilesError(files: { type: string; size: number }[], existing: number): string | null {
    if (files.length === 0) return 'กรุณาเลือกรูปที่จะแนบ'
    if (existing + files.length > MAX_IMAGES_PER_ITEM) return `แนบรูปได้สูงสุด ${MAX_IMAGES_PER_ITEM} รูปต่อรายการ`
    for (const file of files) {
        if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return 'แนบได้เฉพาะรูป JPG, PNG หรือ WEBP'
        if (file.size <= 0) return 'ไฟล์รูปว่างเปล่า กรุณาเลือกใหม่'
        if (file.size > MAX_IMAGE_BYTES) return 'รูปต้องมีขนาดไม่เกิน 5MB ต่อรูป'
    }
    return null
}

// --- สิทธิ์ลบ -----------------------------------------------------------------

/**
 * ลบเช็กลิสต์ / รายการ / ชุดสำเร็จรูป ได้ไหม — คนสร้างสิ่งนั้น, ผู้รับผิดชอบเช็กลิสต์, แอดมิน, ฝ่ายประสานงาน
 * ฟังก์ชันเดียวใช้ทั้งซ่อนปุ่มบนหน้าจอและบังคับจริงใน server action
 * รายการ: createdBy = คนสร้างรายการ, ownerId = ผู้รับผิดชอบเช็กลิสต์ของใบนั้น · ชุดสำเร็จรูป: ownerId = null
 */
export function canDelete(viewer: Viewer, target: { createdBy: string | null; ownerId: string | null }): boolean {
    if (viewer.isAdmin || viewer.department === COORDINATOR_DEPARTMENT) return true
    if (!viewer.userId) return false
    return target.createdBy === viewer.userId || target.ownerId === viewer.userId
}

// --- แผงเตือนหน้าแรก ---------------------------------------------------------------

/** หนึ่งแถวของการ์ด "ของยังไม่ครบ — ใกล้วันงาน" — serialize ได้ทั้งก้อน (ส่งจาก server เข้า client ได้ตรงๆ) */
export interface PurchaseAlertRow {
    listId: string
    title: string
    /** สถานที่จัดงาน (ว่างได้) */
    subtitle: string
    /** กำหนดของรายการค้างที่เร็วที่สุดในใบ — ความแรงและนับถอยหลังคิดจากวันนี้ */
    date: string
    severity: Urgency
    countdown: string
    /** จำนวนรายการที่ยังไม่เสร็จ */
    outstanding: number
    /** จำนวนรายการทุกข้อในใบแยกตามสถานะ (รวมที่เสร็จแล้ว) */
    byStatus: Record<PurchaseStatus, number>
}

/** เห็นเช็กลิสต์นี้ในแผงเตือนไหม: แอดมิน, ฝ่ายประสานงาน, คนสร้าง/ผู้รับผิดชอบเช็กลิสต์, ผู้รับผิดชอบรายการที่ยังค้าง */
function canSeeAlert(list: PurchaseList, viewer: Viewer): boolean {
    if (viewer.isAdmin || viewer.department === COORDINATOR_DEPARTMENT) return true
    if (!viewer.userId) return false
    if (list.created_by === viewer.userId || list.owner_id === viewer.userId) return true
    return list.items.some(item => item.status !== 'done' && item.assignee_id === viewer.userId)
}

/**
 * แถวแผงเตือนหน้าแรก: เช็กลิสต์ที่มีรายการค้างซึ่งมีความด่วน และผู้ใช้คนนี้เกี่ยวข้อง
 * วัน/ความแรง/นับถอยหลัง = ของรายการค้างที่กำหนดเร็วสุด (จึงแรงสุดในใบด้วย)
 * เรียง: เลยกำหนด → ด่วน → ใกล้ถึง แล้ววันเร็วสุดก่อน
 */
export function purchaseAlerts(lists: PurchaseList[], viewer: Viewer, today: string): PurchaseAlertRow[] {
    const rows: PurchaseAlertRow[] = []
    for (const list of lists) {
        if (!canSeeAlert(list, viewer)) continue

        let date: string | null = null
        for (const item of list.items) {
            const due = effectiveDue(item, list)
            if (!due || !urgencyOf(item, list, today)) continue
            if (!date || due < date) date = due
        }
        const severity = date ? urgencyOfDays(daysBetween(today, date)) : null
        if (!date || !severity) continue

        const progress = progressOf(list.items)
        rows.push({
            listId: list.id,
            title: listTitle(list),
            subtitle: list.lead?.event_location || '',
            date,
            severity,
            countdown: countdownLabel(date, today),
            outstanding: progress.total - progress.done,
            byStatus: progress.byStatus,
        })
    }
    return rows.sort((a, b) =>
        URGENCY_RANK[a.severity] - URGENCY_RANK[b.severity] ||
        a.date.localeCompare(b.date) ||
        a.title.localeCompare(b.title, 'th'))
}

// --- แถวดิบจากฐานข้อมูล → ชนิดข้อมูลที่เชื่อถือได้ (ใช้ทั้ง data.ts และ actions.ts) ---------------

/** NUMERIC อาจมาเป็นข้อความ — แปลงเป็น number (อ่านไม่ออก = null) */
const numOrNull = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 10) : null)

export function toPurchaseItem(row: Record<string, unknown>): PurchaseItem {
    return {
        id: String(row.id),
        list_id: String(row.list_id),
        title: String(row.title ?? ''),
        kind: isPurchaseKind(row.kind) ? row.kind : 'buy',
        status: isPurchaseStatus(row.status) ? row.status : 'planning',
        quantity: textOrNull(row.quantity),
        est_price: numOrNull(row.est_price),
        actual_price: numOrNull(row.actual_price),
        vendor: textOrNull(row.vendor),
        link_url: textOrNull(row.link_url),
        tracking_no: textOrNull(row.tracking_no),
        assignee_id: textOrNull(row.assignee_id),
        due_date: dateOrNull(row.due_date),
        note: textOrNull(row.note),
        images: Array.isArray(row.images) ? row.images.filter((u): u is string => typeof u === 'string') : [],
        expense_claim_id: textOrNull(row.expense_claim_id),
        sort_order: Number(row.sort_order) || 0,
        status_changed_at: textOrNull(row.status_changed_at),
        status_changed_by: textOrNull(row.status_changed_by),
        done_at: textOrNull(row.done_at),
        created_by: textOrNull(row.created_by),
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
    }
}

/** jsonb ของชุดสำเร็จรูป → รายการที่อ่านได้ (ข้อที่ไม่มีชื่อถูกทิ้ง — แก้มือในฐานข้อมูลได้ จึงไม่เชื่อรูปแบบ) */
export function toPurchaseTemplate(row: Record<string, unknown>): PurchaseTemplate {
    const raw = Array.isArray(row.items) ? row.items : []
    const items: PurchaseTemplateItem[] = []
    for (const entry of raw) {
        if (!isRecord(entry) || typeof entry.title !== 'string' || !entry.title.trim()) continue
        items.push({
            title: entry.title.trim(),
            kind: isPurchaseKind(entry.kind) ? entry.kind : 'buy',
            quantity: textOrNull(entry.quantity),
            est_price: numOrNull(entry.est_price),
            vendor: textOrNull(entry.vendor),
            link_url: textOrNull(entry.link_url),
            note: textOrNull(entry.note),
        })
    }
    return {
        id: String(row.id),
        name: String(row.name ?? ''),
        items,
        created_by: textOrNull(row.created_by),
        created_at: String(row.created_at ?? ''),
        updated_at: String(row.updated_at ?? ''),
    }
}

// --- ใบเบิก (expense_claims) ที่รายการผูกอยู่ — สเปคหัวข้อ "ผูกใบเบิก" ------------------------------
// ต้นทุนของงานยังมาจากใบเบิกทางเดียว (Finance → Costs) — การผูกแค่บอกว่ารายการไหนเบิกด้วยใบไหน ไม่ส่งยอดเข้าต้นทุน

/** ผูกได้ครั้งละกี่รายการ (หน้าต่าง "ผูกใบเบิกกับหลายรายการ" + server ตรวจซ้ำ) */
export const MAX_ITEMS_PER_LINK = 50

/** ประเภทใบเบิกที่ผูกได้ — ไม่รวมเอกสารวงเงินสดย่อย (petty_cash) · ค่าเดียวกับ CLAIM_TYPES ใน costs/types.ts */
export const LINKABLE_CLAIM_TYPES = ['event', 'other', 'advance'] as const

/** ใบเบิกที่ถูกปฏิเสธ/ยกเลิกแล้ว — ผูกเพิ่มไม่ได้ · ใบที่ผูกไว้ก่อนหน้านั้นยังผูกอยู่ (หน้าจอเน้นสถานะให้เห็น) */
export function isVoidClaimStatus(status: string | null | undefined): boolean {
    return status === 'rejected' || status === 'cancelled'
}

/** ผูกกับรายการจัดซื้อได้ไหม: ประเภท event / other / advance ที่สถานะไม่ใช่ rejected และ cancelled */
export function isLinkableClaim(claim: { claim_type: unknown; status: unknown }): boolean {
    return (
        typeof claim.claim_type === 'string' &&
        (LINKABLE_CLAIM_TYPES as readonly string[]).includes(claim.claim_type) &&
        typeof claim.status === 'string' &&
        claim.status !== '' &&
        !isVoidClaimStatus(claim.status)
    )
}

/**
 * เห็นชื่อ ยอด และยอดรวมของรายการที่ผูก — และผูกรายการกับใบนั้นได้ — ไหม: แอดมิน หรือผู้เบิกของใบนั้น
 * (กติกาเดียวกับ Finance: ไม่ใช่แอดมินเห็นเฉพาะใบเบิกของตัวเอง) · ไม่รู้ว่าใครเบิก = ไม่ใช่ของเรา
 */
export function canSeeClaim(viewer: Pick<Viewer, 'userId' | 'isAdmin'>, submittedBy: string | null | undefined): boolean {
    if (viewer.isAdmin) return true
    return !!viewer.userId && !!submittedBy && submittedBy === viewer.userId
}

/** ยอดของใบเบิกจากแถวดิบ = claimEffectiveAmount (ใบทดลองจ่ายที่คืนเงินแล้วใช้ยอดที่ใช้จริง) */
export function claimAmountOf(row: Record<string, unknown>): number {
    // claimEffectiveAmount อ่านแค่ 4 ช่องนี้ — id / job_event_id ใส่ให้ครบชนิดเท่านั้น
    return round2(
        claimEffectiveAmount({
            id: String(row.id ?? ''),
            job_event_id: null,
            claim_type: textOrNull(row.claim_type),
            status: textOrNull(row.status),
            amount: numOrNull(row.amount),
            actual_spent_amount: numOrNull(row.actual_spent_amount),
        })
    )
}

/** ชื่อสถานะใบเบิกภาษาไทย ชุดเดียวกับหน้าใบเบิก — สถานะที่ไม่รู้จักแสดงค่าดิบ */
const claimStatusLabel = (status: string) => getClaimStatusLabel(status, 'th') || 'ไม่ทราบสถานะ'

/**
 * ใบเบิกที่รายการผูกอยู่ ตามที่ผู้ใช้คนนี้เห็นได้ — สร้างด้วย toPurchaseClaim ฝั่ง server เท่านั้น
 * ทุกคนที่เห็นเช็กลิสต์: เลขที่ สถานะ จำนวนรายการที่ผูก · แอดมิน/ผู้เบิก (visible): ชื่อ ยอด ยอดจ่ายจริงรวมด้วย
 */
export interface PurchaseClaim {
    id: string
    claim_number: string
    /** ค่าดิบของ expense_claims.status */
    status: string
    /** ชื่อสถานะภาษาไทย (สถานะที่ไม่รู้จัก = ค่าดิบ) */
    status_label: string
    /** สีของสถานะ (hex ชุดเดียวกับหน้าใบเบิก) — ส่วนเสริม หน้าจอเขียนชื่อสถานะเสมอ */
    status_color: string
    /** แอดมินหรือผู้เบิก — false = title / amount / linked_actual ถูกตัดทิ้งตั้งแต่ server (null) */
    visible: boolean
    title: string | null
    /** ยอดของใบเบิก (claimEffectiveAmount) */
    amount: number | null
    /** จำนวนรายการจัดซื้อที่ผูกกับใบนี้ — นับทุกเช็กลิสต์ในฐานข้อมูล ไม่ใช่เฉพาะที่หน้าโหลดมา */
    linked_items: number
    /** ผลรวม "จ่ายจริง" ของทุกรายการที่ผูกกับใบนี้ (ช่องว่างนับ 0) */
    linked_actual: number | null
}

/** รายการที่ผูกกับใบเบิกหนึ่งใบ — นับจากทุกเช็กลิสต์ในฐานข้อมูล */
export interface ClaimLinkStats {
    linked_items: number
    linked_actual: number
}

/**
 * แถว expense_claims ดิบ → PurchaseClaim ของผู้ใช้คนนี้
 * ไม่ใช่แอดมินและไม่ใช่ผู้เบิก = ชื่อ ยอด และยอดรวมของรายการที่ผูกเป็น null — ข้อมูลนั้นไม่ออกจาก server
 */
export function toPurchaseClaim(
    row: Record<string, unknown>,
    viewer: Pick<Viewer, 'userId' | 'isAdmin'>,
    stats: ClaimLinkStats
): PurchaseClaim {
    const status = textOrNull(row.status) ?? ''
    const visible = canSeeClaim(viewer, textOrNull(row.submitted_by))
    return {
        id: String(row.id),
        claim_number: String(row.claim_number ?? ''),
        status,
        status_label: claimStatusLabel(status),
        status_color: getClaimStatusColor(status),
        visible,
        title: visible ? String(row.title ?? '') : null,
        amount: visible ? claimAmountOf(row) : null,
        linked_items: stats.linked_items,
        linked_actual: visible ? round2(stats.linked_actual) : null,
    }
}

/** ใบเบิกหนึ่งใบในตัวเลือก "ผูกใบเบิก" — server ส่งมาเฉพาะใบที่ผู้ใช้ผูกได้ (แอดมิน = ทุกใบ · คนอื่น = ใบของตัวเอง) */
export interface PurchaseClaimOption {
    id: string
    claim_number: string
    title: string
    /** ยอดของใบเบิก (claimEffectiveAmount) */
    amount: number
    status: string
    status_label: string
    /** วันที่ของค่าใช้จ่าย YYYY-MM-DD */
    expense_date: string | null
    /** ชื่อผู้เบิก — เฉพาะผลค้นของแอดมิน (คนอื่นเห็นแต่ใบของตัวเองอยู่แล้ว) */
    submitter_name: string | null
    /** จำนวนรายการจัดซื้อที่ผูกกับใบนี้อยู่แล้ว (ทุกเช็กลิสต์) */
    linked_items: number
}

export function toPurchaseClaimOption(
    row: Record<string, unknown>,
    linkedItems: number,
    submitterName: string | null
): PurchaseClaimOption {
    const status = textOrNull(row.status) ?? ''
    return {
        id: String(row.id),
        claim_number: String(row.claim_number ?? ''),
        title: String(row.title ?? ''),
        amount: claimAmountOf(row),
        status,
        status_label: claimStatusLabel(status),
        expense_date: dateOrNull(row.expense_date),
        submitter_name: submitterName,
        linked_items: linkedItems,
    }
}

/** ยอดสองจำนวนต่างกันเกิน 0.01 บาทไหม — เทียบเป็นสตางค์ (ทศนิยมลอยตัว: 100 กับ 100.01 ต้อง "ไม่ต่าง") */
export function moneyDiffers(a: number, b: number): boolean {
    return Math.abs(Math.round(a * 100) - Math.round(b * 100)) > 1
}

/**
 * ยอดใบเบิกไม่ตรงกับผลรวม "จ่ายจริง" ของทุกรายการที่ผูก (ต่างเกิน 0.01 บาท) — ขึ้นข้อความเตือน ไม่บล็อก
 * ใบที่ผู้ใช้ไม่เห็นยอด = ไม่เตือน
 */
export function claimMismatch(claim: Pick<PurchaseClaim, 'visible' | 'amount' | 'linked_actual'>): boolean {
    return claim.visible && claim.amount != null && claim.linked_actual != null && moneyDiffers(claim.amount, claim.linked_actual)
}

/** หัวการ์ด "ผูกใบเบิกแล้ว N/M รายการ" — ส่งเช็กลิสต์ตัวเต็ม (ไม่ใช่ผลของตัวกรอง) */
export function claimsOf(items: Pick<PurchaseItem, 'expense_claim_id'>[]): { linked: number; total: number } {
    return { linked: items.filter(i => i.expense_claim_id).length, total: items.length }
}

/** รายการจัดซื้อหนึ่งข้อที่ผูกกับใบเบิก — แถวในหน้าใบเบิก (/finance/[id]) */
export interface ClaimPurchaseItemRow {
    item_id: string
    title: string
    quantity: string | null
    status: PurchaseStatus
    actual_price: number | null
    list_id: string
    /** ชื่อเช็กลิสต์ที่แสดง (listTitle — ผูกงานอยู่ใช้ชื่อลูกค้าจาก CRM) */
    list_title: string
}

// --- หน้าจอ: ค่าชั่วคราวระหว่างรอ server (useOptimistic) ------------------------------------

/** id ชั่วคราวของรายการที่เพิ่งเพิ่มบนหน้าจอ — id จริงทุกตัวเป็น uuid จึงไม่มีทางขึ้นต้นแบบนี้ */
export const TEMP_ID_PREFIX = 'temp-'

/** แถวที่ยังรอ server (id ชั่วคราว) — ห้ามส่ง id แบบนี้ไป server · หน้าจอไม่ให้กดอะไรกับแถวนี้ */
export function isTempId(id: string): boolean {
    return id.startsWith(TEMP_ID_PREFIX)
}

/** การเปลี่ยนแปลงที่หน้าจอแสดงทันทีก่อน server ตอบ — ข้อมูลจริงตามมาจาก revalidatePath */
export type OptimisticAction =
    | { type: 'status'; itemId: string; status: PurchaseStatus; userId: string | null; now: string }
    | {
          type: 'addItems'
          listId: string
          items: { tempId: string; title: string; kind: PurchaseKind }[]
          userId: string | null
          now: string
      }
    | { type: 'updateItem'; itemId: string; patch: Partial<PurchaseItemInput> }
    | { type: 'deleteItem'; itemId: string }
    | { type: 'updateList'; listId: string; patch: Partial<PurchaseListInput> }
    | { type: 'deleteList'; listId: string }
    /** ผูกหลายรายการ (ข้ามเช็กลิสต์ได้) กับใบเบิกเดียว — รายการที่ผูกใบอื่นอยู่ถูกแทนที่ */
    | { type: 'linkClaim'; itemIds: string[]; claimId: string }
    | { type: 'unlinkClaim'; itemId: string }

/** ตัดช่องที่เป็น undefined ทิ้ง (Partial อาจมี key ที่ค่าเป็น undefined — ห้ามทับค่าเดิม) */
function definedOnly<T extends object>(patch: T): Partial<T> {
    return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}

/**
 * แก้รายการหนึ่งข้อ — fn คืน null = ลบ · คืนตัวเดิม = ไม่เปลี่ยน
 * สร้าง object ใหม่เฉพาะเช็กลิสต์และรายการที่เปลี่ยน ที่เหลือคงตัวเดิม (===) · ไม่พบ id = คืน lists ตัวเดิม
 */
function updateItemIn(
    lists: PurchaseList[],
    itemId: string,
    fn: (item: PurchaseItem) => PurchaseItem | null
): PurchaseList[] {
    for (let li = 0; li < lists.length; li++) {
        const list = lists[li]
        const index = list.items.findIndex(i => i.id === itemId)
        if (index < 0) continue
        const current = list.items[index]
        const next = fn(current)
        if (next === current) return lists
        const items =
            next === null ? list.items.filter((_, i) => i !== index) : list.items.map((it, i) => (i === index ? next : it))
        return lists.map((l, i) => (i === li ? { ...list, items } : l))
    }
    return lists
}

/** แก้เช็กลิสต์หนึ่งใบ — กติกาเดียวกับ updateItemIn */
function updateListIn(
    lists: PurchaseList[],
    listId: string,
    fn: (list: PurchaseList) => PurchaseList | null
): PurchaseList[] {
    const index = lists.findIndex(l => l.id === listId)
    if (index < 0) return lists
    const current = lists[index]
    const next = fn(current)
    if (next === current) return lists
    return next === null ? lists.filter((_, i) => i !== index) : lists.map((l, i) => (i === index ? next : l))
}

/**
 * ตัวลดของ useOptimistic — คืน array ใหม่ที่เปลี่ยนเฉพาะเส้นทางที่แตะ (เช็กลิสต์/รายการอื่นคงตัวเดิม ===)
 * · id ที่ไม่รู้จัก / patch ว่าง / สถานะเดิม → คืน lists ตัวเดิม
 * · 'status' ประทับเวลาแบบเดียวกับ server: status_changed_at/by และ done_at (เสร็จ = now · ถอย = null)
 * · 'addItems' ต่อท้ายใบด้วย id ชั่วคราว สถานะวางแผน ไม่มีผู้รับผิดชอบ (เหมือนที่ server เพิ่ม)
 * · 'linkClaim' / 'unlinkClaim' แตะเฉพาะรายการที่ใบเบิกเปลี่ยนจริง (ผูกใบเดิมอยู่แล้ว / ไม่ได้ผูก = ไม่เปลี่ยน)
 */
export function applyOptimistic(lists: PurchaseList[], action: OptimisticAction): PurchaseList[] {
    switch (action.type) {
        case 'status':
            return updateItemIn(lists, action.itemId, item =>
                item.status === action.status
                    ? item
                    : {
                          ...item,
                          status: action.status,
                          status_changed_at: action.now,
                          status_changed_by: action.userId,
                          done_at: action.status === 'done' ? action.now : null,
                          updated_at: action.now,
                      })
        case 'addItems': {
            if (action.items.length === 0) return lists
            return updateListIn(lists, action.listId, list => {
                const start = list.items.reduce((max, i) => Math.max(max, i.sort_order), -1) + 1
                const added = action.items.map(
                    (draft, i): PurchaseItem => ({
                        id: draft.tempId,
                        list_id: list.id,
                        title: draft.title,
                        kind: draft.kind,
                        status: 'planning',
                        quantity: null,
                        est_price: null,
                        actual_price: null,
                        vendor: null,
                        link_url: null,
                        tracking_no: null,
                        assignee_id: null,
                        due_date: null,
                        note: null,
                        images: [],
                        expense_claim_id: null,
                        sort_order: start + i,
                        status_changed_at: null,
                        status_changed_by: null,
                        done_at: null,
                        created_by: action.userId,
                        created_at: action.now,
                        updated_at: action.now,
                    })
                )
                return { ...list, items: [...list.items, ...added] }
            })
        }
        case 'updateItem': {
            const patch = definedOnly(action.patch)
            if (Object.keys(patch).length === 0) return lists
            return updateItemIn(lists, action.itemId, item => ({ ...item, ...patch }))
        }
        case 'deleteItem':
            return updateItemIn(lists, action.itemId, () => null)
        case 'updateList': {
            const patch = definedOnly(action.patch)
            if (Object.keys(patch).length === 0) return lists
            return updateListIn(lists, action.listId, list => ({ ...list, ...patch }))
        }
        case 'deleteList':
            return updateListIn(lists, action.listId, () => null)
        case 'linkClaim': {
            const wanted = new Set(action.itemIds)
            const changes = (item: PurchaseItem) => wanted.has(item.id) && item.expense_claim_id !== action.claimId
            if (!lists.some(list => list.items.some(changes))) return lists
            return lists.map(list =>
                list.items.some(changes)
                    ? { ...list, items: list.items.map(item => (changes(item) ? { ...item, expense_claim_id: action.claimId } : item)) }
                    : list
            )
        }
        case 'unlinkClaim':
            return updateItemIn(lists, action.itemId, item =>
                item.expense_claim_id === null ? item : { ...item, expense_claim_id: null })
        default:
            return lists
    }
}

// --- หน้าจอ: ตัวเลข ชื่อ และสี (ใช้ร่วมกันทั้งมุมมองตามงาน บอร์ด และหน้าแรก) -----------------------

/** ยอดเงินแบบไทย: จำนวนเต็มไม่มีทศนิยม ('1,250') · มีสตางค์แสดง 2 ตำแหน่ง ('1,250.50') */
export function formatMoney(n: number): string {
    return Number.isInteger(n)
        ? n.toLocaleString('th-TH')
        : n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** ชื่อที่แสดงของคน — ชื่อเล่นก่อน ไม่มีใช้ชื่อจริง */
export function personName(person: Pick<PurchasePerson, 'name' | 'nickname'>): string {
    return person.nickname?.trim() || person.name
}

export const URGENCY_LABELS: Record<Urgency, string> = {
    overdue: 'เลยกำหนด',
    urgent: 'ด่วน',
    soon: 'ใกล้ถึง',
}

/** สีของสถานะ — สีเป็นส่วนเสริม หน้าจอเขียนชื่อสถานะเป็นข้อความเสมอ */
export interface StatusTone {
    /** ปุ่ม/ป้ายสถานะ: ขอบ + พื้น + ตัวอักษร + hover */
    pill: string
    /** ส่วนของแถบความคืบหน้า */
    bar: string
    /** จุดสีหน้าชื่อสถานะ (ชิปตัวกรอง / หัวคอลัมน์บอร์ด / เมนูสถานะ) */
    dot: string
}

// วางแผน = เทา (ยังไม่เริ่ม) · กำลังจัดซื้อ = ม่วงประจำ Jobs · รอจัดส่ง = ฟ้า · เสร็จสิ้น = เขียว
// (แดง/เหลืองสงวนไว้ให้ความด่วน ไม่ใช้กับสถานะ)
const STATUS_TONES: Record<PurchaseStatus, StatusTone> = {
    planning: {
        pill: 'border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
        bar: 'bg-zinc-300 dark:bg-zinc-600',
        dot: 'bg-zinc-400 dark:bg-zinc-500',
    },
    purchasing: {
        pill: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200',
        bar: 'bg-violet-500 dark:bg-violet-400',
        dot: 'bg-violet-500 dark:bg-violet-400',
    },
    awaiting_delivery: {
        pill: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
        bar: 'bg-sky-500 dark:bg-sky-400',
        dot: 'bg-sky-500 dark:bg-sky-400',
    },
    done: {
        pill: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
        bar: 'bg-emerald-500 dark:bg-emerald-400',
        dot: 'bg-emerald-500 dark:bg-emerald-400',
    },
}

export function statusTone(status: PurchaseStatus): StatusTone {
    return STATUS_TONES[status]
}

/** สีของความด่วน — ชุดเดียวกับแผง "หน้าที่ยังไม่ครบ" (เลยกำหนด = แดงเข้ม · ด่วน = แดง · ใกล้ถึง = เหลือง) */
export interface UrgencyTone {
    /** ตัวอักษรนับถอยหลัง */
    text: string
    /** ป้ายมีกรอบ */
    badge: string
    /** จุดสี */
    dot: string
}

const URGENCY_TONES: Record<Urgency, UrgencyTone> = {
    overdue: {
        text: 'font-bold text-red-800 dark:text-red-300',
        badge: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
        dot: 'bg-red-600',
    },
    urgent: {
        text: 'font-medium text-red-600 dark:text-red-400',
        badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
        dot: 'bg-red-500',
    },
    soon: {
        text: 'font-medium text-amber-700 dark:text-amber-400',
        badge: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
        dot: 'bg-amber-400',
    },
}

/** ไม่มีความด่วน = สีเทาเรียบ */
const CALM_TONE: UrgencyTone = {
    text: 'text-zinc-500 dark:text-zinc-400',
    badge: 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400',
    dot: 'bg-zinc-300 dark:bg-zinc-600',
}

export function urgencyTone(urgency: Urgency | null): UrgencyTone {
    return urgency ? URGENCY_TONES[urgency] : CALM_TONE
}

/** เงินบนการ์ดเช็กลิสต์ — งบที่ใช้เทียบ + จ่ายจริง + เกินงบไหม */
export interface BudgetView {
    /** งบของเช็กลิสต์ ถ้าไม่ตั้งใช้ผลรวมงบรายการ · ไม่มีทั้งสองอย่าง = null */
    budget: number | null
    source: 'list' | 'items' | null
    actual: number
    /** รายการที่เสร็จแล้วแต่ยังไม่ใส่ยอดจ่ายจริง */
    missingActual: number
    /** จ่ายจริง > งบของเช็กลิสต์ · ไม่ได้ตั้งงบเช็กลิสต์ = จ่ายจริง > ผลรวมงบรายการ (ที่มากกว่า 0) */
    over: boolean
}

export function budgetOf(list: Pick<PurchaseList, 'budget' | 'items'>): BudgetView {
    const money = moneyOf(list.items)
    const base = { actual: money.actual, missingActual: money.missingActual }
    if (list.budget != null) return { ...base, budget: list.budget, source: 'list', over: money.actual > list.budget }
    if (money.est > 0) return { ...base, budget: money.est, source: 'items', over: money.actual > money.est }
    return { ...base, budget: null, source: null, over: false }
}

/** ตัวเลขใต้หัวข้อหน้า: จำนวนเช็กลิสต์ · รายการที่ยังไม่เสร็จ · รายการด่วน (เลยกำหนด + อีก 0–3 วัน) */
export interface ListsSummary {
    lists: number
    open: number
    urgent: number
}

export function listsSummary(lists: PurchaseList[], today: string): ListsSummary {
    let open = 0
    let urgent = 0
    for (const list of lists) {
        for (const item of list.items) {
            if (item.status === 'done') continue
            open++
            const u = urgencyOf(item, list, today)
            if (u === 'overdue' || u === 'urgent') urgent++
        }
    }
    return { lists: lists.length, open, urgent }
}
