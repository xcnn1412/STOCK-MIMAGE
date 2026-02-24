'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import TemplateForm from './template-form'
import { createTemplate, updateTemplate, deleteTemplate } from '../actions'
import { KPI_MODES } from '../types'
import { useLocale } from '@/lib/i18n/context'
import type { KpiTemplate } from '@/types/database.types'

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()

const modeBadgeColors: Record<string, string> = {
  task: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  sales: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cost_reduction: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
}

export default function TemplatesView({ templates }: { templates: KpiTemplate[] }) {
  const { t } = useLocale()
  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<KpiTemplate | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function handleEdit(template: KpiTemplate) {
    setEditingTemplate(template)
    setShowForm(true)
  }

  function handleClose() {
    setShowForm(false)
    setEditingTemplate(null)
  }

  async function handleSubmit(formData: FormData) {
    if (editingTemplate) {
      return await updateTemplate(editingTemplate.id, formData)
    }
    return await createTemplate(formData)
  }

  async function handleDelete() {
    if (!deleteId) return
    await deleteTemplate(deleteId)
    setDeleteId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t.kpi.templates.title}</h2>
          <p className="text-sm text-muted-foreground">{t.kpi.templates.subtitle}</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t.kpi.templates.createBtn}
        </Button>
      </div>

      {/* Template Cards */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t.kpi.templates.emptyState}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((tmpl) => {
            const modeInfo = KPI_MODES.find((m) => m.value === tmpl.mode)
            return (
              <Card key={tmpl.id} className="group relative hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-semibold">{tmpl.name}</CardTitle>
                    <Badge className={`text-xs ${modeBadgeColors[tmpl.mode] || ''}`}>
                      {t.kpi.modes[modeInfo?.value || tmpl.mode] || tmpl.mode}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {tmpl.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{tmpl.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{t.kpi.common.target}:</span>
                    <span className="font-medium">{fmt(tmpl.default_target)} {tmpl.target_unit}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(tmpl)} className="gap-1">
                      <Pencil className="h-3 w-3" />
                      {t.kpi.common.edit}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteId(tmpl.id)} className="gap-1 text-red-600 hover:text-red-700">
                      <Trash2 className="h-3 w-3" />
                      {t.kpi.common.delete}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Template Form Dialog */}
      <TemplateForm
        open={showForm}
        onClose={handleClose}
        template={editingTemplate}
        onSubmit={handleSubmit}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.kpi.templates.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.kpi.templates.deleteDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.kpi.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {t.kpi.templates.deleteBtn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
