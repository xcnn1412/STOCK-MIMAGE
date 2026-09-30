'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { useConfirm } from '../use-confirm'
import { claimFileCount, filedState, financeListHref } from '../claims-filter'
import BundleDialog from '../bundle-dialog'
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Trash2, FileText,
  Banknote, User, Calendar, Tag, MessageSquare, Edit3, Save, X,
  Receipt, Percent, Upload, History, FileDown, Send, Ban, ShieldAlert,
  Wallet, RefreshCw, Plus, Building2, ListChecks, Hash, AlertCircle,
  ChevronDown, ChevronRight, Coins, Lock, FileStack, FolderCheck,
  Undo2, EyeOff, ArchiveRestore,
} from 'lucide-react'
import { updateClaim, removeReceiptFile, uploadTaxInvoice, settleAdvanceClaim, confirmRefundReceived, setTaxInvoiceEntries, addPettyCashExpense, createPettyCashTopup, closePettyCashMonth, reopenPettyCashMonth, linkClaimToPettyCash, unlinkClaimFromPettyCash, markClaimsFiled, unmarkClaimFiled, getJobEventsForSelect } from '../actions'
import { approveClaim, rejectClaim, submitClaim, cancelClaim, markAsPaid, markAsPendingMonthEnd, approveAsPendingMonthEnd, adminOverrideStatus, markAsWaitingTaxInvoice, reopenRejectedClaim, sendBackClaim, hideClaim, restoreClaim } from '../lifecycle-actions'
import { SendBackDialog } from '../send-back-dialog'
import { findTransition } from '../claim-transitions'
import { getClaimStatusLabel, getClaimStatusColor, getCategoryLabel, getAdminOverrideStatuses, isAdminSensitiveTransition, CLAIM_STATUSES, getClaimChecklist, getFundingSourceLabel, getFundingSourceColor, FUNDING_SOURCES, type FundingSource } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { useLocale } from '@/lib/i18n/context'
import type { ExpenseClaim } from '../../costs/types'
import BankSelect from '@/components/bank-select'
import { Button } from '@/components/ui/button'
import { compressImage } from '@/lib/utils'
import { calcTax } from '@/lib/finance/money'
import { THUMB_MAX_DIMENSION, THUMB_MAX_MB } from '@/lib/finance/receipt-thumbs'
import { thaiTodayIso } from '@/lib/thai-date'
import EventSelectCombobox from '../new/event-select-combobox'
import { canSeeWorkPanel, receiptRequiredForSubmit, reasonRequiredForTransition, reasonRequiredForEdit, paymentLock } from '../claim-rules'
import { ReceiptThumb, appendFilePairs, settleThumb, type FilePair } from './receipt-thumb'

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * ไฟล์ที่ส่ง + รูปย่อ: รูปบีบขนาดปกติก่อน แล้วทำรูปย่อจากไฟล์ที่บีบแล้ว (เล็กกว่า ถอดรหัสเร็วกว่า) · PDF ไม่มีรูปย่อ
 * ทีละไฟล์ — มือถือไม่ต้องถอดรหัสรูปใหญ่หลายรูปพร้อมกัน
 */
async function withThumbs(originals: File[]): Promise<FilePair[]> {
  const pairs: FilePair[] = []
  for (const original of originals) {
    if (!original.type.startsWith('image/')) {
      pairs.push({ file: original, thumb: null })
      continue
    }
    const file = await compressImage(original)
    pairs.push({ file, thumb: await settleThumb(file, compressImage(file, THUMB_MAX_MB, THUMB_MAX_DIMENSION)) })
  }
  return pairs
}

/** ข้อผิดพลาดของปุ่มที่เพิ่งกด — แสดงใต้กลุ่มปุ่มนั้น (k = busy key ของปุ่มในกลุ่ม) */
type ActionErrorState = { key: string; message: string } | null
function ActionError({ k, error, className = '' }: { k: string | readonly string[]; error: ActionErrorState; className?: string }) {
  if (!error || !(typeof k === 'string' ? error.key === k : k.includes(error.key))) return null
  return (
    <div role="alert" className={`flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-lg text-sm text-red-600 dark:text-red-400 ${className}`}>
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span className="min-w-0 break-words">{error.message}</span>
    </div>
  )
}

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

/** Approved-but-unpaid claim that admin can pull into the fund */
type LinkableClaim = {
  id: string
  claim_number: string
  claim_type: string
  title: string
  amount: number
  expense_date: string | null
  status: string
  submitter?: { id: string; full_name: string } | null
}

