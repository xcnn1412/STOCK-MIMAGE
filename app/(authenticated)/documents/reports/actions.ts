'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { requireAdmin } from '../session'
import { DOC_TYPES, type DocStatus, type DocTypeCode } from '../doc-types'

const BRAND_CODE_RE = /^[A-Z]{3}$/

// ============================================================================
// รายการชุดเลข (doc_counters ยกเว้นชุดเลขร่าง '*'/'*')
// ============================================================================

export interface SeriesRow {
  brand_code: string
  brand_name: string
  doc_type: string
  period: string
  last_number: number
  /** true = ตัวนับรายปี (period = YY), false = รายเดือน (period = YYMM) */
  yearly: boolean
}

export async function getSeriesList(): Promise<SeriesRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const [{ data: counters }, { data: brands }] = await Promise.all([
    supabase
      .from('doc_counters')
      .select('brand_code, doc_type, period, last_number')
      .neq('brand_code', '*') // ตัดชุดเลขร่างกลางออก
      .order('brand_code', { ascending: true })
      .order('doc_type', { ascending: true })
      .order('period', { ascending: false }),
    supabase.from('doc_brands').select('code, name_th'),
  ])

  const nameOf = new Map(
    ((brands || []) as { code: string; name_th: string }[]).map(b => [b.code, b.name_th]),
  )

  return ((counters || []) as {
    brand_code: string
    doc_type: string
    period: string
    last_number: number
  }[]).map(c => ({
    brand_code: c.brand_code,
    brand_name: nameOf.get(c.brand_code) || c.brand_code,
    doc_type: c.doc_type,
    period: c.period,
    last_number: c.last_number,
    yearly: DOC_TYPES[c.doc_type as DocTypeCode]?.counter === 'yearly',
  }))
}

// ============================================================================
// รายงานความต่อเนื่องของเลขในชุดเดียว
// ============================================================================

export type ContinuityKind = 'issued' | 'void' | 'missing'

export interface ContinuityRow {
  number: number
  doc_no?: string
  id?: string
  status?: DocStatus
  party_name?: string | null
  issued_at?: string | null
  void_reason?: string | null
  kind: ContinuityKind
}

export interface ContinuityReport {
  brand_code: string
  doc_type: string
  period: string
  last_number: number
  rows: ContinuityRow[]
  summary: { issued: number; void: number; missing: number }
  /** เลขที่ปรากฏมากกว่า 1 ใบ — ไม่ควรเกิดได้ (unique index) แต่ถ้าเกิดต้องเห็น */
  duplicates: number[]
  error?: string
}

interface DocLite {
  id: string
  doc_no: string | null
  status: string
  party_name: string | null
  issued_at: string | null
  void_reason: string | null
}

/** เลขท้าย 4 หลักของ BRAND-TYPE-YYMM-NNNN */
function seqOf(docNo: string): number {
  const n = Number(docNo.split('-').pop())
  return Number.isFinite(n) ? n : 0
}

export async function getContinuityReport(input: {
  brand_code: string
  doc_type: string
  period: string
}): Promise<ContinuityReport> {
  const empty = (error?: string): ContinuityReport => ({
    brand_code: input.brand_code,
    doc_type: input.doc_type,
    period: input.period,
    last_number: 0,
    rows: [],
    summary: { issued: 0, void: 0, missing: 0 },
    duplicates: [],
    error,
  })

  const auth = await requireAdmin()
  if ('error' in auth) return empty(auth.error)

  const brand = (input.brand_code || '').trim().toUpperCase()
  const docType = (input.doc_type || '').trim().toUpperCase()
  const period = (input.period || '').trim()
  const def = DOC_TYPES[docType as DocTypeCode]

  if (!BRAND_CODE_RE.test(brand)) return empty('รหัสแบรนด์ไม่ถูกต้อง')
  if (!def) return empty('ประเภทเอกสารไม่ถูกต้อง')
  const yearly = def.counter === 'yearly'
  if (!new RegExp(yearly ? '^\\d{2}$' : '^\\d{4}$').test(period)) {
    return empty(yearly ? 'งวดรายปีต้องเป็นตัวเลข 2 หลัก' : 'งวดรายเดือนต้องเป็นตัวเลข 4 หลัก')
  }

  const supabase = createServiceClient()

  // doc_no = BRAND-TYPE-YYMM-NNNN เสมอ (แม้ตัวนับรายปี) →
  // รายเดือน: prefix ปิดท้ายด้วย '-' ให้ตรงงวดเดียว
  // รายปี:    prefix เป็น YY เฉยๆ จึงกวาดทุกเดือนของปีนั้น
  const prefix = yearly ? `${brand}-${docType}-${period}` : `${brand}-${docType}-${period}-`

  const [{ data: counter }, { data: docs }] = await Promise.all([
    supabase
      .from('doc_counters')
      .select('last_number')
      .eq('brand_code', brand)
      .eq('doc_type', docType)
      .eq('period', period)
      .maybeSingle(),
    supabase
      .from('documents')
      .select('id, doc_no, status, party_name, issued_at, void_reason')
      .like('doc_no', `${prefix}%`)
      .not('doc_no', 'is', null),
  ])

  const byNumber = new Map<number, DocLite[]>()
  for (const d of (docs || []) as unknown as DocLite[]) {
    const n = seqOf(d.doc_no || '')
    if (!n) continue
    const bucket = byNumber.get(n)
    if (bucket) bucket.push(d)
    else byNumber.set(n, [d])
  }

  const lastNumber = (counter as { last_number: number } | null)?.last_number ?? 0
  const maxIssued = byNumber.size ? Math.max(...byNumber.keys()) : 0
  const max = Math.max(lastNumber, maxIssued)

  const rows: ContinuityRow[] = []
  const duplicates: number[] = []
  const summary = { issued: 0, void: 0, missing: 0 }

  for (let n = 1; n <= max; n++) {
    const bucket = byNumber.get(n)
    if (bucket && bucket.length > 1) duplicates.push(n)
    const doc = bucket?.[0]
    if (!doc) {
      summary.missing++
      rows.push({ number: n, kind: 'missing' })
      continue
    }
    const kind: ContinuityKind = doc.status === 'void' ? 'void' : 'issued'
    summary[kind]++
    rows.push({
      number: n,
      doc_no: doc.doc_no || undefined,
      id: doc.id,
      status: doc.status as DocStatus,
      party_name: doc.party_name,
      issued_at: doc.issued_at,
      void_reason: doc.void_reason,
      kind,
    })
  }

  return {
    brand_code: brand,
    doc_type: docType,
    period,
    last_number: lastNumber,
    rows,
    summary,
    duplicates,
  }
}
