'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  updateLeadStatus, updateLead, createActivity, deleteLead,
  archiveLead, unarchiveLead, checkEventDateConflicts,
  setJobCostEventPhase,
  type LeadCostSummary, type LinkedLeadEvent, type LeadEventStaff, type LeadInstallment,
} from '../actions'
import { openGraphicJob } from '../../jobs/actions'
import { getStatusConfig, type CrmLead, type CrmSetting } from '../types'
import { useLocale } from '@/lib/i18n/context'
import { useConfirm } from '../../finance/use-confirm'
import { multiline, type LeadActivity, type LeadPackagePickerData, type LeadJob, type SystemUser } from './shared'
import { LeadHeader, GraphicJobsLink } from './components/lead-header'
import { CostSummaryCard } from './components/cost-summary-card'
import { LinkedEventsCard } from './components/linked-events-card'
import { StatusBar } from './components/status-bar'
import { TagsBar } from './components/tags-bar'
import { StaffCard } from './components/staff-card'
import { LeadCards } from './lead-cards'
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
  /** แพ็กเกจของงาน + ข้อมูลของ PackagePicker (การ์ดลูกค้า) — ไม่ส่ง = แสดงชื่อแพ็กเกจเดิมจาก package_name */
  packagePicker?: LeadPackagePickerData
}

// Server actions ที่หน้านี้เรียกทุกตัว revalidatePath('/crm/<id>') เอง → ไม่ต้องสั่งรีเฟรชหน้าตามหลัง
export default function LeadDetail({ lead, activities, settings, users, installments: initialInstallments, eventStaffGroups = [], linkedEvents = [], costSummary, leadJobs = [], role = null, packagePicker }: LeadDetailProps) {
  const router = useRouter()
  const { locale, t } = useLocale()
  const tc = t.crm.detail
  const ts = t.crm.statuses
  const L = (th: string, en: string) => (locale === 'th' ? th : en)
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm()
  const [loading, setLoading] = useState(false)
  // การ์ดกิจกรรมพับได้ (การ์ดลูกค้า/อีเวนต์/การเงินพับเองใน LeadCards)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleCollapse = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  // ชื่อลูกค้าที่กำลังพิมพ์ในการ์ดลูกค้า — หัวหน้าแสดงตามทันที
  const [draftName, setDraftName] = useState<string | null>(null)
  // แท็กแก้แยกจากการ์ด (บันทึกทันทีที่กด)
  const [tags, setTags] = useState<string[]>(lead.tags || [])
  const [activityType, setActivityType] = useState('note')
  const [activityDesc, setActivityDesc] = useState('')
  const [addingActivity, setAddingActivity] = useState(false)
  const [mentionedActivityUsers, setMentionedActivityUsers] = useState<string[]>([])
  // Staff role settings — still needed to render role labels/colors in the read-only
  // per-event staff display (staff is edited per event, not here).
  const staffRoles = settings.filter(s => s.category === 'staff_role' && s.is_active).sort((a, b) => a.sort_order - b.sort_order)

  const getStatusLabel = (status: string) => {
    const cfg = getStatusConfig(settings, status)
    return ts[status] || cfg.labelTh || cfg.label || status
  }

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
    const newTags = isSelected ? tags.filter(t => t !== tagValue) : [...tags, tagValue]
    setTags(newTags)
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <LeadHeader
        lead={lead}
        displayName={draftName ?? lead.customer_name}
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

      <TagsBar settings={settings} tags={tags} status={lead.status} loading={loading} getStatusLabel={getStatusLabel} onToggle={handleToggleTag} />

      <StaffCard eventStaffGroups={eventStaffGroups} staffRoles={staffRoles} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Customer + Event + Financial Info */}
        <LeadCards
          lead={lead}
          settings={settings}
          installments={initialInstallments}
          packagePicker={packagePicker}
          onCustomerNameDraft={setDraftName}
          askConfirm={askConfirm}
        />

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
