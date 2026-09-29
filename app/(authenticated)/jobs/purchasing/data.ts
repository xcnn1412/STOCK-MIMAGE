// การประกอบข้อมูลของ /jobs/purchasing — เช็กลิสต์ + รายการ + การ์ด CRM ที่ผูก + คน + ชุดสำเร็จรูป + ใบเบิกที่ผูก
// แถวของแผงเตือนหน้าแรก ("ของยังไม่ครบ — ใกล้วันงาน") และรายการที่ผูกกับใบเบิกหนึ่งใบ (หน้า /finance/[id])
// server-only: มี service-role client อยู่ข้างใน — ห้าม import จาก client component
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionLight } from '@/lib/auth'
import {
    COORDINATOR_DEPARTMENT,
    PURCHASE_ITEM_COLUMNS,
    PURCHASE_LEAD_COLUMNS,
    bangkokDate,
    isUuid,
    listTitle,
    purchaseAlerts,
    sortLists,
    toPurchaseClaim,
    toPurchaseItem,
    toPurchaseTemplate,
    type ClaimLinkStats,
    type ClaimPurchaseItemRow,
    type PurchaseAlertRow,
    type PurchaseClaim,
    type PurchaseItem,
    type PurchaseLead,
    type PurchaseList,
    type PurchasePerson,
    type PurchaseTemplate,
    type Viewer,
} from './purchasing-logic'

type Db = ReturnType<typeof createServiceClient>
type Row = Record<string, unknown>
type DbError = { code?: string; message: string }
type Page<T> = PromiseLike<{ data: T[] | null; error: DbError | null }>

/** เพดานแถวต่อหนึ่งคำขอของ PostgREST */
const PAGE_SIZE = 1000
/** id ต่อหนึ่ง .in() — กัน URL ยาวเกิน (uuid ละ ~37 ตัวอักษร) */
const IN_CHUNK = 150
/** เช็กลิสต์ที่ไม่มีรายการค้างและไม่ขยับเกินกี่วัน ไม่โหลดโดยปริยาย (?past=1 = โหลดทั้งหมด) */
const RECENT_DAYS = 30

const LIST_COLUMNS = 'id, crm_lead_id, title, note, budget, due_date, owner_id, created_by, created_at, updated_at'
/** คอลัมน์ของ expense_claims ที่ toPurchaseClaim ใช้ */
const CLAIM_COLUMNS = 'id, claim_number, claim_type, title, amount, actual_spent_amount, status, submitted_by'

/** ข้อมูลทั้งชุดที่หน้าจัดซื้อใช้ */
export interface PurchasingSnapshot {
    /** เช็กลิสต์ เรียงตาม sortLists (ยังไม่เสร็จ → วันเร็วสุด → สร้างล่าสุด) */
    lists: PurchaseList[]
    /** คนที่อนุมัติแล้ว เรียงตามชื่อ — ตัวเลือกผู้รับผิดชอบ */
    people: PurchasePerson[]
    templates: PurchaseTemplate[]
    /**
     * ใบเบิกทุกใบที่รายการซึ่งโหลดมาผูกอยู่ (id ใบเบิก → ใบเบิก) — ตัดชื่อ/ยอดตามสิทธิ์ของผู้ใช้คนนี้แล้ว
     * (ไม่ใช่แอดมินและไม่ใช่ผู้เบิก = title / amount / linked_actual เป็น null)
     */
    claims: Record<string, PurchaseClaim>
    currentUserId: string | null
    isAdmin: boolean
    myDepartment: string | null
    /** แอดมินหรือฝ่ายประสานงาน — ดูแลทุกใบได้ (ลบได้ทุกอย่าง) */
    canManage: boolean
    /** วันนี้เวลาไทย (YYYY-MM-DD) — ส่งเป็น prop กันวันเพี้ยนระหว่าง server/browser */
    today: string
    /**
     * ยังไม่รัน migration 20260929_purchasing_checklist.sql (หรือรันรุ่นก่อนที่ยังไม่มีคอลัมน์ expense_claim_id)
     * — หน้าแสดงข้อความอธิบายแทน
     */
    missingTables: boolean
}

