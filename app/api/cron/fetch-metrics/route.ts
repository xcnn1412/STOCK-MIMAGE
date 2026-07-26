import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { fetchMetricsForUrl } from '@/app/(authenticated)/content-planner/metrics-lib'

// ============================================================================
// Cron: ดึงยอดโพสต์อัตโนมัติทั้งชุด (เรียกโดย pg_cron / ตัวตั้งเวลาภายนอก)
//   GET/POST /api/cron/fetch-metrics
//   Auth: Authorization: Bearer <CRON_SECRET>  หรือ  ?secret=<CRON_SECRET>
// เงื่อนไข: โพสต์สถานะ "โพสต์แล้ว" ที่มีลิงก์โพสต์ และโพสต์มาไม่เกิน 90 วัน
// (โพสต์เก่ากว่านั้นยอดแทบไม่ขยับแล้ว ไม่เผา quota/เสี่ยงโดน rate limit ฟรี)
// ============================================================================

export const maxDuration = 300

const MAX_POSTS_PER_RUN = 50
const WINDOW_DAYS = 90

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // fail-closed: ไม่ตั้ง CRON_SECRET = ปิด endpoint
  const header = request.headers.get('authorization') || ''
  if (header === `Bearer ${secret}`) return true
  return new URL(request.url).searchParams.get('secret') === secret
}

async function run(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)

  const { data: posts, error } = await supabase
    .from('content_posts')
    .select('id, post_code, platform, post_url')
    .eq('status', 'published')
    .not('post_url', 'is', null)
    .gte('post_date', since)
    .order('post_date', { ascending: false })
    .limit(MAX_POSTS_PER_RUN)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  const failed: string[] = []

  for (const post of posts || []) {
    const url = String(post.post_url || '').trim()
    if (!url) continue

    const result = await fetchMetricsForUrl(post.platform, url)
    if (result.error || !result.metrics || !Object.keys(result.metrics).length) {
      failed.push(post.post_code)
    } else {
      const now = new Date().toISOString()
      const updates: Record<string, unknown> = { metrics_fetched_at: now, updated_at: now, ...result.metrics }
      const { error: upErr } = await supabase.from('content_posts').update(updates).eq('id', post.id)
      if (upErr) failed.push(post.post_code)
      else updated++
    }

    // เว้นจังหวะกัน rate limit (โดยเฉพาะ TikTok)
    await new Promise(r => setTimeout(r, 400))
  }

  // เก็บผลรอบล่าสุดไว้ดูย้อนหลังได้ (ตาราง app_settings เดียวกับ token)
  await supabase.from('app_settings').upsert({
    key: 'metrics_cron_last_run',
    value: JSON.stringify({ at: new Date().toISOString(), scanned: (posts || []).length, updated, failed }),
    updated_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true, scanned: (posts || []).length, updated, failed })
}

export async function GET(request: Request) { return run(request) }
export async function POST(request: Request) { return run(request) }
