'use client'

import { useRef, type Dispatch, type SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, Calculator, Check, CheckCircle2, DollarSign, FileText, Receipt, Trash2, Upload, Wallet } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { formatThaiDate } from '@/lib/thai-date'
import type { LeadInstallment } from '../../actions'
import type { CrmLead } from '../../types'
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
export function calcTax(basePrice: number, vatMode: string, whtRate: number) {
  const vatAmount = vatMode === 'excluded' ? basePrice * 0.07
    : vatMode === 'included' ? basePrice - (basePrice / 1.07) : 0
  const priceBeforeVat = vatMode === 'included' ? basePrice / 1.07 : basePrice
  const whtAmount = priceBeforeVat * (whtRate / 100)
  const netTotal = vatMode === 'excluded'
    ? basePrice + vatAmount - whtAmount
    : basePrice - whtAmount
  return { vatAmount, priceBeforeVat, whtAmount, netTotal }
}

/** ยอดสุทธิ / ชำระแล้ว / ค้าง — ที่เดียวทั้งการ์ด (ค่าในฟอร์มหรือค่าที่บันทึก) และบรรทัดสรุปตอนพับใน LeadCards
 *  agreed = มีราคายืนยันหรือมีเงินเข้าแล้ว — ราคาเสนออย่างเดียวยังไม่นับเป็น "ค้างชำระ" (กันทีมขายอ่านผิด) */
export function calcBalance(v: {
  quotedPrice: number
  confirmedPrice: number
  deposit: number
  vatMode: string
  whtRate: number
  installments: { is_paid: boolean; amount: number }[]
}) {
  const basePrice = v.confirmedPrice || v.quotedPrice || 0
  const tax = calcTax(basePrice, v.vatMode, v.whtRate)
  const totalPaid = v.deposit + v.installments.filter(i => i.is_paid).reduce((s, i) => s + (i.amount || 0), 0)
  return { basePrice, tax, totalPaid, outstanding: tax.netTotal - totalPaid, agreed: v.confirmedPrice > 0 || totalPaid > 0 }
}

/** calcBalance จากข้อมูลที่บันทึกแล้วของ lead */
export const leadBalance = (lead: CrmLead, installments: { is_paid: boolean; amount: number }[]) => calcBalance({
  quotedPrice: lead.quoted_price || 0,
  confirmedPrice: lead.confirmed_price || 0,
  deposit: lead.deposit || 0,
  vatMode: lead.vat_mode || 'none',
  whtRate: lead.wht_rate || 0,
  installments,
})

