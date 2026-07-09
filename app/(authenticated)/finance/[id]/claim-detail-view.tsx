'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useConfirm } from '../use-confirm'
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Trash2, FileText,
  Banknote, User, Calendar, Tag, MessageSquare, Edit3, Save, X,
  Receipt, Percent, Upload, History, FileDown, Send, Ban, ShieldAlert,
  Wallet, RefreshCw, Plus, Building2, ListChecks, Hash, AlertCircle,
  ChevronDown, ChevronRight, Coins, Lock,
} from 'lucide-react'
import { approveClaim, rejectClaim, deleteClaim, updateClaim, submitClaim, cancelClaim, markAsPaid, markAsPendingMonthEnd, approveAsPendingMonthEnd, adminOverrideStatus, markAsWaitingTaxInvoice, uploadTaxInvoice, settleAdvanceClaim, confirmRefundReceived, setTaxInvoiceEntries, addPettyCashExpense, createPettyCashTopup, closePettyCashMonth, reopenPettyCashMonth } from '../actions'
import { getClaimStatusLabel, getClaimStatusColor, getCategoryLabel, getAdminOverrideStatuses, isAdminSensitiveTransition, CLAIM_STATUSES, getClaimChecklist, getFundingSourceLabel, getFundingSourceColor, FUNDING_SOURCES, type FundingSource } from '../../costs/types'
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

