import { NextResponse } from 'next/server'
import { readPublicSchema, computeFingerprint } from '@/lib/schema-introspect'

// GET /api/schema/fingerprint
// Lightweight endpoint instances poll first — single md5 string. If two
// instances return the same fingerprint they are in schema parity.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
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
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
