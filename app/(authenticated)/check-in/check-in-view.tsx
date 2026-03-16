'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, MapPin, Home, MapPinCheck, LogOut,
  Navigation, AlertCircle, CheckCircle2, CalendarDays, Users, History,
  ShieldCheck, UserPlus, Clock, Fingerprint, Sparkles, Undo2, Trash2, RotateCcw
} from 'lucide-react'
import { checkIn, checkOut, adminCheckIn, undoCheckout, adminDeleteCheckin, adminEditCheckin } from './actions'
import EventSelectCombobox from '../finance/new/event-select-combobox'
import Link from 'next/link'

interface CheckinRecord {
  id: string
  user_id: string
  check_type: string
  checked_in_at: string
  checked_out_at: string | null
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  note: string | null
  profiles?: { id: string; full_name: string; nickname: string | null } | null
  events?: { id: string; name: string } | null
}

interface TodayEvent {
  id: string
  name: string
  event_date: string
  location: string | null
  status: string
}

interface JobEventOption {
  id: string
  event_name: string
  event_date: string | null
  event_location: string | null
  status: string
}

interface StaffMember {
  id: string
  full_name: string
  nickname: string | null
}

const CHECK_TYPES = [
  { key: 'office' as const, icon: Building2, label: 'เข้าออฟฟิศ', desc: 'มาทำงานที่บริษัท', emoji: '🏢' },
  { key: 'onsite' as const, icon: MapPin, label: 'ไปหน้างาน', desc: 'ออกไปจัดงาน event', emoji: '📍' },
  { key: 'remote' as const, icon: Home, label: 'WFH', desc: 'ทำงานนอกสถานที่', emoji: '🏠' },
] as const

