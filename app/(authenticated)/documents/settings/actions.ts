'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import {
  DOC_TYPES,
  type DocBrandRow, type DocTemplateRow, type DocTypeCode, type VatMode,
} from '../doc-types'

// Resolve the acting user with a DB-verified role — NEVER trust the raw
// `session_role` cookie.
// ponytail: คัดลอกจาก documents/actions.ts แทนที่จะ refactor เป็น helper กลาง
// (ไฟล์นั้นถูกแก้โดย agent อื่นพร้อมกัน — ห้ามแตะ)
async function getSession(): Promise<{ userId?: string; role?: string }> {
  const session = await requireAuth()
  if (session) return { userId: session.userId, role: session.role }

  const cookieStore = await cookies()
  if (cookieStore.get('session_token')?.value) return {}
  const legacyId = cookieStore.get('session_user_id')?.value
  if (!legacyId) return {}
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role, is_approved')
    .eq('id', legacyId)
    .single()
  if (!data || !data.is_approved) return {}
  return { userId: data.id, role: data.role || 'staff' }
}

/** ทุก action ในไฟล์นี้เป็น admin-only — ตรวจซ้ำฝั่ง server เสมอ */
async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ admin เท่านั้นที่เข้าถึงหน้าตั้งค่าเอกสารได้' }
  return { userId }
}

function refresh() {
  revalidatePath('/documents/settings')
  revalidatePath('/documents')
}

const BRAND_CODE_RE = /^[A-Z]{3}$/

// ============================================================================
// Brands
// ============================================================================

export interface BrandInput {
  code: string
  original_code?: string | null // ว่าง = เพิ่มใหม่
  name_th: string
  name_en?: string | null
  address?: string | null
  tax_id?: string | null
  branch?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  vat_registered: boolean
  default_vat_mode: VatMode
  default_wht_rate: number
  is_active: boolean
  sort_order: number
}

export async function listBrandsAdmin(): Promise<DocBrandRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('doc_brands')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })
  return (data || []) as unknown as DocBrandRow[]
}

/** รหัสแบรนด์ที่มีเอกสารออกเลขแล้ว — ล็อกแก้รหัสไม่ได้ (spec §46) */
export async function listLockedBrandCodes(): Promise<string[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const { data } = await supabase.from('documents').select('brand_code').not('doc_no', 'is', null)
  return Array.from(new Set((data || []).map((r: { brand_code: string }) => r.brand_code)))
}

async function brandHasIssuedDocs(supabase: ReturnType<typeof createServiceClient>, code: string) {
  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('brand_code', code)
    .not('doc_no', 'is', null)
  return (count || 0) > 0
}

export async function saveBrand(input: BrandInput): Promise<{ error?: string; code?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const code = (input.code || '').trim().toUpperCase()
  if (!BRAND_CODE_RE.test(code)) return { error: 'รหัสแบรนด์ต้องเป็นตัวพิมพ์ใหญ่ A–Z 3 ตัว' }
  if (!input.name_th?.trim()) return { error: 'กรุณากรอกชื่อ (ไทย)' }

  const taxId = (input.tax_id || '').replace(/\D/g, '')
  if (input.tax_id && taxId.length !== 13) return { error: 'เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก' }

  // จด VAT = false → บังคับ default_vat_mode = 'none'
  const vatMode: VatMode = input.vat_registered ? input.default_vat_mode : 'none'

  const supabase = createServiceClient()
  const original = (input.original_code || '').trim().toUpperCase()

  const row = {
    code,
    name_th: input.name_th.trim(),
    name_en: input.name_en?.trim() || null,
    address: input.address?.trim() || null,
    tax_id: taxId || null,
    branch: input.branch?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    website: input.website?.trim() || null,
    vat_registered: !!input.vat_registered,
    default_vat_mode: vatMode,
    default_wht_rate: Number(input.default_wht_rate) || 0,
    is_active: !!input.is_active,
    sort_order: Number(input.sort_order) || 0,
    updated_at: new Date().toISOString(),
  }

  if (!original) {
    // เพิ่มใหม่ — ห้ามรหัสซ้ำ
    const { data: dupe } = await supabase.from('doc_brands').select('code').eq('code', code).maybeSingle()
    if (dupe) return { error: `รหัสแบรนด์ ${code} ถูกใช้แล้ว` }

    const { error } = await supabase.from('doc_brands').insert(row)
    if (error) return { error: error.message }

    await logActivity('CREATE_DOC_BRAND', { brand_code: code, name_th: row.name_th })
    refresh()
    return { code }
  }

  // แก้ไข — ถ้าเปลี่ยนรหัส ต้องยังไม่มีเอกสารที่ออกเลขด้วยรหัสเดิม (กติกาเหล็ก ไม่ใช่แค่ซ่อนปุ่ม)
  if (code !== original) {
    if (await brandHasIssuedDocs(supabase, original)) {
      return { error: 'เปลี่ยนรหัสแบรนด์ไม่ได้ — มีเอกสารที่ออกเลขด้วยรหัสนี้แล้ว' }
    }
    const { data: dupe } = await supabase.from('doc_brands').select('code').eq('code', code).maybeSingle()
    if (dupe) return { error: `รหัสแบรนด์ ${code} ถูกใช้แล้ว` }
  }

  const { error } = await supabase.from('doc_brands').update(row).eq('code', original)
  if (error) return { error: error.message }

  await logActivity('UPDATE_DOC_BRAND', { brand_code: code, previous_code: original, name_th: row.name_th })
  refresh()
  return { code }
}

