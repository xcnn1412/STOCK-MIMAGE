'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity, type ActionType } from '@/lib/logger'
import { createNotifications, type NotificationType } from '@/lib/notifications'
import { formatAddress, parseAddress } from '@/lib/thai-address'
import { getSession } from './session'
import {
  DOC_TYPES, TRANSITIONS, EDITABLE_STATUSES, SC_LOCKED_META_KEYS, SC_LOCKED_PARTY_KEYS,
  calcDocumentTotals, calcItemAmount,
  canTransition, isMetaEmpty, sanitizeMeta,
  type DocAction, type DocBrandRow, type DocTypeCode, type DocumentItemRow,
  type DocumentLogRow, type DocumentRow, type VatMode,
} from './doc-types'

const SELECT_DOC = '*, creator:profiles!documents_created_by_fkey(id, full_name)'

// ============================================================================
// Brands
// ============================================================================

export async function getBrands(activeOnly = true): Promise<DocBrandRow[]> {
  const { userId } = await getSession()
  if (!userId) return []

  const supabase = createServiceClient()
  let query = supabase.from('doc_brands').select('*').order('sort_order', { ascending: true })
  if (activeOnly) query = query.eq('is_active', true)

  const { data } = await query
  return (data || []) as unknown as DocBrandRow[]
}

// ============================================================================
// List / Get
// ============================================================================

export interface DocumentFilters {
  q?: string
  brand?: string
  type?: string
  status?: string
  month?: string // YYYY-MM
}