export default function CheckInView({
  todayCheckins,
  myHistory,
  todayEvents,
  allEvents,
  staffList,
  userId,
  role,
}: {
  todayCheckins: CheckinRecord[]
  myHistory: CheckinRecord[]
  todayEvents: TodayEvent[]
  allEvents: JobEventOption[]
  staffList: StaffMember[]
  userId: string
  role: string
}) {
  const router = useRouter()
  const isAdmin = role === 'admin'
  const myCheckin = todayCheckins.find(c => c.user_id === userId)

  const [checkType, setCheckType] = useState<'office' | 'onsite' | 'remote'>('office')
  const [eventId, setEventId] = useState('')
  const [note, setNote] = useState('')
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Admin retroactive
  const [showRetroactive, setShowRetroactive] = useState(false)
  const [adminTargetUser, setAdminTargetUser] = useState('')
  const [adminCheckType, setAdminCheckType] = useState<'office' | 'onsite' | 'remote'>('onsite')
  const [adminEventId, setAdminEventId] = useState('')
  const [adminDate, setAdminDate] = useState('')
  const [adminTime, setAdminTime] = useState('09:00')
  const [adminNote, setAdminNote] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminSuccess, setAdminSuccess] = useState('')

  // Current time display
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { requestGPS() }, [])

  function requestGPS() {
    if (!navigator.geolocation) { setGpsError('เบราว์เซอร์ไม่รองรับ GPS'); return }
    setGpsLoading(true); setGpsError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setGpsLoading(false) },
      (err) => { setGpsError(err.code === 1 ? 'กรุณาเปิดสิทธิ์ Location' : 'ไม่สามารถดึงตำแหน่งได้'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleCheckIn() {
    if (!confirm('ยืนยัน Check-in เข้างาน?')) return
    setLoading(true); setError(''); setSuccess('')
    const fd = new FormData()
    fd.set('check_type', checkType)
    if (checkType === 'onsite' && eventId) fd.set('event_id', eventId)
    if (gps) { fd.set('latitude', String(gps.lat)); fd.set('longitude', String(gps.lng)); fd.set('accuracy', String(gps.accuracy)) }
    if (note) fd.set('note', note)
    const result = await checkIn(fd)
    if (result.error) setError(result.error)
    else { setSuccess('Check-in สำเร็จ!'); router.refresh() }
    setLoading(false)
  }

  async function handleCheckOut() {
    if (!myCheckin) return
    if (!confirm('ยืนยัน Check-out เลิกงาน?')) return
    setLoading(true); setError('')
    const result = await checkOut(myCheckin.id)
    if (result.error) setError(result.error)
    else { setSuccess('Check-out สำเร็จ!'); router.refresh() }
    setLoading(false)
  }

  async function handleUndoCheckout() {
    if (!myCheckin) return
    if (!confirm('ยกเลิก Check-out?')) return
    setLoading(true); setError('')
    const result = await undoCheckout(myCheckin.id)
    if (result.error) setError(result.error)
    else { setSuccess('ยกเลิก Check-out สำเร็จ!'); router.refresh() }
    setLoading(false)
  }

  async function handleAdminDelete(id: string, name: string) {
    if (!confirm(`ลบ Check-in ของ "${name}"?\nจะไม่สามารถกู้คืนได้`)) return
    const result = await adminDeleteCheckin(id)
    if (result.error) alert(result.error)
    else router.refresh()
  }

  async function handleAdminClearCheckout(id: string, name: string) {
    if (!confirm(`ล้าง Check-out ของ "${name}"?\nจะกลับเป็นสถานะ "กำลังทำงาน"`)) return
    const fd = new FormData()
    fd.set('checkin_id', id)
    fd.set('clear_checkout', 'true')
    const result = await adminEditCheckin(fd)
    if (result.error) alert(result.error)
    else router.refresh()
  }

  async function handleAdminCheckIn() {
    setAdminLoading(true); setAdminError(''); setAdminSuccess('')
    const fd = new FormData()
    fd.set('target_user_id', adminTargetUser)
    fd.set('check_type', adminCheckType)
    if (adminCheckType === 'onsite' && adminEventId) fd.set('event_id', adminEventId)
    fd.set('checkin_date', adminDate)
    fd.set('checkin_time', adminTime)
    if (adminNote) fd.set('note', adminNote)
    const result = await adminCheckIn(fd)
    if (result.error) setAdminError(result.error)
    else { setAdminSuccess('สร้าง Check-in สำเร็จ!'); setAdminTargetUser(''); setAdminDate(''); setAdminNote(''); router.refresh() }
    setAdminLoading(false)
  }

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()} ${d.toLocaleDateString('th-TH', { month: 'short' })} ${d.getFullYear() + 543}`
  }

  const timeStr = currentTime.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = currentTime.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-6 pb-24 md:pb-6 max-w-2xl mx-auto">

      {/* ══════════════ HERO CLOCK HEADER ══════════════ */}
      <div className="relative overflow-hidden rounded-3xl bg-zinc-900 dark:bg-zinc-800/80 p-6 md:p-8 text-white">
        {/* Decorative gradient orbs */}
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-gradient-to-br from-white/[0.06] to-transparent blur-2xl" />
        <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full bg-gradient-to-tr from-white/[0.04] to-transparent blur-2xl" />

        <div className="relative z-10 flex items-start justify-between">
          <div>
            <p className="text-zinc-400 text-sm font-medium tracking-wide uppercase mb-1">
              {dateStr}
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl md:text-6xl font-bold tracking-tighter font-mono tabular-nums">
                {timeStr.slice(0, 5)}
              </span>
              <span className="text-2xl md:text-3xl font-light text-zinc-400 tabular-nums">
                :{timeStr.slice(6)}
              </span>
            </div>
          </div>
          <Link href="/check-in/history"
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 border border-white/10"
          >
            <History className="h-3.5 w-3.5" /> ประวัติ
          </Link>
        </div>

        {/* GPS indicator */}
        <div className="relative z-10 mt-4 flex items-center gap-2 text-xs">
          {gpsLoading ? (
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-400" /></span>
              ค้นหาตำแหน่ง...
            </span>
          ) : gps ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="relative flex h-2 w-2"><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" /></span>
              {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}
              <span className="text-zinc-500">±{Math.round(gps.accuracy)}m</span>
            </span>
          ) : gpsError ? (
            <button onClick={requestGPS} className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors">
              <span className="relative flex h-2 w-2"><span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" /></span>
              {gpsError}
            </button>
          ) : null}
        </div>
      </div>

      {/* ══════════════ ALREADY CHECKED IN ══════════════ */}
      {myCheckin ? (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-zinc-900 p-6 space-y-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-100/50 dark:from-emerald-900/20 to-transparent rounded-bl-full" />

          <div className="relative flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-lg text-zinc-900 dark:text-zinc-100">เช็คอินแล้ววันนี้ ✓</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {CHECK_TYPES.find(t => t.key === myCheckin.check_type)?.emoji}{' '}
                {CHECK_TYPES.find(t => t.key === myCheckin.check_type)?.label}
                {' · '}เวลา {formatTime(myCheckin.checked_in_at)}
              </p>
            </div>
          </div>

          {myCheckin.events && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 bg-white/60 dark:bg-zinc-800/40 rounded-xl px-4 py-2.5 backdrop-blur-sm">
              <CalendarDays className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>{(myCheckin.events as any).name}</span>
            </div>
          )}
          {myCheckin.note && (
            <div className="text-sm text-zinc-600 dark:text-zinc-300 bg-white/60 dark:bg-zinc-800/40 rounded-xl px-4 py-2.5">
              💬 {myCheckin.note}
            </div>
          )}

          {!myCheckin.checked_out_at ? (
            <button onClick={handleCheckOut} disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all duration-200 disabled:opacity-50 shadow-sm hover:shadow-md">
              <LogOut className="h-5 w-5" /> {loading ? 'กำลัง Check-out...' : 'Check-out เลิกงาน'}
            </button>
          ) : (() => {
            const checkoutMs = new Date(myCheckin.checked_out_at!).getTime()
            const canUndo = Date.now() - checkoutMs < 5 * 60 * 1000
            const minutesLeft = Math.max(0, Math.ceil((5 * 60 * 1000 - (Date.now() - checkoutMs)) / 60000))
            return (
              <div className="space-y-2">
                <div className="text-center py-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                  ✅ Check-out เวลา {formatTime(myCheckin.checked_out_at)}
                </div>
                {canUndo && (
                  <button onClick={handleUndoCheckout} disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all disabled:opacity-50">
                    <Undo2 className="h-4 w-4" /> ยกเลิก Check-out
                    <span className="text-[10px] text-amber-400">({minutesLeft} นาทีที่เหลือ)</span>
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      ) : (
        /* ══════════════ CHECK-IN FORM ══════════════ */
        <div className="space-y-4">
          {/* Type Cards */}
          <div className="grid grid-cols-3 gap-3">
            {CHECK_TYPES.map(type => {
              const selected = checkType === type.key
              const disabled = type.key === 'onsite' && todayEvents.length === 0
              return (
                <button key={type.key} type="button" disabled={disabled}
                  onClick={() => { setCheckType(type.key); if (type.key !== 'onsite') setEventId('') }}
                  className={`relative group rounded-2xl p-4 md:p-5 text-left transition-all duration-300 overflow-hidden ${
                    disabled ? 'opacity-30 cursor-not-allowed bg-zinc-100 dark:bg-zinc-800/50' :
                    selected
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-lg shadow-zinc-900/20 dark:shadow-white/10 scale-[1.02]'
                      : 'bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md'
                  }`}>
                  {selected && <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent" />}
                  <div className="relative">
                    <span className="text-2xl mb-2 block">{type.emoji}</span>
                    <p className={`text-sm font-bold ${selected ? '' : 'text-zinc-900 dark:text-zinc-100'}`}>{type.label}</p>
                    <p className={`text-[11px] mt-0.5 ${selected ? 'text-white/70 dark:text-zinc-500' : 'text-zinc-400'}`}>{type.desc}</p>
                    {disabled && <p className="text-[10px] text-zinc-400 mt-1">ไม่มีงานวันนี้</p>}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 p-5 space-y-4">
            {/* Event selector */}
            {checkType === 'onsite' && todayEvents.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-zinc-400" /> เลือกอีเวนต์วันนี้
                </label>
                <select value={eventId} onChange={e => setEventId(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-sm focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 outline-none transition-all">
                  <option value="">— เลือกอีเวนต์ —</option>
                  {todayEvents.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name} {ev.location ? `· ${ev.location}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Note */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                💬 หมายเหตุ {checkType === 'remote' && <span className="text-red-500 text-xs">(จำเป็น)</span>}
              </label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder={checkType === 'remote' ? 'ระบุว่าอยู่ที่ไหน ทำอะไร...' : 'เพิ่มหมายเหตุ (ไม่บังคับ)'}
                className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-sm focus:border-zinc-400 dark:focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 outline-none resize-none transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
            </div>

            {/* Messages */}
            {error && (
              <div className="flex items-center gap-2.5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-xl px-4 py-3 border border-red-100 dark:border-red-900/30">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2.5 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl px-4 py-3 border border-emerald-100 dark:border-emerald-900/30">
                <Sparkles className="h-4 w-4 shrink-0" /> {success}
              </div>
            )}

            {/* Check-in Button */}
            <button onClick={handleCheckIn}
              disabled={loading || (checkType === 'onsite' && !eventId) || (checkType === 'remote' && !note)}
              className="w-full flex items-center justify-center gap-2.5 py-4 px-4 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold text-base hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-zinc-900/20 dark:shadow-white/10 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]">
              <Fingerprint className="h-5 w-5" /> {loading ? 'กำลังบันทึก...' : 'เช็คอินเข้างาน'}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════ ADMIN: RETROACTIVE ══════════════ */}
      {isAdmin && (
        <div>
          <button onClick={() => setShowRetroactive(!showRetroactive)}
            className="flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors py-2">
            <ShieldCheck className="h-4 w-4" />
            <span>{showRetroactive ? '▼' : '▶'} สร้าง Check-in ย้อนหลัง</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400">Admin</span>
          </button>

          {showRetroactive && (
            <div className="mt-2 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-xl px-4 py-2.5 border border-amber-100 dark:border-amber-900/30">
                <AlertCircle className="h-4 w-4 shrink-0" /> สำหรับกรณีพนักงานลืม Check-in — จะบันทึก [Admin] ไว้
              </div>

              {/* Staff */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">เลือกพนักงาน <span className="text-red-500">*</span></label>
                <select value={adminTargetUser} onChange={e => setAdminTargetUser(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700">
                  <option value="">— เลือกพนักงาน —</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.nickname || s.full_name}</option>)}
                </select>
              </div>

              {/* Date + Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">วันที่ <span className="text-red-500">*</span></label>
                  <input type="date" value={adminDate} onChange={e => setAdminDate(e.target.value)}
                    className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">เวลา <span className="text-red-500">*</span></label>
                  <input type="time" value={adminTime} onChange={e => setAdminTime(e.target.value)}
                    className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700" />
                </div>
              </div>

              {/* Type */}
              <div className="flex gap-2">
                {CHECK_TYPES.map(type => (
                  <button key={type.key} onClick={() => { setAdminCheckType(type.key); if (type.key !== 'onsite') setAdminEventId('') }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      adminCheckType === type.key
                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                        : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500'
                    }`}>
                    {type.emoji} {type.label}
                  </button>
                ))}
              </div>

              {adminCheckType === 'onsite' && (
                <EventSelectCombobox events={allEvents} value={adminEventId} onChange={setAdminEventId} />
              )}

              <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2}
                placeholder="เหตุผล เช่น พนักงานลืม check-in..."
                className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm outline-none resize-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />

              {adminError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/20 rounded-xl px-4 py-3 border border-red-100 dark:border-red-900/30"><AlertCircle className="h-4 w-4 inline mr-1.5" />{adminError}</div>}
              {adminSuccess && <div className="text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl px-4 py-3 border border-emerald-100 dark:border-emerald-900/30"><Sparkles className="h-4 w-4 inline mr-1.5" />{adminSuccess}</div>}

              <button onClick={handleAdminCheckIn}
                disabled={adminLoading || !adminTargetUser || !adminDate || !adminTime}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-zinc-700 dark:bg-zinc-300 text-white dark:text-zinc-900 font-semibold hover:bg-zinc-600 dark:hover:bg-zinc-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                <UserPlus className="h-4.5 w-4.5" /> {adminLoading ? 'กำลังสร้าง...' : 'สร้าง Check-in'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ TODAY'S OVERVIEW (Admin) ══════════════ */}
      {isAdmin && todayCheckins.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" /> เข้างานวันนี้
            </h2>
            <div className="flex items-center gap-1.5">
              {(['office', 'onsite', 'remote'] as const).map(t => {
                const count = todayCheckins.filter(c => c.check_type === t).length
                if (count === 0) return null
                const emoji = CHECK_TYPES.find(ct => ct.key === t)?.emoji
                return (
                  <span key={t} className="text-xs px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                    {emoji} {count}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {todayCheckins.map(c => {
              const type = CHECK_TYPES.find(t => t.key === c.check_type)
              const staffName = (c.profiles as any)?.nickname || (c.profiles as any)?.full_name || '—'
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group">
                  <span className="text-lg shrink-0">{type?.emoji || '🏢'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{staffName}</p>
                    <p className="text-xs text-zinc-400 truncate">
                      {type?.label}{c.events && ` · ${(c.events as any).name}`}{c.note && ` · ${c.note}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{formatTime(c.checked_in_at)}</p>
                    {c.checked_out_at
                      ? <p className="text-[10px] text-emerald-500 font-medium">ออก {formatTime(c.checked_out_at)}</p>
                      : <p className="text-[10px] text-zinc-400">กำลังทำงาน</p>
                    }
                  </div>
                  {/* Admin actions */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {c.checked_out_at && (
                      <button onClick={() => handleAdminClearCheckout(c.id, staffName)}
                        title="ล้าง Check-out"
                        className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => handleAdminDelete(c.id, staffName)}
                      title="ลบ Check-in"
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════ MY RECENT HISTORY ══════════════ */}
      {myHistory.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
            <Clock className="h-4 w-4 text-zinc-400" /> ประวัติล่าสุด
          </h2>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {myHistory.slice(0, 5).map(c => {
              const type = CHECK_TYPES.find(t => t.key === c.check_type)
              return (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{type?.emoji || '🏢'}</span>
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{type?.label || c.check_type}</p>
                      {c.events && <p className="text-[11px] text-zinc-400 truncate max-w-[160px]">{(c.events as any).name}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-zinc-400">{formatDate(c.checked_in_at)}</p>
                    <p className="text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                      {formatTime(c.checked_in_at)}{c.checked_out_at && ` — ${formatTime(c.checked_out_at)}`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
