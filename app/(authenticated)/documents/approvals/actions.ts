'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { getSession, requireAdmin } from '../session'
import type { DocumentRow } from '../doc-types'

/** แถวในหน้ารออนุมัติ = เอกสาร + ชื่อผู้ขอ (creator) + ชื่อแบรนด์ */
export type PendingApprovalRow = DocumentRow & { brand_name_th: string | null }

/** เอกสารทั้งหมดที่สถานะ pending_approval เรียงตามเวลาที่ส่ง (เก่าสุดก่อน) */
export async function listPendingApprovals(): Promise<PendingApprovalRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('documents')
    .select('*, creator:profiles!documents_created_by_fkey(id, full_name)')
    .eq('status', 'pending_approval')
    .order('submitted_at', { ascending: true, nullsFirst: true })

  const docs = (data || []) as unknown as DocumentRow[]
  if (docs.length === 0) return []

  // ponytail: ดึงชื่อแบรนด์แยกแล้ว map เอง — ไม่ต้องพึ่งชื่อ FK constraint
  const { data: brandData } = await supabase.from('doc_brands').select('code, name_th')
  const brandName = new Map(
    ((brandData || []) as { code: string; name_th: string | null }[]).map(b => [b.code, b.name_th])
  )

  return docs.map(d => ({ ...d, brand_name_th: brandName.get(d.brand_code) ?? null }))
}

/** จำนวนเอกสารที่รออนุมัติ — ใช้ทำ badge บนเมนู (non-admin ได้ 0) */
export async function countPendingApprovals(): Promise<number> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return 0

  const supabase = createServiceClient()
  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval')
  return count || 0
}
