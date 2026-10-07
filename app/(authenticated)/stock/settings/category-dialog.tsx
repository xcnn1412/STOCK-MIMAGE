'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { EquipmentCategory } from '../categories'
import { createCategory, updateCategory } from './actions'

/** กล่องเพิ่ม/แก้ประเภทอุปกรณ์ — category = null คือเพิ่มใหม่ · เปิดเมื่อ mount ปิดด้วย onClose */
export default function CategoryDialog({ category, onClose }: { category: EquipmentCategory | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [salesPick, setSalesPick] = useState(category?.sales_pick ?? false)
  const [variants, setVariants] = useState((category?.variants ?? []).join('\n'))
  const [active, setActive] = useState(category?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const input = { name, sales_pick: salesPick, variants, is_active: active }
    const res = category ? await updateCategory(category.id, input) : await createCategory(input)
    setSaving(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success(category ? `บันทึกประเภท "${name.trim()}" แล้ว` : `เพิ่มประเภท "${name.trim()}" แล้ว`)
    onClose()
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'แก้ไขประเภทอุปกรณ์' : 'เพิ่มประเภทอุปกรณ์'}</DialogTitle>
          <DialogDescription>ประเภทใช้จัดกลุ่มอุปกรณ์และกระเป๋าที่ใช้แทนกันได้ เช่น กล้อง คอมพิวเตอร์ ตู้ประกอบ</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">ชื่อประเภท</Label>
            <Input id="cat-name" value={name} onChange={e => setName(e.target.value)} maxLength={60} required autoFocus placeholder="เช่น กล้อง" />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id="cat-sales-pick" checked={salesPick} onCheckedChange={v => setSalesPick(v === true)} className="mt-0.5" />
            <div className="space-y-0.5">
              <Label htmlFor="cat-sales-pick">ทีมขายเลือกชิ้นเอง</Label>
              <p className="text-xs text-muted-foreground">ติ๊กสำหรับประเภทตู้ ที่ลูกค้าเลือกหน้าตาเอง — ทีมขายจะเลือกชิ้นให้งานตอนเลือกแพ็กเกจ</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-variants">แบบประกอบ (ถ้ามี)</Label>
            <Textarea
              id="cat-variants"
              value={variants}
              onChange={e => setVariants(e.target.value)}
              rows={4}
              placeholder={'1 บรรทัดต่อ 1 แบบ เช่น\nประกอบ 1\nประกอบ 2'}
            />
            <p className="text-xs text-muted-foreground">ใช้ร่วมกันทุกชุดในประเภทนี้ เรียงตามบรรทัด ชื่อซ้ำจะถูกตัดออก (ไม่เกิน 20 แบบ)</p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="cat-active" checked={active} onCheckedChange={v => setActive(v === true)} />
            <Label htmlFor="cat-active">เปิดใช้</Label>
          </div>

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
