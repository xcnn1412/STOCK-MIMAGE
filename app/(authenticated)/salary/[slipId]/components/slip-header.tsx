'use client'

// ============================================================================
// หัวสลิปติดขอบบน — spec: docs/specs/salary-slip-daily-ui.md §"งานค้าง / หัวสลิป"
//
// ซ้าย: ลิงก์กลับ + ชื่อ + ชื่องวด + ช่วงวันที่ + สถานะ + ประเภทการจ้าง
// ขวา: ยอดสุทธิ + ป้าย "งานค้าง N" + ปุ่มหลัก "ปุ่มเดียว" ตามสถานะ + เมนู ⋯
//
// คอมโพเนนต์นี้ไม่ยิง server action เอง — ทุกปุ่มคืนผ่าน callback ให้ slip-view
// เป็นคนถือ dialog/transition ไว้ที่เดียว (ยกเว้นลิงก์ PDF ที่เป็น <a> ตรงๆ)
// ============================================================================

import Link from 'next/link'
import {
  ArrowLeft, BanknoteArrowUp, ChevronLeft, FileDown, Lock, MoreHorizontal,
  PenLine, Receipt, RefreshCw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney, slipTitle } from '../../format'
import { SlipStatusBadge } from '../../components/slip-status-badge'
import type { SlipDetail } from '../../actions'

interface Props {
  slip: SlipDetail
  isAdmin: boolean
  /** งานค้างที่ยังไม่ได้ยอมรับ — จาก pendingItems() ในหน้าสลิป */
  pendingCount: number
  /** มี action กำลังทำงานอยู่ — ปิดปุ่มทั้งแถบไว้ก่อน */
  busy: boolean
  onFinalize: () => void
  onMarkPaid: () => void
  onReopen: () => void
  onSyncCosts: () => void
  onRecompute: () => void
}

const EMPLOYMENT_LABEL = {
  fulltime: 'ประจำ',
  freelance: 'ฟรีแลนซ์',
  intern: 'นักศึกษาฝึกงาน',
} as const

