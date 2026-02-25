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
import { Briefcase, Palette, Wrench, Users, ChevronDown } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

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

export function AddLeadDialog({ open, onOpenChange, settings, users }: AddLeadDialogProps) {
  const router = useRouter()
  const { locale, t } = useLocale()
  const tc = t.crm.addLead
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotedPrice, setQuotedPrice] = useState('')
  const [selectedSales, setSelectedSales] = useState<string[]>([])
  const [selectedGraphics, setSelectedGraphics] = useState<string[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string[]>([])

  const packages = settings.filter(s => s.category === 'package' && s.is_active)
  const customerTypes = settings.filter(s => s.category === 'customer_type' && s.is_active)
  const leadSources = settings.filter(s => s.category === 'lead_source' && s.is_active)
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
      setSelectedSales([])
      setSelectedGraphics([])
      setSelectedStaff([])
    }
  }, [open])

  const toggleUser = (list: string[], setList: (v: string[]) => void, userId: string) => {
    setList(list.includes(userId) ? list.filter(id => id !== userId) : [...list, userId])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{tc.title}</DialogTitle>
          <DialogDescription>
            {tc.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm p-3 rounded-lg border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

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
                    <SelectItem key={ct.value} value={ct.value}>{getSettingLabel(ct)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row: Source & Assigned */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">{tc.channel}</Label>
              <Select name="lead_source">
                <SelectTrigger>
                  <SelectValue placeholder={tc.channelPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {leadSources.map(ls => (
                    <SelectItem key={ls.value} value={ls.value}>{getSettingLabel(ls)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* Event Info */}
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

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* Financial */}
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
              <Label htmlFor="deposit" className="text-sm">{tc.deposit}</Label>
              <Input id="deposit" name="deposit" type="number" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quotation_ref" className="text-sm">{tc.quotationRef}</Label>
              <Input id="quotation_ref" name="quotation_ref" placeholder="QT-xxxx" />
            </div>
          </div>

          <div className="space-y-3">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`installment_${n}`} className="text-sm">{(tc as any)[`installment${n}`]} (฿)</Label>
                  <Input id={`installment_${n}`} name={`installment_${n}`} type="number" placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`installment_${n}_date`} className="text-sm">{tc.addDialog?.dueDate || 'วันนัดชำระ'}</Label>
                  <Input id={`installment_${n}_date`} name={`installment_${n}_date`} type="date" />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm">{tc.notes}</Label>
            <Textarea id="notes" name="notes" placeholder={tc.notesPlaceholder} rows={2} />
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* Staff Assignments */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-500" />
              <Label className="text-sm font-semibold">{locale === 'th' ? 'ผู้ดูแล' : 'Staff Assignments'}</Label>
            </div>

            {/* Hidden inputs for form submission */}
            <input type="hidden" name="assigned_sales" value={selectedSales.join(',')} />
            <input type="hidden" name="assigned_graphics" value={selectedGraphics.join(',')} />
            <input type="hidden" name="assigned_staff" value={selectedStaff.join(',')} />

            {/* Sale */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Briefcase className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'th' ? 'ฝ่ายขาย (Sale)' : 'Sale'}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-9">
                    <span className="truncate text-left">
                      {selectedSales.length > 0
                        ? selectedSales.map(id => users.find(u => u.id === id)?.full_name || id).join(', ')
                        : (locale === 'th' ? 'เลือกฝ่ายขาย...' : 'Select sales...')
                      }
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel className="text-xs">{locale === 'th' ? 'เลือกฝ่ายขาย' : 'Select Sales'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {users.map(user => (
                    <DropdownMenuCheckboxItem
                      key={user.id}
                      checked={selectedSales.includes(user.id)}
                      onCheckedChange={() => toggleUser(selectedSales, setSelectedSales, user.id)}
                      onSelect={e => e.preventDefault()}
                    >
                      {user.full_name || user.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Graphic */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Palette className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'th' ? 'กราฟิก (Graphic)' : 'Graphic'}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-9">
                    <span className="truncate text-left">
                      {selectedGraphics.length > 0
                        ? selectedGraphics.map(id => users.find(u => u.id === id)?.full_name || id).join(', ')
                        : (locale === 'th' ? 'เลือกกราฟิก...' : 'Select graphic...')
                      }
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel className="text-xs">{locale === 'th' ? 'เลือกกราฟิก' : 'Select Graphic'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {users.map(user => (
                    <DropdownMenuCheckboxItem
                      key={user.id}
                      checked={selectedGraphics.includes(user.id)}
                      onCheckedChange={() => toggleUser(selectedGraphics, setSelectedGraphics, user.id)}
                      onSelect={e => e.preventDefault()}
                    >
                      {user.full_name || user.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Staff */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Wrench className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {locale === 'th' ? 'พนักงาน (Staff)' : 'Staff'}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="w-full justify-between text-xs font-normal h-9">
                    <span className="truncate text-left">
                      {selectedStaff.length > 0
                        ? selectedStaff.map(id => users.find(u => u.id === id)?.full_name || id).join(', ')
                        : (locale === 'th' ? 'เลือกพนักงาน...' : 'Select staff...')
                      }
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="start">
                  <DropdownMenuLabel className="text-xs">{locale === 'th' ? 'เลือกพนักงาน' : 'Select Staff'}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {users.map(user => (
                    <DropdownMenuCheckboxItem
                      key={user.id}
                      checked={selectedStaff.includes(user.id)}
                      onCheckedChange={() => toggleUser(selectedStaff, setSelectedStaff, user.id)}
                      onSelect={e => e.preventDefault()}
                    >
                      {user.full_name || user.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

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
