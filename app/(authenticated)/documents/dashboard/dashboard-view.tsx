'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Clock, AlertTriangle, FileCheck2, Timer, BarChart3, PieChart, ChevronRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { THAI_MONTHS } from '@/lib/thai-date'
import { DOC_TYPES, type DocStatus } from '../doc-types'
import type { DocumentsDashboard } from './actions'

// Tailwind class ของ STATUS_LABEL ป้อนให้ Recharts ไม่ได้ — ต้องเป็น hex
const STATUS_HEX: Record<DocStatus, string> = {
  draft:            '#a1a1aa',
  pending_approval: '#f59e0b',
  rejected:         '#dc2626',
  issued:           '#10b981',
  sent:             '#0ea5e9',
  void:             '#71717a',
  closed:           '#8b5cf6',
}

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

const monthLabel = (m: string) => {
  const [y, mm] = m.split('-').map(Number)
  return `${THAI_MONTHS[(mm || 1) - 1]} ${y + 543}`
}

/** "3 ชม." / "2 วัน" — รับชั่วโมงที่คำนวณมาจาก server (render ต้อง pure) */
function waited(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} นาที`
  if (hours < 24) return `${Math.round(hours)} ชม.`
  return `${Math.floor(hours / 24)} วัน`
}

// ── Tooltips ─────────────────────────────────────────────────────────────────

const tipBox =
  'bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700/80 rounded-xl shadow-2xl p-3 text-sm space-y-1 min-w-[160px]'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypeTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className={tipBox}>
      <p className="font-bold text-zinc-900 dark:text-zinc-100 text-[13px]">{d?.label}</p>
      <div className="flex justify-between gap-6 text-xs">
        <span className="text-zinc-500">ยอดสุทธิ</span>
        <span className="font-semibold">{fmt(d?.sum || 0)} ฿</span>
      </div>
      <div className="flex justify-between gap-6 text-xs">
        <span className="text-zinc-500">จำนวน</span>
        <span className="font-semibold">{d?.count || 0} ใบ</span>
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StatusTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className={tipBox}>
      <p className="font-bold text-zinc-900 dark:text-zinc-100 text-[13px]">{d?.label}</p>
      <div className="flex justify-between gap-6 text-xs">
        <span className="text-zinc-500">จำนวน</span>
        <span className="font-semibold">{d?.count || 0} ใบ</span>
      </div>
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────

function Stat({
  icon: Icon, label, value, hint, danger,
}: {
  icon: typeof Clock
  label: string
  value: string
  hint?: string
  danger?: boolean
}) {
  return (
    <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
      <div className={`h-0.5 ${danger ? 'bg-gradient-to-r from-red-500 via-red-300 to-transparent' : 'bg-gradient-to-r from-zinc-900 via-zinc-500 to-transparent dark:from-zinc-100 dark:via-zinc-500 dark:to-transparent'}`} />
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{value}</p>
            {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${danger ? 'bg-red-50 dark:bg-red-900/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
            <Icon className={`h-4 w-4 ${danger ? 'text-red-600 dark:text-red-400' : 'text-zinc-600 dark:text-zinc-400'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const Empty = ({ text }: { text: string }) => (
  <div className="h-[240px] flex flex-col items-center justify-center text-muted-foreground">
    <BarChart3 className="h-8 w-8 opacity-30 mb-2" />
    <p className="text-xs">{text}</p>
  </div>
)

// ── View ─────────────────────────────────────────────────────────────────────

export default function DashboardView({ data }: { data: DocumentsDashboard }) {
  const router = useRouter()

  const statusData = data.byStatus.filter(s => s.count > 0)
  const hasTypes = data.totalByType.length > 0

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header + month filter */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">แดชบอร์ดเอกสาร</h1>
          <p className="text-xs text-muted-foreground mt-0.5">ข้อมูลเดือน {monthLabel(data.month)}</p>
          {!data.isAdmin && (
            <p className="text-xs text-muted-foreground mt-1">แสดงเฉพาะเอกสารของคุณ</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="doc-dash-month" className="text-xs text-muted-foreground">เดือน</label>
          <input
            id="doc-dash-month"
            type="month"
            value={data.month}
            onChange={(e) => {
              const v = e.target.value
              if (v) router.replace(`/documents/dashboard?month=${v}`)
            }}
            className="h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 text-sm"
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Clock} label="รออนุมัติ" value={`${fmt(data.pendingCount)} ใบ`} />
        <Stat
          icon={AlertTriangle}
          label="ค้างเกิน 24 ชม."
          value={`${fmt(data.overdueCount)} ใบ`}
          danger={data.overdueCount > 0}
        />
        <Stat
          icon={FileCheck2}
          label="ออกเลขเดือนนี้"
          value={`${fmt(data.issuedThisMonth)} ใบ`}
          hint={monthLabel(data.month)}
        />
        <Stat
          icon={Timer}
          label="เวลาอนุมัติเฉลี่ย"
          value={data.avgApprovalHours === null ? '—' : `${data.avgApprovalHours} ชม.`}
          hint={data.avgApprovalHours === null ? 'ยังไม่มีการอนุมัติในเดือนนี้' : 'จากส่งถึงอนุมัติ'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ยอดสุทธิตามประเภท */}
        <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-300 to-transparent" />
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-bold">
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              ยอดสุทธิตามประเภท (เดือนนี้)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {hasTypes ? (
              <div className="w-full h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.totalByType} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      fontSize={11}
                      interval={0}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#71717a' }}
                    />
                    <YAxis
                      fontSize={11}
                      tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v))}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#a1a1aa' }}
                    />
                    <Tooltip content={<TypeTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                    <Bar dataKey="sum" name="ยอดสุทธิ" fill="#10b981" radius={[8, 8, 0, 0]} barSize={36} opacity={0.9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty text="ยังไม่มีเอกสารที่ออกเลขในเดือนนี้" />
            )}
          </CardContent>
        </Card>

        {/* จำนวนตามสถานะ */}
        <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-sky-500 via-sky-300 to-transparent" />
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-bold">
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <PieChart className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              จำนวนตามสถานะ
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {statusData.length > 0 ? (
              <div className="w-full h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statusData}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#a1a1aa' }}
                    />
                    <YAxis
                      dataKey="label"
                      type="category"
                      width={90}
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#52525b', fontWeight: 500 }}
                    />
                    <Tooltip content={<StatusTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                    <Bar dataKey="count" name="จำนวน" radius={[0, 8, 8, 0]} barSize={16}>
                      {statusData.map((s) => (
                        <Cell key={s.status} fill={STATUS_HEX[s.status]} opacity={0.9} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty text="ยังไม่มีเอกสารในระบบ" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* รออนุมัตินานที่สุด */}
      <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-amber-500 via-amber-300 to-transparent" />
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 font-bold">
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <Clock className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            </div>
            รออนุมัตินานที่สุด
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {data.recentPending.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">ไม่มีเอกสารรออนุมัติ</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.recentPending.map((d) => (
                <Link
                  key={d.id}
                  href={`/documents/${d.id}`}
                  className="flex items-center gap-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-md px-2 -mx-2 transition-colors"
                >
                  <Badge variant="outline" className="text-[10px] rounded-full shrink-0">
                    {DOC_TYPES[d.doc_type]?.label.th || d.doc_type}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.party_name || d.draft_no}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {d.draft_no} · ส่งมาแล้ว {waited(d.waited_hours)}
                    </p>
                  </div>
                  {d.net_payable > 0 && (
                    <span className="text-sm font-semibold shrink-0 hidden sm:inline">
                      {fmt(d.net_payable)} ฿
                    </span>
                  )}
                  {d.overdue && (
                    <span className="shrink-0 text-[10px] font-medium rounded-full px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      ค้างเกิน 24 ชม.
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
