'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { logActivity } from '@/lib/logger'
import { PLATFORM_PREFIX, type ContentPost, type PlatformKey } from './constants'

// ============================================================================
// Session — ทุกคนที่ล็อกอินใช้ได้ (proxy.ts กันสิทธิ์ระดับโมดูล 'content' ให้แล้ว)
// ============================================================================

async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  return { userId, role }
}

// ============================================================================
// Helpers
// ============================================================================

/** ข้อความว่าง → null (ให้คอลัมน์เป็น null แทนสตริงเปล่า) */
function text(formData: FormData, key: string): string | null {
  const v = formData.get(key)
  if (v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** ตัวเลขจำนวนเต็ม — ว่าง/ไม่ใช่ตัวเลข → null */
function int(formData: FormData, key: string): number | null {
  const v = formData.get(key)
  if (v === null) return null
  const s = String(v).trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

// music/asset_link ถูกถอดออกจากฟอร์มแล้ว (คอลัมน์เก่ายังอยู่ใน DB แต่ไม่แตะค่าเดิม)
const TEXT_FIELDS = [
  'post_date', 'post_time', 'format', 'pillar', 'objective',
  'topic', 'hook', 'caption', 'cta', 'link', 'hashtags',
  'owner', 'page', 'post_url', 'note',
  'example_video_url', 'example_post_url',
] as const

/** รูปตัวอย่าง — ส่งมาเป็น JSON array ของ URL (สูงสุด 12 รูป, รับเฉพาะ http(s)) */
function exampleImages(fd: FormData): string[] {
  try {
    const arr = JSON.parse(String(fd.get('example_images') || '[]'))
    if (!Array.isArray(arr)) return []
    return arr.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 12)
  } catch { return [] }
}

const NUMBER_FIELDS = ['reach', 'views', 'likes', 'comments', 'shares', 'saves'] as const

/**
 * รหัสโพสต์ถัดไปของแพลตฟอร์ม เช่น FB-001 → FB-002
 * นับจากเลขสูงสุดที่มีอยู่ + 1 (ไม่เติมรูโหว่ที่เกิดจากการลบ)
 */
async function nextPostCode(platform: PlatformKey): Promise<string> {
  const prefix = PLATFORM_PREFIX[platform]
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('content_posts')
    .select('post_code')
    .eq('platform', platform)

  let max = 0
  for (const row of data || []) {
    const m = /(\d+)\s*$/.exec(String(row.post_code || ''))
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

// ============================================================================
// Queries
// ============================================================================

/**
 * ดึงโพสต์ทั้งหมดแบบแบ่งหน้า — `.select()` เดี่ยวๆ ถูก PostgREST ตัดที่ 1000 แถวเงียบๆ
 * (แพทเทิร์นเดียวกับ overview/actions.ts และ sales-board/page.tsx)
 */
export async function getContentPosts(): Promise<{ data: ContentPost[]; error?: string }> {
  const { userId } = await getSession()
  if (!userId) return { data: [], error: 'Unauthorized' }

  const supabase = createServiceClient()
  const rows: ContentPost[] = []
  let from = 0
  const step = 1000
  for (;;) {
    const { data, error } = await supabase
      .from('content_posts')
      .select('*')
      .order('post_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, from + step - 1)
    if (error) return { data: rows, error: error.message }
    if (!data) break
    rows.push(...(data as ContentPost[]))
    if (data.length < step) break
    from += step
  }
  return { data: rows }
}

// ============================================================================
// Mutations
// ============================================================================

export async function createContentPost(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const platform = String(formData.get('platform') || '') as PlatformKey
  if (!['facebook', 'instagram', 'tiktok'].includes(platform)) {
    return { error: 'กรุณาเลือกแพลตฟอร์ม' }
  }

  const payload: Record<string, unknown> = {
    platform,
    post_code: await nextPostCode(platform),
    status: text(formData, 'status') || 'idea',
    created_by: userId,
  }
  for (const f of TEXT_FIELDS) payload[f] = text(formData, f)
  for (const f of NUMBER_FIELDS) payload[f] = int(formData, f)
  payload.example_images = exampleImages(formData)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('content_posts')
    .insert(payload)
    .select('id, post_code')
    .single()
  if (error) return { error: error.message }

  await logActivity('CREATE_CONTENT_POST', {
    id: data?.id,
    post_code: data?.post_code,
    platform,
    topic: payload.topic,
    status: payload.status,
  })

  revalidatePath('/content-planner')
  return { success: true, post_code: data?.post_code as string | undefined }
}

export async function updateContentPost(id: string, formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of TEXT_FIELDS) if (formData.has(f)) updates[f] = text(formData, f)
  for (const f of NUMBER_FIELDS) if (formData.has(f)) updates[f] = int(formData, f)
  if (formData.has('example_images')) updates.example_images = exampleImages(formData)
  if (formData.has('status')) updates.status = text(formData, 'status') || 'idea'
  // แพลตฟอร์มเปลี่ยนได้ แต่รหัสโพสต์เดิมคงไว้เสมอ (รหัสคือ identity ที่ทีมอ้างถึง)
  if (formData.has('platform')) {
    const p = String(formData.get('platform') || '')
    if (['facebook', 'instagram', 'tiktok'].includes(p)) updates.platform = p
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('content_posts')
    .update(updates)
    .eq('id', id)
    .select('post_code, platform')
    .single()
  if (error) return { error: error.message }

  await logActivity('UPDATE_CONTENT_POST', {
    id,
    post_code: data?.post_code,
    platform: data?.platform,
    fields: Object.keys(updates).filter(k => k !== 'updated_at'),
  })

  revalidatePath('/content-planner')
  return { success: true }
}

// อัปโหลดรูปตัวอย่าง — ใช้ bucket ticket-attachments โฟลเดอร์ content-examples
// (bucket มีอยู่แล้ว + scripts/cleanup-storage กวาด orphan ของ bucket นี้ให้อยู่แล้ว)
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB (ฝั่ง client บีบด้วย compressImage ก่อนแล้ว)

export async function uploadContentExampleImages(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized', urls: [] as string[] }

  const files = formData.getAll('files') as File[]
  if (!files.length) return { error: 'ไม่มีไฟล์', urls: [] as string[] }

  const supabase = createServiceClient()
  const urls: string[] = []
  const errors: string[] = []

  for (const file of files) {
    if (!IMAGE_MIME.includes(file.type)) { errors.push(`${file.name}: รองรับเฉพาะไฟล์รูปภาพ`); continue }
    if (file.size > MAX_IMAGE_SIZE) { errors.push(`${file.name}: ไฟล์เกิน 10MB`); continue }

    const ext = file.name.split('.').pop() || 'jpg'
    const path = `content-examples/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('ticket-attachments')
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (uploadError) { errors.push(`${file.name}: ${uploadError.message}`); continue }

    const { data } = supabase.storage.from('ticket-attachments').getPublicUrl(path)
    urls.push(data.publicUrl)
  }

  if (errors.length && !urls.length) return { error: errors.join(', '), urls: [] as string[] }
  return { success: true, urls, errors: errors.length ? errors.join(', ') : undefined }
}

/** เปลี่ยนสถานะจากตารางโดยไม่ต้องเปิดป๊อปอัพแก้ไข */
export async function updateContentPostStatus(id: string, status: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const allowed = ['idea', 'draft', 'design', 'ready', 'scheduled', 'published', 'hold']
  if (!allowed.includes(status)) return { error: 'สถานะไม่ถูกต้อง' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('content_posts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('post_code, platform')
    .single()
  if (error) return { error: error.message }

  await logActivity('UPDATE_CONTENT_POST', {
    id,
    post_code: data?.post_code,
    platform: data?.platform,
    status,
    inline: true,
  })

  revalidatePath('/content-planner')
  return { success: true }
}

export async function deleteContentPost(id: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('content_posts')
    .select('post_code, platform, topic')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('content_posts').delete().eq('id', id)
  if (error) return { error: error.message }

  await logActivity('DELETE_CONTENT_POST', {
    id,
    post_code: existing?.post_code,
    platform: existing?.platform,
    topic: existing?.topic,
  })

  revalidatePath('/content-planner')
  return { success: true }
}
