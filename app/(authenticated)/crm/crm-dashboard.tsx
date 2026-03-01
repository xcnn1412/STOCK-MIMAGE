'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, Search, Filter, LayoutGrid, List, ChevronDown, AlertCircle, Tag, Calendar, MessageSquare
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { getActiveStaff } from '@/database/staff-members'
import { AddLeadDialog } from './components/add-lead-dialog'
import { KanbanBoard } from './components/kanban-board'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Types & Constants
// ============================================================================

export type LeadStatus = string

// Fallback config for unknown statuses
const FALLBACK_STATUS = { label: 'Unknown', labelTh: 'ไม่ทราบ', color: '#9ca3af', bgColor: 'bg-zinc-100 dark:bg-zinc-800', textColor: 'text-zinc-600 dark:text-zinc-400' }

// Get ordered status list from settings
export function getStatusesFromSettings(settings: CrmSetting[]): string[] {
  return settings
    .filter(s => s.category === 'kanban_status' && s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => s.value)
}

// Get status config from settings (color, labels, etc.)
export function getStatusConfig(settings: CrmSetting[], status: string): { label: string; labelTh: string; color: string; bgColor: string; textColor: string } {
  const s = settings.find(st => st.category === 'kanban_status' && st.value === status)
  if (!s) return FALLBACK_STATUS
  return {
    label: s.label_en,
    labelTh: s.label_th,
    color: s.color || '#9ca3af',
    bgColor: `bg-zinc-100 dark:bg-zinc-800`,
    textColor: `text-zinc-600 dark:text-zinc-400`,
  }
}

