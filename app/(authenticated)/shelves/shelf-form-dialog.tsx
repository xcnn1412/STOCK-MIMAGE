'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ShelfInput } from './actions'

type Form = { zone: string; code: string; name: string; note: string }

/** ฟอร์มเพิ่ม/แก้ชั้น — onSubmit คืน true เมื่อบันทึกสำเร็จ (ปิดกล่อง) */
export default function ShelfFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial: Form
  onSubmit: (input: ShelfInput) => Promise<boolean>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* DialogContent ถูก unmount ตอนปิด → ฟอร์มเริ่มจาก initial ใหม่ทุกครั้งที่เปิด */}
        <ShelfForm initial={initial} onSubmit={onSubmit} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ShelfForm({
  initial,
  onSubmit,
  onDone,
}: {
  initial: Form
  onSubmit: (input: ShelfInput) => Promise<boolean>
  onDone: () => void
}) {
  const [form, setForm] = useState<Form>(initial)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <form
      className="space-y-4"
      onSubmit={async e => {
        e.preventDefault()
        setSaving(true)
        const ok = await onSubmit(form)
        setSaving(false)
        if (ok) onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="shelf-zone">โซน</Label>
          <Input id="shelf-zone" value={form.zone} onChange={set('zone')} placeholder="A" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="shelf-code">รหัสชั้น</Label>
          <Input id="shelf-code" value={form.code} onChange={set('code')} placeholder="A-01" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="shelf-name">ชื่อ (ไม่บังคับ)</Label>
        <Input id="shelf-name" value={form.name} onChange={set('name')} placeholder="เช่น ชั้นบน ฝั่งประตู" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="shelf-note">หมายเหตุ (ไม่บังคับ)</Label>
        <Textarea id="shelf-note" value={form.note} onChange={set('note')} rows={2} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>ยกเลิก</Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          บันทึก
        </Button>
      </DialogFooter>
    </form>
  )
}
