'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tag } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getStatusConfig, type CrmSetting } from '../../types'

// Tags Bar — Jobs-style UI
export function TagsBar({ settings, tags, status, loading, getStatusLabel, onToggle }: {
  settings: CrmSetting[]
  /** form.tags — แท็กที่เลือกอยู่ */
  tags: string[]
  status: string
  loading: boolean
  getStatusLabel: (status: string) => string
  onToggle: (tagValue: string, isSelected: boolean) => void
}) {
  const { locale, t } = useLocale()
  const tc = t.crm.detail
  const statusConfig = getStatusConfig(settings, status)
  const getSettingLabel = (setting: CrmSetting) => locale === 'th' ? setting.label_th : setting.label_en
  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        {/* General Tags */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{tc.generalTags}</span>
          </div>
  
          {/* Selected general tags */}
          {tags.filter(t => settings.find(st => st.value === t && st.category === 'tag')).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.filter(t => settings.find(st => st.value === t && st.category === 'tag')).map(tag => {
                const tagSetting = settings.find(s => s.category === 'tag' && s.value === tag)
                const tagColor = tagSetting?.color || '#3b82f6'
                return (
                  <Badge key={tag} className="text-[10px] px-2 py-0.5 border" style={{ backgroundColor: `${tagColor}18`, color: tagColor, borderColor: `${tagColor}40` }}>
                    {tagSetting ? getSettingLabel(tagSetting) : tag}
                  </Badge>
                )
              })}
            </div>
          )}
  
          {/* Toggle buttons */}
          <div className="flex flex-wrap gap-2">
            {settings.filter(s => s.category === 'tag' && s.is_active).map(tagSetting => {
              const tagValue = tagSetting.value
              const isSelected = tags.includes(tagValue)
              const tagColor = tagSetting.color || '#3b82f6'
              return (
                <Button key={tagSetting.id} variant="outline" size="sm"
                  onClick={() => onToggle(tagValue, isSelected)}
                  disabled={loading}
                  className="text-xs transition-all"
                  style={isSelected ? { backgroundColor: `${tagColor}20`, color: tagColor, borderColor: `${tagColor}60` } : {}}
                >
                  <span className="h-2.5 w-2.5 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: tagColor }} />
                  {getSettingLabel(tagSetting)}
                </Button>
              )
            })}
            {settings.filter(s => s.category === 'tag' && s.is_active).length === 0 && (
              <span className="text-xs text-zinc-400">{tc.noTags}</span>
            )}
          </div>
        </div>
  
        {/* Divider */}
        <div className="border-t border-zinc-100 dark:border-zinc-800" />
  
        {/* Status-specific Tags */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{tc.statusTags}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: statusConfig.color, color: statusConfig.color }}>
              {getStatusLabel(status)}
            </Badge>
          </div>
  
          {/* Selected status tags */}
          {tags.filter(t => settings.find(st => st.value === t && st.category === `tag_${status}`)).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.filter(t => settings.find(st => st.value === t && st.category === `tag_${status}`)).map(tag => {
                const tagSetting = settings.find(s => s.category === `tag_${status}` && s.value === tag)
                const tagColor = tagSetting?.color || '#8b5cf6'
                return (
                  <Badge key={tag} className="text-[10px] px-2 py-0.5 border" style={{ backgroundColor: `${tagColor}18`, color: tagColor, borderColor: `${tagColor}40` }}>
                    {tagSetting ? getSettingLabel(tagSetting) : tag}
                  </Badge>
                )
              })}
            </div>
          )}
  
          {/* Toggle buttons */}
          <div className="flex flex-wrap gap-2">
            {settings.filter(s => s.category === `tag_${status}` && s.is_active).map(tagSetting => {
              const tagValue = tagSetting.value
              const isSelected = tags.includes(tagValue)
              const tagColor = tagSetting.color || '#8b5cf6'
              return (
                <Button key={tagSetting.id} variant="outline" size="sm"
                  onClick={() => onToggle(tagValue, isSelected)}
                  disabled={loading}
                  className="text-xs transition-all"
                  style={isSelected ? { backgroundColor: `${tagColor}20`, color: tagColor, borderColor: `${tagColor}60` } : {}}
                >
                  <span className="h-2.5 w-2.5 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: tagColor }} />
                  {getSettingLabel(tagSetting)}
                </Button>
              )
            })}
            {settings.filter(s => s.category === `tag_${status}` && s.is_active).length === 0 && (
              <span className="text-xs text-zinc-400">{tc.noTags}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