// Legacy compat — still exported for consumers that haven't migrated
export const ALL_STATUSES: LeadStatus[] = ['lead', 'quotation_sent', 'accepted', 'rejected']
export const STATUS_CONFIG: Record<string, { label: string; labelTh: string; color: string; bgColor: string; textColor: string }> = {
  lead: { label: 'Lead', labelTh: 'ลูกค้าใหม่', color: '#3b82f6', bgColor: 'bg-blue-50 dark:bg-blue-950/30', textColor: 'text-blue-700 dark:text-blue-300' },
  quotation_sent: { label: 'Quotation Sent', labelTh: 'ส่งใบเสนอราคา', color: '#f59e0b', bgColor: 'bg-amber-50 dark:bg-amber-950/30', textColor: 'text-amber-700 dark:text-amber-300' },
  accepted: { label: 'Accepted', labelTh: 'ตอบรับ', color: '#10b981', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30', textColor: 'text-emerald-700 dark:text-emerald-300' },
  rejected: { label: 'Rejected', labelTh: 'ปฏิเสธ', color: '#6b7280', bgColor: 'bg-zinc-100 dark:bg-zinc-800', textColor: 'text-zinc-600 dark:text-zinc-400' },
}

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
  vat_mode: string // 'none' | 'included' | 'excluded'
  wht_rate: number // 0 | 1 | 2 | 3 | 5
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
  const [saleFilter, setSaleFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Helper: get setting label by locale
  const getSettingLabel = useCallback((setting: CrmSetting) => {
    return locale === 'th' ? setting.label_th : setting.label_en
  }, [locale])

  // Dynamic statuses from settings
  const kanbanStatuses = useMemo(() => getStatusesFromSettings(settings), [settings])

  // Helper: get status label by locale
  const getStatusLabel = useCallback((status: LeadStatus) => {
    const cfg = getStatusConfig(settings, status)
    return tc.statuses[status] || cfg.labelTh || cfg.label
  }, [tc, settings])

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

  // Sales users — users who are assigned to at least one lead
  const salesUsers = useMemo(() => {
    const salesIds = new Set(leads.flatMap(l => l.assigned_sales || []))
    return users.filter(u => salesIds.has(u.id))
  }, [leads, users])

  // Available tags — depends on status filter
  const availableTags = useMemo(() => {
    const generalTags = settings.filter(s => s.category === 'tag' && s.is_active)
    if (statusFilter !== 'all') {
      const statusTags = settings.filter(s => s.category === `tag_${statusFilter}` && s.is_active)
      return [
        ...generalTags.map(s => ({ ...s, group: 'general' as const })),
        ...statusTags.map(s => ({ ...s, group: 'status' as const })),
      ]
    }
    return generalTags.map(s => ({ ...s, group: 'general' as const }))
  }, [settings, statusFilter])

  const toggleTag = useCallback((tagValue: string) => {
    setTagFilter(prev =>
      prev.includes(tagValue)
        ? prev.filter(t => t !== tagValue)
        : [...prev, tagValue]
    )
  }, [])

  // Filter leads
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false
      if (sourceFilter !== 'all' && lead.lead_source !== sourceFilter) return false
      if (saleFilter !== 'all' && !(lead.assigned_sales || []).includes(saleFilter)) return false
      if (tagFilter.length > 0) {
        const leadTags = lead.tags || []
        if (!tagFilter.every(t => leadTags.includes(t))) return false
      }
      if (search) {
        const q = search.toLowerCase()
        if (!lead.customer_name.toLowerCase().includes(q) &&
          !(lead.customer_line?.toLowerCase().includes(q)))
          return false
      }
      return true
    })
  }, [leads, statusFilter, sourceFilter, saleFilter, tagFilter, search])

  // Summary stats — per-status breakdown
  const stats = useMemo(() => {
    const statusCounts = kanbanStatuses.reduce((acc, s) => {
      const filtered = leads.filter(l => l.status === s)
      acc[s] = {
        count: filtered.length,
        value: filtered.reduce((sum, l) => sum + (l.confirmed_price || l.quoted_price || 0), 0),
      }
      return acc
    }, {} as Record<string, { count: number; value: number }>)

    return { statusCounts, total: leads.length }
  }, [leads, kanbanStatuses])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {tc.dashboard.title}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {tc.dashboard.subtitle}
          </p>
        </div>
        <Button
          onClick={() => setAddDialogOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm hidden sm:inline-flex"
        >
          <Plus className="h-4 w-4 mr-2" />
          {tc.dashboard.addEvent}
        </Button>
      </div>

      {/* Summary Cards — per-status */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {kanbanStatuses.map((status) => {
          const cfg = getStatusConfig(settings, status)
          const data = stats.statusCounts[status] || { count: 0, value: 0 }
          return (
            <div key={status} className="flex-shrink-0 w-[140px] sm:w-auto sm:flex-1 sm:min-w-0 relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 sm:p-5 snap-start">
              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(to bottom, ${cfg.color}, ${cfg.color}dd)` }} />
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{getStatusLabel(status)}</span>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                {data.count}
              </div>
              <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 mt-1.5 tabular-nums tracking-tight">
                <span className="text-zinc-400 dark:text-zinc-500 font-normal">฿</span>{data.value.toLocaleString()}
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
            <span className="hidden sm:inline">{tc.viewModes.kanban}</span>
          </button>
          <button
            onClick={() => handleViewModeChange('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table'
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">{tc.viewModes.table}</span>
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
              className="pl-9 h-9 w-full sm:w-[200px]"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[130px] sm:w-[150px]">
              <SelectValue placeholder={tc.filters.allStatus} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc.filters.allStatus}</SelectItem>
              {kanbanStatuses.map(s => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getStatusConfig(settings, s).color }} />
                    {getStatusLabel(s)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-9 w-[130px] sm:w-[150px]">
              <SelectValue placeholder={tc.filters.allChannel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc.filters.allChannel}</SelectItem>
              {sources.map(s => (
                <SelectItem key={s.value} value={s.value}>{getSettingLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={saleFilter} onValueChange={setSaleFilter}>
            <SelectTrigger className="h-9 w-[130px] sm:w-[150px]">
              <SelectValue placeholder={tc.filters.allSale} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc.filters.allSale}</SelectItem>
              {salesUsers.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tag Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-9 gap-1.5 text-sm font-normal ${tagFilter.length > 0
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                  : ''
                  }`}
              >
                <Tag className="h-3.5 w-3.5" />
                {tagFilter.length > 0
                  ? `${locale === 'th' ? 'แท็ก' : 'Tags'} (${tagFilter.length})`
                  : (locale === 'th' ? 'แท็ก' : 'Tags')
                }
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              {tagFilter.length > 0 && (
                <>
                  <DropdownMenuLabel
                    className="text-xs text-blue-600 cursor-pointer hover:text-blue-800"
                    onClick={() => setTagFilter([])}
                  >
                    {locale === 'th' ? '✕ ล้างตัวกรองแท็ก' : '✕ Clear tag filters'}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              {availableTags.length === 0 ? (
                <DropdownMenuLabel className="text-xs text-zinc-400">
                  {locale === 'th' ? 'ไม่มีแท็ก' : 'No tags available'}
                </DropdownMenuLabel>
              ) : (
                <>
                  {/* General tags */}
                  {availableTags.filter(t => t.group === 'general').length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-zinc-400">
                        {locale === 'th' ? 'แท็กทั่วไป' : 'General Tags'}
                      </DropdownMenuLabel>
                      {availableTags.filter(t => t.group === 'general').map(tag => (
                        <DropdownMenuCheckboxItem
                          key={tag.value}
                          checked={tagFilter.includes(tag.value)}
                          onCheckedChange={() => toggleTag(tag.value)}
                          onSelect={e => e.preventDefault()}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color || '#3b82f6' }}
                            />
                            {getSettingLabel(tag)}
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </>
                  )}
                  {/* Status-specific tags */}
                  {availableTags.filter(t => t.group === 'status').length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-zinc-400">
                        {locale === 'th'
                          ? `แท็ก: ${getStatusLabel(statusFilter)}`
                          : `Tags: ${getStatusLabel(statusFilter)}`
                        }
                      </DropdownMenuLabel>
                      {availableTags.filter(t => t.group === 'status').map(tag => (
                        <DropdownMenuCheckboxItem
                          key={tag.value}
                          checked={tagFilter.includes(tag.value)}
                          onCheckedChange={() => toggleTag(tag.value)}
                          onSelect={e => e.preventDefault()}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color || '#8b5cf6' }}
                            />
                            {getSettingLabel(tag)}
                          </span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content Area */}
      {viewMode === 'kanban' ? (
        <div
          className="relative -mx-4 md:-mx-6 px-2"
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

      {/* Mobile FAB */}
      <button
        onClick={() => setAddDialogOpen(true)}
        className="sm:hidden fixed bottom-6 right-6 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl hover:shadow-2xl transition-all duration-200 active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>
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
    const cfg = getStatusConfig(settings, status)
    return tc.statuses[status] || cfg.labelTh || cfg.label
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
    <div>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-2">
        {sortedLeads.map(lead => {
          const statusCfg = getStatusConfig(settings, lead.status)
          const sourceSetting = settings.find(s => s.category === 'lead_source' && s.value === lead.lead_source)
          const pkgSetting = settings.find(s => s.category === 'package' && s.value === lead.package_name)
          const overdue = isOverdue(lead)
          const price = lead.confirmed_price || lead.quoted_price || 0

          return (
            <Link key={lead.id} href={`/crm/${lead.id}`} className="block">
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 p-3.5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                      {lead.customer_name}
                    </div>
                    {lead.event_details && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">{lead.event_details}</p>
                    )}
                  </div>
                  <Badge className={`${statusCfg.bgColor} ${statusCfg.textColor} border-0 text-[11px] shrink-0`}>
                    {getStatusLabel(lead.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
                  {lead.event_date && (
                    <span className={`flex items-center gap-1 ${overdue ? 'text-red-500 font-semibold' : ''}`}>
                      <Calendar className="h-3 w-3" /> {lead.event_date}
                    </span>
                  )}
                  {sourceSetting && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {getSettingLabel(sourceSetting)}
                    </span>
                  )}
                  {price > 0 && (
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300 ml-auto">
                      ฿{price.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
        {sortedLeads.length === 0 && (
          <div className="text-center py-12 text-sm text-zinc-400 dark:text-zinc-500">
            {tc.dashboard.noLeads}
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-x-auto">
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
              const statusCfg = getStatusConfig(settings, lead.status)
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
    </div>
  )
}
