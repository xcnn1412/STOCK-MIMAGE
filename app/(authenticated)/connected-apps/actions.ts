'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'

// ยกเลิกการเชื่อมต่อ Claude (MCP) หนึ่งรายการ — เจ้าของ token หรือ admin เท่านั้น
// อ้างอิงด้วย id ของแถว ไม่ส่ง/ไม่บันทึกค่า hash ของ token ออกไปไหน
export async function revokeConnection(id: string): Promise<{ error: string } | { success: true }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'กรุณาเข้าสู่ระบบใหม่' }
  if (!id) return { error: 'ไม่พบการเชื่อมต่อนี้' }

  const db = createServiceClient()
  const { data: row, error: loadError } = await db
    .from('oauth_tokens')
    .select('id, user_id, client_name, revoked_at')
    .eq('id', id)
    .maybeSingle()
  if (loadError) return { error: 'โหลดข้อมูลการเชื่อมต่อไม่สำเร็จ' }
  if (!row) return { error: 'ไม่พบการเชื่อมต่อนี้' }

  // ตรวจสิทธิ์: เป็นเจ้าของ หรือเป็น admin (role มาจาก DB ผ่าน requireAuth)
  if (row.user_id !== auth.userId && auth.role !== 'admin') {
    return { error: 'ไม่มีสิทธิ์ยกเลิกการเชื่อมต่อนี้' }
  }

  const { error: updateError } = await db
    .from('oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)
  if (updateError) return { error: 'ยกเลิกการเชื่อมต่อไม่สำเร็จ' }

  await logActivity('MCP_REVOKE', {
    tokenId: id,
    clientName: row.client_name,
    ownerId: row.user_id,
    byAdmin: row.user_id !== auth.userId,
  }, row.user_id)

  revalidatePath('/connected-apps')
  return { success: true }
}
