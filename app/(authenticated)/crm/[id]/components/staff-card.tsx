'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, Users } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { EVENT_PHASES } from '../../event-phases'
import type { LeadEventStaff } from '../../actions'
import type { CrmSetting } from '../../types'

// Staff Assignments Card — read-only, grouped per event.
// Staff lives in event_staff (keyed by event_id); each linked event manages its
// own team. Editing happens in each event's edit page, not here.
export function StaffCard({ eventStaffGroups, staffRoles }: { eventStaffGroups: LeadEventStaff[]; staffRoles: CrmSetting[] }) {
  const { locale } = useLocale()
  // Get role label from settings
  // หน้าที่ที่ไม่อยู่ในตั้งค่า (ถูกลบ/ปิดใช้) ไม่โชว์รหัสดิบ
  const getRoleLabel = (roleValue: string) => {
    const setting = staffRoles.find(s => s.value === roleValue)
    if (!setting) return locale === 'th' ? 'ไม่ระบุหน้าที่' : 'No role'
    return locale === 'th' ? setting.label_th : setting.label_en
  }
  const getRoleColor = (roleValue: string) => {
    return staffRoles.find(s => s.value === roleValue)?.color || '#6b7280'
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-amber-50 dark:bg-amber-950/40">
            <Users className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          {locale === 'th' ? 'ทีมงาน & หน้าที่' : 'Staff & Roles'}
          <span className="ml-auto text-[10px] font-normal text-zinc-400">
            {locale === 'th' ? 'จัดการแยกแต่ละอีเวนต์' : 'managed per event'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {eventStaffGroups.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">
            {locale === 'th'
              ? 'ยังไม่มีอีเวนต์ — สร้างอีเวนต์เพื่อกำหนดทีมงาน'
              : 'No events yet — create an event to assign staff'}
          </p>
        ) : (
          eventStaffGroups.map(group => {
            const phaseCfg = EVENT_PHASES.find(p => p.value === group.phase)
            return (
              <div key={group.eventId} className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                {/* Event header */}
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="min-w-0 flex items-center gap-2">
                    {phaseCfg && <span className="text-sm shrink-0">{phaseCfg.icon}</span>}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{group.eventName}</p>
                      {group.eventDate && (
                        <p className="text-[11px] text-zinc-400">
                          {new Date(group.eventDate).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB')}
                        </p>
                      )}
                    </div>
                  </div>
                  <Link href={`/events/${group.eventId}/edit`} className="shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                      <Pencil className="h-3 w-3 mr-1" />
                      {locale === 'th' ? 'แก้ไขใน event' : 'Edit in event'}
                    </Button>
                  </Link>
                </div>
  
                {/* Staff list for this event */}
                {group.staff.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-3">
                    {locale === 'th' ? 'ยังไม่มีทีมงานสำหรับอีเวนต์นี้' : 'No staff for this event'}
                  </p>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                    {group.staff.map((s, i) => (
                      <div key={`${s.user_id}-${s.role}-${i}`} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-zinc-200 dark:bg-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
                          {(s.full_name || '?').charAt(0).toUpperCase()}
                        </div>
                        <span className={`text-sm truncate flex-1 min-w-0 ${s.full_name ? 'font-medium text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`}>
                          {/* ผู้ใช้ที่ไม่มี profile แล้ว (ถูกลบ) ไม่โชว์รหัสยาวๆ */}
                          {s.full_name || (locale === 'th' ? 'ไม่พบผู้ใช้' : 'User not found')}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] shrink-0"
                          style={{ backgroundColor: getRoleColor(s.role) + '20', color: getRoleColor(s.role), borderColor: getRoleColor(s.role) + '40' }}
                        >
                          {getRoleLabel(s.role)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
