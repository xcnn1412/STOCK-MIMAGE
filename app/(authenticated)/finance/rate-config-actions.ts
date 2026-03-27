'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  return { userId, role }
}

// ============================================================================
// Types
// ============================================================================

export interface StaffRoleRate {
  id: string
  value: string
  label_th: string
  label_en: string
  color: string
  price: number
  auto_calc: boolean
  is_active: boolean
  sort_order: number
}

export interface AutoCalcSetting {
  key: string
  value: string
}

// ============================================================================
// Fetch staff role rates
// ============================================================================

export async function getStaffRoleRates(): Promise<StaffRoleRate[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('crm_settings')
    .select('id, value, label_th, label_en, color, price, auto_calc, is_active, sort_order')
    .eq('category', 'staff_role')
    .order('sort_order', { ascending: true })

  return (data || []).map(d => ({
    ...d,
    price: Number(d.price || 0),
    auto_calc: d.auto_calc ?? true,
    color: d.color || '#6b7280',
  })) as StaffRoleRate[]
}

// ============================================================================
// Update role rate (price + auto_calc toggle)
// ============================================================================

export async function updateRoleRate(roleId: string, updates: {
  price?: number
  auto_calc?: boolean
}) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('crm_settings')
    .update(updates)
    .eq('id', roleId)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidatePath('/settings')
  revalidatePath('/finance/settings')
  return { success: true }
}

// ============================================================================
// Batch update all role rates
// ============================================================================

export async function batchUpdateRoleRates(rates: { id: string; price: number; auto_calc: boolean }[]) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()

  const updates = rates.map(r =>
    supabase
      .from('crm_settings')
      .update({ price: r.price, auto_calc: r.auto_calc })
      .eq('id', r.id)
  )

  await Promise.all(updates)

  revalidatePath('/settings')
  revalidatePath('/finance/settings')
  return { success: true }
}

// ============================================================================
// Global auto-calc toggle
// ============================================================================

export async function getAutoCalcSettings(): Promise<AutoCalcSetting[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('finance_auto_calc_settings')
    .select('key, value')

  return (data || []) as AutoCalcSetting[]
}

export async function updateAutoCalcSetting(key: string, value: string) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('finance_auto_calc_settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidatePath('/settings')
  return { success: true }
}
