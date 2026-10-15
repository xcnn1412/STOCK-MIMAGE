'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { issuePersonalToken, PERSONAL_TTL_DAYS } from '@/lib/oauth'

const NAME_MAX = 60

// สร้าง token ส่วนตัวสำหรับโปรแกรมที่ทำ OAuth ไม่ได้ (Ollama ผ่าน ollmcp ฯลฯ) — สเปค docs/specs/mcp-personal-token.md
// คืนค่า token จริงครั้งเดียว · ห้ามบันทึกค่า token ลง log
export async function createPersonalToken(
  input: { name: string; ttlDays: number },
): Promise<{ error: string } | { token: string; expiresAt: string }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'กรุณาเข้าสู่ระบบใหม่' }

  const rawName: unknown = input?.name
  if (typeof rawName !== 'string') return { error: 'กรุณาตั้งชื่อ token' }
  const name = rawName.trim()
  if (name.length === 0) return { error: 'กรุณาตั้งชื่อ token' }
  if (name.length > NAME_MAX) return { error: `ชื่อ token ยาวได้ไม่เกิน ${NAME_MAX} ตัวอักษร` }

  const ttlDays: unknown = input?.ttlDays
  if (typeof ttlDays !== 'number' || !(PERSONAL_TTL_DAYS as readonly number[]).includes(ttlDays)) {
    return { error: 'อายุ token ต้องเป็น 30 วัน 90 วัน หรือ 1 ปี' }
  }

  const res = await issuePersonalToken(createServiceClient(), { userId: auth.userId, name, ttlDays })
  if ('error' in res) return { error: res.error }

  await logActivity('MCP_TOKEN_CREATE', { tokenId: res.tokenId, name, ttlDays }, auth.userId)

  revalidatePath('/connected-apps')
  return { token: res.token, expiresAt: res.expiresAt }
}

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
