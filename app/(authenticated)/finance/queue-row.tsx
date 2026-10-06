// ============================================================================
// แถวของคิวใบเบิก — [ช่องเลือก (โหมดเลือก) | ไอคอนสถานะ | หัวข้อ + 'EXP-… · ผู้เบิก · งาน' | ป้ายเอกสาร | ยอด + อายุ | ปุ่ม]
// แสดงผลล้วน ไม่มี hook (ผู้เรียกถือ state และเรียก server action เอง) — ใช้ได้ในชุดตรวจ renderToStaticMarkup
// ปุ่มของแต่ละสถานะมาจากตาราง claim-transitions.ts (rowActions) · ล็อกการจ่ายมาจาก paymentLock ใน claim-rules.ts
// ============================================================================

import Link from 'next/link'
import {
  AlertCircle, Ban, Banknote, CalendarClock, CheckCircle2, Clock, ExternalLink, FileEdit, FileText, Hourglass, Loader2,
  Receipt, RefreshCw, XCircle, type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { paymentLock } from './claim-rules'
import { CLAIM_TRANSITIONS, transitionsFor, type TransitionKey } from './claim-transitions'
import { advanceState, ageAnchor, ageText, type QueueGroupKey } from './claim-queue'
import type { QueueClaim } from './queue-data'
import { StatusBadge } from './status-badge'
import { OutstandingPill } from './outstanding-alert'

/** ปุ่มหลักของส่วนใบเบิก = Button variant default + สีเขียว (primary ของธีมเป็นสีดำ) — ดู DESIGN.md */
export const PRIMARY_BUTTON = 'bg-emerald-700 text-white hover:bg-emerald-800 dark:bg-emerald-700 dark:text-white dark:hover:bg-emerald-800'

export type RowActionKey = TransitionKey | 'confirm_refund' | 'hide' | 'restore'

export interface RowAction {
  key: RowActionKey
  label: string
  variant: 'default' | 'outline' | 'ghost'
  disabled?: boolean
  /** เหตุผลที่กดไม่ได้ (ล็อกการจ่าย) — แสดงเป็นข้อความใต้ปุ่มด้วย เพราะปุ่มที่ปิดอยู่ไม่มี tooltip */
  title?: string
}

/** ลำดับปุ่ม: รอง → หลัก (ปุ่มหลักอยู่ขวาสุด) · panelOnly = แสดงเฉพาะในแผงข้าง */
const ACTION_ORDER: { key: TransitionKey; variant: RowAction['variant']; panelOnly?: boolean }[] = [
  { key: 'reject', variant: 'ghost', panelOnly: true },
  { key: 'send_back', variant: 'outline' },
  { key: 'request_tax_invoice', variant: 'outline' },
  { key: 'defer_month_end', variant: 'outline' },
  { key: 'approve_month_end', variant: 'outline', panelOnly: true },
  { key: 'approve', variant: 'default' },
  { key: 'pay', variant: 'default' },
]

const isPetty = (c: Pick<QueueClaim, 'claim_type' | 'pettycash_fund_id'>) => c.claim_type === 'petty_cash' || !!c.pettycash_fund_id

/**
 * ปุ่มของใบในคิว (แถว / แผงข้าง) — แอดมินทำได้ตามตาราง transitionsFor
 * แถว: รออนุมัติ = ส่งกลับให้แก้ + อนุมัติ · หลังอนุมัติ = การกระทำไปข้างหน้า (ส่งกลับให้แก้เฉพาะใบที่ติดล็อกการจ่าย)
 * แผงข้าง: ครบทุกปุ่มรวมปฏิเสธและอนุมัติรอจ่ายสิ้นเดือน · จ่ายติดล็อก = ปุ่มปิดพร้อมข้อความล็อก
 */
export function rowActions(c: QueueClaim, isEn: boolean, where: 'row' | 'panel'): RowAction[] {
  const adv = advanceState(c)
  if (adv === 'refund_pending') return [{ key: 'confirm_refund', label: isEn ? 'Confirm refund' : 'ยืนยันเงินคืน', variant: 'default' }]
  if (adv) return []
  if (c.status === 'draft') return isPetty(c) ? [] : [{ key: 'hide', label: isEn ? 'Hide claim' : 'ซ่อนใบเบิก', variant: 'outline' }]

  const allowed = new Set(transitionsFor(c.status, { isAdmin: true, isOwner: false }).map(t => t.key))
  const lock = paymentLock(c)
  return ACTION_ORDER
    .filter(a => allowed.has(a.key) && (where === 'panel' || !a.panelOnly))
    // ในแถว ส่งกลับให้แก้อยู่คู่กับอนุมัติ (รออนุมัติ) และกับใบที่จ่ายไม่ได้เพราะเอกสารไม่ครบ
    .filter(a => a.key !== 'send_back' || where === 'panel' || c.status === 'pending' || lock.locked)
    .map(a => {
      const t = CLAIM_TRANSITIONS[a.key]
      const action: RowAction = { key: a.key, label: isEn ? t.labelEn : t.labelTh, variant: a.variant }
      return a.key === 'pay' && lock.locked ? { ...action, disabled: true, title: lock.message } : action
    })
}

/** ไอคอนตามสถานะ (สีเป็นกลาง — สีของสถานะมีที่ StatusBadge ที่เดียว) */
const STATUS_ICON: Record<string, LucideIcon> = {
  draft: FileEdit, pending: Clock, approved: CheckCircle2, waiting_tax_invoice: Receipt, pending_month_end: CalendarClock,
  paid: Banknote, refund_confirmed: RefreshCw, rejected: XCircle, cancelled: Ban, awaiting_payment: CheckCircle2,
}

const TONE = {
  red: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  sky: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200',
  emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
} as const

function Tag({ tone, Icon, children }: { tone: keyof typeof TONE; Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn('gap-1 border-transparent px-2.5 py-1 font-semibold', TONE[tone])}>
      <Icon aria-hidden="true" />
      {children}
    </Badge>
  )
}

