'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Filter, LayoutGrid, List, ChevronDown,
  Calendar, DollarSign, CheckCircle2, Users, AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getActiveStaff } from '@/database/staff-members'
import { AddLeadDialog } from './components/add-lead-dialog'
import { KanbanBoard } from './components/kanban-board'

// ============================================================================
// Types & Constants
// ============================================================================

export type LeadStatus = 'lead' | 'booking' | 'following_up' | 'accepted' | 'rejected' | 'debt_collection' | 'cancelled'

export const STATUS_CONFIG: Record<LeadStatus, { label: string; labelTh: string; color: string; bgColor: string; textColor: string }> = {
  lead:            { label: 'Lead',            labelTh: 'ลูกค้าใหม่',  color: '#3b82f6', bgColor: 'bg-blue-50 dark:bg-blue-950/30',     textColor: 'text-blue-700 dark:text-blue-300' },
  booking:         { label: 'Booking',         labelTh: 'จอง',         color: '#f59e0b', bgColor: 'bg-amber-50 dark:bg-amber-950/30',   textColor: 'text-amber-700 dark:text-amber-300' },
  following_up:    { label: 'Following Up',    labelTh: 'ติดตาม',      color: '#f97316', bgColor: 'bg-orange-50 dark:bg-orange-950/30', textColor: 'text-orange-700 dark:text-orange-300' },
  accepted:        { label: 'Accepted',        labelTh: 'ตอบรับ',      color: '#10b981', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', textColor: 'text-emerald-700 dark:text-emerald-300' },
  rejected:        { label: 'Rejected',        labelTh: 'ปฏิเสธ',      color: '#6b7280', bgColor: 'bg-zinc-100 dark:bg-zinc-800',       textColor: 'text-zinc-600 dark:text-zinc-400' },
  debt_collection: { label: 'Debt Collection', labelTh: 'เก็บเงิน',    color: '#8b5cf6', bgColor: 'bg-purple-50 dark:bg-purple-950/30', textColor: 'text-purple-700 dark:text-purple-300' },
  cancelled:       { label: 'Cancelled',       labelTh: 'ยกเลิก',      color: '#ef4444', bgColor: 'bg-red-50 dark:bg-red-950/30',       textColor: 'text-red-700 dark:text-red-300' },
}

export const ALL_STATUSES: LeadStatus[] = ['lead', 'booking', 'following_up', 'accepted', 'rejected', 'debt_collection', 'cancelled']

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
  quotation_ref: string | null
  notes: string | null
  assigned_to: string | null
  event_id: string | null
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
}

export default function CrmDashboard({ leads, settings }: CrmDashboardProps) {
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

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

  // Summary stats
  const stats = useMemo(() => {
    const activeStatuses: LeadStatus[] = ['lead', 'booking', 'following_up', 'accepted', 'debt_collection']
    const activeLeads = leads.filter(l => activeStatuses.includes(l.status))
    const acceptedLeads = leads.filter(l => l.status === 'accepted')
    const pendingLeads = leads.filter(l => ['booking', 'following_up', 'debt_collection'].includes(l.status))
    const now = new Date()
    const thisMonth = leads.filter(l => {
      const d = new Date(l.created_at)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })

    return {
      activeEvents: activeLeads.length,
      totalEvents: leads.length,
      pendingCollection: pendingLeads.reduce((sum, l) => sum + (l.quoted_price - l.deposit), 0),
      acceptedRevenue: acceptedLeads.reduce((sum, l) => sum + (l.confirmed_price || l.quoted_price), 0),
      acceptedCount: acceptedLeads.length,
      leadsThisMonth: thisMonth.length,
    }
  }, [leads])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Photobooth CRM
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Manage your events and customers
          </p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Calendar}
          iconColor="text-blue-600"
          iconBg="bg-blue-50 dark:bg-blue-950/30"
          title="Active Events"
          value={String(stats.activeEvents)}
          subtitle={`${stats.totalEvents} total events`}
        />
        <SummaryCard
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50 dark:bg-emerald-950/30"
          title="Pending Collection"
          value={`฿${stats.pendingCollection.toLocaleString()}`}
          subtitle="total quoted − total deposit"
        />
        <SummaryCard
          icon={CheckCircle2}
          iconColor="text-purple-600"
          iconBg="bg-purple-50 dark:bg-purple-950/30"
          title="Accepted Revenue"
          value={`฿${stats.acceptedRevenue.toLocaleString()}`}
          subtitle={`${stats.acceptedCount} accepted events`}
        />
        <SummaryCard
          icon={Users}
          iconColor="text-indigo-600"
          iconBg="bg-indigo-50 dark:bg-indigo-950/30"
          title="Leads This Month"
          value={String(stats.leadsThisMonth)}
          subtitle="new inquiries"
        />
      </div>

      {/* View Toggle + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          <button
            onClick={() => handleViewModeChange('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'kanban'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Kanban
          </button>
          <button
            onClick={() => handleViewModeChange('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'table'
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
            }`}
          >
            <List className="h-4 w-4" />
            Table
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search customer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 w-[200px]"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {ALL_STATUSES.map(s => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_CONFIG[s].color }} />
                    {STATUS_CONFIG[s].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="All Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channel</SelectItem>
              {sources.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label_en}</SelectItem>
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
            paddingLeft: '1rem',
            paddingRight: '1rem',
          }}
        >
          <KanbanBoard leads={filteredLeads} settings={settings} />
        </div>
      ) : (
        <TableView leads={filteredLeads} settings={settings} />
      )}

      {/* Add Lead Dialog */}
      <AddLeadDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        settings={settings}
      />
    </div>
  )
}

// ============================================================================
// Summary Card
// ============================================================================

function SummaryCard({
  icon: Icon, iconColor, iconBg, title, value, subtitle
}: {
  icon: typeof Calendar
  iconColor: string
  iconBg: string
  title: string
  value: string
  subtitle: string
}) {
  return (
    <Card className="border-zinc-200/60 dark:border-zinc-800/60">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${iconBg} shrink-0`}>
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{title}</p>
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">{value}</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{subtitle}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Table View
// ============================================================================

function TableView({ leads, settings }: { leads: CrmLead[]; settings: CrmSetting[] }) {
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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
      const av = (a as Record<string, unknown>)[sortField]
      const bv = (b as Record<string, unknown>)[sortField]
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
    if (['accepted', 'cancelled'].includes(lead.status)) return false
    return new Date(lead.event_date) < new Date()
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-zinc-100 dark:border-zinc-800">
          <tr>
            <SortHeader field="customer_name" label="Customer" />
            <SortHeader field="assigned_to" label="Assignee" />
            <SortHeader field="status" label="Status" />
            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400">Channel</th>
            <SortHeader field="event_date" label="Event Date" />
            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400">Package</th>
            <SortHeader field="quoted_price" label="Quoted" />
            <SortHeader field="deposit" label="Deposit" />
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
                          Returning
                        </Badge>
                      )}
                      {overdue && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-0">
                          <AlertCircle className="h-3 w-3 mr-0.5" />
                          Overdue
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
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {lead.assigned_to || '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={`${statusCfg.bgColor} ${statusCfg.textColor} border-0 text-xs`}>
                    {statusCfg.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {sourceSetting?.label_en || lead.lead_source || '—'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {lead.event_date || '—'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {pkgSetting?.label_en || lead.package_name || '—'}
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
                No leads found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
