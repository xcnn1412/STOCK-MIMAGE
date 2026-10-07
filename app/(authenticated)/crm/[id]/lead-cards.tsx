'use client'

// การ์ดลูกค้า / อีเวนต์ / การเงินของ lead พร้อม state ฟอร์มแก้ไขในที่ — ใช้ทั้งหน้า /crm/[id] และหน้าใบงาน /jobs/[id]

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  updateLead, saveAllInstallments, uploadPaymentProof, deletePaymentProof,
  type LeadInstallment,
} from '../actions'
import type { CrmLead, CrmSetting } from '../types'
import { useLocale } from '@/lib/i18n/context'
import { compressImage } from '@/lib/utils'
import type { useConfirm } from '../../finance/use-confirm'
import { buildLeadForm, toFormInstallments, type CardSection, type EditableCardProps, type LeadPackagePickerData, type LeadForm } from './shared'
import { CustomerCard } from './components/customer-card'
import { EventCard } from './components/event-card'
import { FinancialCard } from './components/financial-card'

interface LeadCardsProps {
  lead: CrmLead
  settings: CrmSetting[]
  installments: LeadInstallment[]
  packagePicker?: LeadPackagePickerData
  /** ป้ายต่อท้ายชื่อหัวการ์ดทั้ง 3 ใบ (หน้าใบงานใส่ "CRM") */
  badge?: ReactNode
  /** true = การ์ดทั้ง 3 พับตั้งต้น (หน้าใบงาน) */
  defaultCollapsed?: boolean
  /** เรียกหลังบันทึกสำเร็จ — หน้าที่ action ไม่ revalidate ให้ (เช่นหน้าใบงาน) ใช้รีเฟรชเอง */
  onSaved?: () => void
  /** ชื่อลูกค้าในฟอร์มขณะแก้การ์ดลูกค้า (null = เลิกแก้) — ให้หัวหน้าแสดงชื่อที่กำลังพิมพ์ */
  onCustomerNameDraft?: (name: string | null) => void
  /** กล่องยืนยันของหน้าแม่ (ลบสลิป) — dialog render ที่หน้าแม่ */
  askConfirm: ReturnType<typeof useConfirm>['confirm']
}

export function LeadCards({
  lead, settings, installments: initialInstallments, packagePicker, badge, defaultCollapsed = false,
  onSaved, onCustomerNameDraft, askConfirm,
}: LeadCardsProps) {
  const { locale } = useLocale()
  const L = (th: string, en: string) => (locale === 'th' ? th : en)
  const [saving, setSaving] = useState(false)
  // Per-card editing state
  const [editingCard, setEditingCard] = useState<CardSection | null>(null)
  // Collapsible state — defaults open (หน้าใบงานส่ง defaultCollapsed = พับ)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    defaultCollapsed ? { customer: true, event: true, financial: true } : {}
  )
  const toggleCollapse = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  const staffRoles = settings.filter(s => s.category === 'staff_role' && s.is_active).sort((a, b) => a.sort_order - b.sort_order)
  const staffRoleOptions = staffRoles.map(r => ({ value: r.value, label: locale === 'th' ? r.label_th : r.label_en }))
  const [uploadingInstallment, setUploadingInstallment] = useState<string | null>(null)
  const [localReceiptUrls, setLocalReceiptUrls] = useState<Record<string, string>>(
    Object.fromEntries(initialInstallments.filter(i => i.receipt_url).map(i => [i.id, i.receipt_url!]))
  )

  // ---------- Dynamic installments + tax state ----------
  const [formInstallments, setFormInstallments] = useState(toFormInstallments(initialInstallments))

  const buildForm = () => buildLeadForm(lead, settings)
  const [form, setForm] = useState<LeadForm>(buildForm)

  const updateForm = (key: keyof LeadForm, value: string | number | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'customer_name' && editingCard === 'customer') onCustomerNameDraft?.(String(value))
  }

  const workTypeOptions = [
    { value: 'sale', label: locale === 'th' ? 'ขาย' : 'Sale' },
    { value: 'event', label: locale === 'th' ? 'อีเวนต์' : 'Event' },
    { value: 'gp', label: 'GP' },
  ]

  const handleSaveCard = async (section: CardSection) => {
    setSaving(true)
    const formData = new FormData()

    // Choose which fields to save based on section
    const fieldsBySection: Record<CardSection, (keyof LeadForm)[]> = {
      customer: ['customer_name', 'customer_line', 'customer_phone', 'customer_type', 'work_type', 'unit_count', 'lead_source', 'is_returning'],
      event: ['event_date', 'event_end_date', 'event_time', 'event_end_time', 'event_location', 'event_details', 'required_roles'],
      // package_name ไม่ส่ง — แพ็กเกจบันทึกแยกด้วย setLeadPackages (ค่าในฟอร์มอาจเก่ากว่า แล้วทับชื่อที่เพิ่ง sync)
      financial: ['quoted_price', 'confirmed_price', 'deposit', 'vat_mode', 'wht_rate', 'quotation_ref', 'notes'],
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
    onCustomerNameDraft?.(null)
    onSaved?.()
  }

  const handleCancelCardEdit = () => {
    // Reset form to original lead data
    setForm(buildForm())
    setFormInstallments(toFormInstallments(initialInstallments))
    setEditingCard(null)
    onCustomerNameDraft?.(null)
  }

  const handleEdit = (section: CardSection) => {
    setEditingCard(section)
    onCustomerNameDraft?.(section === 'customer' ? form.customer_name : null)
  }

  // แพ็กเกจบันทึกแยกด้วย setLeadPackages — ฟอร์มการ์ดไม่รีเซ็ตตาม props จึงต้องตามชื่อ/ราคาเสนอที่ server เพิ่งเติมให้เอง
  const handlePackagesSaved = ({ quotedPrice, packageName }: { quotedPrice: number | null; packageName: string | null }) => {
    updateForm('package_name', packageName ?? '')
    if (quotedPrice !== null) updateForm('quoted_price', quotedPrice)
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
    lead, form, updateForm, saving, badge,
    editing: editingCard === section,
    collapsed: !!collapsed[section],
    onEdit: () => handleEdit(section),
    onToggle: () => toggleCollapse(section),
    onSave: () => handleSaveCard(section),
    onCancel: handleCancelCardEdit,
  })

  return (
    <div className="space-y-6">
      <CustomerCard
        {...cardProps('customer')}
        settings={settings}
        workTypeOptions={workTypeOptions}
        packagePicker={packagePicker}
        onPackagesSaved={handlePackagesSaved}
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
  )
}
