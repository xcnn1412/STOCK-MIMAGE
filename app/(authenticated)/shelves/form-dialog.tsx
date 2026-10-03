'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** กล่องฟอร์มสั้นๆ — onSubmit คืน true เมื่อสำเร็จ (ปิดกล่อง) */
export default function FormDialog({
  title,
  fields,
  hint,
  onClose,
  onSubmit,
}: {
  title: string
  fields: { key: string; label: string; initial: string; type?: 'text' | 'number'; placeholder?: string }[]
  hint?: string
  onClose: () => void
  onSubmit: (values: Record<string, string>) => Promise<boolean>
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map(f => [f.key, f.initial])))
  const [saving, setSaving] = useState(false)
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async e => {
            e.preventDefault()
            setSaving(true)
            const ok = await onSubmit(values)
            setSaving(false)
            if (ok) onClose()
          }}
        >
          {fields.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
              <Input
                id={`f-${f.key}`}
                type={f.type ?? 'text'}
                value={values[f.key]}
                placeholder={f.placeholder}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                required
              />
            </div>
          ))}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
