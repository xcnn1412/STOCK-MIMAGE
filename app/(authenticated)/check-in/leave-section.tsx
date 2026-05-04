'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, Heart, Plane, Briefcase, X, Plus, AlertCircle, CheckCircle2,
  Clock, Sparkles, Camera, ImageIcon, ShieldCheck, Trash2,
} from 'lucide-react'
import {
  requestLeave, cancelLeave, reviewLeave,
  type LeaveRecord, type LeaveType, type LeaveStatus,
} from './leave-actions'

// ─── Image compression (same shape as check-in-view) ─────────────
function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > height) {
        if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize }
      } else {
        if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize }
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas not supported')); return }
      ctx.drawImage(img, 0, 0, width, height)
      let dataUrl = canvas.toDataURL('image/webp', quality)
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(dataUrl)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

// ─── Static metadata, mirrors the CHECK_TYPES pattern ────────────
const LEAVE_TYPES = [
  { key: 'personal' as const, icon: Briefcase, label: 'ลากิจ',     emoji: '📋', accent: 'rose'   },
  { key: 'sick'     as const, icon: Heart,     label: 'ลาป่วย',    emoji: '🤒', accent: 'orange' },
  { key: 'vacation' as const, icon: Plane,     label: 'ลาพักร้อน', emoji: '🌴', accent: 'cyan'   },
] as const

