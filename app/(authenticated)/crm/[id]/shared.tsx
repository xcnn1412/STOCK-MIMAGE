'use client'

// ชิ้นส่วนที่การ์ดในหน้าลูกค้า (/crm/[id]) ใช้ร่วมกัน: ชนิดข้อมูลของหน้า + หัวการ์ดพับได้ + ปุ่มบันทึก/ยกเลิก + ช่องกรอก/แถวแสดงผล

import { type HTMLAttributes, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pencil, Save, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { CrmLead, CrmSetting } from '../types'
import type { LeadInstallment } from '../actions'
import type { CapacityWarning, CategoryUnits, LeadPackageRow, PickerPackage, UnitBooking } from '../../packages/types'

export type CardSection = 'customer' | 'event' | 'financial'

export interface SystemUser {
  id: string
  full_name: string | null
  department: string | null
}

export interface LeadActivity {
  id: string
  created_at: string
  activity_type: string
  description: string | null
  old_status: string | null
  new_status: string | null
  profiles?: { full_name: string | null } | null
}

/** ใบงานที่แตกจากงานนี้แล้ว (getJobsByLeadId) */
export interface LeadJob {
  id: string
  job_type: string
  title?: string | null
}

/** ค่าในฟอร์มแก้ไขการ์ด — ตั้งจาก lead ใน buildForm() */
export interface LeadForm {
  customer_name: string
  customer_line: string
  customer_phone: string
  customer_type: string
  work_type: string
  unit_count: string
  lead_source: string
  is_returning: boolean
  event_date: string
  event_end_date: string
  event_time: string
  event_end_time: string
  event_location: string
  event_details: string
  required_roles: Record<string, number>
  package_name: string
  quoted_price: number
  confirmed_price: number
  deposit: number
  vat_mode: string
  wht_rate: number
  quotation_ref: string
  notes: string
  tags: string[]
}

/** ข้อมูลของ PackagePicker ในการ์ดลูกค้า (โหลดใน page.tsx ด้วย packages/capacity-data.ts::loadPickerContext) */
export interface LeadPackagePickerData {
  value: LeadPackageRow[]
  packages: PickerPackage[]
  categoryUnits: CategoryUnits
  unitBookings: UnitBooking[]
  warnings: CapacityWarning[]
  /** แอดมิน / ฝ่ายประสานงาน / ผู้สร้างการ์ด */
  canEdit: boolean
}

export interface FormInstallment {
  installment_number: number
  amount: number
  due_date: string
  is_paid: boolean
  paid_date: string
}

/** props ที่การ์ดลูกค้า/อีเวนต์/การเงินรับเหมือนกัน */
export interface EditableCardProps {
  lead: CrmLead
  form: LeadForm
  updateForm: (key: keyof LeadForm, value: string | number | boolean) => void
  editing: boolean
  collapsed: boolean
  saving: boolean
  onEdit: () => void
  onToggle: () => void
  onSave: () => void
  onCancel: () => void
  /** ป้ายต่อท้ายชื่อหัวการ์ด */
  badge?: ReactNode
  /** มีการ์ดใบอื่นกำลังแก้อยู่ — ซ่อนดินสอ (ฟอร์มใช้ร่วม 3 ใบ แก้ทีละใบกัน draft ปนกัน) */
  editLocked?: boolean
  /** บรรทัดสรุปตอนพับ */
  summary?: ReactNode
}


/** ค่าเริ่มต้นของฟอร์มจาก lead — ค่าตัวเลือกเดี่ยวที่ไม่ตรงกับตัวเลือกที่เปิดใช้ ล้างเป็น '' */
export function buildLeadForm(lead: CrmLead, settings: CrmSetting[]): LeadForm {
  // Validate single-select: if stored value doesn't match any valid option, reset to ''
  const validTypeValues = new Set(settings.filter(s => s.category === 'customer_type' && s.is_active).map(s => s.value))
  const validSourceValues = new Set(settings.filter(s => s.category === 'lead_source' && s.is_active).map(s => s.value))
  const sanitizeType = (v: string | null) => v && validTypeValues.has(v) ? v : ''
  const sanitizeSource = (v: string | null) => v && validSourceValues.has(v) ? v : ''
  return {
    customer_name: lead.customer_name || '',
    customer_line: lead.customer_line || '',
    customer_phone: lead.customer_phone || '',
    customer_type: sanitizeType(lead.customer_type),
    work_type: lead.work_type || '',
    unit_count: String(lead.unit_count ?? 1),
    lead_source: sanitizeSource(lead.lead_source),
    is_returning: lead.is_returning || false,
    event_date: lead.event_date || '',
    event_end_date: lead.event_end_date || '',
    event_time: (lead.event_time || '').slice(0, 5),
    event_end_time: (lead.event_end_time || '').slice(0, 5),
    event_location: lead.event_location || '',
    event_details: lead.event_details || '',
    required_roles: lead.required_roles || {},
    package_name: lead.package_name || '',
    quoted_price: lead.quoted_price || 0,
    confirmed_price: lead.confirmed_price || 0,
    deposit: lead.deposit || 0,
    vat_mode: lead.vat_mode || 'none',
    wht_rate: lead.wht_rate || 0,
    quotation_ref: lead.quotation_ref || '',
    notes: lead.notes || '',
    tags: lead.tags || [],
  }
}

export const toFormInstallments = (list: LeadInstallment[]): FormInstallment[] => list.map(inst => ({
  installment_number: inst.installment_number,
  amount: inst.amount || 0,
  due_date: inst.due_date || '',
  is_paid: inst.is_paid || false,
  paid_date: inst.paid_date || '',
}))

/** ข้อความหลายบรรทัดในกล่องยืนยัน */
export const multiline = (text: string): ReactNode => <span className="whitespace-pre-line">{text}</span>

// Reusable collapsible card header
export function CollapsibleCardHeader({ icon, iconBg, title, badge, summary, collapsed, editing, editLocked, onEdit, onToggle, saving = false, onSave, onCancel }: {
  icon: ReactNode
  iconBg: string
  title: string
  /** ป้ายต่อท้ายชื่อการ์ด (หน้าใบงานใส่ "CRM") — ไม่ส่ง = ไม่มี node เพิ่ม */
  badge?: ReactNode
  /** บรรทัดสรุปใต้ชื่อ แสดงเฉพาะตอนพับ — ให้รู้ว่าการ์ดมีอะไรโดยไม่ต้องกาง */
  summary?: ReactNode
  collapsed: boolean
  editing?: boolean
  editLocked?: boolean
  /** ไม่ส่ง = การ์ดนี้ไม่มีปุ่มแก้ไข */
  onEdit?: () => void
  onToggle: () => void
  saving?: boolean
  /** ส่งคู่กับ onCancel = ตอนแก้ไขหัวการ์ดมีปุ่มบันทึก/ยกเลิก (ฟอร์มยาว ไม่ต้องเลื่อนลงล่าง) */
  onSave?: () => void
  onCancel?: () => void
}) {
  const showTopActions = editing && onSave && onCancel
  return (
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className={`flex items-center justify-center h-6 w-6 shrink-0 rounded-md ${iconBg}`}>
              {icon}
            </div>
            {title}
            {badge}
          </CardTitle>
          {collapsed && summary && (
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 truncate">{summary}</p>
          )}
        </div>
        {showTopActions ? (
          <CardEditActions placement="top" saving={saving} onSave={onSave} onCancel={onCancel} />
        ) : (
          <div className="flex items-center gap-1 -mr-2 shrink-0">
            {onEdit && !collapsed && !editing && !editLocked && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-zinc-400 hover:text-blue-600"
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-zinc-400 hover:text-zinc-600"
              onClick={onToggle}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </CardHeader>
  )
}

// Save/Cancel buttons for per-card editing — top = หัวการ์ด (ย่อ) · bottom = ท้ายฟอร์ม ติดขอบล่างจอบนมือถือ
export function CardEditActions({ saving, onSave, onCancel, placement = 'bottom' }: {
  saving: boolean
  onSave: () => void
  onCancel: () => void
  placement?: 'top' | 'bottom'
}) {
  const tc = useLocale().t.crm.detail
  const buttons = (
    <>
      <Button
        onClick={onSave}
        disabled={saving}
        size="sm"
        className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-8 text-xs"
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? tc.saving : tc.save}
      </Button>
      <Button
        onClick={onCancel}
        variant="outline"
        size="sm"
        className="gap-1.5 h-8 text-xs"
      >
        <X className="h-3.5 w-3.5" />
        {tc.cancel}
      </Button>
    </>
  )
  if (placement === 'top') {
    return <div data-testid="card-actions-top" className="flex items-center gap-1.5 shrink-0">{buttons}</div>
  }
  return (
    <div data-testid="card-actions-bottom" className="sticky bottom-0 z-10 bg-card pb-1 sm:static">
      <div className="flex items-center gap-2 pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800">
        {buttons}
      </div>
    </div>
  )
}

// ============================================================================
// Edit Field helper — Input with label
// ============================================================================

export function EditField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  prefix,
  inputMode,
  min,
  autoCapitalize,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  /** ข้อความนำหน้าในกล่อง เช่น "฿" */
  prefix?: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  min?: number
  autoCapitalize?: string
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{prefix}</span>
        )}
        <Input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          min={min}
          autoCapitalize={autoCapitalize}
          className={prefix ? 'h-9 text-sm pl-7' : 'h-9 text-sm'}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Edit Select helper — Dropdown with label
// ============================================================================

export function EditSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { id?: string; value: string; label: string }[]
  placeholder?: string
}) {
  // Deduplicate by value for display (Radix shows checkmark for ALL items with matching value)
  const seen = new Set<string>()
  const displayOptions = options.filter(o => {
    if (seen.has(o.value)) return false
    seen.add(o.value)
    return true
  })
  // Only pass value if it matches a valid option; otherwise omit for "no selection"
  const isValid = value && displayOptions.some(o => o.value === value)
  const selectProps = isValid ? { value, onValueChange: onChange } : { onValueChange: onChange }
  return (
    <div>
      <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{label}</Label>
      <Select {...selectProps}>
        <SelectTrigger className="h-9 text-sm w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-[300px] overflow-y-auto">
          {displayOptions.map(opt => (
            <SelectItem key={opt.id || opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ============================================================================
// Info Row helper — Read-only display
// ============================================================================

export function InfoRow({ label, value, hideEmpty = true, multiline = false }: {
  label: string
  value: ReactNode
  /** false = ค่าว่างยังแสดงแถวพร้อม "ไม่ระบุ" (ช่องหลักที่ควรรู้ว่ายังขาด) · true = ค่าว่างไม่แสดงแถว */
  hideEmpty?: boolean
  /** ข้อความยาวหลายบรรทัด — ชิดซ้ายเสมอ คงการขึ้นบรรทัด */
  multiline?: boolean
}) {
  const { locale } = useLocale()
  const empty = value === null || value === undefined || value === '' || value === false
  if (empty && hideEmpty) return null
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-start sm:gap-4">
      <span className="text-xs text-zinc-500 dark:text-zinc-400 sm:w-28 sm:shrink-0">{label}</span>
      <span className={`text-sm text-zinc-900 dark:text-zinc-100 ${multiline ? 'text-left whitespace-pre-line' : 'text-left sm:text-right'}`}>
        {empty ? <span className="text-zinc-400">{locale === 'th' ? 'ไม่ระบุ' : 'Not set'}</span> : value}
      </span>
    </div>
  )
}
