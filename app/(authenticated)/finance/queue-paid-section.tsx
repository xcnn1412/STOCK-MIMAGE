'use client'

// ============================================================================
// ส่วน "ชำระเงินแล้ว" ของหน้าแรกแอดมิน (/finance?status=paid&month=YYYY-MM — ลิงก์เดิมยังใช้ได้)
// server โหลดทีละเดือน · เปลี่ยนเดือน = ขอหน้าใหม่ (กล่องเลือกแสดงเดือนที่เพิ่งเลือกระหว่างรอ)
// เลือกหลายใบ + จับชุดเอกสาร (BundleDialog) · ทำเครื่องหมายเข้าแฟ้มแล้วโหลดข้อมูลใหม่
// ============================================================================

import { useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckSquare, ExternalLink, FileStack, FolderCheck, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { calcTax } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { getClaimChecklist, type ExpenseClaim } from '../costs/types'
import BundleDialog, { type BundleClaimRef } from './bundle-dialog'
import {
  EMPTY_FILTERS, FILED_FILTERS, MAX_BUNDLE_SELECTION, claimFileCount, filedState, filterClaims, selectableIds, type FiledFilter,
} from './claims-filter'
import { PRIMARY_BUTTON } from './queue-row'
import { QueueSelectionBar } from './queue-selection-bar'

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const netOf = (c: ExpenseClaim) => calcTax(Number(c.amount) || 0, c.vat_mode || 'none', Number(c.withholding_tax_rate) || 0).netPayable

const toBundleRef = (c: ExpenseClaim): BundleClaimRef => ({
  id: c.id,
  claim_number: c.claim_number,
  title: c.title,
  incomplete: !getClaimChecklist(c).isComplete,
  fileCount: claimFileCount(c),
})

const FILED_LABEL: Record<FiledFilter, [string, string]> = {
  all: ['ทุกสถานะแฟ้ม', 'Any filing status'],
  no: ['ยังไม่เข้าแฟ้ม', 'Not filed yet'],
  yes: ['เข้าแฟ้มแล้ว', 'Filed'],
  changed: ['ไฟล์แนบเปลี่ยนหลังเข้าแฟ้ม', 'Attachments changed after filing'],
}

function FiledBadge({ claim, isEn }: { claim: ExpenseClaim; isEn: boolean }) {
  const state = filedState(claim)
  if (state === 'none') return null
  return state === 'filed' ? (
    <Badge variant="outline" className="gap-1 text-zinc-700 dark:text-zinc-300">
      <FolderCheck aria-hidden="true" />
      {isEn ? 'Filed' : 'เข้าแฟ้มแล้ว'}
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-100">
      <AlertCircle aria-hidden="true" />
      {isEn ? 'Attachments changed after filing' : 'ไฟล์แนบเปลี่ยนหลังเข้าแฟ้ม'}
    </Badge>
  )
}

export function QueuePaidSection({
  claims,
  months,
  month,
  isEn,
}: {
  /** ใบที่จ่ายแล้วของเดือน month (server โหลดทีละเดือน) */
  claims: ExpenseClaim[]
  months: { month: string; count: number }[]
  /** 'YYYY-MM' ('' = ยังไม่มีการจ่าย) */
  month: string
  isEn: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [loadingMonth, startMonthLoad] = useTransition()
  const [shownMonth, showMonth] = useOptimistic(month)
  const [q, setQ] = useState('')
  const [filed, setFiled] = useState<FiledFilter>('all')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [bundleFor, setBundleFor] = useState<BundleClaimRef[] | null>(null)

  const chooseMonth = (m: string) =>
    startMonthLoad(() => {
      showMonth(m)
      router.replace(`/finance?status=paid&month=${encodeURIComponent(m)}`, { scroll: false })
    })

  const filtered = filterClaims(claims, { ...EMPTY_FILTERS, q, filed }, 'paid_at')
  const byId = new Map(claims.map(c => [c.id, c]))
  // id ที่เลือกไว้แต่ไม่อยู่ในเดือนที่โหลดอยู่ ไม่นับและไม่ส่งเข้าชุด
  const selectedClaims = [...selected].flatMap(id => byId.get(id) ?? [])
  const selectAllIds = selectableIds(filtered)
  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set([...prev].filter(x => byId.has(x)))
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_BUNDLE_SELECTION) next.add(id)
      return next
    })
  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }
  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-')
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString(isEn ? 'en-US' : 'th-TH', { month: 'long', year: 'numeric' })
  }
  const total = claims.reduce((sum, c) => sum + netOf(c), 0)
  const bundleLabel = isEn ? 'Bundle documents' : 'จับชุดเอกสาร'

  return (
    <section
      aria-label={isEn ? 'Paid claims' : 'ชำระเงินแล้ว'}
      aria-busy={loadingMonth}
      className={cn('space-y-4 transition-opacity', loadingMonth && 'opacity-60', selecting && 'pb-48 md:pb-36')}
    >
      {bundleFor && (
        <BundleDialog claims={bundleFor} isAdmin isEn={isEn} onClose={() => setBundleFor(null)} onFiled={() => startTransition(() => router.refresh())} />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{isEn ? 'Month total (net paid)' : 'ยอดจ่ายจริงเดือนนี้'}</p>
          <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">฿{fmtDec(total)}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{isEn ? `${claims.length} claims` : `${claims.length} ใบ`}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          {months.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="paid-month" className="text-xs text-zinc-600 dark:text-zinc-400">{isEn ? 'Month paid' : 'เดือนที่จ่าย'}</Label>
              <Select value={shownMonth} onValueChange={chooseMonth}>
                <SelectTrigger id="paid-month" aria-label={isEn ? 'Month paid' : 'เดือนที่จ่าย'} className="min-h-10 w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.month} value={m.month}>{monthLabel(m.month)} ({m.count})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button size="lg" type="button" variant={selecting ? 'default' : 'outline'} aria-pressed={selecting}
            onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
            className={cn('px-4', selecting && PRIMARY_BUTTON)}
          >
            <CheckSquare aria-hidden="true" />
            {isEn ? 'Select multiple' : 'เลือกหลายใบ'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <Input type="search" value={q} onChange={e => setQ(e.target.value)} maxLength={100}
            aria-label={isEn ? 'Search paid claims' : 'ค้นหาใบที่จ่ายแล้ว'}
            placeholder={isEn ? 'Claim no., title, name, event' : 'เลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน'}
            className="h-10 pl-9"
          />
        </div>
        <Select value={filed} onValueChange={v => setFiled(v as FiledFilter)}>
          <SelectTrigger aria-label={isEn ? 'Filing status' : 'สถานะแฟ้ม'} className="min-h-10 w-full sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILED_FILTERS.map(f => <SelectItem key={f} value={f}>{FILED_LABEL[f][isEn ? 1 : 0]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {claims.length === 0
            ? (isEn ? 'No paid claims this month' : 'ยังไม่มีใบเบิกที่ชำระแล้วในเดือนนี้')
            : (isEn ? 'No claims match these filters' : 'ไม่พบใบเบิกที่ตรงกับตัวกรอง')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-600 lg:grid dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-400">
            <span>{isEn ? 'Claim no.' : 'เลขที่'}</span>
            <span>{isEn ? 'Submitter' : 'ผู้เบิก'}</span>
            <span>{isEn ? 'Title' : 'หัวข้อ'}</span>
            <span className="text-right">{isEn ? 'Net paid' : 'จ่ายจริง'}</span>
            <span>{isEn ? 'Paid at' : 'วันที่ชำระ'}</span>
            <span className="w-22" />
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map(c => {
              const checked = selected.has(c.id)
              return (
                // จอแคบ: [เลขที่ + ป้ายแฟ้ม | ยอด] / หัวข้อ / [ผู้เบิก · วันที่ | ปุ่ม] · จอใหญ่: ตาราง 6 คอลัมน์
                <li
                  key={c.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm sm:px-4 lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]',
                    checked && 'bg-emerald-50/60 dark:bg-emerald-950/30',
                  )}
                >
                  <div className="order-1 flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:order-0">
                    {selecting && (
                      <label className="-ml-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center">
                        <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} className="size-5"
                          aria-label={isEn ? `Select ${c.claim_number}` : `เลือก ${c.claim_number}`}
                        />
                      </label>
                    )}
                    <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{c.claim_number}</span>
                    <FiledBadge claim={c} isEn={isEn} />
                  </div>
                  <span className="order-4 min-w-0 max-w-full truncate text-xs font-medium text-zinc-800 lg:order-0 lg:text-sm dark:text-zinc-200">{c.submitter?.full_name || '—'}</span>
                  <span className="order-3 basis-full truncate text-zinc-900 lg:order-0 lg:basis-auto dark:text-zinc-100">{c.title}</span>
                  <span className="order-2 text-right font-bold tabular-nums text-zinc-900 lg:order-0 dark:text-zinc-100">฿{fmtDec(netOf(c))}</span>
                  <span className="order-5 text-xs text-zinc-600 lg:order-0 dark:text-zinc-400">
                    {c.paid_at
                      ? new Date(c.paid_at).toLocaleDateString(isEn ? 'en-GB' : 'th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </span>
                  <div className="order-6 ml-auto flex items-center justify-end gap-1 lg:order-0 lg:ml-0">
                    <Button size="lg" type="button" variant="ghost" className="w-10 px-0" aria-label={bundleLabel} title={bundleLabel}
                      onClick={() => setBundleFor([toBundleRef(c)])}
                    >
                      <FileStack aria-hidden="true" />
                    </Button>
                    <Button size="lg" asChild variant="ghost" className="w-10 px-0">
                      <Link href={`/finance/${c.id}`} aria-label={isEn ? `Open ${c.claim_number}` : `เปิด ${c.claim_number}`}>
                        <ExternalLink aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {selecting && (
        <QueueSelectionBar
          count={selectedClaims.length}
          selectAllLabel={isEn ? `Select all shown (${selectAllIds.length})` : `เลือกทุกใบที่แสดง (${selectAllIds.length})`}
          selectAllDisabled={selectAllIds.length === 0}
          bulk={[]}
          busy={null}
          overBulkMax={false}
          atSelectLimit={selectedClaims.length >= MAX_BUNDLE_SELECTION}
          selectLimit={MAX_BUNDLE_SELECTION}
          isEn={isEn}
          onSelectAll={() => setSelected(new Set(selectAllIds))}
          onClear={() => setSelected(new Set())}
          onExit={exitSelecting}
          onBulk={() => {}}
          onBundle={() => setBundleFor(selectedClaims.map(toBundleRef))}
        />
      )}
    </section>
  )
}
