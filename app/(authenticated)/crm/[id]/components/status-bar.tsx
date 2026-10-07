'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useLocale } from '@/lib/i18n/context'
import { getStatusConfig, getStatusesFromSettings, type CrmSetting } from '../../types'

// Status Change Bar
export function StatusBar({ settings, status, loading, getStatusLabel, onChange }: {
  settings: CrmSetting[]
  status: string
  loading: boolean
  getStatusLabel: (status: string) => string
  onChange: (status: string) => void
}) {
  const tc = useLocale().t.crm.detail
  const statusConfig = getStatusConfig(settings, status)
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-500">{tc.currentStatus}</span>
          <Badge className={`${statusConfig.bgColor} ${statusConfig.textColor} border-0 text-sm px-3`}>
            {getStatusLabel(status)}
          </Badge>
        </div>
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {getStatusesFromSettings(settings).filter(s => s !== status).map(s => {
            const cfg = getStatusConfig(settings, s)
            return (
              <Button
                key={s}
                variant="outline"
                size="sm"
                onClick={() => onChange(s)}
                disabled={loading}
                className="text-xs shrink-0 whitespace-nowrap"
              >
                <span className="h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: cfg.color }} />
                {getStatusLabel(s)}
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
