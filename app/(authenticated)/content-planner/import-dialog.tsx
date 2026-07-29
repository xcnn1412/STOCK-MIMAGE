'use client'

// นำเข้าแผนโพสต์จากไฟล์ Excel (.xlsx) — ดาวน์โหลดเทมเพลต → กรอก → อัปโหลด
// รหัสโพสต์ระบบตั้งให้เอง (FB-001 / IG-001 / TT-001) ไม่ต้องมีในไฟล์

import { useRef, useState, useTransition } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileSpreadsheet, Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { importContentPosts } from './actions'
import { PLATFORMS, STATUSES, PILLARS, OBJECTIVES, FORMATS, PAGES } from './constants'

// ลำดับคอลัมน์ในเทมเพลต — ต้องตรงกับหัวคอลัมน์ที่ actions.ts รู้จัก
const TEMPLATE_HEADERS = [
  'แพลตฟอร์ม', 'วันที่โพสต์', 'เวลาโพสต์', 'รูปแบบ', 'สถานะ', 'เสาหลัก', 'เป้าหมาย',
  'หัวข้อ', 'Hook', 'แคปชัน', 'CTA', 'ลิงก์', 'แฮชแท็ก', 'ผู้รับผิดชอบ', 'เพจ', 'โน้ต',
] as const

const TEMPLATE_EXAMPLE: Record<string, string> = {
  'แพลตฟอร์ม': 'Facebook',
  'วันที่โพสต์': '2026-08-01',
  'เวลาโพสต์': '18:00',
  'รูปแบบ': 'Reel',
  'สถานะ': 'ไอเดีย',
  'เสาหลัก': 'โปรโมชัน',
  'เป้าหมาย': 'การรับรู้',
  'หัวข้อ': 'ตัวอย่างหัวข้อโพสต์',
  'Hook': 'ประโยคเปิดที่ดึงให้หยุดดู',
  'แคปชัน': 'เนื้อหาโพสต์แบบเต็ม',
  'CTA': 'ทักแชทเพื่อรับส่วนลด',
  'ลิงก์': 'https://example.com',
  'แฮชแท็ก': '#imageautomat #โฟโต้บูธ',
  'ผู้รับผิดชอบ': 'ชื่อผู้ดูแลโพสต์',
  'เพจ': 'imageautomat',
  'โน้ต': 'หมายเหตุเพิ่มเติม',
}

const COL_WIDTHS = [14, 13, 11, 14, 12, 14, 12, 28, 28, 40, 22, 26, 26, 18, 18, 26]

// คำอธิบายวิธีกรอกแต่ละช่อง — ค่า dropdown ดึงจาก constants ให้ตรงกับหน้าจอเสมอ
const th = (list: { th: string }[]) => list.map(o => o.th).join(' / ')
const FIELD_GUIDE: { name: string; desc: string }[] = [
  { name: 'แพลตฟอร์ม', desc: `ต้องกรอกทุกแถว — ${PLATFORMS.map(p => p.th).join(' / ')} (หรือย่อ FB / IG / TT) กรอกผิดแถวนั้นจะถูกข้าม` },
  { name: 'วันที่โพสต์', desc: 'รูปแบบ 2026-08-01 หรือ 01/08/2026 (ปี พ.ศ. ก็ได้ ระบบแปลงให้) หรือใช้ cell วันที่ของ Excel ตรงๆ' },
  { name: 'เวลาโพสต์', desc: 'เช่น 18:00 หรือ 9:30 หรือใช้ cell เวลาของ Excel' },
  { name: 'สถานะ', desc: `${th(STATUSES)} — เว้นว่าง = ไอเดีย` },
  { name: 'รูปแบบ', desc: PLATFORMS.map(p => `${p.th}: ${th(FORMATS[p.value])}`).join(' · ') },
  { name: 'เสาหลัก', desc: th(PILLARS) },
  { name: 'เป้าหมาย', desc: th(OBJECTIVES) },
  { name: 'เพจ', desc: PAGES.join(' / ') },
  { name: 'หัวข้อ / Hook / แคปชัน / CTA / ลิงก์ / แฮชแท็ก / ผู้รับผิดชอบ / โน้ต', desc: 'ข้อความอิสระ พิมพ์อะไรก็ได้ เว้นว่างได้' },
]