export async function listDocuments(filters?: DocumentFilters) {
  const { userId, role } = await getSession()
  if (!userId) return { data: [], error: 'Unauthorized' }

  const supabase = createServiceClient()
  let query = supabase
    .from('documents')
    .select(SELECT_DOC)
    .order('created_at', { ascending: false })
    .limit(200)

  // เห็นทุกใบที่ออกเลขแล้ว + ร่างของตัวเอง; admin เห็นทั้งหมด
  if (role !== 'admin') query = query.or(`doc_no.not.is.null,created_by.eq.${userId}`)

  if (filters?.brand) query = query.eq('brand_code', filters.brand)
  if (filters?.type) query = query.eq('doc_type', filters.type)
  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.q) {
    // ตัวอักษรที่ทำให้ไวยากรณ์ .or()/ilike ของ PostgREST เพี้ยน — ตัดทิ้งก่อนเสมอ
    const q = filters.q.replace(/[%,()"'\\]/g, '').replace(/\s+/g, ' ').trim()
    if (q) query = query.or(`doc_no.ilike.%${q}%,draft_no.ilike.%${q}%,party_name.ilike.%${q}%`)
  }
  if (filters?.month) {
    // ponytail: บวกเดือนเป็นสตริงตรงๆ — `new Date(...).toISOString()` เลื่อนวันย้อนหลังตาม timezone (+07)
    // ทำให้เอกสารวันสุดท้ายของเดือนหายไปจากผลลัพธ์
    const y = Number(filters.month.slice(0, 4))
    const m = Number(filters.month.slice(5, 7))
    if (y && m) {
      const start = `${filters.month}-01`
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      query = query.gte('doc_date', start).lt('doc_date', end)
    }
  }

  const { data, error } = await query
  if (error) return { data: [], error: error.message }
  return { data: (data || []) as unknown as DocumentRow[], error: null }
}

export async function getDocument(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('documents').select(SELECT_DOC).eq('id', id).single()
  if (error || !data) return { error: 'ไม่พบเอกสาร' }

  const doc = data as unknown as DocumentRow
  if (role !== 'admin' && !doc.doc_no && doc.created_by !== userId) {
    return { error: 'ไม่มีสิทธิ์เข้าถึงเอกสารนี้' }
  }

  const [itemsRes, logsRes, brandRes, refRes, refByRes] = await Promise.all([
    supabase.from('document_items').select('*').eq('document_id', id).order('line_no', { ascending: true }),
    supabase
      .from('document_logs')
      .select('*, changer:profiles!document_logs_changed_by_fkey(id, full_name)')
      .eq('document_id', id)
      .order('created_at', { ascending: true }),
    supabase.from('doc_brands').select('*').eq('code', doc.brand_code).single(),
    doc.ref_document_id
      ? supabase.from('documents').select('id, doc_no, doc_type').eq('id', doc.ref_document_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('documents')
      .select('id, doc_no, doc_type, status')
      .eq('ref_document_id', id)
      .order('created_at', { ascending: true }),
  ])

  return {
    document: doc,
    items: (itemsRes.data || []) as unknown as DocumentItemRow[],
    logs: (logsRes.data || []) as unknown as DocumentLogRow[],
    brand: (brandRes.data || null) as unknown as DocBrandRow | null,
    refDocument: (refRes.data || null) as unknown as { id: string; doc_no: string | null; doc_type: string } | null,
    referencedBy: (refByRes.data || []) as unknown as ReferencedByRow[],
  }
}

/** เอกสารที่อ้างอิงมายังใบนี้ (การ์ด "เอกสารที่เกี่ยวข้อง") */
export interface ReferencedByRow {
  id: string
  doc_no: string | null
  doc_type: string
  status: string
}

/** ตัวเลือกสำหรับช่อง "อ้างอิงเอกสาร" — เฉพาะใบที่ออกเลขแล้วของแบรนด์เดียวกัน */
export interface RefCandidate {
  id: string
  doc_no: string | null
  doc_type: string
  party_name: string | null
  total: number
}

export async function listRefCandidates(brand_code: string, types: string[]): Promise<RefCandidate[]> {
  const { userId } = await getSession()
  if (!userId || !brand_code || !types?.length) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('documents')
    .select('id, doc_no, doc_type, party_name, total')
    .eq('brand_code', brand_code)
    .in('doc_type', types)
    .in('status', ['issued', 'sent', 'closed'])
    .not('doc_no', 'is', null)
    .order('doc_no', { ascending: false })
    .limit(100)

  return (data || []) as unknown as RefCandidate[]
}

// ============================================================================
// SC — หนังสือรับรองเงินเดือน: ค่าตั้งต้นจากข้อมูลของพนักงานเอง
// ผู้ขอไม่ได้พิมพ์เงินเดือน/ตำแหน่งเอง — ระบบอ่านจาก salary_profiles + profiles
// (ที่เดียว ใช้ทั้งตอนสร้างร่าง, ตอนบันทึก และหน้าเลือกประเภทเอกสาร)
// ============================================================================

// ponytail: ไม่ export — ไฟล์ 'use server' export ได้เฉพาะ async function (type ไม่นับ เพราะถูกลบตอน compile)
const NO_SALARY_PROFILE_MSG =
  'ยังไม่มีข้อมูลเงินเดือนของคุณ — ติดต่อ admin ให้ตั้งค่าในเมนูเงินเดือนก่อน'

/** ค่าที่ระบบเติมให้เอง — คีย์ตรงกับคอลัมน์ documents และคีย์ใน meta */
export interface SalaryCertificateDefaults {
  party_name: string | null
  party_id_card: string | null
  party_address: string | null
  party_phone: string | null
  party_email: string | null
  party_birth_date: string | null
  meta: {
    position: string
    department: string
    start_date: string | null
    base_salary: number
  }
}

/**
 * อ่านค่าตั้งต้นของ SC สำหรับ user คนหนึ่ง
 * ponytail: query แบบ untyped เหมือน action อื่นในโมดูลนี้ (database.types.ts ยังไม่มี salary_profiles)
 */
async function scDefaultsFor(
  supabase: any,
  userId: string
): Promise<{ error: string } | { defaults: SalaryCertificateDefaults }> {
  const [profileRes, salaryRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, national_id, address, phone, department')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('salary_profiles')
      .select('position, start_date, base_salary')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const salary = salaryRes.data as
    | { position: string | null; start_date: string | null; base_salary: number | string | null }
    | null
  if (!salary) return { error: NO_SALARY_PROFILE_MSG }

  const p = (profileRes.data || {}) as Record<string, string | null>
  // ที่อยู่ในโปรไฟล์เก็บเป็น JSON (lib/thai-address.ts) — แปลงเป็นบรรทัดเดียวสำหรับหัวเอกสาร
  const address = p.address ? formatAddress(parseAddress(p.address)) : ''

  return {
    defaults: {
      party_name: p.full_name || null,
      party_id_card: p.national_id || null,
      party_address: address || null,
      party_phone: p.phone || null,
      party_email: null, // profiles ไม่มีคอลัมน์อีเมล
      party_birth_date: null, // profiles ไม่มีคอลัมน์วันเกิด
      meta: {
        position: salary.position || '',
        department: p.department || '',
        start_date: salary.start_date || null,
        base_salary: Number(salary.base_salary ?? 0),
      },
    },
  }
}

/**
 * ให้หน้าเลือกประเภทเอกสารเรียกก่อนสร้างร่าง SC — ไม่มีข้อมูลเงินเดือนก็บอกตั้งแต่ต้น
 * แทนที่จะปล่อยให้สร้างร่างเปล่าแล้วไปตันตอนส่งอนุมัติ
 */
export async function getSalaryCertificateDefaults() {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  return scDefaultsFor(createServiceClient(), userId)
}

// ============================================================================
// Create / Save / Delete / Duplicate
// ============================================================================

async function nextDraftNo(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('next_doc_counter', {
    p_brand: '*', p_type: '*', p_period: 'draft', p_actor: userId,
  })
  if (error || data == null) return null
  return `DRAFT-${String(data).padStart(4, '0')}`
}

export async function createDocument(params: { brand_code: string; doc_type: DocTypeCode }) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const def = DOC_TYPES[params.doc_type]
  if (!def) return { error: 'ประเภทเอกสารไม่ถูกต้อง' }
  if (def.enabled === false) return { error: 'เอกสารประเภทนี้ปิดปรับปรุงชั่วคราว' }

  const supabase = createServiceClient()
  const { data: brandData } = await supabase.from('doc_brands').select('*').eq('code', params.brand_code).single()
  const brand = brandData as unknown as DocBrandRow | null
  if (!brand || !brand.is_active) return { error: 'ไม่พบแบรนด์ หรือแบรนด์ถูกปิดใช้งาน' }
  if (params.doc_type === 'TX' && !brand.vat_registered) {
    return { error: 'แบรนด์นี้ไม่ได้จดทะเบียน VAT — ออกใบกำกับภาษีไม่ได้' }
  }

  // SC: ร่างเกิดมาพร้อมข้อมูลของผู้ขอเลย — ไม่มีข้อมูลเงินเดือนก็ไม่ให้สร้าง
  let seed: Record<string, unknown> = {}
  if (params.doc_type === 'SC') {
    const res = await scDefaultsFor(supabase, userId)
    if ('error' in res) return { error: res.error }
    const { meta, ...party } = res.defaults
    seed = { ...party, meta }
  }

  const draft_no = await nextDraftNo(supabase, userId)
  if (!draft_no) return { error: 'ออกเลขร่างไม่สำเร็จ' }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      draft_no,
      brand_code: brand.code,
      doc_type: params.doc_type,
      status: 'draft',
      vat_mode: def.hasAmounts ? brand.default_vat_mode : 'none',
      wht_rate: def.hasAmounts ? brand.default_wht_rate : 0,
      created_by: userId,
      ...seed,
    })
    .select('id')
    .single()

  if (error || !data) return { error: error?.message || 'สร้างเอกสารไม่สำเร็จ' }

  await logActivity('CREATE_DOCUMENT', { document_id: data.id, draft_no, doc_type: params.doc_type, brand_code: brand.code })
  revalidatePath('/documents')
  return { id: data.id as string }
}

