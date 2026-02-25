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

interface AddLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: CrmSetting[]
}

export function AddLeadDialog({ open, onOpenChange, settings }: AddLeadDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quotedPrice, setQuotedPrice] = useState('')

  const packages = settings.filter(s => s.category === 'package' && s.is_active)
  const customerTypes = settings.filter(s => s.category === 'customer_type' && s.is_active)
  const leadSources = settings.filter(s => s.category === 'lead_source' && s.is_active)
  const staffList = getActiveStaff()

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
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Add New Lead</DialogTitle>
          <DialogDescription>
            Fill in customer and event details to create a new lead.
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
            <Label className="text-sm font-medium">Customer Status</Label>
            <RadioGroup name="is_returning" defaultValue="false" className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="false" id="new-customer" />
                <Label htmlFor="new-customer" className="text-sm cursor-pointer">
                  🟢 New Customer
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="true" id="returning-customer" />
                <Label htmlFor="returning-customer" className="text-sm cursor-pointer">
                  🔵 Returning Customer
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Row: Name & LINE */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="customer_name" className="text-sm">
                Customer Name <span className="text-red-500">*</span>
              </Label>
              <Input id="customer_name" name="customer_name" required placeholder="ชื่อลูกค้า" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer_line" className="text-sm">LINE ID</Label>
              <Input id="customer_line" name="customer_line" placeholder="ชื่อไลน์" />
            </div>
          </div>

          {/* Row: Phone & Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="customer_phone" className="text-sm">Phone</Label>
              <Input id="customer_phone" name="customer_phone" placeholder="เบอร์โทร" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Customer Type</Label>
              <Select name="customer_type">
                <SelectTrigger>
                  <SelectValue placeholder="เลือกประเภท" />
                </SelectTrigger>
                <SelectContent>
                  {customerTypes.map(ct => (
                    <SelectItem key={ct.value} value={ct.value}>{ct.label_th}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row: Source & Assigned */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Channel</Label>
              <Select name="lead_source">
                <SelectTrigger>
                  <SelectValue placeholder="ช่องทาง" />
                </SelectTrigger>
                <SelectContent>
                  {leadSources.map(ls => (
                    <SelectItem key={ls.value} value={ls.value}>{ls.label_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Assignee</Label>
              <Select name="assigned_to">
                <SelectTrigger>
                  <SelectValue placeholder="ผู้ดูแล" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map(staff => (
                    <SelectItem key={staff.id} value={staff.nickname || staff.name}>
                      {getStaffDisplayName(staff)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* Event Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="event_date" className="text-sm">Event Date</Label>
              <Input id="event_date" name="event_date" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event_location" className="text-sm">Location</Label>
              <Input id="event_location" name="event_location" placeholder="สถานที่" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event_details" className="text-sm">Event Details</Label>
            <Input id="event_details" name="event_details" placeholder="รายละเอียดงาน" />
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800" />

          {/* Financial */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Package</Label>
              <Select name="package_name" onValueChange={handlePackageChange}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือกแพ็คเกจ" />
                </SelectTrigger>
                <SelectContent>
                  {packages.map(pkg => (
                    <SelectItem key={pkg.value} value={pkg.value}>
                      {pkg.label_en} {pkg.price ? `— ฿${pkg.price.toLocaleString()}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quoted_price" className="text-sm">Quoted Price (฿)</Label>
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
              <Label htmlFor="deposit" className="text-sm">Deposit (฿)</Label>
              <Input id="deposit" name="deposit" type="number" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quotation_ref" className="text-sm">Quotation Ref</Label>
              <Input id="quotation_ref" name="quotation_ref" placeholder="QT-xxxx" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm">Notes</Label>
            <Textarea id="notes" name="notes" placeholder="หมายเหตุ..." rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={loading}>
              {loading ? 'Saving...' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
