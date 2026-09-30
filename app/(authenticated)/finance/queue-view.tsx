'use client'

// ============================================================================
// คิวใบเบิก — หน้าแรกของแอดมินที่ /finance (พนักงานยังเห็นรายการเดิม ClaimsListView)
// แบ่งตามสิ่งที่ต้องทำ 5 กลุ่ม (claim-queue.ts) · ทำในแถว · ทำทีละหลายใบ (ยืนยันครั้งเดียวต่อชุด) · แผงข้างดูใบเสร็จ
// ส่วน "ชำระเงินแล้ว" (?status=paid&month=) อยู่ใน queue-paid-section.tsx
// ข้อมูลมาจาก server (queue-data.ts — ห้าม import ค่าจริงจากไฟล์นั้นที่นี่) · หลังทำสำเร็จโหลดใหม่ด้วย router.refresh()
// ============================================================================

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CheckSquare, EyeOff, Inbox, Loader2, PlusCircle } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { Button } from '@/components/ui/button'
import { calcTax } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { confirmRefundReceived } from './actions'
import BundleDialog, { type BundleClaimRef } from './bundle-dialog'
import { paymentLock } from './claim-rules'
import { CLAIM_TRANSITIONS, type TransitionKey } from './claim-transitions'
import {
  BULK_MAX, EMPTY_QUEUE_FILTERS, QUEUE_GROUPS, applyBulkResults, bulkEligible, bulkToastText, filterQueue, groupClaims,
  isQueueGroupKey, nextInGroup, queueCounts, queueSubmitters, waitingOnAdmin,
  type QueueFilters, type QueueGroupKey,
} from './claim-queue'
import { MAX_BUNDLE_SELECTION, claimFileCount, rememberListQuery, selectableIds } from './claims-filter'
import {
  approveAsPendingMonthEnd, approveClaim, bulkClaimAction, hideClaim, listHiddenClaims, markAsPaid, markAsPendingMonthEnd,
  markAsWaitingTaxInvoice, rejectClaim, restoreClaim, sendBackClaim, type BulkAction,
} from './lifecycle-actions'
import type { QueueClaim } from './queue-data'
import { QueueGroups, QueueHeadline, QueueTools } from './queue-groups'
import { QueuePaidSection } from './queue-paid-section'
import { QueuePanel } from './queue-panel'
import { PRIMARY_BUTTON, QueueRow, fmtBaht, rowActions, type RowAction, type RowActionKey } from './queue-row'
import { QueueSelectionBar, type BulkButton } from './queue-selection-bar'
import { SendBackDialog } from './send-back-dialog'
import type { FinanceCategory } from './settings-actions'
import { useConfirm } from './use-confirm'
import type { ListClaim } from './view-data'

type Result = { success?: boolean; error?: string }

/** ปุ่มในแถว/แผงข้าง → server action ของใบเดียว (ส่งกลับให้แก้ไปทาง SendBackDialog) */
const SINGLE: Partial<Record<RowActionKey, (id: string) => Promise<Result>>> = {
  approve: approveClaim,
  approve_month_end: approveAsPendingMonthEnd,
  request_tax_invoice: markAsWaitingTaxInvoice,
  defer_month_end: markAsPendingMonthEnd,
  pay: markAsPaid,
  // เหตุผลของการปฏิเสธเว้นว่างได้ — ถ้าต้องให้แก้ ใช้ "ส่งกลับให้แก้" ซึ่งบังคับพิมพ์เหตุผล
  reject: id => rejectClaim(id, ''),
  confirm_refund: confirmRefundReceived,
  hide: id => hideClaim(id),
  restore: restoreClaim,
}

const OTHER_LABELS: Record<string, [string, string]> = {
  confirm_refund: ['ยืนยันเงินคืน', 'Confirm refund'],
  hide: ['ซ่อนใบเบิก', 'Hide claim'],
  restore: ['กู้คืน', 'Restore'],
}