export interface SaveDraftPayload {
  party_name?: string | null
  party_company?: string | null
  party_tax_id?: string | null
  party_address?: string | null
  party_phone?: string | null
  party_email?: string | null
  party_id_card?: string | null
  party_birth_date?: string | null
  doc_date?: string | null
  meta?: Record<string, unknown>
  vat_mode?: VatMode
  wht_rate?: number
  notes?: string | null
  ref_document_id?: string | null
  items?: Array<{ description?: string | null; quantity?: number | null; unit?: string | null; unit_price?: number | null; discount?: number | null }>
}

export async function saveDraft(id: string, payload: SaveDraftPayload) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data: docData } = await supabase.from('documents').select('*').eq('id', id).single()
  const doc = docData as unknown as DocumentRow | null
  if (!doc) return { error: 'ไม่พบเอกสาร' }
  if (!EDITABLE_STATUSES.includes(doc.status)) return { error: 'เอกสารนี้แก้ไขไม่ได้แล้ว' }
  if (role !== 'admin' && doc.created_by !== userId) return { error: 'ไม่มีสิทธิ์แก้ไขเอกสารนี้' }

  const def = DOC_TYPES[doc.doc_type]
  const items = def?.hasItems ? (payload.items || []) : []
  const vat_mode: VatMode = def?.hasAmounts ? (payload.vat_mode || 'none') : 'none'
  const wht_rate = def?.hasAmounts ? Number(payload.wht_rate || 0) : 0
  const totals = calcDocumentTotals(items, vat_mode, wht_rate)

  const partyOut: Record<string, string | null> = {
    party_name: payload.party_name ?? null,
    party_company: payload.party_company ?? null,
    party_tax_id: payload.party_tax_id ?? null,
    party_address: payload.party_address ?? null,
    party_phone: payload.party_phone ?? null,
    party_email: payload.party_email ?? null,
    party_id_card: payload.party_id_card ?? null,
    party_birth_date: payload.party_birth_date || null,
  }
  const metaOut = sanitizeMeta(payload.meta)

  // ── ยาม SC ────────────────────────────────────────────────────────────────
  // พนักงานออกหนังสือรับรองเงินเดือนให้ตัวเองได้ แต่ตัวเลขต้องมาจากฐานข้อมูล
  // ไม่ใช่จาก payload — ทิ้งค่าที่ client ส่งมาแล้ว derive ใหม่ฝั่ง server เสมอ
  // (เจ้าของเอกสารคือผู้ถูกรับรอง; admin แก้ได้ตามที่กรอก)
  if (doc.doc_type === 'SC' && role !== 'admin') {
    const res = await scDefaultsFor(supabase, doc.created_by || userId)
    // ข้อมูลเงินเดือนหาย (ถูกลบหลังสร้างร่าง) → คงค่าเดิมใน DB ไว้ ไม่รับของ client
    const src = 'error' in res
      ? {
          party: Object.fromEntries(
            SC_LOCKED_PARTY_KEYS.map(k => [k, (doc as unknown as Record<string, string | null>)[k] ?? null])
          ) as Record<string, string | null>,
          meta: Object.fromEntries(
            SC_LOCKED_META_KEYS.map(k => [k, ((doc.meta || {}) as Record<string, unknown>)[k] ?? null])
          ) as Record<string, unknown>,
        }
      : {
          party: res.defaults as unknown as Record<string, string | null>,
          meta: res.defaults.meta as unknown as Record<string, unknown>,
        }

    for (const k of SC_LOCKED_PARTY_KEYS) partyOut[k] = src.party[k] ?? null
    for (const k of SC_LOCKED_META_KEYS) metaOut[k] = src.meta[k] ?? null
  }

  const { error: upErr } = await supabase
    .from('documents')
    .update({
      ...partyOut,
      doc_date: payload.doc_date || null,
      // ponytail: ฟิลด์ richtext เก็บ HTML — ล้าง <script>/on* ก่อนลง DB (ยามชั้น trust boundary)
      meta: metaOut,
      vat_mode,
      wht_rate,
      notes: payload.notes ?? null,
      ref_document_id: payload.ref_document_id || null,
      ...totals,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (upErr) return { error: upErr.message }

  // แทนที่รายการทั้งชุด — ponytail: ลบ+ใส่ใหม่ ง่ายกว่าการ diff ทีละแถว
  await supabase.from('document_items').delete().eq('document_id', id)
  if (items.length > 0) {
    const rows = items.map((it, i) => ({
      document_id: id,
      line_no: i + 1,
      description: it.description ?? null,
      quantity: Number(it.quantity ?? 0),
      unit: it.unit ?? null,
      unit_price: Number(it.unit_price ?? 0),
      discount: Number(it.discount ?? 0),
      amount: calcItemAmount(it),
    }))
    const { error: itemErr } = await supabase.from('document_items').insert(rows)
    if (itemErr) return { error: itemErr.message }
  }

  await logActivity('UPDATE_DOCUMENT', { document_id: id, draft_no: doc.draft_no, items: items.length })
  revalidatePath('/documents')
  revalidatePath(`/documents/${id}`)
  return { success: true }
}

export async function deleteDraft(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data: docData } = await supabase.from('documents').select('*').eq('id', id).single()
  const doc = docData as unknown as DocumentRow | null
  if (!doc) return { error: 'ไม่พบเอกสาร' }
  if (doc.doc_no || !EDITABLE_STATUSES.includes(doc.status)) return { error: 'ลบได้เฉพาะร่างที่ยังไม่ออกเลข' }
  if (role !== 'admin' && doc.created_by !== userId) return { error: 'ไม่มีสิทธิ์ลบเอกสารนี้' }

  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) return { error: error.message }

  await logActivity('DELETE_DOCUMENT', { document_id: id, draft_no: doc.draft_no })
  revalidatePath('/documents')
  return { success: true }
}