export async function setBrandActive(code: string, active: boolean): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('doc_brands')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('code', code)
  if (error) return { error: error.message }

  await logActivity('UPDATE_DOC_BRAND', { brand_code: code, is_active: active })
  refresh()
  return {}
}

const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function uploadBrandLogo(code: string, formData: FormData): Promise<{ error?: string; url?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const brandCode = (code || '').trim().toUpperCase()
  if (!BRAND_CODE_RE.test(brandCode)) return { error: 'รหัสแบรนด์ไม่ถูกต้อง' }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'ไม่พบไฟล์' }
  const ext = LOGO_TYPES[file.type]
  if (!ext) return { error: 'รองรับเฉพาะ PNG / JPG / WebP' }
  if (file.size > 2 * 1024 * 1024) return { error: 'ไฟล์ต้องไม่เกิน 2MB' }

  const supabase = createServiceClient()
  const path = `brands/${brandCode}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await supabase.storage
    .from('doc-assets')
    .upload(path, buffer, { contentType: file.type, upsert: true })
  if (upErr) return { error: upErr.message }

  const { data: pub } = supabase.storage.from('doc-assets').getPublicUrl(path)
  // ponytail: cache-buster ต่อท้าย เพราะ upsert ทับ path เดิม CDN จะคืนรูปเก่า
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error } = await supabase
    .from('doc_brands')
    .update({ logo_url: url, updated_at: new Date().toISOString() })
    .eq('code', brandCode)
  if (error) return { error: error.message }

  await logActivity('UPDATE_DOC_BRAND', { brand_code: brandCode, logo_url: url })
  refresh()
  return { url }
}

// ============================================================================
// Counters
// ============================================================================

export interface CounterRow {
  brand_code: string
  doc_type: string
  period: string
  last_number: number
  updated_at: string | null
  updated_by: string | null
  updater?: { id: string; full_name: string | null } | null
}

export async function listCounters(): Promise<CounterRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('doc_counters')
    .select('*, updater:profiles!doc_counters_updated_by_fkey(id, full_name)')
    .order('brand_code', { ascending: true })
    .order('doc_type', { ascending: true })
    .order('period', { ascending: false })
  return (data || []) as unknown as CounterRow[]
}

function periodPattern(docType: string): RegExp {
  // ตัวนับรายปีใช้ period = YY (2 หลัก), รายเดือนใช้ YYMM (4 หลัก)
  const def = DOC_TYPES[docType as DocTypeCode]
  return def?.counter === 'yearly' ? /^\d{2}$/ : /^\d{4}$/
}

/**
 * เลขสูงสุดที่ออกไปแล้วในชุดนี้ — ห้ามตั้ง last_number ต่ำกว่านี้
 * เพราะ issue_document_number ไม่ retry เมื่อ doc_no ชนกัน (unique) → ออกเลขพัง
 */
async function maxIssuedInSeries(
  supabase: ReturnType<typeof createServiceClient>,
  brand: string,
  docType: string,
  period: string,
): Promise<number> {
  if (brand === '*' || docType === '*') {
    // ชุดเลขร่างกลาง — DRAFT-NNNN
    const { data } = await supabase
      .from('documents')
      .select('draft_no')
      .like('draft_no', 'DRAFT-%')
      .order('draft_no', { ascending: false })
      .limit(1)
    const no = (data || [])[0]?.draft_no as string | undefined
    return no ? Number(no.slice(-4)) || 0 : 0
  }

  // doc_no = BRAND-TYPE-YYMM-NNNN; period รายปี (YY) เป็น prefix ของ YYMM
  const prefix = `${brand}-${docType}-${period}`
  const { data } = await supabase
    .from('documents')
    .select('doc_no')
    .like('doc_no', `${prefix}%`)
    .not('doc_no', 'is', null)
  return (data || []).reduce((max: number, r: { doc_no: string | null }) => {
    const n = Number((r.doc_no || '').slice(-4))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
}

export async function upsertCounter(input: {
  brand_code: string
  doc_type: string
  period: string
  last_number: number
}): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const brand = (input.brand_code || '').trim().toUpperCase()
  const docType = (input.doc_type || '').trim().toUpperCase()
  const period = (input.period || '').trim()
  const last = Number(input.last_number)

  if (!Number.isInteger(last) || last < 0) return { error: 'เลขล่าสุดต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป' }

  const isDraft = brand === '*' && docType === '*'
  if (!isDraft) {
    if (!BRAND_CODE_RE.test(brand)) return { error: 'รหัสแบรนด์ไม่ถูกต้อง' }
    if (!DOC_TYPES[docType as DocTypeCode]) return { error: 'ประเภทเอกสารไม่ถูกต้อง' }
    if (!periodPattern(docType).test(period)) {
      return {
        error: DOC_TYPES[docType as DocTypeCode].counter === 'yearly'
          ? 'งวดของประเภทนี้เป็นรายปี — ใส่ตัวเลข 2 หลัก (เช่น 26)'
          : 'งวดของประเภทนี้เป็นรายเดือน — ใส่ตัวเลข 4 หลัก (เช่น 2608)',
      }
    }
  }

  const supabase = createServiceClient()

  // ห้ามลดต่ำกว่าเลขที่ออกไปแล้ว — issue_document_number ไม่ retry เมื่อ doc_no ซ้ำ
  const maxIssued = await maxIssuedInSeries(supabase, brand, docType, period)
  if (last < maxIssued) {
    return { error: `ตั้งค่าต่ำกว่าเลขที่ออกไปแล้วไม่ได้ — ชุดนี้ออกถึงเลข ${maxIssued} แล้ว` }
  }

  const { data: existing } = await supabase
    .from('doc_counters')
    .select('last_number')
    .eq('brand_code', brand)
    .eq('doc_type', docType)
    .eq('period', period)
    .maybeSingle()

  const { error } = await supabase.from('doc_counters').upsert(
    {
      brand_code: brand,
      doc_type: docType,
      period,
      last_number: last,
      updated_at: new Date().toISOString(),
      updated_by: auth.userId,
    },
    { onConflict: 'brand_code,doc_type,period' },
  )
  if (error) return { error: error.message }

  await logActivity('UPDATE_DOC_COUNTER', {
    brand_code: brand,
    doc_type: docType,
    period,
    old: existing?.last_number ?? null,
    new: last,
  })
  refresh()
  return {}
}

// ============================================================================
// Templates (แม่แบบ) — spec §48-51: บันทึก = เวอร์ชันใหม่เสมอ, ไม่มีการลบ
// ============================================================================

export interface TemplateRow extends DocTemplateRow {
  creator?: { id: string; full_name: string | null } | null
}

export interface TemplateInput {
  brand_code: string
  doc_type: string
  title?: string | null
  terms?: string | null
  footer?: string | null
  signer_label_1?: string | null
  signer_label_2?: string | null
  payment_info?: string | null
}

export async function listTemplates(): Promise<TemplateRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('doc_templates')
    .select('*, creator:profiles!doc_templates_created_by_fkey(id, full_name)')
    .order('brand_code', { ascending: true })
    .order('doc_type', { ascending: true })
    .order('version', { ascending: false })
  return (data || []) as unknown as TemplateRow[]
}

function normalizeTemplateTarget(brand_code: string, doc_type: string) {
  const brand = (brand_code || '').trim().toUpperCase()
  const docType = (doc_type || '').trim().toUpperCase()
  if (!BRAND_CODE_RE.test(brand)) return { error: 'รหัสแบรนด์ไม่ถูกต้อง' as const }
  if (!DOC_TYPES[docType as DocTypeCode]) return { error: 'ประเภทเอกสารไม่ถูกต้อง' as const }
  return { brand, docType }
}

const trimOrNull = (v: string | null | undefined) => {
  const s = (v ?? '').trim()
  // TipTap คืน '<p></p>' เมื่อว่าง — เก็บเป็น null ให้ PDF ตกไปใช้ค่า default
  return !s || s === '<p></p>' ? null : s
}

/**
 * บันทึกแม่แบบ = insert เวอร์ชันใหม่ (max+1) แล้วใช้งานทันที
 * ponytail: supabase-js ไม่มี transaction — ปิดตัวเก่าก่อน insert (partial unique index
 * ยอมให้ active ได้ใบเดียว) ถ้า insert พัง ค่อยเปิดตัวเก่ากลับแบบชดเชยมือ
 */
export async function saveTemplateVersion(
  input: TemplateInput,
): Promise<{ error?: string; id?: string; version?: number }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const target = normalizeTemplateTarget(input.brand_code, input.doc_type)
  if ('error' in target) return { error: target.error }
  const { brand, docType } = target

  const supabase = createServiceClient()

  const { data: brandRow } = await supabase.from('doc_brands').select('code').eq('code', brand).maybeSingle()
  if (!brandRow) return { error: `ไม่พบแบรนด์ ${brand}` }

  const { data: existing, error: listErr } = await supabase
    .from('doc_templates')
    .select('id, version, is_active')
    .eq('brand_code', brand)
    .eq('doc_type', docType)
  if (listErr) return { error: listErr.message }

  const rows = (existing || []) as { id: string; version: number; is_active: boolean }[]
  const nextVersion = rows.reduce((max, r) => Math.max(max, Number(r.version) || 0), 0) + 1
  const current = rows.find(r => r.is_active) || null

  if (current) {
    const { error } = await supabase.from('doc_templates').update({ is_active: false }).eq('id', current.id)
    if (error) return { error: error.message }
  }

  const { data: inserted, error: insErr } = await supabase
    .from('doc_templates')
    .insert({
      brand_code: brand,
      doc_type: docType,
      version: nextVersion,
      title: trimOrNull(input.title),
      terms: trimOrNull(input.terms),
      footer: trimOrNull(input.footer),
      signer_label_1: trimOrNull(input.signer_label_1),
      signer_label_2: trimOrNull(input.signer_label_2),
      payment_info: trimOrNull(input.payment_info),
      is_active: true,
      created_by: auth.userId,
    })
    .select('id, version')
    .single()

  if (insErr || !inserted) {
    if (current) await supabase.from('doc_templates').update({ is_active: true }).eq('id', current.id)
    return { error: insErr?.message || 'บันทึกแม่แบบไม่สำเร็จ' }
  }

  await logActivity('UPDATE_DOC_TEMPLATE', {
    brand_code: brand,
    doc_type: docType,
    version: nextVersion,
    previous_version: current?.version ?? null,
    template_id: inserted.id,
  })
  refresh()
  return { id: inserted.id, version: nextVersion }
}

/** ย้อนกลับไปใช้เวอร์ชันเก่า (spec §49) — สลับ is_active เท่านั้น ไม่ลบ ไม่ insert */
export async function activateTemplateVersion(id: string): Promise<{ error?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()
  const { data: row } = await supabase
    .from('doc_templates')
    .select('id, brand_code, doc_type, version, is_active')
    .eq('id', id)
    .maybeSingle()
  if (!row) return { error: 'ไม่พบแม่แบบเวอร์ชันนี้' }
  if (row.is_active) return {}

  const { data: currentRow } = await supabase
    .from('doc_templates')
    .select('id, version')
    .eq('brand_code', row.brand_code)
    .eq('doc_type', row.doc_type)
    .eq('is_active', true)
    .maybeSingle()

  if (currentRow) {
    const { error } = await supabase.from('doc_templates').update({ is_active: false }).eq('id', currentRow.id)
    if (error) return { error: error.message }
  }

  const { error } = await supabase.from('doc_templates').update({ is_active: true }).eq('id', id)
  if (error) {
    // ชดเชยมือ — ไม่งั้นจะไม่เหลือแถว active เลยสำหรับชุดนี้
    if (currentRow) await supabase.from('doc_templates').update({ is_active: true }).eq('id', currentRow.id)
    return { error: error.message }
  }

  await logActivity('UPDATE_DOC_TEMPLATE', {
    brand_code: row.brand_code,
    doc_type: row.doc_type,
    activated_version: row.version,
    previous_version: currentRow?.version ?? null,
    template_id: id,
  })
  refresh()
  return {}
}
