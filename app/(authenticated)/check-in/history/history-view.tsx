'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Building2, MapPin, Home, ArrowLeft, Clock, CalendarDays, X, Edit3 } from 'lucide-react'
import Link from 'next/link'
import { updateMyCheckinEvent, updateMyCheckinLocation } from '../actions'
import type { DutyInput } from '../../salary/compute'
import { THAI_PROVINCES } from '@/lib/thai-address'
import EventSelectCombobox from '../../finance/new/event-select-combobox'

interface CheckinRecord {
  id: string
  event_id?: string | null
  check_type: string
  checked_in_at: string
  checked_out_at: string | null
  note: string | null
  latitude: number | null
  longitude: number | null
  photo_url: string | null
  // ── โมดูลเงินเดือน (มีเฉพาะ onsite) ──
  duties?: string[] | null
  province?: string | null
  district?: string | null
  out_of_province?: boolean | null
  /** สลิปที่จ่ายเช็คอินนี้ไปแล้ว (โมดูลเงินเดือน) — null = ยังไม่ถูกจ่าย */
  paid_slip_id?: string | null
  events?: { id: string; name: string } | null
}

interface EventOption {
  id: string
  event_name: string
  event_date: string | null
  event_location: string | null
  status: string
}

const TYPE_ICONS = { office: Building2, onsite: MapPin, remote: Home } as const
const TYPE_LABELS = { office: 'เข้าออฟฟิศ', onsite: 'ไปหน้างาน', remote: 'WFH / นอกสถานที่' } as const

