'use server'

// server actions ของ /jobs/purchasing (เช็กลิสต์จัดซื้อ) — สเปค: docs/specs/purchasing-checklist.md
// ทุกตัว: requireAuth() (ผ่าน getActor) ก่อนแตะฐานข้อมูล · ตรวจทุกอาร์กิวเมนต์เหมือนข้อมูลแปลกหน้า
// · คืน { error } ไม่ throw · เปลี่ยนข้อมูลแล้ว logActivity + revalidatePath('/jobs/purchasing') และ '/dashboard'
// ทุกคนที่ล็อกอินสร้าง/แก้/เปลี่ยนสถานะได้ · ลบได้ตาม canDelete (ตัวเดียวกับที่หน้าจอใช้ซ่อนปุ่ม)
// · ผูกใบเบิกได้เฉพาะใบที่ตัวเองเป็นผู้เบิก (แอดมินได้ทุกใบ — canSeeClaim) · เลิกผูกได้ทุกคน
// id ที่ส่งมาไม่เชื่อว่าเข้าชุดกัน: รับ id รายการแล้วอ่านเช็กลิสต์ของมันจากฐานข้อมูลเอง

import { createServiceClient, removeStorageByUrls } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { logActivity } from '@/lib/logger'
import { createNotifications } from '@/lib/notifications'
// ตรรกะล้วน (ไม่มี React / ไม่มี 'use server') — import เข้ามาใน server action ได้
import { isWonStatus } from '@/app/(authenticated)/sales-board/commission-logic'
import {
    LINKABLE_CLAIM_TYPES,
    MAX_ITEMS_PER_ADD,
    MAX_ITEMS_PER_LINK,
    PURCHASE_ITEM_COLUMNS,
    PURCHASE_LEAD_COLUMNS,
    addDays,
    bangkokDate,
    canDelete,
    canSeeClaim,
    cleanSearchQuery,
    imageFilesError,
    isLinkableClaim,
    isPurchaseStatus,
    isUuid,
    personName,
    toPurchaseClaimOption,
    toPurchaseItem,
    validateItemInput,
    validateListInput,
    validateTemplateInput,
    type CreatePurchaseListInput,
    type PurchaseClaimOption,
    type PurchaseItem,
    type PurchaseItemDraft,
    type PurchaseItemInput,
    type PurchaseItemPatch,
    type PurchaseLead,
    type PurchaseLeadOption,
    type PurchaseListPatch,
    type PurchaseStatus,
    type PurchaseTemplateDraft,
    type PurchaseTemplateItem,
    type Viewer,
} from './purchasing-logic'

const BUCKET = 'purchase-attachments'
/** นามสกุลไฟล์ตามชนิดที่ตรวจแล้ว — ไม่ใช้นามสกุลจากชื่อไฟล์ที่ผู้ใช้ส่งมา */
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
/** ผลค้นการ์ด CRM / ใบเบิก สูงสุดกี่ใบ */
const SEARCH_LIMIT = 20
/** เพดานแถวต่อหนึ่งคำขอของ PostgREST */
const PAGE_SIZE = 1000
/** คอลัมน์ของ expense_claims ที่ตัวเลือกใบเบิก (toPurchaseClaimOption) ใช้ */
const CLAIM_OPTION_COLUMNS = 'id, claim_number, claim_type, title, amount, actual_spent_amount, status, expense_date, submitted_by, created_at'

// ข้อความผิดพลาด — ภาษาคนทำงาน ไม่มีศัพท์เทคนิค (ข้อความดิบจากฐานข้อมูลลง console.error เท่านั้น)
const NOT_SIGNED_IN = 'ไม่ได้เข้าสู่ระบบ'
const BAD_INPUT = 'ข้อมูลไม่ถูกต้อง'
const SAVE_FAILED = 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
const NOT_INSTALLED = 'ระบบจัดซื้อยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ'
const LIST_NOT_FOUND = 'ไม่พบเช็กลิสต์นี้ (อาจถูกลบไปแล้ว)'
const ITEM_NOT_FOUND = 'ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)'
const TEMPLATE_NOT_FOUND = 'ไม่พบชุดสำเร็จรูปนี้ (อาจถูกลบไปแล้ว)'
const PERSON_NOT_FOUND = 'ไม่พบผู้รับผิดชอบที่เลือก กรุณาเลือกใหม่'
const NOTHING_TO_SAVE = 'ไม่มีข้อมูลที่เปลี่ยน'
const NO_DELETE_RIGHT = 'ลบได้เฉพาะคนสร้าง ผู้รับผิดชอบเช็กลิสต์ แอดมิน หรือฝ่ายประสานงาน'
/** ใบเบิกที่ไม่มีอยู่ และใบเบิกของคนอื่น (ผู้กดไม่ใช่แอดมิน) ได้ข้อความเดียวกัน — ไม่บอกว่าใบนั้นมีอยู่จริง */
const CLAIM_NOT_FOUND = 'ไม่พบใบเบิกนี้'
const CLAIM_NOT_LINKABLE = 'ใบเบิกนี้ผูกกับรายการจัดซื้อไม่ได้ (ถูกปฏิเสธหรือยกเลิกแล้ว หรือเป็นเอกสารเงินสดย่อย)'
const CLAIM_SEARCH_FAILED = 'ค้นหาใบเบิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
const SOME_ITEMS_NOT_FOUND = 'ไม่พบบางรายการที่เลือก (อาจถูกลบไปแล้ว) — ยังไม่ได้ผูกรายการใดเลย กรุณาโหลดหน้าใหม่'

type Db = ReturnType<typeof createServiceClient>
type DbError = { code?: string; message: string }
type Failure = { error: string }
type Success<T extends object = object> = { success: true } & T

/** ผู้กดปุ่ม — ใช้เป็น Viewer ของ canDelete ได้ตรงๆ */
type Actor = Viewer & { userId: string; name: string }

/** requireAuth() ตรวจ token + is_approved + session เดียว และอ่านแผนก/ชื่อมาให้แล้ว — ไม่ต้องคิวรี profiles ซ้ำ */
async function getActor(): Promise<Actor | null> {
    const auth = await requireAuth()
    if (!auth) return null
    return {
        userId: auth.userId,
        isAdmin: auth.role === 'admin',
        department: auth.department ?? null,
        name: auth.nickname || auth.fullName || 'ผู้ใช้',
    }
}

