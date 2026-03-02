'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft, Calendar, MapPin, User, Tag, Clock, Palette, Wrench, Pencil,
    Save, X, Trash2, Edit2, Plus, Phone, MessageCircle, Mail, Users as UsersIcon,
    ExternalLink, Lock, ChevronDown, ChevronUp, DollarSign, Package, Briefcase,
    ListChecks, CheckSquare, Square
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    updateJob, updateJobStatus, deleteJob, createJobActivity,
    toggleChecklistItem,
} from '../actions'
import { updateLead } from '../../crm/actions'
import type { Job, JobSetting, JobType, ChecklistTemplate, ChecklistItem } from '../actions'
import { getStatusesFromSettings, getStatusConfig } from '../jobs-dashboard'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Types
// ============================================================================

interface SystemUser {
    id: string
    full_name: string | null
    department: string | null
}

interface Activity {
    id: string
    job_id: string
    created_at: string
    created_by: string | null
    activity_type: string
    description: string | null
    old_status: string | null
    new_status: string | null
    profiles?: { full_name: string | null } | null
}

interface CrmDataProp {
    lead: Record<string, any>
    installments: Array<{
        id: string
        installment_number: number
        amount: number
        due_date: string | null
        is_paid: boolean
        paid_date: string | null
        receipt_url: string | null
    }>
    crmSettings: Array<{
        id: string
        category: string
        value: string
        label_th: string
        label_en: string
        color: string | null
        price: number | null
        sort_order: number
        is_active: boolean
    }>
}

// ============================================================================
// Collapsible CRM Card
// ============================================================================

// CRM-style Collapsible Card (matches CRM UI exactly)
function CrmCard({ title, icon, iconBg, children, defaultOpen = false, onEdit, isEditing }: {
    title: string
    icon: React.ReactNode
    iconBg: string
    children: React.ReactNode
    defaultOpen?: boolean
    onEdit?: () => void
    isEditing?: boolean
}) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <div className={`flex items-center justify-center h-6 w-6 rounded-md ${iconBg}`}>
                            {icon}
                        </div>
                        {title}
                        <Badge className="text-[8px] px-1.5 py-0 bg-blue-50 text-blue-500 dark:bg-blue-950/30 dark:text-blue-400 border-0">
                            CRM
                        </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        {onEdit && open && !isEditing && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-zinc-400 hover:text-blue-600"
                                onClick={onEdit}
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-600"
                            onClick={() => setOpen(!open)}
                        >
                            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            {open && (
                <CardContent className="space-y-3">
                    {children}
                </CardContent>
            )}
        </Card>
    )
}

// Info Row — Read-only display (same as CRM)
function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
    return (
        <div className="flex justify-between items-start gap-4">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0 w-28">{label}</span>
            <span className="text-sm text-zinc-900 dark:text-zinc-100 text-right">{value || '—'}</span>
        </div>
    )
}

