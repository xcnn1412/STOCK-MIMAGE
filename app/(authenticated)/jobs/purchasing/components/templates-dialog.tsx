'use client'

// หน้าต่างชุดรายการสำเร็จรูป — รายชื่อชุด (จำนวนรายการ) · สร้าง/แก้ (ชื่อชุด + แถว: ชื่อรายการ ประเภท จำนวน งบ) · ลบ
// แก้ชุดเดิม: ช่องที่ฟอร์มไม่แสดง (ร้าน ลิงก์ หมายเหตุ) คงค่าเดิมของแถวนั้น
// ลบได้เฉพาะคนสร้างชุด / แอดมิน / ฝ่ายประสานงาน (canDelete — server ตรวจซ้ำ) · ทุกคนที่ล็อกอินสร้าง/แก้ได้

import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { deletePurchaseTemplate, savePurchaseTemplate } from '../actions'
import {
    KIND_LABELS,
    MAX_TEMPLATE_ITEMS,
    PURCHASE_KINDS,
    canDelete,
    formatMoney,
    isPurchaseKind,
    validateTemplateInput,
    type PurchaseKind,
    type PurchaseTemplate,
    type PurchaseTemplateItem,
    type Viewer,
} from '../purchasing-logic'
import { ConfirmDelete, SAVE_FAILED, errorOf, useFocusReturn } from './shared'

/** แถวในฟอร์ม — base = รายการเดิมของชุด (เก็บช่องที่ฟอร์มไม่แสดงไว้ส่งกลับตามเดิม) */
interface TemplateRow {
    key: string
    title: string
    kind: PurchaseKind
    quantity: string
    est_price: string
    base: PurchaseTemplateItem | null
}

let rowSeq = 0
/** key ของแถว (เรียกใน event handler เท่านั้น) */
const rowKey = () => `row-${++rowSeq}`

const blankRow = (): TemplateRow => ({ key: rowKey(), title: '', kind: 'buy', quantity: '', est_price: '', base: null })

const toRow = (item: PurchaseTemplateItem): TemplateRow => ({
    key: rowKey(),
    title: item.title,
    kind: item.kind,
    quantity: item.quantity ?? '',
    est_price: item.est_price == null ? '' : String(item.est_price),
    base: item,
})

/** แถวที่ไม่ได้กรอกอะไรเลย — ทิ้งตอนบันทึก (ไม่นับเป็นรายการว่างที่ผิด) */
const isBlank = (row: TemplateRow) => !row.title.trim() && !row.quantity.trim() && !row.est_price.trim()

type Editing = { template: PurchaseTemplate | null } | null

export interface TemplatesDialogProps {
    templates: PurchaseTemplate[]
    viewer: Viewer
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus: (event: Event) => void
}

