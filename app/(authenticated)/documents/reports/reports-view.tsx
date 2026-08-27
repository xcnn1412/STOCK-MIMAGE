'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DOC_TYPES, type DocTypeCode } from '../doc-types'
import type { ContinuityReport, SeriesRow } from './actions'

interface Props {
  series: SeriesRow[]
  brand: string
  type: string
  period: string
  report: ContinuityReport | null
}

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** YYMM → "ส.ค. 2569" · YY → "ปี 2569" (ค.ศ. 2 หลัก → พ.ศ. เต็ม) */
function periodLabel(period: string, yearly: boolean) {
  const be = 2000 + Number(period.slice(0, 2)) + 543
  if (yearly) return `ปี ${be}`
  const m = Number(period.slice(2, 4))
  return `${THAI_MONTHS[m - 1] || period.slice(2, 4)} ${be}`
}

function typeLabel(code: string) {
  return DOC_TYPES[code as DocTypeCode]?.label.th || code
}

export default function ReportsView({ series, brand, type, period, report }: Props) {
  const router = useRouter()
  const [b, setB] = useState(brand)
  const [t, setT] = useState(type)
  const [p, setP] = useState(period)
  const [onlyProblems, setOnlyProblems] = useState(false)

  // ตัวเลือกไล่ระดับจากชุดเลขที่มีอยู่จริง — ไม่เดาว่าชุดไหนควรมี
  const brands = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of series) m.set(s.brand_code, s.brand_name)
    return Array.from(m, ([code, name]) => ({ code, name }))
  }, [series])

  const types = useMemo(
    () => Array.from(new Set(series.filter(s => s.brand_code === b).map(s => s.doc_type))),
    [series, b],
  )

  const periods = useMemo(
    () => series.filter(s => s.brand_code === b && s.doc_type === t),
    [series, b, t],
  )

  function pickBrand(v: string) {
    setB(v); setT(''); setP('')
  }
  function pickType(v: string) {
    setT(v); setP('')
  }

  function run() {
    if (!b || !t || !p) return
    router.replace(`/documents/reports?brand=${b}&type=${t}&period=${p}`)
  }

  const rows = report
    ? onlyProblems ? report.rows.filter(r => r.kind !== 'issued') : report.rows
    : []

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold">รายงานเลขต่อเนื่อง</h1>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-medium text-red-600 dark:text-red-400">เลขหาย</span> = ตัวนับเดินไปแล้วแต่ไม่มีเอกสารในระบบ ต้องสอบสวนว่าหายไปไหน ·{' '}
          <span className="font-medium">ยกเลิก (VOID)</span> = ยกเลิกแล้ว แต่เลขนั้นถูกใช้ไปแล้ว ไม่นำกลับมาใช้ซ้ำ
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">แบรนด์</Label>
            <Select value={b} onValueChange={pickBrand}>
              <SelectTrigger className="w-48"><SelectValue placeholder="เลือกแบรนด์" /></SelectTrigger>
              <SelectContent>
                {brands.map(x => (
                  <SelectItem key={x.code} value={x.code}>{x.code} — {x.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">ประเภทเอกสาร</Label>
            <Select value={t} onValueChange={pickType} disabled={!b}>
              <SelectTrigger className="w-56"><SelectValue placeholder="เลือกประเภท" /></SelectTrigger>
              <SelectContent>
                {types.map(x => (
                  <SelectItem key={x} value={x}>{x} — {typeLabel(x)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">งวด</Label>
            <Select value={p} onValueChange={setP} disabled={!t}>
              <SelectTrigger className="w-40"><SelectValue placeholder="เลือกงวด" /></SelectTrigger>
              <SelectContent>
                {periods.map(x => (
                  <SelectItem key={x.period} value={x.period}>
                    {periodLabel(x.period, x.yearly)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={run} disabled={!b || !t || !p}>
            <Search className="h-4 w-4 mr-1.5" /> ตรวจสอบ
          </Button>
        </CardContent>
      </Card>

      {report?.error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" /> {report.error}
        </div>
      )}

      {!report && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {series.length === 0
              ? 'ยังไม่มีชุดเลขเอกสาร — ออกเอกสารสักใบก่อนแล้วค่อยกลับมาตรวจ'
              : 'เลือกแบรนด์ ประเภท และงวด แล้วกด "ตรวจสอบ"'}
          </CardContent>
        </Card>
      )}

      {report && !report.error && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-3 py-1 text-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              ออกแล้ว {report.summary.issued}
            </span>
            <span className="rounded-full px-3 py-1 text-sm bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              ยกเลิก {report.summary.void}
            </span>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${
              report.summary.missing > 0
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
            }`}>
              หาย {report.summary.missing}
            </span>
            <span className={`rounded-full px-3 py-1 text-sm ${
              report.duplicates.length > 0
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 font-bold'
                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
            }`}>
              ซ้ำ {report.duplicates.length}
            </span>
            <span className="text-xs text-muted-foreground ml-1">
              ตัวนับล่าสุด {report.last_number}
            </span>

            <div className="ml-auto flex items-center gap-2">
              <Switch id="only-problems" checked={onlyProblems} onCheckedChange={setOnlyProblems} />
              <Label htmlFor="only-problems" className="text-sm">แสดงเฉพาะเลขหาย/ยกเลิก</Label>
            </div>
          </div>

          {report.duplicates.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              เลขซ้ำ: {report.duplicates.join(', ')} — ผิดปกติ แจ้งผู้ดูแลระบบทันที
            </div>
          )}

          <Card>
            <CardContent className="p-3 grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {rows.map(r => {
                const no = String(r.number).padStart(4, '0')
                if (r.kind === 'missing') {
                  return (
                    <div
                      key={r.number}
                      className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-2.5 py-2"
                    >
                      <div className="font-mono font-semibold text-red-700 dark:text-red-400">{no}</div>
                      <div className="text-xs text-red-600 dark:text-red-400">ไม่มีเอกสาร</div>
                    </div>
                  )
                }
                if (r.kind === 'void') {
                  return (
                    <div
                      key={r.number}
                      title={r.void_reason ? `เหตุผลที่ยกเลิก: ${r.void_reason}` : 'ยกเลิกแล้ว'}
                      className="rounded-md border bg-neutral-100 dark:bg-neutral-900 px-2.5 py-2"
                    >
                      <Link
                        href={`/documents/${r.id}`}
                        className="font-mono font-semibold line-through text-neutral-500 dark:text-neutral-400"
                      >
                        {no}
                      </Link>
                      <div className="text-xs text-neutral-500 truncate">
                        ยกเลิก{r.party_name ? ` · ${r.party_name}` : ''}
                      </div>
                    </div>
                  )
                }
                return (
                  <Link
                    key={r.number}
                    href={`/documents/${r.id}`}
                    className="rounded-md border px-2.5 py-2 hover:bg-accent block"
                  >
                    <div className="font-mono font-semibold">{no}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.party_name || r.doc_no}
                    </div>
                  </Link>
                )
              })}
              {rows.length === 0 && (
                <div className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  {onlyProblems ? 'ไม่มีเลขหายหรือเลขที่ยกเลิกในงวดนี้' : 'ชุดนี้ยังไม่ได้ออกเลข'}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
