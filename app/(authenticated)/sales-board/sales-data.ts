// ตัวโหลดข้อมูลของหน้า Sales Board — ใช้ร่วมกันระหว่าง sales-board/page.tsx และ tool sales_summary ของ MCP
// ไม่มี 'use server' / JSX / next/* → import จาก lib/mcp-tools.ts ได้ · รับ db เพื่อให้สคริปต์ตรวจใส่ Supabase จำลองได้

import { createServiceClient } from '@/lib/supabase-server'
import type { PLClaim, PLInstallment, PLLead } from '../overview/pl/pl-lib'

type Db = ReturnType<typeof createServiceClient>
const selectFrom = (db: Db, table: string, cols: string) => db.from(table).select(cols)
/** ตัวสร้างคิวรีหลัง select() — สิ่งที่ filter ของ fetchAll รับและคืน */
export type SelectQuery = ReturnType<typeof selectFrom>
export type DbError = { message: string; code?: string }

const PAGE = 1000

/**
 * ดึงทุกแถว (เลี่ยง limit 1,000 ของ PostgREST) — leads มี ~1.2k แถว
 * error = ข้อผิดพลาดของหน้าที่ล้ม (rows = แถวที่ได้ก่อนหน้านั้น) ให้ผู้เรียกรู้ว่าคอลัมน์ไม่มี (ยังไม่รัน migration)
 */
export async function fetchAll<T>(
  db: Db,
  table: string,
  cols: string,
  filter?: (q: SelectQuery) => SelectQuery,
): Promise<{ rows: T[]; error: DbError | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = selectFrom(db, table, cols).range(from, from + PAGE - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) return { rows, error }
    if (!data) break
    const page = data as unknown as T[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return { rows, error: null }
}

export type SalesLead = PLLead & { package_name: string | null; work_type: string | null; closed_at: string | null }
export type SalesJobEvent = { id: string; linked_lead_id: string | null; event_date: string | null }
export type SalesCostItem = { job_event_id: string; amount: number | null }
type StatusAct = { lead_id: string; created_at: string; new_status: string | null }

export interface SalesBoardData {
  leads: SalesLead[]
  claims: PLClaim[]
  installments: PLInstallment[]
  jobEvents: SalesJobEvent[]
  costItems: SalesCostItem[]
  /** เป้าหมายใช้ร่วมกัน: { 'YYYY-MM': { sales: n, ... } } */
  targetStore: Record<string, Record<string, number>>
  /** package_name → ชื่อ "ระบบที่ใช้บริการ" (crm_settings category=package) */
  packageLabels: Record<string, string>
}

/** props ทั้งหมดที่ SalesBoardView ได้รับ — กติกาเดิมของ page.tsx ทุกตัว */
export async function loadSalesBoardData(db: Db = createServiceClient()): Promise<SalesBoardData> {
  const [leads, claims, installments, jobEvents, costItems, targetRows, settings, statusActs] = await Promise.all([
    fetchAll<Omit<SalesLead, 'closed_at'>>(db, 'crm_leads', 'id, status, customer_name, confirmed_price, quoted_price, deposit, vat_mode, wht_rate, event_date, created_at, assigned_sales, package_name, work_type'),
    fetchAll<PLClaim>(db, 'expense_claims', 'id, job_event_id, claim_type, category, amount, actual_spent_amount, status, vat_mode, withholding_tax_rate, expense_date, created_at'),
    fetchAll<PLInstallment>(db, 'crm_lead_installments', 'lead_id, amount, is_paid, due_date, paid_date'),
    fetchAll<SalesJobEvent>(db, 'job_cost_events', 'id, linked_lead_id, event_date'),
    fetchAll<SalesCostItem>(db, 'job_cost_items', 'job_event_id, amount'),
    fetchAll<{ month: string; targets: Record<string, number> | null }>(db, 'sales_board_targets', 'month, targets'),
    fetchAll<{ category: string; value: string; label_th: string }>(db, 'crm_settings', 'category, value, label_th'),
    fetchAll<StatusAct>(db, 'crm_activities', 'lead_id, created_at, new_status', (q) =>
      q.eq('activity_type', 'status_change').order('created_at', { ascending: true })),
  ])

  // วันปิดดีลจริงต่อ lead = status_change → accepted/success ครั้งแรก (แปลงเป็นวันที่ไทย)
  // ใช้เฉพาะการ์ด "ดีลที่ปิดได้" — การ์ดอื่นนับตามเดือนที่สร้างลีด (KPI ทีมขาย)
  const firstClose = new Map<string, string>()
  for (const a of statusActs.rows) {
    const ns = (a.new_status || '').toLowerCase()
    if ((ns === 'accepted' || ns === 'success') && !firstClose.has(a.lead_id))
      firstClose.set(a.lead_id, new Date(a.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }))
  }

  const targetStore: Record<string, Record<string, number>> = {}
  for (const r of targetRows.rows) targetStore[r.month] = r.targets || {}

  const packageLabels: Record<string, string> = {}
  for (const s of settings.rows) if (s.category === 'package') packageLabels[s.value] = s.label_th

  return {
    leads: leads.rows.map((l) => ({ ...l, closed_at: firstClose.get(l.id) || null })),
    claims: claims.rows,
    installments: installments.rows,
    jobEvents: jobEvents.rows,
    costItems: costItems.rows,
    targetStore,
    packageLabels,
  }
}