/**
 * ตาราง (42P01 / PGRST205) หรือคอลัมน์ (42703 / PGRST204) ของเมนูจัดซื้อยังไม่ถูกสร้าง — ชุดเดียวกับ data.ts
 * (ฐานข้อมูลที่รัน migration รุ่นก่อนยังไม่มีคอลัมน์ purchase_items.expense_claim_id)
 */
const NOT_INSTALLED_CODES = new Set(['42P01', 'PGRST205', '42703', 'PGRST204'])

/** error จากฐานข้อมูล/สตอเรจ → ข้อความสำหรับผู้ใช้ (ยังไม่ได้ติดตั้ง = บอกว่าระบบยังไม่พร้อม) */
function dbFail(context: string, error: DbError, message = SAVE_FAILED): Failure {
    console.error(`[purchasing] ${context}:`, error.code ?? '', error.message)
    return { error: error.code && NOT_INSTALLED_CODES.has(error.code) ? NOT_INSTALLED : message }
}

function revalidatePurchasing() {
    revalidatePath('/jobs/purchasing')
    revalidatePath('/dashboard')
}

type ListRow = { id: string; crm_lead_id: string | null; title: string; owner_id: string | null; created_by: string | null }
type ItemRow = { id: string; list_id: string; title: string; status: string; assignee_id: string | null; created_by: string | null; images: string[] | null }

async function loadList(supabase: Db, listId: string): Promise<{ list: ListRow | null; error: DbError | null }> {
    const { data, error } = await supabase
        .from('purchase_lists')
        .select('id, crm_lead_id, title, owner_id, created_by')
        .eq('id', listId)
        .maybeSingle()
    return { list: (data as ListRow | null) ?? null, error }
}

async function loadItem(supabase: Db, itemId: string): Promise<{ item: ItemRow | null; error: DbError | null }> {
    const { data, error } = await supabase
        .from('purchase_items')
        .select('id, list_id, title, status, assignee_id, created_by, images')
        .eq('id', itemId)
        .maybeSingle()
    return { item: (data as ItemRow | null) ?? null, error }
}

/**
 * ชุดสำเร็จรูป → รายการที่พร้อมเพิ่ม — ตรวจซ้ำด้วยกฎเดียวกับตอนบันทึก
 * (jsonb แก้มือในฐานข้อมูลได้ จึงไม่เชื่อรูปแบบที่เก็บไว้)
 */
async function loadTemplateItems(supabase: Db, templateId: string): Promise<{ items: PurchaseTemplateItem[] } | Failure> {
    const { data, error } = await supabase.from('purchase_templates').select('id, name, items').eq('id', templateId).maybeSingle()
    if (error) return dbFail('load template', error)
    if (!data) return { error: TEMPLATE_NOT_FOUND }
    const checked = validateTemplateInput({ name: data.name, items: data.items })
    if (!checked.ok) return { error: 'ชุดสำเร็จรูปนี้มีข้อมูลไม่ครบ กรุณาแก้ชุดก่อนใช้' }
    return { items: checked.value.items }
}

/** เช็กลิสต์ของงานนี้ (มีได้ใบเดียว — unique index บน crm_lead_id) */
async function findListOfLead(supabase: Db, leadId: string): Promise<{ id: string | null; error: DbError | null }> {
    const { data, error } = await supabase.from('purchase_lists').select('id').eq('crm_lead_id', leadId).maybeSingle()
    return { id: (data?.id as string | undefined) ?? null, error }
}

/** id ทุกตัวเป็นผู้ใช้ที่อนุมัติแล้วจริงไหม — FK ตรวจแค่ "มีอยู่" ไม่ตรวจการอนุมัติ */
async function allApproved(supabase: Db, ids: (string | null | undefined)[]): Promise<{ ok: boolean; error: DbError | null }> {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))]
    if (wanted.length === 0) return { ok: true, error: null }
    const { data, error } = await supabase.from('profiles').select('id').in('id', wanted).eq('is_approved', true)
    if (error) return { ok: false, error }
    return { ok: (data || []).length === wanted.length, error: null }
}

/** แตะ updated_at ของเช็กลิสต์ทุกครั้งที่รายการในใบเปลี่ยน (หน้าหลักใช้ตัดใบเก่า) — พลาดไม่ถือว่าล้ม */
async function touchList(supabase: Db, listId: string, now: string) {
    const { error } = await supabase.from('purchase_lists').update({ updated_at: now }).eq('id', listId)
    if (error) console.error('[purchasing] touch list:', error.code ?? '', error.message)
}

/** touchList หลายใบในคำขอเดียว (ผูกใบเบิกครั้งเดียวแตะรายการได้หลายเช็กลิสต์) */
async function touchLists(supabase: Db, listIds: string[], now: string) {
    if (listIds.length === 0) return
    const { error } = await supabase.from('purchase_lists').update({ updated_at: now }).in('id', listIds)
    if (error) console.error('[purchasing] touch lists:', error.code ?? '', error.message)
}

/**
 * เพิ่มรายการต่อท้ายใบ — sort_order ต่อจากตัวสุดท้าย
 * (รายการที่เพิ่มในคำขอเดียวกันได้ created_at เท่ากัน จึงต้องเรียงด้วย sort_order)
 * รายการจากชุดสำเร็จรูปไม่มีผู้รับผิดชอบ · สถานะเริ่มที่วางแผนเสมอ
 */
async function insertItems(
    supabase: Db,
    listId: string,
    inputs: (PurchaseItemInput | PurchaseTemplateItem)[],
    actorId: string
): Promise<{ items: PurchaseItem[]; error: DbError | null }> {
    const { data: last, error: lastError } = await supabase
        .from('purchase_items')
        .select('sort_order')
        .eq('list_id', listId)
        .order('sort_order', { ascending: false })
        .limit(1)
    if (lastError) return { items: [], error: lastError }
    const start = last && last.length > 0 ? (Number(last[0].sort_order) || 0) + 1 : 0

    const rows = inputs.map((input, i) => ({
        ...input,
        list_id: listId,
        status: 'planning',
        sort_order: start + i,
        created_by: actorId,
    }))
    const { data, error } = await supabase.from('purchase_items').insert(rows).select(PURCHASE_ITEM_COLUMNS)
    if (error) return { items: [], error }
    const items = ((data || []) as Record<string, unknown>[]).map(toPurchaseItem)
    return { items: items.sort((a, b) => a.sort_order - b.sort_order), error: null }
}

/** ชื่อรายการหลายข้อในบรรทัดเดียว (ยาวเกินตัดท้ายเป็น "และอีก N รายการ") */
function summarizeTitles(titles: string[]): string {
    const shown = titles.slice(0, 5).join(', ')
    return titles.length > 5 ? `${shown} และอีก ${titles.length - 5} รายการ` : shown
}

