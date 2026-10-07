'use client'

import { useRef, type Dispatch, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DollarSign, FileText, Trash2, Upload, Eye } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { LeadInstallment } from '../../actions'
import {
  CollapsibleCardHeader, CardEditActions, EditField, EditSelect, InfoRow,
  type EditableCardProps, type FormInstallment,
} from '../shared'

interface ProofProps {
  initialInstallments: LeadInstallment[]
  localReceiptUrls: Record<string, string>
  uploadingInstallment: string | null
  onUploadProof: (installmentId: string, file: File) => void
  onDeleteProof: (installmentId: string) => void
}

export type FinancialCardProps = EditableCardProps & ProofProps & {
  formInstallments: FormInstallment[]
  setFormInstallments: Dispatch<SetStateAction<FormInstallment[]>>
}

/** ภาษีจากราคา — สูตรเดียวทั้งโหมดแก้ไขและโหมดดู */
function calcTax(basePrice: number, vatMode: string, whtRate: number) {
  const vatAmount = vatMode === 'excluded' ? basePrice * 0.07
    : vatMode === 'included' ? basePrice - (basePrice / 1.07) : 0
  const priceBeforeVat = vatMode === 'included' ? basePrice / 1.07 : basePrice
  const whtAmount = priceBeforeVat * (whtRate / 100)
  const netTotal = vatMode === 'excluded'
    ? basePrice + vatAmount - whtAmount
    : basePrice - whtAmount
  return { vatAmount, priceBeforeVat, whtAmount, netTotal }
}

