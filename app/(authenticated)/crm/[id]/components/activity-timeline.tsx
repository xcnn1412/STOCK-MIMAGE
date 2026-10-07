'use client'

import { type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import MentionTextarea from '@/components/mention-textarea'
import { Phone, MessageSquare, Mail, FileText, Clock, User } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getStatusConfig, type CrmSetting } from '../../types'
import { CollapsibleCardHeader, type LeadActivity, type SystemUser } from '../shared'

const activityIcons: Record<string, typeof Phone> = {
  call: Phone,
  line: MessageSquare,
  email: Mail,
  note: FileText,
  meeting: User,
  status_change: Clock,
}

// Right: Activity Timeline
export function ActivityTimeline({
  activities, users, settings, getStatusLabel, collapsed, onToggle,
  activityType, setActivityType, activityDesc, setActivityDesc, addingActivity, setMentionedActivityUsers, handleAddActivity,
}: {
  activities: LeadActivity[]
  users: SystemUser[]
  settings: CrmSetting[]
  getStatusLabel: (status: string) => string
  collapsed: boolean
  onToggle: () => void
  activityType: string
  setActivityType: (type: string) => void
  activityDesc: string
  setActivityDesc: (desc: string) => void
  addingActivity: boolean
  setMentionedActivityUsers: (ids: string[]) => void
  handleAddActivity: (e: FormEvent) => void
}) {
  const { locale, t } = useLocale()
  const ta = t.crm.activity
  const activityLabels: Record<string, string> = {
    call: ta.call,
    line: ta.line,
    email: ta.email,
    meeting: ta.meeting,
    note: ta.note,
  }
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
      <CollapsibleCardHeader
        collapsed={collapsed}
        icon={<Clock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />}
        iconBg="bg-orange-50 dark:bg-orange-950/40"
        title={ta.title}
        onToggle={onToggle}
      />
      {!collapsed && <CardContent>
        {/* Add Activity Form */}
        <form onSubmit={handleAddActivity} className="mb-6 space-y-3">
          <div className="flex gap-2">
            {['call', 'line', 'email', 'meeting', 'note'].map(type => {
              const Icon = activityIcons[type] || FileText
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActivityType(type)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${activityType === type
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                >
                  <Icon className="h-3 w-3" />
                  {activityLabels[type] || type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <MentionTextarea
                value={activityDesc}
                onChange={setActivityDesc}
                users={users}
                placeholder={ta.addNotePlaceholder}
                rows={2}
                onMentionedUsersChange={setMentionedActivityUsers}
              />
            </div>
            <Button type="submit" size="sm" disabled={addingActivity || !activityDesc.trim()}>
              {addingActivity ? '...' : ta.add}
            </Button>
          </div>
        </form>
  
        {/* Timeline */}
        <div className="space-y-4">
          {activities.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-4">{ta.noActivities}</p>
          )}
          {activities.map((activity, idx) => {
            const Icon = activityIcons[activity.activity_type] || FileText
            const isStatusChange = activity.activity_type === 'status_change'
  
            return (
              <div key={activity.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${isStatusChange
                    ? 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  {idx < activities.length - 1 && (
                    <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 mt-1" />
                  )}
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  {isStatusChange ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {activity.old_status && (
                        <Badge variant="outline" className="text-[10px]">
                          {getStatusLabel(activity.old_status)}
                        </Badge>
                      )}
                      <span className="text-xs text-zinc-400">→</span>
                      {activity.new_status && (
                        <Badge className={`text-[10px] border-0`} style={{ backgroundColor: `${getStatusConfig(settings, activity.new_status).color}15`, color: getStatusConfig(settings, activity.new_status).color }}>
                          {getStatusLabel(activity.new_status)}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{activity.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-zinc-400">
                      {new Date(activity.created_at).toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                    {activity.profiles && (
                      <span className="text-[10px] text-zinc-400">
                        {ta.by} {activity.profiles?.full_name || 'System'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>}
    </Card>
  )
}
