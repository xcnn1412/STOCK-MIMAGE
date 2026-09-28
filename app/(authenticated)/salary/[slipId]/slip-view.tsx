'use client'

// ============================================================================
// หน้าสลิปหนึ่งใบ — spec: docs/specs/salary-slip-daily-ui.md
//
// ประกอบร่าง: SlipHeader (ติดขอบบน) → UnpaidPeriodsNotice → PendingChecklist
//            → SlipDayTable (≥ md) / SlipDayCards (< md)
//            → บัญชีรับเงิน → ReopenHistory → บรรทัดสรุปท้ายหน้า
//
// ที่นี่เป็นเจ้าของ "สถานะสลิปฝั่ง client" ตัวเดียว (ทุกการแก้ในตารางคืนสลิปใหม่มา)
// และเป็นที่เดียวที่ถือ dialog ยืนยัน: ปิดงวด / จ่ายแล้ว / เปิดแก้ไข / คำนวณใหม่ทั้งใบ
// ============================================================================

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Landmark } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney } from '../format'
import SlipDayTable from './slip-day-table'
import SlipDayCards from './slip-day-cards'
import SlipHeader from './components/slip-header'
import PendingChecklist from './components/pending-checklist'
import ReopenDialog from './components/reopen-dialog'
import ReopenHistory from './components/reopen-history'
import UnpaidPeriodsNotice from '../components/unpaid-periods-notice'
import { useHighlightRow } from './components/use-highlight-row'
import { useSlipEdits } from './components/use-slip-edits'
import { pendingItems, type SlipCalcInputs } from '../compute'
import {
  finalizeSlip, markSlipPaid, recomputeSlip, syncSlipToCosts,
  type SlipCheckinRow, type SlipDetail, type SlipEventOption, type UnpaidPeriodRow,
} from '../actions'
import type { SalaryDutyRow } from '../settings/actions'

interface Props {
  slip: SlipDetail
  isAdmin: boolean
  /** เช็คอินของงวด — admin ได้ทั้งงวด (แก้ได้) · เจ้าของได้เฉพาะที่จ่ายในสลิปนี้ */
  checkins: SlipCheckinRow[]
  duties: SalaryDutyRow[]
  /** ตัวเลือกอีเวนต์รอบๆ งวด สำหรับผูกเช็คอิน — ว่างเสมอเมื่อไม่ใช่ admin */
  events: SlipEventOption[]
  /** ค่าที่ภาพตัวอย่างใช้ — null เมื่อไม่ใช่ admin / ไม่มีโปรไฟล์เงินเดือน */
  calc: SlipCalcInputs | null
  /** งานงวดก่อนของคนนี้ที่ยังไม่ถูกจ่าย — ว่างเสมอเมื่อไม่ใช่ admin */
  unpaidBefore: UnpaidPeriodRow[]
}