export const baht = (n: number) => `฿${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

// Financial Info
export function FinancialCard(props: FinancialCardProps) {
  const { lead, form, updateForm, editing, collapsed, saving, onEdit, onToggle, onSave, onCancel, formInstallments, initialInstallments } = props
  const { locale, t } = useLocale()
  const tc = t.crm.detail
  const L = (th: string, en: string) => (locale === 'th' ? th : en)

  // โหมดแก้ไขคิดจากค่าในฟอร์ม · โหมดดูคิดจากข้อมูลที่บันทึกแล้ว
  const b = editing
    ? calcBalance({
      quotedPrice: form.quoted_price, confirmedPrice: form.confirmed_price, deposit: form.deposit,
      vatMode: form.vat_mode, whtRate: form.wht_rate, installments: formInstallments,
    })
    : leadBalance(lead, initialInstallments)
  const { basePrice, tax, totalPaid, outstanding } = b
  const vatMode = editing ? form.vat_mode : (lead.vat_mode || 'none')
  const whtRate = editing ? form.wht_rate : (lead.wht_rate || 0)
  const quotedPrice = editing ? form.quoted_price : (lead.quoted_price || 0)
  const balance = { agreed: b.agreed, quotedPrice, netTotal: tax.netTotal, totalPaid, outstanding }
  // ช่องเงิน: แป้นตัวเลขบนมือถือ + ฿ ในกล่อง
  const money = { type: 'number', inputMode: 'decimal', min: 0, prefix: '฿' } as const

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
      <CollapsibleCardHeader
        collapsed={collapsed}
        icon={<DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
        iconBg="bg-emerald-50 dark:bg-emerald-950/40"
        title={tc.financial}
        badge={props.badge} summary={props.summary}
        editing={editing} editLocked={props.editLocked} onEdit={onEdit} onToggle={onToggle}
        saving={saving} onSave={onSave} onCancel={onCancel}
      />
      {!collapsed && <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
              <EditField label={`${tc.quotedPrice} (฿)`} value={String(form.quoted_price)} onChange={v => updateForm('quoted_price', Number(v) || 0)} {...money} />
              <EditField label={`${tc.confirmedPrice} (฿)`} value={String(form.confirmed_price)} onChange={v => updateForm('confirmed_price', Number(v) || 0)} {...money} />
            </div>
            <EditField label={`${tc.depositLabel} (฿)`} value={String(form.deposit)} onChange={v => updateForm('deposit', Number(v) || 0)} {...money} />

            {/* Tax Settings */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <p className="text-xs font-semibold text-zinc-500 mb-3 flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5" />
                {L('การคำนวณภาษี', 'Tax Calculation')}
              </p>
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
            {/* ตัวเลขที่ต้องรู้ก่อน — แสดงเมื่อตกลงราคาแล้ว (เงื่อนไขเดียวกับกล่องยอดค้าง) */}
            {b.agreed && (
              <div className="grid grid-cols-3 gap-2">
                {([
                  [L('ยอดสุทธิ', 'Net'), tax.netTotal, 'text-zinc-900 dark:text-zinc-100'],
                  [L('ชำระแล้ว', 'Paid'), totalPaid, 'text-emerald-600 dark:text-emerald-400'],
                  [L('ค้างชำระ', 'Due'), outstanding, outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'],
                ] as const).map(([label, amount, color]) => (
                  <div key={label} className="min-w-0 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 px-2.5 py-2">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
                    <div className={`text-base font-semibold tabular-nums break-all ${color}`}>{baht(amount)}</div>
                  </div>
                ))}
              </div>
            )}
            {/* ราคา = ช่องหลัก: ไม่มีทั้งเสนอและยืนยัน → แถวราคาเสนอขึ้น "ไม่ระบุ" */}
            <InfoRow label={tc.quotedPrice} value={lead.quoted_price ? `฿${lead.quoted_price.toLocaleString()}` : null} hideEmpty={!!lead.confirmed_price} />
            <InfoRow label={tc.confirmedPrice} value={lead.confirmed_price ? `฿${lead.confirmed_price.toLocaleString()}` : null} />
            <InfoRow label={tc.depositLabel} value={lead.deposit ? `฿${lead.deposit.toLocaleString()}` : null} />

            <TaxSummary editing={false} basePrice={basePrice} vatMode={vatMode} whtRate={whtRate} {...tax} />

            <InstallmentList {...props} />

            <OutstandingBalance {...balance} />

            <InfoRow label={tc.quotationRef} value={lead.quotation_ref} />
            <InfoRow label={tc.notesLabel} value={lead.notes} multiline />
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

// Outstanding Balance — แสดงเมื่อตกลงราคาแล้ว (ราคายืนยัน หรือมีเงินเข้า) · มีแค่ราคาเสนอ = บรรทัดจางๆ แทน
function OutstandingBalance({ agreed, quotedPrice, netTotal, totalPaid, outstanding }: {
  agreed: boolean
  quotedPrice: number
  netTotal: number
  totalPaid: number
  outstanding: number
}) {
  const { locale } = useLocale()
  const L = (th: string, en: string) => (locale === 'th' ? th : en)
  if (!agreed) {
    if (!(quotedPrice > 0)) return null
    return <p className="text-xs text-zinc-400">{L(`ยังไม่ตกลงราคา (เสนอ ${baht(quotedPrice)})`, `Price not agreed (quoted ${baht(quotedPrice)})`)}</p>
  }
  const done = outstanding <= 0
  return (
    <div className={`p-3 rounded-lg ${done ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30' : 'bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30'}`}>
      <div className="flex justify-between items-center">
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${done ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
          {done ? L('ชำระครบ', 'Fully Paid') : L('ยอดค้างชำระ', 'Outstanding')}
        </span>
        <span className={`text-sm font-bold ${done ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-300'}`}>
          {baht(outstanding)}
        </span>
      </div>
      <div className="flex justify-between text-xs text-zinc-500 mt-1">
        <span>{L('ชำระแล้ว', 'Paid')}: ฿{totalPaid.toLocaleString()}</span>
        <span>{L('ยอดสุทธิ', 'Net')}: {baht(netTotal)}</span>
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
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                    <Check className="h-3.5 w-3.5" /> {tc.paid || 'ชำระแล้ว'}
                  </span>
                ) : isOverduePayment ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="h-3.5 w-3.5" /> {tc.overdue || 'เลยกำหนด'}
                  </span>
                ) : inst.due_date ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    {tc.unpaid || 'ยังไม่ชำระ'}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {inst.amount ? `฿${inst.amount.toLocaleString()}` : '—'}
                </span>
                {inst.due_date && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {tc.dueDate || 'วันนัดชำระ'}: {formatThaiDate(inst.due_date)}
                  </span>
                )}
              </div>
              {inst.is_paid && inst.paid_date && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {tc.paidDate || 'วันที่ชำระจริง'}: {formatThaiDate(inst.paid_date)}
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
        <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5" />
          {locale === 'th' ? 'งวดชำระเงิน' : 'Payment Installments'}
        </p>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1"
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
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => setFormInstallments(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, installment_number: i + 1 })))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <EditField label={`${locale === 'th' ? 'จำนวน' : 'Amount'} (฿)`} value={String(inst.amount)} onChange={v => patch(idx, () => ({ amount: Number(v) || 0 }))} type="number" inputMode="decimal" min={0} prefix="฿" />
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

