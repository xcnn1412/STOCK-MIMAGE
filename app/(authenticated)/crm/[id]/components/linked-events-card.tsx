'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExternalLink } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { EVENT_PHASES } from '../../event-phases'
import type { LinkedLeadEvent } from '../../actions'

// Linked Events List (1 lead → N events: setup / main / teardown / delivery / etc.)
export function LinkedEventsCard({ linkedEvents, onPhaseChange }: {
  linkedEvents: LinkedLeadEvent[]
  onPhaseChange: (costId: string, phase: string | null) => void
}) {
  const { locale } = useLocale()
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-500">
            {locale === 'th' ? 'อีเวนต์ที่เชื่อมต่อ' : 'Linked Events'}
            <span className="ml-1.5 text-xs text-zinc-400">({linkedEvents.length})</span>
          </span>
        </div>
        <div className="space-y-1.5">
          {linkedEvents.map(ev => {
            const phaseCfg = EVENT_PHASES.find(p => p.value === ev.phase)
            // Prefer linking to the cost-side detail (which shows claims/financials); fall back to operational event edit
            const detailHref = ev.costId
              ? `/costs/events/${ev.costId}`
              : ev.operationalId
                ? `/events/${ev.operationalId}/edit`
                : '#'
            const rowKey = ev.costId || ev.operationalId || `${ev.name}-${ev.date}`
            const importedToCosts = Boolean(ev.costId)
            return (
              <div
                key={rowKey}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 transition-colors"
              >
                <Link href={detailHref} className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{ev.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {ev.date ? new Date(ev.date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB') : '—'}
                    {ev.location && ` • ${ev.location}`}
                  </p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {importedToCosts && ev.costId ? (
                    <Select
                      value={ev.phase || 'none'}
                      onValueChange={(v) => onPhaseChange(ev.costId!, v === 'none' ? null : v)}
                    >
                      <SelectTrigger className="h-7 text-[11px] w-auto min-w-[110px] gap-1 border-dashed">
                        <SelectValue placeholder={locale === 'th' ? 'เลือก phase' : 'Set phase'}>
                          {phaseCfg ? (
                            <span className="inline-flex items-center gap-1">
                              <span>{phaseCfg.icon}</span>
                              <span>{locale === 'th' ? phaseCfg.labelTh : phaseCfg.labelEn}</span>
                            </span>
                          ) : (
                            <span className="text-zinc-400">{locale === 'th' ? 'เลือก phase' : 'Set phase'}</span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{locale === 'th' ? '— ไม่ระบุ —' : '— None —'}</SelectItem>
                        {EVENT_PHASES.map(p => (
                          <SelectItem key={p.value} value={p.value}>
                            <span className="inline-flex items-center gap-1.5">
                              <span>{p.icon}</span>
                              <span>{locale === 'th' ? p.labelTh : p.labelEn}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-800">
                      {locale === 'th' ? 'ยังไม่นำเข้า Costs' : 'Not imported'}
                    </Badge>
                  )}
                  {ev.status && (
                    <Badge variant="outline" className="text-[10px]">{ev.status}</Badge>
                  )}
                  <Link href={detailHref}>
                    <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