/** แจ้งผู้รับผิดชอบรายการ — หนึ่งแจ้งเตือนต่อคน รวมทุกรายการที่ได้รับ (createNotifications ตัดตัวผู้กดออกให้เอง) */
async function notifyAssigned(list: ListRow, items: { title: string; assignee_id: string | null }[], actor: Actor) {
    const byPerson = new Map<string, string[]>()
    for (const item of items) {
        if (!item.assignee_id) continue
        const titles = byPerson.get(item.assignee_id)
        if (titles) titles.push(item.title)
        else byPerson.set(item.assignee_id, [item.title])
    }
    await Promise.all(
        [...byPerson].map(([userId, titles]) =>
            createNotifications({
                userIds: [userId],
                type: 'job_purchase_assigned',
                title: `มอบหมายรายการจัดซื้อ: ${list.title}`,
                body: `${actor.name} ให้คุณรับผิดชอบ: ${summarizeTitles(titles)}`,
                referenceType: 'job', // ponytail: ใช้ค่าเดิมใน CHECK ของตาราง notifications (แบบ job_pool_*) — reference_id คือ id เช็กลิสต์
                referenceId: list.id,
                actorId: actor.userId,
            })
        )
    )
}

// ============================================================================
// ค้นงานจาก CRM
// ============================================================================

/**
 * ค้นการ์ด CRM ให้หน้าต่างสร้างเช็กลิสต์ — สูงสุด 20 ใบ ไม่เอาสถานะ rejected/cancelled และที่เก็บคลังแล้ว
 * คำค้นว่าง = เสนองานที่ตอบรับแล้ว (isWonStatus) ที่วันงานตั้งแต่ 7 วันก่อนขึ้นไป เรียงวันใกล้สุดก่อน
 * คืน list_id เมื่องานนั้นมีเช็กลิสต์แล้ว
 */
export async function searchPurchaseLeads(query: string): Promise<{ leads: PurchaseLeadOption[] } | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }

    // ตัดอักขระที่มีความหมายใน or() ของ PostgREST ออกก่อนต่อเป็น filter
    const q = cleanSearchQuery(query)
    const supabase = createServiceClient()
    const base = supabase
        .from('crm_leads')
        .select(PURCHASE_LEAD_COLUMNS)
        .is('archived_at', null)
        .not('status', 'in', '(rejected,cancelled)')

    let leads: PurchaseLead[]
    if (q) {
        const { data, error } = await base
            .or(`customer_name.ilike.*${q}*,event_location.ilike.*${q}*`)
            .order('event_date', { ascending: false, nullsFirst: false })
            .limit(SEARCH_LIMIT)
        if (error) return dbFail('search leads', error, 'ค้นหางานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        leads = (data || []) as PurchaseLead[]
    } else {
        // ponytail: อ่าน 200 ใบแรกในช่วงวันแล้วคัด isWonStatus ที่นี่ — ถ้าช่วงนั้นมีการ์ดที่ยังไม่ตอบรับเกิน ~180 ใบ
        // รายการเสนออาจไม่ครบ 20 (พิมพ์ค้นด้วยชื่อยังเจอเสมอ)
        const { data, error } = await base
            .gte('event_date', addDays(bangkokDate(Date.now()), -7))
            .order('event_date', { ascending: true })
            .limit(200)
        if (error) return dbFail('suggest leads', error, 'ค้นหางานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        leads = ((data || []) as PurchaseLead[]).filter(l => isWonStatus(l.status)).slice(0, SEARCH_LIMIT)
    }

    // งานที่มีเช็กลิสต์แล้ว → list_id (กดแล้วเปิดใบเดิม)
    const listByLead = new Map<string, string>()
    if (leads.length > 0) {
        const { data, error } = await supabase
            .from('purchase_lists')
            .select('id, crm_lead_id')
            .in('crm_lead_id', leads.map(l => l.id))
        if (error) return dbFail('search lead lists', error, 'ค้นหางานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        for (const row of data || []) listByLead.set(row.crm_lead_id as string, row.id as string)
    }

    return {
        leads: leads.map(l => ({
            id: l.id,
            customer_name: l.customer_name ?? null,
            event_location: l.event_location ?? null,
            event_date: l.event_date ?? null,
            event_end_date: l.event_end_date ?? null,
            status: l.status ?? null,
            list_id: listByLead.get(l.id) ?? null,
        })),
    }
}

// ============================================================================
// เช็กลิสต์
// ============================================================================

/**
 * สร้างเช็กลิสต์ — ผูกงาน (leadId): งานมีใบแล้วคืนใบเดิม existed: true (รวมกรณีสองคนกดพร้อมกัน 23505)
 * · ทั่วไป: ต้องมีชื่อ · templateId = ใส่รายการจากชุดนั้นให้ (สถานะวางแผน ไม่มีผู้รับผิดชอบ)
 */
export async function createPurchaseList(
    input: CreatePurchaseListInput
): Promise<Success<{ listId: string; existed: boolean }> | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!input || typeof input !== 'object') return { error: BAD_INPUT }

    const leadId = input.leadId == null || input.leadId === '' ? null : input.leadId
    if (leadId !== null && !isUuid(leadId)) return { error: 'งานที่เลือกไม่ถูกต้อง' }
    const templateId = input.templateId == null || input.templateId === '' ? null : input.templateId
    if (templateId !== null && !isUuid(templateId)) return { error: TEMPLATE_NOT_FOUND }

    const supabase = createServiceClient()
    let title: unknown = input.title
    if (leadId) {
        const { data: lead, error } = await supabase
            .from('crm_leads')
            .select('id, customer_name, event_location')
            .eq('id', leadId)
            .maybeSingle()
        if (error) return dbFail('load lead', error)
        if (!lead) return { error: 'ไม่พบงานนี้ใน CRM (อาจถูกลบไปแล้ว)' }

        const existing = await findListOfLead(supabase, leadId)
        if (existing.error) return dbFail('find lead list', existing.error)
        if (existing.id) return { success: true, listId: existing.id, existed: true }

        // เก็บชื่อลูกค้า ณ ตอนสร้าง (การ์ด CRM ถูกลบแล้วเช็กลิสต์ยังอ่านรู้เรื่อง) — ตัดให้พอดีเพดาน 120 ตัวอักษร
        const name = (lead.customer_name as string | null)?.trim() || (lead.event_location as string | null)?.trim() || 'งานจาก CRM'
        title = [...name].slice(0, 120).join('').trim()
    }

    const checked = validateListInput({ title, note: input.note, due_date: input.dueDate })
    if (!checked.ok) return { error: checked.error }

    let templateItems: PurchaseTemplateItem[] = []
    if (templateId) {
        const loaded = await loadTemplateItems(supabase, templateId)
        if ('error' in loaded) return loaded
        templateItems = loaded.items
    }

    const { data: created, error: insertError } = await supabase
        .from('purchase_lists')
        .insert({
            crm_lead_id: leadId,
            title: checked.value.title,
            note: checked.value.note,
            due_date: checked.value.due_date,
            created_by: actor.userId,
        })
        .select('id')
        .single()
    if (insertError || !created) {
        // สองคนกดสร้างของงานเดียวกันพร้อมกัน — ใบของอีกคนเข้าไปก่อน (unique index) → เปิดใบนั้นแทน
        if (insertError?.code === '23505' && leadId) {
            const again = await findListOfLead(supabase, leadId)
            if (again.id) return { success: true, listId: again.id, existed: true }
        }
        return dbFail('create list', insertError ?? { message: 'no row returned' })
    }
    const listId = created.id as string

    if (templateItems.length > 0) {
        const inserted = await insertItems(supabase, listId, templateItems, actor.userId)
        if (inserted.error) {
            // ใบใหม่ที่รายการเข้าไม่ครบ = ลบทิ้ง ให้ผู้ใช้กดสร้างใหม่ได้สะอาดๆ
            await supabase.from('purchase_lists').delete().eq('id', listId)
            return dbFail('create list items', inserted.error)
        }
    }

    await logActivity('CREATE_PURCHASE_LIST', {
        listId,
        leadId,
        title: checked.value.title,
        templateId,
        itemCount: templateItems.length,
    })
    revalidatePurchasing()
    return { success: true, listId, existed: false }
}