export function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet([TEMPLATE_EXAMPLE], { header: [...TEMPLATE_HEADERS] })
  ws['!cols'] = COL_WIDTHS.map(wch => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Content')
  XLSX.writeFile(wb, 'content-planner-template.xlsx')
}

export default function ImportDialog({
  open, onOpenChange, onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFile(null)
    setResult(null)
    setFatal(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function handleImport() {
    if (!file) return
    setResult(null)
    setFatal(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await importContentPosts(fd)
      if (res.error) {
        setFatal(res.error)
        setResult(res.errors.length ? { imported: 0, errors: res.errors } : null)
        return
      }
      setResult({ imported: res.imported, errors: res.errors })
      if (res.imported > 0) onImported()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>นำเข้าโพสต์จาก Excel</DialogTitle>
          <DialogDescription>
            แถวละ 1 โพสต์ — ต้องมีคอลัมน์ &quot;แพลตฟอร์ม&quot; (Facebook / Instagram / TikTok) เสมอ
            ส่วนรหัสโพสต์ระบบตั้งให้เองอัตโนมัติ
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 1. เทมเพลต */}
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">1. ดาวน์โหลดเทมเพลต</p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  ไฟล์ตัวอย่างพร้อมหัวคอลัมน์ครบ — ลบแถวตัวอย่างแล้วกรอกของจริงได้เลย
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0">
                <Download className="h-4 w-4" />
                เทมเพลต
              </Button>
            </div>
          </div>

          {/* 2. เลือกไฟล์ */}
          <div>
            <p className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">2. เลือกไฟล์ที่กรอกแล้ว</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center transition-colors hover:border-violet-400 hover:bg-violet-50/50 dark:border-zinc-700 dark:bg-zinc-800/40 dark:hover:border-violet-600 dark:hover:bg-violet-950/20">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={e => {
                  setFile(e.target.files?.[0] || null)
                  setResult(null)
                  setFatal(null)
                }}
              />
              <FileSpreadsheet className="h-6 w-6 text-zinc-400 dark:text-zinc-500" />
              {file ? (
                <span className="max-w-full truncate text-sm font-medium text-violet-700 dark:text-violet-300">{file.name}</span>
              ) : (
                <span className="text-sm text-zinc-500 dark:text-zinc-400">คลิกเพื่อเลือกไฟล์ .xlsx</span>
              )}
            </label>
          </div>

          {/* วิธีกรอกแต่ละช่อง — native <details> กดกางดูได้ */}
          <details className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              วิธีกรอกแต่ละช่อง (กดดู)
            </summary>
            <div className="max-h-56 space-y-2 overflow-y-auto border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                ช่องที่เป็นตัวเลือก กรอกภาษาไทยตามหน้าจอหรือค่าอังกฤษก็ได้ ไม่สนตัวพิมพ์เล็ก-ใหญ่
              </p>
              {FIELD_GUIDE.map(f => (
                <p key={f.name} className="text-xs text-zinc-600 dark:text-zinc-300">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-100">{f.name}</span>
                  {' — '}{f.desc}
                </p>
              ))}
            </div>
          </details>

          {/* ผลลัพธ์ */}
          {fatal && (
            <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {fatal}
            </p>
          )}

          {result && (
            <div className="space-y-2">
              {result.imported > 0 && (
                <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 p-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  นำเข้าแล้ว {result.imported} โพสต์
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-2.5 dark:bg-amber-950/30">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    ข้ามหรือแก้ไม่ได้ {result.errors.length} แถว — ตรวจแล้วนำเข้าเฉพาะแถวที่เหลือใหม่ได้
                  </p>
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-amber-700 dark:text-amber-400">
                    {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            ปิด
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || isPending}
            className="bg-violet-600 text-white hover:bg-violet-700"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            นำเข้า
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
