'use client'

import { useState } from 'react'
import { KPI_MODES, type KpiMode } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLocale } from '@/lib/i18n/context'
import type { KpiTemplate } from '@/types/database.types'

interface TemplateFormProps {
  open: boolean
  onClose: () => void
  template: KpiTemplate | null
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
}

export default function TemplateForm({ open, onClose, template, onSubmit }: TemplateFormProps) {
  const { t } = useLocale()
  const [mode, setMode] = useState<KpiMode>((template?.mode as KpiMode) || 'task')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const formData = new FormData(form)



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
          <DialogTitle>{template ? t.kpi.templateForm.editTitle : t.kpi.templateForm.createTitle}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t.kpi.templateForm.nameLabel}</label>
            <Input name="name" required defaultValue={template?.name || ''} placeholder={t.kpi.templateForm.namePlaceholder} />
          </div>

          <div>
            <label className="text-sm font-medium">{t.kpi.templateForm.modeLabel}</label>
            <Select name="mode" value={mode} onValueChange={(v) => setMode(v as KpiMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KPI_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{t.kpi.modes[m.value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">{t.kpi.templateForm.descriptionLabel}</label>
            <Textarea name="description" defaultValue={template?.description || ''} placeholder={t.kpi.templateForm.descriptionPlaceholder} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">{t.kpi.templateForm.defaultTarget}</label>
              <Input name="default_target" type="number" defaultValue={template?.default_target || 0} min={0} step="0.01" />
            </div>
            <div>
              <label className="text-sm font-medium">{t.kpi.templateForm.unit}</label>
              <Input name="target_unit" defaultValue={template?.target_unit || ''} placeholder={t.kpi.templateForm.unitPlaceholder} />
            </div>
          </div>



          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>{t.kpi.common.cancel}</Button>
            <Button type="submit" disabled={loading}>
              {loading ? t.kpi.common.saving : (template ? t.kpi.common.save : t.kpi.templateForm.createBtn)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