// Payment Proof — อัปโหลด/เปลี่ยนสลิปของงวดที่บันทึกแล้ว · ลบได้เฉพาะโหมดแก้ไข (ปุ่มทำลายข้อมูลไม่อยู่ในโหมดดู)
// ภาพเป็นลิงก์เปิดขนาดเต็มเสมอ ไม่พึ่ง hover (มือถือแตะได้)
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
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mb-1.5">
          <Upload className="h-3 w-3" />
          {title}
        </span>
      )}
      {proofUrl ? (
        <div className={editing ? 'flex items-center gap-2 mt-1' : 'flex items-center gap-2'}>
          <a
            href={proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${editing ? 'w-16 h-16' : 'w-14 h-14'} rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 shrink-0`}
          >
            {proofUrl.endsWith('.pdf') ? (
              <span className="w-full h-full flex items-center justify-center bg-red-50 dark:bg-red-950/30">
                <FileText className={editing ? 'h-6 w-6 text-red-500' : 'h-5 w-5 text-red-500'} />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proofUrl} alt="receipt" className="w-full h-full object-cover" />
            )}
          </a>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              {locale === 'th' ? 'อัพโหลดแล้ว' : 'Uploaded'}
            </span>
            <div className="flex gap-1">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-2.5 gap-1" disabled={isUploading} onClick={() => inputRef.current?.click()}>
                <Upload className="h-3 w-3" />
                {locale === 'th' ? 'เปลี่ยน' : 'Change'}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2.5 gap-1 text-red-500 hover:text-red-700 hover:bg-red-50" disabled={isUploading} onClick={onDelete}>
                  <Trash2 className="h-3 w-3" />
                  {locale === 'th' ? 'ลบ' : 'Delete'}
                </Button>
              )}
            </div>
            {!editing && (
              <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
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
              <p className="text-xs text-zinc-400 mt-0.5">JPEG, PNG, WebP, PDF (สูงสุด 10MB)</p>
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