export default function SlipView({
  slip: initialSlip, isAdmin, checkins: initialCheckins, duties, events, calc, unpaidBefore,
}: Props) {
  const router = useRouter()
  // ตารางรายวันคืนสลิปที่คำนวณใหม่แล้วกลับมาทุกครั้งที่แก้ — เก็บไว้ใน state
  // เพื่อให้ยอด/งานค้างบนหัวขยับทันทีโดยไม่ต้องรอ server component รอบใหม่
  // แถวเช็คอินก็เป็น state เพื่อแพตช์ทันทีตอนแก้ (จัดกลุ่มรายวันถูกแม้แก้เวลาจนย้ายวัน)
  const [slip, setSlip] = useState(initialSlip)
  const [checkins, setCheckins] = useState(initialCheckins)

  // แก้ได้เฉพาะ admin + สลิปร่าง — เจ้าของสลิปและสลิปที่ปิดงวดแล้วอ่านอย่างเดียว
  // (ทุก action ตรวจซ้ำฝั่ง server และ trigger ที่ DB กันอีกชั้น)
  const editable = isAdmin && slip.status === 'draft'
  const edits = useSlipEdits({
    slip, checkins, duties, events,
    calc: editable ? calc : null,
    onSlipChange: setSlip,
    onCheckinsChange: setCheckins,
  })

  // ของจริงจาก server (props) มาใหม่ → รับเข้า state แต่ "รอ" ถ้ายังมีการแก้ค้างอยู่
  // ไม่งั้นหน้าที่ server วาดจากคำขอเก่าจะทับภาพตัวอย่างของการแก้ที่ใหม่กว่า
  // (รับทันทีที่คำขอสุดท้ายจบ — pattern เดียวกับ useDraftValue ใน inline-cells)
  const [applied, setApplied] = useState({ slip: initialSlip, checkins: initialCheckins })
  if (!edits.saving && (applied.slip !== initialSlip || applied.checkins !== initialCheckins)) {
    setApplied({ slip: initialSlip, checkins: initialCheckins })
    setSlip(initialSlip)
    setCheckins(initialCheckins)
  }

  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmPaid, setConfirmPaid] = useState(false)
  const [recomputeOpen, setRecomputeOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { highlightDate, jumpToDay } = useHighlightRow()

  const name = slip.full_name || slip.nickname || '(ไม่มีชื่อ)'
  const hasBank = !!(slip.bank_name || slip.bank_account_number || slip.account_holder_name)
  // เกณฑ์เดียวกับที่ finalizeSlip ใช้ฝั่ง server — ปุ่มจึงไม่พาไปเจอ error ที่รู้ล่วงหน้าอยู่แล้ว
  const pendingCount = pendingItems(slip.warnings, slip.accepted_warnings, slip.lines).count
  const todayLabel = formatThaiDate(new Date())

  function runFinalize() {
    startTransition(async () => {
      const res = await finalizeSlip(slip.id)
      setConfirmFinalize(false)
      if (res.error) {
        // ฝั่ง server อาจปฏิเสธด้วยเหตุที่หน้าจอยังไม่รู้ (เช่น "ยังมีงานค้าง…") — บอกตรงๆ
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

  /** คำนวณทั้งใบใหม่จากต้นทาง — ใช้เมื่อ rate card เปลี่ยน (ค่าที่แก้มือยังอยู่) */
  function runRecompute() {
    startTransition(async () => {
      const res = await recomputeSlip(slip.id)
      setRecomputeOpen(false)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('คำนวณสลิปใหม่แล้ว')
      router.refresh()
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <SlipHeader
        slip={slip}
        isAdmin={isAdmin}
        pendingCount={pendingCount}
        busy={isPending}
        saving={edits.saving}
        onFinalize={() => setConfirmFinalize(true)}
        onMarkPaid={() => setConfirmPaid(true)}
        onReopen={() => setReopenOpen(true)}
        onSyncCosts={runSyncCosts}
        onRecompute={() => setRecomputeOpen(true)}
      />

      {/* ── งานงวดก่อนที่ยังไม่ถูกจ่าย — สลิปนี้ไม่ได้จ่ายให้ ต้องปิดงวดสลิปของงวดนั้น ── */}
      <UnpaidPeriodsNotice rows={unpaidBefore} mode="person" />

      {/* ── งานค้างก่อนปิดงวด — คลิกแล้วเลื่อนไปแถววันนั้นในตาราง ─────────────── */}
      <PendingChecklist
        slip={slip}
        editable={editable}
        onJump={jumpToDay}
        onSlipChange={setSlip}
      />

      {/* ── มุมมองรายวัน — เดสก์ท็อปเป็นตาราง มือถือเป็นการ์ด (สลับด้วย CSS) ──
          ทั้งคู่อ่านจาก groupSlipByDay ชุดเดียวกัน แต่ id ของวันไม่ชนกัน
          (ตาราง = day-<date> · การ์ด = day-<date>-m) ให้ jumpToDay เลือกได้ */}
      <div className="hidden md:block">
        <SlipDayTable
          slip={slip}
          checkins={checkins}
          duties={duties}
          events={events}
          editable={editable}
          highlightDate={highlightDate}
          edits={edits}
          onSlipChange={setSlip}
        />
      </div>
      <div className="md:hidden">
        <SlipDayCards
          slip={slip}
          checkins={checkins}
          duties={duties}
          events={events}
          editable={editable}
          highlightDate={highlightDate}
          edits={edits}
          onSlipChange={setSlip}
        />
      </div>

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

      <ReopenHistory slip={slip} />

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
              ปิดงวดแล้วจะแก้ตัวเลขไม่ได้อีก (ต้องกด &quot;เปิดแก้ไข&quot; ในเมนู ⋯ ก่อน)
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

      <AlertDialog open={recomputeOpen} onOpenChange={v => { if (!v) setRecomputeOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>คำนวณใหม่ทั้งใบ</AlertDialogTitle>
            <AlertDialogDescription>
              ดึงเช็คอินกับอัตราค่าตอบแทนปัจจุบันมาคิดใหม่ทั้งใบ —
              ค่าที่แก้มือจะคงอยู่ (ยกเว้นบรรทัดที่ไม่มีอยู่แล้ว ระบบจะเตือนให้ทราบ)
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

      <ReopenDialog slip={slip} open={reopenOpen} onOpenChange={setReopenOpen} />
    </div>
  )
}