export async function duplicateDocument(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data: docData } = await supabase.from('documents').select('*').eq('id', id).single()
  const doc = docData as unknown as DocumentRow | null
  if (!doc) return { error: 'ไม่พบเอกสาร' }
  if (role !== 'admin' && !doc.doc_no && doc.created_by !== userId) return { error: 'ไม่มีสิทธิ์เข้าถึงเอกสารนี้' }

  // SC: คัดลอกใบของคนอื่นแล้วส่งขออนุมัติไม่ได้ — non-admin ได้ข้อมูลของตัวเองเสมอ
  let scSeed: Record<string, unknown> = {}
  if (doc.doc_type === 'SC' && role !== 'admin') {
    const res = await scDefaultsFor(supabase, userId)
    if ('error' in res) return { error: res.error }
    const { meta, ...party } = res.defaults
    scSeed = { ...party, meta: { ...((doc.meta || {}) as Record<string, unknown>), ...meta } }
  }

  const draft_no = await nextDraftNo(supabase, userId)
  if (!draft_no) return { error: 'ออกเลขร่างไม่สำเร็จ' }

  const { data: created, error } = await supabase
    .from('documents')
    .insert({
      draft_no,
      brand_code: doc.brand_code,
      doc_type: doc.doc_type,
      status: 'draft',
      party_name: doc.party_name,
      party_company: doc.party_company,
      party_tax_id: doc.party_tax_id,
      party_address: doc.party_address,
      party_phone: doc.party_phone,
      party_email: doc.party_email,
      party_id_card: doc.party_id_card,
      party_birth_date: doc.party_birth_date,
      meta: doc.meta ?? {},
      ...scSeed,
      vat_mode: doc.vat_mode,
      wht_rate: doc.wht_rate,
      subtotal: doc.subtotal,
      discount_total: doc.discount_total,
      vat_amount: doc.vat_amount,
      wht_amount: doc.wht_amount,
      total: doc.total,
      net_payable: doc.net_payable,
      notes: doc.notes,
      created_by: userId,
    })
    .select('id')
    .single()
  if (error || !created) return { error: error?.message || 'คัดลอกไม่สำเร็จ' }

  const { data: items } = await supabase.from('document_items').select('*').eq('document_id', id).order('line_no')
  const srcItems = (items || []) as unknown as DocumentItemRow[]
  if (srcItems.length > 0) {
    await supabase.from('document_items').insert(srcItems.map((it, i) => ({
      document_id: created.id,
      line_no: i + 1,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      discount: it.discount,
      amount: it.amount,
    })))
  }

  await logActivity('CREATE_DOCUMENT', { document_id: created.id, draft_no, duplicated_from: id })
  revalidatePath('/documents')
  return { id: created.id as string }
}

