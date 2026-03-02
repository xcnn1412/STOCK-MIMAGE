'use client'

import { useState, useTransition, useMemo } from 'react'
import {
    Plus, Trash2, Edit2, Save, X, GripVertical, Eye, EyeOff, Settings, Palette, Wrench, Tag, ChevronDown, ChevronRight, ListChecks, Ticket
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    createJobSetting, updateJobSetting, deleteJobSetting, toggleJobSetting,
    createChecklistTemplate, updateChecklistTemplate, deleteChecklistTemplate,
    updateJobType, deleteJobType,
} from '../actions'
import type { JobSetting, ChecklistTemplate } from '../actions'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Settings View — Jobs Settings with per-status tag management
// ============================================================================

interface SettingsViewProps {
    settings: JobSetting[]
    checklistTemplates: ChecklistTemplate[]
    jobTypes: JobSetting[]
}

type TopTab = string // dynamic: 'status_{jobType}', 'tag', 'checklist', 'job_type'

// Static tabs (tag + checklist + job type management)
const STATIC_TABS: { key: string; icon: React.ReactNode; labelTh: string; labelEn: string }[] = [
    { key: 'tag', icon: <Tag className="h-4 w-4" />, labelTh: 'แท็ก', labelEn: 'Tags' },
    { key: 'checklist', icon: <ListChecks className="h-4 w-4" />, labelTh: 'เช็คลิสต์', labelEn: 'Checklist' },
    { key: 'job_type', icon: <Settings className="h-4 w-4" />, labelTh: 'ประเภทงาน', labelEn: 'Job Types' },
    { key: 'ticket_category', icon: <Ticket className="h-4 w-4" />, labelTh: 'Ticket Categories', labelEn: 'Ticket Categories' },
    { key: 'status_ticket', icon: <Ticket className="h-4 w-4" />, labelTh: 'Ticket Statuses', labelEn: 'Ticket Statuses' },
    { key: 'ticket_outcome', icon: <Ticket className="h-4 w-4" />, labelTh: 'Ticket Outcomes', labelEn: 'Ticket Outcomes' },
]



