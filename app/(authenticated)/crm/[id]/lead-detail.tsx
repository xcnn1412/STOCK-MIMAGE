'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft, Phone, MessageSquare, Mail, Pencil, Save, X,
  FileText, ExternalLink, Clock, User, Calendar, MapPin,
  DollarSign, Package, AlertCircle, Trash2, Tag, Archive, ArchiveRestore,
  Users, Briefcase, Palette, Wrench, ChevronDown
} from 'lucide-react'
import {
  updateLeadStatus, updateLead, createActivity, createEventFromLead, deleteLead,
  archiveLead, unarchiveLead
} from '../actions'
import { STATUS_CONFIG, ALL_STATUSES, type CrmLead, type CrmSetting, type LeadStatus } from '../crm-dashboard'
import { useLocale } from '@/lib/i18n/context'

interface SystemUser {
  id: string
  full_name: string | null
  department: string | null
}

interface LeadDetailProps {
  lead: CrmLead
  activities: Array<{
    id: string
    created_at: string
    activity_type: string
    description: string | null
    old_status: string | null
    new_status: string | null
    profiles?: { full_name: string | null } | null
  }>
  settings: CrmSetting[]
  users: SystemUser[]
}

export default function LeadDetail({ lead, activities, settings, users }: LeadDetailProps) {
  const router = useRouter()
  const { locale, t } = useLocale()
  const tc = t.crm.detail
  const ta = t.crm.activity
  const ts = t.crm.statuses
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activityType, setActivityType] = useState('note')
  const [activityDesc, setActivityDesc] = useState('')
  const [addingActivity, setAddingActivity] = useState(false)
  const [staffSaving, setStaffSaving] = useState(false)
  // Local state for staff assignments — batch save on dropdown close
  const [localSales, setLocalSales] = useState<string[]>(lead.assigned_sales || [])
  const [localGraphics, setLocalGraphics] = useState<string[]>(lead.assigned_graphics || [])
  const [localStaff, setLocalStaff] = useState<string[]>(lead.assigned_staff || [])

  const getStatusLabel = (status: string) => {
    return ts[status] || STATUS_CONFIG[status as LeadStatus]?.label || status
  }

  const getSettingLabel = (setting: CrmSetting) => {
    return locale === 'th' ? setting.label_th : setting.label_en
  }

  // ---------- Editable form state ----------
  const [form, setForm] = useState({
    customer_name: lead.customer_name || '',
    customer_line: lead.customer_line || '',
    customer_phone: lead.customer_phone || '',
    customer_type: lead.customer_type || '',
    lead_source: lead.lead_source || '',
    is_returning: lead.is_returning || false,
    event_date: lead.event_date || '',
    event_end_date: lead.event_end_date || '',
    event_location: lead.event_location || '',
    event_details: lead.event_details || '',
    package_name: lead.package_name || '',
    quoted_price: lead.quoted_price || 0,
    confirmed_price: lead.confirmed_price || 0,
    deposit: lead.deposit || 0,
    installment_1: lead.installment_1 || 0,
    installment_2: lead.installment_2 || 0,
    installment_3: lead.installment_3 || 0,
    installment_4: lead.installment_4 || 0,
    installment_1_date: lead.installment_1_date || '',
    installment_2_date: lead.installment_2_date || '',
    installment_3_date: lead.installment_3_date || '',
    installment_4_date: lead.installment_4_date || '',
    installment_1_paid: lead.installment_1_paid || false,
    installment_2_paid: lead.installment_2_paid || false,
    installment_3_paid: lead.installment_3_paid || false,
    installment_4_paid: lead.installment_4_paid || false,
    installment_1_paid_date: lead.installment_1_paid_date || '',
    installment_2_paid_date: lead.installment_2_paid_date || '',
    installment_3_paid_date: lead.installment_3_paid_date || '',
    installment_4_paid_date: lead.installment_4_paid_date || '',
    quotation_ref: lead.quotation_ref || '',
    notes: lead.notes || '',
    tags: lead.tags || [] as string[],
  })

  const updateForm = (key: string, value: string | number | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const statusConfig = STATUS_CONFIG[lead.status]
  const pkgSetting = settings.find(s => s.category === 'package' && s.value === lead.package_name)
  const sourceSetting = settings.find(s => s.category === 'lead_source' && s.value === lead.lead_source)
  const typeSetting = settings.find(s => s.category === 'customer_type' && s.value === lead.customer_type)

  const packages = settings.filter(s => s.category === 'package' && s.is_active)
  const sources = settings.filter(s => s.category === 'lead_source' && s.is_active)
  const customerTypes = settings.filter(s => s.category === 'customer_type' && s.is_active)

  const isOverdue =
    lead.event_date &&
    !['accepted', 'rejected'].includes(lead.status) &&
    new Date(lead.event_date) < new Date()

  // ---------- Handlers ----------
  const handleStatusChange = async (newStatus: string) => {
    setLoading(true)
    await updateLeadStatus(lead.id, newStatus)
    setLoading(false)
    router.refresh()
  }

  const handleSave = async () => {
    setSaving(true)
    const formData = new FormData()
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'tags') {
        formData.set(key, (value as string[]).join(','))
      } else {
        formData.set(key, String(value))
      }
    })
    const result = await updateLead(lead.id, formData)
    setSaving(false)
    if (result.error) {
      alert(result.error)
      return
    }
    setEditing(false)
    router.refresh()
  }

  const handleCancelEdit = () => {
    // Reset form to original lead data
    setForm({
      customer_name: lead.customer_name || '',
      customer_line: lead.customer_line || '',
      customer_phone: lead.customer_phone || '',
      customer_type: lead.customer_type || '',
      lead_source: lead.lead_source || '',
      is_returning: lead.is_returning || false,
      event_date: lead.event_date || '',
      event_end_date: lead.event_end_date || '',
      event_location: lead.event_location || '',
      event_details: lead.event_details || '',
      package_name: lead.package_name || '',
      quoted_price: lead.quoted_price || 0,
      confirmed_price: lead.confirmed_price || 0,
      deposit: lead.deposit || 0,
      installment_1: lead.installment_1 || 0,
      installment_2: lead.installment_2 || 0,
      installment_3: lead.installment_3 || 0,
      installment_4: lead.installment_4 || 0,
      installment_1_date: lead.installment_1_date || '',
      installment_2_date: lead.installment_2_date || '',
      installment_3_date: lead.installment_3_date || '',
      installment_4_date: lead.installment_4_date || '',
      installment_1_paid: lead.installment_1_paid || false,
      installment_2_paid: lead.installment_2_paid || false,
      installment_3_paid: lead.installment_3_paid || false,
      installment_4_paid: lead.installment_4_paid || false,
      installment_1_paid_date: lead.installment_1_paid_date || '',
      installment_2_paid_date: lead.installment_2_paid_date || '',
      installment_3_paid_date: lead.installment_3_paid_date || '',
      installment_4_paid_date: lead.installment_4_paid_date || '',
      quotation_ref: lead.quotation_ref || '',
      notes: lead.notes || '',
      tags: lead.tags || [],
    })
    setEditing(false)
  }

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activityDesc.trim()) return

    setAddingActivity(true)
    const formData = new FormData()
    formData.set('activity_type', activityType)
    formData.set('description', activityDesc)
    await createActivity(lead.id, formData)
    setActivityDesc('')
    setAddingActivity(false)
    router.refresh()
  }

  const handleOpenEvent = async () => {
    setLoading(true)
    const result = await createEventFromLead(lead.id)
    setLoading(false)
    if (result.error) {
      alert(result.error)
      return
    }
    router.refresh()
    if (result.eventId) {
      router.push(`/costs/events/${result.eventId}`)
    }
  }

  const handleDelete = async () => {
    if (!confirm(tc.deleteConfirm)) return
    setLoading(true)
    await deleteLead(lead.id)
    setLoading(false)
    router.push('/crm')
  }

  const handleArchive = async () => {
    setLoading(true)
    if (lead.archived_at) {
      await unarchiveLead(lead.id)
    } else {
      await archiveLead(lead.id)
    }
    setLoading(false)
    router.refresh()
  }

  // Toggle locally (instant, no server call)
  const localToggle = (field: 'assigned_sales' | 'assigned_graphics' | 'assigned_staff', userId: string) => {
    const setters = {
      assigned_sales: setLocalSales,
      assigned_graphics: setLocalGraphics,
      assigned_staff: setLocalStaff,
    }
    const getters = {
      assigned_sales: localSales,
      assigned_graphics: localGraphics,
      assigned_staff: localStaff,
    }
    const current = getters[field]
    const updated = current.includes(userId)
      ? current.filter(id => id !== userId)
      : [...current, userId]
    setters[field](updated)
  }

  // Save to server only when dropdown closes (batch save)
  const saveStaffField = async (field: 'assigned_sales' | 'assigned_graphics' | 'assigned_staff', open: boolean) => {
    if (open) return // only save on close
    const getters = {
      assigned_sales: localSales,
      assigned_graphics: localGraphics,
      assigned_staff: localStaff,
    }
    const original = lead[field] || []
    const current = getters[field]
    // Only save if changed
    if (JSON.stringify([...original].sort()) === JSON.stringify([...current].sort())) return
    setStaffSaving(true)
    const fd = new FormData()
    fd.set(field, current.join(','))
    await updateLead(lead.id, fd)
    setStaffSaving(false)
    router.refresh()
  }

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId)
    return user?.full_name || userId
  }

  // Auto-fill price when package changes
  const handlePackageChange = (val: string) => {
    updateForm('package_name', val)
    const pkg = packages.find(p => p.value === val)
    if (pkg?.price) {
      updateForm('quoted_price', pkg.price)
    }
  }

  const activityIcons: Record<string, typeof Phone> = {
    call: Phone,
    line: MessageSquare,
    email: Mail,
    note: FileText,
    meeting: User,
    status_change: Clock,
  }

  const activityLabels: Record<string, string> = {
    call: ta.call,
    line: ta.line,
    email: ta.email,
    meeting: ta.meeting,
    note: ta.note,
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/crm">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {editing ? form.customer_name : lead.customer_name}
              </h1>
              {lead.is_returning && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">{t.crm.kanban.returning}</Badge>
              )}
              {isOverdue && (
                <Badge className="text-[10px] bg-red-100 text-red-700 border-0">
                  <AlertCircle className="h-3 w-3 mr-0.5" /> {t.crm.kanban.overdue}
                </Badge>
              )}
              {lead.archived_at && (
                <Badge className="text-[10px] bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-0 gap-1">
                  <Archive className="h-3 w-3" /> Archived
                </Badge>
              )}
            </div>
            <p className="text-sm text-zinc-500">
              {tc.created} {new Date(lead.created_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit toggle */}
          {editing ? (
            <>
              <Button onClick={handleSave} disabled={saving} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? tc.saving : tc.save}
              </Button>
              <Button onClick={handleCancelEdit} variant="outline" size="sm" className="gap-1.5">
                <X className="h-4 w-4" />
                {tc.cancel}
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)} variant="outline" size="sm" className="gap-1.5">
              <Pencil className="h-4 w-4" />
              {tc.edit}
            </Button>
          )}
          {lead.event_id ? (
            <Link href={`/costs/events/${lead.event_id}`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {tc.viewEvent}
              </Button>
            </Link>
          ) : lead.status === 'accepted' ? (
            <Button onClick={handleOpenEvent} disabled={loading} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <ExternalLink className="h-4 w-4 mr-1.5" />
              {tc.openEvent}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchive}
            disabled={loading}
            className={`gap-1.5 ${lead.archived_at
              ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200'
              : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
              }`}
          >
            {lead.archived_at ? (
              <><ArchiveRestore className="h-4 w-4" /> นำออก Archive</>
            ) : (
              <><Archive className="h-4 w-4" /> Archive</>
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete} disabled={loading} className="text-red-500 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Status Change Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-500">{tc.currentStatus}</span>
            <Badge className={`${statusConfig.bgColor} ${statusConfig.textColor} border-0 text-sm px-3`}>
              {getStatusLabel(lead.status)}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {ALL_STATUSES.filter(s => s !== lead.status).map(s => {
              const cfg = STATUS_CONFIG[s]
              return (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange(s)}
                  disabled={loading}
                  className="text-xs"
                >
                  <span className="h-2 w-2 rounded-full mr-1.5" style={{ backgroundColor: cfg.color }} />
                  {getStatusLabel(s)}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tags Bar — same level as Status */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* General Tags */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-500 flex items-center gap-1.5">
                🌐 {tc.generalTags}
              </span>
              <div className="flex flex-wrap gap-1">
                {(form.tags as string[]).filter(t => settings.find(st => st.value === t && st.category === 'tag')).map(tag => {
                  const tagSetting = settings.find(s => s.category === 'tag' && s.value === tag)
                  const tagColor = tagSetting?.color || '#3b82f6'
                  return (
                    <Badge key={tag} className="text-[10px] px-2 py-0.5 border" style={{ backgroundColor: `${tagColor}18`, color: tagColor, borderColor: `${tagColor}40` }}>
                      {tagSetting ? getSettingLabel(tagSetting) : tag}
                    </Badge>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.filter(s => s.category === 'tag' && s.is_active).map(tagSetting => {
                const tagValue = tagSetting.value
                const isSelected = (form.tags as string[]).includes(tagValue)
                const tagColor = tagSetting.color || '#3b82f6'
                return (
                  <Button key={tagSetting.id} variant="outline" size="sm"
                    onClick={async () => {
                      const currentTags = form.tags as string[]
                      const newTags = isSelected ? currentTags.filter(t => t !== tagValue) : [...currentTags, tagValue]
                      setForm(prev => ({ ...prev, tags: newTags }))
                      const fd = new FormData()
                      fd.set('tags', newTags.join(','))
                      await updateLead(lead.id, fd)
                      router.refresh()
                    }}
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-zinc-500 flex items-center gap-1.5">
                🏷️ {tc.statusTags}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: statusConfig.color, color: statusConfig.color }}>
                  {getStatusLabel(lead.status)}
                </Badge>
              </span>
              <div className="flex flex-wrap gap-1">
                {(form.tags as string[]).filter(t => settings.find(st => st.value === t && st.category === `tag_${lead.status}`)).map(tag => {
                  const tagSetting = settings.find(s => s.category === `tag_${lead.status}` && s.value === tag)
                  const tagColor = tagSetting?.color || '#8b5cf6'
                  return (
                    <Badge key={tag} className="text-[10px] px-2 py-0.5 border" style={{ backgroundColor: `${tagColor}18`, color: tagColor, borderColor: `${tagColor}40` }}>
                      {tagSetting ? getSettingLabel(tagSetting) : tag}
                    </Badge>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.filter(s => s.category === `tag_${lead.status}` && s.is_active).map(tagSetting => {
                const tagValue = tagSetting.value
                const isSelected = (form.tags as string[]).includes(tagValue)
                const tagColor = tagSetting.color || '#8b5cf6'
                return (
                  <Button key={tagSetting.id} variant="outline" size="sm"
                    onClick={async () => {
                      const currentTags = form.tags as string[]
                      const newTags = isSelected ? currentTags.filter(t => t !== tagValue) : [...currentTags, tagValue]
                      setForm(prev => ({ ...prev, tags: newTags }))
                      const fd = new FormData()
                      fd.set('tags', newTags.join(','))
                      await updateLead(lead.id, fd)
                      router.refresh()
                    }}
                    disabled={loading}
                    className="text-xs transition-all"
                    style={isSelected ? { backgroundColor: `${tagColor}20`, color: tagColor, borderColor: `${tagColor}60` } : {}}
                  >
                    <span className="h-2.5 w-2.5 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: tagColor }} />
                    {getSettingLabel(tagSetting)}
                  </Button>
                )
              })}
              {settings.filter(s => s.category === `tag_${lead.status}` && s.is_active).length === 0 && (
                <span className="text-xs text-zinc-400">{tc.noTags}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff Assignments Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-md bg-amber-50 dark:bg-amber-950/40">
              <Users className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            {locale === 'th' ? 'ผู้ดูแล' : 'Staff Assignments'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sale */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {locale === 'th' ? 'ฝ่ายขาย (Sale)' : 'Sale'}
              </span>
            </div>
            <DropdownMenu onOpenChange={(open) => saveStaffField('assigned_sales', open)}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between text-sm font-normal h-9" disabled={staffSaving}>
                  <span className="truncate text-left">
                    {localSales.length > 0
                      ? localSales.map(id => getUserName(id)).join(', ')
                      : (locale === 'th' ? 'เลือกฝ่ายขาย...' : 'Select sales...')
                    }
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start">
                <DropdownMenuLabel className="text-xs">{locale === 'th' ? 'เลือกฝ่ายขาย' : 'Select Sales'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {users.map(user => (
                  <DropdownMenuCheckboxItem
                    key={user.id}
                    checked={localSales.includes(user.id)}
                    onCheckedChange={() => localToggle('assigned_sales', user.id)}
                    onSelect={e => e.preventDefault()}
                  >
                    {user.full_name || user.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Graphic */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Palette className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {locale === 'th' ? 'กราฟิก (Graphic)' : 'Graphic'}
              </span>
            </div>
            <DropdownMenu onOpenChange={(open) => saveStaffField('assigned_graphics', open)}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between text-sm font-normal h-9" disabled={staffSaving}>
                  <span className="truncate text-left">
                    {localGraphics.length > 0
                      ? localGraphics.map(id => getUserName(id)).join(', ')
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
                    checked={localGraphics.includes(user.id)}
                    onCheckedChange={() => localToggle('assigned_graphics', user.id)}
                    onSelect={e => e.preventDefault()}
                  >
                    {user.full_name || user.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Staff */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Wrench className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {locale === 'th' ? 'พนักงาน (Staff)' : 'Staff'}
              </span>
            </div>
            <DropdownMenu onOpenChange={(open) => saveStaffField('assigned_staff', open)}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-between text-sm font-normal h-9" disabled={staffSaving}>
                  <span className="truncate text-left">
                    {localStaff.length > 0
                      ? localStaff.map(id => getUserName(id)).join(', ')
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
                    checked={localStaff.includes(user.id)}
                    onCheckedChange={() => localToggle('assigned_staff', user.id)}
                    onSelect={e => e.preventDefault()}
                  >
                    {user.full_name || user.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Customer + Event + Financial Info */}
        <div className="space-y-6">
          {/* Customer Info */}
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-blue-50 dark:bg-blue-950/40">
                  <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                {tc.customerInfo}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-4">
                  <EditField label={tc.name} value={form.customer_name} onChange={v => updateForm('customer_name', v)} />
                  <EditField label={tc.lineId} value={form.customer_line} onChange={v => updateForm('customer_line', v)} placeholder="@line_id" />
                  <EditField label={tc.phone} value={form.customer_phone} onChange={v => updateForm('customer_phone', v)} placeholder="0xx-xxx-xxxx" />
                  <EditSelect
                    label={tc.type}
                    value={form.customer_type}
                    onChange={v => updateForm('customer_type', v)}
                    options={customerTypes.map(s => ({ value: s.value, label: getSettingLabel(s) }))}
                    placeholder={tc.selectType}
                  />
                  <EditSelect
                    label={tc.channel}
                    value={form.lead_source}
                    onChange={v => updateForm('lead_source', v)}
                    options={sources.map(s => ({ value: s.value, label: getSettingLabel(s) }))}
                    placeholder={tc.selectSource}
                  />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-500">{tc.returningCustomer}</Label>
                    <Switch
                      checked={form.is_returning}
                      onCheckedChange={v => updateForm('is_returning', v)}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label={tc.name} value={lead.customer_name} />
                  <InfoRow label={tc.lineId} value={lead.customer_line} />
                  <InfoRow label={tc.phone} value={lead.customer_phone} />
                  <InfoRow label={tc.type} value={typeSetting ? getSettingLabel(typeSetting) : lead.customer_type} />
                  <InfoRow label={tc.channel} value={sourceSetting ? getSettingLabel(sourceSetting) : lead.lead_source} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Event Info */}
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-violet-50 dark:bg-violet-950/40">
                  <Calendar className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                {tc.eventInfo}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-4">
                  <EditField label={tc.eventDate} value={form.event_date} onChange={v => updateForm('event_date', v)} type="date" />
                  <EditField label={tc.endDate} value={form.event_end_date} onChange={v => updateForm('event_end_date', v)} type="date" />
                  {/* Auto-calculated duration */}
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
                </div>
              ) : (
                <>
                  <InfoRow label={tc.eventDate} value={lead.event_date} />
                  <InfoRow label={tc.endDate} value={lead.event_end_date} />
                  {/* Auto-calculated duration */}
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
                  <InfoRow label={tc.details} value={lead.event_details} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Financial Info */}
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-emerald-50 dark:bg-emerald-950/40">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                {tc.financial}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-4">
                  <EditSelect
                    label={tc.package}
                    value={form.package_name}
                    onChange={handlePackageChange}
                    options={packages.map(s => ({ value: s.value, label: getSettingLabel(s) }))}
                    placeholder={tc.selectPackage}
                  />
                  <EditField label={`${tc.quotedPrice} (฿)`} value={String(form.quoted_price)} onChange={v => updateForm('quoted_price', Number(v) || 0)} type="number" />
                  <EditField label={`${tc.confirmedPrice} (฿)`} value={String(form.confirmed_price)} onChange={v => updateForm('confirmed_price', Number(v) || 0)} type="number" />
                  <EditField label={`${tc.depositLabel} (฿)`} value={String(form.deposit)} onChange={v => updateForm('deposit', Number(v) || 0)} type="number" />
                  {[1, 2, 3, 4].map(n => {
                    const amountKey = `installment_${n}` as keyof typeof form
                    const dateKey = `installment_${n}_date` as keyof typeof form
                    const paidKey = `installment_${n}_paid` as keyof typeof form
                    const paidDateKey = `installment_${n}_paid_date` as keyof typeof form
                    const label = (tc as any)[`installment${n}`]
                    const isPaid = form[paidKey] as boolean
                    return (
                      <div key={n} className="space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <EditField label={`${label} (฿)`} value={String(form[amountKey])} onChange={v => updateForm(amountKey, Number(v) || 0)} type="number" />
                          <EditField label={(tc as any).dueDate || 'วันนัดชำระ'} value={String(form[dateKey] || '')} onChange={v => updateForm(dateKey, v)} type="date" />
                        </div>
                        <div className="flex items-center gap-3 pl-1">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isPaid}
                              onChange={e => {
                                updateForm(paidKey, e.target.checked)
                                if (e.target.checked && !form[paidDateKey]) {
                                  updateForm(paidDateKey, new Date().toISOString().split('T')[0])
                                }
                                if (!e.target.checked) {
                                  updateForm(paidDateKey, '')
                                }
                              }}
                              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className={`text-xs font-medium ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                              {(tc as any).paid || 'ชำระแล้ว'}
                            </span>
                          </label>
                          {isPaid && (
                            <div className="flex-1 max-w-[180px]">
                              <EditField label={(tc as any).paidDate || 'วันที่ชำระจริง'} value={String(form[paidDateKey] || '')} onChange={v => updateForm(paidDateKey, v)} type="date" />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <EditField label={tc.quotationRef} value={form.quotation_ref} onChange={v => updateForm('quotation_ref', v)} />
                  <div>
                    <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{tc.notesLabel}</Label>
                    <Textarea
                      value={form.notes}
                      onChange={e => updateForm('notes', e.target.value)}
                      rows={3}
                      className="text-sm"
                      placeholder={tc.notesPlaceholder}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label={tc.package} value={pkgSetting ? getSettingLabel(pkgSetting) : lead.package_name} />
                  <InfoRow label={tc.quotedPrice} value={lead.quoted_price ? `฿${lead.quoted_price.toLocaleString()}` : null} />
                  <InfoRow label={tc.confirmedPrice} value={lead.confirmed_price ? `฿${lead.confirmed_price.toLocaleString()}` : null} />
                  <InfoRow label={tc.depositLabel} value={lead.deposit ? `฿${lead.deposit.toLocaleString()}` : null} />
                  {[1, 2, 3, 4].map(n => {
                    const amount = (lead as any)[`installment_${n}`]
                    const date = (lead as any)[`installment_${n}_date`]
                    const isPaid = (lead as any)[`installment_${n}_paid`]
                    const paidDate = (lead as any)[`installment_${n}_paid_date`]
                    const label = (tc as any)[`installment${n}`]
                    const isOverduePayment = date && !isPaid && new Date(date) < new Date()
                    if (!amount && !date) return null

                    const borderColor = isPaid
                      ? 'border-l-emerald-500'
                      : isOverduePayment
                        ? 'border-l-red-500'
                        : 'border-l-zinc-200 dark:border-l-zinc-700'

                    return (
                      <div key={n} className={`border-l-[3px] ${borderColor} rounded-r-lg bg-zinc-50/50 dark:bg-zinc-800/30 px-3 py-2.5`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                              ✓ {(tc as any).paid || 'ชำระแล้ว'}
                            </span>
                          ) : isOverduePayment ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                              ⚠ {(tc as any).overdue || 'เลยกำหนด'}
                            </span>
                          ) : date ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                              {(tc as any).unpaid || 'ยังไม่ชำระ'}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            {amount ? `฿${amount.toLocaleString()}` : '—'}
                          </span>
                          {date && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {(tc as any).dueDate || 'วันนัดชำระ'}: {date}
                            </span>
                          )}
                        </div>
                        {isPaid && paidDate && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {(tc as any).paidDate || 'วันที่ชำระจริง'}: {paidDate}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <InfoRow label={tc.quotationRef} value={lead.quotation_ref} />
                  {lead.notes && <InfoRow label={tc.notesLabel} value={lead.notes} />}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Activity Timeline */}
        <div>
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <div className="flex items-center justify-center h-6 w-6 rounded-md bg-orange-50 dark:bg-orange-950/40">
                  <Clock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                </div>
                {ta.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                  <Input
                    value={activityDesc}
                    onChange={e => setActivityDesc(e.target.value)}
                    placeholder={ta.addNotePlaceholder}
                    className="h-9"
                  />
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
                              <Badge className={`text-[10px] border-0 ${STATUS_CONFIG[activity.new_status as LeadStatus]?.bgColor || ''
                                } ${STATUS_CONFIG[activity.new_status as LeadStatus]?.textColor || ''}`}>
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
                              {ta.by} {(activity.profiles as any)?.full_name || 'System'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Edit Field helper — Input with label
// ============================================================================

function EditField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 text-sm"
      />
    </div>
  )
}

// ============================================================================
// Edit Select helper — Dropdown with label
// ============================================================================

function EditSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  return (
    <div>
      <Label className="text-xs font-medium text-zinc-500 mb-1.5 block">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(opt => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ============================================================================
// Info Row helper — Read-only display
// ============================================================================

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0 w-28">{label}</span>
      <span className="text-sm text-zinc-900 dark:text-zinc-100 text-right">{value || '—'}</span>
    </div>
  )
}
