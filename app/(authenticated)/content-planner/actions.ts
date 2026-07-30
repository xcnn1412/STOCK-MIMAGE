'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { logActivity } from '@/lib/logger'
import * as XLSX from 'xlsx'
import {
  PLATFORM_PREFIX, STATUSES, PILLARS, OBJECTIVES, FORMATS,
  type ContentPost, type Option, type PlatformKey,
} from './constants'
import { fetchMetricsForUrl, getMetaToken, META_TOKEN_KEY, ERR_TIKTOK, type FetchedMetrics } from './metrics-lib'

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

// ============================================================================
// นำเข้าจากไฟล์ Excel (.xlsx) — 1 แถว = 1 โพสต์
// ============================================================================

const MAX_IMPORT_ROWS = 500

/** หัวคอลัมน์ภาษาไทย → ชื่อฟิลด์ (ยอมรับชื่อฟิลด์อังกฤษตรงๆ ด้วย ดู resolveField) */
const IMPORT_HEADERS: Record<string, string> = {
  'แพลตฟอร์ม': 'platform',
  'วันที่โพสต์': 'post_date',
  'เวลาโพสต์': 'post_time',
  'รูปแบบ': 'format',
  'สถานะ': 'status',
  'เสาหลัก': 'pillar',
  'เป้าหมาย': 'objective',
  'หัวข้อ': 'topic',
  'Hook': 'hook',
  'แคปชัน': 'caption',
  'CTA': 'cta',
  'ลิงก์': 'link',
  'แฮชแท็ก': 'hashtags',
  'ผู้รับผิดชอบ': 'owner',
  'เพจ': 'page',
  'โน้ต': 'note',
}

/** ฟิลด์ที่รับเป็นข้อความล้วน (นอกจาก platform/status/post_date/post_time ที่มีกติกาเฉพาะ) */
const IMPORT_TEXT_FIELDS = ['topic', 'hook', 'caption', 'cta', 'link', 'hashtags', 'owner', 'page', 'note'] as const

const IMPORT_FIELD_SET = new Set(Object.values(IMPORT_HEADERS))

/** หัวคอลัมน์ 1 ช่อง → ชื่อฟิลด์ (ไทยตรงตัว / อังกฤษไม่สนตัวพิมพ์) — ไม่รู้จัก → null */
function resolveField(header: string): string | null {
  const raw = header.trim()
  if (!raw) return null
  if (IMPORT_HEADERS[raw]) return IMPORT_HEADERS[raw]
  const low = raw.toLowerCase()
  for (const [th, field] of Object.entries(IMPORT_HEADERS)) {
    if (th.toLowerCase() === low) return field
  }
  return IMPORT_FIELD_SET.has(low) ? low : null
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString()
  return String(v).trim()
}

/** ข้อความ → null ถ้าว่าง (กติกาเดียวกับ text()) */
function orNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

/** แพลตฟอร์ม — รับ facebook/fb/FB-xxx, instagram/ig, tiktok/tt (ไม่สนตัวพิมพ์) */
function parsePlatform(raw: string): PlatformKey | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  if (s === 'facebook' || s === 'face book' || s.startsWith('fb')) return 'facebook'
  if (s === 'instagram' || s === 'insta' || s.startsWith('ig')) return 'instagram'
  if (s === 'tiktok' || s === 'tik tok' || s.startsWith('tt')) return 'tiktok'
  return null
}