export default function ClaimDetailView({ claim, role, categories = [], logs = [], userId = '', pettyChildren = null, linkableClaims = null }: { claim: ExpenseClaim; role: string; categories?: FinanceCategory[]; logs?: ClaimLog[]; userId?: string; pettyChildren?: PettyChildren | null; linkableClaims?: LinkableClaim[] | null }) {
  const router = useRouter()
  const { locale } = useLocale()
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm()
  // ปุ่มที่กำลังทำงาน (หมุนเฉพาะปุ่มนั้น — ปุ่มอื่นแค่ปิดไว้) และข้อผิดพลาดของปุ่มที่กดล่าสุด
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [actionError, setActionError] = useState<ActionErrorState>(null)
  const [bundleOpen, setBundleOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  // รายชื่องานของกล่องเลือกงาน — โหลดครั้งแรกที่กด "แก้ไข" (หน้าเปิดเร็วขึ้น ไม่ต้องอ่านตารางงานทุกครั้ง) แล้วเก็บไว้
  const [jobEvents, setJobEvents] = useState<JobEventOption[] | null>(null)
  const [jobEventsState, setJobEventsState] = useState<'idle' | 'loading' | 'error'>('idle')
  /** กด "แก้ไข" (และปุ่มลองใหม่ของรายชื่องาน) — โหลดรายชื่องานครั้งเดียว ได้แล้วไม่โหลดซ้ำ */
  const startEditing = () => {
    setEditing(true)
    if (jobEvents || jobEventsState === 'loading') return
    setJobEventsState('loading')
    getJobEventsForSelect().then(
      list => { setJobEvents(list); setJobEventsState('idle') },
      () => setJobEventsState('error'),
    )
  }
  const [overrideStatus, setOverrideStatus] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [editReason, setEditReason] = useState('')
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
  const [qaDate, setQaDate] = useState(() => thaiTodayIso())
  const [qaFiles, setQaFiles] = useState<File[]>([])
  const [tuAmount, setTuAmount] = useState('')
  const [tuNote, setTuNote] = useState('')
  const [showTopupForm, setShowTopupForm] = useState(false)
  const [linkClaimId, setLinkClaimId] = useState('')
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
    // Fund-linked advance returns cash to the box — no transfer slip exists.
    && ((claim.refund_slip_urls?.length ?? 0) > 0 || (isAdvance && !!claim.pettycash_fund_id))
    && ['approved', 'paid', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment'].includes(claim.status)
  const advanceAmount = claim.amount || 0
  const actualSpentNum = spentItemsTotal
  const computedRefund = Math.max(0, advanceAmount - actualSpentNum)
  const canEdit = isAdmin || ((isDraft || isPending) && isOwner)
  const canSubmit = isOwner && isDraft
  const canCancel = isOwner && !isAdmin && (isDraft || isPending)
  const statusColor = getClaimStatusColor(claim.status)
  const isEn = locale === 'en'
  // ล็อกการจ่าย: เอกสารไม่ครบจ่ายไม่ได้ (server ปฏิเสธด้วยข้อความเดียวกัน) — ทางเดียวที่จ่ายได้คือบังคับเปลี่ยนสถานะพร้อมเหตุผล
  const payLock = paymentLock(claim)
  const overridePayLocked = overrideStatus === 'paid' && payLock.locked
  // ส่งกลับให้แก้: แอดมิน จากสถานะที่ตารางการเปลี่ยนสถานะอนุญาต (รออนุมัติ / อนุมัติแล้ว / รอใบกำกับ / รอจ่ายสิ้นเดือน)
  const canSendBack = isAdmin && !!findTransition('send_back', claim.status)
  // ใบที่แอดมินซ่อนไว้ (เปิดได้เฉพาะแอดมิน) — กู้คืนก่อนจึงแก้ไขหรือเปลี่ยนสถานะต่อได้
  const isHidden = !!claim.deleted_at
  // รายการเงินสดย่อย (วงเงิน / เติมเงิน / รายการในกล่อง) ซ่อนไม่ได้ — ยอดของกล่องจะเพี้ยน ให้ยกเลิกรายการแทน
  const canHide = isAdmin && !isHidden && !isPettyCash && !claim.pettycash_fund_id
  // ส่งกลับให้แก้แล้ว: ใบกลับเป็นแบบร่างพร้อมสิ่งที่ต้องแก้ (เจ้าของใบและแอดมินเห็น)
  const sentBackReason = isDraft && (isOwner || isAdmin) ? (claim.reject_reason || '').trim() : ''
  // แอดมินบังคับเปลี่ยนสถานะ: ต้องมีเหตุผลเฉพาะตอนถอยสถานะ / ปิดใบที่จ่ายแล้ว / จ่ายทั้งที่เอกสารไม่ครบ — เดินหน้าตามขั้นตอนไม่ต้อง
  const needsReason = !!overrideStatus && (reasonRequiredForTransition(claim.status, overrideStatus) || overridePayLocked)
  // แก้ใบที่จ่ายเงินแล้ว ต้องบอกเหตุผล
  const editNeedsReason = reasonRequiredForEdit(claim.status)

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

  /** ข้อผิดพลาดที่ตรวจเจอฝั่งหน้าจอ (ยังไม่ได้เรียก server) — แสดงใต้ปุ่มที่กด + toast */
  const fail = (key: string, message: string) => {
    setActionError({ key, message })
    toast.error(message)
  }

  /**
   * กดปุ่มหนึ่งปุ่ม: หมุนเฉพาะปุ่ม key · ผิดพลาด = ข้อความใต้กลุ่มปุ่มนั้น + toast · สำเร็จ = toast แล้ว after()
   * แล้วโหลดหน้าใหม่ — after คืน true = ออกจากหน้านี้แล้ว (ลบใบเบิก) ไม่ต้องโหลดหน้าเดิมซ้ำ
   */
  const run = async <R extends { error?: string | null }>(
    key: string,
    action: () => Promise<R>,
    successMsg: string,
    after?: (res: R) => boolean | void,
  ): Promise<boolean> => {
    setBusy(key)
    setActionError(null)
    let res: R | null = null
    try {
      res = await action()
    } catch {
      res = null // เครือข่ายหลุด / server ล้ม — แจ้งเป็นข้อผิดพลาดทั่วไป
    }
    if (!res || res.error) {
      setBusy(null)
      fail(key, res?.error || (isEn ? 'Something went wrong — please try again' : 'เกิดข้อผิดพลาด กรุณาลองใหม่'))
      return false
    }
    toast.success(successMsg)
    if (after?.(res) === true) return true
    router.refresh()
    setBusy(null)
    return true
  }

  // จับชุดเอกสาร: สถานะเข้าแฟ้ม (ฐานข้อมูลที่ยังไม่มีคอลัมน์ = none) + ปุ่มทำ/ยกเลิกเครื่องหมายของแอดมิน
  const filed = filedState(claim)
  const handleFiled = async (mark: boolean) => {
    await run(
      'filed',
      async () => mark ? await markClaimsFiled([claim.id]) : await unmarkClaimFiled(claim.id),
      mark ? (isEn ? 'Marked as filed' : 'ทำเครื่องหมายเข้าแฟ้มแล้ว') : (isEn ? 'Filing mark removed' : 'ยกเลิกเครื่องหมายเข้าแฟ้มแล้ว'),
    )
  }

  const handleApprove = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Approve this claim?' : 'ยืนยันอนุมัติใบเบิกนี้?',
      description: isEn ? 'The submitter will be notified.' : 'ระบบจะแจ้งเตือนผู้ยื่น',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Approve' : 'อนุมัติ',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    await run('approve', () => approveClaim(claim.id), isEn ? 'Approved' : 'อนุมัติแล้ว')
  }

  const handleReject = async () => {
    await run('reject', () => rejectClaim(claim.id, rejectReason), isEn ? 'Rejected' : 'ปฏิเสธแล้ว', () => { setRejectOpen(false) })
  }

  // ซ่อนแทนการลบ: ใบหายจากรายการและคิว ไฟล์ยังอยู่ กู้คืนได้ (แอดมิน · เงินสดย่อยซ่อนไม่ได้)
  const handleHide = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Hide this claim?' : 'ซ่อนใบเบิกนี้?',
      description: isEn
        ? 'The claim disappears from the lists and the queue — you can restore it later. · Its linked cost item is removed.'
        : 'ใบเบิกจะหายจากรายการและคิว กู้คืนได้ภายหลัง · รายการต้นทุนที่ผูกอยู่จะถูกเอาออก',
      details: claimContextDetails,
      variant: 'warning',
      confirmLabel: isEn ? 'Hide claim' : 'ซ่อนใบเบิก',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    await run('hide', () => hideClaim(claim.id), isEn ? 'Claim hidden' : 'ซ่อนใบเบิกแล้ว', () => {
      router.push(financeListHref())
      return true // ออกจากหน้านี้ — ปุ่มหมุนค้างไว้จนเปลี่ยนหน้า
    })
  }

  const handleRestore = async () => {
    await run('restore', () => restoreClaim(claim.id), isEn ? 'Claim restored' : 'กู้คืนใบเบิกแล้ว')
  }

  // ส่งกลับให้แก้: ใบกลับเป็นแบบร่าง ผู้เบิกได้รับแจ้งพร้อมสิ่งที่ต้องแก้ · ผิดพลาด = หน้าต่างยังเปิดไว้ให้ลองใหม่
  const handleSendBack = async (reason: string) => {
    await run('sendBack', () => sendBackClaim(claim.id, reason), isEn ? 'Sent back — the submitter has been notified' : 'ส่งกลับให้แก้แล้ว — แจ้งผู้เบิกแล้ว', () => {
      setSendBackOpen(false)
    })
  }

  const handleSubmit = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Submit this claim for approval?' : 'ยื่นใบเบิกเพื่อขออนุมัติ?',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Submit' : 'ยืนยันยื่น',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    await run('submit', () => submitClaim(claim.id), isEn ? 'Claim submitted — awaiting approval' : 'ยื่นใบเบิกแล้ว — รออนุมัติ')
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
    await run('cancel', () => cancelClaim(claim.id), isEn ? 'Claim cancelled' : 'ยกเลิกใบเบิกแล้ว')
  }

  const handleMarkPaid = async () => {
    if (payLock.locked) { fail('markPaid', payLock.message); return }
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
    await run('markPaid', () => markAsPaid(claim.id), isEn ? 'Marked as paid' : 'บันทึกว่าจ่ายแล้ว')
  }

  const handleDeferMonthEnd = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Defer payment to month end?' : 'เลื่อนชำระเงินไปสิ้นเดือน?',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Defer' : 'เลื่อน',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    await run('deferMonthEnd', () => markAsPendingMonthEnd(claim.id), isEn ? 'Deferred to month end' : 'เลื่อนเป็นรอจ่ายสิ้นเดือนแล้ว')
  }

  const handleApproveAsMonthEnd = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Approve and defer to month end?' : 'อนุมัติและเลื่อนจ่ายสิ้นเดือน?',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Approve & defer' : 'อนุมัติ + เลื่อน',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    await run('approveMonthEnd', () => approveAsPendingMonthEnd(claim.id), isEn ? 'Approved — pay at month end' : 'อนุมัติแล้ว — รอจ่ายสิ้นเดือน')
  }

  const handleMarkWaitingTaxInvoice = async () => {
    await run('waitingTaxInvoice', () => markAsWaitingTaxInvoice(claim.id), isEn ? 'Now waiting for the tax invoice' : 'เปลี่ยนเป็นรอใบกำกับภาษีแล้ว')
  }

  const handleUploadTaxInvoice = async () => {
    const validRows = taxInvoiceRows.filter(r => r.file || r.number.trim())
    if (validRows.length === 0) {
      fail('uploadTaxInvoice', isEn
        ? 'Please add at least one tax invoice (file or number).'
        : 'กรุณาเพิ่มใบกำกับภาษีอย่างน้อย 1 รายการ (แนบไฟล์หรือกรอกเลขที่)')
      return
    }
    await run('uploadTaxInvoice', async () => {
      const formData = new FormData()
      // Append files, thumbnails and numbers in matching order — server pairs them by index.
      for (const row of validRows) {
        if (row.file) {
          const [pair] = await withThumbs([row.file])
          appendFilePairs(formData, 'tax_invoice_files', 'tax_invoice_thumbs', [pair])
        } else {
          // Empty Blob preserves index alignment when there's only a number (no file = no thumbnail).
          formData.append('tax_invoice_files', new Blob([]), '')
          formData.append('tax_invoice_thumbs', new Blob([]), '')
        }
        formData.append('tax_invoice_numbers', row.number.trim())
      }
      return uploadTaxInvoice(claim.id, formData)
    }, isEn ? 'Tax invoices saved' : 'บันทึกใบกำกับภาษีแล้ว', () => {
      setTaxInvoiceRows([{ id: nextTaxInvoiceRowId(), file: null, number: '' }])
    })
  }

  const handleSaveTaxEntries = async () => {
    await run('saveTaxEntries', () => setTaxInvoiceEntries(
      claim.id,
      editTaxEntries.map(e => ({ url: e.url, number: e.number })),
    ), isEn ? 'Tax invoices updated' : 'บันทึกการแก้ไขใบกำกับภาษีแล้ว', () => { setEditingTaxEntries(false) })
  }

  const handleSettleAdvance = async () => {
    const cleanItems = spentItems
      .map(it => ({ description: it.description.trim(), amount: Number(it.amount) || 0 }))
      .filter(it => it.amount > 0)
    if (cleanItems.length === 0) {
      fail('settleAdvance', isEn ? 'Please add at least one expense item.' : 'กรุณาเพิ่มรายการค่าใช้จ่ายอย่างน้อย 1 รายการ')
      return
    }
    await run('settleAdvance', async () => {
      const formData = new FormData()
      formData.append('actual_spent_items', JSON.stringify(cleanItems))
      appendFilePairs(formData, 'actual_receipt_files', 'actual_receipt_thumbs', await withThumbs(actualReceiptFiles))
      appendFilePairs(formData, 'refund_slip_files', 'refund_slip_thumbs', await withThumbs(refundSlipFiles))
      return settleAdvanceClaim(claim.id, formData)
    }, isEn ? 'Actual spending saved' : 'บันทึกค่าใช้จ่ายจริงแล้ว', () => {
      setActualReceiptFiles([])
      setRefundSlipFiles([])
      setItemsEditMode(false)
    })
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
    if (!qaTitle.trim()) { fail('pettyExpense', isEn ? 'Enter the expense description.' : 'กรุณากรอกรายการค่าใช้จ่าย'); return }
    if (!(Number(qaAmount) > 0)) { fail('pettyExpense', isEn ? 'Enter a valid amount.' : 'กรุณากรอกจำนวนเงินให้ถูกต้อง'); return }
    await run('pettyExpense', async () => {
      const fd = new FormData()
      fd.append('title', qaTitle.trim())
      fd.append('category', qaCategory)
      fd.append('amount', qaAmount)
      fd.append('expense_date', qaDate)
      for (const f of qaFiles) {
        const compressed = f.type.startsWith('image/') ? await compressImage(f) : f
        fd.append('receipt_files', compressed)
      }
      return addPettyCashExpense(claim.id, fd)
    }, isEn ? 'Expense saved' : 'บันทึกรายจ่ายแล้ว', res => {
      setQaTitle('')
      setQaAmount('')
      setQaFiles([])
      if ((res.balance ?? 0) < 0) {
        // บันทึกสำเร็จแล้ว — แค่เตือนว่าเงินในกล่องติดลบ
        const warning = isEn
          ? `Saved — but the box balance is now negative (฿${fmtDec(res.balance ?? 0)}). Request a top-up.`
          : `บันทึกแล้ว — แต่เงินในกล่องติดลบ (฿${fmtDec(res.balance ?? 0)}) กรุณาเบิกเพิ่ม`
        setActionError({ key: 'pettyExpense', message: warning })
        toast.warning(warning)
      }
    })
  }

  const claimTypeShort = (t: string) =>
    t === 'event' ? (isEn ? 'Event' : 'อีเวนต์')
    : t === 'advance' ? (isEn ? 'Advance' : 'ทดลองจ่าย')
    : (isEn ? 'Other' : 'อื่นๆ')

  // Pull an approved claim into the fund (admin) — pays it from the box
  const handleLinkClaim = async () => {
    if (!linkClaimId) return
    await run('linkClaim', () => linkClaimToPettyCash(claim.id, linkClaimId), isEn ? 'Claim pulled into the fund' : 'ดึงใบเบิกเข้าวงเงินแล้ว', res => {
      if (res.warning) {
        // link succeeded — date-outside-month notice only
        setActionError({ key: 'linkClaim', message: res.warning })
        toast.warning(res.warning)
      }
      setLinkClaimId('')
    })
  }

  // Undo a pull (admin, month still open) — claim returns to the payout queue
  const handleUnlinkClaim = async () => {
    const ok = await askConfirm({
      title: isEn ? 'Unlink this claim from the petty cash fund?' : 'ยกเลิกการดึงใบเบิกนี้ออกจากวงเงินสดย่อย?',
      description: isEn
        ? 'It returns to the payout queue as approved.'
        : 'ใบเบิกจะกลับเข้าคิวจ่ายเงิน (สถานะอนุมัติแล้ว)',
      details: claimContextDetails,
      variant: 'destructive',
      confirmLabel: isEn ? 'Unlink' : 'ยกเลิกการดึง',
      cancelLabel: isEn ? 'Keep' : 'ไม่ยกเลิก',
    })
    if (!ok) return
    await run('unlinkClaim', () => unlinkClaimFromPettyCash(claim.id), isEn ? 'Unlinked — back in the payout queue' : 'ยกเลิกการดึงแล้ว — ใบเบิกกลับเข้าคิวจ่ายเงิน')
  }

  // Request a mid-month top-up (fund owner or admin) → normal approve→pay flow
  const handleCreateTopup = async () => {
    if (!(Number(tuAmount) > 0)) { fail('createTopup', isEn ? 'Enter a valid top-up amount.' : 'กรุณากรอกจำนวนเงินให้ถูกต้อง'); return }
    await run('createTopup', () => {
      const fd = new FormData()
      fd.append('amount', tuAmount)
      fd.append('note', tuNote.trim())
      return createPettyCashTopup(claim.id, fd)
    }, isEn ? 'Top-up requested — awaiting approval' : 'ส่งขอเบิกเพิ่มแล้ว — รออนุมัติ', () => {
      setTuAmount('')
      setTuNote('')
      setShowTopupForm(false)
    })
  }

  // Close the month: leftover returned to the company (slip required when > 0)
  const handleCloseMonth = async () => {
    if (pettyTopupPending > 0) {
      fail('closeMonth', isEn
        ? 'There are unresolved top-up requests — pay or cancel them before closing.'
        : 'มีรายการเติมเงินค้างดำเนินการ — อนุมัติ/จ่าย หรือยกเลิกให้เรียบร้อยก่อนปิดเดือน')
      return
    }
    if (pettyBalance > 0 && refundSlipFiles.length === 0 && (claim.refund_slip_urls?.length ?? 0) === 0) {
      fail('closeMonth', isEn
        ? `Attach the return transfer slip (฿${fmtDec(pettyBalance)}) before closing.`
        : `กรุณาแนบสลิปโอนเงินคืนบริษัท ฿${fmtDec(pettyBalance)} ก่อนปิดเดือน`)
      return
    }
    const ok = await askConfirm({
      title: isEn ? 'Close this month?' : 'ปิดวงเงินเดือนนี้?',
      description: isEn
        ? 'Locks the fund — no more expenses or top-ups. The leftover is recorded as returned to the company and awaits admin confirmation.'
        : 'จะล็อกวงเงิน (เพิ่มรายจ่าย/เติมเงินไม่ได้อีก) และบันทึกยอดคงเหลือเป็นเงินคืนบริษัท รอ admin ยืนยันรับเงิน',
      details: [
        ...claimContextDetails,
        { label: isEn ? 'Return to company' : 'คืนบริษัท', value: `฿${fmtDec(pettyBalance)}` },
      ],
      variant: 'warning',
      confirmLabel: isEn ? 'Close month' : 'ปิดเดือน',
      cancelLabel: isEn ? 'Not yet' : 'ยังไม่ปิด',
    })
    if (!ok) return
    await run('closeMonth', async () => {
      const fd = new FormData()
      appendFilePairs(fd, 'refund_slip_files', 'refund_slip_thumbs', await withThumbs(refundSlipFiles))
      return closePettyCashMonth(claim.id, fd)
    }, isEn ? 'Month closed' : 'ปิดเดือนแล้ว', () => { setRefundSlipFiles([]) })
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
    await run('reopenMonth', () => reopenPettyCashMonth(claim.id), isEn ? 'Month reopened' : 'เปิดรอบเดือนอีกครั้งแล้ว')
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
    await run('confirmRefund', () => confirmRefundReceived(claim.id), isEn ? 'Refund confirmed' : 'ยืนยันรับเงินคืนแล้ว')
  }

  const handleAdminOverride = async () => {
    if (!overrideStatus) return
    if (needsReason && !overrideReason.trim()) {
      fail('override', overridePayLocked
        ? (isEn ? 'Documents are incomplete — enter a reason to pay anyway.' : 'เอกสารไม่ครบ — ต้องระบุเหตุผลจึงจะจ่ายได้')
        : (isEn ? 'Please enter a reason — moving back or closing a paid claim needs one.' : 'กรุณาระบุเหตุผล — ถอยสถานะ / ยกเลิกใบที่จ่ายแล้ว ต้องระบุเหตุผล'))
      return
    }
    await run('override', () => adminOverrideStatus(claim.id, overrideStatus, overrideReason), isEn ? 'Status changed' : 'เปลี่ยนสถานะแล้ว', () => {
      setOverrideStatus('')
      setOverrideReason('')
    })
  }

  const handleSaveEdit = async () => {
    if (editNeedsReason && !editReason.trim()) { fail('saveEdit', isEn ? 'Please give a reason for editing a paid claim.' : 'กรุณาระบุเหตุผลในการแก้ไขใบเบิกที่จ่ายเงินแล้ว'); return }
    await run('saveEdit', async () => {
      let receiptFormData: FormData | undefined
      if (editReceiptFiles.length > 0) {
        receiptFormData = new FormData()
        // Compress images before uploading to avoid body size limit on mobile · + รูปย่อตำแหน่งตรงกัน (receipt_thumbs)
        appendFilePairs(receiptFormData, 'receipt_files', 'receipt_thumbs', await withThumbs(editReceiptFiles))
      }
      return updateClaim(claim.id, {
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
        reason: editReason,
      }, receiptFormData)
    }, isEn ? 'Changes saved' : 'บันทึกการแก้ไขแล้ว', () => {
      setEditing(false)
      setEditReceiptFiles([])
      setEditReason('')
    })
  }

  const handleRemoveReceiptFile = async (url: string) => {
    const ok = await askConfirm({
      title: isEn ? 'Delete this file?' : 'ลบไฟล์นี้?',
      description: isEn ? 'This cannot be undone.' : 'ลบแล้วกู้คืนไม่ได้',
      variant: 'destructive',
      confirmLabel: isEn ? 'Delete file' : 'ลบไฟล์',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    await run(`removeReceipt:${url}`, () => removeReceiptFile(claim.id, url), isEn ? 'File deleted' : 'ลบไฟล์แล้ว')
  }

  // ใบที่ถูกปฏิเสธ: เจ้าของเปิดกลับเป็นแบบร่าง แก้แล้วยื่นใหม่
  const handleReopen = async () => {
    if (!(isOwner && claim.status === 'rejected')) return
    const ok = await askConfirm({
      title: isEn ? 'Reopen this claim for editing?' : 'เปิดใบเบิกนี้กลับมาแก้ไข?',
      description: isEn ? 'It goes back to draft — edit it, then submit again.' : 'ใบจะกลับเป็นแบบร่าง แก้ไขแล้วกดยื่นอีกครั้ง',
      details: claimContextDetails,
      confirmLabel: isEn ? 'Reopen as draft' : 'เปิดกลับมาแก้ไข',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    await run('reopen', () => reopenRejectedClaim(claim.id), isEn ? 'Back to draft — edit it, then submit again' : 'เปิดกลับเป็นแบบร่างแล้ว — แก้ไขแล้วกดยื่นใหม่')
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setEditReason('')
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
      {bundleOpen && (
        <BundleDialog
          claims={[{
            id: claim.id,
            claim_number: claim.claim_number,
            title: claim.title,
            incomplete: !getClaimChecklist(claim).isComplete,
            fileCount: claimFileCount(claim),
          }]}
          isAdmin={isAdmin}
          isEn={isEn}
          onClose={() => setBundleOpen(false)}
          onFiled={() => router.refresh()}
        />
      )}
      {canSendBack && (
        <SendBackDialog
          open={sendBackOpen}
          claim={{ claim_number: claim.claim_number, title: claim.title }}
          busy={busy === 'sendBack'}
          isEn={isEn}
          onCancel={() => setSendBackOpen(false)}
          onConfirm={handleSendBack}
        />
      )}
      {/* Header */}
      <div className={`flex items-center justify-between gap-2 ${filed !== 'none' || isAdmin ? 'mb-3' : 'mb-6'}`}>
        <button onClick={() => router.push(financeListHref())} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400">
          <ArrowLeft className="h-4 w-4" />
          {isEn ? 'Back' : 'กลับ'}
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEdit && !editing && !isHidden && (
            <button onClick={startEditing} className="flex items-center gap-1.5 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-lg transition-colors">
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
          <button
            onClick={() => setBundleOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/20 rounded-lg transition-colors"
          >
            <FileStack className="h-4 w-4" />
            {isEn ? 'Bundle documents' : 'จับชุดเอกสาร'}
          </button>
          {canHide && (
            <button
              type="button"
              onClick={handleHide}
              disabled={busy !== null}
              className="flex items-center gap-1.5 min-h-10 px-3 py-2 text-sm text-zinc-600 hover:text-red-700 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-950/20 disabled:opacity-50 rounded-lg transition-colors"
            >
              <EyeOff className="h-4 w-4" />
              {busy === 'hide' ? '...' : (isEn ? 'Hide claim' : 'ซ่อนใบเบิก')}
            </button>
          )}
        </div>
      </div>

      {/* สถานะเข้าแฟ้ม — ไม่แสดงเมื่อยังไม่เข้าแฟ้ม (แอดมินเห็นปุ่มทำเครื่องหมาย) */}
      {(filed !== 'none' || isAdmin) && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {filed !== 'none' && claim.filed_at && (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
              <FolderCheck className="h-3.5 w-3.5 shrink-0" />
              {isEn ? 'Filed on ' : 'เข้าแฟ้มแล้ว เมื่อ '}
              {/* ระบุเขตเวลา — server กับ browser ต้องได้ข้อความเดียวกัน */}
              {new Date(claim.filed_at).toLocaleDateString(isEn ? 'en-GB' : 'th-TH', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok',
              })}
            </span>
          )}
          {filed === 'changed' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {isEn ? 'Attachments changed after filing — reprint recommended' : 'ไฟล์แนบเปลี่ยนหลังเข้าแฟ้ม — ควรพิมพ์ใหม่'}
            </span>
          )}
          {isAdmin && filed !== 'filed' && (
            <button
              onClick={() => handleFiled(true)}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <FolderCheck className="h-3.5 w-3.5" />
              {busy === 'filed' ? '...' : (isEn ? 'Mark as filed' : 'ทำเครื่องหมายว่าเข้าแฟ้มแล้ว')}
            </button>
          )}
          {isAdmin && filed !== 'none' && (
            <button
              onClick={() => handleFiled(false)}
              disabled={busy !== null}
              className="rounded-lg px-2.5 py-1 font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {busy === 'filed' ? '...' : (isEn ? 'Remove mark' : 'ยกเลิกเครื่องหมาย')}
            </button>
          )}
          {/* ข้อผิดพลาดของปุ่มซ่อนใบเบิก (หัวหน้า) และปุ่มเข้าแฟ้ม */}
          {actionError && ['hide', 'filed'].includes(actionError.key) && (
            <div className="basis-full">
              <ActionError k={['hide', 'filed']} error={actionError} />
            </div>
          )}
        </div>
      )}

      {/* ใบที่ซ่อนไว้ — แอดมินเท่านั้นที่เปิดหน้านี้ได้ กู้คืนแล้วใบกลับเข้ารายการ/คิวตามสถานะเดิม */}
      {isHidden && (
        <div role="status" className="mb-4 rounded-xl border border-zinc-300 bg-zinc-100 p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
          <div className="flex flex-wrap items-center gap-3">
            <EyeOff className="h-5 w-5 shrink-0 text-zinc-600 dark:text-zinc-300" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {isEn ? 'This claim is hidden' : 'ใบเบิกนี้ถูกซ่อนไว้'}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {isEn
                  ? `Hidden on ${new Date(claim.deleted_at as string).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' })} — not shown in any list or queue. Restore it to edit or change its status.`
                  : `ซ่อนเมื่อ ${new Date(claim.deleted_at as string).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Bangkok' })} — ไม่แสดงในรายการและคิว กู้คืนก่อนจึงแก้ไขหรือเปลี่ยนสถานะได้`}
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={handleRestore}
                disabled={busy !== null}
                className="flex items-center justify-center gap-2 min-h-10 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <ArchiveRestore className="h-4 w-4" />
                {busy === 'restore' ? '...' : (isEn ? 'Restore' : 'กู้คืน')}
              </button>
            )}
          </div>
          <ActionError k="restore" error={actionError} className="mt-3" />
        </div>
      )}

      {/* ส่งกลับให้แก้ — สิ่งที่แอดมินขอให้แก้ อยู่บนสุดให้ผู้เบิกเห็นก่อน แก้แล้วกด "ยื่นใบเบิก" ด้านล่าง */}
      {sentBackReason && (
        <div role="note" className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <Undo2 className="h-5 w-5 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm text-amber-900 dark:text-amber-100 break-words">
              <span className="font-semibold">{isEn ? 'Sent back for changes:' : 'ส่งกลับให้แก้:'}</span>{' '}
              {sentBackReason}
            </p>
            {isOwner && (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                {isEn ? 'Fix the claim, then press “Submit Claim” below.' : 'แก้ไขใบเบิกแล้วกด “ยื่นใบเบิก” ด้านล่าง'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Document Checklist Panel — pre-accounting handover */}
      {(() => {
        const ck = getClaimChecklist(claim)
        const items: { key: string; labelTh: string; labelEn: string; done: boolean; required: boolean; note?: string; chips?: string[] }[] = [
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
          <div className="text-right shrink-0">
            <span className="text-sm font-mono text-zinc-500 whitespace-nowrap">{claim.claim_number}</span>
            {/* ใบที่ถูกเปลี่ยนเลขเพราะเลขซ้ำ — เอกสารที่พิมพ์ไปแล้วยังเป็นเลขเดิม */}
            {claim.original_claim_number && (
              <span className="block text-xs font-mono text-zinc-400 whitespace-nowrap">
                {isEn ? 'Previously' : 'เลขเดิม'} {claim.original_claim_number}
              </span>
            )}
          </div>
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
                {/* รายชื่องานโหลดตอนกดแก้ไข — ระหว่างรอ/โหลดไม่สำเร็จ งานเดิมของใบยังอยู่ (ไม่ถูกล้าง) */}
                {editClaimType === 'event' && jobEvents === null && (
                  jobEventsState === 'error' ? (
                    <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-700 dark:text-red-400">
                      <span>{isEn ? 'Could not load the event list' : 'โหลดรายชื่องานไม่สำเร็จ'}</span>
                      <Button type="button" variant="outline" size="lg" onClick={startEditing}>
                        {isEn ? 'Try again' : 'ลองใหม่'}
                      </Button>
                    </div>
                  ) : (
                    <p aria-live="polite" className="text-xs text-zinc-600 dark:text-zinc-400">
                      {isEn ? 'Loading events…' : 'กำลังโหลดรายชื่องาน…'}
                    </p>
                  )
                )}
                {editClaimType === 'event' && jobEvents && jobEvents.length > 0 && (
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
                {claim.receipt_urls && claim.receipt_urls.length > 0 && (
                  <div className="mb-2 space-y-1.5">
                    {claim.receipt_urls.map((url, i) => (
                      <div key={url} className="space-y-1.5">
                        <div className="flex items-center justify-between px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded text-xs">
                          <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 hover:underline">
                            {isEn ? 'File' : 'ไฟล์'} {i + 1} — {decodeURIComponent(url.split('/').pop() || '')}
                          </a>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => handleRemoveReceiptFile(url)}
                            className="text-zinc-400 hover:text-red-500 ml-2 shrink-0 disabled:opacity-50"
                            title={isEn ? 'Delete file' : 'ลบไฟล์'}
                            aria-label={isEn ? 'Delete file' : 'ลบไฟล์'}
                          >
                            {busy === `removeReceipt:${url}` ? '...' : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <ActionError k={`removeReceipt:${url}`} error={actionError} />
                      </div>
                    ))}
                  </div>
                )}
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

              {/* ใบที่จ่ายเงินแล้ว: ต้องบอกเหตุผลที่แก้ (ลงประวัติ) */}
              {editNeedsReason && (
                <div>
                  <label htmlFor="edit-reason" className="text-xs font-medium text-zinc-500 mb-1 block">
                    {isEn ? 'Reason for editing (this claim is already paid)' : 'เหตุผลที่แก้ไข (ใบนี้จ่ายเงินแล้ว)'} *
                  </label>
                  <input
                    id="edit-reason"
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    required
                    placeholder={isEn ? 'e.g. Typo in the title' : 'เช่น พิมพ์ชื่อรายการผิด'}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-base sm:text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2">
                  <button onClick={handleSaveEdit} disabled={busy !== null || !editTitle || (editNeedsReason && !editReason.trim())} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                    <Save className="h-4 w-4" />
                    {busy === 'saveEdit' ? '...' : (isEn ? 'Save' : 'บันทึก')}
                  </button>
                  <button onClick={handleCancelEdit} className="flex items-center gap-1.5 px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-sm transition-colors">
                    <X className="h-4 w-4" />
                    {isEn ? 'Cancel' : 'ยกเลิก'}
                  </button>
                </div>
                <ActionError k="saveEdit" error={actionError} />
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

              {/* Reject Reason — เจ้าของใบเปิดกลับเป็นแบบร่างได้จากตรงนี้ (แผงทำงานถูกซ่อนสำหรับผู้ใช้ทั่วไปเมื่อถูกปฏิเสธ) */}
              {claim.status === 'rejected' && (
                <div className="text-sm p-3 bg-red-50 dark:bg-red-950/20 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-red-600 font-medium">{isEn ? 'Rejection reason:' : 'เหตุผลที่ปฏิเสธ:'}</p>
                      <p className="text-red-500 break-words">{claim.reject_reason || (isEn ? 'No reason given' : 'ไม่ระบุเหตุผล')}</p>
                    </div>
                  </div>
                  {isOwner && claim.status === 'rejected' && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleReopen}
                          disabled={busy !== null}
                          className="flex items-center justify-center gap-2 min-h-11 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          <RefreshCw className="h-4 w-4" />
                          {busy === 'reopen' ? '...' : (isEn ? 'Fix & resubmit' : 'แก้ไขแล้วยื่นใหม่')}
                        </button>
                        <p className="text-xs text-red-600/80 dark:text-red-400/80">
                          {isEn ? 'Reopens as a draft so you can edit and submit again.' : 'เปิดกลับเป็นแบบร่าง แก้ไขแล้วกดยื่นอีกครั้ง'}
                        </p>
                      </div>
                      <ActionError k="reopen" error={actionError} />
                    </div>
                  )}
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
                            <ReceiptThumb
                              url={url}
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
                        disabled={busy !== null}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {busy === 'confirmRefund' ? '...' : (isEn ? 'Confirm Received' : 'ยืนยันรับเงิน')}
                      </button>
                    </div>
                  )}
                  {canConfirmRefund && <ActionError k="confirmRefund" error={actionError} className="mt-2" />}
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
                            <ReceiptThumb url={url} alt={`${isEn ? 'Actual receipt' : 'หลักฐานการจ่ายจริง'} ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
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
                            <ReceiptThumb url={url} alt={`${isEn ? 'Refund slip' : 'สลิปเงินคืน'} ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
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
                                    <ReceiptThumb
                                      url={url}
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
                            disabled={busy !== null}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-md font-semibold"
                          >
                            <Save className="h-3 w-3" />
                            {busy === 'saveTaxEntries' ? '...' : (isEn ? 'Save' : 'บันทึก')}
                          </button>
                          <button
                            onClick={() => { setEditingTaxEntries(false); setEditTaxEntries(buildExistingEntries()) }}
                            className="px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md"
                          >
                            {isEn ? 'Cancel' : 'ยกเลิก'}
                          </button>
                        </div>
                        <ActionError k="saveTaxEntries" error={actionError} />
                      </div>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </div>

        {/* ===== Workflow Action Bar ===== */}
        {/* Owners of advance claims can still settle after the advance is paid out;
            ผู้ถือวงเงินสดย่อยใช้แผงวงเงินได้ขณะวงเงิน "จ่ายแล้ว" — ปุ่มของแอดมินข้างในมีเงื่อนไขของตัวเอง */}
        {/* ใบที่ซ่อนไว้ไม่มีแผงทำงาน — กู้คืนจากแถบด้านบนก่อน */}
        {!isHidden && canSeeWorkPanel({ editing, status: claim.status, isAdmin, canSettleAdvance, canManagePettyFund }) && (
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 print:hidden space-y-3">

            {/* ── Owner: Submit draft ── */}
            {canSubmit && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-xs text-zinc-500">
                    {receiptRequiredForSubmit(claim.claim_type)
                      ? (isEn
                          ? 'Attach at least one receipt, then submit for approval.'
                          : 'แนบเอกสารอย่างน้อย 1 ไฟล์ก่อนยื่นขออนุมัติ')
                      : (isEn
                          ? 'You can submit now — attach receipts later when you settle.'
                          : 'ยื่นขออนุมัติได้เลย ใบเสร็จแนบทีหลังตอนเคลียร์')}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={busy !== null || (receiptRequiredForSubmit(claim.claim_type) && (claim.receipt_urls || []).length === 0)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Send className="h-4 w-4" />
                    {busy === 'submit' ? '...' : (isEn ? 'Submit Claim' : 'ยื่นใบเบิก')}
                  </button>
                </div>
                <ActionError k="submit" error={actionError} />
              </div>
            )}

            {/* ── Owner: Cancel (draft or pending) ── */}
            {canCancel && (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <button
                    onClick={handleCancel}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    <Ban className="h-4 w-4" />
                    {busy === 'cancel' ? '...' : (isEn ? 'Cancel Claim' : 'ยกเลิกใบเบิก')}
                  </button>
                </div>
                <ActionError k="cancel" error={actionError} />
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
                      disabled={busy !== null}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {busy === 'approve' ? '...' : (isEn ? 'Approve' : 'อนุมัติ')}
                    </button>
                    <button
                      onClick={handleApproveAsMonthEnd}
                      disabled={busy !== null}
                      className="flex items-center gap-2 px-4 py-2.5 border-2 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Clock className="h-4 w-4" />
                      {busy === 'approveMonthEnd' ? '...' : (isEn ? 'Approve — Month End' : 'อนุมัติ — สิ้นเดือน')}
                    </button>
                    {canSendBack && (
                      <button
                        type="button"
                        onClick={() => setSendBackOpen(true)}
                        disabled={busy !== null}
                        className="flex items-center gap-2 min-h-10 px-4 py-2.5 border-2 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                      >
                        <Undo2 className="h-4 w-4" />
                        {busy === 'sendBack' ? '...' : (isEn ? 'Send back for changes' : 'ส่งกลับให้แก้')}
                      </button>
                    )}
                    <button
                      onClick={() => setRejectOpen(true)}
                      disabled={busy !== null}
                      className="ml-auto flex items-center gap-2 px-4 py-2.5 border-2 border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <XCircle className="h-4 w-4" />
                      {isEn ? 'Reject' : 'ปฏิเสธ'}
                    </button>
                  </div>
                  <ActionError k={['approve', 'approveMonthEnd', 'reject', 'sendBack']} error={actionError} />
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
                      disabled={busy !== null}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      {busy === 'reject' ? '...' : (isEn ? 'Confirm Reject' : 'ยืนยันปฏิเสธ')}
                    </button>
                    <button
                      onClick={() => { setRejectOpen(false); setRejectReason('') }}
                      className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-sm"
                    >
                      {isEn ? 'Back' : 'ยกเลิก'}
                    </button>
                  </div>
                  <ActionError k={['approve', 'approveMonthEnd', 'reject']} error={actionError} />
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
                  {/* ล็อกการจ่าย: เอกสารไม่ครบ = ปุ่มปิด พร้อมบอกว่าขาดอะไร (จ่ายจริงได้ทางบังคับเปลี่ยนสถานะ + เหตุผล) */}
                  <button
                    onClick={handleMarkPaid}
                    disabled={busy !== null || payLock.locked}
                    title={payLock.locked ? payLock.message : undefined}
                    aria-describedby={payLock.locked ? 'pay-lock-message' : undefined}
                    className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
                  >
                    {payLock.locked ? <Lock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    {busy === 'markPaid' ? '...' : (isEn ? 'Mark as Paid' : 'ชำระเงินแล้ว')}
                  </button>
                  {(isApproved || isWaitingTaxInvoice) && (
                    <button
                      onClick={handleDeferMonthEnd}
                      disabled={busy !== null}
                      className="flex items-center gap-2 px-4 py-2.5 border-2 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Clock className="h-4 w-4" />
                      {busy === 'deferMonthEnd' ? '...' : (isEn ? 'Defer to Month End' : 'เลื่อนสิ้นเดือน')}
                    </button>
                  )}
                  {isApproved && (
                    <button
                      onClick={handleMarkWaitingTaxInvoice}
                      disabled={busy !== null}
                      className="flex items-center gap-2 px-4 py-2.5 border-2 border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Receipt className="h-4 w-4" />
                      {busy === 'waitingTaxInvoice' ? '...' : (isEn ? 'Request Tax Invoice' : 'ขอใบกำกับภาษี')}
                    </button>
                  )}
                  {canSendBack && (
                    <button
                      type="button"
                      onClick={() => setSendBackOpen(true)}
                      disabled={busy !== null}
                      className="flex items-center gap-2 min-h-10 px-4 py-2.5 border-2 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Undo2 className="h-4 w-4" />
                      {busy === 'sendBack' ? '...' : (isEn ? 'Send back for changes' : 'ส่งกลับให้แก้')}
                    </button>
                  )}
                </div>
                {payLock.locked && (
                  <p id="pay-lock-message" className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                    <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      {payLock.message}
                      {' · '}
                      {isEn ? 'Attach the missing documents, or use the admin override with a reason.' : 'แนบเอกสารให้ครบ หรือใช้การบังคับเปลี่ยนสถานะพร้อมเหตุผล'}
                    </span>
                  </p>
                )}
                <ActionError k={['markPaid', 'deferMonthEnd', 'waitingTaxInvoice', 'sendBack']} error={actionError} />
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
                    disabled={busy !== null || taxInvoiceRows.every(r => !r.file && !r.number.trim())}
                    className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {busy === 'uploadTaxInvoice'
                      ? '...'
                      : (isEn ? 'Save All Invoices' : 'บันทึกใบกำกับภาษี')}
                  </button>
                </div>
                <ActionError k="uploadTaxInvoice" error={actionError} />
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
                    disabled={busy !== null || spentItemsTotal <= 0}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    {busy === 'settleAdvance' ? '...' : (isEn ? 'Save Settlement' : 'บันทึกการอัพเดท')}
                  </button>
                  <p className="text-[11px] text-zinc-400">
                    {isEn
                      ? 'Multiple updates allowed — each save appends to history.'
                      : 'อัพเดทได้หลายครั้ง — แต่ละครั้งจะถูกบันทึกในประวัติ'}
                  </p>
                </div>
                <ActionError k="settleAdvance" error={actionError} />
              </div>
            )}

            {/* ── Petty cash child banner (top-up / box expense) ── */}
            {(isPettyTopup || isPettyExpense) && (
              <div className="flex items-start gap-2 p-3 bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl">
                <Coins className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                <div className="text-xs text-orange-800 dark:text-orange-200 space-y-0.5">
                  <p className="font-semibold">
                    {isPettyTopup
                      ? (isEn ? 'Top-up into the petty cash fund' : 'รายการเติมเงินเข้าวงเงินสดย่อย')
                      : (isEn ? 'Expense paid from the petty cash box' : 'ค่าใช้จ่ายที่จ่ายจากกล่องเงินสดย่อย')}
                  </p>
                  {isPettyExpense && claim.claim_type === 'advance' && (
                    <p>
                      {isEn
                        ? 'Settlement leftover returns to the petty cash box (not the company account).'
                        : 'เงินคืนจากการเคลียร์ทดลองจ่ายจะกลับเข้ากล่องเงินสดย่อย (ไม่ใช่บัญชีบริษัท)'}
                    </p>
                  )}
                  <Link href={`/finance/${claim.pettycash_fund_id}`} className="inline-flex items-center gap-1 underline">
                    {isEn ? 'Open the fund page' : 'ไปที่หน้าวงเงิน'} →
                  </Link>
                  {/* Unlink — only claims that went through approval (pulled in), not box-logged ones */}
                  {isPettyExpense && isAdmin && !!(claim as any).approved_by && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleUnlinkClaim}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-950/40 rounded-md transition-colors disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        {busy === 'unlinkClaim' ? '...' : (isEn ? 'Unlink from fund (back to payout queue)' : 'ยกเลิกการดึง — คืนใบเบิกเข้าคิวจ่ายเงิน')}
                      </button>
                      <ActionError k="unlinkClaim" error={actionError} className="mt-1.5" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Petty Cash Fund (วงเงินสดย่อยประจำเดือน) ── */}
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
                        {isEn ? 'Monthly Petty Cash Fund' : 'วงเงินสดย่อยประจำเดือน'}
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
                    {isEn ? 'View previous month fund' : 'ดูวงเงินเดือนก่อนหน้า'} →
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
                        disabled={busy !== null}
                        className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {busy === 'pettyExpense' ? '...' : (isEn ? 'Save Expense' : 'บันทึกรายจ่าย')}
                      </button>
                    </div>
                    <ActionError k="pettyExpense" error={actionError} />
                    <p className="text-[10px] text-zinc-400">
                      {isEn
                        ? 'Saved as a paid claim immediately — the cash already left the box. Admin audits at month close.'
                        : 'บันทึกเป็นใบเบิกสถานะ "จ่ายแล้ว" ทันที (เงินสดออกจากกล่องแล้วจริง) — admin ตรวจสอบตอนปิดเดือน'}
                    </p>
                  </div>
                )}

                {/* Pull an approved claim into the fund (ดึงใบเบิกเข้าวงเงิน) — admin only */}
                {pettyFundOpen && isAdmin && (
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 text-orange-500" />
                      {isEn ? 'Pull a claim into the fund (pay from the box)' : 'ดึงใบเบิกเข้าวงเงิน (จ่ายจากกล่อง)'}
                    </p>
                    {(linkableClaims?.length ?? 0) === 0 ? (
                      <p className="text-[11px] text-zinc-400">
                        {isEn ? 'No approved claims awaiting payment.' : 'ไม่มีใบเบิกที่อนุมัติแล้วรอจ่ายเงิน'}
                      </p>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={linkClaimId}
                          onChange={e => setLinkClaimId(e.target.value)}
                          className="flex-1 min-w-0 px-2.5 py-2 border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                        >
                          <option value="">{isEn ? '— Select a claim —' : '— เลือกใบเบิก —'}</option>
                          {(linkableClaims || []).map(c => (
                            <option key={c.id} value={c.id}>
                              {c.claim_number} · {claimTypeShort(c.claim_type)} · {c.title} · ฿{fmtDec(Number(c.amount) || 0)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleLinkClaim}
                          disabled={busy !== null || !linkClaimId}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {busy === 'linkClaim' ? '...' : (isEn ? 'Pull into fund' : 'ดึงเข้าวงเงิน')}
                        </button>
                      </div>
                    )}
                    <ActionError k="linkClaim" error={actionError} />
                    <p className="text-[10px] text-zinc-400">
                      {isEn
                        ? 'The claim becomes "paid" and its amount is deducted from the box — blocked if the box balance can\'t cover it.'
                        : 'ใบเบิกจะเปลี่ยนเป็น "จ่ายแล้ว" และยอดถูกหักจากเงินในกล่อง — ดึงไม่ได้ถ้าเงินในกล่องไม่พอ'}
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
                                {e.claim_type !== 'other' && (
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 shrink-0">{claimTypeShort(e.claim_type)}</span>
                                )}
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
                        {isEn ? 'Top-ups' : 'เติมเงินเข้าวงเงิน'}
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
                            disabled={busy !== null}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
                          >
                            <Send className="h-3.5 w-3.5" />
                            {busy === 'createTopup' ? '...' : (isEn ? 'Submit for approval' : 'ส่งขออนุมัติ')}
                          </button>
                          <p className="text-[10px] text-zinc-400">
                            {isEn ? 'Goes through approve → pay like a normal claim.' : 'เข้าคิวอนุมัติ → จ่ายเงิน เหมือนใบเบิกปกติ'}
                          </p>
                        </div>
                        <ActionError k="createTopup" error={actionError} />
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
                      disabled={busy !== null || pettyTopupPending > 0 || (pettyBalance > 0 && refundSlipFiles.length === 0 && (claim.refund_slip_urls?.length ?? 0) === 0)}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      <Lock className="h-4 w-4" />
                      {busy === 'closeMonth' ? '...' : (isEn ? 'Close Month & Return' : 'ปิดเดือน + คืนเงิน')}
                    </button>
                    <ActionError k="closeMonth" error={actionError} />
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
                          disabled={busy !== null}
                          className="mt-2 flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700 hover:bg-cyan-100 dark:hover:bg-cyan-950/40 disabled:opacity-50 rounded-md transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {busy === 'reopenMonth' ? '...' : (isEn ? 'Reopen month (admin)' : 'เปิดรอบอีกครั้ง เพื่อแก้ไข (admin)')}
                        </button>
                      )}
                      <ActionError k="reopenMonth" error={actionError} className="mt-2" />
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
                      disabled={busy !== null}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shrink-0"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {busy === 'confirmRefund' ? '...' : (isEn ? 'Confirm received' : 'ยืนยันรับเงินแล้ว')}
                    </button>
                  </div>
                )}
                {canConfirmRefund && isPettyFund && <ActionError k="confirmRefund" error={actionError} />}

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
                              : <ReceiptThumb url={url} alt={`${isEn ? 'return slip' : 'สลิปคืน'} ${i + 1}`} className="w-full h-full object-cover" />}
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
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {isEn ? 'Admin: Override Status' : 'Admin: บังคับเปลี่ยนสถานะ'}
                  {/* งานปกติ (อนุมัติ จ่าย ขอใบกำกับ เลื่อนสิ้นเดือน ส่งกลับให้แก้) มีปุ่มของตัวเองด้านบนแล้ว */}
                  <span className="font-normal text-zinc-500 dark:text-zinc-400">
                    {isEn ? '— for correcting mistakes; use the buttons above for normal steps' : '— ใช้แก้ข้อผิดพลาด งานปกติใช้ปุ่มด้านบน'}
                  </span>
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

                  {/* Reason input — จำเป็นเฉพาะตอนถอยสถานะ / ปิดใบที่จ่ายแล้ว */}
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    placeholder={needsReason
                      ? (isEn ? 'Reason (required)' : 'เหตุผล (จำเป็น)')
                      : (isEn ? 'Reason (optional)' : 'เหตุผล (ไม่บังคับ)')}
                    className="flex-1 min-w-40 px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                  />

                  {/* Confirm */}
                  <button
                    onClick={handleAdminOverride}
                    disabled={busy !== null || !overrideStatus || (needsReason && !overrideReason.trim())}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {busy === 'override' ? '...' : (isEn ? 'Confirm' : 'ยืนยัน')}
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
                {overridePayLocked ? (
                  <p className="flex items-start gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                    <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      {isEn ? 'Documents are incomplete — a reason is required to pay.' : 'เอกสารไม่ครบ — ต้องระบุเหตุผลจึงจะจ่ายได้'}
                      {' '}({payLock.missing.join(', ')})
                    </span>
                  </p>
                ) : overrideStatus && (
                  <p className="text-[11px] text-zinc-500">
                    {needsReason
                      ? (isEn ? 'Moving back / cancelling a paid claim needs a reason' : 'ถอยสถานะ / ยกเลิกใบที่จ่ายแล้ว ต้องระบุเหตุผล')
                      : (isEn ? 'Moving forward in the workflow — no reason needed' : 'เดินหน้าตามขั้นตอน ไม่ต้องระบุเหตุผล')}
                  </p>
                )}
                <ActionError k="override" error={actionError} />
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
                      : log.action === 'delete_receipt'  ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400'
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
                      : log.action === 'renumber_claim'       ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400'
                      : log.action === 'reopen'               ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                      : log.action === 'send_back'            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                      : log.action === 'restore'              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                      :                                    'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {log.action === 'update'          ? (isEn ? 'Edit' : 'แก้ไข')
                      : log.action === 'upload_receipt'  ? (isEn ? 'Upload' : 'อัพโหลด')
                      : log.action === 'delete_receipt'  ? (isEn ? 'File Deleted' : 'ลบเอกสาร')
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
                      : log.action === 'renumber_claim'       ? (isEn ? 'Renumbered (duplicate fixed)' : 'เปลี่ยนเลขที่ (แก้เลขที่ซ้ำ)')
                      : log.action === 'reopen'               ? (isEn ? 'Reopened' : 'เปิดกลับมาแก้ไข')
                      : log.action === 'send_back'            ? (isEn ? 'Sent back' : 'ส่งกลับให้แก้')
                      : log.action === 'hide'                 ? (isEn ? 'Hidden' : 'ซ่อนใบเบิก')
                      : log.action === 'restore'              ? (isEn ? 'Restored' : 'กู้คืน')
                      : log.action}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {log.editor?.full_name
                        || (log.action === 'renumber_claim' ? (isEn ? 'System' : 'ระบบ') : (isEn ? 'Unknown' : 'ไม่ทราบ'))}
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
