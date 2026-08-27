'use server'

import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import type { DocumentRow } from '../doc-types'

// Resolve the acting user with a DB-verified role — NEVER trust the raw
// `session_role` cookie.
// ponytail: คัดลอกจาก documents/settings/actions.ts แทนที่จะ refactor เป็น helper กลาง
// (documents/actions.ts ถูกแก้โดย agent อื่นพร้อมกัน — ห้ามแตะ)
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

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ admin เท่านั้นที่เข้าถึงหน้ารออนุมัติได้' }
  return { userId }
}

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