/** แก้ หมายเหตุ งบ กำหนด ผู้รับผิดชอบ · ชื่อแก้ได้เฉพาะใบที่ไม่ผูกงาน (ใบที่ผูกงานใช้ชื่อจาก CRM) */
export async function updatePurchaseList(listId: string, patch: PurchaseListPatch): Promise<Success | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(listId)) return { error: LIST_NOT_FOUND }
    const checked = validateListInput(patch, 'patch')
    if (!checked.ok) return { error: checked.error }
    const changes = checked.value
    const fields = Object.keys(changes)
    if (fields.length === 0) return { error: NOTHING_TO_SAVE }

    const supabase = createServiceClient()
    const { list, error } = await loadList(supabase, listId)
    if (error) return dbFail('load list', error)
    if (!list) return { error: LIST_NOT_FOUND }
    if ('title' in changes && list.crm_lead_id) return { error: 'ชื่อของเช็กลิสต์ที่ผูกงานมาจาก CRM — แก้ที่การ์ด CRM แทน' }
    if (changes.owner_id) {
        const people = await allApproved(supabase, [changes.owner_id])
        if (people.error) return dbFail('check owner', people.error)
        if (!people.ok) return { error: PERSON_NOT_FOUND }
    }

    const { error: updateError } = await supabase
        .from('purchase_lists')
        .update({ ...changes, updated_at: new Date().toISOString() })
        .eq('id', listId)
    if (updateError) return dbFail('update list', updateError)

    await logActivity('UPDATE_PURCHASE_LIST', { listId, fields })
    revalidatePurchasing()
    return { success: true }
}

/** ลบเช็กลิสต์ — ตรวจ canDelete · ลบไฟล์รูปของทุกรายการก่อน แล้วลบใบ (รายการถูกลบตาม ON DELETE CASCADE) */
export async function deletePurchaseList(listId: string): Promise<Success | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(listId)) return { error: LIST_NOT_FOUND }

    const supabase = createServiceClient()
    const { list, error } = await loadList(supabase, listId)
    if (error) return dbFail('load list', error)
    if (!list) return { error: LIST_NOT_FOUND }
    if (!canDelete(actor, { createdBy: list.created_by, ownerId: list.owner_id })) return { error: NO_DELETE_RIGHT }

    const { data: items, error: itemsError } = await supabase.from('purchase_items').select('images').eq('list_id', listId)
    if (itemsError) return dbFail('load list images', itemsError)
    // ลบแถวแล้วจะไม่รู้ว่ามีรูปอะไรบ้าง จึงลบไฟล์ก่อน (best-effort — ไม่ throw)
    await removeStorageByUrls(supabase, BUCKET, (items || []).flatMap(i => (i.images as string[] | null) ?? []))

    const { error: deleteError } = await supabase.from('purchase_lists').delete().eq('id', listId)
    if (deleteError) return dbFail('delete list', deleteError)

    await logActivity('DELETE_PURCHASE_LIST', { listId, title: list.title, itemCount: (items || []).length })
    revalidatePurchasing()
    return { success: true }
}

// ============================================================================
// รายการ
// ============================================================================

/** เพิ่ม 1–50 รายการต่อท้ายใบ · แจ้งเตือนผู้รับผิดชอบ (ยกเว้นคนที่มอบหมายให้ตัวเอง) */
export async function addPurchaseItems(
    listId: string,
    items: PurchaseItemDraft[]
): Promise<Success<{ items: PurchaseItem[] }> | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(listId)) return { error: LIST_NOT_FOUND }
    if (!Array.isArray(items) || items.length === 0) return { error: 'ยังไม่มีรายการที่จะเพิ่ม' }
    if (items.length > MAX_ITEMS_PER_ADD) return { error: `เพิ่มได้ครั้งละไม่เกิน ${MAX_ITEMS_PER_ADD} รายการ` }

    const inputs: PurchaseItemInput[] = []
    for (let i = 0; i < items.length; i++) {
        const checked = validateItemInput(items[i])
        if (!checked.ok) return { error: items.length > 1 ? `รายการที่ ${i + 1}: ${checked.error}` : checked.error }
        inputs.push(checked.value)
    }

    const supabase = createServiceClient()
    const { list, error } = await loadList(supabase, listId)
    if (error) return dbFail('load list', error)
    if (!list) return { error: LIST_NOT_FOUND }
    const people = await allApproved(supabase, inputs.map(i => i.assignee_id))
    if (people.error) return dbFail('check assignees', people.error)
    if (!people.ok) return { error: PERSON_NOT_FOUND }

    const inserted = await insertItems(supabase, listId, inputs, actor.userId)
    if (inserted.error) return dbFail('add items', inserted.error)

    await Promise.all([
        touchList(supabase, listId, new Date().toISOString()),
        logActivity('CREATE_PURCHASE_ITEM', {
            listId,
            count: inserted.items.length,
            titles: inserted.items.slice(0, 10).map(i => i.title),
        }),
        notifyAssigned(list, inserted.items, actor),
    ])
    revalidatePurchasing()
    return { success: true, items: inserted.items }
}

