'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowLeft, BanknoteArrowUp, Calculator, Eye, Lock, RefreshCw,
  Search, Trash2, Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney, periodLabel } from '../../format'
import { SlipStatusBadge } from '../../components/slip-status-badge'
import type { EmploymentType } from '../../compute'
import type { SalaryProfileListRow } from '../../settings/actions'
import {
  computeSlips, deleteSlip, finalizeRemainingSlips, finalizeSlip, markSlipPaid,
  type RunHeader, type RunSlipRow, type SkippedUser,
} from '../../actions'

interface Props {
  run: RunHeader
  slips: RunSlipRow[]
  people: SalaryProfileListRow[]
  departments: string[]
}

const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  fulltime: 'ประจำ',
  freelance: 'ฟรีแลนซ์',
  intern: 'นักศึกษาฝึกงาน',
}

const ALL = '__all__'
const NO_DEPARTMENT = '__none__'

function displayName(p: { full_name: string | null; nickname: string | null }): string {
  return p.full_name || p.nickname || '(ไม่มีชื่อ)'
}

export default function RunView({ run, slips, people, departments }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // ── เลือกคน ──────────────────────────────────────────────────────────────
  const [dept, setDept] = useState(ALL)
  const [employment, setEmployment] = useState(ALL)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<SkippedUser[]>([])
  const [deleteTarget, setDeleteTarget] = useState<RunSlipRow | null>(null)

  // ── ปิดงวด / จ่ายแล้ว ────────────────────────────────────────────────────
  /** สลิปที่กำลังยืนยันเปลี่ยนสถานะ — dialog เดียวใช้ได้ทั้งสองปุ่ม */
  const [statusTarget, setStatusTarget] = useState<
    { slip: RunSlipRow; action: 'finalize' | 'paid' } | null
  >(null)
  const [confirmFinalizeAll, setConfirmFinalizeAll] = useState(false)
  /** คนที่ปิดงวดไม่ได้ตอนกด "ปิดงวดที่เหลือทั้งหมด" ครั้งล่าสุด */
  const [finalizeSkipped, setFinalizeSkipped] = useState<SkippedUser[]>([])

  /** สถานะสลิปของแต่ละคนในงวดนี้ — ใช้ทำป้ายในรายชื่อ */
  const slipByUser = useMemo(() => new Map(slips.map(s => [s.user_id, s])), [slips])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return people.filter(p => {
      if (dept !== ALL) {
        const d = p.department || ''
        if (dept === NO_DEPARTMENT ? !!d : d !== dept) return false
      }
      // คนที่ยังไม่ตั้งค่าเงินเดือนไม่มีประเภทการจ้างจริง — ตัดออกเมื่อกรองประเภท
      if (employment !== ALL && (!p.configured || p.employment_type !== employment)) return false
      if (needle) {
        const hay = `${p.full_name || ''} ${p.nickname || ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [people, dept, employment, q])

  /** เลือกได้เฉพาะคนที่ตั้งค่าเงินเดือนแล้ว */
  const selectableIds = useMemo(
    () => filtered.filter(p => p.configured).map(p => p.user_id),
    [filtered]
  )
  const allFilteredSelected =
    selectableIds.length > 0 && selectableIds.every(id => selected.has(id))

  function toggleOne(userId: string, on: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      if (on) next.add(userId)
      else next.delete(userId)
      return next
    })
  }

  function toggleAllFiltered(on: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      for (const id of selectableIds) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function runCompute(userIds: string[], label: string) {
    if (userIds.length === 0) {
      toast.error('ยังไม่ได้เลือกคน')
      return
    }
    startTransition(async () => {
      const res = await computeSlips(run.id, userIds)
      if (res.error) {
        toast.error(res.error)
        return
      }
      const list = res.skipped || []
      setSkipped(list)
      const computed = res.computed || 0
      if (computed === 0) toast.error(`${label}ไม่สำเร็จ — ข้ามทั้งหมด ${list.length} คน`)
      else if (list.length > 0) toast.success(`${label} ${computed} คน · ข้าม ${list.length} คน`)
      else toast.success(`${label} ${computed} คนแล้ว`)
      setSelected(new Set())
      router.refresh()
    })
  }

  function confirmDelete() {
    const target = deleteTarget
    if (!target) return
    startTransition(async () => {
      const res = await deleteSlip(target.id)
      setDeleteTarget(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`ลบสลิปของ${displayName(target)}แล้ว`)
      router.refresh()
    })
  }

  /** ยืนยันปุ่มในแถว — ปิดงวด (ร่าง) หรือ จ่ายแล้ว (ปิดงวดแล้ว) */
  function confirmStatusChange() {
    const target = statusTarget
    if (!target) return
    const { slip, action } = target
    startTransition(async () => {
      const res = action === 'finalize' ? await finalizeSlip(slip.id) : await markSlipPaid(slip.id)
      setStatusTarget(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        action === 'finalize'
          ? `ปิดงวดสลิปของ${displayName(slip)}แล้ว`
          : `บันทึกว่าจ่ายเงินให้${displayName(slip)}แล้ว`
      )
      router.refresh()
    })
  }

  function runFinalizeAll() {
    startTransition(async () => {
      const res = await finalizeRemainingSlips(run.id)
      setConfirmFinalizeAll(false)
      if (res.error) {
        toast.error(res.error)
        return
      }
      const list = res.skipped || []
      const finalized = res.finalized || 0
      setFinalizeSkipped(list)
      if (finalized === 0 && list.length === 0) toast.error('ไม่มีสลิปร่างให้ปิดงวด')
      else if (finalized === 0) toast.error(`ปิดงวดไม่สำเร็จ — ข้ามทั้งหมด ${list.length} คน`)
      else if (list.length > 0) toast.success(`ปิดงวด ${finalized} คน · ข้าม ${list.length} คน`)
      else toast.success(`ปิดงวด ${finalized} คนแล้ว`)
      router.refresh()
    })
  }

  const slipTotal = slips.reduce((sum, s) => sum + s.total, 0)
  const draftCount = slips.filter(s => s.status === 'draft').length

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── หัวงวด ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/salary/runs"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            งวดคำนวณ
          </Link>
          <h1 className="text-2xl font-semibold">งวด{periodLabel(run.period_key)}</h1>
          <p className="text-sm text-muted-foreground">
            {formatThaiDate(run.period_start)} – {formatThaiDate(run.period_end)}
            {run.note ? ` · ${run.note}` : ''}
          </p>
        </div>
      </div>

      {/* ── เลือกคนเข้างวด ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <h2 className="font-medium">เลือกคนเข้างวด</h2>
            </div>
            <Button
              onClick={() => runCompute(Array.from(selected), 'คำนวณ')}
              disabled={isPending || selected.size === 0}
            >
              <Calculator className="size-4" />
              คำนวณที่เลือก{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อ"
                value={q}
                onChange={e => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger>
                <SelectValue placeholder="แผนก" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกแผนก</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
                <SelectItem value={NO_DEPARTMENT}>ไม่ระบุแผนก</SelectItem>
              </SelectContent>
            </Select>
            <Select value={employment} onValueChange={setEmployment}>
              <SelectTrigger>
                <SelectValue placeholder="ประเภทการจ้าง" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกประเภทการจ้าง</SelectItem>
                <SelectItem value="fulltime">ประจำ</SelectItem>
                <SelectItem value="freelance">ฟรีแลนซ์</SelectItem>
                <SelectItem value="intern">นักศึกษาฝึกงาน</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 border-y py-2">
            <Checkbox
              id="salary-select-all"
              checked={allFilteredSelected}
              disabled={selectableIds.length === 0}
              onCheckedChange={v => toggleAllFiltered(v === true)}
            />
            <Label htmlFor="salary-select-all" className="text-sm font-normal">
              เลือกทั้งหมดที่กรองอยู่ ({selectableIds.length} คน)
            </Label>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                ล้างที่เลือก ({selected.size})
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">ไม่พบคนที่ตรงกับตัวกรอง</p>
            ) : (
              <ul className="divide-y">
                {filtered.map(p => {
                  const slip = slipByUser.get(p.user_id)
                  return (
                    <li key={p.user_id} className="flex items-center gap-3 py-2">
                      <Checkbox
                        id={`salary-person-${p.user_id}`}
                        checked={selected.has(p.user_id)}
                        disabled={!p.configured}
                        onCheckedChange={v => toggleOne(p.user_id, v === true)}
                      />
                      <Label
                        htmlFor={`salary-person-${p.user_id}`}
                        className="min-w-0 flex-1 cursor-pointer font-normal"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{displayName(p)}</span>
                          {p.nickname && p.full_name && (
                            <span className="text-xs text-muted-foreground">({p.nickname})</span>
                          )}
                          {p.department && (
                            <span className="text-xs text-muted-foreground">{p.department}</span>
                          )}
                          {p.configured ? (
                            <Badge variant="outline" className="text-[11px]">
                              {EMPLOYMENT_LABEL[p.employment_type]}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-[11px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-500"
                            >
                              ยังไม่ตั้งค่าเงินเดือน
                            </Badge>
                          )}
                          {slip && <SlipStatusBadge status={slip.status} className="text-[11px]" />}
                        </span>
                      </Label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ผลการคำนวณครั้งล่าสุด — บอกว่าใครถูกข้ามเพราะอะไร */}
          {skipped.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-medium text-amber-800 dark:text-amber-400">
                ข้าม {skipped.length} คน
              </p>
              <ul className="mt-1 space-y-0.5 text-amber-700 dark:text-amber-500">
                {skipped.map(s => (
                  <li key={s.user_id}>{s.name} — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ตารางสลิปในงวด ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <h2 className="font-medium">สลิปในงวดนี้</h2>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {slips.length} สลิป · ยอดรวม{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {fmtMoney(slipTotal)}
                </span>{' '}
                บาท
              </p>
              <Button
                variant="outline"
                disabled={isPending || draftCount === 0}
                onClick={() => setConfirmFinalizeAll(true)}
                title={
                  draftCount === 0
                    ? 'ไม่มีสลิปร่างเหลือในงวดนี้'
                    : `ปิดงวดสลิปร่างที่เหลือ ${draftCount} ใบ`
                }
              >
                <Lock className="size-4" />
                ปิดงวดที่เหลือทั้งหมด{draftCount > 0 ? ` (${draftCount})` : ''}
              </Button>
            </div>
          </div>

          {/* ผลการปิดงวดครั้งล่าสุด — ใครยังปิดไม่ได้เพราะอะไร */}
          {finalizeSkipped.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-medium text-amber-800 dark:text-amber-400">
                ยังปิดงวดไม่ได้ {finalizeSkipped.length} คน
              </p>
              <ul className="mt-1 space-y-0.5 text-amber-700 dark:text-amber-500">
                {finalizeSkipped.map(s => (
                  <li key={s.user_id}>{s.name} — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {slips.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              ยังไม่มีสลิปในงวดนี้ — เลือกคนด้านบนแล้วกด &ldquo;คำนวณที่เลือก&rdquo;
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead>ประเภทการจ้าง</TableHead>
                  <TableHead className="text-right">ยอดสุทธิ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>คำเตือน</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slips.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link href={`/salary/${s.id}`} className="hover:underline">
                        {displayName(s)}
                      </Link>
                      {s.nickname && s.full_name && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({s.nickname})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {EMPLOYMENT_LABEL[s.employment_type]}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fmtMoney(s.total)}
                    </TableCell>
                    <TableCell><SlipStatusBadge status={s.status} /></TableCell>
                    <TableCell>
                      {s.warnings.length === 0 ? (
                        <span className="text-xs text-muted-foreground">–</span>
                      ) : (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              title={`มีคำเตือน ${s.warnings.length} ข้อ`}
                              className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-500"
                            >
                              <AlertTriangle className="size-3.5" />
                              {s.warnings.length}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-80">
                            <p className="mb-2 text-sm font-medium">
                              คำเตือน {s.warnings.length} ข้อ
                            </p>
                            <ul className="space-y-1 text-xs text-muted-foreground">
                              {s.warnings.map((w, i) => (
                                <li key={`${w.code}-${w.date}-${w.checkin_id || i}`}>• {w.message}</li>
                              ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/salary/${s.id}`}>
                            <Eye className="size-4" />
                            เปิดดู
                          </Link>
                        </Button>
                        {s.status === 'draft' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() => runCompute([s.user_id], 'คำนวณใหม่')}
                              title="คำนวณใหม่จากข้อมูลต้นทางล่าสุด"
                            >
                              <RefreshCw className="size-4" />
                              คำนวณใหม่
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() => setStatusTarget({ slip: s, action: 'finalize' })}
                              title="ปิดงวดสลิปใบนี้ — ปิดแล้วแก้ตัวเลขไม่ได้อีก"
                            >
                              <Lock className="size-4" />
                              ปิดงวด
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() => setDeleteTarget(s)}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                              title="เอาคนนี้ออกจากงวด"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                        {s.status === 'finalized' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => setStatusTarget({ slip: s, action: 'paid' })}
                            title="บันทึกว่าโอนเงินให้คนนี้แล้ว"
                          >
                            <BanknoteArrowUp className="size-4" />
                            จ่ายแล้ว
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={v => { if (!v) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบสลิปร่าง</AlertDialogTitle>
            <AlertDialogDescription>
              เอา{deleteTarget ? displayName(deleteTarget) : 'คนนี้'}ออกจากงวด
              {periodLabel(run.period_key)} — ค่าที่แก้มือและรายการปรับมือในสลิปนี้จะหายไปด้วย
              คำนวณใหม่ได้ภายหลัง
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isPending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              ลบสลิป
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!statusTarget} onOpenChange={v => { if (!v) setStatusTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.action === 'paid' ? 'บันทึกว่าจ่ายแล้ว' : 'ปิดงวดสลิป'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.action === 'paid' ? (
                <>
                  บันทึกว่าโอนเงินให้{statusTarget ? displayName(statusTarget.slip) : 'คนนี้'}{' '}
                  {statusTarget ? fmtMoney(statusTarget.slip.total) : '0'} บาทแล้ว
                  โดยลงวันที่ {formatThaiDate(new Date())} และชื่อผู้กดไว้ในสลิป
                </>
              ) : (
                <>
                  ปิดงวดสลิปของ{statusTarget ? displayName(statusTarget.slip) : 'คนนี้'} ยอดสุทธิ{' '}
                  {statusTarget ? fmtMoney(statusTarget.slip.total) : '0'} บาท —
                  ปิดงวดแล้วจะแก้ตัวเลขไม่ได้อีก และเจ้าของสลิปจะได้รับแจ้งเตือนทันที
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange} disabled={isPending}>
              {statusTarget?.action === 'paid' ? 'จ่ายแล้ว' : 'ปิดงวด'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmFinalizeAll}
        onOpenChange={v => { if (!v) setConfirmFinalizeAll(false) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดงวดที่เหลือทั้งหมด</AlertDialogTitle>
            <AlertDialogDescription>
              ปิดงวดสลิปร่างที่เหลือในงวด{periodLabel(run.period_key)} ทั้งหมด {draftCount} ใบ —
              ปิดงวดแล้วจะแก้ตัวเลขไม่ได้อีก และเจ้าของสลิปแต่ละใบจะได้รับแจ้งเตือน
              ใบที่ยังกรอกยอดรันเนอร์ไม่ครบจะถูกข้ามไว้ให้กรอกก่อน
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={runFinalizeAll} disabled={isPending}>
              ปิดงวดที่เหลือ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
