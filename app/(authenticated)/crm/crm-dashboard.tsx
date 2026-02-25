'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Filter, LayoutGrid, List, ChevronDown, AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { getActiveStaff } from '@/database/staff-members'
import { AddLeadDialog } from './components/add-lead-dialog'
import { KanbanBoard } from './components/kanban-board'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Types & Constants
// ============================================================================

export type LeadStatus = 'lead' | 'quotation_sent' | 'accepted' | 'rejected'

export const STATUS_CONFIG: Record<LeadStatus, { label: string; labelTh: string; color: string; bgColor: string; textColor: string }> = {
  lead: { label: 'Lead', labelTh: 'ลูกค้าใหม่', color: '#3b82f6', bgColor: 'bg-blue-50 dark:bg-blue-950/30', textColor: 'text-blue-700 dark:text-blue-300' },
  quotation_sent: { label: 'Quotation Sent', labelTh: 'ส่งใบเสนอราคา', color: '#f59e0b', bgColor: 'bg-amber-50 dark:bg-amber-950/30', textColor: 'text-amber-700 dark:text-amber-300' },
  accepted: { label: 'Accepted', labelTh: 'ตอบรับ', color: '#10b981', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', textColor: 'text-emerald-700 dark:text-emerald-300' },
  rejected: { label: 'Rejected', labelTh: 'ปฏิเสธ', color: '#6b7280', bgColor: 'bg-zinc-100 dark:bg-zinc-800', textColor: 'text-zinc-600 dark:text-zinc-400' },
}

export const ALL_STATUSES: LeadStatus[] = ['lead', 'quotation_sent', 'accepted', 'rejected']

export interface CrmLead {
  id: string
  created_at: string
  updated_at: string
  created_by: string | null
  status: LeadStatus
  is_returning: boolean
  customer_name: string
  customer_line: string | null
  customer_phone: string | null
  customer_type: string | null
  lead_source: string | null
  event_date: string | null
  event_end_date: string | null
  event_days: number
  event_location: string | null
  event_details: string | null
  package_name: string | null
  quoted_price: number
  confirmed_price: number
  deposit: number
  installment_1: number
  installment_2: number
  installment_3: number
  installment_4: number
  installment_1_date: string | null
  installment_2_date: string | null
  installment_3_date: string | null
  installment_4_date: string | null
  installment_1_paid: boolean
  installment_2_paid: boolean
  installment_3_paid: boolean
  installment_4_paid: boolean
  installment_1_paid_date: string | null
  installment_2_paid_date: string | null
  installment_3_paid_date: string | null
  installment_4_paid_date: string | null
  quotation_ref: string | null
  notes: string | null
  event_id: string | null
  tags: string[]
  archived_at: string | null
  assigned_sales: string[]
  assigned_graphics: string[]
  assigned_staff: string[]
}

export interface CrmSetting {
  id: string
  category: string
  value: string
  label_th: string
  label_en: string
  color: string | null
  price: number | null
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

interface CrmDashboardProps {
  leads: CrmLead[]
  settings: CrmSetting[]
  users: Array<{ id: string; full_name: string | null; department: string | null }>
}

export default function CrmDashboard({ leads, settings, users }: CrmDashboardProps) {
  const { locale, t } = useLocale()
  const tc = t.crm
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Helper: get setting label by locale
  const getSettingLabel = useCallback((setting: CrmSetting) => {
    return locale === 'th' ? setting.label_th : setting.label_en
  }, [locale])

  // Helper: get status label by locale
  const getStatusLabel = useCallback((status: LeadStatus) => {
    return tc.statuses[status] || STATUS_CONFIG[status].label
  }, [tc])

  // Restore view mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('crm-view-mode')
    if (saved === 'kanban' || saved === 'table') setViewMode(saved)
  }, [])

  const handleViewModeChange = (mode: 'kanban' | 'table') => {
    setViewMode(mode)
    localStorage.setItem('crm-view-mode', mode)
  }

  // Sources from settings
  const sources = useMemo(() =>
    settings.filter(s => s.category === 'lead_source' && s.is_active),
    [settings])

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false
      if (sourceFilter !== 'all' && lead.lead_source !== sourceFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!lead.customer_name.toLowerCase().includes(q) &&
          !(lead.customer_line?.toLowerCase().includes(q)))
          return false
      }
      return true
    })
  }, [leads, statusFilter, sourceFilter, search])

  // Summary stats — per-status breakdown
  const stats = useMemo(() => {
    const statusCounts = ALL_STATUSES.reduce((acc, s) => {
      const filtered = leads.filter(l => l.status === s)
      acc[s] = {
        count: filtered.length,
        value: filtered.reduce((sum, l) => sum + (l.confirmed_price || l.quoted_price || 0), 0),
      }
      return acc
    }, {} as Record<LeadStatus, { count: number; value: number }>)

    return { ...statusCounts, total: leads.length }
  }, [leads])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {tc.dashboard.title}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {tc.dashboard.subtitle}
          </p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          {tc.dashboard.addEvent}
        </Button>
      </div>

      {/* Summary Cards — per-status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {ALL_STATUSES.map((status) => {
          const cfg = STATUS_CONFIG[status]
          const data = stats[status]
          return (
            <div key={status} className="relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-5">
              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(to bottom, ${cfg.color}, ${cfg.color}dd)` }} />
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{getStatusLabel(status)}</span>
              </div>
              <div className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {data.count}
              </div>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 tabular-nums">
                ฿{data.value.toLocaleString()}
              </p>
            </div>
          )
        })}
      </div>

      {/* View Toggle + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          <button
            onClick={() => handleViewModeChange('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'kanban'
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
          >
            <LayoutGrid className="h-4 w-4" />
            {tc.viewModes.kanban}
          </button>
          <button
            onClick={() => handleViewModeChange('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table'
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
          >
            <List className="h-4 w-4" />
            {tc.viewModes.table}
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder={tc.filters.searchCustomer}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 w-[200px]"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder={tc.filters.allStatus} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc.filters.allStatus}</SelectItem>
              {ALL_STATUSES.map(s => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_CONFIG[s].color }} />
                    {getStatusLabel(s)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder={tc.filters.allChannel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc.filters.allChannel}</SelectItem>
              {sources.map(s => (
                <SelectItem key={s.value} value={s.value}>{getSettingLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'kanban' ? (
        <div
          className="relative"
          style={{
            width: '100vw',
            marginLeft: 'calc(-50vw + 50%)',
            paddingLeft: '0.5rem',
            paddingRight: '0.5rem',
          }}
        >
          <KanbanBoard leads={filteredLeads} settings={settings} users={users} />
        </div>
      ) : (
        <TableView leads={filteredLeads} settings={settings} />
      )}

      {/* Add Lead Dialog */}
      <AddLeadDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        settings={settings}
        users={users}
      />
    </div>
  )
}


