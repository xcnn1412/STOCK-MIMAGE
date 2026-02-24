'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, FileText, FileDown, Users, ClipboardList, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import * as XLSX from 'xlsx'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ===== CSV Utility =====
function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(',')),
  ]
  // BOM for Excel Thai support
  return '\uFEFF' + lines.join('\r\n')
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ===== JSON download =====
function downloadJson(filename: string, data: any) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ===== Types =====
interface Props {
  templates: any[]
  assignments: any[]
  evaluations: any[]
}

const fmt = (n: number | null | undefined) => String(n ?? 0)
const today = () => new Date().toISOString().slice(0, 10)

export default function DownloadView({ templates, assignments, evaluations }: Props) {
  const [downloaded, setDownloaded] = useState<string | null>(null)

  const flash = (key: string) => {
    setDownloaded(key)
    setTimeout(() => setDownloaded(null), 2000)
  }

  // ===== Export handlers =====

  const exportTemplatesCsv = () => {
    const headers = ['ID', 'ชื่อ KPI', 'โหมด', 'เป้าหมายเริ่มต้น', 'หน่วย', 'วันที่สร้าง']
    const rows = templates.map((t: any) => [
      t.id,
      t.name,
      t.mode,
      fmt(t.default_target),
      t.target_unit || '',
      t.created_at?.slice(0, 10) || '',
    ])
    downloadCsv(`kpi_templates_${today()}.csv`, toCsv(headers, rows))
    flash('templates-csv')
  }

  const exportAssignmentsCsv = () => {
    const headers = [
      'ID', 'ชื่อ KPI', 'โหมด', 'พนักงาน', 'แผนก',
      'เป้าหมาย', 'หน่วย', 'รอบ', 'สถานะ', 'วันที่เริ่ม', 'วันที่สิ้นสุด', 'วันที่สร้าง',
    ]
    const rows = assignments.map((a: any) => [
      a.id,
      a.kpi_templates?.name || a.custom_name || '',
      a.kpi_templates?.mode || a.custom_mode || '',
      a.profiles?.full_name || '',
      a.profiles?.department || '',
      fmt(a.target),
      a.target_unit || '',
      a.cycle || '',
      a.status || '',
      a.start_date || '',
      a.end_date || '',
      a.created_at?.slice(0, 10) || '',
    ])
    downloadCsv(`kpi_assignments_${today()}.csv`, toCsv(headers, rows))
    flash('assignments-csv')
  }

  const exportEvaluationsCsv = () => {
    const headers = [
      'ID', 'ชื่อ KPI', 'พนักงาน', 'แผนก',
      'วันที่ประเมิน', 'Period', 'เป้าหมาย', 'ค่าจริง',
      'ผลต่าง', 'Achievement %', 'Score', 'Comment',
    ]
    const rows = evaluations.map((ev: any) => {
      const a = ev.kpi_assignments
      const target = a?.target || 0
      const actual = ev.actual_value || 0
      const diff = target > 0 ? actual - target : 0
      const pct = target > 0 ? ((actual / target) * 100).toFixed(1) : '0'
      return [
        ev.id,
        a?.kpi_templates?.name || a?.custom_name || '',
        a?.profiles?.full_name || '',
        a?.profiles?.department || '',
        ev.evaluation_date || '',
        ev.period_label || '',
        fmt(target),
        fmt(actual),
        fmt(diff),
        pct,
        fmt(ev.score),
        ev.comment || '',
      ]
    })
    downloadCsv(`kpi_evaluations_${today()}.csv`, toCsv(headers, rows))
    flash('evaluations-csv')
  }

  const exportAllJson = () => {
    downloadJson(`kpi_raw_data_${today()}.json`, {
      exported_at: new Date().toISOString(),
      templates,
      assignments,
      evaluations,
    })
    flash('all-json')
  }

  const exportAllExcel = () => {
    const wb = XLSX.utils.book_new()

    // Flat Report — 1 sheet, ทุกข้อมูล denormalize เป็นแถวเดียว
    const headers = [
      'ชื่อ KPI', 'โหมด', 'พนักงาน', 'แผนก',
      'เป้าหมาย', 'หน่วย', 'รอบ', 'สถานะ',
      'วันที่ประเมิน', 'Period', 'ค่าจริง', 'ผลต่าง',
      'Achievement %', 'Score', 'Comment',
    ]
    const rows = evaluations.map((ev: any) => {
      const a = ev.kpi_assignments
      const target = Number(a?.target) || 0
      const actual = Number(ev.actual_value) || 0
      const diff = target > 0 ? actual - target : 0
      const pct = target > 0 ? Math.round((actual / target) * 1000) / 10 : 0
      return [
        a?.kpi_templates?.name || a?.custom_name || '',
        a?.kpi_templates?.mode || a?.custom_mode || '',
        a?.profiles?.full_name || '',
        a?.profiles?.department || '',
        target,
        a?.target_unit || '',
        a?.cycle || '',
        a?.status || '',
        ev.evaluation_date || '',
        ev.period_label || '',
        actual,
        diff,
        pct,
        Number(ev.score) || 0,
        ev.comment || '',
      ]
    })

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    // Auto-width columns
    ws['!cols'] = [
      { wch: 25 }, // ชื่อ KPI
      { wch: 12 }, // โหมด
      { wch: 22 }, // พนักงาน
      { wch: 15 }, // แผนก
      { wch: 14 }, // เป้าหมาย
      { wch: 10 }, // หน่วย
      { wch: 18 }, // รอบ
      { wch: 10 }, // สถานะ
      { wch: 14 }, // วันที่ประเมิน
      { wch: 12 }, // Period
      { wch: 14 }, // ค่าจริง
      { wch: 14 }, // ผลต่าง
      { wch: 14 }, // Achievement %
      { wch: 8 },  // Score
      { wch: 30 }, // Comment
    ]
    // Auto-filter
    ws['!autofilter'] = { ref: `A1:O${rows.length + 1}` }
    XLSX.utils.book_append_sheet(wb, ws, 'KPI Report')

    XLSX.writeFile(wb, `kpi_report_${today()}.xlsx`)
    flash('all-excel')
  }

  const exportAllCsv = () => {
    exportTemplatesCsv()
    exportAssignmentsCsv()
    exportEvaluationsCsv()
    flash('all-csv')
  }

  const cards = [
    {
      key: 'templates-csv',
      title: 'KPI Templates',
      description: 'ดาวน์โหลดรายการ Template ทุกรายการ',
      icon: FileText,
      count: templates.length,
      unit: 'templates',
      action: exportTemplatesCsv,
      format: 'CSV',
    },
    {
      key: 'assignments-csv',
      title: 'KPI Assignments',
      description: 'ดาวน์โหลดรายการมอบหมาย KPI ทั้งหมด',
      icon: Users,
      count: assignments.length,
      unit: 'assignments',
      action: exportAssignmentsCsv,
      format: 'CSV',
    },
    {
      key: 'evaluations-csv',
      title: 'KPI Evaluations',
      description: 'ดาวน์โหลดผลประเมินทั้งหมดพร้อมรายละเอียด',
      icon: ClipboardList,
      count: evaluations.length,
      unit: 'evaluations',
      action: exportEvaluationsCsv,
      format: 'CSV',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Download className="h-6 w-6" />
          ดาวน์โหลดข้อมูล KPI
        </h2>
        <p className="text-sm text-muted-foreground">
          ส่งออกข้อมูล KPI เป็นไฟล์ CSV หรือ JSON เพื่อนำไปวิเคราะห์ต่อ (Admin Only)
        </p>
      </div>

      {/* Quick Export All */}
      <Card className="border-dashed border-2">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800">
                <FileDown className="h-8 w-8 text-zinc-600 dark:text-zinc-300" />
              </div>
              <div>
                <h3 className="font-semibold">ส่งออกทั้งหมด</h3>
                <p className="text-sm text-muted-foreground">
                  ดาวน์โหลดข้อมูลทุกประเภทพร้อมกัน
                </p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Button
                className="gap-2"
                onClick={exportAllExcel}
              >
                <FileSpreadsheet className="h-4 w-4" />
                ดาวน์โหลด Excel (.xlsx)
                {downloaded === 'all-excel' && <Badge className="bg-green-500 text-white ml-1">✓</Badge>}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportAllCsv}
              >
                <FileSpreadsheet className="h-4 w-4" />
                CSV แยกไฟล์
                {downloaded === 'all-csv' && <Badge className="bg-green-500 text-white ml-1">✓</Badge>}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportAllJson}
              >
                <Target className="h-4 w-4" />
                JSON
                {downloaded === 'all-json' && <Badge className="bg-green-500 text-white ml-1">✓</Badge>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Card
            key={card.key}
            className="hover:shadow-md transition-shadow group"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                  <card.icon className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
                </div>
                <Badge variant="secondary" className="text-xs">
                  {card.count.toLocaleString()} {card.unit}
                </Badge>
              </div>
              <CardTitle className="text-base mt-3">{card.title}</CardTitle>
              <CardDescription className="text-xs">
                {card.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={card.action}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                ดาวน์โหลด {card.format}
                {downloaded === card.key && (
                  <Badge className="bg-green-500 text-white ml-1 text-[10px]">✓ สำเร็จ</Badge>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data preview summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">ข้อมูลที่จะส่งออก</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <div className="text-2xl font-bold">{templates.length}</div>
              <div className="text-xs text-muted-foreground">Templates</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <div className="text-2xl font-bold">{assignments.length}</div>
              <div className="text-xs text-muted-foreground">Assignments</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <div className="text-2xl font-bold">{evaluations.length}</div>
              <div className="text-xs text-muted-foreground">Evaluations</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <div className="text-2xl font-bold">
                {assignments.filter((a: any) => a.status === 'active').length}
              </div>
              <div className="text-xs text-muted-foreground">Active KPIs</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