export default function SlipHeader({
  slip, isAdmin, pendingCount, busy,
  onFinalize, onMarkPaid, onReopen, onSyncCosts, onRecompute,
}: Props) {
  const name = slip.full_name || slip.nickname || '(ไม่มีชื่อ)'
  const isDraft = slip.status === 'draft'
  const backHref = isAdmin ? `/salary/runs/${slip.run_id}` : '/salary'

  // เกณฑ์เดียวกับที่ /api/pdf/salary/[slipId] บังคับ (getSlipForView ตัวเดียวกัน) —
  // admin โหลดได้ทุกสถานะ (ร่างได้ PDF ที่มีลายน้ำ "ร่าง") เจ้าของได้เฉพาะที่ปิดงวดแล้ว
  const canDownloadPdf = isAdmin || !isDraft
  const blocked = pendingCount > 0
  const finalizeHint = blocked
    ? `เคลียร์งานค้าง ${pendingCount} รายการก่อนปิดงวด`
    : 'ปิดงวดสลิปใบนี้'

  // สลิปที่เปิดแก้หลังจ่ายแล้ว — ยอดที่จ่ายไปกับยอดปัจจุบันไม่ตรงกัน ต้องโอนเพิ่ม/หักคืนเอง
  const paidTotal = slip.paid_total
  const diff = paidTotal === null ? 0 : Number((slip.total - paidTotal).toFixed(2))
  const showDiff = paidTotal !== null && paidTotal !== slip.total

  return (
    <div className="sticky top-0 z-10 -mx-4 border-b bg-background/85 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* ── ซ้าย: ใครและงวดไหน ─────────────────────────────────────────── */}
        <div className="min-w-0">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {isAdmin ? 'กลับไปหน้างวด' : 'สลิปของฉัน'}
          </Link>
          <h1 className="truncate text-xl font-semibold md:text-2xl">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {slipTitle(slip)} ·{' '}
            {formatThaiDate(slip.period_start)} – {formatThaiDate(slip.period_end)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <SlipStatusBadge status={slip.status} />
            <Badge variant="outline">{EMPLOYMENT_LABEL[slip.employment_type]}</Badge>
          </div>
        </div>

        {/* ── ขวา: ยอด + งานค้าง + ปุ่มหลักปุ่มเดียว + เมนูรอง ──────────────── */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{fmtMoney(slip.total)}</div>
            <div className="text-xs text-muted-foreground">ยอดสุทธิ (บาท)</div>
          </div>

          {isAdmin && isDraft && blocked && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
            >
              งานค้าง {pendingCount}
            </Badge>
          )}

          {isAdmin && isDraft && (
            // disabled แล้ว title ไม่ขึ้นในบางเบราว์เซอร์ — ครอบ span ไว้ให้ hover เจอเสมอ
            <span title={finalizeHint}>
              <Button disabled={busy || blocked} onClick={onFinalize}>
                <Lock className="size-4" />
                {blocked ? `ปิดงวด (ค้าง ${pendingCount})` : 'ปิดงวด'}
              </Button>
            </span>
          )}

          {isAdmin && slip.status === 'finalized' && (
            <Button disabled={busy} onClick={onMarkPaid}>
              <BanknoteArrowUp className="size-4" />
              จ่ายแล้ว
            </Button>
          )}

          {slip.status === 'paid' && (
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              จ่ายแล้ว{slip.paid_at ? ` ${formatThaiDate(slip.paid_at)}` : ''}
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="เมนูเพิ่มเติม">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {canDownloadPdf && (
                <DropdownMenuItem asChild>
                  <a href={`/api/pdf/salary/${slip.id}`} target="_blank" rel="noopener noreferrer">
                    <FileDown className="size-4" />
                    ดาวน์โหลด PDF
                  </a>
                </DropdownMenuItem>
              )}

              {isAdmin && !isDraft && (
                <DropdownMenuItem disabled={busy} onSelect={onSyncCosts}>
                  <Receipt className="size-4" />
                  <span className="flex flex-col">
                    <span>ส่งเข้าต้นทุนอีกครั้ง</span>
                    <span className="text-xs text-muted-foreground">
                      {slip.costs_synced_at
                        ? `ล่าสุด ${formatThaiDate(slip.costs_synced_at)}`
                        : 'ยังไม่เคยส่งเข้าโมดูลต้นทุน'}
                    </span>
                  </span>
                </DropdownMenuItem>
              )}

              {isAdmin && !isDraft && (
                <DropdownMenuItem disabled={busy} onSelect={onReopen}>
                  <PenLine className="size-4" />
                  เปิดแก้ไข
                </DropdownMenuItem>
              )}

              {isAdmin && isDraft && (
                <DropdownMenuItem disabled={busy} onSelect={onRecompute}>
                  <RefreshCw className="size-4" />
                  คำนวณใหม่ทั้งใบ
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={backHref}>
                  <ChevronLeft className="size-4" />
                  {isAdmin ? 'กลับไปหน้างวด' : 'กลับไปสลิปของฉัน'}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── ส่วนต่างหลังเปิดแก้สลิปที่จ่ายไปแล้ว ─────────────────────────────── */}
      {showDiff && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
          จ่ายไปแล้ว {fmtMoney(paidTotal)} บาท
          {slip.paid_at ? ` (เมื่อ ${formatThaiDate(slip.paid_at)})` : ''}
          {' · '}ยอดใหม่ {fmtMoney(slip.total)} บาท
          {' · '}ส่วนต่าง {diff > 0 ? '+' : '-'}{fmtMoney(Math.abs(diff))} บาท
          {' — '}{diff > 0 ? 'ต้องโอนเพิ่ม' : 'ต้องหักคืน'}
        </p>
      )}
    </div>
  )
}
