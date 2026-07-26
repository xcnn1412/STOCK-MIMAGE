// ============================================================================
// ตัวดึงยอดโพสต์จากแพลตฟอร์ม — ใช้ร่วมกันระหว่าง server action (ปุ่มดึงผลอัตโนมัติ)
// และ cron endpoint (/api/cron/fetch-metrics) — โมดูลนี้รันฝั่ง server เท่านั้น
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'

export interface FetchedMetrics {
  reach?: number
  views?: number
  likes?: number
  comments?: number
  shares?: number
  saves?: number
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const ERR_TIKTOK = 'ดึงข้อมูลจาก TikTok ไม่สำเร็จ — โครงสร้างหน้าเพจอาจเปลี่ยน กรอกตัวเลขเองได้ตามเดิม'
export const ERR_META_NO_TOKEN =
  'Facebook/Instagram ต้องเชื่อมต่อ Meta Graph API ก่อน — ใส่ Token ได้ที่หน้า ตั้งค่า > คอนเทนต์ (Meta API) ระหว่างนี้กรอกตัวเลขเองได้'
export const ERR_META_FAILED =
  'ดึงข้อมูลจาก Facebook/Instagram ไม่สำเร็จ — Graph API ไม่คืนค่าที่ต้องการ (ลิงก์อาจไม่ใช่โพสต์ของเพจที่ผูก token ไว้) กรอกตัวเลขเองได้ตามเดิม'

export const META_TOKEN_KEY = 'meta_page_access_token'

/** Token จากหน้า ตั้งค่า (app_settings) — fallback เป็น env สำหรับคนที่ตั้งผ่าน env เดิม */
export async function getMetaToken(): Promise<string | null> {
  const supabase = createServiceClient()
  const { data } = await supabase.from('app_settings').select('value').eq('key', META_TOKEN_KEY).maybeSingle()
  return data?.value || process.env.META_PAGE_ACCESS_TOKEN || null
}

/** ค่าอะไรก็ได้ → จำนวนเต็ม (TikTok เก็บ statsV2 เป็นสตริง) */
function toInt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : undefined
}

