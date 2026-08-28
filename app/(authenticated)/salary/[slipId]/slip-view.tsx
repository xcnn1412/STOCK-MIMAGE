'use client'

// ============================================================================
// หน้าสลิปหนึ่งใบ — spec: docs/specs/salary-slip-daily-ui.md
//
// ประกอบร่าง: SlipHeader (ติดขอบบน) → PendingChecklist → SlipDayTable
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
import SlipHeader from './components/slip-header'
import PendingChecklist from './components/pending-checklist'
import ReopenDialog from './components/reopen-dialog'
import ReopenHistory from './components/reopen-history'
import { useHighlightRow } from './components/use-highlight-row'
import { pendingItems } from '../compute'
import {
  finalizeSlip, markSlipPaid, recomputeSlip, syncSlipToCosts,
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

export default function SlipView({ slip: initialSlip, isAdmin, checkins, duties, events }: Props) {
  const router = useRouter()
  // ตารางรายวันคืนสลิปที่คำนวณใหม่แล้วกลับมาทุกครั้งที่แก้ — เก็บไว้ใน state
  // เพื่อให้ยอด/งานค้างบนหัวขยับทันทีโดยไม่ต้องรอ server component รอบใหม่
  const [slip, setSlip] = useState(initialSlip)
  const [seenSlip, setSeenSlip] = useState(initialSlip)
  if (seenSlip !== initialSlip) {
    setSeenSlip(initialSlip)
    setSlip(initialSlip)
  }

  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmPaid, setConfirmPaid] = useState(false)
  const [recomputeOpen, setRecomputeOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { highlightDate, jumpToDay } = useHighlightRow()

  const name = slip.full_name || slip.nickname || '(ไม่มีชื่อ)'
  const hasBank = !!(slip.bank_name || slip.bank_account_number || slip.account_holder_name)
  // แก้ได้เฉพาะ admin + สลิปร่าง — เจ้าของสลิปและสลิปที่ปิดงวดแล้วอ่านอย่างเดียว
  // (ทุก action ตรวจซ้ำฝั่ง server และ trigger ที่ DB กันอีกชั้น)
  const editable = isAdmin && slip.status === 'draft'
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
        onFinalize={() => setConfirmFinalize(true)}
        onMarkPaid={() => setConfirmPaid(true)}
        onReopen={() => setReopenOpen(true)}
        onSyncCosts={runSyncCosts}
        onRecompute={() => setRecomputeOpen(true)}
      />

      {/* ── งานค้างก่อนปิดงวด — คลิกแล้วเลื่อนไปแถววันนั้นในตาราง ─────────────── */}
      <PendingChecklist
        slip={slip}
        editable={editable}
        onJump={jumpToDay}
        onSlipChange={setSlip}
      />

      {/* ── ตารางรายวัน — ข้อมูลต้นทางกับเงินของวันเดียวกันอยู่แถวเดียว ─────── */}
      <SlipDayTable
        slip={slip}
        checkins={checkins}
        duties={duties}
        events={events}
        editable={editable}
        highlightDate={highlightDate}
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