/** ป้ายเอกสาร — ขาดใบเสร็จ (แดง) / ต้องมีใบกำกับ (ฟ้า) / เอกสารครบ (เขียว) ตามกติกาล็อกการจ่าย */
export function DocBadge({ claim, isEn }: { claim: QueueClaim; isEn: boolean }) {
  const { missing } = paymentLock(claim)
  if (missing.includes('ใบเสร็จ')) return <Tag tone="red" Icon={AlertCircle}>{isEn ? 'Missing receipt' : 'ขาดใบเสร็จ'}</Tag>
  if (missing.includes('ใบกำกับภาษี')) return <Tag tone="sky" Icon={FileText}>{isEn ? 'Tax invoice needed' : 'ต้องมีใบกำกับ'}</Tag>
  return <Tag tone="emerald" Icon={CheckCircle2}>{isEn ? 'Documents complete' : 'เอกสารครบ'}</Tag>
}

/** ป้ายทดลองจ่าย — รอผู้เบิกเคลียร์ / รอยืนยันเงินคืน */
export function AdvanceBadge({ claim, isEn }: { claim: QueueClaim; isEn: boolean }) {
  const state = advanceState(claim)
  if (state === 'unsettled') return <Tag tone="amber" Icon={Hourglass}>{isEn ? 'Waiting for settlement' : 'รอผู้เบิกเคลียร์'}</Tag>
  if (state === 'refund_pending') return <Tag tone="amber" Icon={RefreshCw}>{isEn ? 'Refund to confirm' : 'รอยืนยันเงินคืน'}</Tag>
  return null
}

export const fmtBaht = (n: number | null | undefined) =>
  (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })

/** ข้อความอายุของแถว: ต้องตรวจ = 'ยื่นเมื่อ … ก่อน' · ใบที่ซ่อน = 'ซ่อนเมื่อ … ก่อน' · อื่นๆ = 'รอมาแล้ว …' */
export function ageLine(claim: QueueClaim, group: QueueGroupKey | 'hidden', now: Date, isEn: boolean): string {
  if (group === 'hidden') {
    const age = ageText(claim.deleted_at ?? claim.created_at, now, isEn)
    return isEn ? `Hidden ${age} ago` : `ซ่อนเมื่อ ${age} ก่อน`
  }
  const age = ageText(ageAnchor(claim), now, isEn)
  if (group === 'review') return isEn ? `Submitted ${age} ago` : `ยื่นเมื่อ ${age} ก่อน`
  return isEn ? `Waiting ${age}` : `รอมาแล้ว ${age}`
}

