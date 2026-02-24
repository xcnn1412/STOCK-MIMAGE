'use client'

import { useState } from 'react'
import { KPI_MODES, KPI_CYCLES, MODE_CONFIG_FIELDS, type KpiMode } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import type { KpiTemplate, Profile } from '@/types/database.types'

interface AssignmentFormProps {
  open: boolean
  onClose: () => void
  templates: Pick<KpiTemplate, 'id' | 'name' | 'mode' | 'default_target' | 'target_unit'>[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department' | 'role'>[]
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
}

export default function AssignmentForm({ open, onClose, templates, profiles, onSubmit }: AssignmentFormProps) {
  const [isCustom, setIsCustom] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [customMode, setCustomMode] = useState<KpiMode>('task')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const formData = new FormData(form)

    if (isCustom) {
      // สร้าง config สำหรับ custom KPI
      const configFields = MODE_CONFIG_FIELDS[customMode]
      const config: Record<string, unknown> = {}
      configFields.forEach((field) => {
        const val = formData.get(`config_${field.key}`)
        config[field.key] = field.type === 'number' ? Number(val) || 0 : val
        formData.delete(`config_${field.key}`)
      })
      formData.set('custom_config', JSON.stringify(config))
      formData.set('custom_mode', customMode)
      formData.delete('template_id')
    } else {
      formData.delete('custom_name')
      formData.delete('custom_mode')
      formData.delete('custom_config')
    }

    const result = await onSubmit(formData)

    if (result?.error) {
      setError(result.error)
    } else {
      onClose()
      setIsCustom(false)
      setSelectedTemplateId('')
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>มอบหมาย KPI</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* เลือกพนักงาน */}
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">พนักงาน</label>
            <Select name="assigned_to" required>
              <SelectTrigger>
                <SelectValue placeholder="เลือกพนักงาน" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name} {p.department ? `(${p.department})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Toggle: ใช้ Template หรือ Custom */}
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="is_custom"
              checked={isCustom}
              onCheckedChange={(v) => setIsCustom(!!v)}
            />
            <label htmlFor="is_custom" className="text-sm font-medium cursor-pointer">
              สร้าง KPI แบบ Custom (ไม่ใช้ Template)
            </label>
          </div>

          {/* เลือก Template หรือ Custom fields */}
          {!isCustom ? (
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">เลือก Template</label>
              <Select
                name="template_id"
                value={selectedTemplateId}
                onValueChange={setSelectedTemplateId}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="เลือก KPI Template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({KPI_MODES.find(m => m.value === t.mode)?.labelTh})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3 border border-zinc-200 dark:border-zinc-700 rounded-lg p-3">
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ชื่อ KPI</label>
                <Input name="custom_name" required placeholder="เช่น ดูแลลูกค้า VIP" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ประเภท</label>
                <Select value={customMode} onValueChange={(v) => setCustomMode(v as KpiMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KPI_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.labelTh}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Dynamic config fields */}
              {MODE_CONFIG_FIELDS[customMode].map((field) => (
                <div key={field.key}>
                  <label className="text-sm text-zinc-600 dark:text-zinc-400">{field.label}</label>
                  <Input name={`config_${field.key}`} type={field.type} placeholder={field.label} />
                </div>
              ))}
            </div>
          )}

          {/* Target */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">เป้าหมาย</label>
              <Input
                name="target"
                type="number"
                defaultValue={selectedTemplate?.default_target || 0}
                min={0}
                step="0.01"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">หน่วย</label>
              <Input
                name="target_unit"
                defaultValue={selectedTemplate?.target_unit || ''}
                placeholder="เช่น บาท, ชิ้น, %"
              />
            </div>
          </div>

          {/* Cycle */}
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">รอบการประเมิน</label>
            <Select name="cycle" required>
              <SelectTrigger>
                <SelectValue placeholder="เลือกรอบ" />
              </SelectTrigger>
              <SelectContent>
                {KPI_CYCLES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.labelTh}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">เริ่มต้น</label>
              <Input name="period_start" type="date" required />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">สิ้นสุด</label>
              <Input name="period_end" type="date" required />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'กำลังบันทึก...' : 'มอบหมาย KPI'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