export default function HistoryView({ history, allEvents, duties }: {
  history: CheckinRecord[]
  allEvents: EventOption[]
  duties: DutyInput[]
}) {
  const router = useRouter()
  const [showPhotoLightbox, setShowPhotoLightbox] = useState<string | null>(null)
  const [editingCheckin, setEditingCheckin] = useState<CheckinRecord | null>(null)
  const [editingEventRef, setEditingEventRef] = useState<string>('')
  const [savingEdit, setSavingEdit] = useState(false)
  // แก้จังหวัด/เขตของเช็คอินตัวเอง
  const [editingLocation, setEditingLocation] = useState<CheckinRecord | null>(null)
  const [locProvince, setLocProvince] = useState('')
  const [locDistrict, setLocDistrict] = useState('')
  const [savingLocation, setSavingLocation] = useState(false)

  // code → ชื่อไทยของหน้าที่หน้างาน (หน้าที่ที่ถูกปิดไปแล้วจะโชว์ code ดิบ)
  const dutyNames: Record<string, string> = {}
  duties.forEach(d => { dutyNames[d.code] = d.name_th })

  function openEditLocation(c: CheckinRecord) {
    setEditingLocation(c)
    setLocProvince(c.province || '')
    setLocDistrict(c.district || '')
  }

  async function handleSaveLocation() {
    if (!editingLocation) return
    setSavingLocation(true)
    const result = await updateMyCheckinLocation(editingLocation.id, locProvince || null, locDistrict || null)
    if (result.error) alert(result.error)
    else { setEditingLocation(null); router.refresh() }
    setSavingLocation(false)
  }

  // ค่าที่ระบบเดามาอาจไม่ตรงชื่อจังหวัดมาตรฐาน — ใส่เป็นตัวเลือกแรกไว้ไม่ให้หายตอนบันทึก
  const provinceList: readonly string[] =
    editingLocation?.province && !(THAI_PROVINCES as readonly string[]).includes(editingLocation.province)
      ? [editingLocation.province, ...THAI_PROVINCES]
      : THAI_PROVINCES

  function openEditCheckin(c: CheckinRecord) {
    setEditingCheckin(c)
    const currentEv = c.events
    if (currentEv?.id) {
      if (currentEv.id.startsWith('closure:')) {
        setEditingEventRef(currentEv.id)
      } else if (currentEv.id.startsWith('jce:')) {
        setEditingEventRef(currentEv.id.replace('jce:', ''))
      } else if (c.event_id) {
        setEditingEventRef(`stock:${c.event_id}`)
      } else {
        setEditingEventRef('')
      }
    } else {
      setEditingEventRef('')
    }
  }

  async function handleSaveEdit() {
    if (!editingCheckin) return
    setSavingEdit(true)
    try {
      const result = await updateMyCheckinEvent(editingCheckin.id, editingEventRef || null)
      if (result.error) {
        alert(result.error)
      } else {
        setEditingCheckin(null)
        setEditingEventRef('')
        router.refresh()
      }
    } catch (e) {
      console.error('Edit checkin event error:', e)
      alert('เกิดข้อผิดพลาด')
    }
    setSavingEdit(false)
  }

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()} ${d.toLocaleDateString('th-TH', { month: 'long' })} ${d.getFullYear() + 543}`
  }

  // Group by date
  const grouped = history.reduce<Record<string, CheckinRecord[]>>((acc, c) => {
    const dateKey = new Date(c.checked_in_at).toLocaleDateString('th-TH')
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/check-in" className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">ประวัติ Check-in</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">ย้อนหลัง 60 รายการ</p>
        </div>
      </div>

      {/* Summary pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          ทั้งหมด {history.length} ครั้ง
        </span>
        <span className="px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          🏢 {history.filter(c => c.check_type === 'office').length}
        </span>
        <span className="px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          📍 {history.filter(c => c.check_type === 'onsite').length}
        </span>
        <span className="px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          🏠 {history.filter(c => c.check_type === 'remote').length}
        </span>
      </div>

      {/* Grouped list */}
      {Object.entries(grouped).length === 0 ? (
        <div className="text-center py-16">
          <Clock className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-3" />
          <p className="text-zinc-500">ยังไม่มีประวัติ Check-in</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([dateLabel, records]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="h-4 w-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-500">{formatDate(records[0].checked_in_at)}</span>
              </div>
              <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
                {records.map(c => {
                  const Icon = TYPE_ICONS[c.check_type as keyof typeof TYPE_ICONS] || Building2
                  const label = TYPE_LABELS[c.check_type as keyof typeof TYPE_LABELS] || c.check_type
                  return (
                    <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="h-4 w-4 text-zinc-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
                          {c.events && (
                            <span className="text-xs text-zinc-400 truncate">• {c.events.name}</span>
                          )}
                        </div>
                        {/* หน้าที่หน้างาน + จังหวัด/เขต + ป้ายต่างจังหวัด (เฉพาะ onsite) */}
                        {c.check_type === 'onsite' && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {(c.duties || []).map(code => (
                              <span key={code}
                                className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] font-semibold">
                                {dutyNames[code] || code}
                              </span>
                            ))}
                            {c.out_of_province && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                                ตจว.
                              </span>
                            )}
                            <button type="button" onClick={() => openEditLocation(c)}
                              title="แก้ไขจังหวัด/เขต"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold transition-colors ${
                                c.province
                                  ? 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                  : 'border-dashed border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                              }`}>
                              📍 {c.province ? `${c.province}${c.district ? ` · ${c.district}` : ''}` : 'ไม่ระบุจังหวัด'}
                              <Edit3 className="h-2.5 w-2.5" />
                            </button>
                            {/* จ่ายไปกับสลิปไหนแล้ว (โมดูลเงินเดือน) — หน้าสลิปตรวจสิทธิ์เอง */}
                            {c.paid_slip_id && (
                              <Link
                                href={`/salary/${c.paid_slip_id}`}
                                title="เช็คอินนี้จ่ายไปแล้ว — เปิดสลิป"
                                className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                              >
                                จ่ายแล้ว
                              </Link>
                            )}
                          </div>
                        )}
                        {c.note && (
                          <p className="text-xs text-zinc-400 mt-0.5 truncate">💬 {c.note}</p>
                        )}
                        {c.latitude && c.longitude && (
                          <p className="text-[10px] text-zinc-400 mt-0.5">📍 {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}</p>
                        )}
                        {c.photo_url && (
                          <button onClick={() => setShowPhotoLightbox(c.photo_url)}
                            className="mt-1.5 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 inline-block hover:shadow-md transition-shadow">
                            <img src={c.photo_url} alt="Check-in photo" className="w-16 h-16 object-cover" />
                          </button>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex items-start gap-1">
                        <div>
                          <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300">{formatTime(c.checked_in_at)}</p>
                          {c.checked_out_at ? (
                            <p className="text-[10px] text-zinc-400">ออก {formatTime(c.checked_out_at)}</p>
                          ) : (
                            <p className="text-[10px] text-amber-500">ยังไม่ออก</p>
                          )}
                        </div>
                        {c.check_type === 'onsite' && (
                          <button
                            onClick={() => openEditCheckin(c)}
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                            title="แก้ไขอีเวนต์"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Event Modal */}
      {editingCheckin && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { if (!savingEdit) { setEditingCheckin(null); setEditingEventRef('') } }}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">แก้ไขอีเวนต์ของ Check-in</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatDate(editingCheckin.checked_in_at)} {formatTime(editingCheckin.checked_in_at)}
                </p>
              </div>
              <button onClick={() => { setEditingCheckin(null); setEditingEventRef('') }}
                disabled={savingEdit}
                className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40">
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> เลือกอีเวนต์
              </label>
              <EventSelectCombobox events={allEvents} value={editingEventRef} onChange={setEditingEventRef} />
              <p className="text-[10px] text-zinc-400">
                แก้ไขได้เฉพาะ Check-in ของตัวเอง — เปลี่ยนได้ทั้ง events ที่เปิดอยู่, event_closures, หรือ job_cost_events
              </p>
            </div>

            <div className="flex items-center gap-2 p-5 pt-0">
              {(editingCheckin.event_id || editingCheckin.events) && (
                <button
                  disabled={savingEdit}
                  onClick={async () => {
                    if (!confirm('ลบการ link อีเวนต์ของ check-in นี้?')) return
                    setSavingEdit(true)
                    const result = await updateMyCheckinEvent(editingCheckin.id, null)
                    if (result.error) alert(result.error)
                    else { setEditingCheckin(null); setEditingEventRef(''); router.refresh() }
                    setSavingEdit(false)
                  }}
                  className="h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40">
                  ลบ link
                </button>
              )}
              <div className="flex-1" />
              <button onClick={() => { setEditingCheckin(null); setEditingEventRef('') }}
                disabled={savingEdit}
                className="h-10 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40">
                ยกเลิก
              </button>
              <button
                disabled={savingEdit || !editingEventRef}
                onClick={handleSaveEdit}
                className="h-10 px-5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 transition-colors active:scale-[0.98]">
                {savingEdit ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Province / District Modal */}
      {editingLocation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { if (!savingLocation) setEditingLocation(null) }}>
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-sm"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">แก้ไขจังหวัด / เขต</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatDate(editingLocation.checked_in_at)} {formatTime(editingLocation.checked_in_at)}
                </p>
              </div>
              <button onClick={() => setEditingLocation(null)} disabled={savingLocation}
                className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40">
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">จังหวัด</label>
                <select value={locProvince} onChange={e => setLocProvince(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700">
                  <option value="">— ไม่ระบุ —</option>
                  {provinceList.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">เขต / อำเภอ</label>
                <input type="text" value={locDistrict} onChange={e => setLocDistrict(e.target.value)}
                  placeholder="เช่น บางรัก (ไม่บังคับ)"
                  className="w-full px-4 py-3 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700 placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
              </div>
              <p className="text-[10px] text-zinc-400">
                ระบบเดาจากตำแหน่งตอนเช็คอิน — ถ้าไม่ตรงแก้ได้ที่นี่ (แก้ได้เฉพาะเช็คอินของตัวเอง)
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 p-5 pt-0">
              <button onClick={() => setEditingLocation(null)} disabled={savingLocation}
                className="h-10 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40">
                ยกเลิก
              </button>
              <button onClick={handleSaveLocation} disabled={savingLocation}
                className="h-10 px-5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 transition-colors active:scale-[0.98]">
                {savingLocation ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
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
