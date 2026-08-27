'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlarmClock, Check, ClipboardCheck, ExternalLink, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { DOC_TYPES } from '../doc-types'
import { transitionDocument } from '../actions'
import type { PendingApprovalRow } from './actions'

interface Props {
  rows: PendingApprovalRow[]
  userId: string
  /** เวลา ณ ตอน render (จาก server) — ใช้คำนวณ "ค้างเกิน 24 ชม." ให้ SSR/CSR ตรงกัน */
  nowIso: string
}

const OVERDUE_MS = 24 * 60 * 60 * 1000

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDateTime = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString('th-TH', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '-'

/** "x นาที/ชม./วัน ที่แล้ว" — ponytail: คำนวณเองสั้นๆ ไม่ลง dependency */
function relative(ms: number) {
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ชม. ที่แล้ว`
  return `${Math.floor(hours / 24)} วันที่แล้ว`
}

type DialogKind = 'approve' | 'reject'

export default function ApprovalsView({ rows, userId, nowIso }: Props) {
  const router = useRouter()
  const [dialog, setDialog] = useState<{ kind: DialogKind; row: PendingApprovalRow } | null>(null)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const now = new Date(nowIso).getTime()

  // ค้างเกิน 24 ชม. ขึ้นก่อน แล้วเรียงเก่าสุดก่อน
  const sorted = useMemo(() => {
    const withAge = rows.map(r => {
      const submitted = r.submitted_at ? new Date(r.submitted_at).getTime() : null
      const age = submitted === null ? 0 : now - submitted
      return { row: r, age, overdue: submitted !== null && age > OVERDUE_MS }
    })
    return withAge.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
      return b.age - a.age
    })
  }, [rows, now])

  const overdueCount = sorted.filter(x => x.overdue).length

  const rejectBlocked = dialog?.kind === 'reject' && reason.trim() === ''

  const openDialog = (kind: DialogKind, row: PendingApprovalRow) => {
    setReason('')
    setDialog({ kind, row })
  }

  const run = () => {
    if (!dialog) return
    const { kind, row } = dialog
    startTransition(async () => {
      const res = await transitionDocument(row.id, kind, reason.trim() || undefined)
      if (res?.error) { toast.error(res.error); return }
      toast.success(
        kind === 'approve'
          ? (res?.doc_no ? `อนุมัติแล้ว — เลขที่ ${res.doc_no}` : 'อนุมัติเรียบร้อย')
          : 'ตีกลับเอกสารแล้ว'
      )
      setDialog(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* ── หัวข้อ + สรุป ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <ClipboardCheck className="size-6 text-amber-600 dark:text-amber-400" />
        <h1 className="text-xl font-bold">รออนุมัติ</h1>
        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          ทั้งหมด {rows.length}
        </span>
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <AlarmClock className="size-3.5" />
            ค้างเกิน 24 ชม. {overdueCount}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-zinc-500 dark:text-zinc-400">
            ไม่มีเอกสารรออนุมัติ 🎉
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขร่าง</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>คู่สัญญา</TableHead>
                  <TableHead className="text-right">ยอดสุทธิ</TableHead>
                  <TableHead>ผู้ขอ</TableHead>
                  <TableHead>ส่งเมื่อ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(({ row, age, overdue }) => {
                  const def = DOC_TYPES[row.doc_type]
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(overdue && 'bg-red-50/60 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30')}
                    >
                      <TableCell className="font-mono text-xs">
                        <Link href={`/documents/${row.id}`} className="font-semibold hover:underline">
                          {row.draft_no}
                        </Link>
                        {overdue && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-400">
                            🔴 ค้างเกิน 24 ชม.
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{def?.label.th || row.doc_type}</div>
                        <span className="mt-0.5 inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {row.brand_name_th || row.brand_code}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{row.party_name || '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {def?.hasAmounts ? fmtMoney(row.net_payable) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{row.creator?.full_name || '-'}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        <div>{fmtDateTime(row.submitted_at)}</div>
                        <div className={cn('text-xs', overdue ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400')}>
                          {row.submitted_at ? relative(age) : '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/documents/${row.id}`}>
                              <ExternalLink className="size-4" />
                              เปิด
                            </Link>
                          </Button>
                          <Button size="sm" onClick={() => openDialog('approve', row)}>
                            <Check className="size-4" />
                            อนุมัติ
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openDialog('reject', row)}>
                            <X className="size-4" />
                            ตีกลับ
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* ── Dialog อนุมัติ / ตีกลับ ────────────────────────────────────── */}
      <Dialog open={dialog !== null} onOpenChange={o => { if (!o) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.kind === 'reject' ? 'ตีกลับเอกสาร' : 'อนุมัติเอกสาร'}</DialogTitle>
            <DialogDescription>
              {dialog?.kind === 'reject'
                ? 'เอกสารจะกลับไปเป็นร่างพร้อมแสดงเหตุผลให้ผู้สร้าง'
                : 'ระบบจะออกเลขที่จริงทันที'}
              {dialog ? ` · ${dialog.row.draft_no}` : ''}
            </DialogDescription>
          </DialogHeader>

          {dialog?.kind === 'approve' && dialog.row.created_by === userId && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              คุณกำลังอนุมัติเอกสารของตัวเอง — จะถูกบันทึกเป็นข้อยกเว้น
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="approval-reason">
              {dialog?.kind === 'reject' ? 'เหตุผล' : 'ความเห็น (ไม่บังคับ)'}
              {dialog?.kind === 'reject' && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea id="approval-reason" rows={3} value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>ยกเลิก</Button>
            <Button
              variant={dialog?.kind === 'reject' ? 'destructive' : 'default'}
              onClick={run}
              disabled={pending || rejectBlocked}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {dialog?.kind === 'reject' ? 'ตีกลับ' : 'อนุมัติ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