/** ตัวเลือกของ getPurchasingSnapshot — ไม่ส่ง = ค่าเดิม (ตัดใบเก่า, อ่าน session จาก cookie) */
export interface PurchasingSnapshotOptions {
    /** true = โหลดทุกเช็กลิสต์ (หน้าเปิดด้วย ?past=1) */
    includePast?: boolean
    /**
     * session ที่ผู้เรียกมีอยู่แล้ว — ใส่มาเพื่อข้าม getSessionLight()
     * สคริปต์ที่รันนอก request ต้องส่งเอง เพราะ cookies() ใช้ได้เฉพาะใน request
     * (role ไม่ใช้ตัดสินสิทธิ์ — อ่านจาก profiles แทน เพราะ cookie session_role ไม่ได้เซ็น)
     */
    session?: { userId?: string; role?: string }
}

/**
 * เมนูจัดซื้อยังไม่ได้ติดตั้งครบ — ตารางยังไม่ถูกสร้าง: Postgres 42P01 (relation does not exist) / PostgREST PGRST205
 * · คอลัมน์ยังไม่มี (รัน migration รุ่นก่อนที่ยังไม่มี expense_claim_id): Postgres 42703 / PostgREST PGRST204
 */
const NOT_INSTALLED_CODES = new Set(['42P01', 'PGRST205', '42703', 'PGRST204'])
const notInstalled = (error: DbError | null) => !!error?.code && NOT_INSTALLED_CODES.has(error.code)

/**
 * อ่านทุกแถวแบบแบ่งหน้าทีละ 1,000 จนได้หน้าที่สั้นกว่านั้น
 * คิวรีต้องเรียงด้วยคีย์ที่ไม่ซ้ำ (ท้ายสุดด้วย id) ไม่งั้นแถวที่อยู่รอยต่อหน้าอาจซ้ำหรือหล่น
 */
async function readAll<T>(page: (from: number, to: number) => Page<T>): Promise<{ rows: T[]; error: DbError | null }> {
    const rows: T[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await page(from, from + PAGE_SIZE - 1)
        if (error) return { rows, error }
        rows.push(...(data || []))
        if (!data || data.length < PAGE_SIZE) return { rows, error: null }
    }
}

/** อ่านแถวที่อยู่ในชุด id — แบ่ง id เป็นก้อน (กัน URL ยาว) แต่ละก้อนอ่านทีละหน้า */
async function readByIds<T>(ids: string[], page: (ids: string[], from: number, to: number) => Page<T>) {
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK))
    const results = await Promise.all(chunks.map(part => readAll<T>((from, to) => page(part, from, to))))
    return { rows: results.flatMap(r => r.rows), error: results.find(r => r.error)?.error ?? null }
}

const textOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** แถว crm_leads ดิบ (PURCHASE_LEAD_COLUMNS) → PurchaseLead */
const toLead = (l: Row): PurchaseLead => ({
    id: String(l.id),
    customer_name: textOrNull(l.customer_name),
    event_location: textOrNull(l.event_location),
    event_date: textOrNull(l.event_date),
    event_end_date: textOrNull(l.event_end_date),
    status: textOrNull(l.status),
})

