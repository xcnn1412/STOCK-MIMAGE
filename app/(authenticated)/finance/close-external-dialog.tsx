'use client'

// หน้าต่าง "ปิดกับสำนักงานบัญชี" (admin) — ใบที่เคลียร์นอกระบบไปแล้ว ปิดเป็นชำระเงินแล้ว + เข้าแฟ้มในครั้งเดียว
// ปุ่มยืนยันในหน้าต่างคือการยืนยัน (ไม่มี window.confirm) · หลังส่งแสดงผลต่อใบ ใบที่ไม่สำเร็จบอกข้อความจาก server
// ใช้ทั้งคิวใบเบิก (หลายใบ) และหน้าใบเบิก (ใบเดียว)

import { useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { thaiTodayIso } from '@/lib/thai-date'
import { closeClaimsExternal, type BulkResult, type CloseExternalAdvance } from './lifecycle-actions'

export interface CloseExternalClaim {
  id: string
  claim_number: string
  title: string
  claim_type: string
  amount: number | string
  status: string
}

const DEFAULT_REASON = 'เคลียร์กับสำนักงานบัญชีแล้ว'
type AdvanceDraft = { mode: 'spent' | 'refund'; refund: string }

export default function CloseExternalDialog({ claims, isEn, onClose, onDone }: {
  claims: CloseExternalClaim[]
  isEn: boolean
  onClose: () => void
  /** เรียกทันทีที่ server ตอบผลต่อใบ (ผู้เรียกจัดการที่เลือก/โหลดใหม่) — หน้าต่างยังเปิดแสดงผลอยู่ */
  onDone: (results: BulkResult[]) => void
}) {
  const today = thaiTodayIso()
  const advances = claims.filter(c => c.claim_type === 'advance')
  const [paidDate, setPaidDate] = useState(today)
  const [reason, setReason] = useState(DEFAULT_REASON)
  const [drafts, setDrafts] = useState<Record<string, AdvanceDraft>>(
    () => Object.fromEntries(advances.map(c => [c.id, { mode: 'spent', refund: '' }])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<BulkResult[] | null>(null)
  const [filedError, setFiledError] = useState<string | null>(null)

  const refundError = (c: CloseExternalClaim): string | null => {
    const d = drafts[c.id]
    if (d?.mode !== 'refund') return null
    const n = Number(d.refund)
    if (!d.refund.trim() || !Number.isFinite(n) || n < 1 || n > (Number(c.amount) || 0)) {
      return isEn ? `Enter 1–${Number(c.amount).toLocaleString()}` : `ใส่ยอด 1–${Number(c.amount).toLocaleString()}`
    }
    return null
  }
  const invalid = !reason.trim() || !paidDate || paidDate > today || advances.some(c => refundError(c) !== null)

  const submit = async () => {
    if (invalid || busy) return
    setBusy(true)
    setError(null)
    const payload: Record<string, CloseExternalAdvance> = Object.fromEntries(advances.map(c => {
      const d = drafts[c.id]
      return [c.id, d.mode === 'refund' ? { mode: 'refund', refund: Number(d.refund) } : { mode: 'spent' }]
    }))
    const res = await closeClaimsExternal({ ids: claims.map(c => c.id), paidDate, reason, advances: payload })
      .catch(() => ({ error: isEn ? 'Something went wrong — please try again' : 'เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง', results: undefined, filedError: undefined }))
    setBusy(false)
    if (res.error || !res.results) {
      setError(res.error || (isEn ? 'Something went wrong' : 'เกิดข้อผิดพลาด'))
      return
    }
    setResults(res.results)
    setFiledError(res.filedError ?? null)
    onDone(res.results)
  }

  const okCount = results?.filter(r => r.ok).length ?? 0

  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEn ? 'Close: settled with the accountant' : 'ปิดใบ: เคลียร์กับสำนักงานบัญชีแล้ว'}</DialogTitle>
          <DialogDescription>
            {isEn
              ? 'Marks the claims as paid, files them, and records that they were closed this way.'
              : 'ตั้งเป็นชำระเงินแล้ว เข้าแฟ้มให้ และบันทึกประวัติว่าปิดด้วยวิธีนี้'}
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {isEn ? `Closed ${okCount} of ${results.length}` : `ปิดแล้ว ${okCount} จาก ${results.length} ใบ`}
            </p>
            <ul className="space-y-1.5 text-sm">
              {results.map(r => (
                <li key={r.id} className="flex items-start gap-2">
                  {r.ok
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    : <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" aria-hidden="true" />}
                  <span className="min-w-0 wrap-break-word">
                    <span className="font-mono">{r.claimNumber || claims.find(c => c.id.toLowerCase() === r.id)?.claim_number}</span>
                    {!r.ok && <span className="text-red-700 dark:text-red-400"> — {r.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {filedError && <p className="text-xs text-amber-700 dark:text-amber-300">{filedError}</p>}
            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>{isEn ? 'Close' : 'ปิด'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{isEn ? 'Paid date' : 'วันที่จ่าย'}</span>
              <Input type="date" value={paidDate} max={today} onChange={e => setPaidDate(e.target.value)} disabled={busy} required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{isEn ? 'Reason / reference' : 'เหตุผล / เลขอ้างอิง'}</span>
              <Input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} disabled={busy} required />
              {!reason.trim() && <span className="text-xs text-red-600">{isEn ? 'Required' : 'ต้องใส่เหตุผล'}</span>}
            </label>

            {advances.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{isEn ? 'Advances' : 'ใบทดลองจ่าย'}</p>
                {advances.map(c => {
                  const d = drafts[c.id]
                  const set = (patch: Partial<AdvanceDraft>) => setDrafts(prev => ({ ...prev, [c.id]: { ...prev[c.id], ...patch } }))
                  const err = refundError(c)
                  return (
                    <div key={c.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-2.5 space-y-2 text-sm">
                      <p className="min-w-0 wrap-break-word">
                        <span className="font-mono">{c.claim_number}</span> · {c.title} · ฿{Number(c.amount).toLocaleString()}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <label className="flex items-center gap-1.5">
                          <input type="radio" name={`adv-${c.id}`} checked={d.mode === 'spent'} onChange={() => set({ mode: 'spent' })} disabled={busy} />
                          {isEn ? 'Spent in full' : 'ใช้หมด'}
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input type="radio" name={`adv-${c.id}`} checked={d.mode === 'refund'} onChange={() => set({ mode: 'refund' })} disabled={busy} />
                          {isEn ? 'Refund' : 'มีเงินคืน'}
                        </label>
                        {d.mode === 'refund' && (
                          <Input type="number" inputMode="decimal" min={1} max={Number(c.amount)} step="0.01" className="w-32"
                            value={d.refund} onChange={e => set({ refund: e.target.value })} disabled={busy}
                            aria-label={isEn ? 'Refund amount' : 'ยอดเงินคืน'} placeholder={isEn ? 'Amount' : 'ยอดคืน'} />
                        )}
                      </div>
                      {err && <p className="text-xs text-red-600">{err}</p>}
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {isEn
                ? `Closing ${claims.length} claim${claims.length === 1 ? '' : 's'}${advances.length ? ` (${advances.length} advance)` : ''}`
                : `ปิด ${claims.length} ใบ${advances.length ? ` (ทดลองจ่าย ${advances.length} ใบ)` : ''}`}
            </p>
            {error && <p className="text-sm text-red-700 dark:text-red-400" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>{isEn ? 'Cancel' : 'ยกเลิก'}</Button>
              <Button type="button" onClick={() => { void submit() }} disabled={invalid || busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {isEn ? `Close ${claims.length}` : `ปิด ${claims.length} ใบ`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
