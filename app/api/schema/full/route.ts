import { NextResponse } from 'next/server'
import { masterTokenOk } from '@/lib/master-token'
import { readPublicSchema, computeFingerprint } from '@/lib/schema-introspect'

// GET /api/schema/full
// Detailed snapshot — instances fetch this when fingerprints diverge so they
// can compute a per-table diff. Output is intentionally flat for easy diff.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  if (!masterTokenOk(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const schema = await readPublicSchema()
    return NextResponse.json({
      fingerprint: computeFingerprint(schema),
      schema,
      checked_at: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    // ไม่ส่งข้อความ error กลับไปให้ผู้เรียก — log ฝั่ง server แทน
    console.error('[api/schema/full]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