/** แก้รายการ (เฉพาะช่องที่ส่งมา) · เปลี่ยนผู้รับผิดชอบ = แจ้งคนใหม่ */
export async function updatePurchaseItem(itemId: string, patch: PurchaseItemPatch): Promise<Success | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(itemId)) return { error: ITEM_NOT_FOUND }
    const checked = validateItemInput(patch, 'patch')
    if (!checked.ok) return { error: checked.error }
    const changes = checked.value
    const fields = Object.keys(changes)
    if (fields.length === 0) return { error: NOTHING_TO_SAVE }

    const supabase = createServiceClient()
    const { item, error } = await loadItem(supabase, itemId)
    if (error) return dbFail('load item', error)
    if (!item) return { error: ITEM_NOT_FOUND }
    if (changes.assignee_id) {
        const people = await allApproved(supabase, [changes.assignee_id])
        if (people.error) return dbFail('check assignee', people.error)
        if (!people.ok) return { error: PERSON_NOT_FOUND }
    }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
        .from('purchase_items')
        .update({ ...changes, updated_at: now })
        .eq('id', itemId)
    if (updateError) return dbFail('update item', updateError)

    const newAssignee = changes.assignee_id && changes.assignee_id !== item.assignee_id ? changes.assignee_id : null
    const list = newAssignee ? (await loadList(supabase, item.list_id)).list : null
    await Promise.all([
        touchList(supabase, item.list_id, now),
        logActivity('UPDATE_PURCHASE_ITEM', { itemId, listId: item.list_id, fields }),
        list && newAssignee
            ? notifyAssigned(list, [{ title: changes.title ?? item.title, assignee_id: newAssignee }], actor)
            : null,
    ])
    revalidatePurchasing()
    return { success: true }
}

/**
 * เปลี่ยนสถานะ — ประทับ status_changed_at/by · done_at เมื่อเสร็จ (ถอยแล้วล้าง)
 * สถานะเดิม = ไม่มีอะไรเปลี่ยน (ไม่เขียน ไม่แจ้ง ไม่ลง log)
 * รายการนี้ทำให้ใบ "เสร็จครบ" = แจ้งผู้รับผิดชอบและคนสร้างเช็กลิสต์ (แจ้งเฉพาะจังหวะที่เพิ่งครบ)
 */
export async function setPurchaseItemStatus(itemId: string, status: PurchaseStatus): Promise<Success | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(itemId)) return { error: ITEM_NOT_FOUND }
    if (!isPurchaseStatus(status)) return { error: 'สถานะไม่ถูกต้อง' }

    const supabase = createServiceClient()
    const { item, error } = await loadItem(supabase, itemId)
    if (error) return dbFail('load item', error)
    if (!item) return { error: ITEM_NOT_FOUND }
    if (item.status === status) return { success: true }

    const now = new Date().toISOString()
    const { data: changed, error: updateError } = await supabase
        .from('purchase_items')
        .update({
            status,
            status_changed_at: now,
            status_changed_by: actor.userId,
            done_at: status === 'done' ? now : null,
            updated_at: now,
        })
        .eq('id', itemId)
        .eq('status', item.status) // อีกคนเปลี่ยนไปก่อนแล้ว = แถวไม่ตรง ไม่ทับกัน
        .select('id')
    if (updateError) return dbFail('set status', updateError)
    if (!changed || changed.length === 0) return { error: 'รายการนี้เพิ่งถูกเปลี่ยนสถานะโดยคนอื่น กรุณาโหลดหน้าใหม่' }

    // ใบเพิ่งเสร็จครบ = รายการนี้เพิ่งเป็นเสร็จสิ้น และไม่เหลือรายการค้างในใบ
    let finishedList: ListRow | null = null
    if (status === 'done') {
        const { data: open, error: openError } = await supabase
            .from('purchase_items')
            .select('id')
            .eq('list_id', item.list_id)
            .neq('status', 'done')
            .limit(1)
        if (openError) console.error('[purchasing] check finished:', openError.code ?? '', openError.message)
        else if ((open || []).length === 0) finishedList = (await loadList(supabase, item.list_id)).list
    }

    await Promise.all([
        touchList(supabase, item.list_id, now),
        logActivity('UPDATE_PURCHASE_ITEM_STATUS', { itemId, listId: item.list_id, from: item.status, to: status }),
        finishedList
            ? createNotifications({
                userIds: [finishedList.owner_id, finishedList.created_by].filter((id): id is string => !!id),
                type: 'job_purchase_done',
                title: `ของครบแล้ว: ${finishedList.title}`,
                body: `ทุกรายการในเช็กลิสต์เสร็จสิ้นแล้ว (${actor.name} ปิดรายการสุดท้าย)`,
                referenceType: 'job',
                referenceId: finishedList.id,
                actorId: actor.userId,
            })
            : null,
    ])
    revalidatePurchasing()
    return { success: true }
}

/** ลบรายการ — ตรวจ canDelete (คนสร้างรายการ / ผู้รับผิดชอบเช็กลิสต์ / แอดมิน / ฝ่ายประสานงาน) · ลบไฟล์รูปด้วย */
export async function deletePurchaseItem(itemId: string): Promise<Success | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(itemId)) return { error: ITEM_NOT_FOUND }

    const supabase = createServiceClient()
    const { item, error } = await loadItem(supabase, itemId)
    if (error) return dbFail('load item', error)
    if (!item) return { error: ITEM_NOT_FOUND }
    // ผู้รับผิดชอบเช็กลิสต์อ่านจากใบของรายการนี้ในฐานข้อมูล ไม่รับจากผู้เรียก
    const { list, error: listError } = await loadList(supabase, item.list_id)
    if (listError) return dbFail('load list', listError)
    if (!canDelete(actor, { createdBy: item.created_by, ownerId: list?.owner_id ?? null })) return { error: NO_DELETE_RIGHT }

    await removeStorageByUrls(supabase, BUCKET, item.images ?? [])
    const { error: deleteError } = await supabase.from('purchase_items').delete().eq('id', itemId)
    if (deleteError) return dbFail('delete item', deleteError)

    await Promise.all([
        touchList(supabase, item.list_id, new Date().toISOString()),
        logActivity('DELETE_PURCHASE_ITEM', { itemId, listId: item.list_id, title: item.title }),
    ])
    revalidatePurchasing()
    return { success: true }
}

