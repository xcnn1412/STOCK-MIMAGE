'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Trash2, FileText,
  Banknote, User, Calendar, Tag, MessageSquare, Edit3, Save, X,
  Receipt, Percent, Upload, History, FileDown, Send, Ban, ShieldAlert
} from 'lucide-react'
import { approveClaim, rejectClaim, deleteClaim, updateClaim, submitClaim, cancelClaim, markAsPaid, markAsPendingMonthEnd, approveAsPendingMonthEnd, adminOverrideStatus, markAsWaitingTaxInvoice, uploadTaxInvoice } from '../actions'
import { getClaimStatusLabel, getClaimStatusColor, getCategoryLabel, getAdminOverrideStatuses, isAdminSensitiveTransition, CLAIM_STATUSES } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { useLocale } from '@/lib/i18n/context'
import type { ExpenseClaim } from '../../costs/types'
import BankSelect from '@/components/bank-select'
import { compressImage } from '@/lib/utils'
import EventSelectCombobox from '../new/event-select-combobox'

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

interface ClaimLog {
  id: string
  action: string
  changed_by: string | null
  changes: Record<string, { from: any; to: any }>
  note: string | null
  created_at: string
  editor?: { id: string; full_name: string } | null
}

interface JobEventOption {
  id: string
  event_name: string
  event_date: string | null
  event_location: string | null
  status: string
}