// ============================================================================
// Transition — ประตูเดียวของทุกการเปลี่ยนสถานะ
// ============================================================================

const ACTION_LOG: Record<DocAction, ActionType> = {
  submit:    'SUBMIT_DOCUMENT',
  approve:   'APPROVE_DOCUMENT',
  reject:    'REJECT_DOCUMENT',
  issue:     'ISSUE_DOCUMENT_NUMBER',
  void:      'VOID_DOCUMENT',
  mark_sent: 'MARK_DOCUMENT_SENT',
  close:     'CLOSE_DOCUMENT',
}

/** ตรวจความครบถ้วนก่อนออกเลข/ส่งขออนุมัติ */
async function validateForIssue(supabase: any, doc: DocumentRow): Promise<string | null> {
  const def = DOC_TYPES[doc.doc_type]
  if (!def) return 'ประเภทเอกสารไม่ถูกต้อง'

  if (def.party !== 'none' && !doc.party_name?.trim()) return 'กรุณากรอกชื่อคู่สัญญา'

  if (def.hasItems) {
    const { count } = await supabase
      .from('document_items')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', doc.id)
    if (!count) return 'ต้องมีรายการอย่างน้อย 1 รายการ'
  }

  if (def.hasAmounts) {
    const { data } = await supabase.from('doc_brands').select('tax_id, address').eq('code', doc.brand_code).single()
    if (!data?.tax_id?.trim() || !data?.address?.trim()) {
      return 'แบรนด์นี้ยังไม่มีเลขผู้เสียภาษี/ที่อยู่ — กรุณากรอกในหน้าตั้งค่าก่อน'
    }
  }

  if (def.refRequired && !doc.ref_document_id) return 'ต้องอ้างอิงเอกสารต้นทาง'

  const meta = (doc.meta || {}) as Record<string, unknown>
  for (const f of def.metaFields) {
    if (!f.required) continue
    if (isMetaEmpty(f, meta[f.key])) {
      return f.type === 'checkbox'
        ? `กรุณาติ๊กยืนยัน "${f.label.th}"`
        : `กรุณากรอก "${f.label.th}"`
    }
  }

  return null
}

