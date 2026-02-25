'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle, User, Calendar, MessageSquare,
  GripVertical, MapPin, DollarSign, RefreshCw
} from 'lucide-react'
import { updateLeadStatus } from '../actions'
import {
  ALL_STATUSES, STATUS_CONFIG,
  type CrmLead, type CrmSetting, type LeadStatus
} from '../crm-dashboard'

// ============================================================================
// Kanban Board — Fills available viewport
// ============================================================================

interface KanbanBoardProps {
  leads: CrmLead[]
  settings: CrmSetting[]
}

export function KanbanBoard({ leads, settings }: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('text/plain', leadId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(leadId)
  }

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStatus(status)
  }

  const handleDragLeave = () => {
    setDragOverStatus(null)
  }

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    const leadId = e.dataTransfer.getData('text/plain')
    setDraggingId(null)
    setDragOverStatus(null)

    if (!leadId) return
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus) return

    await updateLeadStatus(leadId, newStatus)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverStatus(null)
  }

  // Calculate total value per column
  const getColumnValue = (statusLeads: CrmLead[]) => {
    return statusLeads.reduce((sum, l) => sum + (l.confirmed_price || l.quoted_price || 0), 0)
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-4 px-1 justify-center"
      style={{
        scrollbarWidth: 'thin',
        minHeight: 'calc(100vh - 340px)',
      }}
    >
      {ALL_STATUSES.map(status => {
        const config = STATUS_CONFIG[status]
        const statusLeads = leads.filter(l => l.status === status)
        const isDragOver = dragOverStatus === status
        const colValue = getColumnValue(statusLeads)

        return (
          <div
            key={status}
            className={`shrink-0 flex flex-col rounded-xl transition-all duration-300 ${
              isDragOver
                ? 'ring-2 ring-blue-400/60 dark:ring-blue-500/40 bg-blue-50/40 dark:bg-blue-950/20 scale-[1.01]'
                : 'bg-zinc-100/60 dark:bg-zinc-900/40'
            }`}
            style={{ width: 'calc((100vw - 4rem - 6 * 0.75rem) / 7)', minWidth: '240px', maxWidth: '320px' }}
            onDragOver={e => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, status)}
          >
            {/* Column Header */}
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full shadow-sm"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 tracking-tight uppercase">
                    {config.label}
                  </span>
                  <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-zinc-200/80 dark:bg-zinc-700/80 text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
                    {statusLeads.length}
                  </span>
                </div>
              </div>
              {/* Column value indicator */}
              {colValue > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 pl-5">
                  <DollarSign className="h-2.5 w-2.5" />
                  ฿{colValue.toLocaleString()}
                </div>
              )}
            </div>

            {/* Color accent bar */}
            <div className="mx-3 h-[2px] rounded-full mb-2 opacity-40" style={{ backgroundColor: config.color }} />

            {/* Cards */}
            <div className="flex flex-col gap-2 px-2 pb-3 min-h-[120px] flex-1">
              {statusLeads.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[100px] text-zinc-300 dark:text-zinc-700 border-2 border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl">
                  <div className="text-[11px] font-medium">Drop here</div>
                </div>
              )}
              {statusLeads.map(lead => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
                  settings={settings}
                  statusColor={config.color}
                  isDragging={draggingId === lead.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
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
  statusColor,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  lead: CrmLead
  settings: CrmSetting[]
  statusColor: string
  isDragging: boolean
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
}) {
  const isOverdue =
    lead.event_date &&
    !['accepted', 'cancelled'].includes(lead.status) &&
    new Date(lead.event_date) < new Date()

  const pkgSetting = settings.find(s => s.category === 'package' && s.value === lead.package_name)
  const sourceSetting = settings.find(s => s.category === 'lead_source' && s.value === lead.lead_source)

  // Generate avatar initials and consistent color
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

  return (
    <Link href={`/crm/${lead.id}`} className="group">
      <div
        draggable
        onDragStart={e => onDragStart(e, lead.id)}
        onDragEnd={onDragEnd}
        className={`
          relative bg-white dark:bg-zinc-800/90 rounded-xl p-3
          border border-zinc-200/60 dark:border-zinc-700/50
          cursor-grab active:cursor-grabbing
          transition-all duration-200 ease-out
          hover:shadow-lg hover:shadow-zinc-200/50 dark:hover:shadow-zinc-900/50
          hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-zinc-600
          group-hover:border-zinc-300 dark:group-hover:border-zinc-600
          ${isDragging ? 'opacity-40 rotate-3 scale-90 shadow-2xl' : ''}
        `}
      >
        {/* Left color accent */}
        <div
          className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full"
          style={{ backgroundColor: statusColor }}
        />

        {/* Customer header */}
        <div className="flex items-center gap-2.5 mb-2.5 pl-2">
          {/* Avatar */}
          <div className={`shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-linear-to-br ${avatarGradient} text-white text-[10px] font-bold shadow-sm`}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 leading-tight truncate">
              {lead.customer_name}
            </div>
            {lead.customer_line && (
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                LINE: {lead.customer_line}
              </div>
            )}
          </div>
          {/* Drag handle */}
          <GripVertical className="h-4 w-4 text-zinc-300 dark:text-zinc-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1 pl-2 mb-2">
          {isOverdue && (
            <Badge className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 border-0 gap-0.5">
              <AlertCircle className="h-2.5 w-2.5" />
              Overdue
            </Badge>
          )}
          {lead.is_returning && (
            <Badge className="text-[9px] px-1.5 py-0 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 gap-0.5">
              <RefreshCw className="h-2.5 w-2.5" />
              Returning
            </Badge>
          )}
          {sourceSetting && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-0.5">
              <MessageSquare className="h-2.5 w-2.5" />
              {sourceSetting.label_en}
            </Badge>
          )}
        </div>

        {/* Info rows */}
        <div className="space-y-1.5 pl-2">
          {lead.event_date && (
            <div className="flex items-center gap-1.5 text-[11px]">
              <Calendar className="h-3 w-3 text-zinc-400 shrink-0" />
              <span className={`${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-zinc-500 dark:text-zinc-400'}`}>
                {lead.event_date}
              </span>
            </div>
          )}
          {lead.event_location && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <MapPin className="h-3 w-3 text-zinc-400 shrink-0" />
              <span className="truncate">{lead.event_location}</span>
            </div>
          )}
          {lead.assigned_to && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <User className="h-3 w-3 text-zinc-400 shrink-0" />
              {lead.assigned_to}
            </div>
          )}
        </div>

        {/* Bottom: Package + Price */}
        {(lead.package_name || price > 0) && (
          <div className="flex items-center justify-between mt-3 pt-2.5 pl-2 border-t border-zinc-100 dark:border-zinc-700/50">
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate max-w-[100px]">
              {pkgSetting?.label_en || lead.package_name || '—'}
            </span>
            {price > 0 && (
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 shrink-0 tabular-nums">
                ฿{price.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Deposit progress bar */}
        {price > 0 && lead.deposit > 0 && (
          <div className="mt-2 pl-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">Deposit</span>
              <span className="text-[9px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                ฿{lead.deposit.toLocaleString()} / ฿{price.toLocaleString()}
              </span>
            </div>
            <div className="h-1 bg-zinc-100 dark:bg-zinc-700/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, (lead.deposit / price) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}
