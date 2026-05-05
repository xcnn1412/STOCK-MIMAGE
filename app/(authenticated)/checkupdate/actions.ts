'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value || 'staff'
  return { userId, role }
}

export interface AppliedMigration {
  filename: string
  applied_at: string
  applied_by: string | null
  checksum: string | null
}

// Read the local instance's `_app_migrations` log. Returns empty array if the
// table doesn't exist yet (instance hasn't applied 20260506_create_app_migrations
// yet) — caller treats this as "tracking not bootstrapped".
export async function getAppliedMigrations(): Promise<{
  data: AppliedMigration[]
  bootstrapped: boolean
}> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('_app_migrations')
    .select('filename, applied_at, applied_by, checksum')
    .order('filename', { ascending: true })

  if (error) {
    // 42P01 = undefined_table — table not yet created on this instance.
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      return { data: [], bootstrapped: false }
    }
    console.error('getAppliedMigrations error:', error)
    return { data: [], bootstrapped: false }
  }

  return { data: (data ?? []) as AppliedMigration[], bootstrapped: true }
}

// Record a migration filename as applied. Called from /checkupdate after the
// admin has manually pasted-and-run the SQL in Supabase Studio. Idempotent:
// re-marking a row just bumps applied_at via ON CONFLICT update.
export async function markMigrationApplied(formData: FormData) {
  const { userId, role } = await getSession()
  if (role !== 'admin') return { error: 'Admin only' }

  const filename = (formData.get('filename') as string || '').trim()
  const checksum = (formData.get('checksum') as string || '').trim() || null

  if (!filename || !filename.endsWith('.sql')) {
    return { error: 'Invalid filename' }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('_app_migrations')
    .upsert({
      filename,
      applied_at: new Date().toISOString(),
      applied_by: userId || 'unknown',
      checksum,
    }, { onConflict: 'filename' })

  if (error) {
    if (error.code === '42P01') {
      return { error: 'ตาราง _app_migrations ยังไม่ถูกสร้าง — apply migration 20260506_create_app_migrations.sql ก่อน' }
    }
    return { error: error.message }
  }

  revalidatePath('/checkupdate')
  return { ok: true }
}

// Undo a "mark as applied" — for cases where the admin clicked the button
// but the SQL never actually ran on this DB. Only admin can do this.
export async function unmarkMigrationApplied(formData: FormData) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin only' }

  const filename = (formData.get('filename') as string || '').trim()
  if (!filename) return { error: 'Invalid filename' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('_app_migrations')
    .delete()
    .eq('filename', filename)

  if (error) return { error: error.message }
  revalidatePath('/checkupdate')
  return { ok: true }
}
