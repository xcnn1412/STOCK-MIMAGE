'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { createLead } from '../actions'
import { getActiveStaff, getStaffDisplayName } from '@/database/staff-members'
import type { CrmSetting } from '../crm-dashboard'
import { useLocale } from '@/lib/i18n/context'
import {
  User, Calendar, DollarSign, MapPin, FileText,
  Users, ChevronDown, ChevronUp, X, Plus
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SystemUser {
  id: string
  full_name: string | null
  department: string | null
}

interface AddLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: CrmSetting[]
  users: SystemUser[]
}

// Section Card wrapper
function SectionCard({ icon, iconBg, title, children, defaultOpen = true }: {
  icon: React.ReactNode
  iconBg: string
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50/60 dark:bg-zinc-900/40 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center h-6 w-6 rounded-md ${iconBg}`}>
            {icon}
          </div>
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
      </button>
      {open && (
        <div className="px-4 py-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

export function AddLeadDialog({ open, onOpenChange, settings, users }: AddLeadDialogProps) {
  const router = useRouter()
  const { locale, t } = useLocale()
  const tc = t.crm.addLead
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotedPrice, setQuotedPrice] = useState('')
  const [confirmedPrice, setConfirmedPrice] = useState('')
  const [vatMode, setVatMode] = useState('none')
  const [whtRate, setWhtRate] = useState('0')
  const [installmentCount, setInstallmentCount] = useState(3)
  const [selectedSales, setSelectedSales] = useState<string[]>([])
  const [selectedGraphics, setSelectedGraphics] = useState<string[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string[]>([])
  // Junction table staff assignments
  const [staffAssignments, setStaffAssignments] = useState<{ user_id: string; full_name: string; role: string }[]>([])
  const [staffSelectUser, setStaffSelectUser] = useState('')
  const [staffSelectRole, setStaffSelectRole] = useState('')

  const packages = settings.filter(s => s.category === 'package' && s.is_active)
  const customerTypes = settings.filter(s => s.category === 'customer_type' && s.is_active)
  const leadSources = settings.filter(s => s.category === 'lead_source' && s.is_active)
  const staffRoles = settings.filter(s => s.category === 'staff_role' && s.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const staffList = getActiveStaff()

  const getSettingLabel = (setting: CrmSetting) => {
    return locale === 'th' ? setting.label_th : setting.label_en
  }

  const handlePackageChange = (value: string) => {
    const pkg = packages.find(p => p.value === value)
    if (pkg?.price) {
      setQuotedPrice(String(pkg.price))
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = e.currentTarget
    const formData = new FormData(form)

    const result = await createLead(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setLoading(false)
    onOpenChange(false)
    router.refresh()
    if (result.id) {
      router.push(`/crm/${result.id}`)
    }
  }

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setError(null)
      setQuotedPrice('')
      setConfirmedPrice('')
      setVatMode('none')
      setWhtRate('0')
      setInstallmentCount(3)
      setSelectedSales([])
      setSelectedGraphics([])
      setSelectedStaff([])
      setStaffAssignments([])
      setStaffSelectUser('')
      setStaffSelectRole('')
    }
  }, [open])

  const toggleUser = (list: string[], setList: (v: string[]) => void, userId: string) => {
    setList(list.includes(userId) ? list.filter(id => id !== userId) : [...list, userId])
  }

  const addStaffAssignment = () => {
    if (!staffSelectUser || !staffSelectRole) return
    if (staffAssignments.some(a => a.user_id === staffSelectUser && a.role === staffSelectRole)) return
    const user = users.find(u => u.id === staffSelectUser)
    setStaffAssignments(prev => [...prev, {
      user_id: staffSelectUser,
      full_name: user?.full_name || staffSelectUser,
      role: staffSelectRole,
    }])
    setStaffSelectUser('')
    setStaffSelectRole('')
  }

  const removeStaffAssignment = (idx: number) => {
    setStaffAssignments(prev => prev.filter((_, i) => i !== idx))
  }

  const getRoleLabel = (roleValue: string) => {
    const r = staffRoles.find(s => s.value === roleValue)
    if (!r) return roleValue
    return locale === 'th' ? r.label_th : r.label_en
  }
  const getRoleColor = (roleValue: string) => {
    return staffRoles.find(s => s.value === roleValue)?.color || '#6b7280'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{tc.title}</DialogTitle>
          <DialogDescription>
            {tc.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm p-3 rounded-lg border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

          {/* ================================================================
              1. ข้อมูลลูกค้า (Customer Info)
              ================================================================ */}
          <SectionCard
            icon={<User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
            iconBg="bg-blue-50 dark:bg-blue-950/40"
            title={locale === 'th' ? 'ข้อมูลลูกค้า' : 'Customer Info'}
          >
            {/* Customer Type: New / Returning */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{tc.customerStatus}</Label>
              <RadioGroup name="is_returning" defaultValue="false" className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="false" id="new-customer" />
                  <Label htmlFor="new-customer" className="text-sm cursor-pointer">
                    🟢 {tc.newCustomer}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="true" id="returning-customer" />
                  <Label htmlFor="returning-customer" className="text-sm cursor-pointer">
                    🔵 {tc.returningCustomer}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Row: Name & LINE */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer_name" className="text-sm">
                  {tc.customerName} <span className="text-red-500">*</span>
                </Label>
                <Input id="customer_name" name="customer_name" required placeholder={tc.customerNameRequired} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer_line" className="text-sm">{tc.lineId}</Label>
                <Input id="customer_line" name="customer_line" placeholder={tc.lineIdPlaceholder} />
              </div>
            </div>

            {/* Row: Phone & Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer_phone" className="text-sm">{tc.phone}</Label>
                <Input id="customer_phone" name="customer_phone" placeholder={tc.phonePlaceholder} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{tc.customerType}</Label>
                <Select name="customer_type">
                  <SelectTrigger>
                    <SelectValue placeholder={tc.customerTypePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map(ct => (
                      <SelectItem key={ct.id} value={ct.value}>{getSettingLabel(ct)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Source */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">{tc.channel}</Label>
                <Select name="lead_source">
                  <SelectTrigger>
                    <SelectValue placeholder={tc.channelPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSources.map(ls => (
                      <SelectItem key={ls.id} value={ls.value}>{getSettingLabel(ls)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SectionCard>

          {/* ================================================================
              2. ผู้ดูแล (Staff Assignments)
              ================================================================ */}
          <SectionCard
            icon={<Users className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
            iconBg="bg-amber-50 dark:bg-amber-950/40"
            title={locale === 'th' ? 'ทีมงาน & หน้าที่' : 'Staff & Roles'}
            defaultOpen={false}
          >
            {/* Hidden input for form submission */}
            <input type="hidden" name="staff_assignments" value={JSON.stringify(staffAssignments)} />

            {/* Add row */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-zinc-400">{locale === 'th' ? 'เลือกพนักงาน' : 'Select Staff'}</label>
                <Select value={staffSelectUser} onValueChange={setStaffSelectUser}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={locale === 'th' ? 'เลือกพนักงาน...' : 'Select staff...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-[10px] text-zinc-400">{locale === 'th' ? 'หน้าที่' : 'Role'}</label>
                <Select value={staffSelectRole} onValueChange={setStaffSelectRole}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder={locale === 'th' ? 'เลือกหน้าที่...' : 'Select role...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {staffRoles.map(role => (
                      <SelectItem key={role.value} value={role.value}>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color || '#6b7280' }} />
                          {locale === 'th' ? role.label_th : role.label_en}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 px-3"
                onClick={addStaffAssignment}
                disabled={!staffSelectUser || !staffSelectRole}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {locale === 'th' ? 'เพิ่ม' : 'Add'}
              </Button>
            </div>

            {/* Staff list */}
            {staffAssignments.length > 0 && (
              <div className="space-y-1.5">
                {staffAssignments.map((a, idx) => (
                  <div
                    key={`${a.user_id}-${a.role}-${idx}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 group hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
                        {(a.full_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {a.full_name}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[10px] shrink-0"
                        style={{ backgroundColor: getRoleColor(a.role) + '20', color: getRoleColor(a.role), borderColor: getRoleColor(a.role) + '40' }}
                      >
                        {getRoleLabel(a.role)}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                      onClick={() => removeStaffAssignment(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {staffAssignments.length === 0 && (
              <p className="text-xs text-zinc-400 text-center py-2">
                {locale === 'th' ? 'ยังไม่มีทีมงาน — เพิ่มพนักงานและเลือกหน้าที่' : 'No staff assigned'}
              </p>
            )}
          </SectionCard>

          {/* ================================================================
              3. ข้อมูลอีเวนต์ (Event Info)
              ================================================================ */}
          <SectionCard
            icon={<Calendar className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
            iconBg="bg-violet-50 dark:bg-violet-950/40"
            title={locale === 'th' ? 'ข้อมูลอีเวนต์' : 'Event Info'}
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="event_date" className="text-sm">{tc.eventDate}</Label>
                <Input id="event_date" name="event_date" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="event_location" className="text-sm">{tc.location}</Label>
                <Input id="event_location" name="event_location" placeholder={tc.locationPlaceholder} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="event_details" className="text-sm">{tc.eventDetails}</Label>
              <Input id="event_details" name="event_details" placeholder={tc.eventDetailsPlaceholder} />
            </div>
          </SectionCard>

          {/* ================================================================
              4. ข้อมูลการเงิน (Financial Info)
              ================================================================ */}
          <SectionCard
            icon={<DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
            iconBg="bg-emerald-50 dark:bg-emerald-950/40"
            title={locale === 'th' ? 'ข้อมูลการเงิน' : 'Financial Info'}
            defaultOpen={false}
          >
            {/* Hidden inputs for vat_mode and wht_rate */}
            <input type="hidden" name="vat_mode" value={vatMode} />
            <input type="hidden" name="wht_rate" value={whtRate} />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">{tc.package}</Label>
                <Select name="package_name" onValueChange={handlePackageChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={tc.packagePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map(pkg => (
                      <SelectItem key={pkg.value} value={pkg.value}>
                        {getSettingLabel(pkg)} {pkg.price ? `— ฿${pkg.price.toLocaleString()}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quoted_price" className="text-sm">{tc.quotedPrice}</Label>
                <Input
                  id="quoted_price"
                  name="quoted_price"
                  type="number"
                  value={quotedPrice}
                  onChange={e => setQuotedPrice(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="confirmed_price" className="text-sm">
                  {locale === 'th' ? 'จำนวนเงิน (ราคาขาย)' : 'Amount (Selling Price)'}
                </Label>
                <Input
                  id="confirmed_price"
                  name="confirmed_price"
                  type="number"
                  value={confirmedPrice}
                  onChange={e => setConfirmedPrice(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deposit" className="text-sm">{tc.deposit}</Label>
                <Input id="deposit" name="deposit" type="number" placeholder="0" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quotation_ref" className="text-sm">{tc.quotationRef}</Label>
              <Input id="quotation_ref" name="quotation_ref" placeholder="QT-xxxx" />
            </div>

            {/* ---- VAT & WHT Section ---- */}
            <div className="space-y-4 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-500">
                {locale === 'th' ? '💰 การคำนวณภาษี' : '💰 Tax Calculation'}
              </span>

              {/* VAT Mode */}
              <div className="space-y-2">
                <Label className="text-sm">{locale === 'th' ? 'โหมด VAT' : 'VAT Mode'}</Label>
                <RadioGroup value={vatMode} onValueChange={setVatMode} className="flex gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="none" id="vat-none" />
                    <Label htmlFor="vat-none" className="text-sm cursor-pointer">
                      {locale === 'th' ? 'ไม่มี VAT' : 'No VAT'}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="included" id="vat-included" />
                    <Label htmlFor="vat-included" className="text-sm cursor-pointer">
                      {locale === 'th' ? 'รวม VAT 7%' : 'VAT Included 7%'}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="excluded" id="vat-excluded" />
                    <Label htmlFor="vat-excluded" className="text-sm cursor-pointer">
                      {locale === 'th' ? 'ไม่รวม VAT 7%' : 'VAT Excluded 7%'}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* WHT Rate */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">{locale === 'th' ? '% ภาษีหัก ณ ที่จ่าย' : '% Withholding Tax'}</Label>
                  <Select value={whtRate} onValueChange={setWhtRate}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">{locale === 'th' ? 'ไม่หัก' : 'None'}</SelectItem>
                      <SelectItem value="1">1%</SelectItem>
                      <SelectItem value="2">2%</SelectItem>
                      <SelectItem value="3">3%</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Live Calculation Summary */}
              {(() => {
                const basePrice = Number(confirmedPrice) || Number(quotedPrice) || 0
                if (basePrice <= 0) return null

                const whtRateNum = Number(whtRate) || 0
                const vatAmount = vatMode === 'excluded' ? basePrice * 0.07
                  : vatMode === 'included' ? basePrice - (basePrice / 1.07) : 0
                const priceBeforeVat = vatMode === 'included' ? basePrice / 1.07 : basePrice
                const whtAmount = priceBeforeVat * (whtRateNum / 100)
                const netTotal = vatMode === 'excluded'
                  ? basePrice + vatAmount - whtAmount
                  : basePrice - whtAmount

                return (
                  <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-2">
                    {vatMode !== 'none' && (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500">{locale === 'th' ? 'ราคาก่อน VAT' : 'Before VAT'}</span>
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            ฿{priceBeforeVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500">
                            VAT 7% ({vatMode === 'included'
                              ? (locale === 'th' ? 'รวมแล้ว' : 'incl.')
                              : (locale === 'th' ? 'ยังไม่รวม' : 'excl.')
                            })
                          </span>
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            {vatMode === 'excluded' ? '+' : ''}฿{vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </>
                    )}
                    {whtRateNum > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">
                          {locale === 'th' ? `- หัก ณ ที่จ่าย ${whtRateNum}%` : `- WHT ${whtRateNum}%`}
                        </span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          -฿{whtAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-emerald-200 dark:border-emerald-800 pt-2 flex justify-between text-sm">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {locale === 'th' ? 'ยอดรับจริง' : 'Net Total'}
                      </span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-300">
                        ฿{netTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Installments */}
            <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <input type="hidden" name="installment_count" value={installmentCount} />
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500">
                  {locale === 'th' ? '📋 งวดชำระเงิน' : '📋 Payment Installments'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setInstallmentCount(prev => prev + 1)}
                >
                  + {locale === 'th' ? 'เพิ่มงวด' : 'Add'}
                </Button>
              </div>
              {Array.from({ length: installmentCount }, (_, i) => i + 1).map(n => (
                <div key={n} className="relative">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      {locale === 'th' ? `ชำระงวด ${n}` : `Installment ${n}`}
                    </span>
                    {installmentCount > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setInstallmentCount(prev => Math.max(1, prev - 1))}
                      >
                        <span className="text-xs">✕</span>
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`installment_${n}`} className="text-sm">
                        {locale === 'th' ? `จำนวน` : `Amount`} (฿)
                      </Label>
                      <Input id={`installment_${n}`} name={`installment_${n}`} type="number" placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`installment_${n}_date`} className="text-sm">{locale === 'th' ? 'วันนัดชำระ' : 'Due Date'}</Label>
                      <Input id={`installment_${n}_date`} name={`installment_${n}_date`} type="date" />
                    </div>
                  </div>
                </div>
              ))}
              {installmentCount === 0 && (
                <p className="text-xs text-zinc-400 text-center py-2">
                  {locale === 'th' ? 'ยังไม่มีงวดชำระ' : 'No installments yet'}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-sm">{tc.notes}</Label>
              <Textarea id="notes" name="notes" placeholder={tc.notesPlaceholder} rows={2} />
            </div>
          </SectionCard>

          {/* ================================================================
              Submit
              ================================================================ */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {tc.cancel}
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
              {loading ? tc.saving : tc.createLead}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