// Financial Info
export function FinancialCard(props: FinancialCardProps) {
  const { lead, form, updateForm, editing, collapsed, saving, onEdit, onToggle, onSave, onCancel, formInstallments, initialInstallments } = props
  const { locale, t } = useLocale()
  const tc = t.crm.detail

  // โหมดแก้ไขคิดจากค่าในฟอร์ม · โหมดดูคิดจากข้อมูลที่บันทึกแล้ว
  const basePrice = editing ? (form.confirmed_price || form.quoted_price || 0) : (lead.confirmed_price || lead.quoted_price || 0)
  const vatMode = editing ? form.vat_mode : (lead.vat_mode || 'none')
  const whtRate = editing ? form.wht_rate : (lead.wht_rate || 0)
  const tax = calcTax(basePrice, vatMode, whtRate)
  const paidList: { is_paid: boolean; amount: number }[] = editing ? formInstallments : initialInstallments
  const totalPaid = (editing ? form.deposit : (lead.deposit || 0)) + paidList.filter(i => i.is_paid).reduce((s, i) => s + (i.amount || 0), 0)
  const outstanding = tax.netTotal - totalPaid
  const balance = { editing, basePrice, netTotal: tax.netTotal, totalPaid, outstanding }

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
      <CollapsibleCardHeader
        collapsed={collapsed}
        icon={<DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
        iconBg="bg-emerald-50 dark:bg-emerald-950/40"
        title={tc.financial}
        badge={props.badge}
        editing={editing} onEdit={onEdit} onToggle={onToggle}
      />
      {!collapsed && <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-4">
            <EditField label={`${tc.quotedPrice} (฿)`} value={String(form.quoted_price)} onChange={v => updateForm('quoted_price', Number(v) || 0)} type="number" />
            <EditField label={`${tc.confirmedPrice} (฿)`} value={String(form.confirmed_price)} onChange={v => updateForm('confirmed_price', Number(v) || 0)} type="number" />
            <EditField label={`${tc.depositLabel} (฿)`} value={String(form.deposit)} onChange={v => updateForm('deposit', Number(v) || 0)} type="number" />

            {/* Tax Settings */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <p className="text-xs font-semibold text-zinc-500 mb-3">{locale === 'th' ? '💰 การคำนวณภาษี' : '💰 Tax Calculation'}</p>
              <div className="grid grid-cols-2 gap-3">
                <EditSelect
                  label={locale === 'th' ? 'VAT' : 'VAT Mode'}
                  value={form.vat_mode}
                  onChange={v => updateForm('vat_mode', v)}
                  options={[{ value: 'none', label: locale === 'th' ? 'ไม่มี VAT' : 'No VAT' }, { value: 'included', label: locale === 'th' ? 'รวม VAT แล้ว' : 'VAT Included' }, { value: 'excluded', label: locale === 'th' ? 'ยังไม่รวม VAT' : 'VAT Excluded' },]}
                />
                <EditSelect
                  label={locale === 'th' ? 'หัก ณ ที่จ่าย' : 'WHT Rate'}
                  value={String(form.wht_rate)}
                  onChange={v => updateForm('wht_rate', Number(v))}
                  options={[{ value: '0', label: locale === 'th' ? 'ไม่หัก' : 'None' }, { value: '1', label: '1%' }, { value: '2', label: '2%' }, { value: '3', label: '3%' }, { value: '5', label: '5%' },]}
                />
              </div>
              <TaxSummary editing basePrice={basePrice} vatMode={vatMode} whtRate={whtRate} {...tax} />
            </div>

            <InstallmentList {...props} />

            <OutstandingBalance {...balance} />

            <EditField label={tc.quotationRef} value={form.quotation_ref} onChange={v => updateForm('quotation_ref', v)} />
            <div>
              <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{tc.notesLabel}</Label>
              <Textarea value={form.notes} onChange={e => updateForm('notes', e.target.value)} rows={3} className="text-sm" placeholder={tc.notesPlaceholder} />
            </div>
            <CardEditActions saving={saving} onSave={onSave} onCancel={onCancel} />
          </div>
        ) : (
          <>
            <InfoRow label={tc.quotedPrice} value={lead.quoted_price ? `฿${lead.quoted_price.toLocaleString()}` : null} />
            <InfoRow label={tc.confirmedPrice} value={lead.confirmed_price ? `฿${lead.confirmed_price.toLocaleString()}` : null} />
            <InfoRow label={tc.depositLabel} value={lead.deposit ? `฿${lead.deposit.toLocaleString()}` : null} />

            <TaxSummary editing={false} basePrice={basePrice} vatMode={vatMode} whtRate={whtRate} {...tax} />

            <InstallmentList {...props} />

            <OutstandingBalance {...balance} />

            <InfoRow label={tc.quotationRef} value={lead.quotation_ref} />
            {lead.notes && <InfoRow label={tc.notesLabel} value={lead.notes} />}
          </>
        )}
      </CardContent>}
    </Card>
  )
}

