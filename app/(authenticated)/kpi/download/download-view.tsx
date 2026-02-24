'use client'

import { useState, useMemo } from 'react'
import { Download, FileSpreadsheet, FileText, FileDown, Users, ClipboardList, Target, Shield, User, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLocale } from '@/lib/i18n/context'
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
  isAdmin: boolean
}

const fmt = (n: number | null | undefined) => String(n ?? 0)
const today = () => new Date().toISOString().slice(0, 10)

export default function DownloadView({ templates, assignments, evaluations, isAdmin }: Props) {
  const { t, locale } = useLocale()
  const [downloaded, setDownloaded] = useState<string | null>(null)

  const flash = (key: string) => {
    setDownloaded(key)
    setTimeout(() => setDownloaded(null), 2000)
  }

  const MONTH_NAMES_TH = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ]

  // Month filter
  const [selectedMonth, setSelectedMonth] = useState<string>('all')

  const monthOptions = useMemo(() => {
    const monthSet = new Set<string>()
    // From assignments
    assignments.forEach((a: any) => {
      if (a.period_start) monthSet.add(a.period_start.slice(0, 7))
    })
    // From evaluations
    evaluations.forEach((ev: any) => {
      if (ev.evaluation_date) monthSet.add(ev.evaluation_date.slice(0, 7))
    })
    return Array.from(monthSet).sort().map(key => {
      const [y, m] = key.split('-')
      return { value: key, label: `${MONTH_NAMES_TH[parseInt(m) - 1]} ${parseInt(y) + 543}` }
    })
  }, [assignments, evaluations])

  // Filtered data
  const filteredAssignments = useMemo(() => {
    if (selectedMonth === 'all') return assignments
    return assignments.filter((a: any) => a.period_start?.startsWith(selectedMonth))
  }, [assignments, selectedMonth])

  const filteredEvaluations = useMemo(() => {
    if (selectedMonth === 'all') return evaluations
    return evaluations.filter((ev: any) => {
      const periodMonth = ev.kpi_assignments?.period_start?.slice(0, 7)
      return periodMonth === selectedMonth
    })
  }, [evaluations, selectedMonth])

  // ===== Export handlers =====
  // Headers use localized labels from t.kpi

  const exportTemplatesCsv = () => {
    const headers = ['ID', t.kpi.download.templatesTitle, t.kpi.common.target, locale === 'th' ? 'หน่วย' : 'Unit', t.kpi.common.date]
    const rows = templates.map((tmpl: any) => [
      tmpl.id,
      tmpl.name,
      fmt(tmpl.default_target),
      tmpl.target_unit || '',
      tmpl.created_at?.slice(0, 10) || '',
    ])
    downloadCsv(`kpi_templates_${today()}.csv`, toCsv(headers, rows))
    flash('templates-csv')
  }

  const exportAssignmentsCsv = () => {
    const headers = [
      'ID', t.kpi.download.assignmentsTitle, t.kpi.common.employee, t.kpi.common.department,
      t.kpi.common.target, locale === 'th' ? 'หน่วย' : 'Unit', t.kpi.common.period, locale === 'th' ? 'สถานะ' : 'Status',
      t.kpi.common.date,
    ]
    const rows = filteredAssignments.map((a: any) => [
      a.id,
      a.kpi_templates?.name || a.custom_name || '',
      a.profiles?.full_name || '',
      a.profiles?.department || '',
      fmt(a.target),
      a.target_unit || '',
      a.cycle || '',
      a.status || '',
      a.created_at?.slice(0, 10) || '',
    ])
    downloadCsv(`kpi_assignments_${today()}.csv`, toCsv(headers, rows))
    flash('assignments-csv')
  }

  const exportEvaluationsCsv = () => {
    const headers = [
      'ID', locale === 'th' ? 'ชื่อ KPI' : 'KPI Name', t.kpi.common.employee, t.kpi.common.department,
      t.kpi.reports.evalDate, t.kpi.common.period, t.kpi.common.target, t.kpi.common.actual,
      t.kpi.common.difference, 'Achievement %', t.kpi.common.comment,
    ]
    const rows = filteredEvaluations.map((ev: any) => {
      const a = ev.kpi_assignments
      const target = a?.target || 0
      const actual = ev.actual_value || 0
      const diff = target > 0 ? actual - target : 0
      const pct = ev.achievement_pct != null ? String(ev.achievement_pct) : (target > 0 ? ((actual / target) * 100).toFixed(1) : '0')
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
        ev.comment || '',
      ]
    })
    downloadCsv(`kpi_evaluations_${today()}.csv`, toCsv(headers, rows))
    flash('evaluations-csv')
  }

  const exportAllJson = () => {
    downloadJson(`kpi_raw_data_${today()}.json`, {
      exported_at: new Date().toISOString(),
      month: selectedMonth,
      templates,
      assignments: filteredAssignments,
      evaluations: filteredEvaluations,
    })
    flash('all-json')
  }

  const exportAllExcel = () => {
    const wb = XLSX.utils.book_new()

    const headers = [
      locale === 'th' ? 'ชื่อ KPI' : 'KPI Name',
      locale === 'th' ? 'โหมด' : 'Mode',
      t.kpi.common.employee,
      t.kpi.common.department,
      t.kpi.common.target,
      locale === 'th' ? 'หน่วย' : 'Unit',
      locale === 'th' ? 'รอบ' : 'Cycle',
      locale === 'th' ? 'สถานะ' : 'Status',
      t.kpi.reports.evalDate,
      t.kpi.common.period,
      t.kpi.common.actual,
      t.kpi.common.difference,
      locale === 'th' ? 'ผลสำเร็จ(%)' : 'Achievement %',
      t.kpi.common.comment,
    ]
    const rows = filteredEvaluations.map((ev: any) => {
      const a = ev.kpi_assignments
      const target = Number(a?.target) || 0
      const actual = Number(ev.actual_value) || 0
      const diff = target > 0 ? actual - target : 0
      const achPct = ev.achievement_pct != null ? Number(ev.achievement_pct) : (target > 0 ? Math.round((actual / target) * 1000) / 10 : 0)
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
        achPct,
        ev.comment || '',
      ]
    })

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    ws['!cols'] = [
      { wch: 25 }, { wch: 12 }, { wch: 22 }, { wch: 15 },
      { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 10 },
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 30 },
    ]
    ws['!autofilter'] = { ref: `A1:M${rows.length + 1}` }
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
    ...(isAdmin ? [{
      key: 'templates-csv',
      title: t.kpi.download.templatesTitle,
      description: t.kpi.download.templatesDesc,
      icon: FileText,
      count: templates.length,
      unit: 'templates',
      action: exportTemplatesCsv,
      format: 'CSV',
    }] : []),
    {
      key: 'assignments-csv',
      title: t.kpi.download.assignmentsTitle,
      description: isAdmin ? t.kpi.download.assignmentsDescAdmin : t.kpi.download.assignmentsDescUser,
      icon: Users,
      count: filteredAssignments.length,
      unit: 'assignments',
      action: exportAssignmentsCsv,
      format: 'CSV',
    },
    {
      key: 'evaluations-csv',
      title: t.kpi.download.evalsTitle,
      description: isAdmin ? t.kpi.download.evalsDescAdmin : t.kpi.download.evalsDescUser,
      icon: ClipboardList,
      count: filteredEvaluations.length,
      unit: 'evaluations',
      action: exportEvaluationsCsv,
      format: 'CSV',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Download className="h-6 w-6" />
            {t.kpi.download.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? t.kpi.download.subtitleAdmin : t.kpi.download.subtitleUser}
          </p>
        </div>
        <Badge className={`gap-1.5 px-3 py-1.5 text-xs font-medium ${
          isAdmin
            ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
        }`}>
          {isAdmin ? <Shield className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
          {isAdmin ? t.kpi.download.roleAdmin : t.kpi.download.roleStaff}
        </Badge>
      </div>

      {/* Month Filter */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="เลือกเดือน" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกเดือน</SelectItem>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <h3 className="font-semibold">{t.kpi.download.exportAll}</h3>
                <p className="text-sm text-muted-foreground">{t.kpi.download.exportAllDesc}</p>
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Button className="gap-2" onClick={exportAllExcel}>
                <FileSpreadsheet className="h-4 w-4" />
                {t.kpi.download.excelBtn}
                {downloaded === 'all-excel' && <Badge className="bg-green-500 text-white ml-1">✓</Badge>}
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportAllCsv}>
                <FileSpreadsheet className="h-4 w-4" />
                {t.kpi.download.csvBtn}
                {downloaded === 'all-csv' && <Badge className="bg-green-500 text-white ml-1">✓</Badge>}
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportAllJson}>
                <Target className="h-4 w-4" />
                {t.kpi.download.jsonBtn}
                {downloaded === 'all-json' && <Badge className="bg-green-500 text-white ml-1">✓</Badge>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual cards */}
      <div className={`grid gap-4 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {cards.map((card) => (
          <Card key={card.key} className="hover:shadow-md transition-shadow group">
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
              <CardDescription className="text-xs">{card.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={card.action}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                {locale === 'th' ? 'ดาวน์โหลด' : 'Download'} {card.format}
                {downloaded === card.key && (
                  <Badge className="bg-green-500 text-white ml-1 text-[10px]">✓</Badge>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data preview summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t.kpi.download.previewTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4 text-center`}>
            {isAdmin && (
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
                <div className="text-2xl font-bold">{templates.length}</div>
                <div className="text-xs text-muted-foreground">Templates</div>
              </div>
            )}
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <div className="text-2xl font-bold">{filteredAssignments.length}</div>
              <div className="text-xs text-muted-foreground">{isAdmin ? 'Assignments' : t.kpi.download.myKpi}</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <div className="text-2xl font-bold">{filteredEvaluations.length}</div>
              <div className="text-xs text-muted-foreground">{isAdmin ? 'Evaluations' : t.kpi.download.myEvals}</div>
            </div>
            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900">
              <div className="text-2xl font-bold">
                {filteredAssignments.filter((a: any) => a.status === 'active').length}
              </div>
              <div className="text-xs text-muted-foreground">Active KPIs</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