/** ป้ายไทย/ค่าอังกฤษ → value; ไม่รู้จักแต่มีข้อความ → เก็บข้อความดิบ; ว่าง → null */
function mapOption(options: Option[], raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const low = s.toLowerCase()
  const hit = options.find(o => o.th === s || o.th.toLowerCase() === low || o.value.toLowerCase() === low)
  return hit ? hit.value : s
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** ปี พ.ศ. (มากกว่า 2400) → ค.ศ. */
const toCE = (y: number) => (y > 2400 ? y - 543 : y)

function ymd(y: number, m: number, d: number): string | null {
  const year = toCE(y)
  if (!Number.isFinite(year) || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${year}-${pad2(m)}-${pad2(d)}`
}

/** วันที่ — รับ Date จาก Excel, 'YYYY-MM-DD', 'DD/MM/YYYY' (พ.ศ. แปลงให้อัตโนมัติ) */
function parseImportDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate())
  }
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1) {
    const p = XLSX.SSF.parse_date_code(v)
    return p ? ymd(p.y, p.m, p.d) : null
  }
  const s = String(v ?? '').trim()
  if (!s) return null
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s)
  if (m) return ymd(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s)
  if (m) return ymd(+m[3], +m[2], +m[1])
  const d = new Date(s)
  if (!isNaN(d.getTime())) return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return null
}

/** เวลา — รับ Date, เศษส่วนของวัน (0.75 = 18:00) หรือข้อความ 'H:MM' → 'HH:MM' */
function parseImportTime(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`
  if (typeof v === 'number' && Number.isFinite(v)) {
    const frac = v - Math.floor(v)
    const mins = Math.round(frac * 24 * 60)
    return `${pad2(Math.floor(mins / 60) % 24)}:${pad2(mins % 60)}`
  }
  const s = String(v ?? '').trim()
  if (!s) return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (!m) return null
  const h = +m[1], mi = +m[2]
  if (h > 23 || mi > 59) return null
  return `${pad2(h)}:${pad2(mi)}`
}

export async function importContentPosts(formData: FormData): Promise<{
  success?: boolean
  error?: string
  imported: number
  errors: string[]
}> {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized', imported: 0, errors: [] }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'กรุณาเลือกไฟล์ .xlsx', imported: 0, errors: [] }
  }

  let rawRows: Record<string, unknown>[]
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer', cellDates: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) return { error: 'ไฟล์นี้ไม่มีชีตข้อมูล', imported: 0, errors: [] }
    rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' })
  } catch {
    return { error: 'อ่านไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xlsx)', imported: 0, errors: [] }
  }

  if (!rawRows.length) return { error: 'ไม่พบข้อมูลในไฟล์ (ต้องมีหัวคอลัมน์ + อย่างน้อย 1 แถว)', imported: 0, errors: [] }
  if (rawRows.length > MAX_IMPORT_ROWS) return { error: `ไฟล์เกิน ${MAX_IMPORT_ROWS} แถว`, imported: 0, errors: [] }

  const errors: string[] = []
  // เก็บ payload ไว้ก่อน แล้วค่อยแจกรหัสโพสต์ทีเดียวตอนท้าย (ลำดับตามในไฟล์)
  const pending: { platform: PlatformKey; payload: Record<string, unknown> }[] = []

  rawRows.forEach((raw, i) => {
    const excelRow = i + 2 // แถว 1 = หัวคอลัมน์
    // map หัวคอลัมน์ → ฟิลด์ (คอลัมน์ที่ไม่รู้จักถูกข้าม)
    const row: Record<string, unknown> = {}
    for (const [header, value] of Object.entries(raw)) {
      const field = resolveField(header)
      if (field) row[field] = value
    }

    const allEmpty = Object.values(raw).every(v => cellText(v) === '')
    if (allEmpty) return

    const platformRaw = cellText(row.platform)
    const platform = parsePlatform(platformRaw)
    if (!platform) {
      errors.push(`แถว ${excelRow}: ไม่รู้จักแพลตฟอร์ม "${platformRaw}"`)
      return
    }

    const payload: Record<string, unknown> = { platform, created_by: userId }

    // สถานะ — ไม่รู้จัก/ว่าง → ไอเดีย
    const statusRaw = cellText(row.status)
    const statusLow = statusRaw.toLowerCase()
    payload.status = STATUSES.find(s => s.th === statusRaw || s.value.toLowerCase() === statusLow)?.value || 'idea'

    payload.format = mapOption(FORMATS[platform], cellText(row.format))
    payload.pillar = mapOption(PILLARS, cellText(row.pillar))
    payload.objective = mapOption(OBJECTIVES, cellText(row.objective))

    const dateRaw = row.post_date
    const dateText = cellText(dateRaw)
    const postDate = dateText ? parseImportDate(dateRaw) : null
    if (dateText && !postDate) errors.push(`แถว ${excelRow}: วันที่ไม่ถูกต้อง "${dateText}"`)
    payload.post_date = postDate
    payload.post_time = cellText(row.post_time) ? parseImportTime(row.post_time) : null

    for (const f of IMPORT_TEXT_FIELDS) payload[f] = orNull(cellText(row[f]))

    pending.push({ platform, payload })
  })

  if (!pending.length) return { error: 'ไม่มีแถวที่นำเข้าได้', imported: 0, errors }

  // รหัสโพสต์ — หาเลขสูงสุดต่อแพลตฟอร์มครั้งเดียว แล้วไล่เลขต่อ (ตรรกะเดียวกับ nextPostCode)
  const supabase = createServiceClient()
  const usedPlatforms = [...new Set(pending.map(p => p.platform))]
  const counters: Record<string, number> = {}
  for (const pf of usedPlatforms) {
    const { data } = await supabase.from('content_posts').select('post_code').eq('platform', pf)
    let max = 0
    for (const r of data || []) {
      const m = /(\d+)\s*$/.exec(String(r.post_code || ''))
      if (!m) continue
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > max) max = n
    }
    counters[pf] = max
  }

  const platformCounts: Record<string, number> = {}
  const rows = pending.map(({ platform, payload }) => {
    counters[platform] += 1
    platformCounts[platform] = (platformCounts[platform] || 0) + 1
    return { ...payload, post_code: `${PLATFORM_PREFIX[platform]}-${String(counters[platform]).padStart(3, '0')}` }
  })

  const { error: insertError } = await supabase.from('content_posts').insert(rows)
  if (insertError) return { error: `บันทึกไม่สำเร็จ: ${insertError.message}`, imported: 0, errors }

  await logActivity('IMPORT_CONTENT_POSTS', {
    imported: rows.length,
    errors: errors.length,
    platforms: platformCounts,
    file: file.name,
  })

  revalidatePath('/content-planner')
  return { success: true, imported: rows.length, errors }
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