export interface QueueRowProps {
  claim: QueueClaim
  group: QueueGroupKey | 'hidden'
  actions: RowAction[]
  isEn: boolean
  now: Date
  selecting?: boolean
  selected?: boolean
  /** ปุ่มของแถวนี้ที่กำลังทำงาน (หมุน) */
  busyKey?: string | null
  /** มีงานอื่นกำลังทำอยู่ — ทุกปุ่มกดไม่ได้ชั่วคราว */
  locked?: boolean
  /** ข้อความผิดพลาดล่าสุดของแถวนี้ (แสดงใต้ปุ่ม) */
  error?: string | null
  /** กดที่หัวข้อ: เปิดแผงข้าง (โหมดเลือก = เลือก/เลิกเลือก) */
  onOpen: () => void
  onToggle?: () => void
  onAction: (key: RowActionKey) => void
}

export function QueueRow({
  claim: c, group, actions, isEn, now, selecting = false, selected = false, busyKey = null, locked = false, error = null,
  onOpen, onToggle, onAction,
}: QueueRowProps) {
  const Icon = STATUS_ICON[c.status] ?? FileEdit
  const payLock = actions.find(a => a.key === 'pay' && a.disabled)?.title
  const mixedStatuses = group === 'pay' || group === 'stale' || group === 'hidden'
  const event = c.job_event?.event_name
  return (
    <li
      className={cn(
        'rounded-xl border p-3 transition-colors sm:p-4',
        selected
          ? 'border-emerald-600 bg-emerald-50/60 dark:border-emerald-500 dark:bg-emerald-950/30'
          : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {selecting && (
            <label className="-ml-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
              <Checkbox
                checked={selected}
                onCheckedChange={() => onToggle?.()}
                aria-label={isEn ? `Select ${c.claim_number}` : `เลือก ${c.claim_number}`}
                className="size-5"
              />
            </label>
          )}
          <span aria-hidden="true" className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 sm:flex dark:bg-zinc-800 dark:text-zinc-300">
            <Icon className="h-5 w-5" />
          </span>
          <Button size="lg" type="button" variant="ghost" onClick={selecting ? onToggle : onOpen}
            aria-pressed={selecting ? selected : undefined}
            className="h-auto min-h-10 min-w-0 flex-1 flex-col items-start gap-0.5 whitespace-normal px-2 py-1 text-left font-normal"
          >
            <span className="block w-full truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{c.title}</span>
            <span className="block w-full truncate text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-mono">{c.claim_number}</span> · {c.submitter?.full_name || '—'} <OutstandingPill count={c.submitter_outstanding} isEn={isEn} />{event ? ` · ${event}` : ''}
            </span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:flex-nowrap">
          <div className="flex flex-wrap items-center gap-1.5">
            {mixedStatuses && <StatusBadge status={c.status} isEn={isEn} />}
            {advanceState(c) ? <AdvanceBadge claim={c} isEn={isEn} /> : <DocBadge claim={c} isEn={isEn} />}
          </div>
          <div className="ml-auto text-right xl:ml-0 xl:w-36">
            <p className="text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-100">฿{fmtBaht(c.amount)}</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{ageLine(c, group, now, isEn)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
          <Button size="lg" asChild variant="ghost" className="px-3">
            <Link href={`/finance/${c.id}`}>
              <ExternalLink aria-hidden="true" />
              {isEn ? 'Open' : 'เปิดใบ'}
            </Link>
          </Button>
          {actions.map(a => (
            <Button size="lg" key={a.key} type="button" variant={a.variant} disabled={a.disabled || locked || !!busyKey} title={a.title}
              onClick={() => onAction(a.key)}
              className={cn('grow px-4 sm:grow-0', a.variant === 'default' && PRIMARY_BUTTON)}
            >
              {busyKey === a.key && <Loader2 className="animate-spin" aria-hidden="true" />}
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {(payLock || error) && (
        <div className="mt-2 space-y-1 xl:text-right">
          {payLock && (
            <p className="inline-flex items-center gap-1 text-xs font-medium text-red-800 dark:text-red-200">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {payLock}
            </p>
          )}
          {error && <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
        </div>
      )}
    </li>
  )
}
