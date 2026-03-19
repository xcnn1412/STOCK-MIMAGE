'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

async function getSession() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user')?.value || ''
  return { role, userId }
}

export interface GoalRecord {
  id: string
  goal_key: string
  label: string
  description: string | null
  target_value: number
  unit: string
  value_type: string
  icon: string
  color: string
  sort_order: number
  is_active: boolean
  fiscal_year: number
  period_type: string
  period_value: number | null
  created_at: string
  updated_at: string
}

export async function getGoals(fiscalYear?: number) {
  const { role } = await getSession()
  if (role !== 'admin') return { data: [], error: 'Unauthorized' }

  const supabase = createServiceClient()
  const year = fiscalYear || new Date().getFullYear()

  const { data, error } = await supabase
    .from('overview_goals')
    .select('*')
    .eq('fiscal_year', year)
    .order('sort_order', { ascending: true })

  return { data: (data || []) as GoalRecord[], error: error?.message }
}

export async function getGoalsWithActuals(fiscalYear?: number) {
  const { role } = await getSession()
  if (role !== 'admin') return { goals: [], actuals: null, error: 'Unauthorized' }

  const supabase = createServiceClient()
  const year = fiscalYear || new Date().getFullYear()

  // 1) Fetch goals
  const { data: goals, error: goalsError } = await supabase
    .from('overview_goals')
    .select('*')
    .eq('fiscal_year', year)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (goalsError) return { goals: [], actuals: null, error: goalsError.message }

  // 2) Fetch actuals from job_cost_events + job_cost_items for the fiscal year
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`

  const [eventsResult, costItemsResult] = await Promise.all([
    supabase
      .from('job_cost_events')
      .select('id, revenue, status, event_date')
      .gte('event_date', startDate)
      .lte('event_date', endDate),
    supabase
      .from('job_cost_items')
      .select('id, job_event_id, amount'),
  ])

  const events = eventsResult.data || []
  const costItems = costItemsResult.data || []

  // Build event IDs in range
  const eventIds = new Set(events.map(e => e.id))

  // Calculate actuals
  const totalRevenue = events.reduce((sum, e) => sum + Number(e.revenue || 0), 0)
  const totalJobs = events.length
  const totalCost = costItems
    .filter(c => eventIds.has(c.job_event_id))
    .reduce((sum, c) => sum + Number(c.amount || 0), 0)
  const totalProfit = totalRevenue - totalCost
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const costRatio = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0

  const actuals: Record<string, number> = {
    revenue: totalRevenue,
    job_count: totalJobs,
    gross_profit: totalProfit,
    profit_margin: profitMargin,
    cost_ratio: costRatio,
  }

  return { goals: (goals || []) as GoalRecord[], actuals, error: null }
}

export async function upsertGoal(goal: {
  id?: string
  goal_key: string
  label: string
  description?: string
  target_value: number
  unit: string
  value_type: string
  icon?: string
  color?: string
  sort_order?: number
  is_active?: boolean
  fiscal_year: number
  period_type?: string
  period_value?: number | null
}) {
  const { role, userId } = await getSession()
  if (role !== 'admin') return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const payload = {
    goal_key: goal.goal_key,
    label: goal.label,
    description: goal.description || null,
    target_value: goal.target_value,
    unit: goal.unit,
    value_type: goal.value_type,
    icon: goal.icon || 'Target',
    color: goal.color || 'zinc',
    sort_order: goal.sort_order ?? 0,
    is_active: goal.is_active ?? true,
    fiscal_year: goal.fiscal_year,
    period_type: goal.period_type || 'yearly',
    period_value: goal.period_value ?? null,
    updated_at: new Date().toISOString(),
    updated_by: userId || null,
  }

  if (goal.id) {
    // Update existing
    const { error } = await supabase
      .from('overview_goals')
      .update(payload)
      .eq('id', goal.id)
    return { error: error?.message }
  } else {
    // Insert new
    const { error } = await supabase
      .from('overview_goals')
      .insert({ ...payload, created_by: userId || null })
    return { error: error?.message }
  }
}

export async function deleteGoal(id: string) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('overview_goals')
    .delete()
    .eq('id', id)

  return { error: error?.message }
}

export async function duplicateGoalsToYear(fromYear: number, toYear: number) {
  const { role, userId } = await getSession()
  if (role !== 'admin') return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // Check if target year already has goals
  const { data: existing } = await supabase
    .from('overview_goals')
    .select('id')
    .eq('fiscal_year', toYear)
    .limit(1)

  if (existing && existing.length > 0) {
    return { error: `ปี ${toYear} มีเป้าหมายอยู่แล้ว` }
  }

  // Fetch source year goals
  const { data: sourceGoals, error: fetchError } = await supabase
    .from('overview_goals')
    .select('*')
    .eq('fiscal_year', fromYear)

  if (fetchError || !sourceGoals?.length) {
    return { error: fetchError?.message || 'ไม่พบเป้าหมายในปีต้นทาง' }
  }

  // Insert duplicated goals
  const newGoals = sourceGoals.map((g: any) => ({
    goal_key: g.goal_key,
    label: g.label,
    description: g.description,
    target_value: g.target_value,
    unit: g.unit,
    value_type: g.value_type,
    icon: g.icon,
    color: g.color,
    sort_order: g.sort_order,
    is_active: g.is_active,
    fiscal_year: toYear,
    period_type: g.period_type,
    period_value: g.period_value,
    created_by: userId || null,
    updated_by: userId || null,
  }))

  const { error: insertError } = await supabase
    .from('overview_goals')
    .insert(newGoals)

  return { error: insertError?.message }
}
