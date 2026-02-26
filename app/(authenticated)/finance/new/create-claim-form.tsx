'use client'

import { useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Upload, X, Calendar, Tag, Receipt, Percent, Users } from 'lucide-react'
import { createClaim } from '../actions'
import { CLAIM_TYPES } from '../../costs/types'
import type { FinanceCategory, CategoryItem, StaffProfile } from '../settings-actions'
import { useLocale } from '@/lib/i18n/context'

interface Props {
  jobEvents: { id: string; event_name: string; event_date: string | null }[]
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
  const [claimType, setClaimType] = useState<'event' | 'other'>('event')
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.value || 'staff')
  const [receiptFiles, setReceiptFiles] = useState<File[]>([])
  const [unitPrice, setUnitPrice] = useState('0')
  const [quantity, setQuantity] = useState('1')
  const [vatMode, setVatMode] = useState('none')
  const [whtRate, setWhtRate] = useState('0')

  const computedAmount = (Number(unitPrice) || 0) * (Number(quantity) || 1)
  const whtRateNum = Number(whtRate) || 0
  const tax = calcTax(computedAmount, vatMode, whtRateNum)

  const [state, formAction, isPending] = useActionState(
    async (_prev: any, formData: FormData) => {
      const result = await createClaim(formData)
      if (result.success) {
        router.push('/finance')
        return { success: true }
      }
      return result
    },
    null
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReceiptFiles(prev => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removeFile = (index: number) => {
    setReceiptFiles(prev => prev.filter((_, i) => i !== index))
  }

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
          <div className="grid grid-cols-2 gap-3">
            {CLAIM_TYPES.map(type => (
              <button
                key={type.value}
                type="button"
                onClick={() => setClaimType(type.value as 'event' | 'other')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  claimType === type.value
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                }`}
              >
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {isEn ? type.label : type.labelTh}
                </p>
              </button>
            ))}
          </div>
          <input type="hidden" name="claim_type" value={claimType} />
        </div>

        {/* Event Selector (if event type) */}
        {claimType === 'event' && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isEn ? 'Select Event' : 'เลือกอีเวนต์'} *
            </label>
            <select
              name="job_event_id"
              required={claimType === 'event'}
              className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
            >
              <option value="">{isEn ? '— Select Event —' : '— เลือกอีเวนต์ —'}</option>
              {jobEvents.map(evt => (
                <option key={evt.id} value={evt.id}>
                  {evt.event_name} {evt.event_date ? `(${new Date(evt.event_date).toLocaleDateString('th-TH')})` : ''}
                </option>
              ))}
            </select>
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
            onChange={e => setSelectedCategory(e.target.value)}
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
                <select name="description" className={selectCls}>
                  <option value="">{isEn ? '— Select staff —' : '— เลือกชื่อพนักงาน —'}</option>
                  {staffProfiles.map(s => (
                    <option key={s.id} value={s.full_name}>{s.full_name} {s.role ? `· ${s.role}` : ''}</option>
                  ))}
                </select>
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

        {/* Unit Price + Unit + Quantity */}
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

        {/* Computed Amount + Date */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isEn ? 'Total Amount (฿)' : 'ยอดรวม (฿)'}
            </label>
            <div className="flex items-center h-[42px] px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 font-mono font-semibold text-sm">
              ฿{fmtDec(computedAmount)}
            </div>
            <input type="hidden" name="amount" value={computedAmount} />
            <p className="text-[10px] text-zinc-400 mt-1">
              {isEn ? 'Unit Price × Quantity (before VAT)' : 'ราคาต่อหน่วย × จำนวน (ก่อน VAT)'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              <Calendar className="inline h-3.5 w-3.5 mr-1" />
              {isEn ? 'Expense Date' : 'วันที่เกิดค่าใช้จ่าย'}
            </label>
            <input
              type="date"
              name="expense_date"
              defaultValue={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* VAT + WHT */}
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

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            {isEn ? 'Description' : 'รายละเอียด'}
          </label>
          <textarea
            name="description"
            rows={2}
            placeholder={isEn ? 'Additional details (optional)' : 'อธิบายรายละเอียดค่าใช้จ่ายเพิ่มเติม (ไม่บังคับ)'}
            className="w-full px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
          />
        </div>

        {/* Receipt Upload */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            <Upload className="inline h-3.5 w-3.5 mr-1" />
            {isEn ? 'Attach Receipts (Optional)' : 'แนบใบเสร็จ (ไม่บังคับ)'}
          </label>
          <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-4 text-center hover:border-emerald-400 transition-colors">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="receipt-upload"
            />
            <label htmlFor="receipt-upload" className="cursor-pointer">
              <Upload className="h-8 w-8 mx-auto text-zinc-400 mb-2" />
              <p className="text-sm text-zinc-500">
                {isEn ? 'Click to upload receipt images' : 'คลิกเพื่ออัปโหลดรูปใบเสร็จ'}
              </p>
            </label>
          </div>
          {receiptFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {receiptFiles.map((file, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-sm">
                  <span className="truncate text-zinc-600 dark:text-zinc-400">{file.name}</span>
                  <button type="button" onClick={() => removeFile(i)} className="text-zinc-400 hover:text-red-500 ml-2">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
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
            disabled={isPending}
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