export async function transitionDocument(id: string, action: DocAction, note?: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const def = TRANSITIONS[action]
  if (!def) return { error: 'การกระทำไม่ถูกต้อง' }

  const supabase = createServiceClient()
  const { data: docData } = await supabase.from('documents').select('*').eq('id', id).single()
  const doc = docData as unknown as DocumentRow | null
  if (!doc) return { error: 'ไม่พบเอกสาร' }

  // ประตูเดียวที่ตัดสินว่า transition นี้ถูกกฎไหม (ฝั่ง client เรียกตัวเดียวกันคุมปุ่ม)
  const gate = canTransition(action, doc, role, userId)
  if (!gate.ok) return { error: gate.reason }

  if (def.requiresNote && !note?.trim()) return { error: 'กรุณาระบุเหตุผล' }

  if (action === 'submit' || action === 'issue') {
    const invalid = await validateForIssue(supabase, doc)
    if (invalid) return { error: invalid }
  }

  const fromStatus = doc.status
  let docNo: string | null = doc.doc_no
  const now = new Date().toISOString()

  if (action === 'approve' || action === 'issue') {
    // ออกเลขจริงในธุรกรรมเดียวฝั่ง DB (ล็อกตัวนับ + เขียน log 'issue' ให้เอง)
    const { data: issued, error: rpcErr } = await supabase.rpc('issue_document_number', {
      p_doc_id: id, p_actor: userId, p_template_version_id: null,
    })
    if (rpcErr) return { error: rpcErr.message }
    docNo = issued as unknown as string

    if (action === 'approve') {
      await supabase.from('document_logs').insert({
        document_id: id,
        action: 'approve',
        from_status: fromStatus,
        to_status: 'issued',
        changed_by: userId,
        note: note?.trim() || null,
        self_approved: doc.created_by === userId,
      })
    }
  } else {
    const updates: Record<string, unknown> = { status: def.to, updated_at: now }
    if (action === 'submit') updates.submitted_at = now
    if (action === 'reject') updates.rejected_reason = note?.trim() || null
    if (action === 'void') { updates.void_reason = note?.trim() || null; updates.void_by = userId; updates.void_at = now }
    if (action === 'mark_sent') updates.sent_at = now
    if (action === 'close') updates.closed_at = now

    const { error: upErr } = await supabase.from('documents').update(updates).eq('id', id)
    if (upErr) return { error: upErr.message }

    await supabase.from('document_logs').insert({
      document_id: id,
      action,
      from_status: fromStatus,
      to_status: def.to,
      changed_by: userId,
      note: note?.trim() || null,
    })
  }

  await logActivity(ACTION_LOG[action], { document_id: id, doc_no: docNo, draft_no: doc.draft_no, from: fromStatus, to: def.to, note: note?.trim() || null })

  await notifyTransition({ supabase, doc, action, docNo, note, actorId: userId })

  revalidatePath('/documents')
  revalidatePath(`/documents/${id}`)
  revalidatePath('/documents/approvals')
  return { success: true, doc_no: docNo }
}

