'use client'

import { useState, useTransition, useMemo } from 'react'
import {
    Plus, Trash2, Edit2, Save, X, GripVertical, Eye, EyeOff, Settings, Palette, Wrench, Tag, ChevronDown, ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    createJobSetting, updateJobSetting, deleteJobSetting, toggleJobSetting,
} from '../actions'
import type { JobSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Settings View — Jobs Settings with per-status tag management
// ============================================================================

interface SettingsViewProps {
    settings: JobSetting[]
}

type TopTab = 'graphic_status' | 'onsite_status' | 'tag'

const TOP_TABS: { key: TopTab; icon: React.ReactNode; labelTh: string; labelEn: string }[] = [
    { key: 'graphic_status', icon: <Palette className="h-4 w-4" />, labelTh: 'สถานะ กราฟฟิก', labelEn: 'Graphic Status' },
    { key: 'onsite_status', icon: <Wrench className="h-4 w-4" />, labelTh: 'สถานะ ออกหน้างาน', labelEn: 'On-site Status' },
    { key: 'tag', icon: <Tag className="h-4 w-4" />, labelTh: 'แท็ก', labelEn: 'Tags' },
]

type TagSubTab = 'graphic' | 'onsite'

export default function SettingsView({ settings }: SettingsViewProps) {
    const { locale } = useLocale()
    const [activeTab, setActiveTab] = useState<TopTab>('graphic_status')
    const [isPending, startTransition] = useTransition()

    // Add form
    const [addMode, setAddMode] = useState(false)
    const [addCategory, setAddCategory] = useState<string | null>(null) // which section is being added to
    const [newValue, setNewValue] = useState('')
    const [newLabelTh, setNewLabelTh] = useState('')
    const [newLabelEn, setNewLabelEn] = useState('')
    const [newColor, setNewColor] = useState('#3b82f6')

    // Edit
    const [editId, setEditId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<Record<string, string>>({})

    // Tag sub-tab: graphic vs onsite
    const [tagSubTab, setTagSubTab] = useState<TagSubTab>('graphic')

    // Collapsed sections for tag view
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

    // Get statuses from settings for building tag sections
    const graphicStatuses = useMemo(() =>
        settings
            .filter(s => s.category === 'graphic_status' && s.is_active)
            .sort((a, b) => a.sort_order - b.sort_order),
        [settings]
    )

    const onsiteStatuses = useMemo(() =>
        settings
            .filter(s => s.category === 'onsite_status' && s.is_active)
            .sort((a, b) => a.sort_order - b.sort_order),
        [settings]
    )

    // Count tags for badge
    const tagCount = useMemo(() =>
        settings.filter(s => s.category.startsWith('tag_')).length,
        [settings]
    )

    const currentSettings = activeTab === 'tag'
        ? [] // tag tab uses its own rendering
        : settings
            .filter(s => s.category === activeTab)
            .sort((a, b) => a.sort_order - b.sort_order)

    const toggleSection = (key: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const handleAdd = (category: string) => {
        if (!newValue.trim() || !newLabelTh.trim() || !newLabelEn.trim()) return

        startTransition(async () => {
            const formData = new FormData()
            formData.set('category', category)
            formData.set('value', newValue.trim().toLowerCase().replace(/\s+/g, '_'))
            formData.set('label_th', newLabelTh.trim())
            formData.set('label_en', newLabelEn.trim())
            formData.set('color', newColor)
            const existingCount = settings.filter(s => s.category === category).length
            formData.set('sort_order', String(existingCount + 1))
            await createJobSetting(formData)
            setNewValue('')
            setNewLabelTh('')
            setNewLabelEn('')
            setNewColor('#3b82f6')
            setAddMode(false)
            setAddCategory(null)
        })
    }

    const handleToggle = (id: string, isActive: boolean) => {
        startTransition(async () => {
            await toggleJobSetting(id, !isActive)
        })
    }

    const handleDelete = (id: string) => {
        if (!confirm(locale === 'th' ? 'ลบการตั้งค่านี้?' : 'Delete this setting?')) return
        startTransition(async () => {
            await deleteJobSetting(id)
        })
    }

    const startEdit = (setting: JobSetting) => {
        setEditId(setting.id)
        setEditForm({
            value: setting.value,
            label_th: setting.label_th,
            label_en: setting.label_en,
            color: setting.color || '#3b82f6',
        })
    }

    const saveEdit = () => {
        if (!editId) return
        startTransition(async () => {
            const formData = new FormData()
            formData.set('value', editForm.value)
            formData.set('label_th', editForm.label_th)
            formData.set('label_en', editForm.label_en)
            formData.set('color', editForm.color)
            await updateJobSetting(editId, formData)
            setEditId(null)
        })
    }

    const openAddForm = (category: string) => {
        setAddMode(true)
        setAddCategory(category)
        setNewValue('')
        setNewLabelTh('')
        setNewLabelEn('')
        setNewColor('#3b82f6')
    }

    // ---- Shared row component ----
    const SettingRow = ({ setting }: { setting: JobSetting }) => (
        <div
            className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${!setting.is_active ? 'opacity-50 bg-zinc-50 dark:bg-zinc-900' : 'bg-white dark:bg-zinc-900 border-zinc-200/60 dark:border-zinc-800/60'
                }`}
        >
            {editId === setting.id ? (
                <>
                    <input
                        type="color"
                        value={editForm.color}
                        onChange={e => setEditForm(p => ({ ...p, color: e.target.value }))}
                        className="h-8 w-8 rounded border-0 cursor-pointer"
                    />
                    <Input
                        value={editForm.label_th}
                        onChange={e => setEditForm(p => ({ ...p, label_th: e.target.value }))}
                        className="h-8 text-xs flex-1"
                    />
                    <Input
                        value={editForm.label_en}
                        onChange={e => setEditForm(p => ({ ...p, label_en: e.target.value }))}
                        className="h-8 text-xs flex-1"
                    />
                    <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white" onClick={saveEdit} disabled={isPending}>
                        <Save className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditId(null)}>
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </>
            ) : (
                <>
                    <GripVertical className="h-4 w-4 text-zinc-300 dark:text-zinc-600 cursor-grab" />
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: setting.color || '#9ca3af' }} />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex-1">
                        {locale === 'th' ? setting.label_th : setting.label_en}
                    </span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                        {setting.value}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggle(setting.id, setting.is_active)}>
                            {setting.is_active ? <Eye className="h-3.5 w-3.5 text-emerald-500" /> : <EyeOff className="h-3.5 w-3.5 text-zinc-400" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(setting)}>
                            <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => handleDelete(setting.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </>
            )}
        </div>
    )

    // ---- Add form component ----
    const AddForm = ({ category }: { category: string }) => (
        <div className="flex items-center gap-2 p-3 bg-violet-50 dark:bg-violet-950/20 rounded-lg border border-violet-200 dark:border-violet-800">
            <input
                type="color"
                value={newColor}
                onChange={e => setNewColor(e.target.value)}
                className="h-8 w-8 rounded border-0 cursor-pointer"
            />
            <Input
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder={locale === 'th' ? 'ค่า (key)' : 'Value (key)'}
                className="h-8 text-xs flex-1"
            />
            <Input
                value={newLabelTh}
                onChange={e => setNewLabelTh(e.target.value)}
                placeholder="ชื่อ TH"
                className="h-8 text-xs flex-1"
            />
            <Input
                value={newLabelEn}
                onChange={e => setNewLabelEn(e.target.value)}
                placeholder="Label EN"
                className="h-8 text-xs flex-1"
            />
            <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => handleAdd(category)} disabled={isPending}>
                <Save className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => { setAddMode(false); setAddCategory(null) }}>
                <X className="h-3.5 w-3.5" />
            </Button>
        </div>
    )

    // ---- Tag section for a specific status ----
    const TagStatusSection = ({ statusSetting, jobType }: { statusSetting: JobSetting; jobType: 'graphic' | 'onsite' }) => {
        const category = `tag_${jobType}_${statusSetting.value}`
        const sectionKey = category
        const isCollapsed = collapsedSections.has(sectionKey)
        const sectionTags = settings
            .filter(s => s.category === category)
            .sort((a, b) => a.sort_order - b.sort_order)

        return (
            <div className="border border-zinc-200/60 dark:border-zinc-800/60 rounded-lg overflow-hidden">
                {/* Section header */}
                <button
                    onClick={() => toggleSection(sectionKey)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
                >
                    {isCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                        : <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    }
                    <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: statusSetting.color || '#9ca3af' }}
                    />
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-1">
                        {locale === 'th' ? statusSetting.label_th : statusSetting.label_en}
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {sectionTags.length}
                    </Badge>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/30"
                        onClick={(e) => {
                            e.stopPropagation()
                            openAddForm(category)
                            if (isCollapsed) toggleSection(sectionKey)
                        }}
                    >
                        <Plus className="h-3 w-3 mr-0.5" />
                        {locale === 'th' ? 'เพิ่ม' : 'Add'}
                    </Button>
                </button>

                {/* Section content */}
                {!isCollapsed && (
                    <div className="p-3 space-y-2">
                        {addMode && addCategory === category && (
                            <AddForm category={category} />
                        )}

                        {sectionTags.map(tag => (
                            <SettingRow key={tag.id} setting={tag} />
                        ))}

                        {sectionTags.length === 0 && !(addMode && addCategory === category) && (
                            <div className="text-center py-4 text-xs text-zinc-400 dark:text-zinc-500">
                                {locale === 'th' ? 'ยังไม่มีแท็ก' : 'No tags yet'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        )
    }

    // ---- Render tag tab ----
    const renderTagTab = () => {
        const statuses = tagSubTab === 'graphic' ? graphicStatuses : onsiteStatuses

        return (
            <div className="space-y-4">
                {/* Sub-tabs: Graphic / Onsite */}
                <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                    <button
                        onClick={() => setTagSubTab('graphic')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all flex-1 justify-center ${tagSubTab === 'graphic'
                            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                            }`}
                    >
                        <Palette className="h-3.5 w-3.5" />
                        {locale === 'th' ? 'แท็กกราฟฟิก' : 'Graphic Tags'}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                            {settings.filter(s => s.category.startsWith('tag_graphic_')).length}
                        </Badge>
                    </button>
                    <button
                        onClick={() => setTagSubTab('onsite')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all flex-1 justify-center ${tagSubTab === 'onsite'
                            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                            }`}
                    >
                        <Wrench className="h-3.5 w-3.5" />
                        {locale === 'th' ? 'แท็กออกหน้างาน' : 'On-site Tags'}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                            {settings.filter(s => s.category.startsWith('tag_onsite_')).length}
                        </Badge>
                    </button>
                </div>

                {/* Status sections */}
                {statuses.length === 0 ? (
                    <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500">
                        {locale === 'th'
                            ? `ยังไม่มีสถานะ${tagSubTab === 'graphic' ? 'กราฟฟิก' : 'ออกหน้างาน'} — ไปตั้งค่าสถานะก่อน`
                            : `No ${tagSubTab === 'graphic' ? 'graphic' : 'on-site'} statuses configured — set up statuses first`
                        }
                    </div>
                ) : (
                    <div className="space-y-2">
                        {statuses.map(status => (
                            <TagStatusSection
                                key={status.id}
                                statusSetting={status}
                                jobType={tagSubTab}
                            />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    {locale === 'th' ? 'ตั้งค่า Jobs' : 'Jobs Settings'}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {locale === 'th' ? 'จัดการสถานะ Kanban และแท็ก' : 'Manage Kanban statuses and tags'}
                </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 max-w-xl flex-wrap">
                {TOP_TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => { setActiveTab(tab.key); setAddMode(false); setAddCategory(null); setEditId(null) }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.key
                            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                            }`}
                    >
                        {tab.icon}
                        {locale === 'th' ? tab.labelTh : tab.labelEn}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                            {tab.key === 'tag'
                                ? tagCount
                                : settings.filter(s => s.category === tab.key).length
                            }
                        </Badge>
                    </button>
                ))}
            </div>

            {/* Content */}
            {activeTab === 'tag' ? (
                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            {locale === 'th' ? 'แท็กแยกตามสถานะ' : 'Tags by Status'}
                        </CardTitle>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                            {locale === 'th'
                                ? 'ตั้งค่าแท็กสำหรับแต่ละสถานะ แยกตามประเภทงาน (กราฟฟิก / ออกหน้างาน)'
                                : 'Configure tags for each status, separated by job type (Graphic / On-site)'
                            }
                        </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {renderTagTab()}
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between py-4">
                        <CardTitle className="text-base">
                            {TOP_TABS.find(t => t.key === activeTab)?.[locale === 'th' ? 'labelTh' : 'labelEn']}
                        </CardTitle>
                        <Button
                            size="sm"
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                            onClick={() => { setAddMode(true); setAddCategory(activeTab) }}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            {locale === 'th' ? 'เพิ่ม' : 'Add'}
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                        {/* Add Row */}
                        {addMode && addCategory === activeTab && (
                            <AddForm category={activeTab} />
                        )}

                        {/* Settings List */}
                        {currentSettings.map(setting => (
                            <SettingRow key={setting.id} setting={setting} />
                        ))}

                        {currentSettings.length === 0 && !(addMode && addCategory === activeTab) && (
                            <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500">
                                {locale === 'th' ? 'ยังไม่มีการตั้งค่า' : 'No settings yet'}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
