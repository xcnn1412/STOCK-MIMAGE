import { NextResponse } from 'next/server'
import { masterTokenOk } from '@/lib/master-token'
import { readPublicSchema, computeFingerprint } from '@/lib/schema-introspect'

// GET /api/schema/fingerprint
// Lightweight endpoint instances poll first — single md5 string. If two
// instances return the same fingerprint they are in schema parity.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  if (!masterTokenOk(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const schema = await readPublicSchema()
    const fingerprint = computeFingerprint(schema)
    return NextResponse.json({
      fingerprint,
      counts: {
        tables: new Set(schema.columns.map(c => c.table)).size,
        columns: schema.columns.length,
        indexes: schema.indexes.length,
        triggers: schema.triggers.length,
        functions: schema.functions.length,
      },
      checked_at: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    // ไม่ส่งข้อความ error กลับไปให้ผู้เรียก — log ฝั่ง server แทน
    console.error('[api/schema/fingerprint]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