async function notifyTransition(args: {
  supabase: any
  doc: DocumentRow
  action: DocAction
  docNo: string | null
  note?: string
  actorId: string
}) {
  const { supabase, doc, action, docNo, note, actorId } = args
  const map: Partial<Record<DocAction, NotificationType>> = {
    submit: 'doc_pending_approval',
    approve: 'doc_approved',
    reject: 'doc_rejected',
    void: 'doc_voided',
  }
  const type = map[action]
  if (!type) return

  let userIds: string[] = []
  if (action === 'submit') {
    const { data } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('is_approved', true)
    userIds = (data || []).map((r: { id: string }) => r.id)
  } else if (doc.created_by) {
    userIds = [doc.created_by]
  }
  if (userIds.length === 0) return

  const label = DOC_TYPES[doc.doc_type]?.label.th || doc.doc_type
  const amount = Number(doc.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  let body = `${doc.party_name || '-'} · ฿${amount}`
  if ((action === 'reject' || action === 'void') && note?.trim()) body += ` · เหตุผล: ${note.trim()}`

  await createNotifications({
    userIds,
    type,
    title: `${label} ${docNo || doc.draft_no}`,
    body,
    referenceType: 'document',
    referenceId: doc.id,
    actorId,
  })
}

// ============================================================================
// Party autocomplete (ใช้ใน T2)
// ============================================================================

export async function searchParties(q: string) {
  const { userId } = await getSession()
  if (!userId || !q?.trim()) return []

  const supabase = createServiceClient()
  const term = q.replace(/[%,]/g, '')
  const { data } = await supabase
    .from('documents')
    .select('party_name, party_company, party_tax_id, party_address, party_phone, party_email')
    .ilike('party_name', `%${term}%`)
    .not('party_name', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  const seen = new Set<string>()
  const out: Array<Record<string, string | null>> = []
  for (const row of (data || []) as unknown as Array<Record<string, string | null>>) {
    const key = `${row.party_name}|${row.party_company || ''}|${row.party_tax_id || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
    if (out.length >= 10) break
  }
  return out
}
