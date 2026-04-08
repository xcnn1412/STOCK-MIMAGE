'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import {
    Plus, Trash2, Edit2, Save, X, Settings, Tag, Ticket,
    ChevronLeft, CheckCircle, Eye, EyeOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    createMyJobSetting, updateMyJobSetting, deleteMyJobSetting,
    toggleMyJobSetting, initMyJobDefaultSettings,
} from '../actions'
import type { PersonalSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Type
// ============================================================================

interface MyJobSettingsViewProps {
    settings: PersonalSetting[]
    jobTypes: PersonalSetting[]
}

// ============================================================================
// Tab definitions
// ============================================================================

type Tab = 'job_type' | `status_${string}` | 'ticket_category' | 'ticket_status'

// ============================================================================
// Settings View
// ============================================================================

export default function MyJobSettingsView({ settings: initialSettings, jobTypes: initialJobTypes }: MyJobSettingsViewProps) {
    const { locale }  = useLocale()
    const [isPending, startTransition] = useTransition()

    // Optimistic settings state (server actions trigger revalidation which refreshes server data)
    const settings = initialSettings
    const jobTypes = initialJobTypes

    // Active tab
    const [activeTab, setActiveTab] = useState<Tab>('job_type')

    // Add form
    const [addMode,     setAddMode]     = useState(false)
    const [newLabelTh,  setNewLabelTh]  = useState('')
    const [newLabelEn,  setNewLabelEn]  = useState('')
    const [newValue,    setNewValue]    = useState('')
    const [newColor,    setNewColor]    = useState('#8b5cf6')
    const [addError,    setAddError]    = useState('')

    // Edit form
    const [editId,   setEditId]   = useState<string | null>(null)
    const [editForm, setEditForm] = useState<{ label_th: string; label_en: string; color: string; value: string }>({ label_th: '', label_en: '', color: '', value: '' })

    // Build tabs
    const TABS = useMemo(() => {
        const statusTabs: { key: Tab; label: string; labelTh: string }[] = jobTypes.map(jt => ({
            key: `status_${jt.value}` as Tab,
            label: `${jt.label_en} Status`,
            labelTh: `สถานะ ${jt.label_th}`,
        }))
        return [
            { key: 'job_type' as Tab,        label: 'Job Types',          labelTh: 'ประเภทงาน'     },
            ...statusTabs,
            { key: 'ticket_category' as Tab, label: 'Ticket Categories',  labelTh: 'หมวด Ticket'   },
            { key: 'ticket_status' as Tab,   label: 'Ticket Statuses',    labelTh: 'สถานะ Ticket'  },
        ]
    }, [jobTypes])

    const categoryForTab: Record<Tab, string> = {
        job_type:         'job_type',
        ticket_category:  'ticket_category',
        ticket_status:    'status_ticket',
        ...(Object.fromEntries(jobTypes.map(jt => [`status_${jt.value}`, `status_${jt.value}`]))),
    } as Record<Tab, string>

    const currentCategory = categoryForTab[activeTab] ?? activeTab
    const currentItems = settings
        .filter(s => s.category === currentCategory)
        .sort((a, b) => a.sort_order - b.sort_order)

    const autoValue = (label: string) => label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

    // ---- Handlers ----

    const handleAdd = () => {
        if (!newLabelEn.trim() && !newLabelTh.trim()) { setAddError(locale === 'th' ? 'ใส่ชื่ออย่างน้อยหนึ่งภาษา' : 'Enter at least one label'); return }
        setAddError('')
        const fd = new FormData()
        fd.set('category', currentCategory)
        fd.set('value',    newValue.trim() || autoValue(newLabelEn || newLabelTh))
        fd.set('label_th', newLabelTh.trim())
        fd.set('label_en', newLabelEn.trim())
        fd.set('color',    newColor)
        fd.set('sort_order', String(currentItems.length))

        startTransition(async () => {
            const result = await createMyJobSetting(fd)
            if (result.error) { setAddError(result.error); return }
            setAddMode(false); setNewLabelTh(''); setNewLabelEn(''); setNewValue(''); setNewColor('#8b5cf6')
        })
    }

    const handleEdit = (item: PersonalSetting) => {
        setEditId(item.id)
        setEditForm({ label_th: item.label_th, label_en: item.label_en, color: item.color || '#8b5cf6', value: item.value })
    }

    const handleSaveEdit = (id: string) => {
        const fd = new FormData()
        fd.set('label_th', editForm.label_th)
        fd.set('label_en', editForm.label_en)
        fd.set('color',    editForm.color)
        fd.set('value',    editForm.value)
        startTransition(async () => {
            await updateMyJobSetting(id, fd)
            setEditId(null)
        })
    }

    const handleDelete = (id: string, label: string) => {
        if (!confirm(locale === 'th' ? `ลบ "${label}"?` : `Delete "${label}"?`)) return
        startTransition(async () => { await deleteMyJobSetting(id) })
    }

    const handleToggle = (id: string, is_active: boolean) => {
        startTransition(async () => { await toggleMyJobSetting(id, !is_active) })
    }

    const handleInitDefaults = () => {
        if (!confirm(locale === 'th'
            ? 'รีเซ็ตเป็นค่าเริ่มต้น? การตั้งค่าเดิมจะถูกลบทั้งหมด'
            : 'Reset to defaults? All current settings will be removed.')) return

        startTransition(async () => {
            // Delete all existing settings first
            for (const s of settings) {
                await deleteMyJobSetting(s.id)
            }
            // Re-initialize (force, since they were just deleted)
            const fd = new FormData()
            await initMyJobDefaultSettings()
        })
    }

    // ---- Tab color ----
    const tabColor = (key: Tab) => {
        if (key === 'job_type')        return '#8b5cf6'
        if (key === 'ticket_category') return '#3b82f6'
        if (key === 'ticket_status')   return '#10b981'
        // status_X: use job type color
        const typeName = (key as string).replace('status_', '')
        return jobTypes.find(jt => jt.value === typeName)?.color || '#9ca3af'
    }

    return (
        <div className="space-y-6 max-w-3xl">

            {/* ================================================================ */}
            {/* Header */}
            {/* ================================================================ */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link href="/jobs/my-job">
                        <Button variant="ghost" size="sm" className="gap-1.5 text-zinc-500">
                            <ChevronLeft className="h-4 w-4" />
                            {locale === 'th' ? 'กลับ' : 'Back'}
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <Settings className="h-5 w-5 text-violet-500" />
                            {locale === 'th' ? 'ตั้งค่า My Job' : 'My Job Settings'}
                        </h1>
                        <p className="text-sm text-zinc-400 mt-0.5">
                            {locale === 'th'
                                ? 'ปรับแต่งประเภทงาน, สถานะ, หมวด Ticket ตามต้องการ'
                                : 'Customize job types, statuses and ticket categories for your workspace'}
                        </p>
                    </div>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleInitDefaults}
                    disabled={isPending}
                    className="text-xs"
                >
                    {locale === 'th' ? 'รีเซ็ตค่าเริ่มต้น' : 'Reset to Defaults'}
                </Button>
            </div>

            {/* ================================================================ */}
            {/* Tabs */}
            {/* ================================================================ */}
            <div className="flex gap-1 flex-wrap">
                {TABS.map(tab => {
                    const isActive = activeTab === tab.key
                    const color    = tabColor(tab.key)
                    return (
                        <button
                            key={tab.key}
                            onClick={() => { setActiveTab(tab.key); setAddMode(false); setEditId(null) }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                isActive
                                    ? 'text-white shadow-sm'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                            style={isActive ? { backgroundColor: color } : undefined}
                        >
                            {tab.key === 'job_type'        && <Briefcase className="h-3.5 w-3.5" />}
                            {tab.key === 'ticket_category' && <Tag className="h-3.5 w-3.5" />}
                            {tab.key === 'ticket_status'   && <Ticket className="h-3.5 w-3.5" />}
                            {tab.key.startsWith('status_') && <span className="h-2.5 w-2.5 rounded-full bg-current opacity-70" />}
                            {locale === 'th' ? tab.labelTh : tab.label}
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">
                                {settings.filter(s => s.category === categoryForTab[tab.key]).length}
                            </Badge>
                        </button>
                    )
                })}
            </div>

            {/* ================================================================ */}
            {/* Items list */}
            {/* ================================================================ */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                            {locale === 'th'
                                ? TABS.find(t => t.key === activeTab)?.labelTh
                                : TABS.find(t => t.key === activeTab)?.label}
                        </CardTitle>
                        <Button
                            size="sm"
                            onClick={() => { setAddMode(true); setEditId(null) }}
                            className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                        >
                            <Plus className="h-4 w-4" />
                            {locale === 'th' ? 'เพิ่ม' : 'Add'}
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-2">
                    {/* Add form */}
                    {addMode && (
                        <div className="flex flex-col gap-2 p-3 rounded-xl border-2 border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/30 dark:bg-violet-950/10">
                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    placeholder={locale === 'th' ? 'ชื่อ (ไทย)' : 'Label (Thai)'}
                                    value={newLabelTh}
                                    onChange={e => setNewLabelTh(e.target.value)}
                                    autoFocus
                                />
                                <Input
                                    placeholder={locale === 'th' ? 'ชื่อ (อังกฤษ)' : 'Label (English)'}
                                    value={newLabelEn}
                                    onChange={e => setNewLabelEn(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Input
                                    placeholder={locale === 'th' ? 'ค่า (value)' : 'Value (slug)'}
                                    value={newValue}
                                    onChange={e => setNewValue(e.target.value)}
                                    className="flex-1"
                                />
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="color"
                                        value={newColor}
                                        onChange={e => setNewColor(e.target.value)}
                                        className="h-9 w-9 rounded cursor-pointer border border-zinc-200 dark:border-zinc-700 p-0.5 bg-transparent"
                                        title={locale === 'th' ? 'เลือกสี' : 'Pick color'}
                                    />
                                    <Button size="sm" onClick={handleAdd} disabled={isPending} className="bg-violet-600 hover:bg-violet-700 text-white gap-1">
                                        <Save className="h-3.5 w-3.5" />
                                        {locale === 'th' ? 'บันทึก' : 'Save'}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setAddMode(false)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                            {addError && <p className="text-xs text-red-500">{addError}</p>}
                        </div>
                    )}

                    {/* Items */}
                    {currentItems.length === 0 && !addMode && (
                        <div className="flex flex-col items-center justify-center py-10 text-zinc-300 dark:text-zinc-700">
                            <p className="text-sm">{locale === 'th' ? 'ยังไม่มีรายการ กด + เพิ่มได้เลย' : 'No items yet — click + to add'}</p>
                        </div>
                    )}

                    {currentItems.map(item => (
                        <div
                            key={item.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                item.is_active
                                    ? 'bg-white dark:bg-zinc-900 border-zinc-200/60 dark:border-zinc-800/60'
                                    : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200/40 dark:border-zinc-800/40 opacity-60'
                            }`}
                        >
                            {editId === item.id ? (
                                /* Edit mode */
                                <div className="flex-1 grid grid-cols-2 gap-2 items-center">
                                    <Input
                                        value={editForm.label_th}
                                        onChange={e => setEditForm(f => ({ ...f, label_th: e.target.value }))}
                                        placeholder={locale === 'th' ? 'ชื่อ (ไทย)' : 'Label (Thai)'}
                                        autoFocus
                                    />
                                    <Input
                                        value={editForm.label_en}
                                        onChange={e => setEditForm(f => ({ ...f, label_en: e.target.value }))}
                                        placeholder={locale === 'th' ? 'ชื่อ (อังกฤษ)' : 'Label (English)'}
                                    />
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={editForm.color}
                                            onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))}
                                            className="h-9 w-9 rounded cursor-pointer border border-zinc-200 dark:border-zinc-700 p-0.5 bg-transparent"
                                        />
                                        <Input
                                            value={editForm.value}
                                            onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))}
                                            placeholder="value (slug)"
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1 justify-end">
                                        <Button size="sm" onClick={() => handleSaveEdit(item.id)} disabled={isPending} className="bg-violet-600 hover:bg-violet-700 text-white gap-1">
                                            <Save className="h-3.5 w-3.5" />
                                            {locale === 'th' ? 'บันทึก' : 'Save'}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                /* View mode */
                                <>
                                    <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: item.color || '#9ca3af' }} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                                {item.label_th || item.label_en}
                                            </span>
                                            {item.label_en && item.label_th && (
                                                <span className="text-xs text-zinc-400">{item.label_en}</span>
                                            )}
                                        </div>
                                        <span className="text-xs text-zinc-400 font-mono">{item.value}</span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => handleToggle(item.id, item.is_active)}
                                            title={item.is_active ? (locale === 'th' ? 'ซ่อน' : 'Disable') : (locale === 'th' ? 'แสดง' : 'Enable')}
                                            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
                                        >
                                            {item.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                        </button>
                                        <button
                                            onClick={() => handleEdit(item)}
                                            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-violet-600 transition-colors"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(item.id, item.label_th || item.label_en)}
                                            className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Hint */}
            {activeTab === 'job_type' && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3">
                    {locale === 'th'
                        ? 'เมื่อเพิ่มประเภทงานใหม่ ให้ไปที่แท็บ "สถานะ [ชื่อประเภท]" เพื่อกำหนดสถานะสำหรับ pipeline นั้น'
                        : 'After adding a job type, switch to the "Status [type name]" tab to define the kanban statuses for that pipeline.'}
                </p>
            )}
        </div>
    )
}

// (import for icon used in job_type tab but not imported at top)
function Briefcase(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
    )
}
