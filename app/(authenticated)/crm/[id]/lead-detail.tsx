'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  updateLeadStatus, updateLead, createActivity, deleteLead,
  archiveLead, unarchiveLead, saveAllInstallments,
  uploadPaymentProof, deletePaymentProof, checkEventDateConflicts,
  setJobCostEventPhase,
  type LeadCostSummary, type LinkedLeadEvent, type LeadEventStaff, type LeadInstallment,
} from '../actions'
import { openGraphicJob } from '../../jobs/actions'
import { getStatusConfig, type CrmLead, type CrmSetting } from '../types'
import { useLocale } from '@/lib/i18n/context'
import { compressImage } from '@/lib/utils'
import { useConfirm } from '../../finance/use-confirm'
import { buildLeadForm, multiline, toFormInstallments, type CardSection, type EditableCardProps, type LeadActivity, type LeadForm, type LeadJob, type SystemUser } from './shared'
import { LeadHeader, GraphicJobsLink } from './components/lead-header'
import { CostSummaryCard } from './components/cost-summary-card'
import { LinkedEventsCard } from './components/linked-events-card'
import { StatusBar } from './components/status-bar'
import { TagsBar } from './components/tags-bar'
import { StaffCard } from './components/staff-card'
import { CustomerCard } from './components/customer-card'
import { EventCard } from './components/event-card'
import { FinancialCard } from './components/financial-card'
import { ActivityTimeline } from './components/activity-timeline'

interface LeadDetailProps {
  lead: CrmLead
  activities: LeadActivity[]
  settings: CrmSetting[]
  users: SystemUser[]
  installments: LeadInstallment[]
  eventStaffGroups: LeadEventStaff[]
  linkedEvents?: LinkedLeadEvent[]
  costSummary?: LeadCostSummary
  /** ใบงานที่แตกจากงานนี้แล้ว — นับใบกราฟิก + ลิงก์ไปหน้าใบงานแต่ละใบ */
  leadJobs?: LeadJob[]
  /** profiles.role — ปุ่มลบโชว์เฉพาะแอดมิน */
  role?: string | null
}

