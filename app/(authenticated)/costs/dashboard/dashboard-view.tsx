'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { DollarSign, TrendingUp, TrendingDown, BarChart3, CalendarDays } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { COST_CATEGORIES, getCategoryColor } from '../types'
import type { JobCostEvent, JobCostItem } from '@/types/database.types'

type JobEventWithItems = JobCostEvent & { job_cost_items: JobCostItem[] }

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function DashboardView({ jobEvents }: { jobEvents: JobEventWithItems[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'

  // สรุปตัวเลข
  const totalRevenue = jobEvents.reduce((sum, e) => sum + (e.revenue || 0), 0)
  const totalCost = jobEvents.reduce((sum, e) => {
    const eventCost = (e.job_cost_items || []).reduce((s, item) => s + (item.amount || 0), 0)
    return sum + eventCost
  }, 0)
  const totalProfit = totalRevenue - totalCost
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

  // ต้นทุนแยกหมวด
  const costByCategory: Record<string, number> = {}
  jobEvents.forEach(e => {
    (e.job_cost_items || []).forEach(item => {
      costByCategory[item.category] = (costByCategory[item.category] || 0) + (item.amount || 0)
    })
  })

  const isProfitable = totalProfit >= 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{isEn ? 'Costs Dashboard' : 'แดชบอร์ดต้นทุน'}</h2>
        <p className="text-muted-foreground">{isEn ? 'Overview of all event costs and profits' : 'ภาพรวมต้นทุนและกำไรทุกงาน'}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* ราคาขายรวม */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" />
              {isEn ? 'Total Revenue' : 'ราคาขายรวม'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">฿{fmt(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">{jobEvents.length} {isEn ? 'events' : 'งาน'}</p>
          </CardContent>
        </Card>

        {/* ต้นทุนรวม */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-red-500" />
              {isEn ? 'Total Cost' : 'ต้นทุนรวม'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">฿{fmt(totalCost)}</p>
          </CardContent>
        </Card>

        {/* กำไรรวม */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className={`h-4 w-4 ${isProfitable ? 'text-green-500' : 'text-red-500'}`} />
              {isEn ? 'Total Profit' : 'กำไรรวม'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
              ฿{fmt(totalProfit)}
            </p>
          </CardContent>
        </Card>

        {/* Profit Margin */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              {isEn ? 'Avg Profit Margin' : 'Profit Margin เฉลี่ย'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
              {profitMargin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown by Category */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{isEn ? 'Cost Breakdown by Category' : 'สัดส่วนต้นทุนแยกตามหมวด'}</CardTitle>
          <CardDescription>{isEn ? 'How costs are distributed across categories' : 'แสดงสัดส่วนค่าใช้จ่ายในแต่ละหมวด'}</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(costByCategory).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isEn ? 'No cost data yet' : 'ยังไม่มีข้อมูลต้นทุน'}
            </p>
          ) : (
            <div className="space-y-3">
              {COST_CATEGORIES.filter(cat => costByCategory[cat.value]).map(cat => {
                const amount = costByCategory[cat.value] || 0
                const pct = totalCost > 0 ? (amount / totalCost) * 100 : 0
                return (
                  <div key={cat.value} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium truncate">
                      {isEn ? cat.label : cat.labelTh}
                    </div>
                    <div className="flex-1 h-6 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                    <div className="w-24 text-sm text-right font-mono">
                      ฿{fmt(amount)}
                    </div>
                    <div className="w-14 text-xs text-right text-muted-foreground">
                      {pct.toFixed(1)}%
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revenue vs Cost per Event */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-500" />
            {isEn ? 'Revenue vs Cost per Event' : 'ราคาขาย vs ต้นทุน แต่ละงาน'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {jobEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isEn ? 'No events imported yet — go to Import tab' : 'ยังไม่มีงาน — ไปที่แท็บนำเข้า'}
            </p>
          ) : (
            <div className="space-y-2">
              {jobEvents.slice(0, 10).map(event => {
                const eventCost = (event.job_cost_items || []).reduce((s, item) => s + (item.amount || 0), 0)
                const eventProfit = (event.revenue || 0) - eventCost
                const maxVal = Math.max(event.revenue || 0, eventCost, 1)
                return (
                  <div key={event.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium truncate max-w-[200px]">{event.event_name}</span>
                      <span className={`font-mono text-xs ${eventProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {eventProfit >= 0 ? '+' : ''}฿{fmt(eventProfit)}
                      </span>
                    </div>
                    <div className="flex gap-1 h-4">
                      {/* Revenue bar */}
                      <div
                        className="h-full bg-blue-400 rounded-sm"
                        style={{ width: `${((event.revenue || 0) / maxVal) * 50}%` }}
                        title={`${isEn ? 'Revenue' : 'ราคาขาย'}: ฿${fmt(event.revenue || 0)}`}
                      />
                      {/* Cost bar */}
                      <div
                        className="h-full bg-red-400 rounded-sm"
                        style={{ width: `${(eventCost / maxVal) * 50}%` }}
                        title={`${isEn ? 'Cost' : 'ต้นทุน'}: ฿${fmt(eventCost)}`}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-400 rounded-sm"/>{isEn ? 'Revenue' : 'ราคาขาย'}</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-400 rounded-sm"/>{isEn ? 'Cost' : 'ต้นทุน'}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
