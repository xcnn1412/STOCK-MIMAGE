'use client'

import { useState, useMemo } from 'react'
import { KPI_CYCLES } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { CalendarDays, Plus } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { KpiTemplate, Profile } from '@/types/database.types'

const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const MONTH_NAMES_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** Get last day of a month */
function getLastDay(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Generate month options: current month + next 11 months */
function generateMonthOptions(): { key: string; label: string; year: number; month: number }[] {
  const now = new Date()
  const months: { key: string; label: string; year: number; month: number }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    const buddhistYear = y + 543
    months.push({ key, label: `${MONTH_NAMES_TH[m]} ${buddhistYear}`, year: y, month: m })
  }
  return months
}

interface AssignmentFormProps {
  open: boolean
  onClose: () => void
  templates: Pick<KpiTemplate, 'id' | 'name' | 'mode' | 'default_target' | 'target_unit'>[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department' | 'role'>[]
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
  error?: string
  success?: boolean
}

export default function AssignmentForm({ open, onClose, templates, profiles, onSubmit }: AssignmentFormProps) {
  const { t } = useLocale()
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedCycle, setSelectedCycle] = useState('monthly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [baseTarget, setBaseTarget] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedMonths, setSelectedMonths] = useState<Record<string, boolean>>({})
  const [monthTargets, setMonthTargets] = useState<Record<string, string>>({})

  const selectedTemplate = templates.find(tmpl => tmpl.id === selectedTemplateId)
  const monthOptions = useMemo(() => generateMonthOptions(), [])

  // Toggle a month in bulk mode
  const toggleMonth = (key: string) => {
    setSelectedMonths(prev => {
      const next = { ...prev }
      if (next[key]) {
        delete next[key]
      } else {
        next[key] = true
      }
      return next
    })
  }

  // Fill all selected months with base target
  const fillAllWithBase = () => {
    const val = baseTarget || selectedTemplate?.default_target?.toString() || ''
    const newTargets: Record<string, string> = {}
    Object.keys(selectedMonths).forEach(key => {
      newTargets[key] = val
    })
    setMonthTargets(prev => ({ ...prev, ...newTargets }))
  }

  const resetForm = () => {
    setSelectedTemplateId('')
    setSelectedCycle('monthly')
    setBaseTarget('')
    setBulkMode(false)
    setSelectedMonth('')
    setSelectedMonths({})
    setMonthTargets({})
    setError('')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const form = e.currentTarget
    const formData = new FormData(form)

    // Get common fields
    const assigned_to = formData.get('assigned_to') as string
    const template_id = formData.get('template_id') as string
    const target_unit = formData.get('target_unit') as string
    const weight = formData.get('weight') as string
    const cycle = formData.get('cycle') as string

    // Determine which months to create
    const monthsToCreate: { key: string; target: string }[] = []

    if (bulkMode) {
      // Bulk mode — create one record per selected month
      const sortedMonths = Object.keys(selectedMonths).sort()
      if (sortedMonths.length === 0) {
        setError('กรุณาเลือกอย่างน้อย 1 เดือน')
        setLoading(false)
        return
      }
      for (const key of sortedMonths) {
        const target = monthTargets[key] || baseTarget
        if (!target || isNaN(Number(target))) {
          setError(`กรุณากรอกเป้าหมายสำหรับ ${key}`)
          setLoading(false)
          return
        }
        monthsToCreate.push({ key, target })
      }
    } else {
      // Single month
      if (!selectedMonth) {
        setError('กรุณาเลือกเดือน')
        setLoading(false)
        return
      }
      monthsToCreate.push({ key: selectedMonth, target: baseTarget })
    }

    // Create each month as a separate assignment
    for (const { key, target } of monthsToCreate) {
      const [y, m] = key.split('-').map(Number)
      const periodStart = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = getLastDay(y, m - 1)
      const periodEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const fd = new FormData()
      fd.set('assigned_to', assigned_to)
      fd.set('template_id', template_id)
      fd.set('target', target)
      fd.set('target_unit', target_unit)
      fd.set('weight', weight)
      fd.set('cycle', cycle)
      fd.set('period_start', periodStart)
      fd.set('period_end', periodEnd)

      const result = await onSubmit(fd)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
        return
      }
    }

    // Success
    onClose()
    resetForm()
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); resetForm() } }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {t.kpi.assignmentForm.title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Employee select */}
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.kpi.assignmentForm.employeeLabel}</label>
            <Select name="assigned_to" required>
              <SelectTrigger>
                <SelectValue placeholder={t.kpi.assignmentForm.employeePlaceholder} />
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

          {/* Template select */}
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.kpi.assignmentForm.templateLabel}</label>
            <Select
              name="template_id"
              value={selectedTemplateId}
              onValueChange={(v) => {
                setSelectedTemplateId(v)
                const tmpl = templates.find(t => t.id === v)
                if (tmpl?.default_target) setBaseTarget(tmpl.default_target.toString())
              }}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder={t.kpi.assignmentForm.templatePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((tmpl) => (
                  <SelectItem key={tmpl.id} value={tmpl.id}>
                    {tmpl.name} ({t.kpi.modes[tmpl.mode] || tmpl.mode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cycle (hidden default monthly) */}
          <input type="hidden" name="cycle" value={selectedCycle} />

          {/* Target + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t.kpi.assignmentForm.targetLabel}
                {bulkMode && <span className="text-[10px] text-muted-foreground ml-1">(ค่าเริ่มต้น)</span>}
              </label>
              <Input
                name="target"
                type="number"
                value={baseTarget}
                onChange={(e) => setBaseTarget(e.target.value)}
                min={0}
                step="0.01"
                required={!bulkMode}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.kpi.assignmentForm.unitLabel}</label>
              <Input
                name="target_unit"
                defaultValue={selectedTemplate?.target_unit || ''}
                placeholder={t.kpi.assignmentForm.unitPlaceholder}
              />
            </div>
          </div>

          {/* Weight */}
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t.kpi.assignmentForm.weightLabel}</label>
            <Input
              name="weight"
              type="number"
              defaultValue={0}
              min={0}
              max={100}
              placeholder={t.kpi.assignmentForm.weightPlaceholder}
            />
          </div>

          {/* ─── Month Selection ─── */}
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">เลือกเดือน</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bulk-mode"
                  checked={bulkMode}
                  onCheckedChange={(v) => {
                    setBulkMode(!!v)
                    if (!v) {
                      setSelectedMonths({})
                      setMonthTargets({})
                    }
                  }}
                />
                <label htmlFor="bulk-mode" className="text-xs text-muted-foreground cursor-pointer">
                  สร้างหลายเดือนพร้อมกัน
                </label>
              </div>
            </div>

            {!bulkMode ? (
              /* Single month picker */
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="เลือกเดือน..." />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              /* Bulk month grid */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">
                    {Object.keys(selectedMonths).length} เดือน
                  </Badge>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={fillAllWithBase}>
                    เติมค่าเป้าหลัก
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto">
                  {monthOptions.map(({ key, label, year, month }) => {
                    const isSelected = !!selectedMonths[key]
                    const buddhistYear = year + 543
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                          isSelected
                            ? 'border-zinc-400 dark:border-zinc-500 bg-zinc-50 dark:bg-zinc-800/50'
                            : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleMonth(key)}
                        />
                        <label className="text-sm font-medium w-28 shrink-0 cursor-pointer" onClick={() => toggleMonth(key)}>
                          {MONTH_NAMES_SHORT[month]} {buddhistYear}
                        </label>
                        {isSelected && (
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 text-sm flex-1"
                            placeholder={baseTarget || 'เป้าหมาย'}
                            value={monthTargets[key] || ''}
                            onChange={(e) =>
                              setMonthTargets(prev => ({ ...prev, [key]: e.target.value }))
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <p className="text-[10px] text-muted-foreground">
                  เดือนที่ไม่ได้กำหนดเป้าเฉพาะ จะใช้ค่าเป้าหลักด้านบน
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { onClose(); resetForm() }}>{t.kpi.common.cancel}</Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? t.kpi.common.saving
                : bulkMode
                  ? `สร้าง ${Object.keys(selectedMonths).length} รายการ`
                  : t.kpi.assignmentForm.submitBtn
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