// Edit Field — Input with label (same as CRM)
function CrmEditField({ label, value, onChange, type = 'text', placeholder }: {
    label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
    return (
        <div>
            <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{label}</Label>
            <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" />
        </div>
    )
}

// Edit Select — Dropdown with label (same as CRM)
function CrmEditSelect({ label, value, onChange, options, placeholder }: {
    label: string; value: string; onChange: (v: string) => void
    options: { value: string; label: string }[]; placeholder?: string
}) {
    const seen = new Set<string>()
    const displayOptions = options.filter(o => { if (seen.has(o.value)) return false; seen.add(o.value); return true })
    const isValid = value && displayOptions.some(o => o.value === value)
    const selectProps = isValid ? { value, onValueChange: onChange } : { onValueChange: onChange }
    return (
        <div>
            <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{label}</Label>
            <Select {...selectProps}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={placeholder} /></SelectTrigger>
                <SelectContent position="popper" className="max-h-[300px] overflow-y-auto">
                    {displayOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}

// ============================================================================
// Job Detail Component
// ============================================================================

interface JobDetailProps {
    job: Job
    activities: Activity[]
    settings: JobSetting[]
    users: SystemUser[]
    crmData: CrmDataProp | null
    checklistTemplates: ChecklistTemplate[]
    checklistItems: ChecklistItem[]
    jobTypes: JobSetting[]
}

export default function JobDetail({ job, activities, settings, users, crmData, checklistTemplates, checklistItems, jobTypes }: JobDetailProps) {
    const { locale } = useLocale()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const isFromCrm = !!job.crm_lead_id
    const lead = crmData?.lead
    const installments = crmData?.installments || []
    const crmSettings = crmData?.crmSettings || []

    // Edit state (job's own fields)
    const [editing, setEditing] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<Record<string, string>>({})

    // Activity state
    const [activityNote, setActivityNote] = useState('')
    const [activityType, setActivityType] = useState('note')

    // Tags state
    const [localTags, setLocalTags] = useState<string[]>(job.tags || [])

    // Assigned to state (editable for graphic/onsite)
    const [localAssignedTo, setLocalAssignedTo] = useState<string[]>(job.assigned_to || [])

    // Checklist optimistic state — instant UI updates
    const [localChecklistItems, setLocalChecklistItems] = useState<ChecklistItem[]>(checklistItems)
    const [collapsedChecklistStatuses, setCollapsedChecklistStatuses] = useState<Set<string>>(new Set())

    // CRM card editing state
    type CrmCardSection = 'customer' | 'event' | 'financial'
    const [editingCrmCard, setEditingCrmCard] = useState<CrmCardSection | null>(null)
    const [crmForm, setCrmForm] = useState({
        customer_name: lead?.customer_name || '',
        customer_line: lead?.customer_line || '',
        customer_phone: lead?.customer_phone || '',
        customer_type: lead?.customer_type || '',
        lead_source: lead?.lead_source || '',
        is_returning: lead?.is_returning || false,
        event_date: lead?.event_date || '',
        event_end_date: lead?.event_end_date || '',
        event_location: lead?.event_location || '',
        event_details: lead?.event_details || '',
        package_name: lead?.package_name || '',
        quoted_price: lead?.quoted_price || 0,
        confirmed_price: lead?.confirmed_price || 0,
        deposit: lead?.deposit || 0,
        vat_mode: lead?.vat_mode || 'none',
        wht_rate: lead?.wht_rate || 0,
        quotation_ref: lead?.quotation_ref || '',
        notes: lead?.notes || '',
    })
    const updateCrmForm = (key: string, value: string | number | boolean) => {
        setCrmForm(prev => ({ ...prev, [key]: value }))
    }

    // CRM settings derivatives
    const getSettingLabel = (s: { label_th?: string; label_en?: string; value: string }) =>
        locale === 'th' ? (s.label_th || s.value) : (s.label_en || s.value)
    const packages = crmSettings.filter(s => s.category === 'package' && s.is_active)
    const sources = crmSettings.filter(s => s.category === 'lead_source' && s.is_active)
    const customerTypes = crmSettings.filter(s => s.category === 'customer_type' && s.is_active)
    const pkgSetting = crmSettings.find(s => s.category === 'package' && s.value === lead?.package_name)
    const sourceSetting = crmSettings.find(s => s.category === 'lead_source' && s.value === lead?.lead_source)
    const typeSetting = crmSettings.find(s => s.category === 'customer_type' && s.value === lead?.customer_type)

    const handleSaveCrmCard = async (section: CrmCardSection) => {
        if (!job.crm_lead_id) return
        startTransition(async () => {
            const fd = new FormData()
            if (section === 'customer') {
                fd.set('customer_name', crmForm.customer_name)
                fd.set('customer_line', crmForm.customer_line)
                fd.set('customer_phone', crmForm.customer_phone)
                fd.set('customer_type', crmForm.customer_type)
                fd.set('lead_source', crmForm.lead_source)
                fd.set('is_returning', String(crmForm.is_returning))
                fd.set('package_name', crmForm.package_name)
            } else if (section === 'event') {
                fd.set('event_date', crmForm.event_date)
                fd.set('event_end_date', crmForm.event_end_date)
                fd.set('event_location', crmForm.event_location)
                fd.set('event_details', crmForm.event_details)
            } else if (section === 'financial') {
                fd.set('quoted_price', String(crmForm.quoted_price))
                fd.set('confirmed_price', String(crmForm.confirmed_price))
                fd.set('deposit', String(crmForm.deposit))
                fd.set('vat_mode', crmForm.vat_mode)
                fd.set('wht_rate', String(crmForm.wht_rate))
                fd.set('quotation_ref', crmForm.quotation_ref)
                fd.set('notes', crmForm.notes)
            }
            await updateLead(job.crm_lead_id!, fd)
            setEditingCrmCard(null)
            router.refresh()
        })
    }
    const handleCancelCrmEdit = () => {
        setCrmForm({
            customer_name: lead?.customer_name || '',
            customer_line: lead?.customer_line || '',
            customer_phone: lead?.customer_phone || '',
            customer_type: lead?.customer_type || '',
            lead_source: lead?.lead_source || '',
            is_returning: lead?.is_returning || false,
            event_date: lead?.event_date || '',
            event_end_date: lead?.event_end_date || '',
            event_location: lead?.event_location || '',
            event_details: lead?.event_details || '',
            package_name: lead?.package_name || '',
            quoted_price: lead?.quoted_price || 0,
            confirmed_price: lead?.confirmed_price || 0,
            deposit: lead?.deposit || 0,
            vat_mode: lead?.vat_mode || 'none',
            wht_rate: lead?.wht_rate || 0,
            quotation_ref: lead?.quotation_ref || '',
            notes: lead?.notes || '',
        })
        setEditingCrmCard(null)
    }

    // CRM Card Save/Cancel buttons
    const CrmCardEditActions = ({ section }: { section: CrmCardSection }) => (
        <div className="flex items-center gap-2 pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button onClick={() => handleSaveCrmCard(section)} disabled={isPending} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-8 text-xs">
                <Save className="h-3.5 w-3.5" />{isPending ? (locale === 'th' ? 'กำลังบันทึก...' : 'Saving...') : (locale === 'th' ? 'บันทึก' : 'Save')}
            </Button>
            <Button onClick={handleCancelCrmEdit} variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                <X className="h-3.5 w-3.5" />{locale === 'th' ? 'ยกเลิก' : 'Cancel'}
            </Button>
        </div>
    )

    const statuses = getStatusesFromSettings(settings, job.job_type as JobType)
    const currentStatusCfg = getStatusConfig(settings, job.job_type as JobType, job.status)

    // Per-status tags from settings
    const statusTagCategory = `tag_${job.job_type}_${job.status}`
    const availableStatusTags = useMemo(() =>
        settings.filter(s => s.category === statusTagCategory && s.is_active),
        [settings, statusTagCategory]
    )

    const priorityConfig: Record<string, { label: string; color: string }> = {
        low: { label: locale === 'th' ? 'ต่ำ' : 'Low', color: 'text-zinc-500' },
        medium: { label: locale === 'th' ? 'ปานกลาง' : 'Medium', color: 'text-blue-600' },
        high: { label: locale === 'th' ? 'สูง' : 'High', color: 'text-amber-600' },
        urgent: { label: locale === 'th' ? 'เร่งด่วน' : 'Urgent', color: 'text-red-600' },
    }

    const priority = priorityConfig[job.priority] || priorityConfig.medium

    const handleStatusChange = (newStatus: string) => {
        startTransition(async () => { await updateJobStatus(job.id, newStatus) })
    }

    const handleDelete = () => {
        if (!confirm(locale === 'th' ? 'ต้องการลบงานนี้หรือไม่?' : 'Delete this job?')) return
        startTransition(async () => { await deleteJob(job.id); router.push('/jobs') })
    }

    const startEdit = (section: string) => {
        const values: Record<string, string> = {}
        if (section === 'info') {
            values.title = job.title || ''
            values.description = job.description || ''
            values.priority = job.priority || 'medium'
        } else if (section === 'event') {
            values.due_date = job.due_date || ''
        } else if (section === 'notes') {
            values.notes = job.notes || ''
        }
        setEditForm(values)
        setEditing(section)
    }

    const saveEdit = (section: string) => {
        startTransition(async () => {
            const formData = new FormData()
            Object.entries(editForm).forEach(([k, v]) => formData.set(k, v))
            await updateJob(job.id, formData)
            setEditing(null)
        })
    }

    const handleToggleTag = (tagValue: string) => {
        const newTags = localTags.includes(tagValue)
            ? localTags.filter(t => t !== tagValue)
            : [...localTags, tagValue]
        setLocalTags(newTags)
        startTransition(async () => {
            const fd = new FormData()
            fd.set('tags', newTags.join(','))
            await updateJob(job.id, fd)
        })
    }

    const handleToggleAssigned = (userId: string) => {
        const newAssigned = localAssignedTo.includes(userId)
            ? localAssignedTo.filter(id => id !== userId)
            : [...localAssignedTo, userId]
        setLocalAssignedTo(newAssigned)
        startTransition(async () => {
            const fd = new FormData()
            fd.set('assigned_to', newAssigned.join(','))
            await updateJob(job.id, fd)
        })
    }

    const handleAddActivity = () => {
        if (!activityNote.trim()) return
        startTransition(async () => {
            const formData = new FormData()
            formData.set('activity_type', activityType)
            formData.set('description', activityNote)
            await createJobActivity(job.id, formData)
            setActivityNote('')
            setActivityType('note')
        })
    }

    const activityIcons: Record<string, React.ReactNode> = {
        call: <Phone className="h-3.5 w-3.5" />,
        line: <MessageCircle className="h-3.5 w-3.5" />,
        email: <Mail className="h-3.5 w-3.5" />,
        meeting: <UsersIcon className="h-3.5 w-3.5" />,
        note: <Edit2 className="h-3.5 w-3.5" />,
        status_change: <Clock className="h-3.5 w-3.5" />,
    }

    const getUserName = (userId: string) => {
        const u = users.find(u => u.id === userId)
        return u?.full_name || userId.slice(0, 8)
    }




    const getCrmSettingLabel = (category: string, value: string | null) => {
        if (!value) return null
        const s = crmSettings.find(st => st.category === category && st.value === value)
        return s ? getSettingLabel(s) : value
    }

    const formatPrice = (n: number | null | undefined) => {
        if (!n) return '—'
        return `฿${n.toLocaleString()}`
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
                <Button variant="ghost" size="icon" className="mt-1" onClick={() => router.push('/jobs')}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {(() => {
                            const jt = jobTypes.find(t => t.value === job.job_type)
                            return (
                                <>
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: jt?.color || '#9ca3af' }} />
                                    <Badge variant="secondary" className="text-xs">
                                        {jt ? (locale === 'th' ? jt.label_th : jt.label_en) : job.job_type}
                                    </Badge>
                                </>
                            )
                        })()}
                        <span className={`text-sm font-medium ${priority.color}`}>{priority.label}</span>
                        {isFromCrm && (
                            <Badge className="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border-0 gap-1">
                                <ExternalLink className="h-2.5 w-2.5" /> CRM
                            </Badge>
                        )}
                    </div>
                    <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 truncate">{job.title}</h1>
                    {job.customer_name && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                            <User className="h-3.5 w-3.5 inline mr-1" />{job.customer_name}
                        </p>
                    )}
                    {isFromCrm && (
                        <Link href={`/crm/${job.crm_lead_id}`} className="text-xs text-blue-500 hover:underline mt-1 inline-block">
                            {locale === 'th' ? '← ดู CRM Lead' : '← View CRM Lead'}
                        </Link>
                    )}
                </div>
                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            {/* Status Changer */}
            <Card>
                <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                            {locale === 'th' ? 'สถานะ:' : 'Status:'}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {statuses.map(s => {
                                const cfg = getStatusConfig(settings, job.job_type as JobType, s)
                                const isActive = job.status === s
                                return (
                                    <button
                                        key={s}
                                        onClick={() => !isActive && handleStatusChange(s)}
                                        disabled={isPending}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${isActive
                                            ? 'text-white shadow-sm scale-105'
                                            : 'hover:scale-105 border border-zinc-200 dark:border-zinc-700'
                                            }`}
                                        style={isActive ? { backgroundColor: cfg.color } : { color: cfg.color }}
                                    >
                                        {locale === 'th' ? cfg.labelTh : cfg.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Per-Status Tags */}
            <Card>
                <CardContent className="py-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-zinc-400" />
                        <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                            {locale === 'th' ? 'แท็ก' : 'Tags'}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: currentStatusCfg.color, color: currentStatusCfg.color }}>
                            {locale === 'th' ? currentStatusCfg.labelTh : currentStatusCfg.label}
                        </Badge>
                    </div>

                    {localTags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {localTags.map(tagValue => {
                                const tagSetting = settings.find(s => s.value === tagValue && s.category.startsWith('tag_'))
                                const tagColor = tagSetting?.color || '#8b5cf6'
                                return (
                                    <Badge key={tagValue} className="text-[10px] px-2 py-0.5 border" style={{ backgroundColor: `${tagColor}18`, color: tagColor, borderColor: `${tagColor}40` }}>
                                        {tagSetting ? getSettingLabel(tagSetting) : tagValue}
                                    </Badge>
                                )
                            })}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {availableStatusTags.map(tagSetting => {
                            const isSelected = localTags.includes(tagSetting.value)
                            const tagColor = tagSetting.color || '#8b5cf6'
                            return (
                                <Button key={tagSetting.id} variant="outline" size="sm"
                                    onClick={() => handleToggleTag(tagSetting.value)}
                                    disabled={isPending}
                                    className="text-xs transition-all"
                                    style={isSelected ? { backgroundColor: `${tagColor}20`, color: tagColor, borderColor: `${tagColor}60` } : {}}
                                >
                                    <span className="h-2.5 w-2.5 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: tagColor }} />
                                    {getSettingLabel(tagSetting)}
                                </Button>
                            )
                        })}
                        {availableStatusTags.length === 0 && (
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                {locale === 'th' ? 'ยังไม่มีแท็กสำหรับสถานะนี้ — ไปตั้งค่าในหน้า Settings' : 'No tags for this status — set up in Settings'}
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left: Details */}
                <div className="lg:col-span-3 space-y-4">

                    {/* ============================================ */}
                    {/* CRM Cards — CRM-style UI with edit support */}
                    {/* Order: Tags → Staff → Customer → Event → Financial */}
                    {/* ============================================ */}
                    {isFromCrm && lead && (
                        <>
                            {/* 1. CRM Tags */}
                            {(lead.tags || []).length > 0 && (
                                <CrmCard
                                    title={locale === 'th' ? 'แท็ก' : 'Tags'}
                                    icon={<Tag className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                                    iconBg="bg-blue-50 dark:bg-blue-950/40"
                                >
                                    <div className="space-y-3">
                                        {(() => {
                                            const generalTags = (lead.tags || []).filter((t: string) =>
                                                crmSettings.find(s => s.category === 'tag' && s.value === t)
                                            )
                                            if (generalTags.length === 0) return null
                                            return (
                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-xs text-zinc-500 font-medium">{locale === 'th' ? 'แท็กทั่วไป' : 'General Tags'}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {generalTags.map((tagValue: string) => {
                                                            const tagSetting = crmSettings.find(s => s.category === 'tag' && s.value === tagValue)
                                                            const tagColor = tagSetting?.color || '#3b82f6'
                                                            return (
                                                                <Badge key={tagValue} className="text-[10px] px-2 py-0.5 border" style={{ backgroundColor: `${tagColor}18`, color: tagColor, borderColor: `${tagColor}40` }}>
                                                                    {tagSetting ? getSettingLabel(tagSetting) : tagValue}
                                                                </Badge>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })()}

                                        {(() => {
                                            const statusTags = (lead.tags || []).filter((t: string) =>
                                                crmSettings.find(s => s.category?.startsWith('tag_') && s.category !== 'tag' && s.value === t)
                                            )
                                            if (statusTags.length === 0) return null
                                            return (
                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-xs text-zinc-500 font-medium">{locale === 'th' ? 'แท็กตามสถานะ' : 'Status Tags'}</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {statusTags.map((tagValue: string) => {
                                                            const tagSetting = crmSettings.find(s => s.category?.startsWith('tag_') && s.value === tagValue)
                                                            const tagColor = tagSetting?.color || '#8b5cf6'
                                                            return (
                                                                <Badge key={tagValue} className="text-[10px] px-2 py-0.5 border" style={{ backgroundColor: `${tagColor}18`, color: tagColor, borderColor: `${tagColor}40` }}>
                                                                    {tagSetting ? getSettingLabel(tagSetting) : tagValue}
                                                                </Badge>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                </CrmCard>
                            )}

                            {/* 2. Staff Assignments */}
                            <CrmCard
                                title={locale === 'th' ? 'ผู้ดูแล' : 'Staff Assignments'}
                                icon={<UsersIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />}
                                iconBg="bg-amber-50 dark:bg-amber-950/40"
                            >
                                <div className="space-y-4">
                                    {/* Sales — read-only */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Briefcase className="h-3.5 w-3.5 text-blue-500" />
                                            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{locale === 'th' ? 'ฝ่ายขาย (Sale)' : 'Sale'}</span>
                                            <Lock className="h-2.5 w-2.5 text-zinc-300" />
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {(lead.assigned_sales || []).length > 0
                                                ? (lead.assigned_sales || []).map((uid: string) => (
                                                    <Badge key={uid} variant="secondary" className="text-xs">{getUserName(uid)}</Badge>
                                                ))
                                                : <span className="text-sm text-zinc-400">—</span>
                                            }
                                        </div>
                                    </div>

                                    {/* Graphics — dropdown */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Palette className="h-3.5 w-3.5 text-violet-500" />
                                            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{locale === 'th' ? 'กราฟิก (Graphic)' : 'Graphic'}</span>
                                        </div>
                                        <DropdownMenu onOpenChange={(open) => {
                                            if (!open) {
                                                startTransition(async () => {
                                                    const fd = new FormData()
                                                    fd.set('assigned_to', localAssignedTo.join(','))
                                                    await updateJob(job.id, fd)
                                                    if (job.crm_lead_id) {
                                                        const crmFd = new FormData()
                                                        crmFd.set('assigned_graphics', localAssignedTo.join(','))
                                                        await updateLead(job.crm_lead_id, crmFd)
                                                    }
                                                })
                                            }
                                        }}>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" size="sm" className="w-full justify-between text-sm font-normal h-9" disabled={isPending}>
                                                    <span className="truncate text-left">
                                                        {localAssignedTo.length > 0
                                                            ? localAssignedTo.map(id => getUserName(id)).join(', ')
                                                            : (locale === 'th' ? 'เลือกกราฟิก...' : 'Select graphic...')
                                                        }
                                                    </span>
                                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="w-56" align="start">
                                                <DropdownMenuLabel className="text-xs">{locale === 'th' ? 'เลือกกราฟิก' : 'Select Graphic'}</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                {users.map(user => (
                                                    <DropdownMenuCheckboxItem
                                                        key={user.id}
                                                        checked={localAssignedTo.includes(user.id)}
                                                        onCheckedChange={() => {
                                                            setLocalAssignedTo(prev =>
                                                                prev.includes(user.id)
                                                                    ? prev.filter(id => id !== user.id)
                                                                    : [...prev, user.id]
                                                            )
                                                        }}
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        {user.full_name || user.id}
                                                    </DropdownMenuCheckboxItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    {/* Staff — dropdown */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Wrench className="h-3.5 w-3.5 text-emerald-500" />
                                            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{locale === 'th' ? 'พนักงาน (Staff)' : 'Staff'}</span>
                                        </div>
                                        <DropdownMenu onOpenChange={(open) => {
                                            if (!open) {
                                                startTransition(async () => {
                                                    const fd = new FormData()
                                                    fd.set('assigned_to', localAssignedTo.join(','))
                                                    await updateJob(job.id, fd)
                                                    if (job.crm_lead_id) {
                                                        const crmFd = new FormData()
                                                        crmFd.set('assigned_staff', localAssignedTo.join(','))
                                                        await updateLead(job.crm_lead_id, crmFd)
                                                    }
                                                })
                                            }
                                        }}>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="outline" size="sm" className="w-full justify-between text-sm font-normal h-9" disabled={isPending}>
                                                    <span className="truncate text-left">
                                                        {localAssignedTo.length > 0
                                                            ? localAssignedTo.map(id => getUserName(id)).join(', ')
                                                            : (locale === 'th' ? 'เลือกพนักงาน...' : 'Select staff...')
                                                        }
                                                    </span>
                                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent className="w-56" align="start">
                                                <DropdownMenuLabel className="text-xs">{locale === 'th' ? 'เลือกพนักงาน' : 'Select Staff'}</DropdownMenuLabel>
                                                <DropdownMenuSeparator />
                                                {users.map(user => (
                                                    <DropdownMenuCheckboxItem
                                                        key={user.id}
                                                        checked={localAssignedTo.includes(user.id)}
                                                        onCheckedChange={() => {
                                                            setLocalAssignedTo(prev =>
                                                                prev.includes(user.id)
                                                                    ? prev.filter(id => id !== user.id)
                                                                    : [...prev, user.id]
                                                            )
                                                        }}
                                                        onSelect={e => e.preventDefault()}
                                                    >
                                                        {user.full_name || user.id}
                                                    </DropdownMenuCheckboxItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </CrmCard>

                            {/* 3. Customer Info */}
                            <CrmCard
                                title={locale === 'th' ? 'ข้อมูลลูกค้า' : 'Customer Info'}
                                icon={<User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
                                iconBg="bg-blue-50 dark:bg-blue-950/40"
                                onEdit={() => setEditingCrmCard('customer')}
                                isEditing={editingCrmCard === 'customer'}
                            >
                                {editingCrmCard === 'customer' ? (
                                    <div className="space-y-4">
                                        <CrmEditField label={locale === 'th' ? 'ชื่อลูกค้า' : 'Customer Name'} value={crmForm.customer_name} onChange={v => updateCrmForm('customer_name', v)} />
                                        <CrmEditField label="LINE" value={crmForm.customer_line} onChange={v => updateCrmForm('customer_line', v)} placeholder="@line_id" />
                                        <CrmEditField label={locale === 'th' ? 'โทรศัพท์' : 'Phone'} value={crmForm.customer_phone} onChange={v => updateCrmForm('customer_phone', v)} placeholder="0xx-xxx-xxxx" />
                                        <CrmEditSelect
                                            label={locale === 'th' ? 'ประเภทลูกค้า' : 'Customer Type'}
                                            value={crmForm.customer_type}
                                            onChange={v => updateCrmForm('customer_type', v)}
                                            options={customerTypes.map(s => ({ value: s.value, label: getSettingLabel(s) }))}
                                            placeholder={locale === 'th' ? 'เลือกประเภท...' : 'Select type...'}
                                        />
                                        <CrmEditSelect
                                            label={locale === 'th' ? 'ช่องทาง' : 'Source'}
                                            value={crmForm.lead_source}
                                            onChange={v => updateCrmForm('lead_source', v)}
                                            options={sources.map(s => ({ value: s.value, label: getSettingLabel(s) }))}
                                            placeholder={locale === 'th' ? 'เลือกช่องทาง...' : 'Select source...'}
                                        />
                                        <CrmEditSelect
                                            label={locale === 'th' ? 'แพ็กเกจ' : 'Package'}
                                            value={crmForm.package_name}
                                            onChange={v => updateCrmForm('package_name', v)}
                                            options={packages.map(s => ({ value: s.value, label: getSettingLabel(s) }))}
                                            placeholder={locale === 'th' ? 'เลือกแพ็กเกจ...' : 'Select package...'}
                                        />
                                        <CrmCardEditActions section="customer" />
                                    </div>
                                ) : (
                                    <>
                                        <InfoRow label={locale === 'th' ? 'ชื่อลูกค้า' : 'Customer'} value={lead.customer_name} />
                                        <InfoRow label="LINE" value={lead.customer_line} />
                                        <InfoRow label={locale === 'th' ? 'โทรศัพท์' : 'Phone'} value={lead.customer_phone} />
                                        <InfoRow label={locale === 'th' ? 'ประเภท' : 'Type'} value={typeSetting ? getSettingLabel(typeSetting) : lead.customer_type} />
                                        <InfoRow label={locale === 'th' ? 'ช่องทาง' : 'Source'} value={sourceSetting ? getSettingLabel(sourceSetting) : lead.lead_source} />
                                        <InfoRow label={locale === 'th' ? 'แพ็กเกจ' : 'Package'} value={pkgSetting ? getSettingLabel(pkgSetting) : lead.package_name} />
                                    </>
                                )}
                            </CrmCard>

                            {/* 4. Event Info */}
                            <CrmCard
                                title={locale === 'th' ? 'ข้อมูลงาน/อีเวนต์' : 'Event Info'}
                                icon={<Calendar className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
                                iconBg="bg-violet-50 dark:bg-violet-950/40"
                                onEdit={() => setEditingCrmCard('event')}
                                isEditing={editingCrmCard === 'event'}
                            >
                                {editingCrmCard === 'event' ? (
                                    <div className="space-y-4">
                                        <CrmEditField label={locale === 'th' ? 'วันงาน' : 'Event Date'} value={crmForm.event_date} onChange={v => updateCrmForm('event_date', v)} type="date" />
                                        <CrmEditField label={locale === 'th' ? 'วันสิ้นสุด' : 'End Date'} value={crmForm.event_end_date} onChange={v => updateCrmForm('event_end_date', v)} type="date" />
                                        <CrmEditField label={locale === 'th' ? 'สถานที่' : 'Location'} value={crmForm.event_location} onChange={v => updateCrmForm('event_location', v)} />
                                        <div>
                                            <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{locale === 'th' ? 'รายละเอียดงาน' : 'Details'}</Label>
                                            <Textarea value={crmForm.event_details} onChange={e => updateCrmForm('event_details', e.target.value)} rows={3} className="text-sm" />
                                        </div>
                                        <CrmCardEditActions section="event" />
                                    </div>
                                ) : (
                                    <>
                                        <InfoRow label={locale === 'th' ? 'วันงาน' : 'Event Date'} value={lead.event_date ? new Date(lead.event_date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB') : null} />
                                        <InfoRow label={locale === 'th' ? 'วันสิ้นสุด' : 'End Date'} value={lead.event_end_date ? new Date(lead.event_end_date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB') : null} />
                                        {lead.event_date && lead.event_end_date && (
                                            <div className="flex justify-between items-start gap-4">
                                                <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0 w-28">{locale === 'th' ? 'ระยะเวลา' : 'Duration'}</span>
                                                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-xs">
                                                    {(() => {
                                                        const days = Math.max(1, Math.round((new Date(lead.event_end_date).getTime() - new Date(lead.event_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
                                                        return `${days} ${locale === 'th' ? 'วัน' : days === 1 ? 'day' : 'days'}`
                                                    })()}
                                                </Badge>
                                            </div>
                                        )}
                                        <InfoRow label={locale === 'th' ? 'สถานที่' : 'Location'} value={lead.event_location} />
                                        <InfoRow label={locale === 'th' ? 'รายละเอียด' : 'Details'} value={lead.event_details} />
                                    </>
                                )}
                            </CrmCard>

                            {/* 5. Financial Info */}
                            <CrmCard
                                title={locale === 'th' ? 'ข้อมูลการเงิน' : 'Financial Info'}
                                icon={<DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
                                iconBg="bg-emerald-50 dark:bg-emerald-950/40"
                                onEdit={() => setEditingCrmCard('financial')}
                                isEditing={editingCrmCard === 'financial'}
                            >
                                {editingCrmCard === 'financial' ? (() => {
                                    const basePrice = crmForm.confirmed_price || crmForm.quoted_price || 0
                                    const vatAmount = crmForm.vat_mode === 'excluded' ? basePrice * 0.07
                                        : crmForm.vat_mode === 'included' ? basePrice - (basePrice / 1.07) : 0
                                    const priceBeforeVat = crmForm.vat_mode === 'included' ? basePrice / 1.07 : basePrice
                                    const whtAmount = priceBeforeVat * (crmForm.wht_rate / 100)
                                    const netTotal = crmForm.vat_mode === 'excluded'
                                        ? basePrice + vatAmount - whtAmount
                                        : basePrice - whtAmount

                                    return (
                                        <div className="space-y-4">
                                            <CrmEditField label={`${locale === 'th' ? 'ราคาเสนอ' : 'Quoted Price'} (฿)`} value={String(crmForm.quoted_price)} onChange={v => updateCrmForm('quoted_price', Number(v) || 0)} type="number" />
                                            <CrmEditField label={`${locale === 'th' ? 'ราคาตกลง' : 'Confirmed Price'} (฿)`} value={String(crmForm.confirmed_price)} onChange={v => updateCrmForm('confirmed_price', Number(v) || 0)} type="number" />
                                            <CrmEditField label={`${locale === 'th' ? 'มัดจำ' : 'Deposit'} (฿)`} value={String(crmForm.deposit)} onChange={v => updateCrmForm('deposit', Number(v) || 0)} type="number" />

                                            {/* Tax Settings */}
                                            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
                                                <p className="text-xs font-semibold text-zinc-500 mb-3">{locale === 'th' ? '💰 การคำนวณภาษี' : '💰 Tax Calculation'}</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <CrmEditSelect
                                                        label={locale === 'th' ? 'VAT' : 'VAT Mode'}
                                                        value={crmForm.vat_mode}
                                                        onChange={v => updateCrmForm('vat_mode', v)}
                                                        options={[
                                                            { value: 'none', label: locale === 'th' ? 'ไม่มี VAT' : 'No VAT' },
                                                            { value: 'included', label: locale === 'th' ? 'รวม VAT แล้ว' : 'VAT Included' },
                                                            { value: 'excluded', label: locale === 'th' ? 'ยังไม่รวม VAT' : 'VAT Excluded' },
                                                        ]}
                                                    />
                                                    <CrmEditSelect
                                                        label={locale === 'th' ? 'หัก ณ ที่จ่าย' : 'WHT Rate'}
                                                        value={String(crmForm.wht_rate)}
                                                        onChange={v => updateCrmForm('wht_rate', Number(v))}
                                                        options={[
                                                            { value: '0', label: locale === 'th' ? 'ไม่หัก' : 'None' },
                                                            { value: '1', label: '1%' },
                                                            { value: '2', label: '2%' },
                                                            { value: '3', label: '3%' },
                                                            { value: '5', label: '5%' },
                                                        ]}
                                                    />
                                                </div>
                                                {/* Tax Summary Preview */}
                                                {(crmForm.vat_mode !== 'none' || crmForm.wht_rate > 0) && basePrice > 0 && (
                                                    <div className="mt-3 p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-1.5">
                                                        {crmForm.vat_mode !== 'none' && (
                                                            <>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-zinc-500">{locale === 'th' ? 'ราคาก่อน VAT' : 'Before VAT'}</span>
                                                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">฿{priceBeforeVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-zinc-500">VAT 7%</span>
                                                                    <span className="font-medium text-blue-600 dark:text-blue-400">+฿{vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                                </div>
                                                            </>
                                                        )}
                                                        {crmForm.wht_rate > 0 && (
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-zinc-500">{locale === 'th' ? `หัก ณ ที่จ่าย ${crmForm.wht_rate}%` : `WHT ${crmForm.wht_rate}%`}</span>
                                                                <span className="font-medium text-red-600 dark:text-red-400">-฿{whtAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        )}
                                                        <div className="border-t border-emerald-200 dark:border-emerald-800 pt-1.5 flex justify-between text-xs">
                                                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{locale === 'th' ? 'ยอดสุทธิ' : 'Net Total'}</span>
                                                            <span className="font-bold text-emerald-700 dark:text-emerald-300">฿{netTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Installments (read-only in edit mode) */}
                                            {installments.length > 0 && (
                                                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
                                                    <p className="text-xs font-semibold text-zinc-500 mb-2">{locale === 'th' ? '📋 งวดชำระเงิน' : '📋 Installments'}</p>
                                                    {installments.map((inst: { installment_number: number; amount: number; due_date: string | null; is_paid: boolean }) => (
                                                        <div key={inst.installment_number} className="flex items-center justify-between py-1.5 border-b border-zinc-50 dark:border-zinc-800 last:border-0">
                                                            <span className="text-xs text-zinc-500">{locale === 'th' ? `งวดที่ ${inst.installment_number}` : `#${inst.installment_number}`}</span>
                                                            <div className="flex items-center gap-3">
                                                                <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{formatPrice(inst.amount)}</span>
                                                                {inst.is_paid && <Badge className="text-[9px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-0">{locale === 'th' ? 'ชำระแล้ว' : 'Paid'}</Badge>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Quotation Ref */}
                                            <CrmEditField label={locale === 'th' ? 'เลขใบเสนอราคา' : 'Quotation Ref'} value={crmForm.quotation_ref} onChange={v => updateCrmForm('quotation_ref', v)} />

                                            {/* Notes */}
                                            <div>
                                                <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{locale === 'th' ? 'หมายเหตุ' : 'Notes'}</Label>
                                                <Textarea
                                                    value={crmForm.notes}
                                                    onChange={e => updateCrmForm('notes', e.target.value)}
                                                    rows={3}
                                                    className="text-sm"
                                                    placeholder={locale === 'th' ? 'หมายเหตุเพิ่มเติม...' : 'Additional notes...'}
                                                />
                                            </div>

                                            <CrmCardEditActions section="financial" />
                                        </div>
                                    )
                                })() : (
                                    (() => {
                                        const basePrice = lead.confirmed_price || lead.quoted_price || 0
                                        const vatMode = lead.vat_mode || 'none'
                                        const whtRate = lead.wht_rate || 0
                                        const vatAmount = vatMode === 'excluded' ? basePrice * 0.07
                                            : vatMode === 'included' ? basePrice - (basePrice / 1.07) : 0
                                        const priceBeforeVat = vatMode === 'included' ? basePrice / 1.07 : basePrice
                                        const whtAmount = priceBeforeVat * (whtRate / 100)
                                        const netTotal = vatMode === 'excluded'
                                            ? basePrice + vatAmount - whtAmount
                                            : basePrice - whtAmount
                                        const totalPaid = (lead.deposit || 0) + installments.filter((i: { is_paid: boolean }) => i.is_paid).reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0)
                                        const outstanding = netTotal - totalPaid

                                        return (
                                            <>
                                                <InfoRow label={locale === 'th' ? 'ราคาเสนอ' : 'Quoted'} value={formatPrice(lead.quoted_price)} />
                                                <InfoRow label={locale === 'th' ? 'ราคาตกลง' : 'Confirmed'} value={formatPrice(lead.confirmed_price)} />
                                                <InfoRow label={locale === 'th' ? 'มัดจำ' : 'Deposit'} value={formatPrice(lead.deposit)} />

                                                {/* Tax Summary */}
                                                {(vatMode !== 'none' || whtRate > 0) && basePrice > 0 && (
                                                    <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-1.5">
                                                        {vatMode !== 'none' && (
                                                            <>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-zinc-500">{locale === 'th' ? 'ราคาก่อน VAT' : 'Before VAT'}</span>
                                                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">฿{priceBeforeVat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                                </div>
                                                                <div className="flex justify-between text-xs">
                                                                    <span className="text-zinc-500">VAT 7% ({vatMode === 'included' ? (locale === 'th' ? 'รวมแล้ว' : 'incl.') : (locale === 'th' ? 'ยังไม่รวม' : 'excl.')})</span>
                                                                    <span className="font-medium text-blue-600 dark:text-blue-400">{vatMode === 'excluded' ? '+' : ''}฿{vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                                </div>
                                                            </>
                                                        )}
                                                        {whtRate > 0 && (
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-zinc-500">{locale === 'th' ? `หัก ณ ที่จ่าย ${whtRate}%` : `WHT ${whtRate}%`}</span>
                                                                <span className="font-medium text-red-600 dark:text-red-400">-฿{whtAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                            </div>
                                                        )}
                                                        <div className="border-t border-emerald-200 dark:border-emerald-800 pt-1.5 flex justify-between text-xs">
                                                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">{locale === 'th' ? 'ยอดสุทธิ' : 'Net Total'}</span>
                                                            <span className="font-bold text-emerald-700 dark:text-emerald-300">฿{netTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Installments */}
                                                {installments.length > 0 && (
                                                    <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-3">
                                                        <p className="text-xs font-semibold text-zinc-500 mb-2">{locale === 'th' ? '📋 งวดชำระเงิน' : '📋 Installments'}</p>
                                                        {installments.map((inst: { installment_number: number; amount: number; due_date: string | null; is_paid: boolean }) => (
                                                            <div key={inst.installment_number} className="flex items-center justify-between py-1.5 border-b border-zinc-50 dark:border-zinc-800 last:border-0">
                                                                <span className="text-xs text-zinc-500">{locale === 'th' ? `งวดที่ ${inst.installment_number}` : `#${inst.installment_number}`}</span>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{formatPrice(inst.amount)}</span>
                                                                    {inst.is_paid && <Badge className="text-[9px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-0">{locale === 'th' ? 'ชำระแล้ว' : 'Paid'}</Badge>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Outstanding Balance */}
                                                {basePrice > 0 && (
                                                    <div className={`p-3 rounded-lg ${outstanding <= 0 ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30' : 'bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30'}`}>
                                                        <div className="flex justify-between items-center">
                                                            <span className={`text-xs font-semibold ${outstanding <= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                                                                {outstanding <= 0 ? (locale === 'th' ? '✅ ชำระครบ' : '✅ Fully Paid') : (locale === 'th' ? '💳 ยอดค้างชำระ' : '💳 Outstanding')}
                                                            </span>
                                                            <span className={`text-sm font-bold ${outstanding <= 0 ? 'text-emerald-600' : 'text-amber-700 dark:text-amber-300'}`}>
                                                                ฿{outstanding.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                                                            <span>{locale === 'th' ? 'ชำระแล้ว' : 'Paid'}: ฿{totalPaid.toLocaleString()}</span>
                                                            <span>{locale === 'th' ? 'ยอดสุทธิ' : 'Net'}: ฿{netTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Quotation Ref */}
                                                <InfoRow label={locale === 'th' ? 'เลขใบเสนอราคา' : 'Quotation Ref'} value={lead.quotation_ref} />

                                                {/* Notes */}
                                                {lead.notes && <InfoRow label={locale === 'th' ? 'หมายเหตุ' : 'Notes'} value={lead.notes} />}
                                            </>
                                        )
                                    })()
                                )}
                            </CrmCard>

                            {/* Link to CRM */}
                            <Link href={`/crm/${job.crm_lead_id}`} className="inline-flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600 hover:underline">
                                <ExternalLink className="h-3.5 w-3.5" />
                                {locale === 'th' ? 'เปิด CRM Lead เพื่อดูข้อมูลทั้งหมด' : 'Open CRM Lead for full details'}
                            </Link>
                        </>
                    )}

                    {/* ============================================ */}
                    {/* Job's Own Editable Cards */}
                    {/* ============================================ */}

                    {/* Job Info */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between py-4">
                            <CardTitle className="text-base">{locale === 'th' ? 'ข้อมูลงาน' : 'Job Info'}</CardTitle>
                            {editing !== 'info' ? (
                                <Button variant="ghost" size="sm" onClick={() => startEdit('info')}>
                                    <Edit2 className="h-3.5 w-3.5 mr-1" />{locale === 'th' ? 'แก้ไข' : 'Edit'}
                                </Button>
                            ) : (
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></Button>
                                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => saveEdit('info')} disabled={isPending}>
                                        <Save className="h-3.5 w-3.5 mr-1" />{locale === 'th' ? 'บันทึก' : 'Save'}
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-3 pt-0">
                            {editing === 'info' ? (
                                <>
                                    <div className="space-y-1.5">
                                        <Label>{locale === 'th' ? 'ชื่องาน' : 'Title'}</Label>
                                        <Input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>{locale === 'th' ? 'ลำดับความสำคัญ' : 'Priority'}</Label>
                                        <Select value={editForm.priority} onValueChange={v => setEditForm(p => ({ ...p, priority: v }))}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(priorityConfig).map(([k, v]) => (
                                                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>{locale === 'th' ? 'รายละเอียด' : 'Description'}</Label>
                                        <Textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={3} />
                                    </div>
                                </>
                            ) : (
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-zinc-500 dark:text-zinc-400">{locale === 'th' ? 'ชื่องาน' : 'Title'}</span>
                                        <p className="font-medium text-zinc-900 dark:text-zinc-100">{job.title}</p>
                                    </div>
                                    {job.description && (
                                        <div className="col-span-2">
                                            <span className="text-zinc-500 dark:text-zinc-400">{locale === 'th' ? 'รายละเอียด' : 'Description'}</span>
                                            <p className="font-medium text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{job.description}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Checklists — all statuses up to current, previous collapsed */}
                    {(() => {
                        // Get all statuses in pipeline order
                        const allStatuses = getStatusesFromSettings(settings, job.job_type as JobType)
                        const currentIdx = allStatuses.indexOf(job.status)

                        // Statuses to show: current + all previous (that have templates)
                        const visibleStatuses = allStatuses.slice(0, currentIdx + 1)
                        const statusesWithTemplates = visibleStatuses.filter(s =>
                            checklistTemplates.some(t => t.job_type === job.job_type && t.status === s && t.is_active)
                        )

                        if (statusesWithTemplates.length === 0) return null

                        // Get all templates for visible statuses
                        const allVisibleTemplates = checklistTemplates
                            .filter(t => t.job_type === job.job_type && statusesWithTemplates.includes(t.status) && t.is_active)

                        // Overall progress across ALL visible
                        const totalItems = allVisibleTemplates.reduce((sum, t) => sum + t.items.length, 0)
                        const checkedItems = allVisibleTemplates.reduce((sum, t) => {
                            return sum + t.items.filter((_, idx) =>
                                localChecklistItems.some(ci => ci.template_id === t.id && ci.item_index === idx && ci.is_checked)
                            ).length
                        }, 0)
                        const overallPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0

                        return (
                            <>
                                {/* Overall progress header */}
                                <Card>
                                    <CardHeader className="py-3">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-base flex items-center gap-2">
                                                <ListChecks className="h-4 w-4 text-violet-500" />
                                                {locale === 'th' ? 'เช็คลิสต์' : 'Checklist'}
                                            </CardTitle>
                                            <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">{overallPercent}%</span>
                                        </div>
                                        <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 mt-2">
                                            <div
                                                className="h-2 rounded-full transition-all duration-500 bg-violet-500"
                                                style={{ width: `${overallPercent}%` }}
                                            />
                                        </div>
                                    </CardHeader>
                                </Card>

                                {/* Per-status sections (reversed so current is on top) */}
                                {[...statusesWithTemplates].reverse().map(statusValue => {
                                    const isCurrent = statusValue === job.status
                                    const statusConfig = getStatusConfig(settings, job.job_type as JobType, statusValue)
                                    const templates = checklistTemplates
                                        .filter(t => t.job_type === job.job_type && t.status === statusValue && t.is_active)
                                        .sort((a, b) => a.sort_order - b.sort_order)

                                    // Previous statuses start collapsed
                                    const isCollapsed = !isCurrent && !collapsedChecklistStatuses.has(statusValue)
                                    const isExpanded = isCurrent || collapsedChecklistStatuses.has(statusValue)

                                    return (
                                        <Card key={statusValue}>
                                            {/* Status section header — clickable for non-current */}
                                            <CardHeader
                                                className={`py-3 ${!isCurrent ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors' : ''}`}
                                                onClick={!isCurrent ? () => {
                                                    setCollapsedChecklistStatuses(prev => {
                                                        const next = new Set(prev)
                                                        if (next.has(statusValue)) next.delete(statusValue)
                                                        else next.add(statusValue)
                                                        return next
                                                    })
                                                } : undefined}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {!isCurrent && (
                                                        isExpanded
                                                            ? <ChevronUp className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                                            : <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                                    )}
                                                    <span
                                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                                        style={{ backgroundColor: statusConfig.color || '#9ca3af' }}
                                                    />
                                                    <CardTitle className="text-sm font-medium flex-1">
                                                        {locale === 'th' ? statusConfig.labelTh : statusConfig.label}
                                                    </CardTitle>
                                                    {(() => {
                                                        const sCnt = templates.reduce((s, t) => s + t.items.length, 0)
                                                        const sChk = templates.reduce((s, t) => s + t.items.filter((_, idx) =>
                                                            localChecklistItems.some(ci => ci.template_id === t.id && ci.item_index === idx && ci.is_checked)
                                                        ).length, 0)
                                                        const sPct = sCnt > 0 ? Math.round((sChk / sCnt) * 100) : 0
                                                        return (
                                                            <span className={`text-xs font-medium ${sPct === 100 ? 'text-emerald-600' : 'text-blue-600 dark:text-blue-400'}`}>
                                                                {sPct}%
                                                            </span>
                                                        )
                                                    })()}
                                                </div>
                                            </CardHeader>

                                            {/* Expanded content */}
                                            {isExpanded && (
                                                <CardContent className="pt-0 space-y-4 pb-4">
                                                    {templates.map(tmpl => {
                                                        const groupChecked = tmpl.items.filter((_, idx) =>
                                                            localChecklistItems.some(ci => ci.template_id === tmpl.id && ci.item_index === idx && ci.is_checked)
                                                        ).length
                                                        const groupPercent = tmpl.items.length > 0 ? Math.round((groupChecked / tmpl.items.length) * 100) : 0

                                                        return (
                                                            <div key={tmpl.id}>
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                                                        {locale === 'th' ? tmpl.group_name_th : tmpl.group_name_en}
                                                                    </span>
                                                                    <span className="text-[10px] font-medium text-zinc-400">{groupPercent}%</span>
                                                                </div>
                                                                <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1 mb-2">
                                                                    <div
                                                                        className="h-1 rounded-full transition-all duration-500 bg-blue-500"
                                                                        style={{ width: `${groupPercent}%` }}
                                                                    />
                                                                </div>
                                                                <div className="space-y-0.5">
                                                                    {tmpl.items.map((item, idx) => {
                                                                        const isChecked = localChecklistItems.some(
                                                                            ci => ci.template_id === tmpl.id && ci.item_index === idx && ci.is_checked
                                                                        )
                                                                        return (
                                                                            <button
                                                                                key={idx}
                                                                                className="w-full flex items-center gap-3 py-1.5 px-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left group"
                                                                                onClick={() => {
                                                                                    const newChecked = !isChecked
                                                                                    setLocalChecklistItems(prev => {
                                                                                        if (newChecked) {
                                                                                            const exists = prev.find(ci => ci.template_id === tmpl.id && ci.item_index === idx)
                                                                                            if (exists) {
                                                                                                return prev.map(ci => ci.template_id === tmpl.id && ci.item_index === idx ? { ...ci, is_checked: true } : ci)
                                                                                            }
                                                                                            return [...prev, { id: `temp-${Date.now()}`, job_id: job.id, template_id: tmpl.id, item_index: idx, is_checked: true, checked_by: null, checked_at: new Date().toISOString() }]
                                                                                        } else {
                                                                                            return prev.map(ci => ci.template_id === tmpl.id && ci.item_index === idx ? { ...ci, is_checked: false } : ci)
                                                                                        }
                                                                                    })
                                                                                    startTransition(() => {
                                                                                        toggleChecklistItem(job.id, tmpl.id, idx, newChecked)
                                                                                    })
                                                                                }}
                                                                            >
                                                                                {isChecked ? (
                                                                                    <CheckSquare className="h-5 w-5 text-blue-500 shrink-0" />
                                                                                ) : (
                                                                                    <Square className="h-5 w-5 text-zinc-300 dark:text-zinc-600 shrink-0 group-hover:text-zinc-400" />
                                                                                )}
                                                                                <span className={`text-sm ${isChecked
                                                                                    ? 'line-through text-zinc-400 dark:text-zinc-500'
                                                                                    : 'text-zinc-700 dark:text-zinc-300'
                                                                                    }`}>
                                                                                    {locale === 'th' ? item.label_th : item.label_en}
                                                                                </span>
                                                                            </button>
                                                                        )
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </CardContent>
                                            )}
                                        </Card>
                                    )
                                })}
                            </>
                        )
                    })()}

                    {/* Notes */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between py-4">
                            <CardTitle className="text-base">{locale === 'th' ? 'หมายเหตุ' : 'Notes'}</CardTitle>
                            {editing !== 'notes' ? (
                                <Button variant="ghost" size="sm" onClick={() => startEdit('notes')}>
                                    <Edit2 className="h-3.5 w-3.5 mr-1" />{locale === 'th' ? 'แก้ไข' : 'Edit'}
                                </Button>
                            ) : (
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></Button>
                                    <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white" onClick={() => saveEdit('notes')} disabled={isPending}>
                                        <Save className="h-3.5 w-3.5 mr-1" />{locale === 'th' ? 'บันทึก' : 'Save'}
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="pt-0">
                            {editing === 'notes' ? (
                                <Textarea value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={4} placeholder={locale === 'th' ? 'หมายเหตุ...' : 'Notes...'} />
                            ) : (
                                <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                                    {job.notes || (locale === 'th' ? 'ไม่มีหมายเหตุ' : 'No notes')}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right: Activity Timeline */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-base flex items-center gap-2">
                                {(() => {
                                    const jt = jobTypes.find(t => t.value === job.job_type)
                                    return (
                                        <>
                                            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: jt?.color || '#9ca3af' }} />
                                            {locale === 'th'
                                                ? `ไทม์ไลน์ — ${jt?.label_th || job.job_type}`
                                                : `Timeline — ${jt?.label_en || job.job_type}`
                                            }
                                        </>
                                    )
                                })()}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-4">
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <Select value={activityType} onValueChange={setActivityType}>
                                        <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="note">{locale === 'th' ? 'โน้ต' : 'Note'}</SelectItem>
                                            <SelectItem value="call">{locale === 'th' ? 'โทร' : 'Call'}</SelectItem>
                                            <SelectItem value="line">{locale === 'th' ? 'ไลน์' : 'LINE'}</SelectItem>
                                            <SelectItem value="email">{locale === 'th' ? 'อีเมล' : 'Email'}</SelectItem>
                                            <SelectItem value="meeting">{locale === 'th' ? 'ประชุม' : 'Meeting'}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input value={activityNote} onChange={e => setActivityNote(e.target.value)} className="h-8 text-xs" placeholder={locale === 'th' ? 'เพิ่มโน้ต...' : 'Add note...'} onKeyDown={e => e.key === 'Enter' && handleAddActivity()} />
                                    <Button size="sm" className="h-8 px-2 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleAddActivity} disabled={isPending || !activityNote.trim()}>
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-3 max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                                {activities.map(activity => {
                                    const icon = activityIcons[activity.activity_type] || activityIcons.note
                                    const userName = activity.profiles?.full_name || '—'
                                    const time = new Date(activity.created_at).toLocaleString(locale === 'th' ? 'th-TH' : 'en-US', {
                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                    })
                                    return (
                                        <div key={activity.id} className="flex gap-3">
                                            <div className="flex flex-col items-center">
                                                <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${activity.activity_type === 'status_change'
                                                    ? 'bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400'
                                                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                                                    }`}>
                                                    {icon}
                                                </div>
                                                <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 my-1" />
                                            </div>
                                            <div className="flex-1 min-w-0 pb-3">
                                                <p className="text-sm text-zinc-700 dark:text-zinc-300">{activity.description}</p>
                                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{userName} · {time}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                                {activities.length === 0 && (
                                    <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-4">
                                        {locale === 'th' ? 'ยังไม่มีกิจกรรม' : 'No activities yet'}
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Meta Info */}
                    <Card>
                        <CardContent className="py-4 space-y-2 text-xs text-zinc-500 dark:text-zinc-400">
                            <div className="flex justify-between">
                                <span>{locale === 'th' ? 'สร้างเมื่อ' : 'Created'}</span>
                                <span>{new Date(job.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US')}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>{locale === 'th' ? 'อัปเดตล่าสุด' : 'Updated'}</span>
                                <span>{new Date(job.updated_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US')}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>ID</span>
                                <span className="font-mono text-[10px]">{job.id.slice(0, 8)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