// ============================================================================
// รูปแนบ
// ============================================================================

/**
 * แนบรูป (ช่อง 'files' ของ FormData) — ตรวจชนิด ขนาด และจำนวนรวม ≤ 4 ครบก่อนอัปโหลดไฟล์แรก
 * อัปโหลดพลาดกลางทาง หรือบันทึกลงรายการไม่ได้ = ลบไฟล์ที่ขึ้นไปแล้วทิ้ง (ไม่ทิ้งไฟล์กำพร้าในบัคเก็ต)
 * path: {listId}/{itemId}/{ts}_{rand}.{ext}
 */
export async function uploadPurchaseImages(
    itemId: string,
    formData: FormData
): Promise<Success<{ images: string[] }> | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(itemId)) return { error: ITEM_NOT_FOUND }
    if (!formData || typeof formData.getAll !== 'function') return { error: 'กรุณาเลือกรูปที่จะแนบ' }

    const files = formData.getAll('files').filter((f): f is File => typeof f !== 'string')
    // ตรวจชนิด/ขนาดก่อน (ไม่ต้องรู้จำนวนรูปเดิม) แล้วค่อยตรวจจำนวนรวมหลังอ่านรายการ
    const fileError = imageFilesError(files, 0)
    if (fileError) return { error: fileError }

    const supabase = createServiceClient()
    const { item, error } = await loadItem(supabase, itemId)
    if (error) return dbFail('load item', error)
    if (!item) return { error: ITEM_NOT_FOUND }
    const existing = item.images ?? []
    const countError = imageFilesError(files, existing.length)
    if (countError) return { error: countError }

    const uploaded: string[] = []
    for (const file of files) {
        const path = `${item.list_id}/${item.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${IMAGE_EXT[file.type]}`
        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
        if (uploadError) {
            await removeStorageByUrls(supabase, BUCKET, uploaded)
            return dbFail('upload image', uploadError, 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        }
        uploaded.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
    }

    // ponytail: เขียนทับทั้ง array — สองคนแนบรูปรายการเดียวกันในวินาทีเดียวกัน รูปของคนหนึ่งอาจหลุด (ไฟล์ยังอยู่ในบัคเก็ต)
    const images = [...existing, ...uploaded]
    const now = new Date().toISOString()
    const { error: updateError } = await supabase.from('purchase_items').update({ images, updated_at: now }).eq('id', itemId)
    if (updateError) {
        await removeStorageByUrls(supabase, BUCKET, uploaded)
        return dbFail('save images', updateError, 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }

    await Promise.all([
        touchList(supabase, item.list_id, now),
        logActivity('UPDATE_PURCHASE_ITEM', { itemId, listId: item.list_id, imagesAdded: uploaded.length }),
    ])
    revalidatePurchasing()
    return { success: true, images }
}

/** ลบรูปหนึ่งรูป — ลบได้เฉพาะ url ที่อยู่ในรายการนั้นจริง (กันส่ง url ของรายการอื่น/บัคเก็ตอื่นมาลบ) */
export async function deletePurchaseImage(itemId: string, url: string): Promise<Success<{ images: string[] }> | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(itemId)) return { error: ITEM_NOT_FOUND }
    if (typeof url !== 'string' || !url) return { error: 'ไม่พบรูปนี้ในรายการ' }

    const supabase = createServiceClient()
    const { item, error } = await loadItem(supabase, itemId)
    if (error) return dbFail('load item', error)
    if (!item) return { error: ITEM_NOT_FOUND }
    const existing = item.images ?? []
    if (!existing.includes(url)) return { error: 'ไม่พบรูปนี้ในรายการ' }

    const images = existing.filter(u => u !== url)
    const now = new Date().toISOString()
    const { error: updateError } = await supabase.from('purchase_items').update({ images, updated_at: now }).eq('id', itemId)
    if (updateError) return dbFail('remove image', updateError)
    await removeStorageByUrls(supabase, BUCKET, [url])

    await Promise.all([
        touchList(supabase, item.list_id, now),
        logActivity('UPDATE_PURCHASE_ITEM', { itemId, listId: item.list_id, imageRemoved: true }),
    ])
    revalidatePurchasing()
    return { success: true, images }
}

// ============================================================================
// ชุดสำเร็จรูป
// ============================================================================

/** สร้าง (ไม่มี id) หรือแก้ (มี id) ชุดสำเร็จรูป — ทุกคนที่ล็อกอินทำได้ */
export async function savePurchaseTemplate(input: PurchaseTemplateDraft): Promise<Success<{ templateId: string }> | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!input || typeof input !== 'object') return { error: BAD_INPUT }
    const id = input.id == null || input.id === '' ? null : input.id
    if (id !== null && !isUuid(id)) return { error: TEMPLATE_NOT_FOUND }
    const checked = validateTemplateInput({ name: input.name, items: input.items })
    if (!checked.ok) return { error: checked.error }
    const { name, items } = checked.value

    const supabase = createServiceClient()
    let templateId: string
    if (id) {
        const { data, error } = await supabase
            .from('purchase_templates')
            .update({ name, items, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id')
        if (error) return dbFail('update template', error)
        if (!data || data.length === 0) return { error: TEMPLATE_NOT_FOUND }
        templateId = id
    } else {
        const { data, error } = await supabase
            .from('purchase_templates')
            .insert({ name, items, created_by: actor.userId })
            .select('id')
            .single()
        if (error || !data) return dbFail('create template', error ?? { message: 'no row returned' })
        templateId = data.id as string
    }

    await logActivity('SAVE_PURCHASE_TEMPLATE', { templateId, name, itemCount: items.length, created: !id })
    revalidatePurchasing()
    return { success: true, templateId }
}

/** บันทึกรายการในเช็กลิสต์นี้เป็นชุดสำเร็จรูปใหม่ (เก็บเฉพาะช่องของชุด — ไม่เก็บผู้รับผิดชอบ/สถานะ/ยอดจ่ายจริง) */
export async function saveListAsTemplate(listId: string, name: string): Promise<Success<{ templateId: string }> | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(listId)) return { error: LIST_NOT_FOUND }

    const supabase = createServiceClient()
    const { list, error } = await loadList(supabase, listId)
    if (error) return dbFail('load list', error)
    if (!list) return { error: LIST_NOT_FOUND }

    const { data: rows, error: itemsError } = await supabase
        .from('purchase_items')
        .select('title, kind, quantity, est_price, vendor, link_url, note')
        .eq('list_id', listId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    if (itemsError) return dbFail('load list items', itemsError)
    if (!rows || rows.length === 0) return { error: 'เช็กลิสต์นี้ยังไม่มีรายการให้บันทึกเป็นชุด' }

    const checked = validateTemplateInput({ name, items: rows })
    if (!checked.ok) return { error: checked.error }

    const { data, error: insertError } = await supabase
        .from('purchase_templates')
        .insert({ name: checked.value.name, items: checked.value.items, created_by: actor.userId })
        .select('id')
        .single()
    if (insertError || !data) return dbFail('save list as template', insertError ?? { message: 'no row returned' })
    const templateId = data.id as string

    await logActivity('SAVE_PURCHASE_TEMPLATE', {
        templateId,
        name: checked.value.name,
        itemCount: checked.value.items.length,
        fromListId: listId,
    })
    revalidatePurchasing()
    return { success: true, templateId }
}