// ============================================================================
// Table View
// ============================================================================

function TableView({ leads, settings }: { leads: CrmLead[]; settings: CrmSetting[] }) {
  const { locale, t } = useLocale()
  const tc = t.crm
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const getStatusLabel = (status: LeadStatus) => {
    return tc.statuses[status] || STATUS_CONFIG[status].label
  }

  const getSettingLabel = (setting: CrmSetting) => {
    return locale === 'th' ? setting.label_th : setting.label_en
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const av = (a as any)[sortField]
      const bv = (b as any)[sortField]
      const cmp = String(av || '').localeCompare(String(bv || ''))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [leads, sortField, sortDir])

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors select-none"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortField === field && (
          <ChevronDown className={`h-3 w-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
        )}
      </span>
    </th>
  )

  const isOverdue = (lead: CrmLead) => {
    if (!lead.event_date) return false
    if (['accepted', 'rejected'].includes(lead.status)) return false
    return new Date(lead.event_date) < new Date()
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-zinc-100 dark:border-zinc-800">
          <tr>
            <SortHeader field="customer_name" label={tc.table.customer} />
            <SortHeader field="status" label={tc.table.status} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400">{tc.table.channel}</th>
            <SortHeader field="event_date" label={tc.table.eventDate} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400">{tc.table.package}</th>
            <SortHeader field="quoted_price" label={tc.table.quoted} />
            <SortHeader field="deposit" label={tc.table.depositCol} />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sortedLeads.map(lead => {
            const statusCfg = STATUS_CONFIG[lead.status]
            const sourceSetting = settings.find(s => s.category === 'lead_source' && s.value === lead.lead_source)
            const pkgSetting = settings.find(s => s.category === 'package' && s.value === lead.package_name)
            const overdue = isOverdue(lead)

            return (
              <tr
                key={lead.id}
                className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <Link href={`/crm/${lead.id}`} className="block">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                        {lead.customer_name}
                      </div>
                      {lead.is_returning && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                          {tc.kanban.returning}
                        </Badge>
                      )}
                      {overdue && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-0">
                          <AlertCircle className="h-3 w-3 mr-0.5" />
                          {tc.kanban.overdue}
                        </Badge>
                      )}
                    </div>
                    {lead.event_details && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate max-w-[200px]">
                        {lead.event_details}
                      </p>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge className={`${statusCfg.bgColor} ${statusCfg.textColor} border-0 text-xs`}>
                    {getStatusLabel(lead.status)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {sourceSetting ? getSettingLabel(sourceSetting) : (lead.lead_source || '—')}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {lead.event_date || '—'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {pkgSetting ? getSettingLabel(pkgSetting) : (lead.package_name || '—')}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {lead.quoted_price ? `฿${lead.quoted_price.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {lead.deposit ? `฿${lead.deposit.toLocaleString()}` : '฿0'}
                </td>
              </tr>
            )
          })}
          {sortedLeads.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-400 dark:text-zinc-500">
                {tc.dashboard.noLeads}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