// ============================================================================
// ดึงผลลัพธ์อัตโนมัติจากแพลตฟอร์ม (TikTok = ขูดหน้าเพจ / FB+IG = Meta Graph API)
// ============================================================================

/** สถานะการเชื่อมต่อ Meta (admin เท่านั้น) — ไม่ส่ง token เต็มกลับไป client */
export async function getMetaTokenStatus(): Promise<{ connected: boolean; hint: string | null }> {
  const { role } = await getSession()
  if (role !== 'admin') return { connected: false, hint: null }
  const token = await getMetaToken()
  return { connected: !!token, hint: token ? `…${token.slice(-4)}` : null }
}

/** บันทึก/ลบ Meta token (admin เท่านั้น) — ส่งค่าว่างเพื่อลบ */
export async function saveMetaToken(token: string) {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ admin เท่านั้น' }

  const supabase = createServiceClient()
  const cleaned = token.trim()
  const { error } = cleaned
    ? await supabase.from('app_settings').upsert({ key: META_TOKEN_KEY, value: cleaned, updated_at: new Date().toISOString() })
    : await supabase.from('app_settings').delete().eq('key', META_TOKEN_KEY)
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message} (ตรวจว่ารัน migration app_settings แล้ว)` }

  await logActivity('UPDATE_CONTENT_POST', { setting: 'meta_token', action: cleaned ? 'saved' : 'removed' })
  return { success: true }
}
/** ดึงยอดจากแพลตฟอร์มมาเติมช่อง "ผลลัพธ์" ให้อัตโนมัติ (ยังแก้ตัวเลขเองทับได้ตามปกติ) */
export async function fetchPostMetrics(id: string): Promise<{
  success?: boolean
  error?: string
  metrics?: FetchedMetrics
  fetchedAt?: string
}> {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data: post, error } = await supabase
    .from('content_posts')
    .select('id, post_code, platform, post_url')
    .eq('id', id)
    .single()
  if (error || !post) return { error: 'ไม่พบโพสต์นี้' }

  const url = String(post.post_url || '').trim()
  if (!url) return { error: 'กรอกลิงก์โพสต์ในหมวด "เผยแพร่" ก่อน แล้วค่อยดึงผลอัตโนมัติ' }

  const result = await fetchMetricsForUrl(post.platform, url)
  if (result.error || !result.metrics) return { error: result.error || ERR_TIKTOK }

  const metrics = result.metrics
  const fetched = Object.keys(metrics) as (keyof FetchedMetrics)[]
  const fetchedAt = new Date().toISOString()

  // อัปเดตเฉพาะคอลัมน์ที่ดึงมาได้จริง — ตัวที่ดึงไม่ได้คงค่าที่ผู้ใช้กรอกไว้เดิม
  const updates: Record<string, unknown> = { metrics_fetched_at: fetchedAt, updated_at: fetchedAt }
  for (const k of fetched) updates[k] = metrics[k]

  const { error: updateError } = await supabase.from('content_posts').update(updates).eq('id', id)
  if (updateError) return { error: updateError.message }

  await logActivity('UPDATE_CONTENT_POST', {
    id,
    post_code: post.post_code,
    auto_metrics: true,
    fetched,
  })

  revalidatePath('/content-planner')
  return { success: true, metrics, fetchedAt }
}

/** ลบหลายโพสต์ทีเดียว — ปุ่ม "ลบทั้งหมดที่แสดง" (client ส่ง id ตามฟิลเตอร์แพลตฟอร์ม/สถานะ/คำค้นที่เลือกอยู่) */
export async function deleteContentPosts(ids: string[]) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const clean = [...new Set(ids)].filter(id => typeof id === 'string' && id)
  if (!clean.length) return { error: 'ไม่มีโพสต์ให้ลบ' }

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('content_posts')
    .select('post_code')
    .in('id', clean)

  const { error } = await supabase.from('content_posts').delete().in('id', clean)
  if (error) return { error: error.message }

  await logActivity('DELETE_CONTENT_POSTS', {
    count: existing?.length ?? clean.length,
    post_codes: (existing || []).map(r => r.post_code),
  })

  revalidatePath('/content-planner')
  return { success: true, deleted: existing?.length ?? clean.length }
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