/** ต่อท้ายรายการจากชุดสำเร็จรูป (สถานะวางแผน ไม่มีผู้รับผิดชอบ) */
export async function applyPurchaseTemplate(
    listId: string,
    templateId: string
): Promise<Success<{ items: PurchaseItem[] }> | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(listId)) return { error: LIST_NOT_FOUND }
    if (!isUuid(templateId)) return { error: TEMPLATE_NOT_FOUND }

    const supabase = createServiceClient()
    const [{ list, error }, loaded] = await Promise.all([loadList(supabase, listId), loadTemplateItems(supabase, templateId)])
    if (error) return dbFail('load list', error)
    if (!list) return { error: LIST_NOT_FOUND }
    if ('error' in loaded) return loaded

    const inserted = await insertItems(supabase, listId, loaded.items, actor.userId)
    if (inserted.error) return dbFail('apply template', inserted.error)

    await Promise.all([
        touchList(supabase, listId, new Date().toISOString()),
        logActivity('CREATE_PURCHASE_ITEM', { listId, templateId, count: inserted.items.length }),
    ])
    revalidatePurchasing()
    return { success: true, items: inserted.items }
}

/** ลบชุดสำเร็จรูป — ตรวจ canDelete (คนสร้างชุด / แอดมิน / ฝ่ายประสานงาน) */
export async function deletePurchaseTemplate(id: string): Promise<Success | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(id)) return { error: TEMPLATE_NOT_FOUND }

    const supabase = createServiceClient()
    const { data: template, error } = await supabase
        .from('purchase_templates')
        .select('id, name, created_by')
        .eq('id', id)
        .maybeSingle()
    if (error) return dbFail('load template', error)
    if (!template) return { error: TEMPLATE_NOT_FOUND }
    if (!canDelete(actor, { createdBy: (template.created_by as string | null) ?? null, ownerId: null })) {
        return { error: NO_DELETE_RIGHT }
    }

    const { error: deleteError } = await supabase.from('purchase_templates').delete().eq('id', id)
    if (deleteError) return dbFail('delete template', deleteError)

    await logActivity('DELETE_PURCHASE_TEMPLATE', { templateId: id, name: template.name })
    revalidatePurchasing()
    return { success: true }
}

// ============================================================================
// ผูกใบเบิก (expense_claims) — สเปคหัวข้อ "ผูกใบเบิก"
// รายการหนึ่งข้อผูกได้ใบเดียว · ใบเบิกหนึ่งใบผูกได้หลายรายการ ข้ามเช็กลิสต์ได้ · ไม่ส่งยอดเข้าต้นทุน (ไม่นับซ้ำ)
// ============================================================================

/** จำนวนรายการจัดซื้อที่ผูกกับใบเบิกแต่ละใบ (ทุกเช็กลิสต์) — อ่านทีละ 1,000 แถวจนหมด */
async function countLinkedItems(
    supabase: Db,
    claimIds: string[]
): Promise<{ counts: Map<string, number>; error: DbError | null }> {
    const counts = new Map<string, number>()
    if (claimIds.length === 0) return { counts, error: null }
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('purchase_items')
            .select('id, expense_claim_id')
            .in('expense_claim_id', claimIds)
            .order('id')
            .range(from, from + PAGE_SIZE - 1)
        if (error) return { counts, error }
        for (const row of data || []) {
            const id = row.expense_claim_id as string
            counts.set(id, (counts.get(id) ?? 0) + 1)
        }
        if (!data || data.length < PAGE_SIZE) return { counts, error: null }
    }
}

/**
 * ค้นใบเบิกที่ผู้ใช้ผูกได้ — สูงสุด 20 ใบ ใหม่สุดก่อน · ค้นจากเลขที่หรือชื่อใบเบิก (คำค้นว่าง = ใบล่าสุด)
 * เฉพาะประเภท event / other / advance ที่ไม่ถูกปฏิเสธ/ยกเลิก · ไม่ใช่แอดมิน = เฉพาะใบที่ตัวเองเป็นผู้เบิก
 * คืนจำนวนรายการที่ผูกอยู่แล้วของแต่ละใบ · ชื่อผู้เบิกเฉพาะผลค้นของแอดมิน
 */
