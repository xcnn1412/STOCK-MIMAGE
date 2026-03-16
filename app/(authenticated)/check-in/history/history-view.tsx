'use client'

import { useState } from 'react'
import { Building2, MapPin, Home, ArrowLeft, Clock, CalendarDays, X } from 'lucide-react'
import Link from 'next/link'

interface CheckinRecord {
  id: string
  check_type: string
  checked_in_at: string
  checked_out_at: string | null
  note: string | null
  latitude: number | null
  longitude: number | null
  photo_url: string | null
  events?: { id: string; name: string } | null
}

const TYPE_ICONS = { office: Building2, onsite: MapPin, remote: Home } as const
const TYPE_LABELS = { office: 'เข้าออฟฟิศ', onsite: 'ไปหน้างาน', remote: 'WFH / นอกสถานที่' } as const

export default function HistoryView({ history }: { history: CheckinRecord[] }) {
  const [showPhotoLightbox, setShowPhotoLightbox] = useState<string | null>(null)

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
                            <span className="text-xs text-zinc-400 truncate">• {(c.events as any).name}</span>
                          )}
                        </div>
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
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300">{formatTime(c.checked_in_at)}</p>
                        {c.checked_out_at ? (
                          <p className="text-[10px] text-zinc-400">ออก {formatTime(c.checked_out_at)}</p>
                        ) : (
                          <p className="text-[10px] text-amber-500">ยังไม่ออก</p>
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
