'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

async function getSession() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user')?.value || ''
  return { role, userId }
}

// ดึงทุกแถวแบบแบ่งหน้า — `.select()` เดี่ยวๆ ถูก PostgREST ตัดที่ 1000 แถวเงียบๆ
// ทำให้ยอดรวมทุกการ์ด/ตารางในหน้านี้ขาดหายเมื่อข้อมูลโตเกิน 1000 รายการ
// (แพทเทิร์นเดียวกับ overview/export/page.tsx และ sales-board/page.tsx)
// order('id') เพื่อให้ลำดับคงที่ระหว่างหน้า — ไม่งั้น range อาจข้าม/ซ้ำแถว
async function fetchAll(table: string, cols: string) {
  const supabase = createServiceClient()
  const rows: any[] = []
  let from = 0
  const step = 1000
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(cols)
      .order('id', { ascending: true })
      .range(from, from + step - 1)
    if (error || !data) break
    rows.push(...data)
    if (data.length < step) break
    from += step
  }
  return rows
}

export async function getOverviewData() {
  const { role } = await getSession()
  if (role !== 'admin') return null

  const [
    jobEvents,
    costItems,
    leads,
    expenseClaims,
    checkins,
    profiles,
    events,
    leadInstallments,
  ] = await Promise.all([
    // 1) All job_cost_events (linked_lead_id is the reverse FK to crm_leads)
    fetchAll('job_cost_events', 'id, source_event_id, event_name, event_date, event_location, staff, revenue, seller, status, notes, revenue_vat_mode, revenue_wht_rate, linked_lead_id, phase, created_at'),

    // 2) All cost items
    fetchAll('job_cost_items', 'id, job_event_id, category, description, amount, title, unit_price, quantity, vat_mode, include_vat, withholding_tax_rate, cost_date'),

    // 3) CRM leads — joined to job_cost_events via job_cost_events.linked_lead_id
    fetchAll('crm_leads', 'id, customer_name, confirmed_price, quoted_price, assigned_sales, assigned_graphics, assigned_staff, package_name, status, event_date, event_location, vat_mode, wht_rate, created_at, deposit'),

    // 4) Expense claims (ALL — incl. office/advance, not just event-linked)
    fetchAll('expense_claims', 'id, job_event_id, amount, total_amount, actual_spent_amount, status, claim_type, submitted_by, category, paid_at, expense_date, created_at, vat_mode, include_vat, withholding_tax_rate'),

    // 5) Staff checkins (for event check-in counts)
    fetchAll('staff_checkins', 'id, event_id, user_id, checked_in_at, checked_out_at'),

    // 6) Profiles for name lookups
    fetchAll('profiles', 'id, full_name, nickname'),

    // 7) events table — maps job_cost_events.source_event_id → ชื่ออีเวนต์/เช็คอิน
    fetchAll('events', 'id, name'),

    // 8) งวดชำระจริงของ CRM lead (มัดจำ+งวดที่จ่าย) — ใช้คำนวณ "เก็บแล้ว/คงค้าง" ในงบ P&L
    fetchAll('crm_lead_installments', 'id, lead_id, amount, is_paid, due_date, paid_date'),
  ])

  // คงลำดับเดิม (วันจัดงานล่าสุดก่อน) — fetchAll เรียงตาม id เพื่อความถูกต้องของการแบ่งหน้า
  jobEvents.sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')))

  return {
    jobEvents,
    costItems,
    leads,
    expenseClaims,
    checkins,
    profiles,
    events,
    leadInstallments,
  }
}