export default function ClaimDetailView({ claim, role, categories = [], logs = [], userId = '', jobEvents = [] }: { claim: ExpenseClaim; role: string; categories?: FinanceCategory[]; logs?: ClaimLog[]; userId?: string; jobEvents?: JobEventOption[] }) {
  const router = useRouter()
  const { locale } = useLocale()
  const [loading, setLoading] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [overrideStatus, setOverrideStatus] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [editReceiptFiles, setEditReceiptFiles] = useState<File[]>([])
  const [taxInvoiceFiles, setTaxInvoiceFiles] = useState<File[]>([])

  // Edit form state
  const [editTitle, setEditTitle] = useState(claim.title)
  const [editDescription, setEditDescription] = useState(claim.description || '')
  const [editCategory, setEditCategory] = useState(claim.category)
  const [editUnitPrice, setEditUnitPrice] = useState(String(claim.unit_price || claim.amount || 0))
  const [editUnit, setEditUnit] = useState(claim.unit || 'บาท')
  const [editQuantity, setEditQuantity] = useState(String(claim.quantity))
  const [editDate, setEditDate] = useState(claim.expense_date)
  const [editVatMode, setEditVatMode] = useState(claim.vat_mode || 'none')
  const [editWhtRate, setEditWhtRate] = useState(String(claim.withholding_tax_rate || 0))
  const [editNotes, setEditNotes] = useState(claim.notes || '')
  const [editBankName, setEditBankName] = useState(claim.bank_name || '')
  const [editBankAccount, setEditBankAccount] = useState(claim.bank_account_number || '')
  const [editAccountHolder, setEditAccountHolder] = useState(claim.account_holder_name || '')
  const [editClaimType, setEditClaimType] = useState<'event' | 'other'>(claim.claim_type as 'event' | 'other' || 'other')
  const [editEventId, setEditEventId] = useState(claim.job_event_id || '')

  const isAdmin = role === 'admin'
  const isOwner = claim.submitted_by === userId
  const isDraft = claim.status === 'draft'
  const isPending = claim.status === 'pending'
  const isApproved = claim.status === 'approved' || claim.status === 'awaiting_payment'
  const isPendingMonthEnd = claim.status === 'pending_month_end'
  const isWaitingTaxInvoice = claim.status === 'waiting_tax_invoice'
  const isCancelled = claim.status === 'cancelled'
  const isTerminal = ['paid', 'rejected', 'cancelled'].includes(claim.status)
  const canEdit = isAdmin || ((isDraft || isPending) && isOwner)
  const canSubmit = isOwner && isDraft
  const canCancel = isOwner && !isAdmin && (isDraft || isPending)
  const statusColor = getClaimStatusColor(claim.status)
  const isEn = locale === 'en'

  const editComputedAmount = (Number(editUnitPrice) || 0) * (Number(editQuantity) || 1)
  const editWhtRateNum = Number(editWhtRate) || 0
  const editTax = calcTax(editComputedAmount, editVatMode, editWhtRateNum)

  // View mode tax calc
  const viewAmount = claim.amount || 0
  const viewVatMode = claim.vat_mode || 'none'
  const viewWhtRate = claim.withholding_tax_rate || 0
  const viewTax = calcTax(viewAmount, viewVatMode, viewWhtRate)

  const handleApprove = async () => {
    if (!confirm(isEn ? 'Confirm approval?' : 'ยืนยันอนุมัติใบเบิกนี้?')) return
    setLoading(true)
    setError(null)
    const result = await approveClaim(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleReject = async () => {
    setLoading(true)
    setError(null)
    const result = await rejectClaim(claim.id, rejectReason)
    if (result.error) { setError(result.error); setLoading(false) }
    else { setRejectOpen(false); router.refresh(); setLoading(false) }
  }

  const handleDelete = async () => {
    if (!confirm(isEn ? 'Confirm deletion?' : 'ยืนยันลบใบเบิกนี้?')) return
    setLoading(true)
    const result = await deleteClaim(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.push('/finance') }
  }

  const handleSubmit = async () => {
    if (!confirm(isEn ? 'Submit this claim for approval?' : 'ยืนยันยื่นใบเบิกนี้เพื่อขออนุมัติ?')) return
    setLoading(true)
    setError(null)
    const result = await submitClaim(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleCancel = async () => {
    if (!confirm(isEn ? 'Cancel this claim? This cannot be undone.' : 'ยืนยันยกเลิกใบเบิกนี้? ไม่สามารถย้อนกลับได้')) return
    setLoading(true)
    setError(null)
    const result = await cancelClaim(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleMarkPaid = async () => {
    if (!confirm(isEn ? 'Confirm payment for this claim?' : 'ยืนยันการชำระเงินใบเบิกนี้?')) return
    setLoading(true)
    setError(null)
    const result = await markAsPaid(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleDeferMonthEnd = async () => {
    if (!confirm(isEn ? 'Defer payment to end of month?' : 'เลื่อนการชำระเงินไปสิ้นเดือน?')) return
    setLoading(true)
    setError(null)
    const result = await markAsPendingMonthEnd(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleApproveAsMonthEnd = async () => {
    if (!confirm(isEn ? 'Approve and defer to end of month?' : 'อนุมัติและเลื่อนจ่ายสิ้นเดือน?')) return
    setLoading(true)
    setError(null)
    const result = await approveAsPendingMonthEnd(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleMarkWaitingTaxInvoice = async () => {
    setLoading(true)
    setError(null)
    const result = await markAsWaitingTaxInvoice(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleUploadTaxInvoice = async () => {
    if (taxInvoiceFiles.length === 0) { setError(isEn ? 'Please select at least one file.' : 'กรุณาเลือกไฟล์ก่อนอัพโหลด'); return }
    setLoading(true)
    setError(null)
    const formData = new FormData()
    for (const f of taxInvoiceFiles) {
      const compressed = f.type.startsWith('image/') ? await compressImage(f) : f
      formData.append('tax_invoice_files', compressed)
    }
    const result = await uploadTaxInvoice(claim.id, formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else { setTaxInvoiceFiles([]); router.refresh(); setLoading(false) }
  }

  const handleAdminOverride = async () => {
    if (!overrideStatus) return
    if (!overrideReason.trim()) { setError(isEn ? 'Please enter a reason for the override.' : 'กรุณาระบุเหตุผลในการเปลี่ยนสถานะ'); return }
    setLoading(true)
    setError(null)
    const result = await adminOverrideStatus(claim.id, overrideStatus, overrideReason)
    if (result.error) { setError(result.error); setLoading(false) }
    else { setOverrideOpen(false); setOverrideStatus(''); setOverrideReason(''); router.refresh(); setLoading(false) }
  }

  const handleSaveEdit = async () => {
    setLoading(true)
    setError(null)
    let receiptFormData: FormData | undefined
    if (editReceiptFiles.length > 0) {
      receiptFormData = new FormData()
      // Compress images before uploading to avoid body size limit on mobile
      for (const f of editReceiptFiles) {
        const compressed = f.type.startsWith('image/') ? await compressImage(f) : f
        receiptFormData.append('receipt_files', compressed)
      }
    }
    const result = await updateClaim(claim.id, {
      title: editTitle,
      description: editDescription || null,
      category: editCategory,
      amount: editComputedAmount,
      unit_price: Number(editUnitPrice) || 0,
      unit: editUnit,
      quantity: Number(editQuantity) || 1,
      expense_date: editDate,
      vat_mode: editVatMode,
      include_vat: editVatMode !== 'none',
      withholding_tax_rate: editWhtRateNum,
      notes: editNotes || null,
      bank_name: editBankName || null,
      bank_account_number: editBankAccount || null,
      account_holder_name: editAccountHolder || null,
      claim_type: editClaimType,
      job_event_id: editClaimType === 'event' ? editEventId || null : null,
    }, receiptFormData)
    if (result.error) { setError(result.error); setLoading(false) }
    else { setEditing(false); setEditReceiptFiles([]); router.refresh(); setLoading(false) }
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditTitle(claim.title)
    setEditDescription(claim.description || '')
    setEditCategory(claim.category)
    setEditUnitPrice(String(claim.unit_price || claim.amount || 0))
    setEditUnit(claim.unit || 'บาท')
    setEditQuantity(String(claim.quantity))
    setEditDate(claim.expense_date)
    setEditVatMode(claim.vat_mode || 'none')
    setEditWhtRate(String(claim.withholding_tax_rate || 0))
    setEditNotes(claim.notes || '')
    setEditBankName(claim.bank_name || '')
    setEditBankAccount(claim.bank_account_number || '')
    setEditAccountHolder(claim.account_holder_name || '')
    setEditReceiptFiles([])
    setEditClaimType(claim.claim_type as 'event' | 'other' || 'other')
    setEditEventId(claim.job_event_id || '')
  }


  const inputCls = "w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => router.push('/finance')} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
          <ArrowLeft className="h-4 w-4" />
          {isEn ? 'Back' : 'กลับ'}
        </button>
        <div className="flex items-center gap-2">
          {canEdit && !editing && (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-lg transition-colors">
              <Edit3 className="h-4 w-4" />
              {isEn ? 'Edit' : 'แก้ไข'}
            </button>
          )}
          <button
            onClick={() => window.open(`/api/pdf/payment-voucher?id=${claim.id}`, '_blank')}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/20 rounded-lg transition-colors"
          >
            <FileDown className="h-4 w-4" />
            {isEn ? 'Export PDF' : 'ส่งออก PDF'}
          </button>
          {isAdmin && (
            <button onClick={handleDelete} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors">
              <Trash2 className="h-4 w-4" />
              {isEn ? 'Delete' : 'ลบ'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/20 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {/* Main Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden print:border-none print:shadow-none">
        {/* Status Banner */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: `${statusColor}10` }}>
          <div className="flex items-center gap-3">
            {claim.status === 'draft' && <FileText className="h-5 w-5" style={{ color: statusColor }} />}
            {(claim.status === 'pending' || claim.status === 'awaiting_payment' || claim.status === 'pending_month_end') && <Clock className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'waiting_tax_invoice' && <Receipt className="h-5 w-5" style={{ color: statusColor }} />}
            {(claim.status === 'approved' || claim.status === 'paid') && <CheckCircle2 className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'rejected' && <XCircle className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'cancelled' && <Ban className="h-5 w-5" style={{ color: statusColor }} />}
            <div>
              <span className="text-sm font-semibold" style={{ color: statusColor }}>
                {getClaimStatusLabel(claim.status, locale)}
              </span>
              {claim.approver && (
                <span className="text-xs text-zinc-500 ml-2">
                  {isEn ? 'by' : 'โดย'} {claim.approver.full_name}
                  {claim.approved_at && ` • ${new Date(claim.approved_at).toLocaleDateString('th-TH')}`}
                </span>
              )}
            </div>
          </div>
          <span className="text-sm font-mono text-zinc-500">{claim.claim_number}</span>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {editing ? (
            /* ==================== EDIT MODE ==================== */
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Title' : 'หัวข้อ'} *</label>
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Description' : 'รายละเอียด'}</label>
                <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
              </div>

              {/* Claim Type + Event Selector */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
                  <Banknote className="h-3.5 w-3.5" />
                  {isEn ? 'Claim Type & Event' : 'ประเภทเบิก & อีเวนต์'}
                </p>
                <div className="flex items-center gap-3">
                  {([{ value: 'event', label: isEn ? 'Event Expense' : 'เบิกงานอีเวนต์' }, { value: 'other', label: isEn ? 'Other Expense' : 'ค่าอื่นๆ' }] as const).map(t => (
                    <label key={t.value} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={editClaimType === t.value} onChange={() => { setEditClaimType(t.value); if (t.value === 'other') setEditEventId('') }} className="accent-emerald-600" />
                      <span className="text-sm">{t.label}</span>
                    </label>
                  ))}
                </div>
                {editClaimType === 'event' && jobEvents.length > 0 && (
                  <div>
                    <label className="text-[10px] text-zinc-400 mb-0.5 block">{isEn ? 'Select Event' : 'เลือกอีเวนต์'}</label>
                    <EventSelectCombobox
                      events={jobEvents}
                      value={editEventId}
                      onChange={setEditEventId}
                      locale={locale}
                    />
                  </div>
                )}
                {/* Staff Roles (read-only from check-in) */}
                {editClaimType === 'event' && claim.staff_roles && claim.staff_roles.length > 0 && (
                  <div className="flex items-center gap-3 p-2.5 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-100 dark:border-amber-900/30">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <User className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">{isEn ? 'Roles:' : 'ทีมงาน & หน้าที่:'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {claim.staff_roles.map((r, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                          {r.label}
                        </span>
                      ))}
                    </div>
                    <span className="text-[9px] text-amber-400 ml-auto shrink-0">{isEn ? 'from check-in' : 'จากระบบเช็คอิน'}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Category' : 'หมวด'}</label>
                <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className={inputCls}>
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{isEn ? cat.label : cat.label_th}</option>
                  ))}
                </select>
              </div>

              {/* Unit Price + Unit + Quantity */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Unit Price (฿)' : 'ราคาต่อหน่วย'} *</label>
                  <input type="number" value={editUnitPrice} onChange={e => setEditUnitPrice(e.target.value)} min="0" step="0.01" className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Unit' : 'หน่วย'}</label>
                  <input value={editUnit} onChange={e => setEditUnit(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Quantity' : 'จำนวน'}</label>
                  <input type="number" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} min="1" className={`${inputCls} font-mono`} />
                </div>
              </div>

              {/* Computed Amount + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Total (฿)' : 'ยอดรวม (฿)'}</label>
                  <div className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 text-sm font-mono font-bold">
                    ฿{fmtDec(editComputedAmount)}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Expense Date' : 'วันที่'}</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={inputCls} />
                </div>
              </div>

              {/* VAT + WHT */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5" />
                  {isEn ? 'Tax Calculation' : 'คำนวณภาษี'}
                </p>
                <div className="flex items-center gap-3">
                  {(['none', 'included', 'excluded'] as const).map(v => (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={editVatMode === v} onChange={() => setEditVatMode(v)} className={`accent-${v === 'included' ? 'orange' : v === 'excluded' ? 'blue' : 'zinc'}-600`} />
                      <span className="text-sm">{v === 'none' ? (isEn ? 'No VAT' : 'ไม่มี VAT') : v === 'included' ? (isEn ? 'VAT Included' : 'รวม VAT 7%') : (isEn ? 'VAT Excluded' : 'ไม่รวม VAT 7%')}</span>
                    </label>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">{isEn ? 'Withholding Tax' : 'ภาษีหัก ณ ที่จ่าย'}</span>
                  </div>
                  <select value={editWhtRate} onChange={e => setEditWhtRate(e.target.value)} className="w-28 h-8 px-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-800 outline-none">
                    <option value="0">{isEn ? 'None' : 'ไม่หัก'}</option>
                    <option value="1">1%</option>
                    <option value="2">2%</option>
                    <option value="3">3%</option>
                    <option value="5">5%</option>
                  </select>
                </div>
                {(editVatMode !== 'none' || editWhtRateNum > 0) && editComputedAmount > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">{isEn ? 'Base' : 'ยอดฐาน'}</span>
                      <span className="font-mono">฿{fmtDec(editTax.baseAmount)}</span>
                    </div>
                    {editVatMode !== 'none' && (
                      <div className="flex justify-between text-xs">
                        <span className="text-blue-600">VAT 7%</span>
                        <span className="font-mono text-blue-600">฿{fmtDec(editTax.vatAmount)}</span>
                      </div>
                    )}
                    {editWhtRateNum > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-purple-600">−WHT {editWhtRate}%</span>
                        <span className="font-mono text-purple-600">−฿{fmtDec(editTax.whtAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-semibold border-t pt-1.5">
                      <span>{isEn ? 'Net Payable' : 'ยอดจ่ายจริง'}</span>
                      <span className="font-mono">฿{fmtDec(editTax.netPayable)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">{isEn ? 'Notes' : 'หมายเหตุ'}</label>
                <input value={editNotes} onChange={e => setEditNotes(e.target.value)} className={inputCls} />
              </div>

              {/* Payment Details Edit */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5">
                  💳 {isEn ? 'Payment Details (Claimant)' : 'รายละเอียดการชำระเงิน (ผู้เบิก)'}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-400 mb-0.5 block">{isEn ? 'Bank Name' : 'ชื่อธนาคาร'}</label>
                    <BankSelect value={editBankName} onChange={setEditBankName} placeholder={isEn ? 'Select bank' : 'เลือกธนาคาร'} />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 mb-0.5 block">{isEn ? 'Account No.' : 'เลขบัญชี'}</label>
                    <input value={editBankAccount} onChange={e => setEditBankAccount(e.target.value)} placeholder="123-4-56789-0" className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 mb-0.5 block">{isEn ? 'Account Holder' : 'ชื่อเจ้าของบัญชี'}</label>
                    <input value={editAccountHolder} onChange={e => setEditAccountHolder(e.target.value)} placeholder={isEn ? 'Name' : 'ชื่อ-นามสกุล'} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Receipt Upload in Edit Mode */}
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5 block">
                  <Upload className="h-3.5 w-3.5" />
                  {isEn ? 'Upload Receipts' : 'อัพโหลดเอกสารเพิ่มเติม'}
                </label>
                {claim.receipt_urls && claim.receipt_urls.length > 0 && (
                  <p className="text-xs text-zinc-400 mb-2">
                    {isEn ? `${claim.receipt_urls.length} existing file(s)` : `มีเอกสารเดิม ${claim.receipt_urls.length} ไฟล์`}
                  </p>
                )}
                <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-center hover:border-emerald-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={(e) => { if (e.target.files) setEditReceiptFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
                    className="hidden"
                    id="edit-receipt-upload"
                  />
                  <label htmlFor="edit-receipt-upload" className="cursor-pointer">
                    <Upload className="h-6 w-6 mx-auto text-zinc-400 mb-1" />
                    <p className="text-xs text-zinc-500">
                      {isEn ? 'Click to upload' : 'คลิกเพื่ออัพโหลด'}
                    </p>
                  </label>
                </div>
                {editReceiptFiles.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {editReceiptFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 rounded text-xs">
                        <span className="truncate text-zinc-600 dark:text-zinc-400">{file.name}</span>
                        <button type="button" onClick={() => setEditReceiptFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-500 ml-2">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button onClick={handleSaveEdit} disabled={loading || !editTitle} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  <Save className="h-4 w-4" />
                  {loading ? '...' : (isEn ? 'Save' : 'บันทึก')}
                </button>
                <button onClick={handleCancelEdit} className="flex items-center gap-1.5 px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-sm transition-colors">
                  <X className="h-4 w-4" />
                  {isEn ? 'Cancel' : 'ยกเลิก'}
                </button>
              </div>
            </div>
          ) : (
            /* ==================== VIEW MODE ==================== */
            <>
              {/* Title & Amount */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{claim.title}</h2>
                </div>
                <div className="text-right shrink-0 ml-4">
                  {(viewVatMode !== 'none' || viewWhtRate > 0) && viewAmount > 0 ? (
                    <>
                      <p className="text-base text-zinc-400 line-through">
                        ฿{(claim.amount || 0).toLocaleString()}
                      </p>
                      <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        ฿{fmtDec(viewTax.netPayable)}
                      </p>
                      <p className="text-[10px] text-emerald-500 font-medium">
                        {isEn ? 'Net Payable' : 'ยอดจ่ายจริง'}
                      </p>
                    </>
                  ) : (
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                      ฿{(claim.amount || 0).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Info Grid — ข้อมูลทั่วไป */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span className="text-zinc-500">{isEn ? 'Type:' : 'ประเภท:'}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {claim.claim_type === 'event' ? (isEn ? 'Event' : 'เบิกงานอีเวนต์') : (isEn ? 'Other' : 'ค่าอื่นๆ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span className="text-zinc-500">{isEn ? 'Category:' : 'หมวด:'}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {getCategoryLabel(claim.category, locale, categories)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span className="text-zinc-500">{isEn ? 'Submitted by:' : 'ผู้เบิก:'}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {claim.submitter?.full_name || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span className="text-zinc-500">{isEn ? 'Date:' : 'วันที่:'}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(claim.expense_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Event Link */}
              {claim.job_event && (
                <div className={`flex items-center gap-2 text-sm p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 ${claim.staff_roles && claim.staff_roles.length > 0 ? 'rounded-t-lg' : 'rounded-lg'}`}>
                  <Banknote className="h-4 w-4 text-blue-500" />
                  <span className="text-blue-600 dark:text-blue-400">
                    {isEn ? 'Event:' : 'อีเวนต์:'} <strong>{(claim.job_event as any)?.name || (claim.job_event as any)?.event_name}</strong>
                  </span>
                </div>
              )}

              {/* Staff Roles (ทีมงาน & หน้าที่) */}
              {claim.staff_roles && claim.staff_roles.length > 0 && (
                <div className={`flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 ${claim.job_event ? 'rounded-b-lg -mt-[5px] border-t-0' : 'rounded-lg'}`}>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <User className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{isEn ? 'Roles:' : 'ทีมงาน & หน้าที่:'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {claim.staff_roles.map((r, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 text-xs font-bold text-amber-700 dark:text-amber-300 tracking-wide">
                        {r.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description — รายละเอียด */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {isEn ? 'Description' : 'รายละเอียด'}
                </p>
                <p className="text-sm text-zinc-800 dark:text-zinc-200">{claim.description || '—'}</p>
              </div>

              {/* Price Breakdown — รายละเอียดราคา */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-1.5">
                  <Banknote className="h-3.5 w-3.5" />
                  {isEn ? 'Price Breakdown' : 'รายละเอียดราคา'}
                </p>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Unit Price' : 'ราคาต่อหน่วย'}</p>
                    <p className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">฿{(claim.unit_price || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Unit' : 'หน่วย'}</p>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{claim.unit || 'บาท'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Quantity' : 'จำนวน'}</p>
                    <p className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">{claim.quantity || 1}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Total' : 'ยอดรวม'}</p>
                    <p className="text-sm font-mono font-bold text-zinc-800 dark:text-zinc-200">฿{(claim.amount || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Tax Info — ภาษี */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-1.5 bg-zinc-50/50 dark:bg-zinc-800/30">
                <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-2">
                  <Receipt className="h-3.5 w-3.5" />
                  {isEn ? 'Tax Details' : 'รายละเอียดภาษี'}
                </p>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">VAT</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {viewVatMode === 'none'
                      ? (isEn ? 'None' : 'ไม่มี VAT')
                      : viewVatMode === 'included'
                        ? (isEn ? 'Included 7%' : 'รวม VAT 7%')
                        : (isEn ? 'Excluded 7%' : 'ไม่รวม VAT 7%')
                    }
                  </span>
                </div>
                {viewVatMode !== 'none' && viewAmount > 0 && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">{isEn ? 'Base Amount' : 'ยอดฐาน'}</span>
                      <span className="font-mono">฿{fmtDec(viewTax.baseAmount)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-blue-600">VAT 7%</span>
                      <span className="font-mono text-blue-600">฿{fmtDec(viewTax.vatAmount)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">
                    <Percent className="inline h-3 w-3 mr-0.5 text-purple-500" />
                    {isEn ? 'Withholding Tax' : 'หัก ณ ที่จ่าย'}
                  </span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {viewWhtRate > 0 ? `${viewWhtRate}%` : (isEn ? 'None' : 'ไม่หัก')}
                  </span>
                </div>
                {viewWhtRate > 0 && viewAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-purple-600">{isEn ? 'WHT Amount' : 'จำนวนที่หัก'}</span>
                    <span className="font-mono text-purple-600">−฿{fmtDec(viewTax.whtAmount)}</span>
                  </div>
                )}
                {(viewVatMode !== 'none' || viewWhtRate > 0) && viewAmount > 0 && (
                  <div className="flex justify-between text-sm font-semibold border-t pt-1.5 mt-1">
                    <span>{isEn ? 'Net Payable' : 'ยอดจ่ายจริง'}</span>
                    <span className="font-mono">฿{fmtDec(viewTax.netPayable)}</span>
                  </div>
                )}
              </div>

              {/* Payment Details — รายละเอียดการชำระเงิน */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-2">
                  💳 {isEn ? 'Payment Details (Claimant)' : 'รายละเอียดการชำระเงิน (ผู้เบิก)'}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Bank' : 'ธนาคาร'}</p>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{claim.bank_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Account No.' : 'เลขบัญชี'}</p>
                    <p className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">{claim.bank_account_number || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Account Holder' : 'ชื่อเจ้าของบัญชี'}</p>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{claim.account_holder_name || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Reject Reason */}
              {claim.status === 'rejected' && claim.reject_reason && (
                <div className="flex items-start gap-2 text-sm p-3 bg-red-50 dark:bg-red-950/20 rounded-lg">
                  <MessageSquare className="h-4 w-4 text-red-500 mt-0.5" />
                  <div>
                    <p className="text-red-600 font-medium">{isEn ? 'Rejection reason:' : 'เหตุผลที่ปฏิเสธ:'}</p>
                    <p className="text-red-500">{claim.reject_reason}</p>
                  </div>
                </div>
              )}

              {/* Notes — หมายเหตุ */}
              <div className="text-sm">
                <span className="font-medium text-zinc-500">{isEn ? 'Notes:' : 'หมายเหตุ:'}</span>{' '}
                <span className="text-zinc-700 dark:text-zinc-300">{claim.notes || '—'}</span>
              </div>

              {/* Receipt Documents */}
              {claim.receipt_urls && claim.receipt_urls.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-3">
                    <FileText className="h-3.5 w-3.5" />
                    {isEn ? 'Attached Receipts' : 'เอกสารแนบ'} ({claim.receipt_urls.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {claim.receipt_urls.map((url, i) => {
                      const isPdf = url.toLowerCase().endsWith('.pdf')
                      return (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden hover:border-emerald-400 hover:shadow-md transition-all aspect-[4/3] bg-zinc-50 dark:bg-zinc-800"
                        >
                          {isPdf ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400">
                              <FileText className="h-10 w-10" />
                              <span className="text-xs">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={url}
                              alt={`${isEn ? 'Receipt' : 'ใบเสร็จ'} ${i + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tax Invoice Documents */}
              {claim.tax_invoice_urls && claim.tax_invoice_urls.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 mb-3">
                    <Receipt className="h-3.5 w-3.5" />
                    {isEn ? 'Tax Invoice Documents' : 'ใบกำกับภาษี'} ({claim.tax_invoice_urls.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {claim.tax_invoice_urls.map((url, i) => {
                      const isPdf = url.toLowerCase().endsWith('.pdf')
                      return (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block rounded-lg border border-sky-200 dark:border-sky-800 overflow-hidden hover:border-sky-400 hover:shadow-md transition-all aspect-[4/3] bg-sky-50 dark:bg-sky-950/20"
                        >
                          {isPdf ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-sky-400">
                              <FileText className="h-10 w-10" />
                              <span className="text-xs">PDF</span>
                            </div>
                          ) : (
                            <img
                              src={url}
                              alt={`${isEn ? 'Tax Invoice' : 'ใบกำกับภาษี'} ${i + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        </a>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ===== Workflow Action Bar ===== */}
        {!editing && (!isTerminal || isAdmin) && (
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 print:hidden space-y-3">

            {/* ── Owner: Submit draft ── */}
            {canSubmit && (
              <div className="flex items-center gap-3">
                <div className="flex-1 text-xs text-zinc-500">
                  {isEn
                    ? 'Attach at least one receipt, then submit for approval.'
                    : 'แนบเอกสารอย่างน้อย 1 ไฟล์ก่อนยื่นขออนุมัติ'}
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={loading || (claim.receipt_urls || []).length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <Send className="h-4 w-4" />
                  {loading ? '...' : (isEn ? 'Submit Claim' : 'ยื่นใบเบิก')}
                </button>
              </div>
            )}

            {/* ── Owner: Cancel (draft or pending) ── */}
            {canCancel && (
              <div className="flex justify-end">
                <button
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                >
                  <Ban className="h-4 w-4" />
                  {isEn ? 'Cancel Claim' : 'ยกเลิกใบเบิก'}
                </button>
              </div>
            )}

            {/* ── Admin: Approve / Reject ── */}
            {isAdmin && isPending && (
              !rejectOpen ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleApprove}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {loading ? '...' : (isEn ? 'Approve' : 'อนุมัติ')}
                  </button>
                  <button
                    onClick={handleApproveAsMonthEnd}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Clock className="h-4 w-4" />
                    {loading ? '...' : (isEn ? 'Approve — Month End' : 'รอจ่ายสิ้นเดือน')}
                  </button>
                  <button
                    onClick={() => setRejectOpen(true)}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <XCircle className="h-4 w-4" />
                    {isEn ? 'Reject' : 'ปฏิเสธ'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder={isEn ? 'Enter rejection reason...' : 'กรอกเหตุผลที่ปฏิเสธ...'}
                    rows={2}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleReject}
                      disabled={loading}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {loading ? '...' : (isEn ? 'Confirm Reject' : 'ยืนยันปฏิเสธ')}
                    </button>
                    <button
                      onClick={() => { setRejectOpen(false); setRejectReason('') }}
                      className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-sm"
                    >
                      {isEn ? 'Back' : 'ยกเลิก'}
                    </button>
                  </div>
                </div>
              )
            )}

            {/* ── Admin: Mark as Paid / Defer to Month End / Request Tax Invoice ── */}
            {isAdmin && (isApproved || isPendingMonthEnd || isWaitingTaxInvoice) && (
              <div className="flex items-center gap-3 flex-wrap">
                {(isApproved || isWaitingTaxInvoice) && (
                  <button
                    onClick={handleDeferMonthEnd}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Clock className="h-4 w-4" />
                    {loading ? '...' : (isEn ? 'Defer to Month End' : 'เลื่อนสิ้นเดือน')}
                  </button>
                )}
                {isApproved && (
                  <button
                    onClick={handleMarkWaitingTaxInvoice}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Receipt className="h-4 w-4" />
                    {loading ? '...' : (isEn ? 'Request Tax Invoice' : 'ขอใบกำกับภาษี')}
                  </button>
                )}
                <button
                  onClick={handleMarkPaid}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {loading ? '...' : (isEn ? 'Mark as Paid' : 'ชำระเงินแล้ว')}
                </button>
              </div>
            )}

            {/* ── Owner/Admin: Upload Tax Invoice ── */}
            {isWaitingTaxInvoice && (isOwner || isAdmin) && (
              <div className="space-y-2.5 p-3.5 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 rounded-xl">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-sky-500" />
                  <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">
                    {isEn ? 'Upload Tax Invoice Documents' : 'อัพโหลดใบกำกับภาษี'}
                  </p>
                  {claim.tax_invoice_urls && claim.tax_invoice_urls.length > 0 && (
                    <span className="ml-auto text-xs text-sky-500 font-medium">
                      {isEn ? `${claim.tax_invoice_urls.length} uploaded` : `อัพโหลดแล้ว ${claim.tax_invoice_urls.length} ไฟล์`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-sky-600 dark:text-sky-500">
                  {isEn
                    ? 'Please upload the tax invoice document(s) to proceed with payment.'
                    : 'กรุณาอัพโหลดใบกำกับภาษีเพื่อให้ Admin ดำเนินการชำระเงินต่อได้'}
                </p>
                <div className="border-2 border-dashed border-sky-300 dark:border-sky-700 rounded-lg p-3 text-center hover:border-sky-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={(e) => { if (e.target.files) setTaxInvoiceFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
                    className="hidden"
                    id="tax-invoice-upload"
                  />
                  <label htmlFor="tax-invoice-upload" className="cursor-pointer">
                    <Upload className="h-6 w-6 mx-auto text-sky-400 mb-1" />
                    <p className="text-xs text-sky-500">
                      {isEn ? 'Click to select tax invoice files' : 'คลิกเพื่อเลือกไฟล์ใบกำกับภาษี'}
                    </p>
                  </label>
                </div>
                {taxInvoiceFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {taxInvoiceFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-white dark:bg-zinc-800 rounded text-xs border border-sky-100 dark:border-sky-900/30">
                        <span className="truncate text-zinc-600 dark:text-zinc-400">{file.name}</span>
                        <button type="button" onClick={() => setTaxInvoiceFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-500 ml-2 shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={handleUploadTaxInvoice}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      {loading ? '...' : (isEn ? 'Upload Tax Invoice' : 'อัพโหลดใบกำกับภาษี')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Admin Override ── */}
            {isAdmin && (
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3">
                {!overrideOpen ? (
                  <button
                    onClick={() => setOverrideOpen(true)}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-orange-500 transition-colors"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {isEn ? 'Admin: Override Status' : 'Admin: บังคับเปลี่ยนสถานะ'}
                  </button>
                ) : (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {isEn ? 'Admin Status Override' : 'บังคับเปลี่ยนสถานะ (Admin)'}
                    </div>

                    {/* Sensitive transition warning */}
                    {overrideStatus && isAdminSensitiveTransition(claim.status, overrideStatus) && (
                      <div className="flex items-start gap-2 px-3 py-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-lg">
                        <ShieldAlert className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-orange-700 dark:text-orange-400">
                          {isEn
                            ? 'Sensitive change — this reverses a finalised state. Ensure you have a valid reason.'
                            : 'การเปลี่ยนสถานะที่มีความเสี่ยงสูง — กรุณาตรวจสอบก่อนดำเนินการ'}
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-start gap-2">
                      {/* Status dropdown */}
                      <select
                        value={overrideStatus}
                        onChange={e => setOverrideStatus(e.target.value)}
                        className="px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                      >
                        <option value="">{isEn ? '— Select status —' : '— เลือกสถานะ —'}</option>
                        {getAdminOverrideStatuses(claim.status).map(s => {
                          const info = CLAIM_STATUSES.find(c => c.value === s)
                          return (
                            <option key={s} value={s}>
                              {isEn ? info?.label : info?.labelTh} ({s})
                            </option>
                          )
                        })}
                      </select>

                      {/* Reason input */}
                      <input
                        type="text"
                        value={overrideReason}
                        onChange={e => setOverrideReason(e.target.value)}
                        placeholder={isEn ? 'Reason (required)' : 'เหตุผล (จำเป็น)'}
                        className="flex-1 min-w-40 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                      />

                      {/* Confirm */}
                      <button
                        onClick={handleAdminOverride}
                        disabled={loading || !overrideStatus || !overrideReason.trim()}
                        className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        {loading ? '...' : (isEn ? 'Confirm' : 'ยืนยัน')}
                      </button>

                      {/* Cancel */}
                      <button
                        onClick={() => { setOverrideOpen(false); setOverrideStatus(''); setOverrideReason('') }}
                        className="px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      >
                        {isEn ? 'Cancel' : 'ยกเลิก'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Edit History Log */}
      {logs.length > 0 && (
        <div className="mt-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden print:hidden">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <History className="h-4 w-4" />
              {isEn ? 'Edit History' : 'ประวัติการแก้ไข'}
            </h3>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {logs.map((log) => (
              <div key={log.id} className="px-6 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      log.action === 'update'          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                      : log.action === 'upload_receipt'  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : log.action === 'submit'          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                      : log.action === 'approve'         ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : log.action === 'approve_month_end' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400'
                      : log.action === 'reject'          ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                      : log.action === 'cancel'          ? 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                      : log.action === 'defer_month_end' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400'
                      : log.action === 'mark_paid'       ? 'bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400'
                      : log.action === 'admin_override'  ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400'
                      : log.action === 'waiting_tax_invoice' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400'
                      : log.action === 'upload_tax_invoice'  ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400'
                      :                                    'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {log.action === 'update'          ? (isEn ? 'Edit' : 'แก้ไข')
                      : log.action === 'upload_receipt'  ? (isEn ? 'Upload' : 'อัพโหลด')
                      : log.action === 'submit'          ? (isEn ? 'Submitted' : 'ยื่นแล้ว')
                      : log.action === 'approve'         ? (isEn ? 'Approved' : 'อนุมัติ')
                      : log.action === 'approve_month_end' ? (isEn ? 'Approved (Month End)' : 'อนุมัติ-สิ้นเดือน')
                      : log.action === 'reject'          ? (isEn ? 'Rejected' : 'ปฏิเสธ')
                      : log.action === 'cancel'          ? (isEn ? 'Cancelled' : 'ยกเลิก')
                      : log.action === 'defer_month_end' ? (isEn ? 'Deferred' : 'เลื่อนสิ้นเดือน')
                      : log.action === 'mark_paid'       ? (isEn ? 'Paid' : 'ชำระแล้ว')
                      : log.action === 'admin_override'  ? (isEn ? 'Admin Override' : 'Admin Override')
                      : log.action === 'waiting_tax_invoice' ? (isEn ? 'Tax Invoice Req.' : 'ขอใบกำกับภาษี')
                      : log.action === 'upload_tax_invoice'  ? (isEn ? 'Tax Invoice Upload' : 'อัพโหลดใบกำกับภาษี')
                      : log.action}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {log.editor?.full_name || (isEn ? 'Unknown' : 'ไม่ทราบ')}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {new Date(log.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                {log.note && <p className="text-xs text-zinc-500 mb-1">{log.note}</p>}
                {log.changes && Object.keys(log.changes).length > 0 && (
                  <div className="space-y-0.5">
                    {Object.entries(log.changes).map(([field, change]) => (
                      <div key={field} className="text-[11px] text-zinc-400">
                        <span className="font-medium text-zinc-500">{field}:</span>{' '}
                        <span className="line-through text-red-400/70">{String(change.from ?? '—')}</span>
                        {' → '}
                        <span className="text-emerald-600">{String(change.to ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
