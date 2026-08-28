'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowLeft, BanknoteArrowUp, FileDown, Landmark, Lock, Receipt,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney, slipTitle } from '../format'
import { SlipStatusBadge } from '../components/slip-status-badge'
import SlipDayTable from './slip-day-table'
import { hasMissingAmounts } from '../compute'
import {
  finalizeSlip, markSlipPaid, syncSlipToCosts,
  type SlipCheckinRow, type SlipDetail, type SlipEventOption,
} from '../actions'
import type { SalaryDutyRow } from '../settings/actions'

interface Props {
  slip: SlipDetail
  isAdmin: boolean
  /** ข้อมูลต้นทางในงวด — ว่างเสมอเมื่อไม่ใช่ admin */
  checkins: SlipCheckinRow[]
  duties: SalaryDutyRow[]
  /** ตัวเลือกอีเวนต์รอบๆ งวด สำหรับผูกเช็คอิน — ว่างเสมอเมื่อไม่ใช่ admin */
  events: SlipEventOption[]
}

const EMPLOYMENT_LABEL = { fulltime: 'ประจำ', freelance: 'ฟรีแลนซ์', intern: 'นักศึกษาฝึกงาน' } as const

export default function SlipView({ slip: initialSlip, isAdmin, checkins, duties, events }: Props) {
  const router = useRouter()
  // ตารางรายวันคืนสลิปที่คำนวณใหม่แล้วกลับมาทุกครั้งที่แก้ — เก็บไว้ใน state
  // เพื่อให้ยอด/คำเตือนบนหัวขยับทันทีโดยไม่ต้องรอ server component รอบใหม่
  const [slip, setSlip] = useState(initialSlip)
  const [seenSlip, setSeenSlip] = useState(initialSlip)
  if (seenSlip !== initialSlip) {
    setSeenSlip(initialSlip)
    setSlip(initialSlip)
  }

  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmPaid, setConfirmPaid] = useState(false)
  const [isPending, startTransition] = useTransition()

  const name = slip.full_name || slip.nickname || '(ไม่มีชื่อ)'
  const hasBank = !!(slip.bank_name || slip.bank_account_number || slip.account_holder_name)
  // แก้ได้เฉพาะ admin + สลิปร่าง — เจ้าของสลิปและสลิปที่ปิดงวดแล้วอ่านอย่างเดียว
  // (ทุก action ตรวจซ้ำฝั่ง server และ trigger ที่ DB กันอีกชั้น)
  const editable = isAdmin && slip.status === 'draft'
  // เกณฑ์เดียวกับที่ /api/pdf/salary/[slipId] บังคับ (ผ่าน getSlipForView ตัวเดียวกัน) —
  // admin โหลดได้ทุกสถานะ (ร่างได้ PDF ที่มีลายน้ำ "ร่าง") เจ้าของได้เฉพาะที่ปิดงวดแล้ว
  const canDownloadPdf = isAdmin || slip.status !== 'draft'
  // เกณฑ์เดียวกับที่ finalizeSlip ใช้ฝั่ง server — ปุ่มจึงไม่พาไปเจอ error ที่รู้ล่วงหน้าอยู่แล้ว
  const missingAmounts = hasMissingAmounts(slip.lines)
  const todayLabel = formatThaiDate(new Date())

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

  /** ดันบรรทัดค่าสตาฟเข้าโมดูลต้นทุนอีกครั้ง — ปลอดภัยที่จะกดซ้ำ (แถวเดิมถูกอัปเดต) */
  function runSyncCosts() {
    startTransition(async () => {
      const res = await syncSlipToCosts(slip.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      const skipped = res.skipped?.length || 0
      toast.success(
        skipped > 0
          ? `ส่งเข้าต้นทุน ${res.synced} รายการ · ข้ามรันเนอร์ที่ผูกอีเวนต์ไม่ได้ ${skipped} รายการ`
          : `ส่งเข้าต้นทุน ${res.synced} รายการแล้ว`
      )
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
              {slipTitle(slip)} ·{' '}
              {formatThaiDate(slip.period_start)} – {formatThaiDate(slip.period_end)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SlipStatusBadge status={slip.status} />
              <Badge variant="outline">{EMPLOYMENT_LABEL[slip.employment_type]}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {canDownloadPdf && (
              <Button variant="outline" asChild>
                <a
                  href={`/api/pdf/salary/${slip.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileDown className="size-4" />
                  ดาวน์โหลด PDF
                </a>
              </Button>
            )}
            {editable && (
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
            )}
            {isAdmin && slip.status !== 'draft' && (
              <div className="flex flex-col items-start gap-1">
                <Button variant="outline" disabled={isPending} onClick={runSyncCosts}>
                  <Receipt className="size-4" />
                  ส่งเข้าต้นทุนอีกครั้ง
                </Button>
                <span className="max-w-56 text-xs text-muted-foreground">
                  {slip.costs_synced_at
                    ? `ส่งเข้าต้นทุนล่าสุด ${formatThaiDate(slip.costs_synced_at)}`
                    : 'ยังไม่ได้ส่งเข้าโมดูลต้นทุน'}
                </span>
              </div>
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

      {/* ── คำเตือน — ข้อมูลต้นทางที่ยังไม่ครบ (แก้ได้ตรงในตารางรายวันด้านล่าง) ── */}
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

      {/* ── ตารางรายวัน — ข้อมูลต้นทางกับเงินของวันเดียวกันอยู่แถวเดียว ─────── */}
      <SlipDayTable
        slip={slip}
        checkins={checkins}
        duties={duties}
        events={events}
        editable={editable}
        onSlipChange={setSlip}
      />

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
