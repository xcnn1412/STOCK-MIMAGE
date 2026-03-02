'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Trash2, FileText,
  Banknote, User, Calendar, Tag, MessageSquare, Printer, Edit3, Save, X,
  Receipt, Percent, Upload, History
} from 'lucide-react'
import { approveClaim, rejectClaim, deleteClaim, updateClaim } from '../actions'
import { getClaimStatusLabel, getClaimStatusColor, getCategoryLabel } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { useLocale } from '@/lib/i18n/context'
import type { ExpenseClaim } from '../../costs/types'

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

export default function ClaimDetailView({ claim, role, categories = [], logs = [], userId = '' }: { claim: ExpenseClaim; role: string; categories?: FinanceCategory[]; logs?: ClaimLog[]; userId?: string }) {
  const router = useRouter()
  const { locale } = useLocale()
  const [loading, setLoading] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editReceiptFiles, setEditReceiptFiles] = useState<File[]>([])

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

  const isAdmin = role === 'admin'
  const isOwner = claim.submitted_by === userId
  const isPending = claim.status === 'pending'
  const canEdit = isPending && (isAdmin || isOwner)
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

  const handleSaveEdit = async () => {
    setLoading(true)
    setError(null)
    let receiptFormData: FormData | undefined
    if (editReceiptFiles.length > 0) {
      receiptFormData = new FormData()
      for (const f of editReceiptFiles) {
        receiptFormData.append('receipt_files', f)
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
    setEditReceiptFiles([])
  }

  const handlePrint = () => window.print()

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
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 rounded-lg transition-colors">
            <Printer className="h-4 w-4" />
            {isEn ? 'Print' : 'พิมพ์'}
          </button>
          {(isAdmin || isPending) && (
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
            {claim.status === 'pending' && <Clock className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'approved' && <CheckCircle2 className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'rejected' && <XCircle className="h-5 w-5" style={{ color: statusColor }} />}
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
                  {claim.description && <p className="text-sm text-zinc-500 mt-1">{claim.description}</p>}
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    ฿{(claim.total_amount || claim.amount || 0).toLocaleString()}
                  </p>
                  {(claim.unit_price > 0 && claim.quantity > 1) && (
                    <p className="text-xs text-zinc-400">
                      ฿{claim.unit_price?.toLocaleString()} × {claim.quantity} {claim.unit || ''}
                    </p>
                  )}
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="h-4 w-4 text-zinc-400" />
                  <span className="text-zinc-500">{isEn ? 'Category:' : 'หมวด:'}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {getCategoryLabel(claim.category, locale, categories)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-zinc-400" />
                  <span className="text-zinc-500">{isEn ? 'Type:' : 'ประเภท:'}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {claim.claim_type === 'event' ? (isEn ? 'Event' : 'เบิกงานอีเวนต์') : (isEn ? 'Other' : 'ค่าอื่นๆ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-zinc-400" />
                  <span className="text-zinc-500">{isEn ? 'Submitted by:' : 'ผู้เบิก:'}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {claim.submitter?.full_name || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span className="text-zinc-500">{isEn ? 'Date:' : 'วันที่:'}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {new Date(claim.expense_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Tax Info */}
              {(viewVatMode !== 'none' || viewWhtRate > 0) && viewAmount > 0 && (
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-1.5 bg-zinc-50/50 dark:bg-zinc-800/30">
                  <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-2">
                    <Receipt className="h-3.5 w-3.5" />
                    {isEn ? 'Tax Details' : 'รายละเอียดภาษี'}
                  </p>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">{isEn ? 'Base Amount' : 'ยอดฐาน'}</span>
                    <span className="font-mono">฿{fmtDec(viewTax.baseAmount)}</span>
                  </div>
                  {viewVatMode !== 'none' && (
                    <div className="flex justify-between text-xs">
                      <span className="text-blue-600">
                        VAT 7% ({viewVatMode === 'included' ? (isEn ? 'included' : 'รวมแล้ว') : (isEn ? 'added' : 'เพิ่ม')})
                      </span>
                      <span className="font-mono text-blue-600">฿{fmtDec(viewTax.vatAmount)}</span>
                    </div>
                  )}
                  {viewWhtRate > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-purple-600">{isEn ? 'Withholding Tax' : 'หัก ณ ที่จ่าย'} {viewWhtRate}%</span>
                      <span className="font-mono text-purple-600">−฿{fmtDec(viewTax.whtAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-semibold border-t pt-1.5 mt-1">
                    <span>{isEn ? 'Net Payable' : 'ยอดจ่ายจริง'}</span>
                    <span className="font-mono">฿{fmtDec(viewTax.netPayable)}</span>
                  </div>
                </div>
              )}

              {/* Event Link */}
              {claim.job_event && (
                <div className="flex items-center gap-2 text-sm p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <Banknote className="h-4 w-4 text-blue-500" />
                  <span className="text-blue-600 dark:text-blue-400">
                    {isEn ? 'Event:' : 'อีเวนต์:'} <strong>{(claim.job_event as any)?.name || (claim.job_event as any)?.event_name}</strong>
                  </span>
                </div>
              )}

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

              {/* Notes */}
              {claim.notes && (
                <div className="text-sm text-zinc-500">
                  <span className="font-medium">{isEn ? 'Notes:' : 'หมายเหตุ:'}</span> {claim.notes}
                </div>
              )}

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
            </>
          )}
        </div>

        {/* Admin Action Bar */}
        {isAdmin && isPending && !editing && (
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 print:hidden">
            {!rejectOpen ? (
              <div className="flex items-center gap-3">
                <button onClick={handleApprove} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  <CheckCircle2 className="h-4 w-4" />
                  {loading ? '...' : (isEn ? 'Approve' : 'อนุมัติ')}
                </button>
                <button onClick={() => setRejectOpen(true)} disabled={loading} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  <XCircle className="h-4 w-4" />
                  {isEn ? 'Reject' : 'ปฏิเสธ'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder={isEn ? 'Enter rejection reason...' : 'กรอกเหตุผลที่ปฏิเสธ...'} rows={2} className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none resize-none" />
                <div className="flex gap-2">
                  <button onClick={handleReject} disabled={loading} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                    {loading ? '...' : (isEn ? 'Confirm Reject' : 'ยืนยันปฏิเสธ')}
                  </button>
                  <button onClick={() => { setRejectOpen(false); setRejectReason('') }} className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg text-sm">
                    {isEn ? 'Cancel' : 'ยกเลิก'}
                  </button>
                </div>
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
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${log.action === 'update' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'
                      : log.action === 'upload_receipt' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                      {log.action === 'update' ? (isEn ? 'Edit' : 'แก้ไข')
                        : log.action === 'upload_receipt' ? (isEn ? 'Upload' : 'อัพโหลด')
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
