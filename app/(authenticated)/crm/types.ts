// CRM shared types + status helpers (moved out of crm-dashboard.tsx so non-view code can import them).

export type LeadStatus = string

// Fallback config for unknown statuses
export const FALLBACK_STATUS = { label: 'Unknown', labelTh: 'ไม่ทราบ', color: '#9ca3af', bgColor: 'bg-zinc-100 dark:bg-zinc-800', textColor: 'text-zinc-600 dark:text-zinc-400' }

// Get ordered status list from settings
export function getStatusesFromSettings(settings: CrmSetting[]): string[] {
  return settings
    .filter(s => s.category === 'kanban_status' && s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => s.value)
}

// Get status config from settings (color, labels, etc.)
export function getStatusConfig(settings: CrmSetting[], status: string): { label: string; labelTh: string; color: string; bgColor: string; textColor: string } {
  const s = settings.find(st => st.category === 'kanban_status' && st.value === status)
  if (!s) return FALLBACK_STATUS
  return {
    label: s.label_en,
    labelTh: s.label_th,
    color: s.color || '#9ca3af',
    bgColor: `bg-zinc-100 dark:bg-zinc-800`,
    textColor: `text-zinc-600 dark:text-zinc-400`,
  }
}

export interface CrmLead {
  id: string
  created_at: string
  updated_at: string
  created_by: string | null
  status: LeadStatus
  is_returning: boolean
  customer_name: string
  customer_line: string | null
  customer_phone: string | null
  customer_type: string | null
  work_type: string | null // 'sale' | 'event' | 'gp'
  unit_count?: number | null // จำนวนตู้ — ใช้เฉพาะงานขาย (ไม่มีคอลัมน์ถ้ายังไม่รัน migration 20260928)
  lead_source: string | null
  event_date: string | null
  event_end_date: string | null
  event_time: string | null // HH:mm[:ss]
  event_end_time: string | null // HH:mm[:ss]
  event_days: number
  event_location: string | null
  event_details: string | null
  required_roles: Record<string, number> // { "<staff_role>": จำนวนคน } — {} = ยังไม่กำหนด
  package_name: string | null
  quoted_price: number
  confirmed_price: number
  deposit: number
  installment_1: number
  installment_2: number
  installment_3: number
  installment_4: number
  installment_1_date: string | null
  installment_2_date: string | null
  installment_3_date: string | null
  installment_4_date: string | null
  installment_1_paid: boolean
  installment_2_paid: boolean
  installment_3_paid: boolean
  installment_4_paid: boolean
  installment_1_paid_date: string | null
  installment_2_paid_date: string | null
  installment_3_paid_date: string | null
  installment_4_paid_date: string | null
  vat_mode: string // 'none' | 'included' | 'excluded'
  wht_rate: number // 0 | 1 | 2 | 3 | 5
  quotation_ref: string | null
  notes: string | null
  tags: string[]
  archived_at: string | null
  assigned_sales: string[]
  assigned_graphics: string[]
  assigned_staff: string[]
  total_installments_paid: number
}

export interface CrmSetting {
  id: string
  category: string
  value: string
  label_th: string
  label_en: string
  color: string | null
  price: number | null
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}
