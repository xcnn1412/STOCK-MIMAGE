'use client'

import { Badge } from '@/components/ui/badge'
import { CardContent, Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { RequiredRolesEditor, RequiredRolesSummary, type StaffRoleOption } from '../../../jobs/tracking/required-roles-editor'
import { CollapsibleCardHeader, CardEditActions, EditField, InfoRow, type EditableCardProps } from '../shared'

// Event Info
export function EventCard({
  lead, form, updateForm, editing, collapsed, saving, onEdit, onToggle, onSave, onCancel, badge,
  staffRoleOptions, onRequiredRolesChange,
}: EditableCardProps & {
  staffRoleOptions: StaffRoleOption[]
  onRequiredRolesChange: (value: Record<string, number>) => void
}) {
  const tc = useLocale().t.crm.detail
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
      <CollapsibleCardHeader
        collapsed={collapsed}
        icon={<Calendar className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
        iconBg="bg-violet-50 dark:bg-violet-950/40"
        title={tc.eventInfo}
        badge={badge}
        editing={editing} onEdit={onEdit} onToggle={onToggle}
      />
      {!collapsed && (
        <CardContent className="space-y-3">
          {editing ? (
            <div className="space-y-4">
              <EditField label={tc.eventDate} value={form.event_date} onChange={v => updateForm('event_date', v)} type="date" />
              <EditField label={tc.endDate} value={form.event_end_date} onChange={v => updateForm('event_end_date', v)} type="date" />
              <EditField label={tc.eventTime} value={form.event_time} onChange={v => updateForm('event_time', v)} type="time" />
              <EditField label={tc.eventEndTime} value={form.event_end_time} onChange={v => updateForm('event_end_time', v)} type="time" />
              <div>
                <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{tc.requiredRoles}</Label>
                <RequiredRolesEditor
                  value={form.required_roles}
                  roles={staffRoleOptions}
                  onChange={onRequiredRolesChange}
                />
              </div>
              {form.event_date && form.event_end_date && (
                <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{tc.duration}</span>
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-xs">
                    {(() => {
                      const start = new Date(form.event_date)
                      const end = new Date(form.event_end_date)
                      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
                      return `${days} ${days === 1 ? tc.day : tc.days}`
                    })()}
                  </Badge>
                </div>
              )}
              <EditField label={tc.locationLabel} value={form.event_location} onChange={v => updateForm('event_location', v)} />
              <div>
                <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{tc.details}</Label>
                <Textarea
                  value={form.event_details}
                  onChange={e => updateForm('event_details', e.target.value)}
                  rows={3}
                  className="text-sm"
                  placeholder={tc.eventDetailsPlaceholder}
                />
              </div>
              <CardEditActions saving={saving} onSave={onSave} onCancel={onCancel} />
            </div>
          ) : (
            <>
              <InfoRow label={tc.eventDate} value={lead.event_date} />
              <InfoRow label={tc.endDate} value={lead.event_end_date} />
              <InfoRow label={tc.eventTime} value={lead.event_time ? `${lead.event_time.slice(0, 5)} น.` : null} />
              <InfoRow label={tc.eventEndTime} value={lead.event_end_time ? `${lead.event_end_time.slice(0, 5)} น.` : null} />
              {lead.event_date && lead.event_end_date && (
                <div className="flex justify-between items-start gap-4">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0 w-28">{tc.duration}</span>
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-xs">
                    {(() => {
                      const start = new Date(lead.event_date)
                      const end = new Date(lead.event_end_date)
                      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
                      return `${days} ${days === 1 ? tc.day : tc.days}`
                    })()}
                  </Badge>
                </div>
              )}
              <InfoRow label={tc.locationLabel} value={lead.event_location} />
              <InfoRow label={tc.requiredRoles} value={<RequiredRolesSummary value={lead.required_roles || {}} roles={staffRoleOptions} />} />
              <InfoRow label={tc.details} value={lead.event_details} />
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
