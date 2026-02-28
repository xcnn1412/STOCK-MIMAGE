'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Plus, Trash2, Package, Users, MessageSquare, Pencil, Check, X, Tag, Columns3 } from 'lucide-react'
import { createCrmSetting, updateCrmSetting, deleteCrmSetting, toggleCrmSetting } from '../actions'
import type { CrmSetting } from '../crm-dashboard'
import { useLocale } from '@/lib/i18n/context'
import ColorWheel from '../components/color-wheel'


type TabKey = 'kanban_status' | 'package' | 'customer_type' | 'lead_source' | 'tag'

export default function CrmSettingsView({ settings }: { settings: CrmSetting[] }) {
  const router = useRouter()
  const { locale, t } = useLocale()
  const tc = t.crm.settings
  const [activeTab, setActiveTab] = useState<TabKey>('kanban_status')
  const [tagSubTab, setTagSubTab] = useState<string>('tag')
  const [addMode, setAddMode] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const TABS: { key: TabKey; label: string; icon: typeof Package }[] = [
    { key: 'kanban_status', label: locale === 'th' ? 'สถานะ Kanban' : 'Kanban Status', icon: Columns3 },
    { key: 'package', label: tc.packages, icon: Package },
    { key: 'customer_type', label: tc.customerTypes, icon: Users },
    { key: 'lead_source', label: tc.leadSources, icon: MessageSquare },
    { key: 'tag', label: tc.tags, icon: Tag },
  ]

  // Dynamic tag sub-tabs: "ทั่วไป" + one per kanban_status
  const kanbanStatuses = settings
    .filter(s => s.category === 'kanban_status' && s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)

  const TAG_SUB_TABS: { key: string; label: string }[] = [
    { key: 'tag', label: tc.tagGeneral },
    ...kanbanStatuses.map(s => ({
      key: `tag_${s.value}`,
      label: locale === 'th' ? s.label_th : s.label_en,
    })),
  ]

  // When in the "tag" main tab, use the sub-tab as the effective category
  const effectiveCategory = activeTab === 'tag' ? tagSubTab : activeTab

  const tabSettings = settings
    .filter(s => s.category === effectiveCategory)
    .sort((a, b) => a.sort_order - b.sort_order)

  // Handle add
  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.set('category', effectiveCategory)
    await createCrmSetting(formData)
    setAddMode(false)
    setLoading(false)
    router.refresh()
  }

  // Handle toggle
  const handleToggle = async (id: string, is_active: boolean) => {
    await toggleCrmSetting(id, is_active)
    router.refresh()
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm(tc.deleteConfirm)) return
    await deleteCrmSetting(id)
    router.refresh()
  }

  // Handle edit save
  const handleEditSave = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    await updateCrmSetting(id, formData)
    setEditId(null)
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{tc.title}</h1>
          <p className="text-sm text-zinc-500">{tc.subtitle}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setAddMode(false); setEditId(null) }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center ${activeTab === tab.key
              ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tag Sub-Tabs */}
      {activeTab === 'tag' && (
        <div className="flex gap-1 bg-violet-50 dark:bg-violet-950/30 rounded-lg p-1 border border-violet-100 dark:border-violet-900/50">
          {TAG_SUB_TABS.map(sub => (
            <button
              key={sub.key}
              onClick={() => { setTagSubTab(sub.key); setAddMode(false); setEditId(null) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-1 justify-center ${tagSubTab === sub.key
                ? 'bg-white dark:bg-zinc-700 text-violet-700 dark:text-violet-300 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                }`}
            >
              {sub.key === 'tag' ? '🌐' : '🏷️'} {sub.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            {activeTab === 'tag'
              ? `${tc.tags} — ${TAG_SUB_TABS.find(s => s.key === tagSubTab)?.label}`
              : TABS.find(t => t.key === activeTab)?.label || activeTab
            }
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddMode(!addMode)}>
            <Plus className="h-4 w-4 mr-1" />
            {tc.add}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Add Form */}
          {addMode && (
            <form onSubmit={handleAdd} className="space-y-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-zinc-400">{tc.valueKey}</label>
                  <Input name="value" required placeholder="e.g. premium" className="h-8 text-sm" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-zinc-400">{tc.labelTh}</label>
                  <Input name="label_th" required placeholder="ชื่อ TH" className="h-8 text-sm" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-zinc-400">{tc.labelEn}</label>
                  <Input name="label_en" required placeholder="Label EN" className="h-8 text-sm" />
                </div>
                {activeTab === 'package' && (
                  <div className="w-24 space-y-1">
                    <label className="text-[10px] text-zinc-400">{tc.price}</label>
                    <Input name="price" type="number" placeholder="0" className="h-8 text-sm" />
                  </div>
                )}
                <div className="w-16 space-y-1">
                  <label className="text-[10px] text-zinc-400">{tc.sort}</label>
                  <Input name="sort_order" type="number" defaultValue="0" className="h-8 text-sm" />
                </div>
                <Button type="submit" size="sm" disabled={loading} className="h-8">
                  <Check className="h-3 w-3" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAddMode(false)} className="h-8">
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {/* Color wheel for tag or kanban_status categories */}
              {(activeTab === 'tag' || activeTab === 'kanban_status') && (
                <div className="flex justify-center py-1">
                  <ColorWheel size={200} value="#3b82f6" name="color" />
                </div>
              )}
            </form>
          )}

          {/* Settings List */}
          {tabSettings.length === 0 && !addMode && (
            <p className="text-sm text-zinc-400 text-center py-8">{tc.noSettings}</p>
          )}
          {tabSettings.map(setting => (
            <div key={setting.id}>
              {editId === setting.id ? (
                <form onSubmit={e => handleEditSave(e, setting.id)} className="space-y-3 py-2">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Input name="label_th" defaultValue={setting.label_th} className="h-8 text-sm" />
                    </div>
                    <div className="flex-1">
                      <Input name="label_en" defaultValue={setting.label_en} className="h-8 text-sm" />
                    </div>
                    {activeTab === 'package' && (
                      <div className="w-24">
                        <Input name="price" type="number" defaultValue={setting.price || ''} className="h-8 text-sm" />
                      </div>
                    )}
                    <div className="w-16">
                      <Input name="sort_order" type="number" defaultValue={setting.sort_order} className="h-8 text-sm" />
                    </div>
                    <Button type="submit" size="sm" disabled={loading} className="h-8">
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditId(null)} className="h-8">
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  {/* Color wheel for tag or kanban_status edit */}
                  {(activeTab === 'tag' || activeTab === 'kanban_status') && (
                    <div className="flex justify-center py-1">
                      <ColorWheel size={200} value={setting.color || '#3b82f6'} name="color" />
                    </div>
                  )}
                </form>
              ) : (
                <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Color swatch for tags and kanban_status */}
                    {(activeTab === 'tag' || activeTab === 'kanban_status') && (
                      <span
                        className="h-4 w-4 rounded-full shrink-0 ring-1 ring-zinc-200 dark:ring-zinc-700"
                        style={{ backgroundColor: setting.color || '#3b82f6' }}
                      />
                    )}
                    <span className={`text-sm font-medium ${setting.is_active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 line-through'}`}>
                      {setting.label_en}
                    </span>
                    <span className="text-xs text-zinc-400">{setting.label_th}</span>
                    {activeTab === 'package' && setting.price && (
                      <Badge variant="secondary" className="text-[10px]">
                        ฿{setting.price.toLocaleString()}
                      </Badge>
                    )}
                    <span className="text-[10px] text-zinc-300 dark:text-zinc-600">#{setting.sort_order}</span>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Switch
                      checked={setting.is_active}
                      onCheckedChange={v => handleToggle(setting.id, v)}
                      className="h-4 w-7"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditId(setting.id)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-500 hover:text-red-700"
                      onClick={() => handleDelete(setting.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