export default function SettingsView({ settings, checklistTemplates, jobTypes }: SettingsViewProps) {
    const { locale } = useLocale()

    // Build dynamic tabs: one status tab per job type + static tabs
    const TOP_TABS = useMemo(() => {
        const statusTabs = jobTypes.map(jt => ({
            key: `status_${jt.value}`,
            icon: <span className="h-3 w-3 rounded-full" style={{ backgroundColor: jt.color || '#9ca3af' }} />,
            labelTh: `สถานะ ${jt.label_th}`,
            labelEn: `${jt.label_en} Status`,
        }))
        return [...statusTabs, ...STATIC_TABS]
    }, [jobTypes])

    const [activeTab, setActiveTab] = useState<TopTab>(TOP_TABS[0]?.key || 'tag')
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

    // Tag sub-tab: dynamic from job types
    const [tagSubTab, setTagSubTab] = useState<string>(jobTypes[0]?.value || 'graphic')

    // Collapsed sections for tag view
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

    // Get statuses per job type dynamically
    const getStatusesForType = (jobTypeValue: string) =>
        settings
            .filter(s => s.category === `status_${jobTypeValue}` && s.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)

    // For backwards compat, these are used in tag tab
    const currentTagStatuses = useMemo(() => getStatusesForType(tagSubTab), [settings, tagSubTab])

    // Count tags for badge
    const tagCount = useMemo(() =>
        settings.filter(s => s.category.startsWith('tag_')).length,
        [settings]
    )

    const currentSettings = (activeTab === 'tag' || activeTab === 'checklist' || activeTab === 'job_type')
        ? [] // these tabs use their own rendering
        : settings
            .filter(s => s.category === activeTab)
            .sort((a, b) => a.sort_order - b.sort_order)

    // Checklist state
    const [checklistSubTab, setChecklistSubTab] = useState<string>(jobTypes[0]?.value || 'graphic')
    const [addingChecklistFor, setAddingChecklistFor] = useState<string | null>(null) // status value
    const [clGroupNameTh, setClGroupNameTh] = useState('')
    const [clGroupNameEn, setClGroupNameEn] = useState('')
    const [clItems, setClItems] = useState<{ label_th: string; label_en: string }[]>([{ label_th: '', label_en: '' }])
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
    const [editTemplateName, setEditTemplateName] = useState({ th: '', en: '' })
    const [editTemplateItems, setEditTemplateItems] = useState<{ label_th: string; label_en: string }[]>([])

    const resetChecklistForm = () => {
        setAddingChecklistFor(null)
        setClGroupNameTh(''); setClGroupNameEn('')
        setClItems([{ label_th: '', label_en: '' }])
    }

    const handleAddChecklistGroup = (statusValue: string) => {
        if (!clGroupNameTh.trim() || !clGroupNameEn.trim()) return
        const validItems = clItems.filter(i => i.label_th.trim() || i.label_en.trim())
        if (validItems.length === 0) return

        startTransition(async () => {
            const fd = new FormData()
            fd.set('job_type', checklistSubTab)
            fd.set('status', statusValue)
            fd.set('group_name_th', clGroupNameTh.trim())
            fd.set('group_name_en', clGroupNameEn.trim())
            fd.set('items', JSON.stringify(validItems))
            fd.set('sort_order', String(checklistTemplates.filter(t => t.job_type === checklistSubTab && t.status === statusValue).length))
            await createChecklistTemplate(fd)
            resetChecklistForm()
        })
    }

    const handleSaveEditTemplate = (templateId: string) => {
        const validItems = editTemplateItems.filter(i => i.label_th.trim() || i.label_en.trim())
        if (!editTemplateName.th.trim() || !editTemplateName.en.trim() || validItems.length === 0) return

        startTransition(async () => {
            const fd = new FormData()
            fd.set('group_name_th', editTemplateName.th.trim())
            fd.set('group_name_en', editTemplateName.en.trim())
            fd.set('items', JSON.stringify(validItems))
            await updateChecklistTemplate(templateId, fd)
            setEditingTemplateId(null)
        })
    }

    const handleDeleteTemplate = (templateId: string) => {
        startTransition(async () => {
            await deleteChecklistTemplate(templateId)
        })
    }

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

    // ---- Shared row render function (NOT a component — avoids remount on re-render) ----
    const renderSettingRow = (setting: JobSetting) => (
        <div
            key={setting.id}
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

    // ---- Add form render function (NOT a component — avoids remount on re-render) ----
    const renderAddForm = (category: string) => (
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
    const TagStatusSection = ({ statusSetting, jobType }: { statusSetting: JobSetting; jobType: string }) => {
        const category = `tag_${jobType}_${statusSetting.value}`
        const sectionKey = category
        const isCollapsed = collapsedSections.has(sectionKey)
        const sectionTags = settings
            .filter(s => s.category === category)
            .sort((a, b) => a.sort_order - b.sort_order)

        return (
            <div className="border border-zinc-200/60 dark:border-zinc-800/60 rounded-lg overflow-hidden">
                {/* Section header */}
                <div
                    onClick={() => toggleSection(sectionKey)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleSection(sectionKey) }}
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
                </div>

                {/* Section content */}
                {!isCollapsed && (
                    <div className="p-3 space-y-2">
                        {addMode && addCategory === category && renderAddForm(category)}

                        {sectionTags.map(tag => renderSettingRow(tag))}

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
        const tagCategory = `tag_${tagSubTab}`
        const tagItems = settings
            .filter(s => s.category === tagCategory)
            .sort((a, b) => a.sort_order - b.sort_order)

        return (
            <div className="space-y-4">
                {/* Sub-tabs: Dynamic from job types */}
                <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 overflow-x-auto"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {jobTypes.map(jt => (
                        <button
                            key={jt.value}
                            onClick={() => setTagSubTab(jt.value)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all flex-1 justify-center whitespace-nowrap ${tagSubTab === jt.value
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                }`}
                        >
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: jt.color || '#9ca3af' }} />
                            {locale === 'th' ? jt.label_th : jt.label_en}
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                                {settings.filter(s => s.category === `tag_${jt.value}`).length}
                            </Badge>
                        </button>
                    ))}
                </div>

                {/* Add form */}
                {addMode && addCategory === tagCategory && renderAddForm(tagCategory)}

                {/* Add button */}
                {!(addMode && addCategory === tagCategory) && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-xs text-violet-600 border-violet-200 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:hover:bg-violet-950/30"
                        onClick={() => { setAddMode(true); setAddCategory(tagCategory) }}
                    >
                        <Plus className="h-3 w-3 mr-1" />
                        {locale === 'th' ? 'เพิ่มแท็ก' : 'Add Tag'}
                    </Button>
                )}

                {/* Tag list */}
                {tagItems.length === 0 ? (
                    <div className="text-center py-6 text-sm text-zinc-400 dark:text-zinc-500">
                        {locale === 'th' ? 'ยังไม่มีแท็ก — กดเพิ่มด้านบน' : 'No tags yet — click add above'}
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {tagItems.map(tag => renderSettingRow(tag))}
                    </div>
                )}

                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    {locale === 'th'
                        ? 'แท็กจะใช้ร่วมกันในทุกสถานะของประเภทงานนี้'
                        : 'Tags are shared across all statuses of this job type'
                    }
                </p>
            </div>
        )
    }

    // ---- Render checklist tab ----
    const renderChecklistTab = () => {
        const statuses = getStatusesForType(checklistSubTab)

        return (
            <div className="space-y-4">
                {/* Sub-tabs: Dynamic from job types */}
                <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 overflow-x-auto"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {jobTypes.map(jt => (
                        <button
                            key={jt.value}
                            onClick={() => setChecklistSubTab(jt.value)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all flex-1 justify-center whitespace-nowrap ${checklistSubTab === jt.value
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                }`}
                        >
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: jt.color || '#9ca3af' }} />
                            {locale === 'th' ? jt.label_th : jt.label_en}
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                                {checklistTemplates.filter(t => t.job_type === jt.value).length}
                            </Badge>
                        </button>
                    ))}
                </div>

                {/* Status sections */}
                {statuses.length === 0 ? (
                    <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500">
                        {locale === 'th'
                            ? `ยังไม่มีสถานะ — ไปตั้งค่าสถานะก่อน`
                            : `No statuses configured — set up statuses first`
                        }
                    </div>
                ) : (
                    <div className="space-y-2">
                        {statuses.map((status: JobSetting) => {
                            const sectionKey = `cl_${checklistSubTab}_${status.value}`
                            const isCollapsed = collapsedSections.has(sectionKey)
                            const templates = checklistTemplates
                                .filter(t => t.job_type === checklistSubTab && t.status === status.value)
                                .sort((a, b) => a.sort_order - b.sort_order)

                            return (
                                <div key={status.id} className="border border-zinc-200/60 dark:border-zinc-800/60 rounded-lg overflow-hidden">
                                    {/* Status header */}
                                    <div
                                        onClick={() => toggleSection(sectionKey)}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left cursor-pointer select-none"
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleSection(sectionKey) }}
                                    >
                                        {isCollapsed
                                            ? <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                            : <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                        }
                                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: status.color || '#9ca3af' }} />
                                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex-1">
                                            {locale === 'th' ? status.label_th : status.label_en}
                                        </span>
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                            {templates.length} {locale === 'th' ? 'กลุ่ม' : 'groups'}
                                        </Badge>
                                        <Button
                                            size="sm" variant="ghost"
                                            className="h-7 px-2 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 dark:text-violet-400"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setAddingChecklistFor(status.value)
                                                if (isCollapsed) toggleSection(sectionKey)
                                            }}
                                        >
                                            <Plus className="h-3 w-3 mr-0.5" /> {locale === 'th' ? 'เพิ่มกลุ่ม' : 'Add Group'}
                                        </Button>
                                    </div>

                                    {/* Section content */}
                                    {!isCollapsed && (
                                        <div className="p-3 space-y-3">
                                            {/* Add form */}
                                            {addingChecklistFor === status.value && (
                                                <div className="border border-violet-200 dark:border-violet-800 rounded-lg p-3 bg-violet-50/30 dark:bg-violet-950/20 space-y-3">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <Input placeholder={locale === 'th' ? 'ชื่อกลุ่ม (TH)' : 'Group name (TH)'} value={clGroupNameTh} onChange={e => setClGroupNameTh(e.target.value)} className="text-sm" />
                                                        <Input placeholder={locale === 'th' ? 'ชื่อกลุ่ม (EN)' : 'Group name (EN)'} value={clGroupNameEn} onChange={e => setClGroupNameEn(e.target.value)} className="text-sm" />
                                                    </div>
                                                    <p className="text-xs font-medium text-zinc-500">{locale === 'th' ? 'รายการ Checklist:' : 'Checklist Items:'}</p>
                                                    {clItems.map((item, idx) => (
                                                        <div key={idx} className="flex gap-2 items-center">
                                                            <Input placeholder="TH" value={item.label_th} onChange={e => setClItems(prev => prev.map((it, i) => i === idx ? { ...it, label_th: e.target.value } : it))} className="text-sm flex-1" />
                                                            <Input placeholder="EN" value={item.label_en} onChange={e => setClItems(prev => prev.map((it, i) => i === idx ? { ...it, label_en: e.target.value } : it))} className="text-sm flex-1" />
                                                            {clItems.length > 1 && (
                                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600" onClick={() => setClItems(prev => prev.filter((_, i) => i !== idx))}>
                                                                    <X className="h-3.5 w-3.5" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    <Button size="sm" variant="outline" className="text-xs" onClick={() => setClItems(prev => [...prev, { label_th: '', label_en: '' }])}>
                                                        <Plus className="h-3 w-3 mr-1" /> {locale === 'th' ? 'เพิ่มรายการ' : 'Add Item'}
                                                    </Button>
                                                    <div className="flex gap-2 justify-end">
                                                        <Button size="sm" variant="ghost" className="text-xs" onClick={resetChecklistForm}>{locale === 'th' ? 'ยกเลิก' : 'Cancel'}</Button>
                                                        <Button size="sm" className="text-xs bg-violet-600 hover:bg-violet-700 text-white" disabled={isPending} onClick={() => handleAddChecklistGroup(status.value)}>
                                                            <Save className="h-3 w-3 mr-1" /> {locale === 'th' ? 'บันทึก' : 'Save'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Existing template groups */}
                                            {templates.map(tmpl => (
                                                <div key={tmpl.id} className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
                                                    {editingTemplateId === tmpl.id ? (
                                                        <div className="space-y-3">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <Input value={editTemplateName.th} onChange={e => setEditTemplateName(p => ({ ...p, th: e.target.value }))} className="text-sm" placeholder="TH" />
                                                                <Input value={editTemplateName.en} onChange={e => setEditTemplateName(p => ({ ...p, en: e.target.value }))} className="text-sm" placeholder="EN" />
                                                            </div>
                                                            <p className="text-xs font-medium text-zinc-500">{locale === 'th' ? 'รายการ:' : 'Items:'}</p>
                                                            {editTemplateItems.map((item, idx) => (
                                                                <div key={idx} className="flex gap-2 items-center">
                                                                    <Input value={item.label_th} onChange={e => setEditTemplateItems(prev => prev.map((it, i) => i === idx ? { ...it, label_th: e.target.value } : it))} className="text-sm flex-1" placeholder="TH" />
                                                                    <Input value={item.label_en} onChange={e => setEditTemplateItems(prev => prev.map((it, i) => i === idx ? { ...it, label_en: e.target.value } : it))} className="text-sm flex-1" placeholder="EN" />
                                                                    {editTemplateItems.length > 1 && (
                                                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400" onClick={() => setEditTemplateItems(prev => prev.filter((_, i) => i !== idx))}>
                                                                            <X className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                            <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditTemplateItems(prev => [...prev, { label_th: '', label_en: '' }])}>
                                                                <Plus className="h-3 w-3 mr-1" /> {locale === 'th' ? 'เพิ่มรายการ' : 'Add Item'}
                                                            </Button>
                                                            <div className="flex gap-2 justify-end">
                                                                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setEditingTemplateId(null)}>{locale === 'th' ? 'ยกเลิก' : 'Cancel'}</Button>
                                                                <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white" disabled={isPending} onClick={() => handleSaveEditTemplate(tmpl.id)}>
                                                                    <Save className="h-3 w-3 mr-1" /> {locale === 'th' ? 'บันทึก' : 'Save'}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                                                    {locale === 'th' ? tmpl.group_name_th : tmpl.group_name_en}
                                                                </span>
                                                                <div className="flex gap-1">
                                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                                                                        setEditingTemplateId(tmpl.id)
                                                                        setEditTemplateName({ th: tmpl.group_name_th, en: tmpl.group_name_en })
                                                                        setEditTemplateItems([...tmpl.items])
                                                                    }}>
                                                                        <Edit2 className="h-3 w-3 text-zinc-400" />
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" disabled={isPending} onClick={() => handleDeleteTemplate(tmpl.id)}>
                                                                        <Trash2 className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1">
                                                                {tmpl.items.map((item, idx) => (
                                                                    <div key={idx} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                                                                        <div className="h-3.5 w-3.5 rounded border border-zinc-300 dark:border-zinc-600 shrink-0" />
                                                                        {locale === 'th' ? item.label_th : item.label_en}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {templates.length === 0 && addingChecklistFor !== status.value && (
                                                <div className="text-center py-4 text-xs text-zinc-400">
                                                    {locale === 'th' ? 'ยังไม่มีเช็คลิสต์' : 'No checklists yet'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        )
    }

    // ---- Render job type management tab ----
    const renderJobTypeTab = () => {
        return (
            <div className="space-y-3">
                {/* Inline Add Form */}
                {addMode && addCategory === 'job_type' && (
                    <div className="border border-violet-200 dark:border-violet-800 rounded-lg p-3 space-y-2 bg-violet-50/50 dark:bg-violet-950/20">
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                placeholder={locale === 'th' ? 'Key (เช่น printing)' : 'Key (e.g. printing)'}
                                value={newValue}
                                onChange={e => setNewValue(e.target.value)}
                                className="text-sm h-8"
                            />
                            <div className="flex gap-1">
                                <input
                                    type="color"
                                    value={newColor}
                                    onChange={e => setNewColor(e.target.value)}
                                    className="h-8 w-8 rounded border cursor-pointer"
                                />
                                <Input
                                    placeholder={locale === 'th' ? 'ชื่อ (TH)' : 'Label (TH)'}
                                    value={newLabelTh}
                                    onChange={e => setNewLabelTh(e.target.value)}
                                    className="text-sm h-8 flex-1"
                                />
                            </div>
                        </div>
                        <Input
                            placeholder={locale === 'th' ? 'ชื่อ (EN)' : 'Label (EN)'}
                            value={newLabelEn}
                            onChange={e => setNewLabelEn(e.target.value)}
                            className="text-sm h-8"
                        />
                        <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => { setAddMode(false); setAddCategory(null) }}>
                                <X className="h-3 w-3 mr-1" />{locale === 'th' ? 'ยกเลิก' : 'Cancel'}
                            </Button>
                            <Button
                                size="sm"
                                className="bg-violet-600 hover:bg-violet-700 text-white"
                                disabled={isPending || !newValue.trim() || !newLabelTh.trim() || !newLabelEn.trim()}
                                onClick={() => handleAdd('job_type')}
                            >
                                <Save className="h-3 w-3 mr-1" />{locale === 'th' ? 'บันทึก' : 'Save'}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Existing types */}
                {jobTypes.length === 0 && !(addMode && addCategory === 'job_type') ? (
                    <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500">
                        {locale === 'th' ? 'ยังไม่มีประเภทงาน — กดปุ่ม "เพิ่ม" ด้านบน' : 'No job types — click "Add" above'}
                    </div>
                ) : (
                    jobTypes.map(jt => (
                        <div key={jt.id} className="flex items-center gap-3 p-3 border border-zinc-200/60 dark:border-zinc-800/60 rounded-lg bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
                            {editId === jt.id ? (
                                <>
                                    <input
                                        type="color"
                                        value={editForm.color}
                                        onChange={e => setEditForm(p => ({ ...p, color: e.target.value }))}
                                        className="h-8 w-8 rounded border-0 cursor-pointer shrink-0"
                                    />
                                    <Input
                                        value={editForm.label_th}
                                        onChange={e => setEditForm(p => ({ ...p, label_th: e.target.value }))}
                                        placeholder="ชื่อ TH"
                                        className="h-8 text-xs flex-1"
                                    />
                                    <Input
                                        value={editForm.label_en}
                                        onChange={e => setEditForm(p => ({ ...p, label_en: e.target.value }))}
                                        placeholder="Label EN"
                                        className="h-8 text-xs flex-1"
                                    />
                                    <Button size="sm" className="h-8 bg-violet-600 hover:bg-violet-700 text-white" disabled={isPending}
                                        onClick={() => {
                                            startTransition(async () => {
                                                const fd = new FormData()
                                                fd.set('label_th', editForm.label_th)
                                                fd.set('label_en', editForm.label_en)
                                                fd.set('color', editForm.color)
                                                await updateJobType(jt.id, fd)
                                                setEditId(null)
                                            })
                                        }}
                                    >
                                        <Save className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditId(null)}>
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: jt.color || '#9ca3af' }} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                            {locale === 'th' ? jt.label_th : jt.label_en}
                                        </p>
                                        <p className="text-xs text-zinc-500">value: {jt.value}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                                            setEditId(jt.id)
                                            setEditForm({
                                                value: jt.value,
                                                label_th: jt.label_th,
                                                label_en: jt.label_en,
                                                color: jt.color || '#3b82f6',
                                            })
                                        }}>
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600" onClick={() => {
                                            if (!confirm(locale === 'th' ? 'ลบประเภทงานนี้?' : 'Delete this job type?')) return
                                            startTransition(async () => {
                                                await deleteJobType(jt.id)
                                            })
                                        }}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                )}
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                    {locale === 'th'
                        ? 'เพิ่มประเภทงานใหม่แล้วไปตั้งค่าสถานะให้กับประเภทนั้น'
                        : 'Add a job type, then configure its statuses'
                    }
                </p>
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

            {/* Tabs — Full-width grouped layout */}
            <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 p-3 space-y-3">
                {/* Group 1: Jobs */}
                <div>
                    <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5 px-1">
                        {locale === 'th' ? 'งาน (Jobs)' : 'Jobs'}
                    </p>
                    <div className="flex gap-1 flex-wrap">
                        {TOP_TABS.filter(t => !t.key.startsWith('ticket_') && t.key !== 'status_ticket').map(tab => {
                            const count = tab.key === 'tag' ? tagCount
                                : tab.key === 'checklist' ? checklistTemplates.length
                                    : tab.key === 'job_type' ? jobTypes.length
                                        : settings.filter(s => s.category === tab.key).length
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => { setActiveTab(tab.key); setAddMode(false); setAddCategory(null); setEditId(null) }}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key
                                        ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200/80 dark:ring-zinc-600/50'
                                        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                >
                                    {tab.icon}
                                    <span className="hidden sm:inline">{locale === 'th' ? tab.labelTh : tab.labelEn}</span>
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{count}</Badge>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-zinc-200/80 dark:bg-zinc-700/60" />

                {/* Group 2: Tickets */}
                <div>
                    <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wider mb-1.5 px-1">
                        {locale === 'th' ? 'ตั้งค่า Ticket' : 'Ticket Settings'}
                    </p>
                    <div className="flex gap-1 flex-wrap">
                        {TOP_TABS.filter(t => t.key.startsWith('ticket_') || t.key === 'status_ticket').map(tab => {
                            const count = settings.filter(s => s.category === tab.key).length
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => { setActiveTab(tab.key); setAddMode(false); setAddCategory(null); setEditId(null) }}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key
                                        ? 'bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 shadow-sm ring-1 ring-violet-200/80 dark:ring-violet-700/50'
                                        : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                        }`}
                                >
                                    {tab.icon}
                                    <span className="hidden sm:inline">{locale === 'th' ? tab.labelTh : tab.labelEn}</span>
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">{count}</Badge>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Content */}
            {activeTab === 'checklist' ? (
                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ListChecks className="h-4 w-4" />
                            {locale === 'th' ? 'เช็คลิสต์แยกตามสถานะ' : 'Checklists by Status'}
                        </CardTitle>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                            {locale === 'th'
                                ? 'ตั้งค่ากลุ่มเช็คลิสต์สำหรับแต่ละสถานะ ซึ่งจะแสดงในหน้ารายละเอียดของแต่ละงาน'
                                : 'Configure checklist groups per status, shown on each job detail page'
                            }
                        </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {renderChecklistTab()}
                    </CardContent>
                </Card>
            ) : activeTab === 'tag' ? (
                <Card>
                    <CardHeader className="py-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Tag className="h-4 w-4" />
                            {locale === 'th' ? 'แท็กแยกตามสถานะ' : 'Tags by Status'}
                        </CardTitle>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                            {locale === 'th'
                                ? 'ตั้งค่าแท็กสำหรับแต่ละสถานะ แยกตามประเภทงาน'
                                : 'Configure tags for each status, separated by job type'
                            }
                        </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {renderTagTab()}
                    </CardContent>
                </Card>
            ) : activeTab === 'job_type' ? (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between py-4">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                {locale === 'th' ? 'ประเภทงาน' : 'Job Types'}
                            </CardTitle>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                {locale === 'th'
                                    ? 'จัดการประเภทงาน (เช่น กราฟฟิก, ออกหน้างาน, ภาพถ่าย)'
                                    : 'Manage job types (e.g. Graphic, On-site, Photography)'
                                }
                            </p>
                        </div>
                        <Button
                            size="sm"
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                            onClick={() => { setAddMode(true); setAddCategory('job_type') }}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            {locale === 'th' ? 'เพิ่ม' : 'Add'}
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {renderJobTypeTab()}
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
                        {addMode && addCategory === activeTab && renderAddForm(activeTab)}

                        {/* Settings List */}
                        {currentSettings.map(setting => renderSettingRow(setting))}

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
