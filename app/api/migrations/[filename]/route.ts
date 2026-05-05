import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, basename } from 'path'

// GET /api/migrations/[filename]
// Serves a single migration SQL file as text/plain so an instance can apply
// it locally with its own service-role connection. The path is sanitized to
// the basename to block ../ traversal — only files inside supabase/migrations/
// can be served and only those that end with .sql.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> }
) {
  const { filename: raw } = await ctx.params

  // Hard sanitization — strip any path segments and reject non-.sql.
  const filename = basename(raw)
  if (filename !== raw || !filename.endsWith('.sql') || filename.startsWith('.')) {
    return NextResponse.json({ error: 'invalid filename' }, { status: 400 })
  }

  try {
    const content = await readFile(join(MIGRATIONS_DIR, filename), 'utf-8')
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}
