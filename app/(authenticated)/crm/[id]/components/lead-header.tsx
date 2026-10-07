'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ExternalLink, AlertCircle, Trash2, Archive, ArchiveRestore, Palette } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { isWonStatus, type CrmLead } from '../../types'

export function LeadHeader({
  lead, displayName, isOverdue, isFullyPaid, loading, linkedEventCount, graphicJobCount, role,
  onOpenEvent, onOpenGraphicJob, onArchive, onDelete,
}: {
  lead: CrmLead
  /** ชื่อที่โชว์ — ระหว่างแก้การ์ดลูกค้าใช้ค่าในฟอร์ม */
  displayName: string
  isOverdue: boolean
  isFullyPaid: boolean
  loading: boolean
  linkedEventCount: number
  graphicJobCount: number
  role: string | null
  onOpenEvent: () => void
  onOpenGraphicJob: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const { locale, t } = useLocale()
  const tc = t.crm.detail
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {displayName}
            </h1>
            {lead.is_returning && (
              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">{t.crm.kanban.returning}</Badge>
            )}
            {isOverdue && (
              isFullyPaid ? (
                <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">
                  <AlertCircle className="h-3 w-3 mr-0.5" /> {locale === 'th' ? 'ชำระครบ' : 'Fully Paid'}
                </Badge>
              ) : (
                <Badge className="text-[10px] bg-red-100 text-red-700 border-0">
                  <AlertCircle className="h-3 w-3 mr-0.5" /> {t.crm.kanban.overdue}
                </Badge>
              )
            )}
            {lead.archived_at && (
              <Badge className="text-[10px] bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-0 gap-1">
                <Archive className="h-3 w-3" /> Archived
              </Badge>
            )}
          </div>
          <p className="text-sm text-zinc-500">
            {tc.created} {new Date(lead.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB')}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {isWonStatus(lead.status) && (
          <Button onClick={onOpenEvent} disabled={loading} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <ExternalLink className="h-4 w-4 mr-1.5" />
            {linkedEventCount > 0
              ? (locale === 'th' ? 'เพิ่มอีเวนต์' : 'Add Event')
              : tc.openEvent}
          </Button>
        )}
        {isWonStatus(lead.status) && (
          <Button onClick={onOpenGraphicJob} disabled={loading} size="sm" className="bg-sky-600 hover:bg-sky-700 text-white">
            <Palette className="h-4 w-4 mr-1.5" />
            {locale === 'th' ? 'ใบงานกราฟิก' : 'Graphic Job'}
            {graphicJobCount > 0 && <span className="ml-1 opacity-80">({graphicJobCount})</span>}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onArchive}
          disabled={loading}
          className={`gap-1.5 ${lead.archived_at
            ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200'
            : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
            }`}
        >
          {lead.archived_at ? (
            <><ArchiveRestore className="h-4 w-4" /> นำออก Archive</>
          ) : (
            <><Archive className="h-4 w-4" /> Archive</>
          )}
        </Button>
        {role === 'admin' && (
          <Button variant="ghost" size="icon" onClick={onDelete} disabled={loading} className="text-red-500 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ลิงก์ไปแท็บใบงานกราฟิกในพูลงาน — โผล่เมื่องานนี้เปิดใบงานแล้วเท่านั้น
export function GraphicJobsLink({ leadId, count }: { leadId: string; count: number }) {
  const { locale } = useLocale()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/jobs/tracking?tab=graphic&lead=${leadId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/70"
      >
        <Palette className="h-3 w-3" />
        {locale === 'th'
          ? `ใบงานกราฟิก ${count} ใบ — ดูในพูลงาน`
          : `${count} graphic job${count > 1 ? 's' : ''} — view in pool`}
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  )
}