export async function searchPurchaseClaims(query: string): Promise<{ claims: PurchaseClaimOption[] } | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }

    // ตัดอักขระที่มีความหมายใน or() ของ PostgREST ออกก่อนต่อเป็น filter
    const q = cleanSearchQuery(query)
    const supabase = createServiceClient()
    let search = supabase
        .from('expense_claims')
        .select(CLAIM_OPTION_COLUMNS)
        .in('claim_type', [...LINKABLE_CLAIM_TYPES])
        .not('status', 'in', '(rejected,cancelled)')
    // 🔒 ไม่ใช่แอดมินเห็นเฉพาะใบเบิกของตัวเอง (กติกาเดียวกับ Finance) — กรองที่ฐานข้อมูล ไม่ใช่หลังอ่านมา
    if (!actor.isAdmin) search = search.eq('submitted_by', actor.userId)
    if (q) search = search.or(`claim_number.ilike.*${q}*,title.ilike.*${q}*`)
    const { data, error } = await search
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(SEARCH_LIMIT)
    if (error) return dbFail('search claims', error, CLAIM_SEARCH_FAILED)
    const rows = (data || []) as Record<string, unknown>[]
    if (rows.length === 0) return { claims: [] }

    const linked = await countLinkedItems(supabase, rows.map(r => String(r.id)))
    if (linked.error) return dbFail('count linked items', linked.error, CLAIM_SEARCH_FAILED)

    // ชื่อผู้เบิก — แอดมินเห็นใบของทุกคนจึงต้องรู้ว่าใบไหนของใคร (คนอื่นเห็นแต่ใบของตัวเอง)
    const names = new Map<string, string>()
    if (actor.isAdmin) {
        const submitters = [...new Set(rows.map(r => r.submitted_by).filter((id): id is string => typeof id === 'string' && !!id))]
        if (submitters.length > 0) {
            const { data: people, error: peopleError } = await supabase
                .from('profiles')
                .select('id, full_name, nickname')
                .in('id', submitters)
            if (peopleError) return dbFail('load submitters', peopleError, CLAIM_SEARCH_FAILED)
            for (const p of people || []) {
                names.set(p.id as string, personName({ name: (p.full_name as string | null) || 'ไม่ทราบชื่อ', nickname: p.nickname as string | null }))
            }
        }
    }

    return {
        claims: rows.map(r =>
            toPurchaseClaimOption(
                r,
                linked.counts.get(String(r.id)) ?? 0,
                actor.isAdmin ? (names.get(String(r.submitted_by)) ?? null) : null
            )
        ),
    }
}

/**
 * ผูก 1–50 รายการ (ข้ามเช็กลิสต์ได้) กับใบเบิกหนึ่งใบ — รายการที่ผูกใบอื่นอยู่ถูกแทนที่ (หนึ่งรายการมีใบเบิกเดียว)
 * ใบเบิกต้องมีอยู่ ผูกได้ (isLinkableClaim) และผู้กดเห็นได้ (canSeeClaim) — เห็นไม่ได้ = ตอบเหมือนไม่มีใบนี้
 * ทุก id ต้องมีอยู่จริง ไม่งั้นไม่ผูกเลยสักรายการ (id ซ้ำนับครั้งเดียว) · แตะ updated_at ของทุกเช็กลิสต์ที่เกี่ยว
 */
export async function linkPurchaseItemsToClaim(
    itemIds: string[],
    claimId: string
): Promise<Success<{ linked: number }> | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(claimId)) return { error: CLAIM_NOT_FOUND }
    if (!Array.isArray(itemIds) || itemIds.length === 0) return { error: 'ยังไม่ได้เลือกรายการที่จะผูก' }
    if (itemIds.length > MAX_ITEMS_PER_LINK) return { error: `ผูกได้ครั้งละไม่เกิน ${MAX_ITEMS_PER_LINK} รายการ` }
    if (!itemIds.every(isUuid)) return { error: SOME_ITEMS_NOT_FOUND }
    const ids = [...new Set(itemIds.map(id => id.toLowerCase()))]

    const supabase = createServiceClient()
    const { data: claim, error: claimError } = await supabase
        .from('expense_claims')
        .select('id, claim_number, claim_type, status, submitted_by')
        .eq('id', claimId)
        .maybeSingle()
    if (claimError) return dbFail('load claim', claimError)
    // 🔒 ใบของคนอื่น (ผู้กดไม่ใช่แอดมิน) = ตอบเหมือนไม่มีใบนี้ — ไม่ยืนยันว่ามีใบนี้อยู่จริง
    if (!claim || !canSeeClaim(actor, (claim.submitted_by as string | null) ?? null)) return { error: CLAIM_NOT_FOUND }
    if (!isLinkableClaim(claim)) return { error: CLAIM_NOT_LINKABLE }
    const linkTo = claim.id as string

    const { data: found, error: itemsError } = await supabase
        .from('purchase_items')
        .select('id, list_id, expense_claim_id')
        .in('id', ids)
    if (itemsError) return dbFail('load items to link', itemsError)
    const rows = (found || []) as { id: string; list_id: string; expense_claim_id: string | null }[]
    if (rows.length !== ids.length) return { error: SOME_ITEMS_NOT_FOUND }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
        .from('purchase_items')
        .update({ expense_claim_id: linkTo, updated_at: now })
        .in('id', ids)
    if (updateError) return dbFail('link claim', updateError)

    const listIds = [...new Set(rows.map(r => r.list_id))]
    // ใบเบิกเดิมของรายการที่ถูกแทนที่ — หน้าของใบนั้นต้องเลิกแสดงรายการเหล่านี้ด้วย
    const replaced = [...new Set(rows.map(r => r.expense_claim_id).filter((id): id is string => !!id && id !== linkTo))]
    await Promise.all([
        touchLists(supabase, listIds, now),
        logActivity('LINK_PURCHASE_ITEM_CLAIM', {
            claimId: linkTo,
            claimNumber: claim.claim_number,
            itemIds: ids,
            listIds,
            replacedClaimIds: replaced,
        }),
    ])
    revalidatePurchasing()
    for (const id of [linkTo, ...replaced]) revalidatePath(`/finance/${id}`)
    return { success: true, linked: ids.length }
}

/** เลิกผูกใบเบิกของรายการ — ทุกคนที่ล็อกอินทำได้ (เป็นการแก้รายการแบบหนึ่ง) · ไม่ได้ผูกอยู่ = สำเร็จโดยไม่เขียนอะไร */
export async function unlinkPurchaseItemClaim(itemId: string): Promise<Success | Failure> {
    const actor = await getActor()
    if (!actor) return { error: NOT_SIGNED_IN }
    if (!isUuid(itemId)) return { error: ITEM_NOT_FOUND }

    const supabase = createServiceClient()
    const { data: item, error } = await supabase
        .from('purchase_items')
        .select('id, list_id, title, expense_claim_id')
        .eq('id', itemId)
        .maybeSingle()
    if (error) return dbFail('load item claim', error)
    if (!item) return { error: ITEM_NOT_FOUND }
    const claimId = (item.expense_claim_id as string | null) ?? null
    if (!claimId) return { success: true }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
        .from('purchase_items')
        .update({ expense_claim_id: null, updated_at: now })
        .eq('id', itemId)
    if (updateError) return dbFail('unlink claim', updateError)

    await Promise.all([
        touchList(supabase, item.list_id as string, now),
        logActivity('UNLINK_PURCHASE_ITEM_CLAIM', { itemId, listId: item.list_id, title: item.title, claimId }),
    ])
    revalidatePurchasing()
    revalidatePath(`/finance/${claimId}`)
    return { success: true }
}
