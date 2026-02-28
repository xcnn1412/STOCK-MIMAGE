'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, FileSpreadsheet, FileJson } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { FinanceCategory } from '@/app/(authenticated)/finance/settings-actions'
import type { JobCostEvent, JobCostItem } from '@/types/database.types'

type JobEventWithItems = JobCostEvent & { job_cost_items: JobCostItem[] }

export default function DownloadView({ jobEvents, categories }: { jobEvents: JobEventWithItems[]; categories: FinanceCategory[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'

  const downloadCSV = () => {
    // Build CSV rows
    const headers = [
      'Event Name', 'Event Date', 'Location', 'Revenue',
      'Category', 'Description', 'Amount', 'Cost Date', 'Notes',
      'Total Cost', 'Profit', 'Margin %'
    ]

    const rows: string[][] = []
    jobEvents.forEach(event => {
      const totalCost = (event.job_cost_items || []).reduce((s, i) => s + (i.amount || 0), 0)
      const profit = (event.revenue || 0) - totalCost
      const margin = event.revenue ? ((profit / event.revenue) * 100).toFixed(1) : '0'

      if (event.job_cost_items?.length) {
        event.job_cost_items.forEach((item, idx) => {
          const catInfo = categories.find(c => c.value === item.category)
          rows.push([
            idx === 0 ? event.event_name : '',
            idx === 0 ? (event.event_date || '') : '',
            idx === 0 ? (event.event_location || '') : '',
            idx === 0 ? String(event.revenue || 0) : '',
            catInfo?.label_th || item.category,
            item.description || '',
            String(item.amount || 0),
            item.cost_date || '',
            item.notes || '',
            idx === 0 ? String(totalCost) : '',
            idx === 0 ? String(profit) : '',
            idx === 0 ? margin : '',
          ])
        })
      } else {
        rows.push([
          event.event_name,
          event.event_date || '',
          event.event_location || '',
          String(event.revenue || 0),
          '', '', '', '', '',
          '0', String(-(event.revenue || 0)), event.revenue ? '-100.0' : '0',
        ])
      }
    })

    const csv = '\ufeff' + [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `costs-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadJSON = () => {
    const data = jobEvents.map(event => {
      const totalCost = (event.job_cost_items || []).reduce((s, i) => s + (i.amount || 0), 0)
      return {
        event_name: event.event_name,
        event_date: event.event_date,
        event_location: event.event_location,
        revenue: event.revenue,
        total_cost: totalCost,
        profit: (event.revenue || 0) - totalCost,
        margin_pct: event.revenue ? (((event.revenue - totalCost) / event.revenue) * 100).toFixed(1) : 0,
        cost_items: (event.job_cost_items || []).map(item => ({
          category: item.category,
          description: item.description,
          amount: item.amount,
          cost_date: item.cost_date,
          notes: item.notes,
        })),
      }
    })

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `costs-report-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{isEn ? 'Download Report' : 'ดาวน์โหลดรายงาน'}</h2>
        <p className="text-muted-foreground">
          {isEn ? 'Export cost data as CSV or JSON' : 'ส่งออกข้อมูลต้นทุนเป็น CSV หรือ JSON'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              CSV
            </CardTitle>
            <CardDescription>
              {isEn
                ? `Export all ${jobEvents.length} events with cost breakdowns`
                : `ส่งออก ${jobEvents.length} งาน พร้อมรายละเอียดต้นทุน`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={downloadCSV} className="w-full" disabled={jobEvents.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              {isEn ? 'Download CSV' : 'ดาวน์โหลด CSV'}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileJson className="h-5 w-5 text-blue-600" />
              JSON
            </CardTitle>
            <CardDescription>
              {isEn
                ? 'Structured data for integrations'
                : 'ข้อมูลแบบ JSON สำหรับเชื่อมต่อระบบอื่น'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={downloadJSON} variant="outline" className="w-full" disabled={jobEvents.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              {isEn ? 'Download JSON' : 'ดาวน์โหลด JSON'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
