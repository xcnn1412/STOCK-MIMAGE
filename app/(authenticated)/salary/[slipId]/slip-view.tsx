'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, BanknoteArrowUp, Landmark, Lock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney, periodLabel } from '../format'
import { SlipStatusBadge } from '../components/slip-status-badge'
import SlipLinesTable from '../components/slip-lines-table'
import SlipCheckinsTable from '../components/slip-checkins-table'
import { hasMissingAmounts } from '../compute'
import {
  finalizeSlip, markSlipPaid, recomputeSlip,
  type SlipCheckinRow, type SlipDetail,
} from '../actions'
import type { SalaryDutyRow } from '../settings/actions'

interface Props {
  slip: SlipDetail
  isAdmin: boolean
  /** ข้อมูลต้นทางในงวด — ว่างเสมอเมื่อไม่ใช่ admin */
  checkins: SlipCheckinRow[]
  duties: SalaryDutyRow[]
}

const EMPLOYMENT_LABEL = { fulltime: 'ประจำ', freelance: 'ฟรีแลนซ์' } as const

export default function SlipView({ slip, isAdmin, checkins, duties }: Props) {
  const router = useRouter()
  const [confirmRecompute, setConfirmRecompute] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmPaid, setConfirmPaid] = useState(false)
  const [isPending, startTransition] = useTransition()

  const name = slip.full_name || slip.nickname || '(ไม่มีชื่อ)'
  const hasBank = !!(slip.bank_name || slip.bank_account_number || slip.account_holder_name)
  // แก้ได้เฉพาะ admin + สลิปร่าง — เจ้าของสลิปและสลิปที่ปิดงวดแล้วอ่านอย่างเดียว
  // (ทุก action ตรวจซ้ำฝั่ง server และ trigger ที่ DB กันอีกชั้น)
  const editable = isAdmin && slip.status === 'draft'
  // เกณฑ์เดียวกับที่ finalizeSlip ใช้ฝั่ง server — ปุ่มจึงไม่พาไปเจอ error ที่รู้ล่วงหน้าอยู่แล้ว
  const missingAmounts = hasMissingAmounts(slip.lines)
  const todayLabel = formatThaiDate(new Date())

  function runRecompute() {
    startTransition(async () => {
      const res = await recomputeSlip(slip.id)
      setConfirmRecompute(false)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('คำนวณสลิปใหม่แล้ว')
      router.refresh()
    })
  }

  function runFinalize() {
    startTransition(async () => {
      const res = await finalizeSlip(slip.id)
      setConfirmFinalize(false)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('ปิดงวดสลิปแล้ว — แจ้งเตือนเจ้าของสลิปเรียบร้อย')
      router.refresh()
    })
  }

  function runMarkPaid() {
    startTransition(async () => {
      const res = await markSlipPaid(slip.id)
      setConfirmPaid(false)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('บันทึกว่าจ่ายแล้ว')
      router.refresh()
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── หัวสลิป ────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <Link
          href={isAdmin ? `/salary/runs/${slip.run_id}` : '/salary'}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {isAdmin ? 'กลับไปหน้างวด' : 'สลิปของฉัน'}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{name}</h1>
            <p className="text-sm text-muted-foreground">
              งวด{periodLabel(slip.period_key)} ·{' '}
              {formatThaiDate(slip.period_start)} – {formatThaiDate(slip.period_end)} ·{' '}
              {EMPLOYMENT_LABEL[slip.employment_type]}
            </p>
            <div className="mt-2">
              <SlipStatusBadge status={slip.status} />
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {editable && (
              <>
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() => setConfirmRecompute(true)}
                >
                  <RefreshCw className="size-4" />
                  คำนวณใหม่
                </Button>
                <div className="flex flex-col items-start gap-1">
                  <Button
                    disabled={isPending || missingAmounts}
                    onClick={() => setConfirmFinalize(true)}
                    title={missingAmounts ? 'กรอกยอดรันเนอร์ให้ครบก่อนปิดงวด' : 'ปิดงวดสลิปใบนี้'}
                  >
                    <Lock className="size-4" />
                    ปิดงวด
                  </Button>
                  {missingAmounts && (
                    <span className="max-w-48 text-xs text-amber-700 dark:text-amber-500">
                      กรอกยอดรันเนอร์ให้ครบก่อนปิดงวด
                    </span>
                  )}
                </div>
              </>
            )}
            {isAdmin && slip.status === 'finalized' && (
              <Button disabled={isPending} onClick={() => setConfirmPaid(true)}>
                <BanknoteArrowUp className="size-4" />
                จ่ายแล้ว
              </Button>
            )}
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums">{fmtMoney(slip.total)}</div>
              <div className="text-xs text-muted-foreground">ยอดสุทธิ (บาท)</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── คำเตือน — ข้อมูลต้นทางที่ยังไม่ครบ (แก้ในตารางเช็คอินด้านล่างแล้วคำนวณใหม่) ── */}
      {slip.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-400">
            <AlertTriangle className="size-4" />
            คำเตือน {slip.warnings.length} ข้อ
          </p>
          <ul className="mt-1.5 space-y-0.5 text-sm text-amber-700 dark:text-amber-500">
            {slip.warnings.map((w, i) => (
              <li key={`${w.code}-${w.date}-${w.checkin_id || i}`}>• {w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── รายการในสลิป ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <SlipLinesTable
            lines={slip.lines}
            adjustments={slip.adjustments}
            employmentType={slip.employment_type}
            baseSalary={slip.base_salary}
            total={slip.total}
            slipId={slip.id}
            editable={editable}
          />
        </CardContent>
      </Card>

      {/* ── ข้อมูลต้นทางในงวด (admin เท่านั้น) ─────────────────────────────── */}
      {isAdmin && (
        <Card>
          <CardContent className="p-4">
            <SlipCheckinsTable
              slipId={slip.id}
              userId={slip.user_id}
              periodStart={slip.period_start}
              periodEnd={slip.period_end}
              checkins={checkins}
              duties={duties}
              editable={editable}
            />
          </CardContent>
        </Card>
      )}

      {/* ── บัญชีรับเงิน (แสดงอย่างเดียว — แก้ที่หน้าโปรไฟล์) ─────────────────── */}
      {hasBank && (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Landmark className="size-4 text-muted-foreground" />
              บัญชีรับเงิน
            </p>
            <p className="text-muted-foreground">
              {slip.bank_name || '-'} · {slip.bank_account_number || '-'}
              {slip.account_holder_name ? ` · ${slip.account_holder_name}` : ''}
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {slip.computed_at && <>คำนวณล่าสุด {formatThaiDate(slip.computed_at)}</>}
        {slip.finalized_at && (
          <>
            {' · '}ปิดงวด {formatThaiDate(slip.finalized_at)}
            {slip.finalized_by_name ? ` โดย ${slip.finalized_by_name}` : ''}
          </>
        )}
        {slip.paid_at && (
          <>
            {' · '}จ่ายแล้ว {formatThaiDate(slip.paid_at)}
            {slip.paid_by_name ? ` โดย ${slip.paid_by_name}` : ''}
          </>
        )}
      </p>

      <AlertDialog
        open={confirmRecompute}
        onOpenChange={v => { if (!v) setConfirmRecompute(false) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>คำนวณสลิปใหม่</AlertDialogTitle>
            <AlertDialogDescription>
              ดึงข้อมูลต้นทาง (เช็คอิน หน้าที่ จังหวัด อัตราล่าสุด) ในงวดนี้มาคิดใหม่ทั้งใบ —
              บรรทัดที่แก้มือไว้ ยอดรันเนอร์ที่กรอกแล้ว และรายการปรับมือ ยังคงอยู่เหมือนเดิม
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={runRecompute} disabled={isPending}>
              คำนวณใหม่
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmFinalize}
        onOpenChange={v => { if (!v) setConfirmFinalize(false) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดงวดสลิปของ{name}</AlertDialogTitle>
            <AlertDialogDescription>
              ปิดงวดแล้วจะแก้ตัวเลขไม่ได้อีก (ลบก็ไม่ได้ — ฐานข้อมูลปฏิเสธให้เอง)
              ยอดสุทธิที่จะปิด {fmtMoney(slip.total)} บาท ·
              {name}จะได้รับแจ้งเตือนและเห็นสลิปใบนี้ทันที
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={runFinalize} disabled={isPending}>
              ปิดงวด
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPaid} onOpenChange={v => { if (!v) setConfirmPaid(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>บันทึกว่าจ่ายแล้ว</AlertDialogTitle>
            <AlertDialogDescription>
              บันทึกว่าโอนเงินให้{name} {fmtMoney(slip.total)} บาทแล้ว
              โดยลงวันที่ {todayLabel} และชื่อผู้กดไว้ในสลิป
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={runMarkPaid} disabled={isPending}>
              จ่ายแล้ว
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