/** ดึง JSON ในแท็ก <script id="..."> ของหน้า HTML */
function scriptJson(html: string, id: string): unknown {
  const m = new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`, 'i').exec(html)
  if (!m) return null
  try { return JSON.parse(m[1]) } catch { return null }
}

const STAT_KEYS = ['playCount', 'diggCount', 'commentCount', 'shareCount', 'collectCount'] as const

/**
 * ไล่หา object ที่หน้าตาเป็น "stats" ทุกตัวใน JSON ที่ parse แล้ว
 * (ไม่ยึดพาธ itemInfo.itemStruct.stats ตรงๆ เพราะ TikTok ขยับโครงสร้างบ่อย —
 *  ทั้ง stats และ statsV2 จะถูกเก็บมาหมด แล้วค่อยรวมทีหลัง)
 */
function collectStats(node: unknown, out: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 12 || node === null || typeof node !== 'object') return out
  if (!Array.isArray(node)) {
    const o = node as Record<string, unknown>
    if (STAT_KEYS.some(k => k in o)) out.push(o)
  }
  for (const v of Object.values(node as Record<string, unknown>)) collectStats(v, out, depth + 1)
  return out
}

// ponytail: นี่คือการขูด HTML ของหน้า TikTok — เปราะโดยธรรมชาติ (TikTok เปลี่ยนชื่อ
// script carrier / โครงสร้าง JSON เมื่อไหร่ก็พังเมื่อนั้น และอาจโดน anti-bot กั้น)
// ยอมรับได้เพราะล้มเหลวแล้วผู้ใช้ยังกรอกตัวเลขเองได้เหมือนเดิม ไม่มีอะไรเสียหาย
// ทางอัปเกรดจริง: ใช้ TikTok Display API อย่างเป็นทางการ (ต้องขอ app + OAuth ของเจ้าของบัญชี)
export async function fetchTikTokMetrics(url: string): Promise<{ metrics?: FetchedMetrics; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
      redirect: 'follow',
    })
    if (!res.ok) return { error: ERR_TIKTOK }
    const html = await res.text()

    // ลองทั้งตัวปัจจุบันและตัวเก่า — หน้าเพจบางเวอร์ชันยังส่ง SIGI_STATE มาอยู่
    const candidates: Record<string, unknown>[] = []
    for (const id of ['__UNIVERSAL_DATA_FOR_REHYDRATION__', 'SIGI_STATE']) {
      const data = scriptJson(html, id)
      if (data) candidates.push(...collectStats(data))
    }
    if (!candidates.length) return { error: ERR_TIKTOK }

    // รวมจากทุก candidate — ค่าแรกที่เป็นตัวเลขชนะ (stats/statsV2 มีคนละคีย์ครบไม่เท่ากัน)
    const pick = (key: string) => {
      for (const c of candidates) {
        const n = toInt(c[key])
        if (n !== undefined) return n
      }
      return undefined
    }
    const metrics: FetchedMetrics = {}
    const map: [string, keyof FetchedMetrics][] = [
      ['playCount', 'views'],
      ['diggCount', 'likes'],
      ['commentCount', 'comments'],
      ['shareCount', 'shares'],
      ['collectCount', 'saves'],
    ]
    for (const [src, dst] of map) {
      const n = pick(src)
      if (n !== undefined) metrics[dst] = n
    }
    if (!Object.keys(metrics).length) return { error: ERR_TIKTOK }
    return { metrics }
  } catch {
    return { error: ERR_TIKTOK }
  }
}

/** เลข object id ของโพสต์ FB จาก URL (คืน null ถ้าเดาไม่ได้ → ไปใช้ ?id=<url> แทน) */
function facebookObjectId(url: string): string | null {
  try {
    const u = new URL(url)
    const storyFbid = u.searchParams.get('story_fbid')
    const pageId = u.searchParams.get('id')
    if (storyFbid && pageId) return `${pageId}_${storyFbid}`
    const m = /\/(?:posts|videos|photos|reel)\/(?:pfbid[\w]+|(\d+))/.exec(u.pathname)
    if (m?.[1]) return m[1]
    return null
  } catch {
    return null
  }
}

/**
 * FB/IG ผ่าน Meta Graph API — best effort ทั้งหมด ผิดพลาดคืนข้อความไทย ไม่ throw
 * (IG ต้องใช้ media id ของบัญชี Business ที่ผูกไว้ ลิงก์เปล่าๆ มักดึงไม่ได้ —
 *  ลองให้แล้วถ้าไม่ได้ก็บอกผู้ใช้ให้กรอกเอง)
 */
export async function fetchMetaMetrics(url: string): Promise<{ metrics?: FetchedMetrics; error?: string }> {
  const token = await getMetaToken()
  if (!token) return { error: ERR_META_NO_TOKEN }

  const BASE = 'https://graph.facebook.com/v21.0/'
  const fields = 'reactions.summary(true),comments.summary(true),shares'
  const objectId = facebookObjectId(url)

  try {
    const endpoint = objectId
      ? `${BASE}${objectId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`
      : `${BASE}?id=${encodeURIComponent(url)}&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`

    const res = await fetch(endpoint, { headers: { Accept: 'application/json' } })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok || !json || json.error) return { error: ERR_META_FAILED }

    const metrics: FetchedMetrics = {}
    const summaryTotal = (v: unknown) =>
      toInt((((v as Record<string, unknown>)?.summary as Record<string, unknown>)?.total_count))
    const likes = summaryTotal(json.reactions)
    const comments = summaryTotal(json.comments)
    const shares = toInt((json.shares as Record<string, unknown>)?.count)
    if (likes !== undefined) metrics.likes = likes
    if (comments !== undefined) metrics.comments = comments
    if (shares !== undefined) metrics.shares = shares

    // Reach ต้องใช้สิทธิ์ insights ของเพจ — ขอแบบเงียบๆ ล้มเหลวก็ไม่แตะค่าเดิม
    const nodeId = objectId || (typeof json.id === 'string' ? json.id : null)
    if (nodeId) {
      try {
        const insRes = await fetch(
          `${BASE}${nodeId}/insights?metric=post_impressions_unique&access_token=${encodeURIComponent(token)}`,
          { headers: { Accept: 'application/json' } }
        )
        const ins = (await insRes.json().catch(() => null)) as
          | { data?: { values?: { value?: unknown }[] }[] }
          | null
        const reach = toInt(ins?.data?.[0]?.values?.[0]?.value)
        if (insRes.ok && reach !== undefined) metrics.reach = reach
      } catch { /* insights ไม่ได้ก็ช่างมัน */ }
    }

    if (!Object.keys(metrics).length) return { error: ERR_META_FAILED }
    return { metrics }
  } catch {
    return { error: ERR_META_FAILED }
  }
}

/** ดึงตาม URL/แพลตฟอร์ม — จุดเข้าเดียวที่ทั้งปุ่มและ cron ใช้ */
export async function fetchMetricsForUrl(platform: string, url: string): Promise<{ metrics?: FetchedMetrics; error?: string }> {
  const isTikTok = platform === 'tiktok' || /tiktok\.com/i.test(url)
  return isTikTok ? fetchTikTokMetrics(url) : fetchMetaMetrics(url)
}
