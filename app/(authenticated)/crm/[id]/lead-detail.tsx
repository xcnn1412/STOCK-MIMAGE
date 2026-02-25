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
  ArrowLeft, Phone, MessageSquare, Mail, Pencil, Save, X,
  FileText, ExternalLink, Clock, User, Calendar, MapPin,
  DollarSign, Package, AlertCircle, Trash2
} from 'lucide-react'
import {
  updateLeadStatus, updateLead, createActivity, createEventFromLead, deleteLead
} from '../actions'
import { STATUS_CONFIG, ALL_STATUSES, type CrmLead, type CrmSetting, type LeadStatus } from '../crm-dashboard'

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
}

export default function LeadDetail({ lead, activities, settings }: LeadDetailProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activityType, setActivityType] = useState('note')
  const [activityDesc, setActivityDesc] = useState('')
  const [addingActivity, setAddingActivity] = useState(false)

  // ---------- Editable form state ----------
  const [form, setForm] = useState({
    customer_name: lead.customer_name || '',
    customer_line: lead.customer_line || '',
    customer_phone: lead.customer_phone || '',
    customer_type: lead.customer_type || '',
    lead_source: lead.lead_source || '',
    assigned_to: lead.assigned_to || '',
    is_returning: lead.is_returning || false,
    event_date: lead.event_date || '',
    event_end_date: lead.event_end_date || '',
    event_location: lead.event_location || '',
    event_details: lead.event_details || '',
    package_name: lead.package_name || '',
    quoted_price: lead.quoted_price || 0,
    confirmed_price: lead.confirmed_price || 0,
    deposit: lead.deposit || 0,
    quotation_ref: lead.quotation_ref || '',
    notes: lead.notes || '',
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
    !['accepted', 'cancelled'].includes(lead.status) &&
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
      formData.set(key, String(value))
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
      assigned_to: lead.assigned_to || '',
      is_returning: lead.is_returning || false,
      event_date: lead.event_date || '',
      event_end_date: lead.event_end_date || '',
      event_location: lead.event_location || '',
      event_details: lead.event_details || '',
      package_name: lead.package_name || '',
      quoted_price: lead.quoted_price || 0,
      confirmed_price: lead.confirmed_price || 0,
      deposit: lead.deposit || 0,
      quotation_ref: lead.quotation_ref || '',
      notes: lead.notes || '',
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
    if (!confirm('Are you sure you want to delete this lead?')) return
    setLoading(true)
    await deleteLead(lead.id)
    setLoading(false)
    router.push('/crm')
  }

  // Auto-fill price when package changes
  const handlePackageChange = (val: string) => {
    updateForm('package_name', val)
    const pkg = packages.find(p => p.value === val)
    if (pkg?.metadata && typeof pkg.metadata === 'object' && 'price' in pkg.metadata) {
      updateForm('quoted_price', Number(pkg.metadata.price) || 0)
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
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">Returning</Badge>
              )}
              {isOverdue && (
                <Badge className="text-[10px] bg-red-100 text-red-700 border-0">
                  <AlertCircle className="h-3 w-3 mr-0.5" /> Overdue
                </Badge>
              )}
            </div>
            <p className="text-sm text-zinc-500">
              Created {new Date(lead.created_at).toLocaleDateString('en-GB')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Edit toggle */}
          {editing ? (
            <>
              <Button onClick={handleSave} disabled={saving} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button onClick={handleCancelEdit} variant="outline" size="sm" className="gap-1.5">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)} variant="outline" size="sm" className="gap-1.5">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {lead.event_id ? (
            <Link href={`/costs/events/${lead.event_id}`}>
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                View Event
              </Button>
            </Link>
          ) : lead.status === 'accepted' ? (
            <Button onClick={handleOpenEvent} disabled={loading} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Open Event
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={handleDelete} disabled={loading} className="text-red-500 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Status Change Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-500">Current Status</span>
            <Badge className={`${statusConfig.bgColor} ${statusConfig.textColor} border-0 text-sm px-3`}>
              {statusConfig.label}
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
                  {cfg.label}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Customer + Event + Financial Info */}
        <div className="space-y-6">
          {/* Customer Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-4">
                  <EditField label="Name" value={form.customer_name} onChange={v => updateForm('customer_name', v)} />
                  <EditField label="LINE ID" value={form.customer_line} onChange={v => updateForm('customer_line', v)} placeholder="@line_id" />
                  <EditField label="Phone" value={form.customer_phone} onChange={v => updateForm('customer_phone', v)} placeholder="0xx-xxx-xxxx" />
                  <EditSelect
                    label="Customer Type"
                    value={form.customer_type}
                    onChange={v => updateForm('customer_type', v)}
                    options={customerTypes.map(s => ({ value: s.value, label: s.label_en }))}
                    placeholder="Select type"
                  />
                  <EditSelect
                    label="Lead Source"
                    value={form.lead_source}
                    onChange={v => updateForm('lead_source', v)}
                    options={sources.map(s => ({ value: s.value, label: s.label_en }))}
                    placeholder="Select source"
                  />
                  <EditField label="Assignee" value={form.assigned_to} onChange={v => updateForm('assigned_to', v)} />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-zinc-500">Returning Customer</Label>
                    <Switch
                      checked={form.is_returning}
                      onCheckedChange={v => updateForm('is_returning', v)}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Name" value={lead.customer_name} />
                  <InfoRow label="LINE ID" value={lead.customer_line} />
                  <InfoRow label="Phone" value={lead.customer_phone} />
                  <InfoRow label="Type" value={typeSetting?.label_en || lead.customer_type} />
                  <InfoRow label="Channel" value={sourceSetting?.label_en || lead.lead_source} />
                  <InfoRow label="Assignee" value={lead.assigned_to} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Event Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Event Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-4">
                  <EditField label="Event Date" value={form.event_date} onChange={v => updateForm('event_date', v)} type="date" />
                  <EditField label="End Date" value={form.event_end_date} onChange={v => updateForm('event_end_date', v)} type="date" />
                  {/* Auto-calculated duration */}
                  {form.event_date && form.event_end_date && (
                    <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Duration</span>
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-xs">
                        {(() => {
                          const start = new Date(form.event_date)
                          const end = new Date(form.event_end_date)
                          const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
                          return `${days} ${days === 1 ? 'day' : 'days'}`
                        })()}
                      </Badge>
                    </div>
                  )}
                  <EditField label="Location" value={form.event_location} onChange={v => updateForm('event_location', v)} />
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1.5 block">Details</Label>
                    <Textarea
                      value={form.event_details}
                      onChange={e => updateForm('event_details', e.target.value)}
                      rows={3}
                      className="text-sm"
                      placeholder="Event details..."
                    />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Event Date" value={lead.event_date} />
                  <InfoRow label="End Date" value={lead.event_end_date} />
                  {/* Auto-calculated duration */}
                  {lead.event_date && lead.event_end_date && (
                    <div className="flex justify-between items-start gap-4">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0 w-28">Duration</span>
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-xs">
                        {(() => {
                          const start = new Date(lead.event_date)
                          const end = new Date(lead.event_end_date)
                          const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
                          return `${days} ${days === 1 ? 'day' : 'days'}`
                        })()}
                      </Badge>
                    </div>
                  )}
                  <InfoRow label="Location" value={lead.event_location} />
                  <InfoRow label="Details" value={lead.event_details} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Financial Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Financial
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-4">
                  <EditSelect
                    label="Package"
                    value={form.package_name}
                    onChange={handlePackageChange}
                    options={packages.map(s => ({ value: s.value, label: s.label_en }))}
                    placeholder="Select package"
                  />
                  <EditField label="Quoted Price (฿)" value={String(form.quoted_price)} onChange={v => updateForm('quoted_price', Number(v) || 0)} type="number" />
                  <EditField label="Confirmed Price (฿)" value={String(form.confirmed_price)} onChange={v => updateForm('confirmed_price', Number(v) || 0)} type="number" />
                  <EditField label="Deposit (฿)" value={String(form.deposit)} onChange={v => updateForm('deposit', Number(v) || 0)} type="number" />
                  <EditField label="Quotation Ref" value={form.quotation_ref} onChange={v => updateForm('quotation_ref', v)} />
                  <div>
                    <Label className="text-xs text-zinc-500 mb-1.5 block">Notes</Label>
                    <Textarea
                      value={form.notes}
                      onChange={e => updateForm('notes', e.target.value)}
                      rows={3}
                      className="text-sm"
                      placeholder="Additional notes..."
                    />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="Package" value={pkgSetting?.label_en || lead.package_name} />
                  <InfoRow label="Quoted Price" value={lead.quoted_price ? `฿${lead.quoted_price.toLocaleString()}` : null} />
                  <InfoRow label="Confirmed Price" value={lead.confirmed_price ? `฿${lead.confirmed_price.toLocaleString()}` : null} />
                  <InfoRow label="Deposit" value={lead.deposit ? `฿${lead.deposit.toLocaleString()}` : null} />
                  <InfoRow label="Quotation Ref" value={lead.quotation_ref} />
                  {lead.notes && <InfoRow label="Notes" value={lead.notes} />}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Activity Timeline */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Activity Timeline
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
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                          activityType === type
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={activityDesc}
                    onChange={e => setActivityDesc(e.target.value)}
                    placeholder="Add note..."
                    className="h-9"
                  />
                  <Button type="submit" size="sm" disabled={addingActivity || !activityDesc.trim()}>
                    {addingActivity ? '...' : 'Add'}
                  </Button>
                </div>
              </form>

              {/* Timeline */}
              <div className="space-y-4">
                {activities.length === 0 && (
                  <p className="text-sm text-zinc-400 text-center py-4">No activities yet</p>
                )}
                {activities.map((activity, idx) => {
                  const Icon = activityIcons[activity.activity_type] || FileText
                  const isStatusChange = activity.activity_type === 'status_change'

                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${
                          isStatusChange
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
                                {STATUS_CONFIG[activity.old_status as LeadStatus]?.label || activity.old_status}
                              </Badge>
                            )}
                            <span className="text-xs text-zinc-400">→</span>
                            {activity.new_status && (
                              <Badge className={`text-[10px] border-0 ${
                                STATUS_CONFIG[activity.new_status as LeadStatus]?.bgColor || ''
                              } ${STATUS_CONFIG[activity.new_status as LeadStatus]?.textColor || ''}`}>
                                {STATUS_CONFIG[activity.new_status as LeadStatus]?.label || activity.new_status}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">{activity.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-zinc-400">
                            {new Date(activity.created_at).toLocaleString('en-GB', {
                              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                          {activity.profiles && (
                            <span className="text-[10px] text-zinc-400">
                              by {(activity.profiles as any)?.full_name || 'System'}
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
      <Label className="text-xs text-zinc-500 mb-1.5 block">{label}</Label>
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
      <Label className="text-xs text-zinc-500 mb-1.5 block">{label}</Label>
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