/** แถวเช็กลิสต์ดิบ → PurchaseList พร้อมรายการ (เรียง sort_order แล้ว created_at) และการ์ด CRM ที่ผูก */
async function assembleLists(supabase: Db, listRows: Row[]): Promise<{ lists: PurchaseList[]; error: DbError | null }> {
    const listIds = listRows.map(r => String(r.id))
    const leadIds = [...new Set(listRows.map(r => textOrNull(r.crm_lead_id)).filter((id): id is string => !!id))]

    const [itemsRes, leadsRes] = await Promise.all([
        readByIds<Row>(listIds, (ids, from, to) =>
            supabase
                .from('purchase_items')
                .select(PURCHASE_ITEM_COLUMNS)
                .in('list_id', ids)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true })
                .order('id', { ascending: true })
                .range(from, to)),
        readByIds<Row>(leadIds, (ids, from, to) =>
            supabase.from('crm_leads').select(PURCHASE_LEAD_COLUMNS).in('id', ids).order('id').range(from, to)),
    ])
    const error = itemsRes.error || leadsRes.error
    if (error) return { lists: [], error }

    const itemsByList = new Map<string, PurchaseItem[]>()
    for (const row of itemsRes.rows) {
        const item = toPurchaseItem(row)
        const bucket = itemsByList.get(item.list_id)
        if (bucket) bucket.push(item)
        else itemsByList.set(item.list_id, [item])
    }

    const leadById = new Map(leadsRes.rows.map(l => [String(l.id), toLead(l)]))

    const lists = listRows.map(r => {
        const id = String(r.id)
        const leadId = textOrNull(r.crm_lead_id)
        return {
            id,
            crm_lead_id: leadId,
            title: String(r.title ?? ''),
            note: textOrNull(r.note),
            budget: r.budget == null || !Number.isFinite(Number(r.budget)) ? null : Number(r.budget),
            due_date: textOrNull(r.due_date),
            owner_id: textOrNull(r.owner_id),
            created_by: textOrNull(r.created_by),
            created_at: String(r.created_at ?? ''),
            updated_at: String(r.updated_at ?? ''),
            lead: (leadId && leadById.get(leadId)) || null,
            items: itemsByList.get(id) ?? [],
        }
    })
    return { lists, error: null }
}

/**
 * ใบเบิกที่รายการในเช็กลิสต์เหล่านี้ผูกอยู่ (id ใบเบิก → PurchaseClaim ของผู้ใช้คนนี้)
 * linked_items / linked_actual นับทุกรายการที่ผูกกับใบนั้นในฐานข้อมูล — รวมเช็กลิสต์ที่หน้าไม่ได้โหลดมา
 * ชื่อ ยอด และยอดรวมของรายการที่ผูก ถูกตัดทิ้งตรงนี้ (toPurchaseClaim) สำหรับคนที่ไม่ใช่แอดมินและไม่ใช่ผู้เบิก
 * — ข้อมูลนั้นจึงไม่ออกจาก server เลย ไม่ใช่ส่งไปแล้วให้หน้าจอซ่อน
 */
async function loadClaims(
    supabase: Db,
    lists: PurchaseList[],
    viewer: Viewer
): Promise<{ claims: Record<string, PurchaseClaim>; error: DbError | null }> {
    const claimIds = [
        ...new Set(lists.flatMap(l => l.items.map(i => i.expense_claim_id)).filter((id): id is string => !!id)),
    ]
    if (claimIds.length === 0) return { claims: {}, error: null }

    const [claimsRes, linkedRes] = await Promise.all([
        readByIds<Row>(claimIds, (ids, from, to) =>
            supabase.from('expense_claims').select(CLAIM_COLUMNS).in('id', ids).order('id').range(from, to)),
        readByIds<Row>(claimIds, (ids, from, to) =>
            supabase
                .from('purchase_items')
                .select('id, expense_claim_id, actual_price')
                .in('expense_claim_id', ids)
                .order('id')
                .range(from, to)),
    ])
    const error = claimsRes.error || linkedRes.error
    if (error) return { claims: {}, error }

    const stats = new Map<string, ClaimLinkStats>()
    for (const row of linkedRes.rows) {
        const id = String(row.expense_claim_id)
        const s = stats.get(id) ?? { linked_items: 0, linked_actual: 0 }
        stats.set(id, { linked_items: s.linked_items + 1, linked_actual: s.linked_actual + (Number(row.actual_price) || 0) })
    }
    const claims: Record<string, PurchaseClaim> = {}
    for (const row of claimsRes.rows) {
        const id = String(row.id)
        claims[id] = toPurchaseClaim(row, viewer, stats.get(id) ?? { linked_items: 0, linked_actual: 0 })
    }
    return { claims, error: null }
}

