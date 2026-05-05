import { NextResponse } from 'next/server'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'

// GET /api/migrations/list
// Returns the canonical migration manifest from supabase/migrations/. Each
// entry has a content checksum so an instance can spot tampered or stale
// files without re-downloading the SQL itself.

export const dynamic = 'force-dynamic'
export const revalidate = 0

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

export async function GET() {
  try {
    const all = await readdir(MIGRATIONS_DIR)
    const sql = all.filter(f => f.endsWith('.sql')).sort()

    const items = await Promise.all(sql.map(async filename => {
      const buf = await readFile(join(MIGRATIONS_DIR, filename), 'utf-8')
      return {
        filename,
        checksum: createHash('md5').update(buf).digest('hex'),
        size: buf.length,
      }
    }))

    return NextResponse.json({
      count: items.length,
      manifest_checksum: createHash('md5')
        .update(items.map(i => `${i.filename}:${i.checksum}`).join('|'))
        .digest('hex'),
      items,
      checked_at: new Date().toISOString(),
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
