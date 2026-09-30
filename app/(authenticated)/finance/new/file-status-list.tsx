'use client'

// ============================================================================
// รายการไฟล์แนบของฟอร์มสร้างใบเบิก — หนึ่งแถวต่อไฟล์ พร้อมสถานะ
// กำลังย่อรูป → พร้อมส่ง → กำลังอัปโหลด → สำเร็จ / ไม่สำเร็จ
// ทุกไฟล์ส่งพร้อมกันในรอบเดียว (server อัปโหลดขนานกัน) จึงไม่มีแถบเปอร์เซ็นต์ต่อไฟล์ — ระหว่างส่งแสดงแถบรอแบบไม่ระบุเปอร์เซ็นต์
// server ตอบว่าไฟล์ไหนอัปโหลดไม่สำเร็จ (ชื่อไฟล์ในข้อความ) → แถวนั้นเป็น "ไม่สำเร็จ" ที่เหลือกลับเป็น "พร้อมส่ง" (ยังไม่ได้บันทึก)
// ============================================================================

import { AlertCircle, Check, CheckCircle2, FileText, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export type FileStatus = 'compressing' | 'ready' | 'uploading' | 'done' | 'failed'

export interface FileStatusItem {
  id: number
  /** ชื่อไฟล์เดิม — ชื่อเดียวกับที่ server ใส่ในข้อความเมื่ออัปโหลดไม่สำเร็จ */
  name: string
  /** ขนาดหลังย่อ (ไบต์) */
  size: number
  /** URL ตัวอย่างของรูป (blob:) · '' = ไม่ใช่รูป / ยังย่อไม่เสร็จ */
  preview: string
  status: FileStatus
}

const STATUS: Record<FileStatus, { th: string; en: string; tone: string; Icon: typeof Check; spin?: boolean }> = {
  compressing: { th: 'กำลังย่อรูป', en: 'Resizing', tone: 'text-zinc-800 bg-zinc-100 dark:text-zinc-200 dark:bg-zinc-800', Icon: Loader2, spin: true },
  ready: { th: 'พร้อมส่ง', en: 'Ready', tone: 'text-emerald-800 bg-emerald-50 border border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900', Icon: Check },
  uploading: { th: 'กำลังอัปโหลด', en: 'Uploading', tone: 'text-zinc-800 bg-zinc-100 dark:text-zinc-200 dark:bg-zinc-800', Icon: Loader2, spin: true },
  done: { th: 'สำเร็จ', en: 'Uploaded', tone: 'text-emerald-800 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-950/60', Icon: CheckCircle2 },
  failed: { th: 'ไม่สำเร็จ', en: 'Failed', tone: 'text-red-800 bg-red-100 dark:text-red-200 dark:bg-red-950/60', Icon: AlertCircle },
}

/** ส่วนรายชื่อไฟล์ในข้อความของ server: "อัพโหลดไฟล์ไม่สำเร็จ N จาก M ไฟล์ (ชื่อ1, ชื่อ2) — ยังไม่ได้บันทึก …" · ไม่ใช่ข้อความนี้ = null */
export function failedUploadList(message: string | null | undefined): string | null {
  if (!message) return null
  const m = /ไม่สำเร็จ \d+ จาก \d+ ไฟล์ \((.*)\) — /.exec(message)
  return m ? m[1] : null
}

/**
 * สถานะหลัง server ตอบ: สำเร็จ = ทุกไฟล์ "สำเร็จ" · ไฟล์ที่ชื่ออยู่ในข้อความ = "ไม่สำเร็จ"
 * ที่เหลือกลับเป็น "พร้อมส่ง" (ไม่มีอะไรถูกบันทึก — กดส่งใหม่ได้ทั้งชุด)
 */
export function markUploadResult<T extends FileStatusItem>(items: T[], error?: string | null): T[] {
  if (!error) return items.map(it => ({ ...it, status: 'done' as const }))
  const listed = failedUploadList(error)
  const names = listed === null ? [] : listed.split(', ')
  const isFailed = (it: T, i: number) =>
    listed !== null && (names.includes(it.name) || names.includes(`ไฟล์ที่ ${i + 1}`) || (it.name.includes(', ') && listed.includes(it.name)))
  return items.map((it, i) => ({ ...it, status: isFailed(it, i) ? 'failed' as const : 'ready' as const }))
}

/** สถานะที่แสดง: ระหว่างส่ง ไฟล์ที่พร้อม (และที่เคยไม่สำเร็จ — ส่งใหม่ทั้งชุด) คือ "กำลังอัปโหลด" */
export const shownStatus = (status: FileStatus, submitting: boolean): FileStatus =>
  submitting && (status === 'ready' || status === 'failed') ? 'uploading' : status

export default function FileStatusList({
  items,
  isEn,
  submitting,
  onRemove,
}: {
  items: FileStatusItem[]
  isEn: boolean
  /** กำลังส่งฟอร์ม (อัปโหลดทุกไฟล์รอบเดียว) */
  submitting: boolean
  onRemove?: (id: number) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        {isEn ? `${items.length} file(s) selected` : `${items.length} ไฟล์ที่เลือก`}
      </p>
      {submitting && (
        <Progress
          aria-label={isEn ? 'Sending files' : 'กำลังส่งไฟล์'}
          className="h-1.5 animate-pulse bg-emerald-600/30 dark:bg-emerald-400/30"
        />
      )}
      <ul
        aria-live="polite"
        aria-label={isEn ? 'Attached files' : 'ไฟล์แนบ'}
        className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900"
      >
        {items.map(it => {
          const status = STATUS[shownStatus(it.status, submitting)]
          const Icon = status.Icon
          return (
            <li key={it.id} data-status={shownStatus(it.status, submitting)} className="flex items-center gap-3 px-3 py-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                {it.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ตัวอย่างจากไฟล์ในเครื่อง (blob:) ยังไม่อยู่บน server
                  <img src={it.preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileText className="h-6 w-6 text-zinc-500" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100" title={it.name}>{it.name}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{(it.size / 1024).toFixed(0)} KB</p>
              </div>
              <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap', status.tone)}>
                <Icon className={cn('h-3.5 w-3.5 shrink-0', status.spin && 'animate-spin')} aria-hidden="true" />
                {isEn ? status.en : status.th}
              </span>
              {onRemove && (
                <Button type="button" variant="ghost" size="lg" className="w-10 shrink-0 px-0" disabled={submitting} onClick={() => onRemove(it.id)} aria-label={isEn ? `Remove ${it.name}` : `ลบ ${it.name}`}>
                  <X aria-hidden="true" />
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