export function TemplatesDialog({ templates, viewer, onOpenChange, onCloseAutoFocus }: TemplatesDialogProps) {
    const uid = useId()
    const deleteFocus = useFocusReturn()
    /** null = หน้ารายชื่อชุด · { template: null } = สร้างชุดใหม่ · { template } = แก้ชุดนั้น */
    const [editing, setEditing] = useState<Editing>(null)
    const [name, setName] = useState('')
    const [rows, setRows] = useState<TemplateRow[]>([])
    const [error, setError] = useState<string | null>(null)
    const [confirming, setConfirming] = useState<PurchaseTemplate | null>(null)
    const [saving, startSaving] = useTransition()

    const startEdit = (template: PurchaseTemplate | null) => {
        setEditing({ template })
        setName(template?.name ?? '')
        setRows(template && template.items.length > 0 ? template.items.map(toRow) : [blankRow(), blankRow(), blankRow()])
        setError(null)
    }

    const setRow = (key: string, patch: Partial<TemplateRow>) => {
        setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))
        if (error) setError(null)
    }

    const save = () => {
        if (!editing) return
        const id = editing.template?.id ?? null
        // ช่องที่ฟอร์มไม่แสดง (ร้าน ลิงก์ หมายเหตุ) มาจาก base ของแถว — แถวใหม่ไม่มี
        const items = rows.filter(r => !isBlank(r)).map(r => ({
            vendor: r.base?.vendor ?? null,
            link_url: r.base?.link_url ?? null,
            note: r.base?.note ?? null,
            title: r.title,
            kind: r.kind,
            quantity: r.quantity,
            est_price: r.est_price,
        }))
        const checked = validateTemplateInput({ name, items })
        if (!checked.ok) {
            setError(checked.error)
            return
        }
        setError(null)
        startSaving(async () => {
            try {
                const failure = errorOf(await savePurchaseTemplate({ id, name: checked.value.name, items: checked.value.items }))
                if (failure) {
                    setError(failure)
                    return
                }
                toast.success(id ? 'บันทึกชุดสำเร็จรูปแล้ว' : 'สร้างชุดสำเร็จรูปแล้ว')
                setEditing(null)
            } catch (err) {
                console.error('[purchasing] save template:', err)
                setError(SAVE_FAILED)
            }
        })
    }

    const remove = (template: PurchaseTemplate) => {
        startSaving(async () => {
            try {
                const failure = errorOf(await deletePurchaseTemplate(template.id))
                if (failure) toast.error(failure)
                else toast.success(`ลบชุด "${template.name}" แล้ว`)
            } catch (err) {
                console.error('[purchasing] delete template:', err)
                toast.error(SAVE_FAILED)
            }
        })
    }

    return (
        <Dialog open onOpenChange={next => !saving && onOpenChange(next)}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>
                        {editing ? (editing.template ? 'แก้ชุดรายการสำเร็จรูป' : 'สร้างชุดรายการสำเร็จรูป') : 'ชุดรายการสำเร็จรูป'}
                    </DialogTitle>
                    <DialogDescription>
                        {editing
                            ? 'ชุดรายการที่ใช้บ่อย — กดใช้กับเช็กลิสต์แล้วได้รายการครบชุดในสถานะวางแผน'
                            : 'บันทึกชุดของที่ต้องซื้อบ่อยไว้ใช้ซ้ำ ไม่ต้องพิมพ์ใหม่ทุกงาน'}
                    </DialogDescription>
                </DialogHeader>

                {editing ? (
                    <form
                        noValidate
                        className="space-y-4"
                        onSubmit={e => {
                            e.preventDefault()
                            save()
                        }}
                    >
                        <div className="space-y-1.5">
                            <Label htmlFor={`${uid}-name`}>ชื่อชุด</Label>
                            <Input
                                id={`${uid}-name`}
                                value={name}
                                onChange={e => {
                                    setName(e.target.value)
                                    if (error) setError(null)
                                }}
                                placeholder="เช่น งานแต่งงาน — ชุดมาตรฐาน"
                                autoFocus
                            />
                        </div>

                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">
                                รายการ <span className="font-normal tabular-nums text-zinc-500">({rows.filter(r => !isBlank(r)).length})</span>
                            </legend>
                            {/* หัวคอลัมน์ — เฉพาะจอที่แถวเรียงเป็นบรรทัดเดียว */}
                            <div
                                aria-hidden
                                className="hidden gap-2 px-0.5 text-[11px] font-medium text-zinc-500 sm:grid sm:grid-cols-[minmax(0,1fr)_6rem_6.5rem_6rem_2.25rem]"
                            >
                                <span>ชื่อรายการ</span>
                                <span>ประเภท</span>
                                <span>จำนวน</span>
                                <span>งบ (บาท)</span>
                                <span />
                            </div>
                            <ol className="space-y-2">
                                {rows.map((row, i) => (
                                    // จอแคบ: ชื่อเต็มบรรทัด แล้ว ประเภท | จำนวน | งบ | ปุ่มเอาออก · จอกว้าง: บรรทัดเดียว
                                    <li
                                        key={row.key}
                                        className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)_2.25rem] gap-2 rounded-lg border border-zinc-200 p-2 sm:grid-cols-[minmax(0,1fr)_6rem_6.5rem_6rem_2.25rem] sm:border-0 sm:p-0 dark:border-zinc-800"
                                    >
                                        <Input
                                            value={row.title}
                                            onChange={e => setRow(row.key, { title: e.target.value })}
                                            placeholder="ชื่อรายการ"
                                            aria-label={`ชื่อรายการที่ ${i + 1}`}
                                            className="col-span-4 sm:col-span-1"
                                        />
                                        <Select
                                            value={row.kind}
                                            onValueChange={v => {
                                                if (isPurchaseKind(v)) setRow(row.key, { kind: v })
                                            }}
                                        >
                                            <SelectTrigger className="w-full" aria-label={`ประเภทของรายการที่ ${i + 1}`}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PURCHASE_KINDS.map(k => (
                                                    <SelectItem key={k} value={k}>
                                                        {KIND_LABELS[k]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            value={row.quantity}
                                            onChange={e => setRow(row.key, { quantity: e.target.value })}
                                            placeholder="จำนวน"
                                            aria-label={`จำนวนของรายการที่ ${i + 1}`}
                                        />
                                        <Input
                                            value={row.est_price}
                                            onChange={e => setRow(row.key, { est_price: e.target.value })}
                                            placeholder="งบ"
                                            inputMode="decimal"
                                            aria-label={`งบของรายการที่ ${i + 1} (บาท)`}
                                            className="tabular-nums"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 justify-self-end text-zinc-500"
                                            aria-label={`เอารายการที่ ${i + 1} ออก`}
                                            disabled={rows.length === 1}
                                            onClick={() => setRows(rs => rs.filter(r => r.key !== row.key))}
                                        >
                                            <X className="h-4 w-4" aria-hidden />
                                        </Button>
                                    </li>
                                ))}
                            </ol>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={rows.length >= MAX_TEMPLATE_ITEMS}
                                onClick={() => setRows(rs => [...rs, blankRow()])}
                            >
                                <Plus aria-hidden /> เพิ่มแถว
                            </Button>
                            {rows.length >= MAX_TEMPLATE_ITEMS && (
                                <p className="text-xs text-zinc-500">ชุดหนึ่งมีได้ไม่เกิน {MAX_TEMPLATE_ITEMS} รายการ</p>
                            )}
                        </fieldset>

                        {error && (
                            <p role="alert" className="text-sm text-red-600 wrap-anywhere dark:text-red-400">
                                {error}
                            </p>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                                ยกเลิก
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving && <Loader2 className="animate-spin" aria-hidden />}
                                {saving ? 'กำลังบันทึก…' : 'บันทึกชุด'}
                            </Button>
                        </DialogFooter>
                    </form>
                ) : (
                    <div className="space-y-4">
                        {templates.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                                ยังไม่มีชุดรายการสำเร็จรูป — สร้างชุดของที่ต้องซื้อบ่อยไว้ แล้วกดใช้กับเช็กลิสต์ของงานได้เลย
                            </p>
                        ) : (
                            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                                {templates.map(t => {
                                    const deletable = canDelete(viewer, { createdBy: t.created_by, ownerId: null })
                                    const budget = t.items.reduce((sum, it) => sum + (it.est_price ?? 0), 0)
                                    return (
                                        <li key={t.id} className="flex items-start gap-2 px-3 py-2.5">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-zinc-900 wrap-anywhere dark:text-zinc-100">{t.name}</p>
                                                <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                                                    {t.items.length} รายการ
                                                    {budget > 0 && ` · งบรวม ${formatMoney(budget)} บาท`}
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 shrink-0 text-zinc-500"
                                                aria-label={`แก้ชุด ${t.name}`}
                                                disabled={saving}
                                                onClick={() => startEdit(t)}
                                            >
                                                <Pencil className="h-4 w-4" aria-hidden />
                                            </Button>
                                            {deletable && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 shrink-0 text-zinc-500 hover:text-red-600"
                                                    aria-label={`ลบชุด ${t.name}`}
                                                    disabled={saving}
                                                    onClick={e => {
                                                        deleteFocus.remember(e.currentTarget)
                                                        setConfirming(t)
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden />
                                                </Button>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                        {saving && (
                            <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                กำลังบันทึก…
                            </p>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                ปิด
                            </Button>
                            <Button type="button" onClick={() => startEdit(null)}>
                                <Plus aria-hidden /> สร้างชุดใหม่
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {confirming && (
                    <ConfirmDelete
                        title={`ลบชุด "${confirming.name}"?`}
                        description="ชุดนี้จะหายจากรายการชุดสำเร็จรูป — เช็กลิสต์ที่เคยใช้ชุดนี้ไม่ได้รับผลกระทบ"
                        confirmLabel="ลบชุด"
                        onConfirm={() => remove(confirming)}
                        onOpenChange={next => {
                            if (!next) setConfirming(null)
                        }}
                        onCloseAutoFocus={deleteFocus.restore}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}