// Server actions ที่หน้านี้เรียกทุกตัว revalidatePath('/crm/<id>') เอง → ไม่ต้องสั่งรีเฟรชหน้าตามหลัง
export default function LeadDetail({ lead, activities, settings, users, installments: initialInstallments, eventStaffGroups = [], linkedEvents = [], costSummary, leadJobs = [], role = null }: LeadDetailProps) {
  const router = useRouter()
  const { locale, t } = useLocale()
  const tc = t.crm.detail
  const ts = t.crm.statuses
  const L = (th: string, en: string) => (locale === 'th' ? th : en)
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Per-card editing state
  const [editingCard, setEditingCard] = useState<CardSection | null>(null)
  // Collapsible state — defaults open
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleCollapse = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  const [activityType, setActivityType] = useState('note')
  const [activityDesc, setActivityDesc] = useState('')
  const [addingActivity, setAddingActivity] = useState(false)
  const [mentionedActivityUsers, setMentionedActivityUsers] = useState<string[]>([])
  // Staff role settings — still needed to render role labels/colors in the read-only
  // per-event staff display (staff is edited per event, not here).
  const staffRoles = settings.filter(s => s.category === 'staff_role' && s.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const staffRoleOptions = staffRoles.map(r => ({ value: r.value, label: locale === 'th' ? r.label_th : r.label_en }))
  const [uploadingInstallment, setUploadingInstallment] = useState<string | null>(null)
  const [localReceiptUrls, setLocalReceiptUrls] = useState<Record<string, string>>(
    Object.fromEntries(initialInstallments.filter(i => i.receipt_url).map(i => [i.id, i.receipt_url!]))
  )

  const getStatusLabel = (status: string) => {
    const cfg = getStatusConfig(settings, status)
    return ts[status] || cfg.labelTh || cfg.label || status
  }

  // ---------- Dynamic installments + tax state ----------
  const [formInstallments, setFormInstallments] = useState(toFormInstallments(initialInstallments))

  const buildForm = () => buildLeadForm(lead, settings)
  const [form, setForm] = useState<LeadForm>(buildForm)

  const updateForm = (key: keyof LeadForm, value: string | number | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const packages = settings.filter(s => s.category === 'package' && s.is_active)

  const workTypeOptions = [
    { value: 'sale', label: locale === 'th' ? 'ขาย' : 'Sale' },
    { value: 'event', label: locale === 'th' ? 'อีเวนต์' : 'Event' },
    { value: 'gp', label: 'GP' },
  ]

  // แดงเฉพาะดีลค้างท่อ (ยังคุยอยู่แต่วันงานเลยแล้ว) — สถานะหลังปิดดีลรวม custom ไม่นับ (ดู kanban-board)
  const isOverdue = Boolean(
    lead.event_date &&
    ['lead', 'quotation_sent'].includes(lead.status) &&
    new Date(lead.event_date) < new Date()
  )

  // Compute outstanding balance for header badge
  const headerBasePrice = lead.confirmed_price || lead.quoted_price || 0
  let headerTotalPaid = lead.deposit || 0
  for (const inst of initialInstallments) {
    if (inst.is_paid && inst.amount) headerTotalPaid += inst.amount
  }
  const headerOutstanding = headerBasePrice - headerTotalPaid
  const isFullyPaid = headerBasePrice > 0 && headerOutstanding <= 0

  // ---------- Handlers ----------
  const handleStatusChange = async (newStatus: string) => {
    setLoading(true)
    await updateLeadStatus(lead.id, newStatus)
    setLoading(false)
  }

  const handleSaveCard = async (section: CardSection) => {
    setSaving(true)
    const formData = new FormData()

    // Choose which fields to save based on section
    const fieldsBySection: Record<CardSection, (keyof LeadForm)[]> = {
      customer: ['customer_name', 'customer_line', 'customer_phone', 'customer_type', 'work_type', 'unit_count', 'lead_source', 'is_returning'],
      event: ['event_date', 'event_end_date', 'event_time', 'event_end_time', 'event_location', 'event_details', 'required_roles'],
      financial: ['package_name', 'quoted_price', 'confirmed_price', 'deposit', 'vat_mode', 'wht_rate', 'quotation_ref', 'notes'],
    }

    fieldsBySection[section].forEach(key => {
      const value = form[key]
      if (key === 'required_roles') {
        formData.set(key, JSON.stringify(value ?? {}))
      } else {
        formData.set(key, String(value))
      }
    })

    const results = await Promise.all([
      updateLead(lead.id, formData),
      // Also save installments when saving financial section
      section === 'financial'
        ? saveAllInstallments(lead.id, formInstallments.map(inst => ({
          installment_number: inst.installment_number,
          amount: inst.amount,
          due_date: inst.due_date || null,
          is_paid: inst.is_paid,
          paid_date: inst.paid_date || null,
        })))
        : null,
    ])
    setSaving(false)

    const error = results.map(r => (r as { error?: string } | null)?.error).find(Boolean)
    if (error) {
      toast.error(error)
      return
    }
    setEditingCard(null)
  }

  const handleCancelCardEdit = () => {
    // Reset form to original lead data
    setForm(buildForm())
    setFormInstallments(toFormInstallments(initialInstallments))
    setEditingCard(null)
  }

  const handleAddActivity = async (e: FormEvent) => {
    e.preventDefault()
    if (!activityDesc.trim()) return

    setAddingActivity(true)
    const formData = new FormData()
    formData.set('activity_type', activityType)
    formData.set('description', activityDesc)
    if (mentionedActivityUsers.length > 0) {
      formData.set('notify_users', mentionedActivityUsers.join(','))
    }
    await createActivity(lead.id, formData)
    setActivityDesc('')
    setMentionedActivityUsers([])
    setAddingActivity(false)
  }

  const handleOpenEvent = async () => {
    setLoading(true)
    // Soft warning if this lead already has linked events — user may want to add another sub-event (setup/teardown/etc.)
    if (linkedEvents.length > 0) {
      const proceed = await askConfirm({
        title: L(`Lead นี้มี ${linkedEvents.length} อีเวนต์ผูกอยู่แล้ว`, `This lead already has ${linkedEvents.length} linked event(s)`),
        description: L('ต้องการเพิ่มอีเวนต์ใหม่หรือไม่?', 'Add another event?'),
        confirmLabel: L('เพิ่มอีเวนต์', 'Add event'),
      })
      if (!proceed) {
        setLoading(false)
        return
      }
    }
    // Tiered duplicate check for same-date events
    if (lead.event_date) {
      const conflicts = await checkEventDateConflicts(lead.event_date)
      if (conflicts.length > 0) {
        const customerName = lead.customer_name?.toLowerCase() || ''
        // Level 1: Same customer name → likely duplicate
        const duplicates = conflicts.filter(e =>
          e.event_name?.toLowerCase().includes(customerName) && customerName.length > 0
        )
        // Level 2: Other events on the same day → informational
        const sameDay = conflicts.filter(e =>
          !e.event_name?.toLowerCase().includes(customerName) || customerName.length === 0
        )

        if (duplicates.length > 0) {
          // 🔴 Strong warning — likely duplicate
          const dupNames = duplicates.map(e => e.event_name).join('\n• ')
          const proceed = await askConfirm({
            title: L('🔴 อีเวนต์ซ้ำ!', '🔴 Duplicate event!'),
            description: multiline(L(
              `ลูกค้า "${lead.customer_name}" มีอีเวนต์ในวันเดียวกันอยู่แล้ว:\n• ${dupNames}\n\n⚠️ อาจเป็นอีเวนต์ที่สร้างไปแล้ว — ต้องการสร้างเพิ่มหรือไม่?`,
              `Customer "${lead.customer_name}" already has an event on this date:\n• ${dupNames}\n\n⚠️ It may already exist — create another one?`,
            )),
            variant: 'destructive',
            confirmLabel: L('สร้างเพิ่ม', 'Create anyway'),
          })
          if (!proceed) {
            setLoading(false)
            return
          }
        } else if (sameDay.length > 0) {
          // 🟡 Informational — other events on same day
          const dayNames = sameDay.map(e => `${e.event_name}${e.event_location ? ` (${e.event_location})` : ''}`).join('\n• ')
          const proceed = await askConfirm({
            title: L(`📋 วันที่ ${lead.event_date} มีอีเวนต์อื่นอยู่แล้ว ${sameDay.length} งาน`, `📋 ${sameDay.length} other event(s) on ${lead.event_date}`),
            description: multiline(L(
              `• ${dayNames}\n\nตรวจสอบทีมหน้างานก่อนสร้างอีเวนต์ใหม่ — ดำเนินการต่อหรือไม่?`,
              `• ${dayNames}\n\nCheck the on-site team before creating a new event — continue?`,
            )),
            variant: 'warning',
            confirmLabel: L('ดำเนินการต่อ', 'Continue'),
          })
          if (!proceed) {
            setLoading(false)
            return
          }
        }
      }
    }
    setLoading(false)
    router.push(`/events/new?from_crm=${lead.id}`)
  }

  // ใบงานกราฟิกของงานนี้ — เปิดได้หลายใบ แต่ใบที่สองขึ้นไปต้องยืนยันก่อน
  // (server ส่งมาเรียงใหม่→เก่า จึง reverse ให้ใบแรกเป็น #1)
  const graphicJobs = leadJobs.filter(j => j.job_type === 'graphic').reverse()
  const graphicJobCount = graphicJobs.length

  // เปิดใบงานกราฟิก — ใบงานเข้าพูลสถานะรอรับงาน + กระดิ่งถึงฝ่ายออกแบบ
  // มีใบเดิมอยู่แล้ว = ถามยืนยันก่อนเปิดใบใหม่ (กันกดเผลอ ไม่ได้ห้าม)
  const handleOpenGraphicJob = async () => {
    const hasExisting = graphicJobCount > 0
    if (hasExisting) {
      const proceed = await askConfirm({
        title: L(`งานนี้มีใบงานกราฟิกอยู่แล้ว ${graphicJobCount} ใบ`, `This lead already has ${graphicJobCount} graphic job(s)`),
        description: L('ต้องการเปิดใบงานกราฟิกใบใหม่เพิ่มหรือไม่?', 'Open another graphic job?'),
        confirmLabel: L('เปิดใบใหม่', 'Open new job'),
      })
      if (!proceed) return
    }
    setLoading(true)
    const result = await openGraphicJob(lead.id, { allowDuplicate: hasExisting })
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(
      hasExisting
        ? `เปิดใบงานกราฟิกใบที่ ${graphicJobCount + 1} แล้ว — เข้าพูลรอรับงาน`
        : 'เปิดใบงานกราฟิกแล้ว — เข้าพูลรอรับงาน',
      {
        duration: 8000,
        action: {
          label: 'ไปพูลงาน',
          onClick: () => router.push('/jobs/tracking'),
        },
      }
    )
  }

  const handleDelete = async () => {
    const ok = await askConfirm({
      title: L('ลบลูกค้า', 'Delete lead'),
      description: tc.deleteConfirm,
      variant: 'destructive',
      confirmLabel: L('ลบ', 'Delete'),
    })
    if (!ok) return
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
  }

  const handleToggleTag = async (tagValue: string, isSelected: boolean) => {
    const newTags = isSelected ? form.tags.filter(t => t !== tagValue) : [...form.tags, tagValue]
    setForm(prev => ({ ...prev, tags: newTags }))
    const fd = new FormData()
    fd.set('tags', newTags.join(','))
    await updateLead(lead.id, fd)
  }

  const handlePhaseChange = async (costId: string, phase: string | null) => {
    const res = await setJobCostEventPhase(costId, phase)
    if (res?.error) {
      toast.error(res.error)
    } else {
      toast.success(locale === 'th' ? 'อัปเดต phase แล้ว' : 'Phase updated')
    }
  }

  // Staff is managed per event (event_staff), not at the lead level. This page only
  // displays it grouped by event — see the "Staff & Roles" card, which links out
  // to each event's edit page for changes.

  // Auto-fill price when package changes
  const handlePackageChange = (val: string) => {
    updateForm('package_name', val)
    const pkg = packages.find(p => p.value === val)
    if (pkg?.price) {
      updateForm('quoted_price', pkg.price)
    }
  }

  // ---------- Payment Proof Upload ----------
  const handleUploadProof = async (installmentId: string, file: File) => {
    setUploadingInstallment(installmentId)
    // Compress image before uploading to reduce size (especially from mobile)
    const compressedFile = file.type.startsWith('image/') ? await compressImage(file) : file
    const formData = new FormData()
    formData.append('file', compressedFile)
    const result = await uploadPaymentProof(lead.id, installmentId, formData)
    setUploadingInstallment(null)
    if (result.error) {
      toast.error(result.error)
    } else if (result.url) {
      // Save uploaded URL to local state immediately for preview
      setLocalReceiptUrls(prev => ({ ...prev, [installmentId]: result.url! }))
    }
  }

  const handleDeleteProof = async (installmentId: string) => {
    const ok = await askConfirm({
      title: L('ต้องการลบหลักฐานการชำระเงินนี้?', 'Delete this payment proof?'),
      variant: 'destructive',
      confirmLabel: L('ลบ', 'Delete'),
    })
    if (!ok) return
    setUploadingInstallment(installmentId)
    const result = await deletePaymentProof(lead.id, installmentId)
    setUploadingInstallment(null)
    if (result.error) {
      toast.error(result.error)
    } else {
      // Remove from local state
      setLocalReceiptUrls(prev => {
        const next = { ...prev }
        delete next[installmentId]
        return next
      })
    }
  }

  const cardProps = (section: CardSection): EditableCardProps => ({
    lead, form, updateForm, saving,
    editing: editingCard === section,
    collapsed: !!collapsed[section],
    onEdit: () => setEditingCard(section),
    onToggle: () => toggleCollapse(section),
    onSave: () => handleSaveCard(section),
    onCancel: handleCancelCardEdit,
  })

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <LeadHeader
        lead={lead}
        displayName={editingCard === 'customer' ? form.customer_name : lead.customer_name}
        isOverdue={isOverdue}
        isFullyPaid={isFullyPaid}
        loading={loading}
        linkedEventCount={linkedEvents.length}
        graphicJobCount={graphicJobCount}
        role={role}
        onOpenEvent={handleOpenEvent}
        onOpenGraphicJob={handleOpenGraphicJob}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />

      {graphicJobs.length > 0 && <GraphicJobsLink leadId={lead.id} count={graphicJobs.length} />}

      {costSummary && (costSummary.claimCount > 0 || costSummary.revenue > 0) && (
        <CostSummaryCard costSummary={costSummary} linkedEventCount={linkedEvents.length} />
      )}

      {linkedEvents.length > 0 && <LinkedEventsCard linkedEvents={linkedEvents} onPhaseChange={handlePhaseChange} />}

      <StatusBar settings={settings} status={lead.status} loading={loading} getStatusLabel={getStatusLabel} onChange={handleStatusChange} />

      <TagsBar settings={settings} tags={form.tags} status={lead.status} loading={loading} getStatusLabel={getStatusLabel} onToggle={handleToggleTag} />

      <StaffCard eventStaffGroups={eventStaffGroups} staffRoles={staffRoles} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Customer + Event + Financial Info */}
        <div className="space-y-6">
          <CustomerCard
            {...cardProps('customer')}
            settings={settings}
            packages={packages}
            workTypeOptions={workTypeOptions}
            onPackageChange={handlePackageChange}
          />
          <EventCard
            {...cardProps('event')}
            staffRoleOptions={staffRoleOptions}
            onRequiredRolesChange={v => setForm(prev => ({ ...prev, required_roles: v }))}
          />
          <FinancialCard
            {...cardProps('financial')}
            formInstallments={formInstallments}
            setFormInstallments={setFormInstallments}
            initialInstallments={initialInstallments}
            localReceiptUrls={localReceiptUrls}
            uploadingInstallment={uploadingInstallment}
            onUploadProof={handleUploadProof}
            onDeleteProof={handleDeleteProof}
          />
        </div>

        {/* Right: Activity Timeline */}
        <div>
          <ActivityTimeline
            activities={activities}
            users={users}
            settings={settings}
            getStatusLabel={getStatusLabel}
            collapsed={!!collapsed.activity}
            onToggle={() => toggleCollapse('activity')}
            activityType={activityType}
            setActivityType={setActivityType}
            activityDesc={activityDesc}
            setActivityDesc={setActivityDesc}
            addingActivity={addingActivity}
            setMentionedActivityUsers={setMentionedActivityUsers}
            handleAddActivity={handleAddActivity}
          />
        </div>
      </div>
      {confirmDialog}
    </div>
  )
}
