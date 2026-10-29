import { NextResponse } from 'next/server'
import { masterTokenOk } from '@/lib/master-token'
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

export async function GET(req: Request) {
  if (!masterTokenOk(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
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
    // ไม่ส่งข้อความ error กลับไปให้ผู้เรียก — log ฝั่ง server แทน
    console.error('[api/migrations/list]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