const actionLabel = (key: RowActionKey, isEn: boolean) => {
  if (key in CLAIM_TRANSITIONS) {
    const t = CLAIM_TRANSITIONS[key as TransitionKey]
    return isEn ? t.labelEn : t.labelTh
  }
  return (OTHER_LABELS[key] ?? [key, key])[isEn ? 1 : 0]
}

/** ปุ่มของแถบเลือกหลายใบ ตามลำดับที่แสดง (อนุมัติเป็นปุ่มหลัก) */
const BULK_ORDER: BulkAction[] = ['approve', 'request_tax_invoice', 'defer_month_end', 'pay']

const netOf = (c: QueueClaim) => calcTax(Number(c.amount) || 0, c.vat_mode || 'none', Number(c.withholding_tax_rate) || 0).netPayable

const toBundleRef = (c: QueueClaim): BundleClaimRef => ({
  id: c.id,
  claim_number: c.claim_number,
  title: c.title,
  incomplete: paymentLock(c).locked,
  fileCount: claimFileCount(c),
})

export interface QueueViewProps {
  claims: QueueClaim[]
  hiddenCount: number
  error: string | null
  categories: FinanceCategory[]
  /** ใบที่จ่ายแล้วของเดือน paidMonth (โหลดเฉพาะเมื่อเปิดส่วนชำระเงินแล้ว · แถวแบบเบาจาก list-data.ts) */
  paidClaims: ListClaim[]
  paidMonths: { month: string; count: number }[]
  paidMonth: string
  showPaid: boolean
  userId: string
  /** เวลาของ server ตอนโหลดหน้า (ISO) — อายุของงานคิดจากค่านี้ ข้อความตรงกันทั้ง server และ browser */
  now?: string
}