// Tax Summary — โหมดแก้ไขโชว์ VAT แบบสั้น · โหมดดูบอกว่ารวม/ยังไม่รวม
function TaxSummary({ editing, basePrice, vatMode, whtRate, vatAmount, priceBeforeVat, whtAmount, netTotal }: {
  editing: boolean
  basePrice: number
  vatMode: string
  whtRate: number
} & ReturnType<typeof calcTax>) {
  const { locale } = useLocale()
  if (!((vatMode !== 'none' || whtRate > 0) && basePrice > 0)) return null
  return (
    <div className={`${editing ? 'mt-3 ' : ''}p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-1.5`}>
      {vatMode !== 'none' && (
        <>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">{locale === 'th' ? 'ราคาก่อน VAT' : 'Before VAT'}</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">฿{priceBeforeVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-xs">
            {editing
              ? <span className="text-zinc-500">VAT 7%</span>
              : <span className="text-zinc-500">VAT 7% ({vatMode === 'included' ? (locale === 'th' ? 'รวมแล้ว' : 'incl.') : (locale === 'th' ? 'ยังไม่รวม' : 'excl.')})</span>}
            <span className="font-medium text-blue-600 dark:text-blue-400">{editing || vatMode === 'excluded' ? '+' : ''}฿{vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </>
      )}
      {whtRate > 0 && (
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">{locale === 'th' ? `หัก ณ ที่จ่าย ${whtRate}%` : `WHT ${whtRate}%`}</span>
          <span className="font-medium text-red-600 dark:text-red-400">-฿{whtAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
      )}
      <div className="border-t border-emerald-200 dark:border-emerald-800 pt-1.5 flex justify-between text-xs">
        <span className="font-semibold text-zinc-700 dark:text-zinc-300">{locale === 'th' ? 'ยอดสุทธิ' : 'Net Total'}</span>
        <span className="font-bold text-emerald-700 dark:text-emerald-300">฿{netTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  )
}

// Outstanding Balance — โหมดแก้ไขโชว์เมื่อยอดสุทธิ > 0 · โหมดดูโชว์เมื่อมีราคา
function OutstandingBalance({ editing, basePrice, netTotal, totalPaid, outstanding }: {
  editing: boolean
  basePrice: number
  netTotal: number
  totalPaid: number
  outstanding: number
}) {
  const { locale } = useLocale()
  if (!(editing ? netTotal > 0 : basePrice > 0)) return null
  return (
    <div className={`p-3 rounded-lg ${outstanding <= 0 ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30' : 'bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30'}`}>
      <div className="flex justify-between items-center">
        <span className={`text-xs font-semibold ${outstanding <= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
          {outstanding <= 0 ? (locale === 'th' ? '✅ ชำระครบ' : '✅ Fully Paid') : (locale === 'th' ? '💳 ยอดค้างชำระ' : '💳 Outstanding')}
        </span>
        <span className={`text-sm font-bold ${outstanding <= 0 ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-300'}`}>
          ฿{outstanding.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
        <span>{locale === 'th' ? 'ชำระแล้ว' : 'Paid'}: ฿{totalPaid.toLocaleString()}</span>
        <span>{locale === 'th' ? 'ยอดสุทธิ' : 'Net'}: ฿{netTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  )
}

// Dynamic Installments — โหมดแก้ไขเป็นฟอร์ม (เพิ่ม/ลบงวด) · โหมดดูเป็นการ์ดสถานะ · หลักฐานโอนใช้ PaymentProof ตัวเดียวกัน
function InstallmentList({ editing, formInstallments, setFormInstallments, initialInstallments, localReceiptUrls, uploadingInstallment, ...proof }: FinancialCardProps) {
  const { locale, t } = useLocale()
  const tc = t.crm.detail
  const proofFor = (inst: LeadInstallment) => (
    <PaymentProof
      editing={editing}
      proofUrl={localReceiptUrls[inst.id] || inst.receipt_url}
      isUploading={uploadingInstallment === inst.id}
      onUpload={f => proof.onUploadProof(inst.id, f)}
      onDelete={() => proof.onDeleteProof(inst.id)}
    />
  )

  if (!editing) {
    return (
      <>
        {initialInstallments.map(inst => {
          const isOverduePayment = inst.due_date && !inst.is_paid && new Date(inst.due_date) < new Date()
          const borderColor = inst.is_paid
            ? 'border-l-emerald-500'
            : isOverduePayment
              ? 'border-l-red-500'
              : 'border-l-zinc-200 dark:border-l-zinc-700'

          return (
            <div key={inst.id} className={`border-l-[3px] ${borderColor} rounded-r-lg bg-zinc-50/50 dark:bg-zinc-800/30 px-3 py-2.5`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {locale === 'th' ? `ชำระงวด ${inst.installment_number}` : `Installment ${inst.installment_number}`}
                </span>
                {inst.is_paid ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                    ✓ {tc.paid || 'ชำระแล้ว'}
                  </span>
                ) : isOverduePayment ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                    ⚠ {tc.overdue || 'เลยกำหนด'}
                  </span>
                ) : inst.due_date ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                    {tc.unpaid || 'ยังไม่ชำระ'}
                  </span>
                ) : null}
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {inst.amount ? `฿${inst.amount.toLocaleString()}` : '—'}
                </span>
                {inst.due_date && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {tc.dueDate || 'วันนัดชำระ'}: {inst.due_date}
                  </span>
                )}
              </div>
              {inst.is_paid && inst.paid_date && (
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {tc.paidDate || 'วันที่ชำระจริง'}: {inst.paid_date}
                </div>
              )}
              {proofFor(inst)}
            </div>
          )
        })}
      </>
    )
  }

  const patch = (idx: number, change: (item: FormInstallment) => Partial<FormInstallment>) =>
    setFormInstallments(prev => prev.map((item, i) => i === idx ? { ...item, ...change(item) } : item))

  return (
    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-zinc-500">{locale === 'th' ? '📋 งวดชำระเงิน' : '📋 Payment Installments'}</p>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1"
          onClick={() => setFormInstallments(prev => [...prev, { installment_number: formInstallments.length + 1, amount: 0, due_date: '', is_paid: false, paid_date: '' }])}>
          + {locale === 'th' ? 'เพิ่มงวด' : 'Add'}
        </Button>
      </div>
      {formInstallments.map((inst, idx) => (
        <div key={idx} className="space-y-2 mb-4 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 relative">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              {locale === 'th' ? `ชำระงวด ${inst.installment_number}` : `Installment ${inst.installment_number}`}
            </span>
            <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => setFormInstallments(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, installment_number: i + 1 })))}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EditField label={`${locale === 'th' ? 'จำนวน' : 'Amount'} (฿)`} value={String(inst.amount)} onChange={v => patch(idx, () => ({ amount: Number(v) || 0 }))} type="number" />
            <EditField label={tc.dueDate || 'วันนัดชำระ'} value={inst.due_date} onChange={v => patch(idx, () => ({ due_date: v }))} type="date" />
          </div>
          <div className="flex items-center gap-3 pl-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={inst.is_paid}
                onChange={e => patch(idx, item => ({
                  is_paid: e.target.checked,
                  paid_date: e.target.checked ? (item.paid_date || new Date().toISOString().split('T')[0]) : '',
                }))}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className={`text-xs font-medium ${inst.is_paid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                {tc.paid || 'ชำระแล้ว'}
              </span>
            </label>
            {inst.is_paid && (
              <div className="flex-1 max-w-[180px]">
                <EditField label={tc.paidDate || 'วันที่ชำระจริง'} value={inst.paid_date} onChange={v => patch(idx, () => ({ paid_date: v }))} type="date" />
              </div>
            )}
          </div>
          {/* ponytail: งวดในฟอร์มจับคู่กับงวดที่บันทึกแล้วตามลำดับ (เหมือนเดิม) — ลบงวดกลางแล้วสลิปเลื่อนตามจนกว่าจะบันทึก */}
          {initialInstallments[idx] ? proofFor(initialInstallments[idx]) : null}
        </div>
      ))}
      {formInstallments.length === 0 && (
        <p className="text-xs text-zinc-400 text-center py-3">{locale === 'th' ? 'ยังไม่มีงวดชำระ' : 'No installments yet'}</p>
      )}
    </div>
  )
}

// Payment Proof — อัปโหลด/เปลี่ยน/ลบสลิปของงวดที่บันทึกแล้ว (โหมดดูมีลิงก์ดูขนาดเต็มเพิ่ม)
function PaymentProof({ editing, proofUrl, isUploading, onUpload, onDelete }: {
  editing: boolean
  proofUrl: string | null
  isUploading: boolean
  onUpload: (file: File) => void
  onDelete: () => void
}) {
  const { locale } = useLocale()
  const inputRef = useRef<HTMLInputElement>(null)
  const title = locale === 'th' ? 'หลักฐานการชำระเงิน' : 'Payment Proof'
  const fileInput = (
    <input
      type="file"
      accept="image/*,.pdf"
      className="hidden"
      ref={inputRef}
      onChange={e => {
        const f = e.target.files?.[0]
        if (f) onUpload(f)
        e.target.value = ''
      }}
    />
  )
  return (
    <div className={`mt-2 pt-2 border-t border-zinc-100 ${editing ? 'dark:border-zinc-700' : 'dark:border-zinc-700/50'}`}>
      {editing ? (
        <Label className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5">
          <Upload className="h-3 w-3" />
          {title}
        </Label>
      ) : (
        <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mb-1.5">
          <Upload className="h-3 w-3" />
          {title}
        </span>
      )}
      {proofUrl ? (
        <div className={editing ? 'flex items-center gap-2 mt-1' : 'flex items-center gap-2'}>
          <div className={editing
            ? 'relative group w-16 h-16 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0'
            : 'relative group w-14 h-14 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0 cursor-pointer'}>
            {editing ? (
              <>
                {proofUrl.endsWith('.pdf') ? (
                  <div className="w-full h-full flex items-center justify-center bg-red-50 dark:bg-red-950/30">
                    <FileText className="h-6 w-6 text-red-500" />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proofUrl} alt="receipt" className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded bg-white/20 hover:bg-white/40">
                    <Eye className="h-3 w-3 text-white" />
                  </a>
                </div>
              </>
            ) : proofUrl.endsWith('.pdf') ? (
              <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="w-full h-full flex items-center justify-center bg-red-50 dark:bg-red-950/30">
                <FileText className="h-5 w-5 text-red-500" />
              </a>
            ) : (
              <a href={proofUrl} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proofUrl} alt="receipt" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Eye className="h-4 w-4 text-white" />
                </div>
              </a>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ {locale === 'th' ? 'อัพโหลดแล้ว' : 'Uploaded'}</span>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" disabled={isUploading} onClick={() => inputRef.current?.click()}>
                <Upload className="h-2.5 w-2.5" />
                {locale === 'th' ? 'เปลี่ยน' : 'Change'}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2 gap-1 text-red-500 hover:text-red-700 hover:bg-red-50" disabled={isUploading} onClick={onDelete}>
                <Trash2 className="h-2.5 w-2.5" />
                {locale === 'th' ? 'ลบ' : 'Delete'}
              </Button>
            </div>
            {!editing && (
              <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                {locale === 'th' ? 'ดูขนาดเต็ม' : 'View full size'}
              </a>
            )}
          </div>
          {fileInput}
        </div>
      ) : (
        <div
          className={`${editing ? 'mt-1 ' : ''}border-2 border-dashed rounded-lg ${editing ? 'p-3' : 'p-2.5'} text-center cursor-pointer transition-colors ${isUploading ? 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/10'}`}
          onClick={() => !isUploading && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
          onDrop={e => {
            e.preventDefault(); e.stopPropagation()
            const f = e.dataTransfer.files[0]
            if (f) onUpload(f)
          }}
        >
          {isUploading ? (
            <div className="flex items-center justify-center gap-2">
              <div className={`${editing ? 'h-4 w-4' : 'h-3.5 w-3.5'} border-2 border-blue-500 border-t-transparent rounded-full animate-spin`} />
              <span className="text-xs text-blue-600 dark:text-blue-400">{locale === 'th' ? 'กำลังอัพโหลด...' : 'Uploading...'}</span>
            </div>
          ) : editing ? (
            <>
              <Upload className="h-5 w-5 text-zinc-400 mx-auto mb-1" />
              <p className="text-xs text-zinc-500">
                {locale === 'th' ? 'คลิกหรือลากไฟล์มาวาง' : 'Click or drag file here'}
              </p>
              <p className="text-[10px] text-zinc-400 mt-0.5">JPEG, PNG, WebP, PDF (สูงสุด 10MB)</p>
            </>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Upload className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-500">
                {locale === 'th' ? 'อัพโหลดสลิป' : 'Upload slip'}
              </span>
            </div>
          )}
          {fileInput}
        </div>
      )}
    </div>
  )
}
