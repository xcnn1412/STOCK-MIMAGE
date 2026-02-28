'use client'

import { useState, useCallback, useTransition, useOptimistic, memo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle, User, Calendar, MessageSquare,
  GripVertical, MapPin, RefreshCw, ChevronDown, ChevronRight
} from 'lucide-react'
import { updateLeadStatus } from '../actions'
import {
  ALL_STATUSES, STATUS_CONFIG, getStatusesFromSettings, getStatusConfig,
  type CrmLead, type CrmSetting, type LeadStatus
} from '../crm-dashboard'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Kanban Board — Fills available viewport
// ============================================================================

interface SystemUser {
  id: string
  full_name: string | null
  department: string | null
}

interface KanbanBoardProps {
  leads: CrmLead[]
  settings: CrmSetting[]
  users: SystemUser[]
}

export function KanbanBoard({ leads, settings, users }: KanbanBoardProps) {
  const { locale, t } = useLocale()
  const tc = t.crm
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Optimistic: instantly move card to new column before server responds
  const [optimisticLeads, setOptimisticLeads] = useOptimistic(
    leads,
    (currentLeads: CrmLead[], { leadId, newStatus }: { leadId: string; newStatus: string }) =>
      currentLeads.map(l => l.id === leadId ? { ...l, status: newStatus as LeadStatus } : l)
  )

  const getStatusLabel = (status: LeadStatus) => {
    const cfg = getStatusConfig(settings, status)
    return tc.statuses[status] || cfg.labelTh || cfg.label
  }

  const handleDragStart = useCallback((e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(leadId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStatus(status)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('text/plain')
    setDraggingId(null)
    setDragOverStatus(null)

    if (!leadId) return
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus) return

    // Optimistic update — card moves instantly
    startTransition(async () => {
      setOptimisticLeads({ leadId, newStatus })
      await updateLeadStatus(leadId, newStatus)
    })
  }, [leads, startTransition, setOptimisticLeads])

  const handleDragEnd = useCallback(() => {
    setDraggingId(null)
    setDragOverStatus(null)
  }, [])

  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())

  const toggleColumn = useCallback((status: string) => {
    setCollapsedCols(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }, [])

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-4 px-1"
      style={{
        scrollbarWidth: 'thin',
        minHeight: 'calc(100vh - 280px)',
      }}
    >
      {getStatusesFromSettings(settings).map(status => {
        const config = getStatusConfig(settings, status)
        const statusLeads = optimisticLeads.filter(l => l.status === status)
        const isDragOver = dragOverStatus === status
        const isCollapsed = collapsedCols.has(status)

        return (
          <div
            key={status}
            className={`flex flex-col rounded-xl transition-all duration-300 ${isCollapsed ? 'min-w-[48px] max-w-[48px]' : 'flex-1 min-w-[220px]'} ${isDragOver
              ? 'ring-2 ring-blue-400/60 dark:ring-blue-500/40 bg-blue-50/40 dark:bg-blue-950/20 scale-[1.01]'
              : 'bg-zinc-100/60 dark:bg-zinc-900/40'
              }`}
            onDragOver={e => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, status)}
          >
            {/* Column Header */}
            <div
              className="px-3 pt-3 pb-2 cursor-pointer select-none"
              onClick={() => toggleColumn(status)}
            >
              {isCollapsed ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shadow-sm"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 [writing-mode:vertical-lr] tracking-wider uppercase">
                    {getStatusLabel(status)}
                  </span>
                  <span className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-zinc-200/80 dark:bg-zinc-700/80 text-[12px] font-bold text-zinc-600 dark:text-zinc-300">
                    {statusLeads.length}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <div
                    className="h-3 w-3 rounded-full shadow-sm"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-base font-bold text-zinc-800 dark:text-zinc-200 tracking-tight uppercase">
                    {getStatusLabel(status)}
                  </span>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <>
                {/* Color accent bar */}
                <div className="mx-3 h-[2px] rounded-full mb-2 opacity-40" style={{ backgroundColor: config.color }} />

                {/* Cards */}
                <div className="flex flex-col gap-2 px-2 pb-3 min-h-[120px] flex-1">
                  {statusLeads.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-[100px] text-zinc-300 dark:text-zinc-700 border-2 border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl">
                      <div className="text-[13px] font-medium">{tc.kanban.dropHere}</div>
                    </div>
                  )}
                  {statusLeads.map(lead => (
                    <MemoKanbanCard
                      key={lead.id}
                      lead={lead}
                      settings={settings}
                      users={users}
                      statusColor={config.color}
                      isDragging={draggingId === lead.id}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Kanban Card — Premium Design
// ============================================================================

function KanbanCard({
  lead,
  settings,
  users,
  statusColor,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  lead: CrmLead
  settings: CrmSetting[]
  users: SystemUser[]
  statusColor: string
  isDragging: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
}) {
  const { locale, t } = useLocale()
  const tc = t.crm

  const getSettingLabel = (setting: CrmSetting) => {
    return locale === 'th' ? setting.label_th : setting.label_en
  }

  const isOverdue =
    lead.event_date &&
    !['accepted', 'rejected'].includes(lead.status) &&
    new Date(lead.event_date) < new Date()

  const pkgSetting = settings.find(s => s.category === 'package' && s.value === lead.package_name)
  const sourceSetting = settings.find(s => s.category === 'lead_source' && s.value === lead.lead_source)

  const initials = lead.customer_name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const avatarColors = [
    'from-blue-400 to-blue-600',
    'from-emerald-400 to-emerald-600',
    'from-violet-400 to-violet-600',
    'from-amber-400 to-amber-600',
    'from-rose-400 to-rose-600',
    'from-cyan-400 to-cyan-600',
    'from-indigo-400 to-indigo-600',
    'from-pink-400 to-pink-600',
  ]
  const colorIndex = lead.customer_name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatarColors.length
  const avatarGradient = avatarColors[colorIndex]

  const price = lead.confirmed_price || lead.quoted_price || 0

  // Collect all tags for display
  const generalTags = (lead.tags || [])
    .map(tag => {
      const s = settings.find(st => st.category === 'tag' && st.value === tag)
      return s ? { label: getSettingLabel(s), color: s.color || '#3b82f6' } : null
    })
    .filter(Boolean) as { label: string; color: string }[]

  const statusTags = (lead.tags || [])
    .map(tag => {
      const s = settings.find(st => st.category === `tag_${lead.status}` && st.value === tag)
      return s ? { label: getSettingLabel(s), color: s.color || '#8b5cf6' } : null
    })
    .filter(Boolean) as { label: string; color: string }[]

  const allTags = [...generalTags, ...statusTags]

  // Compute overdue installments
  const today = new Date()
  const overduePayments: number[] = []
  for (let n = 1; n <= 4; n++) {
    const amount = (lead as any)[`installment_${n}`]
    const date = (lead as any)[`installment_${n}_date`]
    const paid = (lead as any)[`installment_${n}_paid`]
    if (amount && amount > 0 && date && !paid && new Date(date) < today) {
      overduePayments.push(n)
    }
  }
  // Upcoming (within 3 days)
  const upcomingPayments: number[] = []
  for (let n = 1; n <= 4; n++) {
    const amount = (lead as any)[`installment_${n}`]
    const date = (lead as any)[`installment_${n}_date`]
    const paid = (lead as any)[`installment_${n}_paid`]
    if (amount && amount > 0 && date && !paid) {
      const dueDate = new Date(date)
      const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays >= 0 && diffDays <= 3 && !overduePayments.includes(n)) {
        upcomingPayments.push(n)
      }
    }
  }

  const [expanded, setExpanded] = useState(false)

  const toggleExpand = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setExpanded(prev => !prev)
  }

  return (
    <Link href={`/crm/${lead.id}`} className="group">
      <div
        draggable
        onDragStart={e => onDragStart(e, lead.id)}
        onDragEnd={onDragEnd}
        className={`
          relative bg-white dark:bg-zinc-800/90 rounded-xl overflow-hidden
          border border-zinc-200/70 dark:border-zinc-700/50
          cursor-grab active:cursor-grabbing
          transition-all duration-200 ease-out
          hover:shadow-lg hover:shadow-zinc-200/50 dark:hover:shadow-zinc-900/50
          hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-zinc-600
          ${isDragging ? 'opacity-40 rotate-2 scale-95 shadow-2xl' : ''}
        `}
      >
        {/* Top color accent bar */}
        <div
          className="h-1.5 w-full"
          style={{ background: `linear-gradient(90deg, ${statusColor}, ${statusColor}90)` }}
        />

        <div className="p-3.5 space-y-3">
          {/* Header: Avatar + Name + Expand toggle */}
          <div className="flex items-start gap-3">
            <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-xl bg-linear-to-br ${avatarGradient} text-white text-[15px] font-bold shadow-sm ring-2 ring-white/80 dark:ring-zinc-700/80`}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-base text-zinc-900 dark:text-zinc-100 leading-snug truncate">
                {lead.customer_name}
              </div>
              {/* Compact summary when collapsed */}
              <div className="flex items-center gap-2 mt-0.5">
                {price > 0 && (
                  <span className="text-[13px] font-bold text-zinc-600 dark:text-zinc-300 tabular-nums">
                    ฿{price.toLocaleString()}
                  </span>
                )}
                {lead.event_date && (
                  <span className={`text-[12px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-zinc-400'}`}>
                    {lead.event_date}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={toggleExpand}
              className="shrink-0 mt-1 p-0.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
            >
              {expanded
                ? <ChevronDown className="h-4 w-4 text-zinc-400" />
                : <ChevronRight className="h-4 w-4 text-zinc-400" />
              }
            </button>
          </div>

          {/* Expanded detail section */}
          {expanded && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">

              {/* Alert badges */}
              {(isOverdue || lead.is_returning || sourceSetting || overduePayments.length > 0 || upcomingPayments.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {overduePayments.length > 0 && (
                    <Badge className="text-[12px] px-2 py-0.5 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 gap-1 font-semibold animate-pulse">
                      <AlertCircle className="h-3 w-3" />
                      เลยกำหนดงวด {overduePayments.join(', ')}
                    </Badge>
                  )}
                  {upcomingPayments.length > 0 && (
                    <Badge className="text-[12px] px-2 py-0.5 bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 border border-orange-200/60 dark:border-orange-800/40 gap-1 font-semibold">
                      <Calendar className="h-3 w-3" />
                      ใกล้กำหนดงวด {upcomingPayments.join(', ')}
                    </Badge>
                  )}
                  {isOverdue && (
                    <Badge className="text-[12px] px-2 py-0.5 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 gap-1 font-semibold">
                      <AlertCircle className="h-3 w-3" />
                      {tc.kanban.overdue}
                    </Badge>
                  )}
                  {lead.is_returning && (
                    <Badge className="text-[12px] px-2 py-0.5 bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 gap-1 font-semibold">
                      <RefreshCw className="h-3 w-3" />
                      {tc.kanban.returning}
                    </Badge>
                  )}
                  {sourceSetting && (
                    <Badge className="text-[12px] px-2 py-0.5 bg-zinc-50 text-zinc-500 dark:bg-zinc-700/40 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/40 gap-1 font-semibold">
                      <MessageSquare className="h-3 w-3" />
                      {getSettingLabel(sourceSetting)}
                    </Badge>
                  )}
                </div>
              )}

              {/* Tags — bigger, bolder, more vibrant */}
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 text-[13px] font-bold px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: `${tag.color}18`,
                        color: tag.color,
                        boxShadow: `inset 0 0 0 1.5px ${tag.color}30`,
                      }}
                    >
                      <span className="h-2 w-2 rounded-full shadow-sm" style={{ backgroundColor: tag.color }} />
                      {tag.label}
                    </span>
                  ))}
                </div>
              )}

              {/* Info rows */}
              {(lead.event_date || lead.event_location) && (
                <div className="space-y-1.5 bg-zinc-50/80 dark:bg-zinc-900/40 rounded-lg px-3 py-2.5">
                  {lead.event_date && (
                    <div className="flex items-center gap-2 text-[15px]">
                      <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: isOverdue ? '#ef4444' : '#a1a1aa' }} />
                      <span className={`${isOverdue ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}>
                        {lead.event_date}
                      </span>
                    </div>
                  )}
                  {lead.event_location && (
                    <div className="flex items-center gap-2 text-[15px] text-zinc-500 dark:text-zinc-400">
                      <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{lead.event_location}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Staff Assignments */}
              {((lead.assigned_sales?.length > 0) || (lead.assigned_graphics?.length > 0) || (lead.assigned_staff?.length > 0)) && (
                <div className="space-y-1.5">
                  {lead.assigned_sales?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200 shrink-0 w-12">Sale</span>
                      {lead.assigned_sales.map(id => {
                        const u = users.find(x => x.id === id)
                        return (
                          <span key={id} className="text-[12px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                            {u?.full_name || id.slice(0, 6)}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {lead.assigned_graphics?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200 shrink-0 w-12">Graphic</span>
                      {lead.assigned_graphics.map(id => {
                        const u = users.find(x => x.id === id)
                        return (
                          <span key={id} className="text-[12px] font-medium px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                            {u?.full_name || id.slice(0, 6)}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {lead.assigned_staff?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200 shrink-0 w-12">Staff</span>
                      {lead.assigned_staff.map(id => {
                        const u = users.find(x => x.id === id)
                        return (
                          <span key={id} className="text-[12px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                            {u?.full_name || id.slice(0, 6)}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom: Package + Price */}
              {(lead.package_name || price > 0) && (
                <div className="flex items-center justify-between pt-2.5 border-t border-zinc-100 dark:border-zinc-700/40">
                  <span className="text-[13px] text-zinc-400 dark:text-zinc-500 truncate max-w-[120px] font-medium">
                    {pkgSetting ? getSettingLabel(pkgSetting) : (lead.package_name || '—')}
                  </span>
                  {price > 0 && (
                    <span className="text-base font-bold text-zinc-800 dark:text-zinc-100 tabular-nums tracking-tight">
                      ฿{price.toLocaleString()}
                    </span>
                  )}
                </div>
              )}

              {/* Deposit bar */}
              {price > 0 && lead.deposit > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-zinc-400 dark:text-zinc-500 font-medium">{tc.kanban.deposit}</span>
                    <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                      ฿{lead.deposit.toLocaleString()} / ฿{price.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (lead.deposit / price) * 100)}%`,
                        background: `linear-gradient(90deg, #3b82f6, #60a5fa)`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div >
    </Link >
  )
}

// Memoize to prevent re-rendering all cards on drag state changes
const MemoKanbanCard = memo(KanbanCard, (prev, next) => {
  return (
    prev.lead === next.lead &&
    prev.isDragging === next.isDragging &&
    prev.statusColor === next.statusColor &&
    prev.settings === next.settings &&
    prev.users === next.users
  )
})