/**
 * ข้อมูลของหน้าจัดซื้อ — โหลด (สเปค "หน้าหลักโหลดอะไร"):
 * เช็กลิสต์ที่ยังมีรายการไม่เสร็จ + เช็กลิสต์ที่ขยับใน 30 วันล่าสุด (รวมใบว่างและใบที่เสร็จแล้ว) · includePast = ทั้งหมด
 * ยังไม่รัน migration → missingTables: true (ไม่ throw) · ผิดพลาดอื่น → throw ข้อความไทย (ข้อความดิบลง log)
 * — เรียกได้จาก server component เท่านั้น (หรือสคริปต์ที่ส่ง opts.session มาเอง)
 */
export async function getPurchasingSnapshot(opts?: PurchasingSnapshotOptions): Promise<PurchasingSnapshot> {
    const supabase = createServiceClient()
    const now = Date.now()
    const today = bangkokDate(now)
    const cutoff = new Date(now - RECENT_DAYS * 86_400_000).toISOString()
    const includePast = !!opts?.includePast

    // ระลอก A: เช็กลิสต์ที่ขยับล่าสุด (หรือทั้งหมด) + id ของใบที่มีรายการค้าง + คน + ชุดสำเร็จรูป + session
    const [recentRes, openRes, profilesRes, templatesRes, session] = await Promise.all([
        readAll<Row>((from, to) => {
            const q = supabase.from('purchase_lists').select(LIST_COLUMNS)
            return (includePast ? q : q.gte('updated_at', cutoff)).order('id').range(from, to)
        }),
        includePast
            ? Promise.resolve({ rows: [] as { list_id: string }[], error: null })
            : readAll<{ list_id: string }>((from, to) =>
                supabase.from('purchase_items').select('list_id').neq('status', 'done').order('id').range(from, to)),
        supabase.from('profiles').select('id, full_name, nickname, department, role').eq('is_approved', true).order('full_name'),
        supabase.from('purchase_templates').select('id, name, items, created_by, created_at, updated_at').order('name'),
        opts?.session ? Promise.resolve(opts.session) : getSessionLight(),
    ])

    // คน + ผู้ใช้ปัจจุบัน — role อ่านจาก profiles (ไม่เชื่อ cookie session_role ที่ไม่ได้เซ็น)
    const profiles = (profilesRes.data || []) as Row[]
    const people: PurchasePerson[] = profiles.map(p => ({
        id: String(p.id),
        name: textOrNull(p.full_name) || String(p.id).slice(0, 8),
        nickname: textOrNull(p.nickname),
        department: textOrNull(p.department),
    }))
    const currentUserId = session.userId ?? null
    const me = profiles.find(p => p.id === currentUserId)
    const isAdmin = me?.role === 'admin'
    const myDepartment = textOrNull(me?.department)
    const base = {
        people,
        currentUserId,
        isAdmin,
        myDepartment,
        canManage: isAdmin || myDepartment === COORDINATOR_DEPARTMENT,
        today,
    }
    const missing = (): PurchasingSnapshot => ({ ...base, lists: [], templates: [], claims: {}, missingTables: true })
    const failed = (error: DbError): never => {
        console.error('[purchasing] โหลดข้อมูลหน้าจัดซื้อไม่สำเร็จ:', error.code, error.message)
        throw new Error('โหลดข้อมูลจัดซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }

    const purchaseErrors = [recentRes.error, openRes.error, templatesRes.error]
    if (purchaseErrors.some(notInstalled)) return missing()
    const firstError = purchaseErrors.find(e => e) || profilesRes.error
    if (firstError) return failed(firstError)

    // ระลอก B: ใบที่มีรายการค้างแต่ไม่ได้ขยับเกิน 30 วัน (ยังไม่อยู่ในชุดแรก)
    const listRows = [...recentRes.rows]
    const loaded = new Set(listRows.map(r => String(r.id)))
    const staleOpenIds = [...new Set(openRes.rows.map(r => r.list_id))].filter(id => !loaded.has(id))
    if (staleOpenIds.length > 0) {
        const staleRes = await readByIds<Row>(staleOpenIds, (ids, from, to) =>
            supabase.from('purchase_lists').select(LIST_COLUMNS).in('id', ids).order('id').range(from, to))
        if (notInstalled(staleRes.error)) return missing()
        if (staleRes.error) return failed(staleRes.error)
        listRows.push(...staleRes.rows)
    }

    // ระลอก C: รายการของทุกใบ + การ์ด CRM ที่ผูก
    const { lists, error } = await assembleLists(supabase, listRows)
    if (notInstalled(error)) return missing()
    if (error) return failed(error)

    // ระลอก D: ใบเบิกที่รายการผูกอยู่ — ตัดชื่อ/ยอดตามสิทธิ์ของผู้ใช้คนนี้ (isAdmin จาก profiles) ก่อนคืนค่า
    const viewer: Viewer = { userId: currentUserId, isAdmin, department: myDepartment }
    const claimsRes = await loadClaims(supabase, lists, viewer)
    if (notInstalled(claimsRes.error)) return missing()
    if (claimsRes.error) return failed(claimsRes.error)

    return {
        ...base,
        lists: sortLists(lists),
        templates: ((templatesRes.data || []) as Row[]).map(toPurchaseTemplate),
        claims: claimsRes.claims,
        missingTables: false,
    }
}

/**
 * แถวของแผงเตือนหน้าแรก — โหลดเฉพาะเช็กลิสต์ที่ยังมีรายการค้าง แล้วคัดด้วย purchaseAlerts
 * (ความด่วน + ผู้ใช้คนนี้เกี่ยวข้อง) · ผิดพลาดอะไรก็ตาม รวมยังไม่รัน migration → [] (ห้ามทำให้หน้าแรกล้ม)
 */
export async function getPurchaseAlerts(opts?: { session?: { userId?: string; role?: string } }): Promise<PurchaseAlertRow[]> {
    const quiet = (error: DbError | null): PurchaseAlertRow[] => {
        // ยังไม่รัน migration = ปกติ ไม่ต้องลง log ทุกครั้งที่เปิดหน้าแรก
        if (error && !notInstalled(error)) console.error('[purchasing] แผงเตือนหน้าแรกโหลดไม่สำเร็จ:', error.code, error.message)
        return []
    }
    try {
        const session = opts?.session ?? (await getSessionLight())
        const userId = session.userId
        if (!userId) return []

        const supabase = createServiceClient()
        const [openRes, meRes] = await Promise.all([
            readAll<{ list_id: string }>((from, to) =>
                supabase.from('purchase_items').select('list_id').neq('status', 'done').order('id').range(from, to)),
            supabase.from('profiles').select('role, department').eq('id', userId).eq('is_approved', true).maybeSingle(),
        ])
        if (openRes.error) return quiet(openRes.error)
        if (meRes.error) return quiet(meRes.error)
        if (!meRes.data) return []

        const listIds = [...new Set(openRes.rows.map(r => r.list_id))]
        if (listIds.length === 0) return []

        const listRes = await readByIds<Row>(listIds, (ids, from, to) =>
            supabase.from('purchase_lists').select(LIST_COLUMNS).in('id', ids).order('id').range(from, to))
        if (listRes.error) return quiet(listRes.error)

        const { lists, error } = await assembleLists(supabase, listRes.rows)
        if (error) return quiet(error)

        const me = meRes.data as Row
        return purchaseAlerts(
            lists,
            { userId, isAdmin: me.role === 'admin', department: textOrNull(me.department) },
            bangkokDate(Date.now())
        )
    } catch (err) {
        console.error('[purchasing] แผงเตือนหน้าแรกโหลดไม่สำเร็จ:', err)
        return []
    }
}

/**
 * รายการจัดซื้อที่ผูกกับใบเบิกหนึ่งใบ — ส่วน "รายการจัดซื้อที่ผูกกับใบเบิกนี้" ใต้หน้าใบเบิก (/finance/[id])
 * เรียงตามเช็กลิสต์ (ชื่อ) แล้วตามลำดับรายการในใบ
 * id ไม่ใช่ uuid หรือพลาดอะไรก็ตาม (รวมยังไม่รัน migration) → [] (ห้ามทำให้หน้าใบเบิกล้ม)
 * ไม่ตรวจว่าใครเห็นใบเบิกนี้ได้: ผู้เรียกคนเดียวคือหน้าใบเบิก ซึ่งเรียกหลัง getClaim() ของ Finance ผ่านแล้วเท่านั้น
 * (getClaim ตรวจสิทธิ์ของมันเอง) — ที่อื่นห้ามเรียกโดยไม่ตรวจสิทธิ์ก่อน
 */
export async function getClaimPurchaseItems(claimId: string): Promise<ClaimPurchaseItemRow[]> {
    if (!isUuid(claimId)) return []
    const quiet = (error: DbError): ClaimPurchaseItemRow[] => {
        if (!notInstalled(error)) console.error('[purchasing] รายการที่ผูกกับใบเบิกโหลดไม่สำเร็จ:', error.code, error.message)
        return []
    }
    try {
        const supabase = createServiceClient()
        const itemsRes = await readAll<Row>((from, to) =>
            supabase
                .from('purchase_items')
                .select('id, list_id, title, quantity, status, actual_price, sort_order, created_at')
                .eq('expense_claim_id', claimId)
                .order('id')
                .range(from, to))
        if (itemsRes.error) return quiet(itemsRes.error)
        if (itemsRes.rows.length === 0) return []

        const listIds = [...new Set(itemsRes.rows.map(r => String(r.list_id)))]
        const listRes = await readByIds<Row>(listIds, (ids, from, to) =>
            supabase.from('purchase_lists').select('id, title, crm_lead_id').in('id', ids).order('id').range(from, to))
        if (listRes.error) return quiet(listRes.error)
        const leadIds = [...new Set(listRes.rows.map(r => textOrNull(r.crm_lead_id)).filter((id): id is string => !!id))]
        const leadRes = await readByIds<Row>(leadIds, (ids, from, to) =>
            supabase.from('crm_leads').select(PURCHASE_LEAD_COLUMNS).in('id', ids).order('id').range(from, to))
        if (leadRes.error) return quiet(leadRes.error)

        // ชื่อเช็กลิสต์แบบเดียวกับหน้าจัดซื้อ (ผูกงานอยู่ = ชื่อลูกค้าจาก CRM ล่าสุด)
        const leadById = new Map(leadRes.rows.map(l => [String(l.id), toLead(l)]))
        const titleOf = new Map(
            listRes.rows.map(l => {
                const leadId = textOrNull(l.crm_lead_id)
                return [String(l.id), listTitle({ title: String(l.title ?? ''), lead: (leadId && leadById.get(leadId)) || null })]
            })
        )

        const items = itemsRes.rows.map(toPurchaseItem)
        items.sort((a, b) =>
            (titleOf.get(a.list_id) ?? '').localeCompare(titleOf.get(b.list_id) ?? '', 'th') ||
            a.list_id.localeCompare(b.list_id) ||
            a.sort_order - b.sort_order ||
            a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id))
        return items.map(item => ({
            item_id: item.id,
            title: item.title,
            quantity: item.quantity,
            status: item.status,
            actual_price: item.actual_price,
            list_id: item.list_id,
            list_title: titleOf.get(item.list_id) ?? '',
        }))
    } catch (err) {
        console.error('[purchasing] รายการที่ผูกกับใบเบิกโหลดไม่สำเร็จ:', err)
        return []
    }
}
