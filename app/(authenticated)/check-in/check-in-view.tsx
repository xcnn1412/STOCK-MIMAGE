'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, MapPin, Home, MapPinCheck, LogOut,
  Navigation, AlertCircle, CheckCircle2, CalendarDays, Users, History,
  ShieldCheck, UserPlus, Clock, Fingerprint, Sparkles, Undo2, Trash2, RotateCcw,
  Camera, X, ImageIcon
} from 'lucide-react'
import { checkIn, checkOut, adminCheckIn, undoCheckout, adminDeleteCheckin, adminEditCheckin } from './actions'
import EventSelectCombobox from '../finance/new/event-select-combobox'
import Link from 'next/link'

// ─── Image compression for smartphone photos ──────────────────────
function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img

      // Scale down to maxSize while preserving aspect ratio
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

      // Try WebP first, then JPEG fallback
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
  photo_url: string | null
  checkout_photo_url: string | null
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
  // Find active (not checked-out) check-in for current user
  const myActiveCheckin = todayCheckins.find(c => c.user_id === userId && !c.checked_out_at)
  // All of today's check-ins by current user (for display)
  const myTodayCheckins = todayCheckins.filter(c => c.user_id === userId)

  const [checkType, setCheckType] = useState<'office' | 'onsite' | 'remote'>('office')
  const [eventId, setEventId] = useState('')
  const [note, setNote] = useState('')
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Photo capture (check-in)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showPhotoLightbox, setShowPhotoLightbox] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [photoSize, setPhotoSize] = useState<string | null>(null)
  const [cameraMode, setCameraMode] = useState<'user' | 'environment'>('user')

  // Photo capture (check-out)
  const [checkoutPhotoPreview, setCheckoutPhotoPreview] = useState<string | null>(null)
  const [checkoutPhotoBase64, setCheckoutPhotoBase64] = useState<string | null>(null)
  const checkoutFileInputRef = useRef<HTMLInputElement>(null)
  const [checkoutCompressing, setCheckoutCompressing] = useState(false)
  const [checkoutPhotoSize, setCheckoutPhotoSize] = useState<string | null>(null)

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

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    try {
      const compressed = await compressImage(file, 800, 0.7)
      setPhotoPreview(compressed)
      setPhotoBase64(compressed)
      // Calculate size in KB
      const sizeKB = Math.round((compressed.length * 3) / 4 / 1024)
      setPhotoSize(sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`)
    } catch {
      // Fallback: use raw file
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setPhotoPreview(result)
        setPhotoBase64(result)
        setPhotoSize(null)
      }
      reader.readAsDataURL(file)
    }
    setCompressing(false)
  }

  function clearPhoto() {
    setPhotoPreview(null)
    setPhotoBase64(null)
    setPhotoSize(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function switchCamera() {
    const next = cameraMode === 'user' ? 'environment' : 'user'
    setCameraMode(next)
    // Auto-trigger camera after switching
    setTimeout(() => fileInputRef.current?.click(), 100)
  }

  async function handleCheckIn() {
    if (myActiveCheckin) {
      setError('คุณยังไม่ได้ Check-out จากรอบก่อน กรุณา Check-out ก่อนเริ่มรอบใหม่')
      return
    }
    if (!confirm('ยืนยัน Check-in เข้างาน?')) return
    setLoading(true); setError(''); setSuccess('')
    const fd = new FormData()
    fd.set('check_type', checkType)
    if (checkType === 'onsite' && eventId) fd.set('event_id', eventId)
    if (gps) { fd.set('latitude', String(gps.lat)); fd.set('longitude', String(gps.lng)); fd.set('accuracy', String(gps.accuracy)) }
    if (note) fd.set('note', note)
    if (photoBase64) fd.set('photo', photoBase64)
    const result = await checkIn(fd)
    if (result.error) setError(result.error)
    else { setSuccess('Check-in สำเร็จ!'); setPhotoPreview(null); setPhotoBase64(null); router.refresh() }
    setLoading(false)
  }

  async function handleCheckoutPhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCheckoutCompressing(true)
    try {
      const compressed = await compressImage(file, 800, 0.7)
      setCheckoutPhotoPreview(compressed)
      setCheckoutPhotoBase64(compressed)
      const sizeKB = Math.round((compressed.length * 3) / 4 / 1024)
      setCheckoutPhotoSize(sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`)
    } catch {
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setCheckoutPhotoPreview(result)
        setCheckoutPhotoBase64(result)
        setCheckoutPhotoSize(null)
      }
      reader.readAsDataURL(file)
    }
    setCheckoutCompressing(false)
  }

  function clearCheckoutPhoto() {
    setCheckoutPhotoPreview(null)
    setCheckoutPhotoBase64(null)
    setCheckoutPhotoSize(null)
    if (checkoutFileInputRef.current) checkoutFileInputRef.current.value = ''
  }

  async function handleCheckOut() {
    if (!myActiveCheckin) return
    if (!checkoutPhotoBase64) {
      setError('กรุณาถ่ายรูป Check-out ก่อน')
      return
    }
    if (!confirm('ยืนยัน Check-out เลิกงาน?')) return
    setLoading(true); setError('')
    const fd = new FormData()
    fd.set('checkin_id', myActiveCheckin.id)
    fd.set('photo', checkoutPhotoBase64)
    const result = await checkOut(fd)
    if (result.error) setError(result.error)
    else {
      setSuccess('Check-out สำเร็จ! สามารถ Check-in รอบใหม่ได้')
      clearCheckoutPhoto()
      router.refresh()
    }
    setLoading(false)
  }

  async function handleUndoCheckout() {
    // Find the most recent checked-out record for undo
    const lastCheckedOut = myTodayCheckins.find(c => c.checked_out_at)
    if (!lastCheckedOut) return
    if (!confirm('ยกเลิก Check-out?')) return
    setLoading(true); setError('')
    const result = await undoCheckout(lastCheckedOut.id)
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
      {myActiveCheckin ? (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-zinc-900 p-6 space-y-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-100/50 dark:from-emerald-900/20 to-transparent rounded-bl-full" />

          <div className="relative flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shadow-sm">
              <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-lg text-zinc-900 dark:text-zinc-100">กำลังทำงาน (รอบที่ {myTodayCheckins.length}) ✓</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {CHECK_TYPES.find(t => t.key === myActiveCheckin.check_type)?.emoji}{' '}
                {CHECK_TYPES.find(t => t.key === myActiveCheckin.check_type)?.label}
                {' · '}เวลา {formatTime(myActiveCheckin.checked_in_at)}
              </p>
            </div>
          </div>

          {myActiveCheckin.events && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 bg-white/60 dark:bg-zinc-800/40 rounded-xl px-4 py-2.5 backdrop-blur-sm">
              <CalendarDays className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>{(myActiveCheckin.events as any).name}</span>
            </div>
          )}
          {myActiveCheckin.note && (
            <div className="text-sm text-zinc-600 dark:text-zinc-300 bg-white/60 dark:bg-zinc-800/40 rounded-xl px-4 py-2.5">
              💬 {myActiveCheckin.note}
            </div>
          )}
          {myActiveCheckin.photo_url && (
            <button onClick={() => setShowPhotoLightbox(myActiveCheckin.photo_url)}
              className="block rounded-xl overflow-hidden border border-emerald-200 dark:border-emerald-800/50 hover:shadow-md transition-shadow">
              <img src={myActiveCheckin.photo_url} alt="Check-in photo"
                className="w-full max-w-[160px] h-auto object-cover" />
            </button>
          )}

          {/* ── Checkout Photo Capture ── */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-zinc-400" /> ถ่ายรูป Check-out <span className="text-red-500 text-xs">(จำเป็น)</span>
            </label>
            <input
              ref={checkoutFileInputRef}
              type="file"
              accept="image/*"
              capture={cameraMode}
              onChange={handleCheckoutPhotoCapture}
              className="hidden"
            />
            {checkoutCompressing ? (
              <div className="w-full flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30">
                <div className="h-6 w-6 border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin" />
                <span className="text-xs text-zinc-400">กำลังบีบอัดรูป...</span>
              </div>
            ) : checkoutPhotoPreview ? (
              <div className="space-y-2">
                <div className="relative inline-block">
                  <img
                    src={checkoutPhotoPreview}
                    alt="Check-out photo preview"
                    className="w-full max-w-[200px] h-auto rounded-xl border border-zinc-200 dark:border-zinc-700 object-cover shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={clearCheckoutPhoto}
                    className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors active:scale-90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  {checkoutPhotoSize && (
                    <span className="absolute bottom-2 left-2 text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-black/50 text-white backdrop-blur-sm">
                      {checkoutPhotoSize}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => checkoutFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1"
                >
                  <Camera className="h-3.5 w-3.5" /> ถ่ายใหม่
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => checkoutFileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2.5 py-4 px-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-all duration-200 bg-zinc-50/50 dark:bg-zinc-800/30 active:scale-[0.98]"
              >
                <Camera className="h-5 w-5" />
                <span className="text-sm font-semibold">แตะเพื่อถ่ายรูป Check-out</span>
              </button>
            )}
          </div>

          {/* Messages */}
          {error && (
            <div className="flex items-center gap-2.5 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 rounded-xl px-4 py-3 border border-red-100 dark:border-red-900/30">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <button onClick={handleCheckOut} disabled={loading || !checkoutPhotoBase64}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed shadow-sm hover:shadow-md">
            <LogOut className="h-5 w-5" /> {loading ? 'กำลัง Check-out...' : 'Check-out เลิกงาน'}
          </button>

          {/* Show today's completed sessions */}
          {myTodayCheckins.filter(c => c.checked_out_at).length > 0 && (
            <div className="border-t border-emerald-100 dark:border-emerald-900/30 pt-3 mt-2">
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">รอบก่อนหน้าวันนี้</p>
              {myTodayCheckins.filter(c => c.checked_out_at).map(c => (
                <div key={c.id} className="flex items-center justify-between text-xs text-zinc-500 py-1">
                  <span>{CHECK_TYPES.find(t => t.key === c.check_type)?.emoji} {CHECK_TYPES.find(t => t.key === c.check_type)?.label}</span>
                  <span className="font-mono tabular-nums">{formatTime(c.checked_in_at)} — {formatTime(c.checked_out_at!)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ══════════════ CHECK-IN FORM ══════════════ */
        <div className="space-y-4">
          {/* Show previous completed sessions */}
          {myTodayCheckins.length > 0 && (
            <div className="flex items-center gap-2.5 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/20 rounded-xl px-4 py-3 border border-blue-100 dark:border-blue-900/30">
              <Clock className="h-4 w-4 shrink-0" />
              <div>
                <span className="font-medium">Check-in รอบที่ {myTodayCheckins.length + 1}</span>
                <span className="text-blue-400 dark:text-blue-500 ml-1.5 text-xs">
                  (วันนี้ {myTodayCheckins.length} รอบเสร็จแล้ว: {myTodayCheckins.map(c => `${formatTime(c.checked_in_at)}–${c.checked_out_at ? formatTime(c.checked_out_at) : '?'}`).join(', ')})
                </span>
              </div>
            </div>
          )}
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

            {/* Photo Capture */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-zinc-400" /> ถ่ายรูป Check-in <span className="text-red-500 text-xs">(จำเป็น)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture={cameraMode}
                onChange={handlePhotoCapture}
                className="hidden"
              />
              {compressing ? (
                <div className="w-full flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30">
                  <div className="h-6 w-6 border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin" />
                  <span className="text-xs text-zinc-400">กำลังบีบอัดรูป...</span>
                </div>
              ) : photoPreview ? (
                <div className="space-y-2">
                  <div className="relative inline-block">
                    <img
                      src={photoPreview}
                      alt="Check-in photo preview"
                      className="w-full max-w-[240px] h-auto rounded-xl border border-zinc-200 dark:border-zinc-700 object-cover shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors active:scale-90"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {photoSize && (
                      <span className="absolute bottom-2 left-2 text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-black/50 text-white backdrop-blur-sm">
                        {photoSize}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1"
                  >
                    <Camera className="h-3.5 w-3.5" /> ถ่ายใหม่
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2.5 py-5 px-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-all duration-200 bg-zinc-50/50 dark:bg-zinc-800/30 active:scale-[0.98]"
                  >
                    <Camera className="h-6 w-6" />
                    <span className="text-sm font-semibold">แตะเพื่อถ่ายรูป</span>
                  </button>
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={switchCamera}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors py-1"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      {cameraMode === 'user' ? 'กล้องหน้า' : 'กล้องหลัง'} — แตะเพื่อสลับ
                    </button>
                  </div>
                </div>
              )}
            </div>

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
              disabled={loading || !photoBase64 || (checkType === 'onsite' && !eventId) || (checkType === 'remote' && !note)}
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
                  {c.photo_url ? (
                    <button onClick={() => setShowPhotoLightbox(c.photo_url)}
                      className="h-8 w-8 rounded-full overflow-hidden shrink-0 border border-zinc-200 dark:border-zinc-700 hover:ring-2 hover:ring-zinc-300 transition-all">
                      <img src={c.photo_url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <span className="text-lg shrink-0">{type?.emoji || '🏢'}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{staffName}</p>
                    <p className="text-xs text-zinc-400 truncate">
                      {type?.label}{c.events && ` · ${(c.events as any).name}`}{c.note && ` · ${c.note}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{formatTime(c.checked_in_at)}</p>
                    {c.checked_out_at
                      ? <div className="flex items-center justify-end gap-1.5">
                          {c.checkout_photo_url && (
                            <button onClick={() => setShowPhotoLightbox(c.checkout_photo_url)}
                              className="h-4 w-4 rounded-sm overflow-hidden border border-emerald-300 dark:border-emerald-700 hover:ring-1 hover:ring-emerald-400 transition-all shrink-0">
                              <img src={c.checkout_photo_url} alt="" className="h-full w-full object-cover" />
                            </button>
                          )}
                          <p className="text-[10px] text-emerald-500 font-medium">ออก {formatTime(c.checked_out_at)}</p>
                        </div>
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
      {/* ══════════════ PHOTO LIGHTBOX ══════════════ */}
      {showPhotoLightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPhotoLightbox(null)}>
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <img src={showPhotoLightbox} alt="Check-in photo"
              className="w-full h-auto rounded-2xl shadow-2xl" />
            <button onClick={() => setShowPhotoLightbox(null)}
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
