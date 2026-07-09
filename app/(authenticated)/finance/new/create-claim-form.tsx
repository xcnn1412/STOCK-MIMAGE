'use client'

import { useState, useEffect, useRef, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Upload, X, Calendar, Tag, Receipt, Percent, Users, AlertTriangle, UserCheck, FileText, ImageIcon, Wallet, Info, Building2, User as UserIcon, Coins } from 'lucide-react'
import { createClaim, getOpenPettyCashFund } from '../actions'
import { CLAIM_TYPES, FUNDING_SOURCES, type FundingSource } from '../../costs/types'
import type { FinanceCategory, CategoryItem, StaffProfile } from '../settings-actions'
import { useLocale } from '@/lib/i18n/context'
import BankSelect from '@/components/bank-select'
import { compressImage } from '@/lib/utils'
import EventSelectCombobox from './event-select-combobox'
import EventCalendar, { type CalendarEvent } from '@/components/event-calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  jobEvents: { id: string; event_name: string; event_date: string | null; event_location: string | null; status: string }[]
  categories: FinanceCategory[]
  categoryItems: CategoryItem[]
  staffProfiles: StaffProfile[]
}

function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let vatAmount = 0
  let totalWithVat = amount

  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    vatAmount = amount * 0.07
    totalWithVat = amount + vatAmount
  }

  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CreateClaimForm({ jobEvents, categories, categoryItems, staffProfiles }: Props) {
  const router = useRouter()
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const [claimType, setClaimType] = useState<'event' | 'other' | 'advance' | 'petty_cash'>('event')
  const isAdvance = claimType === 'advance'
  const isPettyCash = claimType === 'petty_cash'
  // Advance and petty cash share the "single amount, no VAT/WHT, company-funded" shape.
  const isSimpleAmount = isAdvance || isPettyCash

  // Petty cash — this form OPENS the monthly fund. Only one fund may be open at
  // a time; expenses/top-ups are added from the fund page afterwards.
  const [pettyMonth, setPettyMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [openFund, setOpenFund] = useState<{ id: string; claimNumber: string; periodStart: string | null; periodEnd: string | null } | null>(null)
  useEffect(() => {
    if (claimType !== 'petty_cash') return
    let cancelled = false
    getOpenPettyCashFund().then(res => {
      if (cancelled) return
      setOpenFund(res.data ? { id: res.data.id, claimNumber: res.data.claimNumber, periodStart: res.data.periodStart, periodEnd: res.data.periodEnd } : null)
    })
    return () => { cancelled = true }
  }, [claimType])
  const [fundingSource, setFundingSource] = useState<FundingSource>('company')
  const isPersonalFunded = fundingSource === 'personal'
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.value || 'staff')
  const [receiptFiles, setReceiptFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [unitPrice, setUnitPrice] = useState('0')
  const [quantity, setQuantity] = useState('1')
  const [vatMode, setVatMode] = useState('none')
  const initialCategory = categories[0]?.value || 'staff'
  const [whtRate, setWhtRate] = useState(
    initialCategory === 'staff' || initialCategory === 'service_fee' ? '3' : '0'
  )
  const [selectedBank, setSelectedBank] = useState('')
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [bankAccountNumber, setBankAccountNumber] = useState('')
  const [accountHolderName, setAccountHolderName] = useState('')
  const [staffAutoFilled, setStaffAutoFilled] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [calendarOpen, setCalendarOpen] = useState(false)

  const computedAmount = (Number(unitPrice) || 0) * (Number(quantity) || 1)
  const whtRateNum = Number(whtRate) || 0
  const tax = calcTax(computedAmount, vatMode, whtRateNum)

  const [state, formAction, isPending] = useActionState(
    async (_prev: any, formData: FormData) => {
      // Append receipt files to FormData
      for (const file of receiptFiles) {
        formData.append('receipt_files', file)
      }
      const result = await createClaim(formData)
      if (result.success) {
        router.push('/finance')
        return { success: true }
      }
      return result
    },
    null
  )

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const rawFiles = Array.from(e.target.files)
      // Compress images before storing to avoid body size limit on mobile
      const newFiles = await Promise.all(
        rawFiles.map(file =>
          file.type.startsWith('image/') ? compressImage(file) : file
        )
      )
      setReceiptFiles(prev => [...prev, ...newFiles])
      // Generate preview URLs for image files
      const newUrls = newFiles.map(file =>
        file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
      )
      setPreviewUrls(prev => [...prev, ...newUrls])
    }
    // Reset the input value so the same file can be re-selected after removal
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    // Revoke the object URL to free memory
    if (previewUrls[index]) {
      URL.revokeObjectURL(previewUrls[index])
    }
    setReceiptFiles(prev => prev.filter((_, i) => i !== index))
    setPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  // Cleanup all object URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => { if (url) URL.revokeObjectURL(url) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {isEn ? 'New Expense Claim' : 'สร้างใบเบิกเงิน'}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {isEn ? 'Fill in expense details' : 'กรอกรายละเอียดค่าใช้จ่ายที่ต้องการเบิก'}
        </p>
      </div>

      <form action={formAction} className="space-y-6">
        {state && 'error' in state && state.error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-xl text-red-600 text-sm">
            {state.error}
          </div>
        )}

        {/* Claim Type Selector */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            {isEn ? 'Claim Type' : 'ประเภทการเบิก'} *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CLAIM_TYPES.map(type => {
              const isActive = claimType === type.value
              const isAdvanceType = type.value === 'advance'
              const isPettyType = type.value === 'petty_cash'
              const activeCls = isActive
                ? (isAdvanceType
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
                    : isPettyType
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
                      : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20')
                : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setClaimType(type.value)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${activeCls}`}
                >
                  <div className="flex items-center gap-2">
                    {isAdvanceType && <Wallet className={`h-4 w-4 ${isActive ? 'text-amber-600' : 'text-zinc-400'}`} />}
                    {isPettyType && <Coins className={`h-4 w-4 ${isActive ? 'text-orange-600' : 'text-zinc-400'}`} />}
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {isEn ? type.label : type.labelTh}
                    </p>
                  </div>
                  {isAdvanceType && (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {isEn ? 'Request money up-front, settle after use' : 'ขอเงินล่วงหน้า คืนส่วนต่างภายหลัง'}
                    </p>
                  )}
                  {isPettyType && (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      {isEn ? 'Open the monthly office fund, log expenses, return leftover' : 'เปิดกองทุนประจำเดือน จดรายจ่าย เติมเงิน คืนเงินสิ้นเดือน'}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
          <input type="hidden" name="claim_type" value={claimType} />

          {/* Funding Source — เงินบริษัท / เงินส่วนตัว */}
          {!isSimpleAmount && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                {isEn ? 'Funding Source' : 'แหล่งเงินที่ใช้เบิก'} *
                <span className="text-[11px] text-zinc-400 font-normal ml-2">
                  {isEn ? '— who paid the bill?' : '— ใครออกเงินก่อน?'}
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FUNDING_SOURCES.map(s => {
                  const isActive = fundingSource === s.value
                  const Icon = s.value === 'personal' ? UserIcon : Building2
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setFundingSource(s.value as FundingSource)}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                        isActive
                          ? s.value === 'personal'
                            ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
                            : 'border-sky-500 bg-sky-50 dark:bg-sky-950/20'
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
                        s.value === 'personal'
                          ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                          : 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400'
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {isEn ? s.label : s.labelTh}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {s.value === 'personal'
                            ? (isEn ? 'I paid first, claim back later' : 'ออกเงินส่วนตัวก่อน เบิกคืนย้อนหลัง')
                            : (isEn ? 'Company pays directly' : 'เบิกจากเงินบริษัทตามปกติ')}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
              <input type="hidden" name="funding_source" value={fundingSource} />
              {isPersonalFunded && (
                <div className="mt-3 flex items-start gap-2.5 p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {isEn
                      ? 'You paid out of pocket. The company will reimburse you once approved.'
                      : 'คุณออกเงินส่วนตัวไปก่อน บริษัทจะโอนคืนให้หลังอนุมัติ'}
                  </p>
                </div>
              )}
            </div>
          )}
          {/* Advance & petty cash default to company funding */}
          {isSimpleAmount && <input type="hidden" name="funding_source" value="company" />}

          {/* Advance workflow info banner */}
          {isAdvance && (
            <div className="mt-3 flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                <p className="font-semibold">{isEn ? 'How Advance Payment Works' : 'วิธีการทำงานของ "เบิกทดลองจ่าย"'}</p>
                <ol className="list-decimal list-inside space-y-0.5 text-amber-600 dark:text-amber-400">
                  <li>{isEn ? 'Request the advance amount before the expense occurs.' : 'เบิกเงินล่วงหน้าไปใช้จ่ายก่อน'}</li>
                  <li>{isEn ? 'After the expense, enter the actual amount spent and upload receipts.' : 'เมื่อใช้จ่ายเสร็จ ให้อัพเดทค่าใช้จ่ายจริง พร้อมอัพโหลดสลิป/ใบเสร็จ'}</li>
                  <li>{isEn ? 'The remaining amount will be auto-calculated — upload the refund slip when you return it.' : 'ระบบจะคำนวณจำนวนเงินคืนให้อัตโนมัติ — แนบสลิปการโอนคืนบริษัท'}</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Event Selector (if event type) */}
        {claimType === 'event' && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isEn ? 'Select Event' : 'เลือกอีเวนต์'} *
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <EventSelectCombobox
                  events={jobEvents}
                  value={selectedEventId}
                  onChange={setSelectedEventId}
                  locale={locale}
                />
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(true)}
                className="shrink-0 px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5"
                title={isEn ? 'View Calendar' : 'ดูปฏิทิน'}
              >
                <Calendar className="h-4 w-4" />
                <span className="text-xs hidden sm:inline">{isEn ? 'Calendar' : 'ปฏิทิน'}</span>
              </button>
            </div>

            {/* Calendar Dialog */}
            <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-emerald-500" />
                    {isEn ? 'Select Event from Calendar' : 'เลือกอีเวนต์จากปฏิทิน'}
                  </DialogTitle>
                </DialogHeader>
                <EventCalendar
                  events={jobEvents}
                  selectedId={selectedEventId}
                  onSelect={(event) => {
                    setSelectedEventId(event.id)
                    setCalendarOpen(false)
                  }}
                  locale={locale}
                  mode="picker"
                />
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            {isEn ? 'Title' : 'หัวข้อการเบิก'} *
          </label>
          <input
            type="text"
            name="title"
            required
            placeholder={isEn ? 'e.g. Travel expenses' : 'เช่น ค่าเดินทางไปงาน, ค่าอุปกรณ์'}
            className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            <Tag className="inline h-3.5 w-3.5 mr-1" />
            {isEn ? 'Category' : 'หมวดค่าใช้จ่าย'}
          </label>
          <select
            name="category"
            value={selectedCategory}
            onChange={e => {
              const val = e.target.value
              setSelectedCategory(val)
              // ค่าสตาฟ & ค่าจ้าง → default หัก ณ ที่จ่าย 3%
              if (val === 'staff' || val === 'service_fee') {
                setWhtRate('3')
              } else {
                setWhtRate('0')
              }
              // Reset staff auto-fill when category changes
              if (val !== 'staff') {
                setSelectedStaffId(null)
                setStaffAutoFilled(false)
              }
            }}
            className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
          >
            {categories.map(cat => (
              <option key={cat.value} value={cat.value}>
                {isEn ? cat.label : cat.label_th}
              </option>
            ))}
          </select>
        </div>

        {/* Description — uses detail_source from settings */}
        {(() => {
          const activeCat = categories.find(c => c.value === selectedCategory)
          const source = activeCat?.detail_source || 'none'
          const selectCls = "w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
          return (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                {isEn ? 'Description' : 'รายละเอียด'}
              </label>
              {source === 'staff' ? (
                <>
                  <select
                    name="description"
                    className={selectCls}
                    value={selectedStaffId ? staffProfiles.find(s => s.id === selectedStaffId)?.full_name || '' : ''}
                    onChange={e => {
                      const staffName = e.target.value
                      const staff = staffProfiles.find(s => s.full_name === staffName)
                      if (staff) {
                        setSelectedStaffId(staff.id)
                        // Auto-fill bank info from profile
                        setSelectedBank(staff.bank_name || '')
                        setBankAccountNumber(staff.bank_account_number || '')
                        setAccountHolderName(staff.account_holder_name || '')
                        setStaffAutoFilled(true)
                      } else {
                        setSelectedStaffId(null)
                        setSelectedBank('')
                        setBankAccountNumber('')
                        setAccountHolderName('')
                        setStaffAutoFilled(false)
                      }
                    }}
                  >
                    <option value="">{isEn ? '— Select staff —' : '— เลือกชื่อพนักงาน —'}</option>
                    {staffProfiles.map(s => (
                      <option key={s.id} value={s.full_name}>
                        {s.full_name} {s.nickname ? `(${s.nickname})` : ''} · {s.role || 'staff'}
                      </option>
                    ))}
                  </select>
                  {selectedStaffId && <input type="hidden" name="staff_profile_id" value={selectedStaffId} />}
                </>
              ) : source === 'custom' ? (
                (() => {
                  const items = categoryItems.filter(i => i.category_id === activeCat?.id)
                  return (
                    <select name="description" className={selectCls}>
                      <option value="">{isEn ? '— Select —' : '— เลือก —'}</option>
                      {items.map(item => (
                        <option key={item.id} value={item.label}>{item.label}</option>
                      ))}
                    </select>
                  )
                })()
              ) : (
                <input
                  type="text"
                  name="description"
                  placeholder={isEn ? 'e.g. Staff wages for 3 people' : 'เช่น ค่าสตาฟ 3 คน'}
                  className={selectCls}
                />
              )}
            </div>
          )
        })()}

        {/* Unit Price + Unit + Quantity — simplified to single amount field for advance / petty cash */}
        {isSimpleAmount ? (
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isPettyCash
                ? <Coins className="inline h-3.5 w-3.5 mr-1 text-orange-500" />
                : <Wallet className="inline h-3.5 w-3.5 mr-1 text-amber-500" />}
              {isPettyCash
                ? (isEn ? 'Initial Fund Amount (฿)' : 'ยอดตั้งต้นกองทุน (฿)')
                : (isEn ? 'Advance Amount (฿)' : 'จำนวนเงินที่ขอเบิกล่วงหน้า (฿)')} *
            </label>
            <input
              type="number"
              name="unit_price"
              min="0"
              step="0.01"
              value={unitPrice}
              onChange={e => setUnitPrice(e.target.value)}
              placeholder="0"
              className={`w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm font-mono outline-none ${isPettyCash ? 'focus:border-orange-500 focus:ring-1 focus:ring-orange-500' : 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500'}`}
            />
            <input type="hidden" name="unit" value="บาท" />
            <input type="hidden" name="quantity" value="1" />
            <p className="text-[11px] text-zinc-400 mt-1">
              {isPettyCash
                ? (isEn ? 'Log expenses & top-ups from the fund page after payout.' : 'จดรายจ่าย/เติมเงินได้จากหน้ากองทุน หลังจ่ายเงินแล้ว')
                : (isEn ? 'You will settle the actual amount spent later.' : 'จำนวนเงินที่ใช้จ่ายจริงจะอัพเดทย้อนหลัง เมื่อเสร็จงาน')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                {isEn ? 'Unit Price (฿)' : 'ราคาต่อหน่วย'} *
              </label>
              <input
                type="number"
                name="unit_price"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={e => setUnitPrice(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                {isEn ? 'Unit' : 'หน่วย'}
              </label>
              <input
                type="text"
                name="unit"
                defaultValue="บาท"
                placeholder="บาท"
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                {isEn ? 'Quantity' : 'จำนวน'}
              </label>
              <input
                type="number"
                name="quantity"
                min="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* Computed Amount + Date */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isAdvance
                ? (isEn ? 'Advance Total (฿)' : 'ยอดเบิกล่วงหน้า (฿)')
                : isPettyCash
                  ? (isEn ? 'Fund Total (฿)' : 'ยอดตั้งต้น (฿)')
                  : (isEn ? 'Total Amount (฿)' : 'ยอดรวม (฿)')}
            </label>
            <div className="flex items-center h-[42px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 font-mono font-semibold text-sm">
              ฿{fmtDec(computedAmount)}
            </div>
            <input type="hidden" name="amount" value={computedAmount} />
            {!isSimpleAmount && (
              <p className="text-[10px] text-zinc-400 mt-1">
                {isEn ? 'Unit Price × Quantity (before VAT)' : 'ราคาต่อหน่วย × จำนวน (ก่อน VAT)'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              <Calendar className="inline h-3.5 w-3.5 mr-1" />
              {isAdvance
                ? (isEn ? 'Planned Expense Date' : 'วันที่คาดว่าจะใช้จ่าย')
                : isPettyCash
                  ? (isEn ? 'Fund Opening Date' : 'วันที่เบิกตั้งต้น')
                  : (isEn ? 'Expense Date' : 'วันที่เกิดค่าใช้จ่าย')}
            </label>
            <input
              type="date"
              name="expense_date"
              defaultValue={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Petty cash — monthly fund opener */}
        {isPettyCash && (
          <div className="border-2 border-orange-200 dark:border-orange-900/40 rounded-xl p-4 space-y-3 bg-orange-50/40 dark:bg-orange-950/10">
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-1.5">
              <Coins className="h-4 w-4" />
              {isEn ? 'Monthly Petty Cash Fund' : 'กองทุนเงินสดย่อยประจำเดือน'}
            </p>

            {/* A fund is already open — must close it before opening a new one */}
            {openFund ? (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="text-xs text-red-700 dark:text-red-300 space-y-1">
                  <p className="font-semibold">
                    {isEn
                      ? `Fund ${openFund.claimNumber} is still open (${openFund.periodStart || '—'} → ${openFund.periodEnd || '—'})`
                      : `มีกองทุน ${openFund.claimNumber} เปิดอยู่ (${openFund.periodStart || '—'} → ${openFund.periodEnd || '—'})`}
                  </p>
                  <p>
                    {isEn
                      ? 'Close that month (return the leftover) before opening a new fund.'
                      : 'กรุณาปิดเดือนและคืนเงินคงเหลือก่อน จึงจะเปิดกองทุนเดือนใหม่ได้'}
                  </p>
                  <a href={`/finance/${openFund.id}`} className="inline-block underline font-medium">
                    {isEn ? 'Go to the open fund →' : 'ไปที่กองทุนที่เปิดอยู่ →'}
                  </a>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                  {isEn ? 'Fund Month' : 'ประจำเดือน'}
                </label>
                <input
                  type="month"
                  name="pettycash_month"
                  value={pettyMonth}
                  onChange={e => setPettyMonth(e.target.value)}
                  className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                />
              </div>
            )}

            <div className="flex items-center justify-between border-t border-orange-200 dark:border-orange-900/40 pt-2.5 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">
                {isEn ? 'Initial fund this month' : 'ยอดตั้งต้นกองทุนเดือนนี้'}
              </span>
              <span className="font-mono font-semibold text-orange-700 dark:text-orange-300">
                ฿{fmtDec(computedAmount)}
              </span>
            </div>

            <p className="text-[11px] text-zinc-500">
              {isEn
                ? 'After approval & payout, log each expense and request top-ups from the fund page. Close the month to return the leftover.'
                : 'หลังอนุมัติและจ่ายเงินแล้ว จดค่าใช้จ่ายแต่ละรายการ / เบิกเพิ่ม ได้จากหน้ากองทุน — สิ้นเดือนกด "ปิดเดือน" เพื่อคืนเงินคงเหลือ'}
            </p>
          </div>
        )}

        {/* VAT + WHT — hidden for advance (ทดลองจ่าย) & petty cash since no receipts yet */}
        {!isSimpleAmount && (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
          <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5" />
            {isEn ? 'Tax Calculation' : 'คำนวณภาษี'}
          </p>

          {/* VAT Mode */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio" name="vat_mode" value="none"
                checked={vatMode === 'none'} onChange={() => setVatMode('none')}
                className="accent-zinc-600"
              />
              <span className="text-sm">{isEn ? 'No VAT' : 'ไม่มี VAT'}</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio" name="vat_mode" value="included"
                checked={vatMode === 'included'} onChange={() => setVatMode('included')}
                className="accent-orange-600"
              />
              <span className="text-sm">{isEn ? 'VAT Included' : 'รวม VAT 7%'}</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio" name="vat_mode" value="excluded"
                checked={vatMode === 'excluded'} onChange={() => setVatMode('excluded')}
                className="accent-blue-600"
              />
              <span className="text-sm">{isEn ? 'VAT Excluded' : 'ไม่รวม VAT 7%'}</span>
            </label>
          </div>

          {/* WHT */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-purple-500" />
              <span className="text-sm">{isEn ? 'Withholding Tax' : 'ภาษีหัก ณ ที่จ่าย'}</span>
            </div>
            <select
              value={whtRate}
              onChange={e => setWhtRate(e.target.value)}
              className="w-28 h-8 px-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 outline-none"
            >
              <option value="0">{isEn ? 'None' : 'ไม่หัก'}</option>
              <option value="1">1%</option>
              <option value="2">2%</option>
              <option value="3">3%</option>
              <option value="5">5%</option>
            </select>
          </div>
          <input type="hidden" name="withholding_tax_rate" value={whtRate} />

          {/* Live Calculation */}
          {(vatMode !== 'none' || whtRateNum > 0) && computedAmount > 0 && (
            <div className="border-t pt-3 mt-2 space-y-1.5">
              {vatMode === 'included' ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{isEn ? 'Total (VAT included)' : 'ยอดรวม (รวม VAT แล้ว)'}</span>
                    <span className="font-mono">฿{fmtDec(computedAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-orange-600">{isEn ? 'VAT extracted' : 'ถอด VAT ออก'}</span>
                    <span className="font-mono text-orange-600">฿{fmtDec(tax.vatAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{isEn ? 'Base amount' : 'ยอดก่อน VAT'}</span>
                    <span className="font-mono">฿{fmtDec(tax.baseAmount)}</span>
                  </div>
                </>
              ) : vatMode === 'excluded' ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{isEn ? 'Amount before VAT' : 'ยอดก่อน VAT'}</span>
                    <span className="font-mono">฿{fmtDec(computedAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-blue-600">+ VAT 7%</span>
                    <span className="font-mono text-blue-600">฿{fmtDec(tax.vatAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{isEn ? 'Total with VAT' : 'ยอดรวม VAT'}</span>
                    <span className="font-mono">฿{fmtDec(tax.totalWithVat)}</span>
                  </div>
                </>
              ) : null}
              {whtRateNum > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-600">− {isEn ? 'Withholding Tax' : 'หัก ณ ที่จ่าย'} {whtRate}%</span>
                  <span className="font-mono text-purple-600">−฿{fmtDec(tax.whtAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm font-semibold border-t pt-2">
                <span>{isEn ? 'Net Payable' : 'ยอดจ่ายจริง'}</span>
                <span className="font-mono">฿{fmtDec(tax.netPayable)}</span>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Hidden defaults for advance & petty cash — no VAT/WHT */}
        {isSimpleAmount && (
          <>
            <input type="hidden" name="vat_mode" value="none" />
            <input type="hidden" name="withholding_tax_rate" value="0" />
          </>
        )}

        {/* Payment Details (ผู้เบิก) */}
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              💳 {isEn ? 'Payment Details (Claimant)' : 'รายละเอียดการชำระเงิน (ผู้เบิก)'}
            </p>
            {staffAutoFilled && selectedStaffId && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                <UserCheck className="h-3 w-3" />
                ดึงจากโปรไฟล์อัตโนมัติ
              </span>
            )}
          </div>

          {/* Warning: missing bank data */}
          {staffAutoFilled && selectedStaffId && (!selectedBank || !bankAccountNumber || !accountHolderName) && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-300">
                <p className="font-medium">ข้อมูลธนาคารไม่ครบ</p>
                <p className="text-amber-600 dark:text-amber-400">กรุณาให้ {staffProfiles.find(s => s.id === selectedStaffId)?.full_name} กรอกข้อมูลธนาคารในหน้าโปรไฟล์ หรือกรอกด้านล่างด้วยตนเอง</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                {isEn ? 'Bank Name' : 'ชื่อธนาคาร'}
              </label>
              <BankSelect
                value={selectedBank}
                onChange={v => { setSelectedBank(v); if (staffAutoFilled) setStaffAutoFilled(false) }}
                name="bank_name"
                placeholder={isEn ? 'Select bank' : 'เลือกธนาคาร'}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                {isEn ? 'Account Number' : 'เลขบัญชีธนาคาร'}
              </label>
              <input
                type="text"
                name="bank_account_number"
                value={bankAccountNumber}
                onChange={e => { setBankAccountNumber(e.target.value); if (staffAutoFilled) setStaffAutoFilled(false) }}
                placeholder={isEn ? 'e.g. 123-4-56789-0' : 'เช่น 123-4-56789-0'}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">
                {isEn ? 'Account Holder' : 'ชื่อ-สกุลเจ้าของบัญชี'}
              </label>
              <input
                type="text"
                name="account_holder_name"
                value={accountHolderName}
                onChange={e => { setAccountHolderName(e.target.value); if (staffAutoFilled) setStaffAutoFilled(false) }}
                placeholder={isEn ? 'Account holder name' : 'ชื่อ-นามสกุล'}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Additional Details */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            {isEn ? 'Additional Details (Other)' : 'รายละเอียดเพิ่มเติม (อื่นๆ)'}
          </label>
          <textarea
            name="additional_details"
            rows={2}
            placeholder={isEn ? 'Additional notes or details (optional)' : 'รายละเอียดเพิ่มเติม (ไม่บังคับ)'}
            className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
          />
        </div>

        {/* Receipt Upload */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            <Upload className="inline h-3.5 w-3.5 mr-1" />
            {isAdvance
              ? (isEn ? 'Attach Reference Documents (Optional)' : 'แนบเอกสารอ้างอิง (ไม่บังคับ)')
              : (isEn ? 'Attach Receipts (Optional)' : 'แนบใบเสร็จ (ไม่บังคับ)')}
          </label>
          {isAdvance && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-1.5">
              {isEn
                ? 'For advance payments, actual receipts are uploaded later when you settle the claim.'
                : 'ใบเสร็จจริงสามารถอัพโหลดย้อนหลังได้ หลังจากใช้จ่ายเสร็จแล้ว'}
            </p>
          )}
          <div
            className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-4 text-center hover:border-emerald-400 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="h-8 w-8 mx-auto text-zinc-400 mb-2" />
            <p className="text-sm text-zinc-500">
              {isEn ? 'Click to upload receipt images' : 'คลิกเพื่ออัปโหลดรูปใบเสร็จ'}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {isEn ? 'Supports images and PDF' : 'รองรับไฟล์รูปภาพและ PDF'}
            </p>
          </div>
          {receiptFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-zinc-500">
                {receiptFiles.length} {isEn ? 'file(s) selected' : 'ไฟล์ที่เลือก'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {receiptFiles.map((file, i) => (
                  <div
                    key={`${file.name}-${file.size}-${i}`}
                    className="relative group border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-zinc-50 dark:bg-zinc-800"
                  >
                    {/* Preview */}
                    {file.type.startsWith('image/') && previewUrls[i] ? (
                      <div className="aspect-square">
                        <img
                          src={previewUrls[i]}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="aspect-square flex flex-col items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                        <FileText className="h-10 w-10 text-red-400" />
                        <span className="text-[10px] text-zinc-400 mt-1 uppercase font-medium">
                          {file.name.split('.').pop()}
                        </span>
                      </div>
                    )}
                    {/* File info overlay */}
                    <div className="px-2 py-1.5 border-t border-zinc-200 dark:border-zinc-700">
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            {isEn ? 'Notes' : 'หมายเหตุ'}
          </label>
          <input
            type="text"
            name="notes"
            placeholder={isEn ? 'Additional notes (optional)' : 'หมายเหตุเพิ่มเติม (ไม่บังคับ)'}
            className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <button
            type="submit"
            disabled={isPending || (isPettyCash && !!openFund)}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Banknote className="h-4 w-4" />
            {isPending
              ? (isEn ? 'Submitting...' : 'กำลังส่ง...')
              : (isEn ? 'Submit Claim' : 'ส่งใบเบิก')
            }
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 text-sm font-medium"
          >
            {isEn ? 'Cancel' : 'ยกเลิก'}
          </button>
        </div>
      </form>
    </div>
  )
}
