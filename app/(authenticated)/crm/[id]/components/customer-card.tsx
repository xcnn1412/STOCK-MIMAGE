'use client'

import { CardContent, Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { User } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { CrmSetting } from '../../types'
import PackagePicker from '../../../packages/package-picker'
import { CollapsibleCardHeader, CardEditActions, EditField, EditSelect, InfoRow, type EditableCardProps, type LeadPackagePickerData } from '../shared'

// Customer Info
export function CustomerCard({
  lead, form, updateForm, editing, collapsed, saving, onEdit, onToggle, onSave, onCancel, badge,
  settings, workTypeOptions, packagePicker, onPackagesSaved,
}: EditableCardProps & {
  settings: CrmSetting[]
  workTypeOptions: { value: string; label: string }[]
  /** แพ็กเกจของงาน (PackagePicker) — ไม่ส่ง = แสดงชื่อแพ็กเกจเดิมจาก package_name อย่างเดียว */
  packagePicker?: LeadPackagePickerData
  onPackagesSaved?: (result: { quotedPrice: number | null; packageName: string | null }) => void
}) {
  const { locale, t } = useLocale()
  const tc = t.crm.detail
  const getSettingLabel = (setting: CrmSetting) => locale === 'th' ? setting.label_th : setting.label_en
  const pkgSetting = settings.find(s => s.category === 'package' && s.value === lead.package_name)
  const sourceSetting = settings.find(s => s.category === 'lead_source' && s.value === lead.lead_source)
  const typeSetting = settings.find(s => s.category === 'customer_type' && s.value === lead.customer_type)
  const sources = settings.filter(s => s.category === 'lead_source' && s.is_active)
  const customerTypes = settings.filter(s => s.category === 'customer_type' && s.is_active)
  const workTypeLabel = workTypeOptions.find(o => o.value === lead.work_type)?.label
  // ชื่อแพ็กเกจเดิม: คีย์ crm_settings ของงานเก่า → ป้าย · งานที่เลือกแพ็กเกจใหม่เก็บชื่อไว้ตรงๆ (fallback ค่าดิบ)
  const legacyPackage = pkgSetting ? getSettingLabel(pkgSetting) : lead.package_name
  // แถวแพ็กเกจแบบชิป (โหมดดูเมื่อมีแพ็กเกจของงาน · โหมดแก้ = เลือก/แก้ได้) — บันทึกแยกจากปุ่มบันทึกของการ์ดด้วย setLeadPackages
  const packageRow = (canEdit: boolean) => packagePicker && (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0 w-28">{tc.package}</span>
      <PackagePicker
        leadId={lead.id}
        event={{ date: lead.event_date, time: lead.event_time, endTime: lead.event_end_time }}
        value={packagePicker.value}
        packages={packagePicker.packages}
        categoryUnits={packagePicker.categoryUnits}
        unitBookings={packagePicker.unitBookings}
        warnings={packagePicker.warnings}
        canEdit={canEdit}
        onSaved={onPackagesSaved}
        legacyName={legacyPackage}
        className="flex-1"
      />
    </div>
  )
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
      <CollapsibleCardHeader
        collapsed={collapsed}
        icon={<User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
        iconBg="bg-blue-50 dark:bg-blue-950/40"
        title={tc.customerInfo}
        badge={badge}
        editing={editing} onEdit={onEdit} onToggle={onToggle}
      />
      {!collapsed && (
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
                options={customerTypes.map(s => ({ id: s.id, value: s.value, label: getSettingLabel(s) }))}
                placeholder={tc.selectType}
              />
              <EditSelect
                label={locale === 'th' ? 'ประเภทงาน' : 'Work Type'}
                value={form.work_type}
                onChange={v => updateForm('work_type', v)}
                options={workTypeOptions}
                placeholder={locale === 'th' ? 'เลือกประเภทงาน' : 'Select work type'}
              />
              {form.work_type === 'sale' && (
                <EditField label={locale === 'th' ? 'จำนวนตู้' : 'Units'} type="number" value={form.unit_count} onChange={v => updateForm('unit_count', v)} placeholder="1" />
              )}
              <EditSelect
                label={tc.channel}
                value={form.lead_source}
                onChange={v => updateForm('lead_source', v)}
                options={sources.map(s => ({ id: s.id, value: s.value, label: getSettingLabel(s) }))}
                placeholder={tc.selectSource}
              />
              {packagePicker ? packageRow(packagePicker.canEdit) : <InfoRow label={tc.package} value={legacyPackage} />}
              <div className="flex items-center justify-between">
                <Label className="text-xs text-zinc-500">{tc.returningCustomer}</Label>
                <Switch
                  checked={form.is_returning}
                  onCheckedChange={v => updateForm('is_returning', v)}
                />
              </div>
              <CardEditActions saving={saving} onSave={onSave} onCancel={onCancel} />
            </div>
          ) : (
            <>
              <InfoRow label={tc.name} value={lead.customer_name} />
              <InfoRow label={tc.lineId} value={lead.customer_line} />
              <InfoRow label={tc.phone} value={lead.customer_phone} />
              <InfoRow label={tc.type} value={typeSetting ? getSettingLabel(typeSetting) : lead.customer_type} />
              <InfoRow label={locale === 'th' ? 'ประเภทงาน' : 'Work Type'} value={workTypeLabel || lead.work_type} />
              {lead.work_type === 'sale' && (
                <InfoRow label={locale === 'th' ? 'จำนวนตู้' : 'Units'} value={String(lead.unit_count && lead.unit_count > 0 ? lead.unit_count : 1)} />
              )}
              <InfoRow label={tc.channel} value={sourceSetting ? getSettingLabel(sourceSetting) : lead.lead_source} />
              {packagePicker && packagePicker.value.length > 0
                ? packageRow(false)
                : <InfoRow label={tc.package} value={legacyPackage} />}
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}