const STATUS_META: Record<LeaveStatus, { label: string; tone: string; icon: typeof Clock }> = {
  pending:   { label: 'รออนุมัติ', tone: 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50', icon: Clock },
  approved:  { label: 'อนุมัติ',    tone: 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50', icon: CheckCircle2 },
  rejected:  { label: 'ปฏิเสธ',     tone: 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50', icon: X },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700', icon: Trash2 },
}

// Tailwind static accent classes per leave type — JIT can't infer dynamic
// names so we list them explicitly (mirrors the moduleAccents pattern in
// the sidebar).
const ACCENT_CLASSES: Record<typeof LEAVE_TYPES[number]['accent'], { selected: string; ring: string; bg: string; text: string; bar: string }> = {
  rose:   { selected: 'bg-rose-600 dark:bg-rose-500 text-white shadow-rose-500/20',     ring: 'border-rose-200 dark:border-rose-900/50',     bg: 'bg-rose-50/60 dark:bg-rose-950/20',     text: 'text-rose-700 dark:text-rose-400',     bar: 'bg-rose-500 dark:bg-rose-400' },
  orange: { selected: 'bg-orange-600 dark:bg-orange-500 text-white shadow-orange-500/20', ring: 'border-orange-200 dark:border-orange-900/50', bg: 'bg-orange-50/60 dark:bg-orange-950/20', text: 'text-orange-700 dark:text-orange-400', bar: 'bg-orange-500 dark:bg-orange-400' },
  cyan:   { selected: 'bg-cyan-600 dark:bg-cyan-500 text-white shadow-cyan-500/20',     ring: 'border-cyan-200 dark:border-cyan-900/50',     bg: 'bg-cyan-50/60 dark:bg-cyan-950/20',     text: 'text-cyan-700 dark:text-cyan-400',     bar: 'bg-cyan-500 dark:bg-cyan-400' },
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO + 'T00:00:00').getTime()
  const end = new Date(endISO + 'T00:00:00').getTime()
  return Math.floor((end - start) / 86_400_000) + 1
}

// ─── Component ─────────────────────────────────────────────────

export default function LeaveSection({
  myLeaves,
  pendingLeaves,
  isAdmin,
}: {
  myLeaves: LeaveRecord[]
  pendingLeaves: LeaveRecord[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)

  const myActiveLeaves = useMemo(
    () => myLeaves.filter(l => l.status === 'pending' || l.status === 'approved'),
    [myLeaves]
  )
  const myHistoryLeaves = useMemo(
    () => myLeaves.filter(l => l.status === 'rejected' || l.status === 'cancelled'),
    [myLeaves]
  )

  return (
    <div className="space-y-3">
      {/* Section header — matches the "กำลังทำงาน" / "วันนี้เสร็จแล้ว" rhythm */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          คำขอลางาน
          {myActiveLeaves.length > 0 && (
            <span className="text-[10px] font-medium text-zinc-400 normal-case tracking-normal">
              · {myActiveLeaves.length} รายการ
            </span>
          )}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" /> ขอลางาน
        </button>
      </div>

      {/* My active leaves */}
      {myActiveLeaves.length > 0 && (
        <div className="space-y-2">
          {myActiveLeaves.map(leave => (
            <LeaveCard key={leave.id} leave={leave} isAdmin={false} onChanged={() => router.refresh()} />
          ))}
        </div>
      )}

      {/* Empty state when no active + no pending — keeps the section
          discoverable even before the user has ever requested leave. */}
      {myActiveLeaves.length === 0 && pendingLeaves.length === 0 && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex flex-col items-center justify-center gap-1 py-5 px-4 rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700/60 text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors bg-zinc-50/40 dark:bg-zinc-900/40"
        >
          <CalendarDays className="h-5 w-5" />
          <span className="text-xs font-medium">ยังไม่มีคำขอลา — แตะเพื่อเริ่ม</span>
        </button>
      )}

      {/* Recent rejected / cancelled — collapsed footer, mirrors "วันนี้เสร็จแล้ว" */}
      {myHistoryLeaves.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40 px-4 py-2.5">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
            ประวัติ ({myHistoryLeaves.length})
          </p>
          <div className="space-y-1">
            {myHistoryLeaves.slice(0, 5).map(l => {
              const meta = LEAVE_TYPES.find(t => t.key === l.leave_type)
              const status = STATUS_META[l.status]
              return (
                <div key={l.id} className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <span>{meta?.emoji}</span>
                    {meta?.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums">{fmtDate(l.start_date)}{l.end_date !== l.start_date && ` – ${fmtDate(l.end_date)}`}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${status.tone}`}>{status.label}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Admin: pending review queue */}
      {isAdmin && pendingLeaves.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-2">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> รออนุมัติ ({pendingLeaves.length})
          </p>
          <div className="space-y-2">
            {pendingLeaves.map(leave => (
              <LeaveCard key={leave.id} leave={leave} isAdmin={true} onChanged={() => router.refresh()} />
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <RequestLeaveModal
          onClose={() => setShowForm(false)}
          onSubmitted={() => { setShowForm(false); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─── Single leave card ─────────────────────────────────────────

function LeaveCard({
  leave,
  isAdmin,
  onChanged,
}: {
  leave: LeaveRecord
  isAdmin: boolean
  onChanged: () => void
}) {
  const meta = LEAVE_TYPES.find(t => t.key === leave.leave_type)!
  const accent = ACCENT_CLASSES[meta.accent]
  const status = STATUS_META[leave.status]
  const StatusIcon = status.icon

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewNote, setReviewNote] = useState('')
  const [showReviewInput, setShowReviewInput] = useState(false)

  async function handleCancel() {
    if (!confirm(`ยกเลิกคำขอ ${meta.label} วันที่ ${fmtDate(leave.start_date)}?`)) return
    setBusy(true); setError('')
    const res = await cancelLeave(leave.id)
    if (res.error) { setError(res.error); setBusy(false); return }
    setBusy(false)
    onChanged()
  }

  async function handleReview(decision: 'approved' | 'rejected') {
    if (decision === 'rejected' && !reviewNote.trim()) {
      setShowReviewInput(true)
      setError('กรุณาระบุเหตุผลที่ปฏิเสธ')
      return
    }
    setBusy(true); setError('')
    const fd = new FormData()
    fd.set('id', leave.id)
    fd.set('decision', decision)
    if (reviewNote.trim()) fd.set('note', reviewNote.trim())
    const res = await reviewLeave(fd)
    if (res.error) { setError(res.error); setBusy(false); return }
    setBusy(false)
    onChanged()
  }

  const requesterName = (leave.profiles as { nickname?: string | null; full_name?: string | null } | null | undefined)
  const reviewerName = (leave.reviewer as { nickname?: string | null; full_name?: string | null } | null | undefined)

  return (
    <div className={`rounded-2xl border bg-gradient-to-br to-white dark:to-zinc-900 p-4 space-y-3 ${accent.ring} ${accent.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center text-2xl shadow-sm shrink-0">
            {meta.emoji}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-zinc-900 dark:text-zinc-100">{meta.label}</p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${status.tone}`}>
                <StatusIcon className="h-2.5 w-2.5" />
                {status.label}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {fmtDate(leave.start_date)}
              {leave.end_date !== leave.start_date && ` – ${fmtDate(leave.end_date)}`}
              <span className="mx-1.5">·</span>
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{leave.total_days} วัน</span>
              {isAdmin && requesterName && (
                <>
                  <span className="mx-1.5">·</span>
                  โดย {requesterName.nickname || requesterName.full_name || '—'}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {leave.reason && (
        <div className="text-sm text-zinc-600 dark:text-zinc-300 bg-white/60 dark:bg-zinc-800/40 rounded-xl px-3.5 py-2">
          💬 {leave.reason}
        </div>
      )}

      {leave.attachment_url && (
        <a href={leave.attachment_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline decoration-dotted">
          <ImageIcon className="h-3.5 w-3.5" /> ดูใบรับรอง / เอกสารแนบ
        </a>
      )}

      {leave.review_note && leave.status !== 'pending' && (
        <div className="text-xs text-zinc-500 bg-white/60 dark:bg-zinc-800/40 rounded-lg px-3 py-2 border-l-2 border-zinc-300 dark:border-zinc-600">
          <span className="font-semibold text-zinc-600 dark:text-zinc-300">หมายเหตุจาก {reviewerName?.nickname || reviewerName?.full_name || 'ผู้ตรวจ'}:</span> {leave.review_note}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2 border border-red-100 dark:border-red-900/30">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {/* Admin review controls — only on pending rows */}
      {isAdmin && leave.status === 'pending' && (
        <div className="space-y-2 pt-1">
          {showReviewInput && (
            <textarea
              value={reviewNote} onChange={e => setReviewNote(e.target.value)}
              rows={2}
              placeholder="เหตุผลที่ปฏิเสธ (จำเป็น) หรือหมายเหตุประกอบการอนุมัติ"
              className="w-full px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
            />
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleReview('approved')}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-50 transition-colors">
              <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ
            </button>
            <button
              onClick={() => { if (!showReviewInput) { setShowReviewInput(true); return } handleReview('rejected') }}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white dark:bg-zinc-800 border border-red-300 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors">
              <X className="h-3.5 w-3.5" /> {showReviewInput ? 'ยืนยันปฏิเสธ' : 'ปฏิเสธ'}
            </button>
          </div>
        </div>
      )}

      {/* User can cancel own pending request */}
      {!isAdmin && leave.status === 'pending' && (
        <button onClick={handleCancel} disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50/60 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50">
          <Trash2 className="h-3.5 w-3.5" /> ยกเลิกคำขอ
        </button>
      )}
    </div>
  )
}

// ─── Request modal ─────────────────────────────────────────────

function RequestLeaveModal({
  onClose,
  onSubmitted,
}: {
  onClose: () => void
  onSubmitted: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [leaveType, setLeaveType] = useState<LeaveType>('personal')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [halfDay, setHalfDay] = useState(false)
  const [reason, setReason] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const totalDays = useMemo(() => {
    if (!startDate || !endDate || endDate < startDate) return 0
    const days = daysBetween(startDate, endDate)
    return halfDay && days === 1 ? 0.5 : days
  }, [startDate, endDate, halfDay])

  const meta = LEAVE_TYPES.find(t => t.key === leaveType)!
  const accent = ACCENT_CLASSES[meta.accent]

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    try {
      const compressed = await compressImage(file, 1200, 0.75)
      setPhotoPreview(compressed)
      setPhotoBase64(compressed)
    } catch {
      const reader = new FileReader()
      reader.onloadend = () => {
        const r = reader.result as string
        setPhotoPreview(r); setPhotoBase64(r)
      }
      reader.readAsDataURL(file)
    }
    setCompressing(false)
  }

  function clearPhoto() {
    setPhotoPreview(null); setPhotoBase64(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit() {
    setLoading(true); setError('')
    const fd = new FormData()
    fd.set('leave_type', leaveType)
    fd.set('start_date', startDate)
    fd.set('end_date', endDate)
    if (halfDay && daysBetween(startDate, endDate) === 1) fd.set('half_day', 'true')
    if (reason.trim()) fd.set('reason', reason.trim())
    if (photoBase64) fd.set('attachment', photoBase64)
    const res = await requestLeave(fd)
    if (res.error) { setError(res.error); setLoading(false); return }
    setLoading(false)
    onSubmitted()
  }

  const reasonRequired = leaveType !== 'vacation'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}>
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" /> ขอลางาน
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">เลือกประเภท · ระบุวันที่ · กดส่ง</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Type selector — same shape as CHECK_TYPES selector in check-in */}
        <div className="grid grid-cols-3 gap-2">
          {LEAVE_TYPES.map(type => {
            const selected = leaveType === type.key
            const a = ACCENT_CLASSES[type.accent]
            return (
              <button key={type.key} type="button"
                onClick={() => setLeaveType(type.key)}
                className={`relative rounded-xl py-3 px-2 text-center transition-all duration-200 ${
                  selected
                    ? `${a.selected} shadow-md scale-[1.02]`
                    : 'bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}>
                <span className="text-xl block leading-none">{type.emoji}</span>
                <p className="text-xs font-bold mt-1.5">{type.label}</p>
              </button>
            )
          })}
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">วันเริ่ม</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">วันสิ้นสุด</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate}
              className="w-full h-10 px-3 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700" />
          </div>
        </div>

        {/* Half-day toggle — only visible for single-day requests */}
        {startDate === endDate && startDate && (
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
            <input type="checkbox" checked={halfDay} onChange={e => setHalfDay(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:ring-zinc-300" />
            <span>ลาครึ่งวัน (0.5 วัน)</span>
          </label>
        )}

        {/* Total days summary */}
        <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${accent.bg} border ${accent.ring}`}>
          <span className={`text-xs font-semibold ${accent.text}`}>รวม</span>
          <span className={`text-base font-bold font-mono tabular-nums ${accent.text}`}>{totalDays} วัน</span>
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
            💬 เหตุผล {reasonRequired && <span className="text-red-500">*</span>}
          </label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder={leaveType === 'sick' ? 'อาการ / สาเหตุ...' : leaveType === 'personal' ? 'ระบุธุระที่ต้องไป...' : 'จะไปไหน (ไม่บังคับ)...'}
            className="w-full px-3 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 resize-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
        </div>

        {/* Optional attachment — typically a doctor's note for sick leave */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5 text-zinc-400" />
            เอกสารแนบ {leaveType === 'sick' && <span className="text-zinc-400 text-[10px]">(ใบรับรองแพทย์)</span>}
          </label>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" />
          {compressing ? (
            <div className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30">
              <div className="h-4 w-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
              <span className="text-xs text-zinc-400">กำลังบีบอัดรูป...</span>
            </div>
          ) : photoPreview ? (
            <div className="relative inline-block">
              <img src={photoPreview} alt="แนบ" className="max-h-32 rounded-lg border border-zinc-200 dark:border-zinc-700" />
              <button type="button" onClick={clearPhoto}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 active:scale-90">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-all bg-white/40 dark:bg-zinc-800/30 active:scale-[0.99]">
              <Camera className="h-4 w-4" />
              <span className="text-xs font-semibold">แนบรูป (ไม่บังคับ)</span>
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2 border border-red-100 dark:border-red-900/30">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
          </div>
        )}

        <button onClick={handleSubmit}
          disabled={loading || totalDays === 0 || (reasonRequired && !reason.trim())}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-sm hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-[0.99]">
          {loading ? 'กำลังส่ง...' : `ส่งคำขอ${meta.label}`}
        </button>
      </div>
    </div>
  )
}