// ── Collapsible section (inline component) ───────────────────────────
function CollapsibleSection({
  title,
  count,
  accentColor = 'zinc',
  Icon,
  defaultOpen = false,
  children,
}: {
  title: string
  count?: number
  accentColor?: 'zinc' | 'sky' | 'emerald' | 'amber'
  Icon?: typeof Clock
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const accentMap = {
    zinc: 'text-zinc-500',
    sky: 'text-sky-600 dark:text-sky-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
  } as const

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-left"
      >
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${accentMap[accentColor]}`}>
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {title}
          {typeof count === 'number' && count > 0 && (
            <span className="text-zinc-400 font-normal">({count})</span>
          )}
        </span>
        {open
          ? <ChevronDown className="h-4 w-4 text-zinc-400" />
          : <ChevronRight className="h-4 w-4 text-zinc-400" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </div>
  )
}

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

/** Light row shape for a fund's children (expenses / top-ups) */
type PettyChildLite = {
  id: string
  claim_number: string
  claim_type: string
  title: string
  category: string
  amount: number
  expense_date: string
  status: string
  receipt_urls: string[] | null
  created_at: string
  paid_at: string | null
  submitter?: { id: string; full_name: string } | null
}
type PettyChildren = {
  topups: PettyChildLite[]
  expenses: PettyChildLite[]
  topupPaid: number
  topupPending: number
  spent: number
}

export default function ClaimDetailView({ claim, role, categories = [], logs = [], userId = '', jobEvents = [], pettyChildren = null }: { claim: ExpenseClaim; role: string; categories?: FinanceCategory[]; logs?: ClaimLog[]; userId?: string; jobEvents?: JobEventOption[]; pettyChildren?: PettyChildren | null }) {
  const router = useRouter()
  const { locale } = useLocale()
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm()
  const [loading, setLoading] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [overrideStatus, setOverrideStatus] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [editReceiptFiles, setEditReceiptFiles] = useState<File[]>([])

  /**
   * Tax invoice upload — each entry is one tax invoice document with its own
   * file (optional) + number (optional). At least one of the two must be set.
   * Submitted as parallel arrays in FormData to keep alignment server-side.
   */
  type TaxInvoiceUploadRow = { id: number; file: File | null; number: string }
  const [taxInvoiceRows, setTaxInvoiceRows] = useState<TaxInvoiceUploadRow[]>([
    { id: 0, file: null, number: '' },
  ])
  const taxInvoiceRowIdRef = useRef(1)
  const nextTaxInvoiceRowId = () => taxInvoiceRowIdRef.current++

  /**
   * Existing tax invoice entries (paired by index between tax_invoice_urls and
   * tax_invoice_numbers). Used by the inline edit panel.
   */
  type ExistingTaxEntry = { url: string; number: string }
  const buildExistingEntries = (): ExistingTaxEntry[] => {
    const urls = claim.tax_invoice_urls || []
    const numbers = claim.tax_invoice_numbers || []
    const len = Math.max(urls.length, numbers.length)
    const out: ExistingTaxEntry[] = []
    for (let i = 0; i < len; i++) {
      out.push({ url: urls[i] || '', number: numbers[i] || '' })
    }
    return out
  }
  const [editTaxEntries, setEditTaxEntries] = useState<ExistingTaxEntry[]>(buildExistingEntries())
  const [editingTaxEntries, setEditingTaxEntries] = useState(false)

  // Advance settlement / petty-cash expense state. Both reuse actual_spent_items;
  // petty cash additionally carries a per-row date.
  type SpentItem = { date?: string; description: string; amount: string }
  const seededItems: SpentItem[] = Array.isArray(claim.actual_spent_items) && claim.actual_spent_items.length > 0
    ? claim.actual_spent_items.map(i => ({ date: i.date || '', description: i.description || '', amount: String(i.amount ?? '') }))
    : [{ description: '', amount: '' }]
  const [spentItems, setSpentItems] = useState<SpentItem[]>(seededItems)
  const hasSavedSpentItems = Array.isArray(claim.actual_spent_items) && claim.actual_spent_items.length > 0
  const [itemsEditMode, setItemsEditMode] = useState<boolean>(!hasSavedSpentItems)
  const [actualReceiptFiles, setActualReceiptFiles] = useState<File[]>([])
  const [refundSlipFiles, setRefundSlipFiles] = useState<File[]>([])

  const addSpentItem = () => setSpentItems(prev => [...prev, { description: '', amount: '' }])

  // Petty-cash fund: quick-add expense + top-up request form state
  const [qaTitle, setQaTitle] = useState('')
  const [qaCategory, setQaCategory] = useState(categories[0]?.value || 'other')
  const [qaAmount, setQaAmount] = useState('')
  const [qaDate, setQaDate] = useState(() => new Date().toISOString().split('T')[0])
  const [qaFiles, setQaFiles] = useState<File[]>([])
  const [tuAmount, setTuAmount] = useState('')
  const [tuNote, setTuNote] = useState('')
  const [showTopupForm, setShowTopupForm] = useState(false)
  const removeSpentItem = (idx: number) => setSpentItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  const updateSpentItem = (idx: number, patch: Partial<SpentItem>) =>
    setSpentItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  const spentItemsTotal = spentItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)

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
  const [editFundingSource, setEditFundingSource] = useState<FundingSource>((claim.funding_source as FundingSource) || 'company')

  const isAdmin = role === 'admin'
  const isOwner = claim.submitted_by === userId
  const isDraft = claim.status === 'draft'
  const isPending = claim.status === 'pending'
  const isApproved = claim.status === 'approved' || claim.status === 'awaiting_payment'
  const isPendingMonthEnd = claim.status === 'pending_month_end'
  const isWaitingTaxInvoice = claim.status === 'waiting_tax_invoice'
  const isCancelled = claim.status === 'cancelled'
  const isRefundConfirmed = claim.status === 'refund_confirmed'
  const isTerminal = ['paid', 'rejected', 'cancelled', 'refund_confirmed'].includes(claim.status)
  const isAdvance = claim.claim_type === 'advance'

  // Petty cash (เงินสดย่อย) — monthly fund model.
  // Fund = claim_type petty_cash + no fund_id; top-up = petty_cash + fund_id;
  // expense = other type + fund_id (paid from the box).
  const isPettyCash = claim.claim_type === 'petty_cash'
  const isPettyFund = isPettyCash && !claim.pettycash_fund_id
  const isPettyTopup = isPettyCash && !!claim.pettycash_fund_id
  const isPettyExpense = !isPettyCash && !!claim.pettycash_fund_id
  const isPettyClosed = !!claim.pettycash_closed_at
  // Box only holds the initial amount once the fund claim was actually paid out.
  const pettyFunded = isPettyFund && (claim.status === 'paid' || claim.status === 'refund_confirmed')
  const pettyInitial = pettyFunded ? (Number(claim.amount) || 0) : 0
  const pettyTopupPaid = pettyChildren?.topupPaid ?? 0
  const pettyTopupPending = pettyChildren?.topupPending ?? 0
  const pettySpent = pettyChildren?.spent ?? 0
  const pettyBalance = Math.round((pettyInitial + pettyTopupPaid - pettySpent) * 100) / 100
  const pettyReturned = isPettyFund && (Number(claim.refund_amount) || 0) > 0
  const pettyFundOpen = isPettyFund && claim.status === 'paid' && !isPettyClosed
  const canManagePettyFund = isPettyFund && (isOwner || isAdmin) && pettyFundOpen

  // Settlement allowed after the claim has been approved (user has or will have the money)
  const canSettleAdvance = isAdvance && (isOwner || isAdmin) && !isRefundConfirmed && ['approved', 'paid', 'pending_month_end', 'waiting_tax_invoice'].includes(claim.status)
  // Admin may confirm the returned cash once a transfer slip exists — used by
  // both advance refunds and petty-cash month-close returns.
  const canConfirmRefund = isAdmin && (isAdvance || isPettyFund) && !isRefundConfirmed
    && (Number(claim.refund_amount) || 0) > 0
    && (claim.refund_slip_urls?.length ?? 0) > 0
    && ['approved', 'paid', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment'].includes(claim.status)
  const advanceAmount = claim.amount || 0
  const actualSpentNum = spentItemsTotal
  const computedRefund = Math.max(0, advanceAmount - actualSpentNum)
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

  // Common detail panel shown in confirm dialogs so admins see context before clicking
  const claimContextDetails = [
    { label: isEn ? 'Claim no.' : 'เลขที่', value: claim.claim_number },
    { label: isEn ? 'Title' : 'หัวข้อ', value: claim.title },
    { label: isEn ? 'Net payable' : 'ยอดจ่ายจริง', value: `฿${fmtDec(viewTax.netPayable)}` },
    { label: isEn ? 'Submitter' : 'ผู้เบิก', value: claim.submitter?.full_name || '—' },
  ]

  const handleApprove = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Approve this claim?' : 'ยืนยันอนุมัติใบเบิกนี้?',
      description: isEn ? 'The submitter will be notified.' : 'ระบบจะแจ้งเตือนผู้ยื่น',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Approve' : 'อนุมัติ',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
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
    const ok = await askConfirm({
      title: isEn ? 'Delete this claim?' : 'ลบใบเบิกนี้?',
      description: isEn
        ? 'This permanently deletes the claim. If approved, its linked cost item will also be removed.'
        : 'ลบถาวร — ถ้าอนุมัติแล้ว ระบบจะลบ cost item ที่ผูกอยู่ด้วย',
      details: claimContextDetails,
      variant: 'destructive',
      confirmLabel: isEn ? 'Delete permanently' : 'ลบถาวร',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    setLoading(true)
    const result = await deleteClaim(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.push('/finance') }
  }

  const handleSubmit = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Submit this claim for approval?' : 'ยื่นใบเบิกเพื่อขออนุมัติ?',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Submit' : 'ยืนยันยื่น',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    setLoading(true)
    setError(null)
    const result = await submitClaim(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleCancel = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Cancel this claim?' : 'ยกเลิกใบเบิกนี้?',
      description: isEn
        ? 'This cannot be undone. The claim will be marked as cancelled.'
        : 'ไม่สามารถย้อนกลับได้ ใบเบิกจะถูกทำเครื่องหมายว่ายกเลิกแล้ว',
      details: claimContextDetails,
      variant: 'destructive',
      confirmLabel: isEn ? 'Cancel claim' : 'ยืนยันยกเลิก',
      cancelLabel: isEn ? 'Keep' : 'ไม่ยกเลิก',
    })
    if (!ok) return
    setLoading(true)
    setError(null)
    const result = await cancelClaim(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleMarkPaid = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Mark this claim as paid?' : 'ยืนยันชำระเงินใบเบิกนี้?',
      description: isEn
        ? 'Confirm the transfer has been made. This is logged with your name.'
        : 'ยืนยันว่าโอนเงินเรียบร้อย — ระบบจะบันทึกการกระทำนี้ในชื่อของคุณ',
      details: claimContextDetails,
      variant: 'warning',
      confirmLabel: isEn ? 'Mark paid' : 'ยืนยันชำระเงิน',
      cancelLabel: isEn ? 'Not yet' : 'ยังไม่จ่าย',
    })
    if (!ok) return
    setLoading(true)
    setError(null)
    const result = await markAsPaid(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleDeferMonthEnd = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Defer payment to month end?' : 'เลื่อนชำระเงินไปสิ้นเดือน?',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Defer' : 'เลื่อน',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    setLoading(true)
    setError(null)
    const result = await markAsPendingMonthEnd(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleApproveAsMonthEnd = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Approve and defer to month end?' : 'อนุมัติและเลื่อนจ่ายสิ้นเดือน?',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Approve & defer' : 'อนุมัติ + เลื่อน',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
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
    const validRows = taxInvoiceRows.filter(r => r.file || r.number.trim())
    if (validRows.length === 0) {
      setError(isEn
        ? 'Please add at least one tax invoice (file or number).'
        : 'กรุณาเพิ่มใบกำกับภาษีอย่างน้อย 1 รายการ (แนบไฟล์หรือกรอกเลขที่)')
      return
    }
    setLoading(true)
    setError(null)
    const formData = new FormData()
    // Append files and numbers in matching order — server pairs them by index.
    for (const row of validRows) {
      if (row.file) {
        const compressed = row.file.type.startsWith('image/')
          ? await compressImage(row.file)
          : row.file
        formData.append('tax_invoice_files', compressed)
      } else {
        // Empty Blob preserves index alignment when there's only a number.
        formData.append('tax_invoice_files', new Blob([]), '')
      }
      formData.append('tax_invoice_numbers', row.number.trim())
    }
    const result = await uploadTaxInvoice(claim.id, formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else {
      setTaxInvoiceRows([{ id: nextTaxInvoiceRowId(), file: null, number: '' }])
      router.refresh()
      setLoading(false)
    }
  }

  const handleSaveTaxEntries = async () => {
    setLoading(true)
    setError(null)
    const result = await setTaxInvoiceEntries(
      claim.id,
      editTaxEntries.map(e => ({ url: e.url, number: e.number })),
    )
    if (result.error) { setError(result.error); setLoading(false) }
    else { setEditingTaxEntries(false); router.refresh(); setLoading(false) }
  }

  const handleSettleAdvance = async () => {
    const cleanItems = spentItems
      .map(it => ({ description: it.description.trim(), amount: Number(it.amount) || 0 }))
      .filter(it => it.amount > 0)
    if (cleanItems.length === 0) {
      setError(isEn ? 'Please add at least one expense item.' : 'กรุณาเพิ่มรายการค่าใช้จ่ายอย่างน้อย 1 รายการ')
      return
    }
    setLoading(true)
    setError(null)
    const formData = new FormData()
    formData.append('actual_spent_items', JSON.stringify(cleanItems))
    for (const f of actualReceiptFiles) {
      const compressed = f.type.startsWith('image/') ? await compressImage(f) : f
      formData.append('actual_receipt_files', compressed)
    }
    for (const f of refundSlipFiles) {
      const compressed = f.type.startsWith('image/') ? await compressImage(f) : f
      formData.append('refund_slip_files', compressed)
    }
    const result = await settleAdvanceClaim(claim.id, formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else {
      setActualReceiptFiles([])
      setRefundSlipFiles([])
      setItemsEditMode(false)
      router.refresh()
      setLoading(false)
    }
  }

  // Group fund expenses into calendar weeks of the month (1–7, 8–14, …) for
  // the "สรุปยอดแต่ละสัปดาห์" summary.
  const pettyWeekGroups = (() => {
    if (!pettyChildren || pettyChildren.expenses.length === 0) return []
    const groups = new Map<number, { from: number; to: number; items: PettyChildLite[]; total: number }>()
    for (const e of pettyChildren.expenses) {
      const day = Number((e.expense_date || '').slice(8, 10)) || 1
      const w = Math.min(5, Math.floor((day - 1) / 7) + 1)
      if (!groups.has(w)) groups.set(w, { from: (w - 1) * 7 + 1, to: w === 5 ? 31 : w * 7, items: [], total: 0 })
      const g = groups.get(w)!
      g.items.push(e)
      g.total = Math.round((g.total + (Number(e.amount) || 0)) * 100) / 100
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]).map(([week, g]) => ({ week, ...g }))
  })()

  // Log an expense paid from the box (any staff member, while the fund is open)
  const handleAddPettyExpense = async () => {
    if (!qaTitle.trim()) { setError(isEn ? 'Enter the expense description.' : 'กรุณากรอกรายการค่าใช้จ่าย'); return }
    if (!(Number(qaAmount) > 0)) { setError(isEn ? 'Enter a valid amount.' : 'กรุณากรอกจำนวนเงินให้ถูกต้อง'); return }
    setLoading(true)
    setError(null)
    const fd = new FormData()
    fd.append('title', qaTitle.trim())
    fd.append('category', qaCategory)
    fd.append('amount', qaAmount)
    fd.append('expense_date', qaDate)
    for (const f of qaFiles) {
      const compressed = f.type.startsWith('image/') ? await compressImage(f) : f
      fd.append('receipt_files', compressed)
    }
    const res = await addPettyCashExpense(claim.id, fd)
    if (res.error) { setError(res.error); setLoading(false); return }
    setQaTitle('')
    setQaAmount('')
    setQaFiles([])
    if ((res.balance ?? 0) < 0) {
      setError(isEn
        ? `Saved — but the box balance is now negative (฿${fmtDec(res.balance ?? 0)}). Request a top-up.`
        : `บันทึกแล้ว — แต่เงินในกล่องติดลบ (฿${fmtDec(res.balance ?? 0)}) กรุณาเบิกเพิ่ม`)
    }
    router.refresh()
    setLoading(false)
  }

  // Request a mid-month top-up (fund owner or admin) → normal approve→pay flow
  const handleCreateTopup = async () => {
    if (!(Number(tuAmount) > 0)) { setError(isEn ? 'Enter a valid top-up amount.' : 'กรุณากรอกจำนวนเงินให้ถูกต้อง'); return }
    setLoading(true)
    setError(null)
    const fd = new FormData()
    fd.append('amount', tuAmount)
    fd.append('note', tuNote.trim())
    const res = await createPettyCashTopup(claim.id, fd)
    if (res.error) { setError(res.error); setLoading(false); return }
    setTuAmount('')
    setTuNote('')
    setShowTopupForm(false)
    router.refresh()
    setLoading(false)
  }

  // Close the month: leftover returned to the company (slip required when > 0)
  const handleCloseMonth = async () => {
    if (pettyTopupPending > 0) {
      setError(isEn
        ? 'There are unresolved top-up requests — pay or cancel them before closing.'
        : 'มีรายการเติมเงินค้างดำเนินการ — อนุมัติ/จ่าย หรือยกเลิกให้เรียบร้อยก่อนปิดเดือน')
      return
    }
    if (pettyBalance > 0 && refundSlipFiles.length === 0 && (claim.refund_slip_urls?.length ?? 0) === 0) {
      setError(isEn
        ? `Attach the return transfer slip (฿${fmtDec(pettyBalance)}) before closing.`
        : `กรุณาแนบสลิปโอนเงินคืนบริษัท ฿${fmtDec(pettyBalance)} ก่อนปิดเดือน`)
      return
    }
    const ok = await askConfirm({
      title: isEn ? 'Close this month?' : 'ปิดกองทุนเดือนนี้?',
      description: isEn
        ? 'Locks the fund — no more expenses or top-ups. The leftover is recorded as returned to the company and awaits admin confirmation.'
        : 'จะล็อกกองทุน (เพิ่มรายจ่าย/เติมเงินไม่ได้อีก) และบันทึกยอดคงเหลือเป็นเงินคืนบริษัท รอ admin ยืนยันรับเงิน',
      details: [
        ...claimContextDetails,
        { label: isEn ? 'Return to company' : 'คืนบริษัท', value: `฿${fmtDec(pettyBalance)}` },
      ],
      variant: 'warning',
      confirmLabel: isEn ? 'Close month' : 'ปิดเดือน',
      cancelLabel: isEn ? 'Not yet' : 'ยังไม่ปิด',
    })
    if (!ok) return
    setLoading(true)
    setError(null)
    const fd = new FormData()
    for (const f of refundSlipFiles) {
      const compressed = f.type.startsWith('image/') ? await compressImage(f) : f
      fd.append('refund_slip_files', compressed)
    }
    const res = await closePettyCashMonth(claim.id, fd)
    if (res.error) { setError(res.error); setLoading(false) }
    else { setRefundSlipFiles([]); router.refresh(); setLoading(false) }
  }

  // Admin escape hatch: reopen a closed (not yet confirmed) month for corrections
  const handleReopenMonth = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Reopen this month?' : 'เปิดรอบเดือนนี้อีกครั้ง?',
      description: isEn
        ? 'Clears the recorded return amount. Make corrections, then close the month again.'
        : 'จะล้างยอดเงินคืนที่บันทึกไว้ — แก้ไขรายการเสร็จแล้วต้องกดปิดเดือนใหม่',
      details: claimContextDetails,
      variant: 'warning',
      confirmLabel: isEn ? 'Reopen' : 'เปิดรอบ',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    setLoading(true)
    setError(null)
    const res = await reopenPettyCashMonth(claim.id)
    if (res.error) { setError(res.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleConfirmRefund = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Confirm refund received?' : 'ยืนยันรับเงินคืนแล้ว?',
      description: isEn
        ? 'Verify the refund has hit the company account. This finalises the claim — no further edits will be allowed.'
        : 'ตรวจให้แน่ใจว่าเงินคืนเข้าบัญชีบริษัทแล้ว หลังยืนยันจะไม่สามารถแก้ไขใบเบิกนี้ได้อีก',
      details: [
        ...claimContextDetails,
        { label: isEn ? 'Refund amount' : 'ยอดคืน', value: `฿${fmtDec(Number(claim.refund_amount) || 0)}` },
      ],
      variant: 'warning',
      confirmLabel: isEn ? 'Confirm received' : 'ยืนยันรับแล้ว',
      cancelLabel: isEn ? 'Not yet' : 'ยังไม่ได้รับ',
    })
    if (!ok) return
    setLoading(true)
    setError(null)
    const result = await confirmRefundReceived(claim.id)
    if (result.error) { setError(result.error); setLoading(false) }
    else { router.refresh(); setLoading(false) }
  }

  const handleAdminOverride = async () => {
    if (!overrideStatus) return
    if (!overrideReason.trim()) { setError(isEn ? 'Please enter a reason for the override.' : 'กรุณาระบุเหตุผลในการเปลี่ยนสถานะ'); return }
    setLoading(true)
    setError(null)
    const result = await adminOverrideStatus(claim.id, overrideStatus, overrideReason)
    if (result.error) { setError(result.error); setLoading(false) }
    else { setOverrideStatus(''); setOverrideReason(''); router.refresh(); setLoading(false) }
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
      funding_source: editFundingSource,
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
    setEditFundingSource((claim.funding_source as FundingSource) || 'company')
  }


  const inputCls = "w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"

  return (
    <div className="max-w-3xl mx-auto">
      {confirmDialog}
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

      {/* Document Checklist Panel — pre-accounting handover */}
      {(() => {
        const ck = getClaimChecklist(claim)
        const items: { key: string; labelTh: string; labelEn: string; done: boolean; required: boolean; note?: string }[] = [
          {
            key: 'receipt',
            labelTh: 'แนบใบเสร็จ/เอกสาร',
            labelEn: 'Receipt attached',
            done: ck.hasReceipt,
            required: true,
            note: claim.claim_type === 'advance'
              ? (isEn ? 'Receipt OR settlement receipts' : 'ใบเสร็จเดิม หรือใบเสร็จตอน settle')
              : undefined,
          },
          {
            key: 'tax_invoice',
            labelTh: 'ใบกำกับภาษี (ไฟล์/เลขที่)',
            labelEn: 'Tax invoice (file/number)',
            done: ck.hasTaxInvoice,
            required: ck.taxInvoiceRequired,
            // Surface the actual invoice numbers so the checklist row doubles
            // as a quick reference — admins don't have to scroll to the Tax
            // Invoices section just to read off a number.
            chips: (claim.tax_invoice_numbers || [])
              .map(n => (n || '').trim())
              .filter(Boolean),
          },
        ]
        if (ck.refundRequired) {
          items.push({
            key: 'refund_slip',
            labelTh: 'สลิปโอนเงินคืนบริษัท',
            labelEn: 'Refund slip uploaded',
            done: ck.hasRefundSlip,
            required: true,
          })
          items.push({
            key: 'refund_confirmed',
            labelTh: 'ยืนยันรับเงินคืนแล้ว',
            labelEn: 'Refund confirmed by admin',
            done: ck.refundConfirmed,
            required: true,
          })
        }

        return (
          <div className={`mb-4 rounded-xl border overflow-hidden ${
            ck.isComplete
              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20'
          }`}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-current/10">
              <div className="flex items-center gap-2">
                <ListChecks className={`h-4 w-4 ${ck.isComplete ? 'text-emerald-600' : 'text-amber-600'}`} />
                <p className={`text-xs font-bold ${
                  ck.isComplete
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-amber-700 dark:text-amber-300'
                }`}>
                  {isEn ? 'Document Checklist' : 'รายการเอกสารต้องตรวจ'}
                </p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                ck.isComplete
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}>
                {ck.isComplete
                  ? (isEn ? 'READY' : 'พร้อมส่งบัญชี')
                  : (isEn ? 'INCOMPLETE' : 'ยังไม่ครบ')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
              {items.map(it => (
                <div
                  key={it.key}
                  className={`flex items-start gap-2 p-2 rounded-lg ${
                    it.done
                      ? 'bg-emerald-100/50 dark:bg-emerald-900/20'
                      : it.required
                        ? 'bg-red-50 dark:bg-red-950/20'
                        : 'bg-zinc-50 dark:bg-zinc-800/40'
                  }`}
                >
                  {it.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : it.required ? (
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <Clock className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <p className={`text-xs font-medium ${
                      it.done
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : it.required
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-zinc-500'
                    }`}>
                      {isEn ? it.labelEn : it.labelTh}
                    </p>
                    {it.note && (
                      <p className="text-[10px] text-zinc-400 mt-0.5">{it.note}</p>
                    )}
                    {/* Inline chips — currently used by tax_invoice to show
                        the actual invoice numbers right in the checklist. */}
                    {('chips' in it) && it.chips && it.chips.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {it.chips.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-mono text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
                          >
                            <Hash className="h-2.5 w-2.5 opacity-70" />
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Main Card */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden print:border-none print:shadow-none">
        {/* Status Banner */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: `${statusColor}10` }}>
          <div className="flex items-center gap-3">
            {claim.status === 'draft' && <FileText className="h-5 w-5" style={{ color: statusColor }} />}
            {(claim.status === 'pending' || claim.status === 'awaiting_payment' || claim.status === 'pending_month_end') && <Clock className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'waiting_tax_invoice' && <Receipt className="h-5 w-5" style={{ color: statusColor }} />}
            {(claim.status === 'approved' || claim.status === 'paid') && <CheckCircle2 className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'refund_confirmed' && <RefreshCw className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'rejected' && <XCircle className="h-5 w-5" style={{ color: statusColor }} />}
            {claim.status === 'cancelled' && <Ban className="h-5 w-5" style={{ color: statusColor }} />}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: statusColor }}>
                  {getClaimStatusLabel(claim.status, locale)}
                </span>
                {/* Funding source badge */}
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{
                    backgroundColor: `${getFundingSourceColor(claim.funding_source)}20`,
                    color: getFundingSourceColor(claim.funding_source),
                  }}
                  title={isEn ? 'Funding source' : 'แหล่งเงินที่ใช้เบิก'}
                >
                  {claim.funding_source === 'personal' ? (
                    <User className="h-2.5 w-2.5" />
                  ) : (
                    <Building2 className="h-2.5 w-2.5" />
                  )}
                  {getFundingSourceLabel(claim.funding_source, locale)}
                </span>
              </div>
              {claim.approver && (
                <span className="text-xs text-zinc-500 mt-0.5 block">
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

              {/* Funding Source — เงินบริษัท / เงินส่วนตัว */}
              {!isAdvance && !isPettyCash && (
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
                    {isEn ? 'Funding Source' : 'แหล่งเงินที่ใช้เบิก'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {FUNDING_SOURCES.map(s => {
                      const isActive = editFundingSource === s.value
                      const Icon = s.value === 'personal' ? User : Building2
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setEditFundingSource(s.value as FundingSource)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm transition-all ${
                            isActive
                              ? s.value === 'personal'
                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300'
                                : 'border-sky-500 bg-sky-50 dark:bg-sky-950/20 text-sky-700 dark:text-sky-300'
                              : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="font-medium">{isEn ? s.label : s.labelTh}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

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

              {/* Additional Documents (NOT tax invoice) Upload in Edit Mode */}
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-500" />
                    {isEn ? 'Receipts / Additional Documents' : 'ใบเสร็จ / เอกสารเพิ่มเติม'}
                  </label>
                  {claim.receipt_urls && claim.receipt_urls.length > 0 && (
                    <span className="text-[10px] text-zinc-400">
                      {isEn ? `${claim.receipt_urls.length} existing` : `มีอยู่ ${claim.receipt_urls.length} ไฟล์`}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mb-2 italic">
                  {isEn
                    ? 'For tax invoices, use the dedicated tax invoice section (only available when status is "Waiting Tax Invoice").'
                    : 'สำหรับใบกำกับภาษี ใช้ส่วน "แนบใบกำกับภาษี" โดยเฉพาะ (เปิดเมื่อสถานะ "รอใบกำกับภาษี")'}
                </p>
                <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-center hover:border-emerald-400 transition-colors bg-white dark:bg-zinc-900">
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
                      {isEn ? 'Click to add receipts or other documents' : 'คลิกเพื่อแนบใบเสร็จหรือเอกสารอื่น ๆ'}
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
                  {isAdvance ? <Wallet className="h-4 w-4 text-amber-500 shrink-0" /> : isPettyCash ? <Coins className="h-4 w-4 text-orange-500 shrink-0" /> : <FileText className="h-4 w-4 text-zinc-400 shrink-0" />}
                  <span className="text-zinc-500">{isEn ? 'Type:' : 'ประเภท:'}</span>
                  <span className={`font-medium ${isAdvance ? 'text-amber-700 dark:text-amber-300' : isPettyCash ? 'text-orange-700 dark:text-orange-300' : 'text-zinc-900 dark:text-zinc-100'}`}>
                    {claim.claim_type === 'event'
                      ? (isEn ? 'Event' : 'เบิกงานอีเวนต์')
                      : claim.claim_type === 'advance'
                        ? (isEn ? 'Advance Payment' : 'เบิกทดลองจ่าย')
                        : claim.claim_type === 'petty_cash'
                          ? (isEn ? 'Petty Cash' : 'เบิกเงินสดย่อย')
                          : (isEn ? 'Other' : 'ค่าอื่นๆ')}
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

              {/* Advance Settlement Summary (ทดลองจ่าย) */}
              {isAdvance && (
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-800/30">
                  <p className="text-xs font-semibold text-zinc-500 flex items-center gap-1.5 mb-2">
                    <Wallet className="h-3.5 w-3.5 text-emerald-500" />
                    {isEn ? 'Advance Settlement' : 'การเบิกทดลองจ่าย'}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] text-zinc-400">{isEn ? 'Advance Amount' : 'เบิกล่วงหน้า'}</p>
                      <p className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">฿{fmtDec(claim.amount || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400">{isEn ? 'Actual Spent' : 'ใช้จ่ายจริง'}</p>
                      <p className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {claim.actual_spent_amount != null ? `฿${fmtDec(Number(claim.actual_spent_amount))}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400">{isEn ? 'Refund to Company' : 'เงินคืนบริษัท'}</p>
                      <p className={`text-sm font-mono font-semibold ${(claim.refund_amount || 0) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`}>
                        {claim.refund_amount != null ? `฿${fmtDec(Number(claim.refund_amount))}` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Itemized breakdown */}
                  {Array.isArray(claim.actual_spent_items) && claim.actual_spent_items.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                      <p className="text-[10px] font-medium text-zinc-400 mb-1.5">
                        {isEn ? 'Itemized Breakdown' : 'รายการค่าใช้จ่าย'}
                      </p>
                      <div className="space-y-0.5">
                        {claim.actual_spent_items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1 px-2 odd:bg-white/60 dark:odd:bg-zinc-900/40 rounded">
                            <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                              <span className="text-zinc-400 font-mono">{i + 1}.</span>
                              {item.description || <span className="italic text-zinc-400">{isEn ? '(no description)' : '(ไม่ระบุ)'}</span>}
                            </span>
                            <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                              ฿{fmtDec(Number(item.amount) || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {claim.advance_settled_at && (
                    <p className="text-[10px] text-zinc-400 mt-2">
                      {isEn ? 'Last settled at' : 'อัพเดทล่าสุด'}: {new Date(claim.advance_settled_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  )}

                  {/* Refund confirmation — confirmed state */}
                  {isRefundConfirmed && (
                    <div className="mt-3 flex items-start gap-2 p-3 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-semibold text-cyan-700 dark:text-cyan-300">
                          {isEn ? 'Refund received and confirmed' : 'คืนเงินบริษัทเรียบร้อยแล้ว'}
                        </p>
                        {claim.refund_confirmed_at && (
                          <p className="text-[10px] text-cyan-600/80 dark:text-cyan-400/80 mt-0.5">
                            {isEn ? 'Confirmed at' : 'ยืนยันเมื่อ'}: {new Date(claim.refund_confirmed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Admin action — confirm receipt of refund */}
                  {canConfirmRefund && (
                    <div className="mt-3 flex items-center justify-between gap-2 p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-dashed border-emerald-300 dark:border-emerald-800 rounded-lg">
                      <div className="text-xs">
                        <p className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5" />
                          {isEn
                            ? `Awaiting your confirmation — refund ฿${fmtDec(Number(claim.refund_amount) || 0)}`
                            : `รอ admin ยืนยัน — เงินคืน ฿${fmtDec(Number(claim.refund_amount) || 0)}`}
                        </p>
                        <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                          {isEn ? 'Check the refund slip, then mark as received.' : 'ตรวจสลิปการโอน แล้วกดยืนยันได้รับเงิน'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleConfirmRefund}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {loading ? '...' : (isEn ? 'Confirm Received' : 'ยืนยันรับเงิน')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Actual Receipts (from advance settlement) — collapsible */}
              {isAdvance && claim.actual_receipt_urls && claim.actual_receipt_urls.length > 0 && (
                <CollapsibleSection
                  title={isEn ? 'Actual Spending Receipts' : 'หลักฐานการใช้จ่ายจริง'}
                  count={claim.actual_receipt_urls.length}
                  accentColor="amber"
                  Icon={Receipt}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {claim.actual_receipt_urls.map((url, i) => {
                      const isPdf = url.toLowerCase().endsWith('.pdf')
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group relative block rounded-lg border border-amber-200 dark:border-amber-800 overflow-hidden hover:border-amber-400 hover:shadow-md transition-all aspect-[4/3] bg-amber-50 dark:bg-amber-950/20">
                          {isPdf ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-amber-400">
                              <FileText className="h-10 w-10" />
                              <span className="text-xs">PDF</span>
                            </div>
                          ) : (
                            <img src={url} alt={`${isEn ? 'Actual receipt' : 'หลักฐานการจ่ายจริง'} ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        </a>
                      )
                    })}
                  </div>
                </CollapsibleSection>
              )}

              {/* Refund Slips (advance settlement) — collapsible, opens by default
                  if a refund is required but not yet confirmed. */}
              {isAdvance && claim.refund_slip_urls && claim.refund_slip_urls.length > 0 && (
                <CollapsibleSection
                  title={isEn ? 'Refund Transfer Slips' : 'สลิปการโอนเงินคืนบริษัท'}
                  count={claim.refund_slip_urls.length}
                  accentColor="emerald"
                  Icon={RefreshCw}
                  defaultOpen={!isRefundConfirmed}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {claim.refund_slip_urls.map((url, i) => {
                      const isPdf = url.toLowerCase().endsWith('.pdf')
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group relative block rounded-lg border border-emerald-200 dark:border-emerald-800 overflow-hidden hover:border-emerald-400 hover:shadow-md transition-all aspect-[4/3] bg-emerald-50 dark:bg-emerald-950/20">
                          {isPdf ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-emerald-400">
                              <FileText className="h-10 w-10" />
                              <span className="text-xs">PDF</span>
                            </div>
                          ) : (
                            <img src={url} alt={`${isEn ? 'Refund slip' : 'สลิปเงินคืน'} ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        </a>
                      )
                    })}
                  </div>
                </CollapsibleSection>
              )}

              {/* Tax Invoice Entries — file + number paired by index. Always shown
                  so non-owner/non-admin viewers can see the audit state instead
                  of having the section silently disappear. */}
              {(() => {
                const urls = claim.tax_invoice_urls || []
                const numbers = claim.tax_invoice_numbers || []
                const total = Math.max(urls.length, numbers.length)

                return (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                        <Receipt className="h-3.5 w-3.5" />
                        {isEn ? 'Tax Invoices' : 'ใบกำกับภาษี'}
                        {total > 0 && (
                          <span className="text-zinc-400 font-normal">({total})</span>
                        )}
                      </p>
                      {total > 0 && (isOwner || isAdmin) && !editingTaxEntries && (
                        <button
                          onClick={() => { setEditTaxEntries(buildExistingEntries()); setEditingTaxEntries(true) }}
                          className="text-[11px] text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1"
                        >
                          <Edit3 className="h-3 w-3" />
                          {isEn ? 'Edit' : 'แก้ไข'}
                        </button>
                      )}
                    </div>

                    {total === 0 && !editingTaxEntries ? (
                      <p className="text-xs text-zinc-400 italic">
                        {isEn ? 'No tax invoices yet' : 'ยังไม่มีใบกำกับภาษี'}
                      </p>
                    ) : !editingTaxEntries ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {Array.from({ length: total }).map((_, i) => {
                          const url = urls[i] || ''
                          const number = numbers[i] || ''
                          const isPdf = url.toLowerCase().endsWith('.pdf')
                          return (
                            <div
                              key={i}
                              className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-2.5"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400">
                                  #{i + 1}
                                </span>
                                {number ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/30 text-[11px] font-mono text-sky-700 dark:text-sky-300">
                                    <Hash className="h-2.5 w-2.5" />
                                    {number}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-zinc-400 italic">
                                    {isEn ? 'no number' : 'ไม่มีเลขที่'}
                                  </span>
                                )}
                              </div>
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group block rounded-md border border-sky-200 dark:border-sky-800 overflow-hidden bg-white dark:bg-zinc-900 hover:border-sky-400 hover:shadow-md transition-all aspect-[4/3]"
                                >
                                  {isPdf ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-1 text-sky-400">
                                      <FileText className="h-8 w-8" />
                                      <span className="text-[10px]">PDF</span>
                                    </div>
                                  ) : (
                                    <img
                                      src={url}
                                      alt={`${isEn ? 'Tax Invoice' : 'ใบกำกับภาษี'} ${i + 1}`}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                    />
                                  )}
                                </a>
                              ) : (
                                <div className="flex items-center justify-center aspect-[4/3] rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-[11px] text-zinc-400">
                                  {isEn ? 'No file attached' : 'ไม่ได้แนบไฟล์'}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      /* Edit mode — paired rows */
                      <div className="space-y-2 p-3 border border-sky-200 dark:border-sky-800 rounded-lg bg-sky-50/50 dark:bg-sky-950/20">
                        {editTaxEntries.length > 0 ? (
                          <div className="space-y-2">
                            {editTaxEntries.map((entry, i) => {
                              const isPdf = entry.url.toLowerCase().endsWith('.pdf')
                              return (
                                <div key={i} className="flex items-center gap-2 p-2 bg-white dark:bg-zinc-900 rounded-md border border-sky-200 dark:border-sky-800">
                                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 w-6 shrink-0">
                                    #{i + 1}
                                  </span>
                                  {entry.url ? (
                                    <a
                                      href={entry.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 px-2 py-1 text-[11px] text-sky-600 hover:text-sky-700 hover:underline shrink-0"
                                    >
                                      {isPdf ? <FileText className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                      {isEn ? 'View' : 'ดูไฟล์'}
                                    </a>
                                  ) : (
                                    <span className="text-[11px] text-zinc-400 italic px-2 shrink-0">
                                      {isEn ? 'no file' : 'ไม่มีไฟล์'}
                                    </span>
                                  )}
                                  <input
                                    type="text"
                                    value={entry.number}
                                    onChange={e => {
                                      const v = e.target.value
                                      setEditTaxEntries(prev => prev.map((x, idx) => idx === i ? { ...x, number: v } : x))
                                    }}
                                    placeholder={isEn ? 'tax invoice number' : 'เลขที่ใบกำกับภาษี'}
                                    className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono border border-sky-200 dark:border-sky-800 rounded-md bg-white dark:bg-zinc-900 outline-none focus:border-sky-500"
                                  />
                                  <button
                                    onClick={() => setEditTaxEntries(prev => prev.filter((_, idx) => idx !== i))}
                                    className="text-zinc-400 hover:text-red-500 p-1 shrink-0"
                                    title={isEn ? 'Remove this invoice' : 'ลบรายการนี้'}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 italic">
                            {isEn ? 'No invoices to edit. Use the upload section above to add new ones.' : 'ไม่มีใบกำกับภาษี ใช้ส่วนอัพโหลดด้านบนเพื่อเพิ่มใหม่'}
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            onClick={handleSaveTaxEntries}
                            disabled={loading}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-md font-semibold"
                          >
                            <Save className="h-3 w-3" />
                            {loading ? '...' : (isEn ? 'Save' : 'บันทึก')}
                          </button>
                          <button
                            onClick={() => { setEditingTaxEntries(false); setEditTaxEntries(buildExistingEntries()) }}
                            className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"
                          >
                            {isEn ? 'Cancel' : 'ยกเลิก'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </div>

        {/* ===== Workflow Action Bar ===== */}
        {/* Owners of advance claims can still settle after the advance is paid out */}
        {!editing && (!isTerminal || isAdmin || canSettleAdvance) && (
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

            {/* ── Admin: Approve / Reject ──
                 Primary: Approve (filled green). Secondary: Approve - Month End (outline).
                 Destructive: Reject pushed right with extra spacing. */}
            {isAdmin && isPending && (
              !rejectOpen ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    {isEn ? 'Next step' : 'ขั้นตอนถัดไป'}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleApprove}
                      disabled={loading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {loading ? '...' : (isEn ? 'Approve' : 'อนุมัติ')}
                    </button>
                    <button
                      onClick={handleApproveAsMonthEnd}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2.5 border-2 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Clock className="h-4 w-4" />
                      {loading ? '...' : (isEn ? 'Approve — Month End' : 'อนุมัติ — สิ้นเดือน')}
                    </button>
                    <button
                      onClick={() => setRejectOpen(true)}
                      disabled={loading}
                      className="ml-auto flex items-center gap-2 px-4 py-2.5 border-2 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      {isEn ? 'Reject' : 'ปฏิเสธ'}
                    </button>
                  </div>
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

            {/* ── Admin: Post-approval actions ──
                 Primary: Mark as Paid (the canonical happy path).
                 Secondaries: Defer / Request Tax Invoice as outline. */}
            {isAdmin && (isApproved || isPendingMonthEnd || isWaitingTaxInvoice) && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  {isEn ? 'Next step' : 'ขั้นตอนถัดไป'}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleMarkPaid}
                    disabled={loading}
                    className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {loading ? '...' : (isEn ? 'Mark as Paid' : 'ชำระเงินแล้ว')}
                  </button>
                  {(isApproved || isWaitingTaxInvoice) && (
                    <button
                      onClick={handleDeferMonthEnd}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2.5 border-2 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Clock className="h-4 w-4" />
                      {loading ? '...' : (isEn ? 'Defer to Month End' : 'เลื่อนสิ้นเดือน')}
                    </button>
                  )}
                  {isApproved && (
                    <button
                      onClick={handleMarkWaitingTaxInvoice}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2.5 border-2 border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Receipt className="h-4 w-4" />
                      {loading ? '...' : (isEn ? 'Request Tax Invoice' : 'ขอใบกำกับภาษี')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Owner/Admin: Upload Tax Invoice (paired rows) ── */}
            {isWaitingTaxInvoice && (isOwner || isAdmin) && (
              <div className="space-y-3 p-3.5 bg-sky-50 dark:bg-sky-950/20 border-2 border-sky-200 dark:border-sky-800 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/40">
                    <Receipt className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-sky-700 dark:text-sky-300">
                      {isEn ? 'Upload Tax Invoice(s)' : 'แนบใบกำกับภาษี'}
                    </p>
                    <p className="text-[11px] text-sky-600 dark:text-sky-400">
                      {isEn
                        ? 'Pair each invoice file with its number — add a row per invoice.'
                        : 'แนบใบกำกับภาษีพร้อมเลขที่ — เพิ่มได้หลายใบ'}
                    </p>
                  </div>
                  {(claim.tax_invoice_urls?.length || claim.tax_invoice_numbers?.length) ? (
                    <span className="text-[10px] text-sky-500 font-medium bg-white dark:bg-sky-950/40 px-2 py-0.5 rounded-full border border-sky-200">
                      {isEn
                        ? `${Math.max(claim.tax_invoice_urls?.length || 0, claim.tax_invoice_numbers?.length || 0)} on file`
                        : `มีอยู่ ${Math.max(claim.tax_invoice_urls?.length || 0, claim.tax_invoice_numbers?.length || 0)} ใบ`}
                    </span>
                  ) : null}
                </div>

                {/* Paired rows */}
                <div className="space-y-2">
                  {taxInvoiceRows.map((row, idx) => (
                    <div
                      key={row.id}
                      className="rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-900 p-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400">
                          {isEn ? `Invoice #${idx + 1}` : `ใบกำกับ #${idx + 1}`}
                        </span>
                        {taxInvoiceRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTaxInvoiceRows(prev => prev.filter(r => r.id !== row.id))}
                            className="text-zinc-400 hover:text-red-500 p-1"
                            title={isEn ? 'Remove' : 'ลบรายการนี้'}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Number */}
                        <div>
                          <label className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 mb-1 flex items-center gap-1">
                            <Hash className="h-2.5 w-2.5" />
                            {isEn ? 'Tax Invoice Number' : 'เลขที่ใบกำกับภาษี'}
                          </label>
                          <input
                            type="text"
                            value={row.number}
                            onChange={e => setTaxInvoiceRows(prev => prev.map(r => r.id === row.id ? { ...r, number: e.target.value } : r))}
                            placeholder={isEn ? 'e.g. INV-2026-0001' : 'เช่น INV-2026-0001'}
                            className="w-full px-2.5 py-1.5 text-xs font-mono border border-sky-200 dark:border-sky-800 rounded-md bg-white dark:bg-zinc-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                          />
                        </div>
                        {/* File */}
                        <div>
                          <label className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 mb-1 flex items-center gap-1">
                            <Upload className="h-2.5 w-2.5" />
                            {isEn ? 'Invoice File' : 'ไฟล์ใบกำกับภาษี'}
                          </label>
                          {row.file ? (
                            <div className="flex items-center gap-2 px-2 py-1.5 bg-sky-50 dark:bg-sky-950/40 rounded-md border border-sky-200 dark:border-sky-800">
                              <FileText className="h-3 w-3 text-sky-500 shrink-0" />
                              <span className="text-[11px] text-zinc-700 dark:text-zinc-300 truncate flex-1" title={row.file.name}>
                                {row.file.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => setTaxInvoiceRows(prev => prev.map(r => r.id === row.id ? { ...r, file: null } : r))}
                                className="text-zinc-400 hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <label
                              htmlFor={`tax-invoice-file-${row.id}`}
                              className="flex items-center justify-center gap-1.5 px-2 py-1.5 border border-dashed border-sky-300 dark:border-sky-700 rounded-md cursor-pointer hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/30 text-[11px] text-sky-600"
                            >
                              <Upload className="h-3 w-3" />
                              {isEn ? 'Choose file' : 'เลือกไฟล์'}
                            </label>
                          )}
                          <input
                            id={`tax-invoice-file-${row.id}`}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0]
                              if (f) {
                                setTaxInvoiceRows(prev => prev.map(r => r.id === row.id ? { ...r, file: f } : r))
                              }
                              e.target.value = ''
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setTaxInvoiceRows(prev => [...prev, { id: nextTaxInvoiceRowId(), file: null, number: '' }])}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-md font-semibold border border-dashed border-sky-300 dark:border-sky-700"
                  >
                    <Plus className="h-3 w-3" />
                    {isEn ? 'Add another invoice' : 'เพิ่มใบกำกับภาษีอีก'}
                  </button>
                  <button
                    onClick={handleUploadTaxInvoice}
                    disabled={loading || taxInvoiceRows.every(r => !r.file && !r.number.trim())}
                    className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {loading
                      ? '...'
                      : (isEn ? 'Save All Invoices' : 'บันทึกใบกำกับภาษี')}
                  </button>
                </div>
              </div>
            )}

            {/* ── Advance Settlement (ทดลองจ่าย) ── */}
            {canSettleAdvance && (
              <div className="space-y-3.5 p-4 bg-zinc-50/60 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-700 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {isEn ? 'Settle Advance Payment' : 'อัพเดทค่าใช้จ่ายจริง'}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {isEn
                        ? 'Add each expense line item; the refund is calculated automatically.'
                        : 'เพิ่มรายการค่าใช้จ่ายได้หลายรายการ ระบบคำนวณเงินคืนให้อัตโนมัติ'}
                    </p>
                  </div>
                </div>

                {/* Summary strip: advance / spent / refund — stacks on mobile */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Advance' : 'เบิกล่วงหน้า'}</p>
                    <p className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                      ฿{fmtDec(advanceAmount)}
                    </p>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Actual Spent' : 'ใช้จ่ายจริง'}</p>
                    <p className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                      ฿{fmtDec(actualSpentNum)}
                    </p>
                    <p className="text-[9px] text-zinc-400 mt-0.5">
                      {spentItems.filter(i => Number(i.amount) > 0).length} {isEn ? 'item(s)' : 'รายการ'}
                    </p>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${computedRefund > 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'}`}>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Refund' : 'เงินคืนบริษัท'}</p>
                    <p className={`text-sm font-mono font-semibold ${computedRefund > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`}>
                      ฿{fmtDec(computedRefund)}
                    </p>
                    <p className="text-[9px] text-zinc-400 mt-0.5">{isEn ? 'Auto' : 'คำนวณอัตโนมัติ'}</p>
                  </div>
                </div>

                {actualSpentNum > advanceAmount && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      {isEn
                        ? `Actual spent (฿${fmtDec(actualSpentNum)}) exceeds the advance (฿${fmtDec(advanceAmount)}). No refund due — please create a top-up claim for the difference.`
                        : `ค่าใช้จ่ายจริง (฿${fmtDec(actualSpentNum)}) เกินเงินที่เบิกไป (฿${fmtDec(advanceAmount)}) — ไม่มีเงินคืน กรุณาเบิกเพิ่มส่วนต่างในใบเบิกใหม่`}
                    </span>
                  </div>
                )}

                {/* Line items */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5 text-emerald-500" />
                      {isEn ? 'Expense Line Items' : 'รายการค่าใช้จ่าย'}
                      {!itemsEditMode && hasSavedSpentItems && (
                        <span className="ml-1 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded">
                          {isEn ? 'Locked' : 'ล็อกไว้'}
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-400">
                        {spentItems.filter(i => Number(i.amount) > 0).length}/{spentItems.length}
                      </span>
                      {hasSavedSpentItems && (
                        <button
                          type="button"
                          onClick={() => setItemsEditMode(v => !v)}
                          className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                            itemsEditMode
                              ? 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                          }`}
                          title={itemsEditMode ? (isEn ? 'Cancel edit' : 'ยกเลิกการแก้ไข') : (isEn ? 'Edit items' : 'แก้ไขรายการ')}
                        >
                          {itemsEditMode ? <X className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
                          {itemsEditMode ? (isEn ? 'Cancel' : 'ยกเลิก') : (isEn ? 'Edit' : 'แก้ไข')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Column headers — desktop only */}
                  <div className="hidden sm:flex items-center gap-2 px-1 pb-1.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                    <span className="w-6 shrink-0"></span>
                    <span className="flex-1">{isEn ? 'Description' : 'รายการ'}</span>
                    <span className="w-32 text-right pr-9">{isEn ? 'Amount (฿)' : 'จำนวน (฿)'}</span>
                  </div>

                  <div className="space-y-1.5">
                    {spentItems.map((item, idx) => {
                      const itemAmount = Number(item.amount) || 0
                      const pct = spentItemsTotal > 0 ? (itemAmount / spentItemsTotal) * 100 : 0
                      return (
                        <div
                          key={idx}
                          className="group relative flex flex-col sm:flex-row sm:items-center gap-2 px-1.5 py-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          {/* Progress bar (item share of total) */}
                          {itemAmount > 0 && (
                            <div
                              className="absolute left-0 bottom-0 h-0.5 bg-emerald-400/40 dark:bg-emerald-500/30 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          )}
                          {/* Mobile: number badge floats top-left, label "Item N" inline */}
                          <div className="flex items-center gap-2 sm:contents">
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-mono text-zinc-500 shrink-0">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={item.description}
                              onChange={e => updateSpentItem(idx, { description: e.target.value })}
                              placeholder={isEn ? 'Description (e.g. Fuel, Tolls)' : 'ใส่รายการ เช่น ค่าน้ำมัน'}
                              readOnly={!itemsEditMode}
                              className={`flex-1 min-w-0 px-2.5 py-2 border rounded-md text-sm outline-none transition-colors ${
                                itemsEditMode
                                  ? 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                                  : 'border-transparent bg-zinc-50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 cursor-default'
                              }`}
                            />
                          </div>
                          {/* Amount + delete (mobile: full-width row below; desktop: same row) */}
                          <div className="flex items-center gap-2 pl-7 sm:pl-0">
                            <div className="relative flex-1 sm:flex-none sm:w-32">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">฿</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={item.amount}
                                onChange={e => updateSpentItem(idx, { amount: e.target.value })}
                                placeholder="0.00"
                                readOnly={!itemsEditMode}
                                className={`w-full pl-6 pr-2.5 py-2 border rounded-md text-sm font-mono text-right outline-none transition-colors ${
                                  itemsEditMode
                                    ? 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                                    : 'border-transparent bg-zinc-50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 cursor-default'
                                }`}
                              />
                            </div>
                            {itemsEditMode ? (
                              <button
                                type="button"
                                onClick={() => removeSpentItem(idx)}
                                disabled={spentItems.length <= 1}
                                className="p-1.5 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded disabled:opacity-20 disabled:hover:text-zinc-300 disabled:hover:bg-transparent shrink-0 transition-colors"
                                title={isEn ? 'Remove' : 'ลบ'}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <span className="w-[26px] shrink-0" aria-hidden />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Add Item + Quick-add presets (only in edit mode) */}
                  {itemsEditMode && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={addSpentItem}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-600 border border-dashed border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-md transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {isEn ? 'Add Item' : 'เพิ่มรายการ'}
                      </button>
                      <span className="text-[10px] text-zinc-400 mx-1">
                        {isEn ? 'Quick add:' : 'เพิ่มด่วน:'}
                      </span>
                      {(isEn
                        ? ['Fuel', 'Tolls', 'Lodging', 'Meals', 'Transport', 'Supplies']
                        : ['ค่าน้ำมัน', 'ค่าทางด่วน', 'ที่พัก', 'อาหาร', 'ค่าเดินทาง', 'อุปกรณ์']
                      ).map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            // Fill the first empty row, otherwise append
                            const emptyIdx = spentItems.findIndex(i => !i.description.trim() && !i.amount)
                            if (emptyIdx >= 0) {
                              updateSpentItem(emptyIdx, { description: preset })
                            } else {
                              setSpentItems(prev => [...prev, { description: preset, amount: '' }])
                            }
                          }}
                          className="px-2 py-1 text-[11px] bg-zinc-100 hover:bg-emerald-100 dark:bg-zinc-800 dark:hover:bg-emerald-950/30 text-zinc-600 hover:text-emerald-700 dark:hover:text-emerald-300 rounded transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Total row */}
                  <div className="mt-2.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-700 flex justify-between items-center">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      {isEn ? 'Total' : 'รวม'}
                      <span className="ml-2 text-[10px] text-zinc-400">
                        ({spentItems.filter(i => Number(i.amount) > 0).length} {isEn ? 'items' : 'รายการ'})
                      </span>
                    </span>
                    <span className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      ฿{fmtDec(spentItemsTotal)}
                    </span>
                  </div>
                </div>

                {/* Actual receipts upload */}
                <div>
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    {isEn ? 'Attach Receipts / Payment Slips' : 'แนบสลิป / ใบเสร็จการจ่ายจริง'}
                    {claim.actual_receipt_urls && claim.actual_receipt_urls.length > 0 && (
                      <span className="ml-auto text-[10px] text-zinc-400">
                        {isEn ? `${claim.actual_receipt_urls.length} uploaded` : `อัพโหลดแล้ว ${claim.actual_receipt_urls.length} ไฟล์`}
                      </span>
                    )}
                  </label>
                  <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-center hover:border-emerald-400 transition-colors">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      onChange={(e) => { if (e.target.files) setActualReceiptFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
                      className="hidden"
                      id="actual-receipt-upload"
                    />
                    <label htmlFor="actual-receipt-upload" className="cursor-pointer">
                      <Upload className="h-5 w-5 mx-auto text-zinc-400 mb-1" />
                      <p className="text-xs text-zinc-500">
                        {isEn ? 'Click to upload' : 'คลิกเพื่ออัพโหลด'}
                      </p>
                    </label>
                  </div>
                  {actualReceiptFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {actualReceiptFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-white dark:bg-zinc-800 rounded-md text-xs border border-zinc-200 dark:border-zinc-700">
                          <span className="truncate text-zinc-600 dark:text-zinc-400">{file.name}</span>
                          <button type="button" onClick={() => setActualReceiptFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-500 ml-2 shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Refund slip upload — only when refund due */}
                {computedRefund > 0 && (
                  <div>
                    <label className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" />
                      {isEn
                        ? `Refund Transfer Slip (฿${fmtDec(computedRefund)})`
                        : `สลิปโอนเงินคืนบริษัท (฿${fmtDec(computedRefund)})`}
                      {claim.refund_slip_urls && claim.refund_slip_urls.length > 0 && (
                        <span className="ml-auto text-[10px] text-zinc-400">
                          {isEn ? `${claim.refund_slip_urls.length} uploaded` : `อัพโหลดแล้ว ${claim.refund_slip_urls.length} ไฟล์`}
                        </span>
                      )}
                    </label>
                    <div className="border-2 border-dashed border-emerald-300 dark:border-emerald-800 rounded-lg p-3 text-center hover:border-emerald-500 transition-colors bg-emerald-50/30 dark:bg-emerald-950/10">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={(e) => { if (e.target.files) setRefundSlipFiles(prev => [...prev, ...Array.from(e.target.files!)]) }}
                        className="hidden"
                        id="refund-slip-upload"
                      />
                      <label htmlFor="refund-slip-upload" className="cursor-pointer">
                        <Upload className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                          {isEn ? 'Click to upload refund slip' : 'คลิกเพื่อแนบสลิปการโอนคืน'}
                        </p>
                      </label>
                    </div>
                    {refundSlipFiles.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {refundSlipFiles.map((file, i) => (
                          <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-white dark:bg-zinc-800 rounded-md text-xs border border-emerald-200 dark:border-emerald-800">
                            <span className="truncate text-zinc-600 dark:text-zinc-400">{file.name}</span>
                            <button type="button" onClick={() => setRefundSlipFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-500 ml-2 shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleSettleAdvance}
                    disabled={loading || spentItemsTotal <= 0}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    {loading ? '...' : (isEn ? 'Save Settlement' : 'บันทึกการอัพเดท')}
                  </button>
                  <p className="text-[11px] text-zinc-400">
                    {isEn
                      ? 'Multiple updates allowed — each save appends to history.'
                      : 'อัพเดทได้หลายครั้ง — แต่ละครั้งจะถูกบันทึกในประวัติ'}
                  </p>
                </div>
              </div>
            )}

            {/* ── Petty cash child banner (top-up / box expense) ── */}
            {(isPettyTopup || isPettyExpense) && (
              <div className="flex items-start gap-2 p-3 bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl">
                <Coins className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <div className="text-xs text-orange-800 dark:text-orange-200 space-y-0.5">
                  <p className="font-semibold">
                    {isPettyTopup
                      ? (isEn ? 'Top-up into the petty cash fund' : 'รายการเติมเงินเข้ากองทุนเงินสดย่อย')
                      : (isEn ? 'Expense paid from the petty cash box' : 'ค่าใช้จ่ายที่จ่ายจากกล่องเงินสดย่อย')}
                  </p>
                  <Link href={`/finance/${claim.pettycash_fund_id}`} className="inline-flex items-center gap-1 underline">
                    {isEn ? 'Open the fund page' : 'ไปที่หน้ากองทุน'} →
                  </Link>
                </div>
              </div>
            )}

            {/* ── Petty Cash Fund (กองทุนเงินสดย่อยประจำเดือน) ── */}
            {isPettyFund && (
              <div className="space-y-3.5 p-4 bg-orange-50/40 dark:bg-orange-950/10 border border-orange-200 dark:border-orange-900/40 rounded-xl">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                      <Coins className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {isEn ? 'Monthly Petty Cash Fund' : 'กองทุนเงินสดย่อยประจำเดือน'}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {claim.pettycash_period_start || '—'} → {claim.pettycash_period_end || '—'}
                      </p>
                    </div>
                  </div>
                  {isPettyClosed ? (
                    <span className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-zinc-600 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 rounded-md shrink-0">
                      <Lock className="h-3 w-3" /> {isEn ? 'Closed' : 'ปิดเดือนแล้ว'}
                    </span>
                  ) : pettyFundOpen ? (
                    <span className="px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 rounded-md shrink-0">
                      {isEn ? 'Open' : 'เปิดใช้งาน'}
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-[11px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 rounded-md shrink-0">
                      {isEn ? 'Awaiting payout' : 'รออนุมัติ/จ่ายเงินตั้งต้น'}
                    </span>
                  )}
                </div>

                {/* Previous month link */}
                {claim.pettycash_previous_claim_id && (
                  <Link
                    href={`/finance/${claim.pettycash_previous_claim_id}`}
                    className="inline-flex items-center gap-1.5 text-[11px] text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    <RefreshCw className="h-3 w-3" />
                    {isEn ? 'View previous month fund' : 'ดูกองทุนเดือนก่อนหน้า'} →
                  </Link>
                )}

                {/* Summary strip: initial / topped-up / spent / balance */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Initial fund' : 'ยอดตั้งต้น'}</p>
                    <p className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">฿{fmtDec(Number(claim.amount) || 0)}</p>
                    {!pettyFunded && (
                      <p className="text-[9px] text-amber-500 mt-0.5">{isEn ? 'not paid out yet' : 'ยังไม่จ่ายเข้ากล่อง'}</p>
                    )}
                  </div>
                  <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Topped up' : 'เติมแล้ว'}</p>
                    <p className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">฿{fmtDec(pettyTopupPaid)}</p>
                    {pettyTopupPending > 0 && (
                      <p className="text-[9px] text-amber-500 mt-0.5">{isEn ? `pending ฿${fmtDec(pettyTopupPending)}` : `รอดำเนินการ ฿${fmtDec(pettyTopupPending)}`}</p>
                    )}
                  </div>
                  <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Spent' : 'ใช้ไป'}</p>
                    <p className="text-sm font-mono font-semibold text-orange-600 dark:text-orange-400">฿{fmtDec(pettySpent)}</p>
                    <p className="text-[9px] text-zinc-400 mt-0.5">{pettyChildren?.expenses.length || 0} {isEn ? 'item(s)' : 'รายการ'}</p>
                  </div>
                  <div className={`p-2.5 rounded-lg border ${pettyBalance < 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'}`}>
                    <p className="text-[10px] text-zinc-400">{isEn ? 'Balance in box' : 'คงเหลือในกล่อง'}</p>
                    <p className={`text-sm font-mono font-semibold ${pettyBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>฿{fmtDec(pettyBalance)}</p>
                  </div>
                </div>

                {pettyBalance < 0 && (
                  <div className="flex items-start gap-2 p-2.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      {isEn
                        ? 'Spending exceeds the money in the box — request a top-up.'
                        : 'รายจ่ายเกินเงินในกล่อง — กรุณาเบิกเพิ่ม (Top-up) หรือตรวจสอบรายการ'}
                    </span>
                  </div>
                )}

                {/* Quick-add expense — any staff member, while the fund is open */}
                {pettyFundOpen && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-2.5">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5 text-orange-500" />
                      {isEn ? 'Log Expense (paid from the box)' : 'บันทึกค่าใช้จ่าย (จ่ายจากกล่อง)'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-[130px_1fr] gap-2">
                      <input
                        type="date"
                        value={qaDate}
                        onChange={e => setQaDate(e.target.value)}
                        className="px-2.5 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      />
                      <input
                        type="text"
                        value={qaTitle}
                        onChange={e => setQaTitle(e.target.value)}
                        placeholder={isEn ? 'e.g. Drinking water, Stamps' : 'เช่น ค่าน้ำดื่ม, ค่าแสตมป์'}
                        className="px-2.5 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2">
                      <select
                        value={qaCategory}
                        onChange={e => setQaCategory(e.target.value)}
                        className="px-2.5 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                      >
                        {categories.map(cat => (
                          <option key={cat.value} value={cat.value}>{isEn ? cat.label : cat.label_th}</option>
                        ))}
                      </select>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">฿</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={qaAmount}
                          onChange={e => setQaAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-6 pr-2.5 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm font-mono text-right outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                        />
                      </div>
                    </div>
                    {/* Receipts */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={(e) => { if (e.target.files) setQaFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }}
                        className="hidden"
                        id="petty-qa-receipts"
                      />
                      <label htmlFor="petty-qa-receipts" className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md hover:border-orange-400 transition-colors">
                        <Upload className="h-3.5 w-3.5" />
                        {isEn ? 'Attach receipt' : 'แนบใบเสร็จ'}
                      </label>
                      {qaFiles.map((file, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded text-[11px] text-zinc-600 dark:text-zinc-300">
                          <span className="truncate max-w-[140px]">{file.name}</span>
                          <button type="button" onClick={() => setQaFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddPettyExpense}
                        disabled={loading}
                        className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {loading ? '...' : (isEn ? 'Save Expense' : 'บันทึกรายจ่าย')}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400">
                      {isEn
                        ? 'Saved as a paid claim immediately — the cash already left the box. Admin audits at month close.'
                        : 'บันทึกเป็นใบเบิกสถานะ "จ่ายแล้ว" ทันที (เงินสดออกจากกล่องแล้วจริง) — admin ตรวจสอบตอนปิดเดือน'}
                    </p>
                  </div>
                )}

                {/* Weekly expense summary (สรุปยอดแต่ละสัปดาห์) */}
                {pettyWeekGroups.length > 0 && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5 mb-2">
                      <Receipt className="h-3.5 w-3.5 text-orange-500" />
                      {isEn ? 'Weekly Summary' : 'สรุปยอดแต่ละสัปดาห์'}
                    </p>
                    <div className="space-y-2.5">
                      {pettyWeekGroups.map(g => (
                        <div key={g.week}>
                          <div className="flex items-center justify-between px-2 py-1.5 bg-orange-50/70 dark:bg-orange-950/20 rounded-md">
                            <span className="text-[11px] font-semibold text-orange-700 dark:text-orange-300">
                              {isEn ? `Week ${g.week}` : `สัปดาห์ที่ ${g.week}`}
                              <span className="text-zinc-400 font-normal ml-1">({isEn ? 'day' : 'วันที่'} {g.from}–{g.to})</span>
                            </span>
                            <span className="text-xs font-mono font-bold text-orange-700 dark:text-orange-300">฿{fmtDec(g.total)}</span>
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {g.items.map(e => (
                              <Link
                                key={e.id}
                                href={`/finance/${e.id}`}
                                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-xs group"
                              >
                                <span className="font-mono text-[10px] text-zinc-400 w-12 shrink-0">{(e.expense_date || '').slice(5)}</span>
                                <span className="font-mono text-[10px] text-zinc-400 hidden sm:inline shrink-0">{e.claim_number}</span>
                                <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300 group-hover:text-orange-600">{e.title}</span>
                                {(e.receipt_urls?.length ?? 0) === 0 && (
                                  <span className="text-[9px] text-red-400 shrink-0">{isEn ? 'no receipt' : 'ไม่มีใบเสร็จ'}</span>
                                )}
                                <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300 shrink-0">฿{fmtDec(Number(e.amount) || 0)}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-700 flex justify-between items-center">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{isEn ? 'Month total' : 'รวมทั้งเดือน'}</span>
                      <span className="text-base font-mono font-bold text-orange-600 dark:text-orange-400">฿{fmtDec(pettySpent)}</span>
                    </div>
                  </div>
                )}

                {/* Top-ups (เติมเงินระหว่างเดือน) */}
                {(canManagePettyFund || (pettyChildren?.topups.length ?? 0) > 0) && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <Banknote className="h-3.5 w-3.5 text-orange-500" />
                        {isEn ? 'Top-ups' : 'เติมเงินเข้ากองทุน'}
                        <span className="text-zinc-400 font-normal">({pettyChildren?.topups.length ?? 0})</span>
                      </p>
                      {canManagePettyFund && (
                        <button
                          type="button"
                          onClick={() => setShowTopupForm(v => !v)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-orange-600 border border-dashed border-orange-300 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-950/20 rounded-md transition-colors"
                        >
                          {showTopupForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                          {showTopupForm ? (isEn ? 'Cancel' : 'ยกเลิก') : (isEn ? 'Request top-up' : 'ขอเบิกเพิ่ม')}
                        </button>
                      )}
                    </div>

                    {showTopupForm && canManagePettyFund && (
                      <div className="p-2.5 bg-orange-50/50 dark:bg-orange-950/10 border border-orange-200 dark:border-orange-900/40 rounded-md space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-2">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">฿</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={tuAmount}
                              onChange={e => setTuAmount(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-6 pr-2.5 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm font-mono text-right outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                            />
                          </div>
                          <input
                            type="text"
                            value={tuNote}
                            onChange={e => setTuNote(e.target.value)}
                            placeholder={isEn ? 'Note (optional)' : 'หมายเหตุ (ไม่บังคับ)'}
                            className="px-2.5 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleCreateTopup}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {loading ? '...' : (isEn ? 'Submit for approval' : 'ส่งขออนุมัติ')}
                          </button>
                          <p className="text-[10px] text-zinc-400">
                            {isEn ? 'Goes through approve → pay like a normal claim.' : 'เข้าคิวอนุมัติ → จ่ายเงิน เหมือนใบเบิกปกติ'}
                          </p>
                        </div>
                      </div>
                    )}

                    {(pettyChildren?.topups.length ?? 0) > 0 && (
                      <div className="space-y-0.5">
                        {pettyChildren!.topups.map(t => (
                          <Link
                            key={t.id}
                            href={`/finance/${t.id}`}
                            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-xs group"
                          >
                            <span className="font-mono text-[10px] text-zinc-400 shrink-0">{t.claim_number}</span>
                            <span className="flex-1 truncate text-zinc-700 dark:text-zinc-300 group-hover:text-orange-600">{t.title}</span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium shrink-0 ${
                              t.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}>
                              {t.status === 'paid' ? (isEn ? 'Paid' : 'จ่ายแล้ว') : getClaimStatusLabel(t.status, locale)}
                            </span>
                            <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300 shrink-0">+฿{fmtDec(Number(t.amount) || 0)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Close month — return leftover to the company */}
                {canManagePettyFund && (
                  <div className="border-t border-orange-200/70 dark:border-orange-900/40 pt-3 space-y-2.5">
                    <div>
                      <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        {isEn ? `Close month — return leftover ฿${fmtDec(pettyBalance)}` : `ปิดเดือน — คืนเงินคงเหลือ ฿${fmtDec(pettyBalance)}`}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {isEn
                          ? 'Transfer the leftover back to the company, attach the slip, then close. Admin confirms receipt to finalise.'
                          : 'โอนเงินคงเหลือคืนบริษัท แนบสลิป แล้วกดปิดเดือน — จากนั้น admin ยืนยันรับเงินเพื่อจบเดือน'}
                      </p>
                    </div>
                    {pettyTopupPending > 0 && (
                      <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-700 dark:text-amber-300">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          {isEn
                            ? `Unresolved top-ups (฿${fmtDec(pettyTopupPending)}) — pay or cancel them before closing.`
                            : `มีรายการเติมเงินค้างดำเนินการ (฿${fmtDec(pettyTopupPending)}) — ต้องจ่ายหรือยกเลิกก่อนปิดเดือน`}
                        </span>
                      </div>
                    )}
                    {pettyBalance > 0 && (
                      <>
                        <div className="border-2 border-dashed border-orange-300 dark:border-orange-800 rounded-lg p-3 text-center hover:border-orange-500 transition-colors bg-orange-50/30 dark:bg-orange-950/10">
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            multiple
                            onChange={(e) => { if (e.target.files) setRefundSlipFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value = '' }}
                            className="hidden"
                            id="petty-return-slip"
                          />
                          <label htmlFor="petty-return-slip" className="cursor-pointer">
                            <Upload className="h-5 w-5 mx-auto text-orange-500 mb-1" />
                            <p className="text-xs text-orange-700 dark:text-orange-400">{isEn ? 'Attach return transfer slip' : 'แนบสลิปการโอนเงินคืนบริษัท'}</p>
                          </label>
                        </div>
                        {refundSlipFiles.length > 0 && (
                          <div className="space-y-1">
                            {refundSlipFiles.map((file, i) => (
                              <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-white dark:bg-zinc-800 rounded-md text-xs border border-orange-200 dark:border-orange-800">
                                <span className="truncate text-zinc-600 dark:text-zinc-400">{file.name}</span>
                                <button type="button" onClick={() => setRefundSlipFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-400 hover:text-red-500 ml-2 shrink-0">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleCloseMonth}
                      disabled={loading || pettyTopupPending > 0 || (pettyBalance > 0 && refundSlipFiles.length === 0 && (claim.refund_slip_urls?.length ?? 0) === 0)}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      <Lock className="h-4 w-4" />
                      {isEn ? 'Close Month & Return' : 'ปิดเดือน + คืนเงิน'}
                    </button>
                  </div>
                )}

                {/* Closed banner */}
                {isPettyClosed && (
                  <div className="flex items-start gap-2 p-3 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 rounded-lg">
                    <CheckCircle2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-semibold text-cyan-700 dark:text-cyan-300">
                        {pettyReturned
                          ? (isRefundConfirmed
                              ? (isEn ? `Month closed — ฿${fmtDec(Number(claim.refund_amount) || 0)} returned & confirmed` : `ปิดเดือนแล้ว — คืนเงิน ฿${fmtDec(Number(claim.refund_amount) || 0)} และ admin ยืนยันแล้ว`)
                              : (isEn ? `Month closed — ฿${fmtDec(Number(claim.refund_amount) || 0)} returned, awaiting admin confirmation` : `ปิดเดือนแล้ว — คืนเงิน ฿${fmtDec(Number(claim.refund_amount) || 0)} รอ admin ยืนยันรับเงิน`))
                          : (isEn ? 'Month closed — no leftover to return' : 'ปิดเดือนแล้ว — ไม่มีเงินคงเหลือต้องคืน')}
                      </p>
                      {claim.pettycash_closed_at && (
                        <p className="text-[10px] text-cyan-600/80 dark:text-cyan-400/80 mt-0.5">
                          {isEn ? 'Closed at' : 'ปิดเมื่อ'}: {new Date(claim.pettycash_closed_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      )}
                      {isAdmin && !isRefundConfirmed && (
                        <button
                          type="button"
                          onClick={handleReopenMonth}
                          disabled={loading}
                          className="mt-2 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700 hover:bg-cyan-100 dark:hover:bg-cyan-950/40 disabled:opacity-50 rounded-md transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {isEn ? 'Reopen month (admin)' : 'เปิดรอบอีกครั้ง เพื่อแก้ไข (admin)'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Admin: confirm returned cash */}
                {canConfirmRefund && isPettyFund && (
                  <div className="flex items-center justify-between gap-2 p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-dashed border-emerald-300 dark:border-emerald-800 rounded-lg">
                    <div className="text-xs">
                      <p className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        {isEn
                          ? `Awaiting confirmation — return ฿${fmtDec(Number(claim.refund_amount) || 0)}`
                          : `รอ admin ยืนยัน — เงินคืน ฿${fmtDec(Number(claim.refund_amount) || 0)}`}
                      </p>
                      <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                        {isEn ? 'Check the slip, then mark as received.' : 'ตรวจสลิปการโอน แล้วกดยืนยันได้รับเงิน'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConfirmRefund}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isEn ? 'Confirm received' : 'ยืนยันรับเงินแล้ว'}
                    </button>
                  </div>
                )}

                {/* Return slips */}
                {claim.refund_slip_urls && claim.refund_slip_urls.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" />
                      {isEn ? 'Return Transfer Slips' : 'สลิปการโอนเงินคืนบริษัท'}
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {claim.refund_slip_urls.map((url, i) => {
                        const isPdf = url.toLowerCase().endsWith('.pdf')
                        return (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-orange-200 dark:border-orange-800 overflow-hidden aspect-[4/3] bg-orange-50 dark:bg-orange-950/20">
                            {isPdf
                              ? <div className="flex flex-col items-center justify-center h-full gap-1 text-orange-400"><FileText className="h-6 w-6" /><span className="text-[10px]">PDF</span></div>
                              : <img src={url} alt={`${isEn ? 'return slip' : 'สลิปคืน'} ${i + 1}`} className="w-full h-full object-cover" />}
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Admin Override — always visible for admin ── */}
            {isAdmin && (
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {isEn ? 'Admin: Override Status' : 'Admin: บังคับเปลี่ยนสถานะ'}
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

                  {/* Clear form */}
                  {(overrideStatus || overrideReason) && (
                    <button
                      onClick={() => { setOverrideStatus(''); setOverrideReason('') }}
                      className="px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                      {isEn ? 'Clear' : 'ล้าง'}
                    </button>
                  )}
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
                      : log.action === 'auto_transition'      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      : log.action === 'settle_advance'       ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
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
                      : log.action === 'auto_transition'      ? (isEn ? 'Auto Transition' : 'เปลี่ยนสถานะอัตโนมัติ')
                      : log.action === 'settle_advance'       ? (isEn ? 'Advance Settled' : 'อัพเดทค่าใช้จ่ายจริง')
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