export default function QueueView({
  claims, hiddenCount, error, categories, paidClaims, paidMonths, paidMonth, showPaid, now: nowIso,
}: QueueViewProps) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const router = useRouter()
  const searchParams = useSearchParams()
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm()
  const [, startTransition] = useTransition()
  const refresh = () => startTransition(() => router.refresh())

  const [fallbackNow] = useState(() => new Date().toISOString())
  const now = new Date(nowIso ?? fallbackNow)
  const [group, setGroup] = useState<QueueGroupKey>(() => {
    const g = searchParams.get('group')
    return isQueueGroupKey(g) ? g : 'review'
  })
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_QUEUE_FILTERS)
  const setFilter = (patch: Partial<QueueFilters>) => setFilters(f => ({ ...f, ...patch }))
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  // แผงข้าง: panelId = ใบที่แสดง · panelOpen แยกไว้ ให้เนื้อหาอยู่ครบระหว่างแผงเลื่อนปิด
  const [panelId, setPanelId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [busy, setBusy] = useState<{ id: string; key: string } | null>(null)
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null)
  const [rowErrors, setRowErrors] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [sendBackFor, setSendBackFor] = useState<{ claim: QueueClaim; fromPanel: boolean } | null>(null)
  const [bundleFor, setBundleFor] = useState<BundleClaimRef[] | null>(null)
  const [hidden, setHidden] = useState<{ open: boolean; loading: boolean; rows: QueueClaim[]; error: string | null }>(
    { open: false, loading: false, rows: [], error: null })

  // กลุ่มที่เปิดอยู่ลง URL (?group=) โดยไม่โหลดข้อมูลใหม่ และจำไว้ให้ปุ่ม "กลับ" ของหน้าใบเบิก
  useEffect(() => {
    const query = showPaid
      ? `?status=paid${paidMonth ? `&month=${paidMonth}` : ''}`
      : group === 'review' ? '' : `?group=${group}`
    rememberListQuery(query)
    if (showPaid || window.location.search === query) return
    try {
      window.history.replaceState(null, '', query || window.location.pathname)
    } catch { /* เบราว์เซอร์จำกัดความถี่การแก้ URL — กลุ่มยังทำงานจาก state */ }
  }, [group, showPaid, paidMonth])

  const groups = groupClaims(claims, now)
  const counts = queueCounts(groups)
  const list = filterQueue(groups[group], filters)
  const filtering = filters.q.trim() !== '' || !!filters.by || filters.type !== 'all'
  const people = queueSubmitters(claims)
  const byId = new Map(claims.map(c => [c.id, c]))
  const selectedClaims = [...selected].flatMap(id => byId.get(id) ?? [])
  const selectAllIds = selectableIds(list)
  const overBulkMax = selectedClaims.length > BULK_MAX
  const panelClaim = panelId ? byId.get(panelId) ?? null : null
  const panelIndex = panelClaim ? list.findIndex(c => c.id === panelClaim.id) : -1
  const working = !!busy || !!bulkBusy
  const groupLabel = QUEUE_GROUPS.find(g => g.key === group)
  const failMessage = isEn ? 'Something went wrong — please try again' : 'เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง'

  const setRowError = (id: string, message: string | null) =>
    setRowErrors(prev => {
      const next = new Map(prev)
      if (message) next.set(id, message)
      else next.delete(id)
      return next
    })
  const toggleSelected = (id: string) =>
    setSelected(prev => {
      // นับเพดานจากใบที่อยู่ในคิวจริง — id ของใบที่ออกจากคิวไปแล้วไม่กินโควตา
      const next = new Set([...prev].filter(x => byId.has(x)))
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_BUNDLE_SELECTION) next.add(id)
      return next
    })
  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  const openPanel = (id: string) => {
    setPanelId(id)
    setPanelOpen(true)
  }
  /** หลังทำสำเร็จในแผงข้าง: ไปใบถัดไปในกลุ่ม · ใบสุดท้าย = ปิดแผง */
  const advancePanel = (id: string) => {
    const next = nextInGroup(list, id)
    if (next) setPanelId(next)
    else setPanelOpen(false)
  }

  /** ยืนยันก่อนทำ: จ่าย · ปฏิเสธ · ซ่อน · ยืนยันเงินคืน (อนุมัติ/ขอใบกำกับ/เลื่อนจ่าย กดแล้วทำเลย) */
  const confirmSingle = (c: QueueClaim, key: RowActionKey): Promise<boolean> => {
    const number = { label: isEn ? 'Claim no.' : 'เลขที่', value: c.claim_number }
    const cancelLabel = isEn ? 'Back' : 'กลับ'
    if (key === 'pay') {
      const last4 = (c.bank_account_number || '').replace(/\D/g, '').slice(-4)
      return askConfirm({
        title: isEn ? `Pay ${c.claim_number}?` : `จ่าย ${c.claim_number}?`,
        description: isEn ? 'Records that the money was transferred. The submitter is notified.' : 'บันทึกว่าโอนเงินให้ผู้เบิกแล้ว ผู้เบิกได้รับแจ้ง',
        details: [
          number,
          { label: isEn ? 'Submitter' : 'ผู้เบิก', value: c.submitter?.full_name || '—' },
          { label: isEn ? 'Net payable' : 'ยอดจ่ายจริง', value: `฿${fmtBaht(netOf(c))}` },
          { label: isEn ? 'Pay to' : 'รับเงินที่', value: c.bank_name ? `${c.bank_name}${last4 ? ` ••••${last4}` : ''}` : '—' },
        ],
        confirmLabel: isEn ? 'Mark as paid' : 'ยืนยันจ่าย',
        cancelLabel,
      })
    }
    if (key === 'reject') {
      return askConfirm({
        title: isEn ? 'Reject this claim?' : 'ปฏิเสธใบเบิกนี้?',
        description: isEn
          ? 'The claim is closed and the submitter is notified. To let them fix it, use "Send back for changes" instead.'
          : 'ใบจะปิดและผู้เบิกได้รับแจ้ง — ถ้าต้องการให้แก้แล้วยื่นใหม่ ใช้ "ส่งกลับให้แก้" แทน',
        details: [number, { label: isEn ? 'Amount' : 'ยอด', value: `฿${fmtBaht(c.amount)}` }],
        variant: 'destructive',
        confirmLabel: isEn ? 'Reject' : 'ปฏิเสธ',
        cancelLabel,
      })
    }
    if (key === 'hide') {
      return askConfirm({
        title: isEn ? 'Hide this claim?' : 'ซ่อนใบเบิกนี้?',
        description: isEn
          ? 'The claim disappears from lists and the queue and can be restored later. Linked cost items are removed.'
          : 'ใบเบิกจะหายจากรายการและคิว กู้คืนได้ภายหลัง · รายการต้นทุนที่ผูกอยู่จะถูกเอาออก',
        details: [number, { label: isEn ? 'Title' : 'หัวข้อ', value: c.title }],
        variant: 'warning',
        confirmLabel: isEn ? 'Hide claim' : 'ซ่อนใบเบิก',
        cancelLabel,
      })
    }
    if (key === 'confirm_refund') {
      return askConfirm({
        title: isEn ? 'Confirm the refund was received?' : 'ยืนยันรับเงินคืนแล้ว?',
        details: [number, { label: isEn ? 'Refund' : 'เงินคืนบริษัท', value: `฿${fmtBaht(c.refund_amount)}` }],
        confirmLabel: isEn ? 'Confirm refund' : 'ยืนยันเงินคืน',
        cancelLabel,
      })
    }
    return Promise.resolve(true)
  }

  /** ปุ่มของใบเดียว (แถว / แผงข้าง / ใบที่ซ่อน) */
  const runAction = async (c: QueueClaim, key: RowActionKey, fromPanel: boolean) => {
    if (working) return
    if (key === 'send_back') {
      setSendBackFor({ claim: c, fromPanel })
      return
    }
    const run = SINGLE[key]
    if (!run || !(await confirmSingle(c, key))) return
    setBusy({ id: c.id, key })
    setRowError(c.id, null)
    const res: Result = await run(c.id).catch(() => ({ error: failMessage }))
    setBusy(null)
    if (res.error) {
      setRowError(c.id, res.error)
      toast.error(`${c.claim_number}: ${res.error}`)
      return
    }
    toast.success(isEn ? `${actionLabel(key, true)} — ${c.claim_number} done` : `${actionLabel(key, false)} ${c.claim_number} แล้ว`)
    if (key === 'restore') setHidden(h => ({ ...h, rows: h.rows.filter(r => r.id !== c.id) }))
    if (fromPanel) advancePanel(c.id)
    refresh()
  }

  const confirmSendBack = async (reason: string) => {
    if (!sendBackFor || working) return
    const { claim: c, fromPanel } = sendBackFor
    setBusy({ id: c.id, key: 'send_back' })
    setRowError(c.id, null)
    const res: Result = await sendBackClaim(c.id, reason).catch(() => ({ error: failMessage }))
    setBusy(null)
    if (res.error) {
      setRowError(c.id, res.error)
      toast.error(`${c.claim_number}: ${res.error}`)
      return
    }
    setSendBackFor(null)
    toast.success(isEn ? `${c.claim_number} sent back — the submitter was notified` : `ส่งกลับให้แก้แล้ว — แจ้งผู้เบิกแล้ว (${c.claim_number})`)
    if (fromPanel) advancePanel(c.id)
    refresh()
  }

  const bulkLabel = (action: BulkAction) => (isEn ? CLAIM_TRANSITIONS[action].labelEn : CLAIM_TRANSITIONS[action].labelTh)
  const bulkButtons: BulkButton[] = BULK_ORDER.map(action => {
    const n = bulkEligible(action, selectedClaims).eligible.length
    const label = action === 'approve'
      ? (isEn ? `Approve ${n}` : `อนุมัติ ${n} ใบ`)
      : action === 'pay' ? (isEn ? `Pay ${n}` : `จ่าย ${n} ใบ`) : bulkLabel(action)
    return { action, label, primary: action === 'approve', disabled: n === 0 || overBulkMax }
  })

  /** ทำทีละหลายใบ: ยืนยันครั้งเดียวต่อชุด → bulkClaimAction ครั้งเดียว → ผลต่อใบ (ใบที่ไม่สำเร็จค้างในที่เลือกพร้อมข้อความ) */
  const runBulk = async (action: BulkAction) => {
    if (working || selectedClaims.length > BULK_MAX) return
    const { eligible, skipped } = bulkEligible(action, selectedClaims)
    if (eligible.length === 0) return
    const label = bulkLabel(action)
    const amountOf = (c: QueueClaim) => (action === 'pay' ? netOf(c) : Number(c.amount) || 0)
    const total = eligible.reduce((sum, c) => sum + amountOf(c), 0)
    const SHOWN = 8
    const shownSkipped = skipped.slice(0, 5)
    const ok = await askConfirm({
      title: isEn ? `${label} ${eligible.length} claims?` : `${label} ${eligible.length} ใบ?`,
      description: skipped.length === 0 ? undefined : (
        <>
          {isEn ? `Skipping ${skipped.length}: ` : `ข้าม ${skipped.length} ใบ: `}
          {shownSkipped.map((s, i) => (
            <span key={s.claim.id}>{i > 0 && <br />}{s.claim.claim_number} — {s.reason}</span>
          ))}
          {skipped.length > shownSkipped.length && (
            <><br />{isEn ? `and ${skipped.length - shownSkipped.length} more` : `และอีก ${skipped.length - shownSkipped.length} ใบ`}</>
          )}
        </>
      ),
      details: [
        ...eligible.slice(0, SHOWN).map(c => ({ label: c.claim_number, value: `฿${fmtBaht(amountOf(c))}` })),
        ...(eligible.length > SHOWN
          ? [{ label: isEn ? `and ${eligible.length - SHOWN} more` : `และอีก ${eligible.length - SHOWN} ใบ`, value: '' }]
          : []),
        { label: isEn ? 'Total' : 'รวม', value: `฿${fmtBaht(total)}` },
      ],
      confirmLabel: isEn ? `${label} ${eligible.length}` : `${label} ${eligible.length} ใบ`,
      cancelLabel: isEn ? 'Back' : 'กลับ',
    })
    if (!ok) return
    setBulkBusy(action)
    const res = await bulkClaimAction(action, eligible.map(c => c.id)).catch(() => ({ error: failMessage, results: undefined }))
    setBulkBusy(null)
    if (res.error || !res.results) {
      toast.error(res.error || failMessage)
      return
    }
    const applied = applyBulkResults(selected, res.results)
    setSelected(applied.selected)
    setRowErrors(prev => {
      const next = new Map(prev)
      applied.succeeded.forEach(id => next.delete(id))
      applied.errors.forEach((message, id) => next.set(id, message))
      return next
    })
    const done = res.results.filter(r => r.ok).length
    const failed = res.results.length - done
    const text = bulkToastText(CLAIM_TRANSITIONS[action].labelTh, CLAIM_TRANSITIONS[action].labelEn, done, failed, isEn)
    if (failed === 0) toast.success(text)
    else if (done > 0) toast.warning(text)
    else toast.error(text)
    if (done > 0) refresh()
  }

  const toggleHidden = async () => {
    if (hidden.open) {
      setHidden(h => ({ ...h, open: false }))
      return
    }
    setHidden(h => ({ ...h, open: true, loading: true, error: null }))
    const res = await listHiddenClaims().catch(() => ({ data: [] as QueueClaim[], error: failMessage }))
    setHidden({ open: true, loading: false, rows: res.data ?? [], error: res.error ?? null })
  }

  const rowProps = (c: QueueClaim, rowGroup: QueueGroupKey | 'hidden', actions: RowAction[]) => ({
    claim: c,
    group: rowGroup,
    actions,
    isEn,
    now,
    busyKey: busy?.id === c.id ? busy.key : null,
    locked: working,
    error: rowErrors.get(c.id) ?? null,
    onAction: (key: RowActionKey) => { void runAction(c, key, false) },
  })

  return (
    // เว้นที่ใต้รายการเท่าความสูงแถบเลือกหลายใบ — แถวสุดท้ายต้องไม่ถูกแถบบัง
    <div className={cn('space-y-5', selecting && !showPaid && 'pb-56 md:pb-40')}>
      {confirmDialog}
      {bundleFor && (
        <BundleDialog claims={bundleFor} isAdmin isEn={isEn} onClose={() => setBundleFor(null)} onFiled={refresh} />
      )}
      <SendBackDialog
        open={!!sendBackFor}
        claim={sendBackFor?.claim ?? null}
        busy={busy?.key === 'send_back'}
        isEn={isEn}
        onCancel={() => setSendBackFor(null)}
        onConfirm={reason => { void confirmSendBack(reason) }}
      />
      <QueuePanel
        open={panelOpen}
        claim={panelClaim}
        isEn={isEn}
        busy={busy ? (busy.id === panelClaim?.id ? busy.key : 'other') : bulkBusy ? 'other' : null}
        error={panelClaim ? rowErrors.get(panelClaim.id) ?? null : null}
        categories={categories}
        onClose={() => setPanelOpen(false)}
        onAction={key => { if (panelClaim) void runAction(panelClaim, key, true) }}
        onSendBack={() => { if (panelClaim && !working) setSendBackFor({ claim: panelClaim, fromPanel: true }) }}
        onPrev={() => { if (panelIndex > 0) setPanelId(list[panelIndex - 1].id) }}
        onNext={() => { if (panelIndex >= 0 && panelIndex + 1 < list.length) setPanelId(list[panelIndex + 1].id) }}
        hasPrev={panelIndex > 0}
        hasNext={panelIndex >= 0 && panelIndex + 1 < list.length}
      />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{isEn ? 'Expense claims' : 'ใบเบิก'}</h1>
          <QueueHeadline waiting={waitingOnAdmin(groups)} stale={counts.stale} isEn={isEn} />
        </div>
        <div className="flex flex-wrap gap-2">
          {!showPaid && (
            <Button size="lg" type="button" variant="outline" aria-pressed={selecting}
              onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
              className={cn('px-4', selecting && PRIMARY_BUTTON)}
            >
              <CheckSquare aria-hidden="true" />
              {isEn ? 'Select multiple' : 'เลือกหลายใบ'}
            </Button>
          )}
          <Button size="lg" asChild className={cn('px-4', PRIMARY_BUTTON)}>
            <Link href="/finance/new">
              <PlusCircle aria-hidden="true" />
              {isEn ? 'New claim' : 'สร้างใบเบิก'}
            </Link>
          </Button>
        </div>
      </header>

      <nav aria-label={isEn ? 'Claims sections' : 'ส่วนของใบเบิก'} className="flex gap-1 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800">
        {[
          { href: group === 'review' ? '/finance' : `/finance?group=${group}`, on: !showPaid, th: 'คิวใบเบิก', en: 'Claim queue' },
          { href: '/finance?status=paid', on: showPaid, th: 'ชำระเงินแล้ว', en: 'Paid' },
        ].map(tab => (
          <Button size="lg" key={tab.th} asChild variant="ghost"
            className={cn(
              'shrink-0 rounded-b-none border-b-2 px-4',
              tab.on ? 'border-emerald-700 font-semibold text-zinc-900 dark:border-emerald-500 dark:text-zinc-100' : 'border-transparent text-zinc-600 dark:text-zinc-400',
            )}
          >
            <Link href={tab.href} aria-current={tab.on ? 'page' : undefined}>{isEn ? tab.en : tab.th}</Link>
          </Button>
        ))}
      </nav>

      {showPaid ? (
        <QueuePaidSection claims={paidClaims} months={paidMonths} month={paidMonth} isEn={isEn} />
      ) : (
        <>
          <QueueGroups counts={counts} active={group} isEn={isEn} onSelect={setGroup} />

          {error && (
            <p role="alert" className="rounded-xl bg-red-100 p-4 text-sm font-medium text-red-900 dark:bg-red-950/60 dark:text-red-100">{error}</p>
          )}

          <QueueTools filters={filters} people={people} isEn={isEn} onChange={setFilter} />

          <section aria-labelledby="queue-list-title" className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="queue-list-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {isEn ? groupLabel?.labelEn : groupLabel?.labelTh}
                <span className="ml-2 text-sm font-normal text-zinc-600 dark:text-zinc-400">
                  {filtering
                    ? (isEn ? `${list.length} of ${groups[group].length}` : `พบ ${list.length} จาก ${groups[group].length} ใบ`)
                    : (isEn ? `${list.length} claims` : `${list.length} ใบ`)}
                </span>
              </h2>
              {filtering && (
                <Button size="lg" type="button" variant="ghost" className="px-3" onClick={() => setFilters(f => ({ ...EMPTY_QUEUE_FILTERS, sort: f.sort }))}>
                  {isEn ? 'Clear filters' : 'ล้างตัวกรอง'}
                </Button>
              )}
            </div>
            {list.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700">
                <Inbox className="h-10 w-10 text-zinc-400" aria-hidden="true" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {filtering
                    ? (isEn ? 'No claims match these filters' : 'ไม่พบใบเบิกที่ตรงกับตัวกรอง')
                    : (isEn ? 'Nothing waiting in this group' : 'ไม่มีงานค้างในกลุ่มนี้')}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {list.map(c => (
                  <QueueRow
                    key={c.id}
                    {...rowProps(c, group, rowActions(c, isEn, 'row'))}
                    selecting={selecting}
                    selected={selected.has(c.id)}
                    onOpen={() => openPanel(c.id)}
                    onToggle={() => toggleSelected(c.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          {(hiddenCount > 0 || hidden.open) && (
            <section aria-label={isEn ? 'Hidden claims' : 'ใบที่ซ่อนไว้'} className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <Button size="lg" type="button" variant="ghost" className="px-3" aria-expanded={hidden.open} onClick={() => { void toggleHidden() }}>
                <EyeOff aria-hidden="true" />
                {isEn ? `Hidden claims (${hiddenCount})` : `ใบที่ซ่อนไว้ (${hiddenCount})`}
              </Button>
              {hidden.open && (
                hidden.loading ? (
                  <p className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {isEn ? 'Loading…' : 'กำลังโหลด…'}
                  </p>
                ) : hidden.error ? (
                  <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{hidden.error}</p>
                ) : hidden.rows.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{isEn ? 'No hidden claims' : 'ไม่มีใบที่ซ่อนไว้'}</p>
                ) : (
                  <ul className="space-y-2">
                    {hidden.rows.map(c => (
                      <QueueRow
                        key={c.id}
                        {...rowProps(c, 'hidden', [{ key: 'restore', label: actionLabel('restore', isEn), variant: 'outline' }])}
                        onOpen={() => router.push(`/finance/${c.id}`)}
                      />
                    ))}
                  </ul>
                )
              )}
            </section>
          )}
        </>
      )}

      {selecting && !showPaid && (
        <QueueSelectionBar
          count={selectedClaims.length}
          selectAllLabel={isEn ? `Select all in this group (${selectAllIds.length})` : `เลือกทุกใบในกลุ่มนี้ (${selectAllIds.length})`}
          selectAllDisabled={selectAllIds.length === 0}
          bulk={bulkButtons}
          busy={bulkBusy}
          overBulkMax={overBulkMax}
          atSelectLimit={selectedClaims.length >= MAX_BUNDLE_SELECTION}
          selectLimit={MAX_BUNDLE_SELECTION}
          isEn={isEn}
          onSelectAll={() => setSelected(new Set(selectAllIds))}
          onClear={() => setSelected(new Set())}
          onExit={exitSelecting}
          onBulk={action => { void runBulk(action) }}
          onBundle={() => setBundleFor(selectedClaims.map(toBundleRef))}
        />
      )}
    </div>
  )
}
