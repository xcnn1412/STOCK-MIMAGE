import { NextResponse } from 'next/server'
import { readPublicSchema, computeFingerprint } from '@/lib/schema-introspect'

// GET /api/schema/full
// Detailed snapshot — instances fetch this when fingerprints diverge so they
// can compute a per-table diff. Output is intentionally flat for easy diff.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
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
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
