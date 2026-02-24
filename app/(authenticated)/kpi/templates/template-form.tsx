'use client'

import { useState } from 'react'
import { KPI_MODES, MODE_CONFIG_FIELDS, type KpiMode } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { KpiTemplate } from '@/types/database.types'

interface TemplateFormProps {
  open: boolean
  onClose: () => void
  template?: KpiTemplate | null
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
}

export default function TemplateForm({ open, onClose, template, onSubmit }: TemplateFormProps) {
  const [mode, setMode] = useState<KpiMode>((template?.mode as KpiMode) || 'task')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const configFields = MODE_CONFIG_FIELDS[mode]
  const existingConfig = (template?.config || {}) as Record<string, string | number>

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const formData = new FormData(form)

    // สร้าง config object จาก dynamic fields
    const config: Record<string, unknown> = {}
    configFields.forEach((field) => {
      const val = formData.get(`config_${field.key}`)
      config[field.key] = field.type === 'number' ? Number(val) || 0 : val
    })
    formData.set('config', JSON.stringify(config))
    // ลบ config_ fields ออก
    configFields.forEach((field) => formData.delete(`config_${field.key}`))

    const result = await onSubmit(formData)

    if (result?.error) {
      setError(result.error)
    } else {
      onClose()
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'แก้ไข Template' : 'สร้าง KPI Template ใหม่'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ชื่อ Template */}
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ชื่อ Template</label>
            <Input name="name" defaultValue={template?.name || ''} required placeholder="เช่น ยอดขายรายเดือน" />
          </div>

          {/* Mode */}
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ประเภท KPI</label>
            <Select name="mode" value={mode} onValueChange={(v) => setMode(v as KpiMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KPI_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.labelTh} ({m.label})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* คำอธิบาย */}
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">คำอธิบาย</label>
            <Textarea name="description" defaultValue={template?.description || ''} placeholder="อธิบาย KPI นี้..." rows={2} />
          </div>

          {/* เป้าหมาย default */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">เป้าหมาย Default</label>
              <Input name="default_target" type="number" defaultValue={template?.default_target || 0} min={0} step="0.01" />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">หน่วย</label>
              <Input name="target_unit" defaultValue={template?.target_unit || ''} placeholder="เช่น บาท, ชิ้น, %" />
            </div>
          </div>

          {/* Dynamic config fields ตาม mode */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 pt-4 mt-4">
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-3">
              ตั้งค่าเฉพาะ — {KPI_MODES.find(m => m.value === mode)?.labelTh}
            </p>
            <div className="space-y-3">
              {configFields.map((field) => (
                <div key={field.key}>
                  <label className="text-sm text-zinc-600 dark:text-zinc-400">{field.label}</label>
                  <Input
                    name={`config_${field.key}`}
                    type={field.type}
                    defaultValue={existingConfig[field.key] ?? ''}
                    placeholder={field.label}
                  />
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'กำลังบันทึก...' : template ? 'บันทึก' : 'สร้าง Template'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
