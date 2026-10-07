'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { EquipmentCategory } from '../stock/categories'

const NONE = 'none'

/** ช่องเลือกประเภทอุปกรณ์ในฟอร์ม — ส่งค่าเป็น field category_id (ว่าง = ไม่ระบุ) */
export function CategorySelect({ categories, defaultValue, id }: { categories: EquipmentCategory[]; defaultValue?: string | null; id?: string }) {
  const [value, setValue] = useState(defaultValue || NONE)
  return (
    <>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="ไม่ระบุ" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>ไม่ระบุ</SelectItem>
          {categories.map(c => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
              {!c.is_active && ' (ปิดใช้)'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name="category_id" value={value === NONE ? '' : value} />
    </>
  )
}
