'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Boxes, ListChecks, Loader2, Plus, Save, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { EquipmentCategory } from '../../stock/categories'
import { MAX_PACKAGE_NAME, MAX_REQUIREMENT_QTY } from '../package-logic'
import type { CategoryUnits, Package, PackageDetail } from '../types'
import { createPackage, setPackageRequirements, updatePackage, type PackageInput } from '../actions'
import OptionsPicker from './options-picker'

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'

/** ฟอร์มข้อมูลแพ็กเกจ (ชื่อ/รายละเอียด/ราคา/เปิดใช้) — ใช้ทั้งหน้าเพิ่มและหน้าแก้ */
export function PackageInfoForm({ initial, submitLabel, onSubmit }: { initial?: Package; submitLabel: string; onSubmit: (input: PackageInput) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [price, setPrice] = useState(initial?.price === null || initial?.price === undefined ? '' : String(initial.price))
  const [active, setActive] = useState(initial?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSubmit({ name, description, price, is_active: active })
    setSaving(false)
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-1.5">
          <Label htmlFor="pkg-name">ชื่อแพ็กเกจ</Label>
          <Input id="pkg-name" value={name} onChange={e => setName(e.target.value)} maxLength={MAX_PACKAGE_NAME} required placeholder="เช่น Selfie studio booth" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pkg-price">ราคา (บาท)</Label>
          <Input id="pkg-price" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="ไม่ระบุ" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pkg-desc">รายละเอียด</Label>
        <Textarea id="pkg-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="ไม่บังคับ" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox id="pkg-active" checked={active} onCheckedChange={v => setActive(v === true)} />
          <Label htmlFor="pkg-active">เปิดใช้ (ทีมขายเลือกได้)</Label>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** หน้าเพิ่มแพ็กเกจ — สร้างแล้วไปหน้าแก้ข้อกำหนด */
export function NewPackageForm() {
  const router = useRouter()
  return (
    <PackageInfoForm
      submitLabel="สร้างแพ็กเกจ"
      onSubmit={async input => {
        const res = await createPackage(input)
        if ('error' in res) {
          toast.error(res.error)
          return
        }
        toast.success(`สร้างแพ็กเกจ "${input.name.trim()}" แล้ว — ตั้งอุปกรณ์ที่ใช้ต่อได้เลย`)
        router.push(`/packages/${res.id}`)
      }}
    />
  )
}

interface Row {
  categoryId: string
  /** ข้อความในช่องจำนวน — ตรวจตอนบันทึก */
  quantity: string
  note: string | null
  optionItemIds: string[]
  optionKitIds: string[]
}

export default function PackageEditor({ pkg, categories, units }: { pkg: PackageDetail; categories: EquipmentCategory[]; units: CategoryUnits }) {
  const [rows, setRows] = useState<Row[]>(() =>
    pkg.requirements.map(r => ({ categoryId: r.category_id, quantity: String(r.quantity), note: r.note, optionItemIds: r.optionItemIds, optionKitIds: r.optionKitIds })),
  )
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState<number | null>(null)

  const catById = new Map(categories.map(c => [c.id, c]))
  const used = new Set(rows.map(r => r.categoryId))
  const addable = categories.filter(c => c.is_active && !used.has(c.id))
  // ชื่อประเภทที่ไม่อยู่ในรายการ (ถูกลบ/ไม่ได้โหลด) ใช้ชื่อจากข้อกำหนดเดิม
  const nameOf = (id: string) => catById.get(id)?.name ?? pkg.requirements.find(r => r.category_id === id)?.category_name ?? 'ประเภทที่ถูกลบ'
  const choosableOf = (id: string) => (units[id] ?? []).filter(u => !u.inKit)

  const update = (i: number, patch: Partial<Row>) => {
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const saveInfo = async (input: PackageInput) => {
    const res = await updatePackage(pkg.id, input)
    if ('error' in res) toast.error(res.error)
    else toast.success('บันทึกข้อมูลแพ็กเกจแล้ว')
  }

  const saveRequirements = async () => {
    setSaving(true)
    const res = await setPackageRequirements(
      pkg.id,
      rows.map(r => ({ categoryId: r.categoryId, quantity: Number(r.quantity), note: r.note, optionItemIds: r.optionItemIds, optionKitIds: r.optionKitIds })),
    )
    setSaving(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setDirty(false)
    toast.success('บันทึกข้อกำหนดแล้ว')
  }

  const pickingRow = picking === null ? null : rows[picking]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/packages">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> แพ็กเกจทั้งหมด
          </Button>
        </Link>
      </div>
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight wrap-break-word md:text-3xl">
        <Boxes className="h-6 w-6 shrink-0 text-zinc-500" /> {pkg.name}
      </h2>

      <Card className="p-4">
        <PackageInfoForm initial={pkg} submitLabel="บันทึกข้อมูล" onSubmit={saveInfo} />
      </Card>

      <section className="space-y-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="h-5 w-5 text-zinc-500" /> ข้อกำหนด
          </h3>
          <p className="text-sm text-muted-foreground">ประเภทอุปกรณ์ที่แพ็กเกจนี้ใช้ จำนวนต่อชุด และชิ้นที่เลือกใช้ได้ (ไม่เลือก = ทุกชิ้นในประเภท)</p>
        </div>

        {rows.length === 0 && <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">ยังไม่ตั้งอุปกรณ์ — เพิ่มประเภทด้านล่าง</div>}

        <div className="space-y-2">
          {rows.map((r, i) => {
            const cat = catById.get(r.categoryId)
            const choosable = choosableOf(r.categoryId)
            const valid = new Set(choosable.map(u => `${u.kind}:${u.id}`))
            const picked = r.optionItemIds.filter(id => valid.has(`item:${id}`)).length + r.optionKitIds.filter(id => valid.has(`kit:${id}`)).length
            return (
              <Card key={r.categoryId} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium wrap-break-word">{nameOf(r.categoryId)}</span>
                    {cat?.sales_pick && <span className={cn(PILL, 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200')}>ทีมขายเลือกชิ้นเอง</span>}
                    {cat && !cat.is_active && <span className={cn(PILL, 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>ประเภทปิดใช้</span>}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-auto max-w-full whitespace-normal py-1 text-left" onClick={() => setPicking(i)}>
                    {picked ? `ตัวเลือก: เลือกแล้ว ${picked} ชิ้น` : `ตัวเลือก: ทุกชิ้นในประเภท (${choosable.length} ชิ้น)`}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`qty-${i}`} className="text-sm text-muted-foreground">
                    จำนวน
                  </Label>
                  <Input
                    id={`qty-${i}`}
                    type="number"
                    min={1}
                    max={MAX_REQUIREMENT_QTY}
                    step={1}
                    value={r.quantity}
                    onChange={e => update(i, { quantity: e.target.value })}
                    className="w-20"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="ลบแถว"
                    title="ลบแถว"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      setRows(prev => prev.filter((_, j) => j !== i))
                      setDirty(true)
                    }}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select
            value=""
            onValueChange={id => {
              setRows(prev => [...prev, { categoryId: id, quantity: '1', note: null, optionItemIds: [], optionKitIds: [] }])
              setDirty(true)
            }}
            disabled={addable.length === 0}
          >
            <SelectTrigger className="w-full sm:w-64">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder={addable.length ? 'เพิ่มประเภทอุปกรณ์' : 'เพิ่มครบทุกประเภทแล้ว'} />
            </SelectTrigger>
            <SelectContent>
              {addable.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={saveRequirements} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            บันทึกข้อกำหนด
          </Button>
        </div>
        {dirty && <p className="text-right text-xs text-amber-700 dark:text-amber-300">มีการแก้ข้อกำหนดที่ยังไม่บันทึก</p>}
      </section>

      {pickingRow && picking !== null && (
        <OptionsPicker
          key={pickingRow.categoryId}
          categoryName={nameOf(pickingRow.categoryId)}
          units={units[pickingRow.categoryId] ?? []}
          itemIds={pickingRow.optionItemIds}
          kitIds={pickingRow.optionKitIds}
          onApply={(optionItemIds, optionKitIds) => update(picking, { optionItemIds, optionKitIds })}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}
