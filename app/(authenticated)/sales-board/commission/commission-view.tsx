'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Settings2, Download, Coins,
  Tag, CalendarDays, AlertTriangle, RotateCcw, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  BOOTH_HEADERS, EVENT_HEADERS, TH_MONTHS_LONG,
  buildCommission, buildExportSheet, commissionPeriod, defaultPeriodMonth, shiftMonth,
  summaryLine, thaiDay, thaiEventRange,
  type CommissionLead, type CommissionTargets, type Row, type WarningCode,
} from '../commission-logic'
import { saveCommissionTargets } from '../actions'

interface Props {
  leads: CommissionLead[]              // เฉพาะการ์ดที่สถานะปัจจุบันเป็น "ตอบรับแล้ว"
  lockDates: Record<string, string>    // lead_id → วันล็อคคิว (ไม่มี = ไม่มีประวัติ ใช้วันสร้างการ์ด)
  today: string                        // YYYY-MM-DD เวลาไทย จาก server
  initialTargets: Record<string, Record<string, number>>
  statusLabels: Record<string, string> // สถานะ (ตัวพิมพ์เล็ก) → ป้ายไทยจาก crm_settings
  isAdmin: boolean
  unitCountAvailable: boolean
}

const periodLabel = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${TH_MONTHS_LONG[mo - 1]} ${y + 543}` }

// หัวข้อกล่อง "ต้องตรวจสอบ" ตาม code
const WARNING_LABEL: Record<WarningCode, string> = {
  no_work_type: 'ยังไม่ระบุประเภทงาน (ไม่ถูกนับ)',
  no_event_date: 'งานอีเวนต์ที่ไม่มีวันจัดงาน',
  end_before_start: 'วันสิ้นสุดงานอยู่ก่อนวันเริ่มงาน',
  no_quotation_ref: 'ไม่มีเลขใบเสนอราคา',
  dup_quotation_ref: 'เลขใบเสนอราคาซ้ำกัน',
  possible_duplicate: 'อาจเป็นงานเดียวกันซ้ำ (ลูกค้า + วันจัดงานเดียวกัน)',
  no_history: 'ไม่มีประวัติเปลี่ยนสถานะ (ใช้วันสร้างการ์ดแทน)',
  cutoff_day: 'ล็อคคิววันที่ 25 (ถูกนับสองงวด)',
}
const WARNING_ORDER: WarningCode[] = ['no_work_type', 'cutoff_day', 'possible_duplicate', 'dup_quotation_ref', 'end_before_start', 'no_event_date', 'no_quotation_ref', 'no_history']

export default function CommissionView(props: Props) {
  const router = useRouter()
  const [month, setMonth] = useState(() => defaultPeriodMonth(props.today))
  const period = commissionPeriod(month) || { from: props.today, to: props.today }
  // ช่วงที่ปรับเอง (ชั่วคราว) — null = ใช้งวดปกติของเดือนที่เลือก
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null)
  const range = custom || period
  const isCustom = !!custom && (custom.from !== period.from || custom.to !== period.to)
  const [editorOpen, setEditorOpen] = useState(false)

  const goMonth = (m: string) => { setMonth(m); setCustom(null) }
  const setRangeField = (k: 'from' | 'to', v: string) => { if (v) setCustom({ ...range, [k]: v }) }

  // เป้าผูกกับเดือนของงวดที่เลือก แม้ช่วงวันที่ถูกปรับชั่วคราว
  const stored = props.initialTargets[month] || {}
  const targets: CommissionTargets = { booths: stored.cm_booths ?? null, events: stored.cm_events ?? null }

  const lockMap = useMemo(() => new Map(Object.entries(props.lockDates)), [props.lockDates])
  const result = useMemo(
    () => buildCommission({ leads: props.leads, lockDates: lockMap, from: range.from, to: range.to }),
    [props.leads, lockMap, range.from, range.to],
  )

  const statusLabel = (s: string) => props.statusLabels[s.toLowerCase()] || s || '—'

  const warningGroups = useMemo(() => {
    const g = new Map<WarningCode, typeof result.warnings>()
    for (const w of result.warnings) g.set(w.code, [...(g.get(w.code) || []), w])
    return WARNING_ORDER.filter((c) => g.has(c)).map((c) => ({ code: c, items: g.get(c)! }))
  }, [result])

  const exportExcel = async () => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet(buildExportSheet(result, targets, range, statusLabel))
    ws['!cols'] = [6, 18, 12, 28, 16, 14, 6, 18, 24, 28, 16, 14].map((wch) => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ค่าคอมแอดมิน')
    XLSX.writeFile(wb, `สรุปยอดค่าคอมแอดมิน - ${range.from} - ${range.to}.xlsx`)
  }

  return (
    <div className="mx-auto flex max-w-[1900px] flex-col gap-3">
      {/* ── หัวเรื่อง + ตัวเลื่อนงวด ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-6 w-6 text-amber-500" />
          <div>
            <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl">สรุปค่าคอมแอดมิน</h1>
            <p className="text-xs text-muted-foreground">นับการ์ด CRM ที่ลูกค้าตอบรับแล้ว ตามวันล็อคคิว (วันแรกที่สถานะเปลี่ยนเป็นตอบรับ)</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center rounded-lg border bg-card">
            <Button variant="ghost" size="icon" onClick={() => goMonth(shiftMonth(month, -1))} title="งวดก่อนหน้า"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[160px] text-center text-sm font-semibold">งวด {periodLabel(month)}</span>
            <Button variant="ghost" size="icon" onClick={() => goMonth(shiftMonth(month, 1))} title="งวดถัดไป"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-1">
            <Input type="date" aria-label="วันเริ่ม" className="h-9 w-[150px]" value={range.from} onChange={(e) => setRangeField('from', e.target.value)} />
            <span className="text-muted-foreground">–</span>
            <Input type="date" aria-label="วันสิ้นสุด" className="h-9 w-[150px]" value={range.to} onChange={(e) => setRangeField('to', e.target.value)} />
          </div>
          {isCustom && (
            <Button variant="outline" size="sm" onClick={() => setCustom(null)}><RotateCcw className="mr-1.5 h-4 w-4" /> คืนค่างวดปกติ</Button>
          )}
          {props.isAdmin && (
            <Button size="sm" onClick={() => setEditorOpen(true)}><Settings2 className="mr-1.5 h-4 w-4" /> ตั้งเป้า</Button>
          )}
          <Button variant="outline" size="sm" onClick={exportExcel}><Download className="mr-1.5 h-4 w-4" /> ส่งออก Excel</Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sales-board"><ArrowLeft className="mr-1.5 h-4 w-4" /> กลับ Sales Board</Link>
          </Button>
        </div>
      </div>

      {!props.unitCountAvailable && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <Info className="h-4 w-4 shrink-0" />
          ยังไม่ได้เพิ่มช่องจำนวนตู้ในฐานข้อมูล — ทุกการ์ดนับเป็น 1 ตู้
        </div>
      )}

      {/* ── บรรทัดสรุปแบบหัวไฟล์ต้นแบบ ── */}
      <p className="rounded-lg border bg-card px-3 py-2 text-sm font-medium">{summaryLine(targets, range)}</p>

      {/* ── การ์ดเป้า/ยอดจริง ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <GoalCard label="ขายตู้" unit="ตู้" actual={result.boothUnits} target={targets.booths} icon={Tag}
          tint="from-violet-100 to-violet-50/40 dark:from-violet-950/50 dark:to-zinc-900" text="text-violet-700 dark:text-violet-300"
          bar="bg-violet-500" border="border-violet-300 dark:border-violet-800" sub={`${result.booths.length} การ์ด`} />
        <GoalCard label="ขายงานอีเวนต์" unit="งาน" actual={result.eventCount} target={targets.events} icon={CalendarDays}
          tint="from-cyan-100 to-cyan-50/40 dark:from-cyan-950/50 dark:to-zinc-900" text="text-cyan-700 dark:text-cyan-300"
          bar="bg-cyan-500" border="border-cyan-300 dark:border-cyan-800" />
      </div>

      {/* ── กล่องต้องตรวจสอบ ── */}
      {warningGroups.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50/60 p-3 dark:border-rose-800 dark:bg-rose-950/30">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4" /> ต้องตรวจสอบ ({result.warnings.length})
            <span className="text-xs font-normal text-muted-foreground">— แก้ในการ์ด CRM ก่อนจ่ายค่าคอม</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {warningGroups.map((g) => (
              <div key={g.code}>
                <div className="mb-1 text-xs font-semibold">{WARNING_LABEL[g.code]} · {g.items.length}</div>
                <ul className="space-y-0.5 text-xs">
                  {g.items.map((w, i) => (
                    <li key={`${w.leadId}-${i}`}>
                      <Link href={`/crm/${w.leadId}`} className="font-medium text-rose-700 hover:underline dark:text-rose-300">{w.customer}</Link>
                      <span className="text-muted-foreground"> — {w.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ตาราง 2 ตาราง (จอใหญ่วางคู่ จอเล็กเรียงลง) ── */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <RowTable title={`ตู้ — ${result.boothUnits} ตู้ (${result.booths.length} การ์ด)`} headers={BOOTH_HEADERS} rows={result.booths}
          cells={(r) => [r.no, thaiDay(r.lockDate), r.units, r.customer, r.quotationRef || '—', statusLabel(r.status)]}
          onOpen={(id) => router.push(`/crm/${id}`)} />
        <RowTable title={`อีเวนต์ — ${result.eventCount} งาน`} headers={EVENT_HEADERS} rows={result.events}
          cells={(r) => [r.no, thaiDay(r.lockDate), thaiEventRange(r.eventDate, r.eventEndDate), r.customer, r.quotationRef || '—', statusLabel(r.status)]}
          onOpen={(id) => router.push(`/crm/${id}`)} />
      </div>

      {result.unclassified.length > 0 && (
        <RowTable title={`ยังไม่ระบุประเภทงาน (ไม่ถูกนับ) — ${result.unclassified.length} การ์ด`} headers={EVENT_HEADERS} rows={result.unclassified}
          cells={(r) => [r.no, thaiDay(r.lockDate), thaiEventRange(r.eventDate, r.eventEndDate), r.customer, r.quotationRef || '—', statusLabel(r.status)]}
          onOpen={(id) => router.push(`/crm/${id}`)} muted />
      )}

      {props.isAdmin && (
        <CommissionTargetDialog key={editorOpen ? `open-${month}` : 'closed'} open={editorOpen} onOpenChange={setEditorOpen}
          month={month} initial={targets} onSaved={() => router.refresh()} />
      )}
    </div>
  )
}

// ── การ์ดยอดจริงเทียบเป้า ──
function GoalCard({ label, unit, actual, target, icon: Icon, tint, text, bar, border, sub }: {
  label: string; unit: string; actual: number; target: number | null | undefined; icon: typeof Tag
  tint: string; text: string; bar: string; border: string; sub?: string
}) {
  const hasTarget = !!target && target > 0
  const pct = hasTarget ? Math.round((actual / (target as number)) * 100) : 0
  const left = hasTarget ? Math.max(0, (target as number) - actual) : 0
  return (
    <div className={cn('rounded-xl border bg-gradient-to-br p-4', tint, border)}>
      <div className="flex items-center justify-between">
        <span className={cn('flex items-center gap-1.5 text-sm font-semibold', text)}><Icon className="h-4 w-4" /> {label}</span>
        {hasTarget && <span className={cn('text-sm font-bold tabular-nums', text)}>{pct}%</span>}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tabular-nums">{actual}</span>
        {hasTarget && <span className="text-lg text-muted-foreground tabular-nums">/ {target}</span>}
        <span className="text-sm text-muted-foreground">{unit}</span>
        {sub && <span className="ml-auto text-xs text-muted-foreground">{sub}</span>}
      </div>
      {hasTarget ? (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div className={cn('h-full rounded-full', bar)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {left > 0 ? `เหลืออีก ${left} ${unit} ถึงเป้า` : 'ถึงเป้าแล้ว'}
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">ยังไม่ได้ตั้งเป้างวดนี้</p>
      )}
    </div>
  )
}

// ── ตารางรายการ (คลิกแถว = ไปการ์ด CRM) ──
function RowTable({ title, headers, rows, cells, onOpen, muted }: {
  title: string; headers: readonly string[]; rows: Row[]
  cells: (r: Row) => (string | number)[]; onOpen: (leadId: string) => void; muted?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-xl border bg-card p-3', muted && 'border-dashed')}>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีรายการในช่วงนี้</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.leadId} onClick={() => onOpen(r.leadId)}
                  className={cn('cursor-pointer border-b last:border-0 hover:bg-muted/60', muted && 'text-muted-foreground')}>
                  {cells(r).map((c, i) => (
                    <td key={i} className={cn('px-2 py-1.5', i === 0 || i === 2 ? 'tabular-nums' : '', i === 3 ? 'font-medium' : 'whitespace-nowrap')}>
                      {/* ชื่อลูกค้าเป็นลิงก์จริง — ให้คีย์บอร์ด/โปรแกรมอ่านหน้าจอเข้าการ์ดได้ (คลิกทั้งแถวเป็นทางลัดของเมาส์) */}
                      {i === 3 ? <Link href={`/crm/${r.leadId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{c}</Link> : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── dialog ตั้งเป้าค่าคอม (admin) — parent เปลี่ยน key ทุกครั้งที่เปิด → draft เริ่มจากค่าล่าสุด ──
function CommissionTargetDialog({ open, onOpenChange, month, initial, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; month: string; initial: CommissionTargets; onSaved: () => void
}) {
  const [booths, setBooths] = useState(initial.booths ? String(initial.booths) : '')
  const [events, setEvents] = useState(initial.events ? String(initial.events) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (next: { booths: number | null; events: number | null }) => {
    setSaving(true); setError(null)
    const res = await saveCommissionTargets(month, next)
    setSaving(false)
    if ('error' in res && res.error) { setError(res.error); return }
    onOpenChange(false); onSaved()
  }
  const num = (v: string) => (Number(v) > 0 ? Math.floor(Number(v)) : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>ตั้งเป้าค่าคอม — งวด {periodLabel(month)}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <Label htmlFor="cm-booths" className="flex items-center gap-1.5 text-sm"><Tag className="h-4 w-4 text-muted-foreground" /> ขายตู้ (ตู้)</Label>
            <Input id="cm-booths" type="number" inputMode="numeric" min={0} placeholder="—" className="w-32 text-right"
              value={booths} onChange={(e) => setBooths(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <Label htmlFor="cm-events" className="flex items-center gap-1.5 text-sm"><CalendarDays className="h-4 w-4 text-muted-foreground" /> ขายงานอีเวนต์ (งาน)</Label>
            <Input id="cm-events" type="number" inputMode="numeric" min={0} placeholder="—" className="w-32 text-right"
              value={events} onChange={(e) => setEvents(e.target.value)} />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" disabled={saving} onClick={() => submit({ booths: null, events: null })} className="text-muted-foreground">ล้างเป้างวดนี้</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button disabled={saving} onClick={() => submit({ booths: num(booths), events: num(events) })}>บันทึก</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
