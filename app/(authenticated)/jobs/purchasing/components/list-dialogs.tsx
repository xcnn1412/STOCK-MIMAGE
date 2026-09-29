'use client'

// หน้าต่างของเมนูเช็กลิสต์ (การ์ดใน list-card.tsx) — แก้ไขเช็กลิสต์ · เพิ่มจากชุดสำเร็จรูป · บันทึกเป็นชุดสำเร็จรูป
// · คัดลอกเอง (เครื่องที่คัดลอกอัตโนมัติไม่ได้) — ทุกหน้าต่างถูก mount เฉพาะตอนเปิด

import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatThaiDate } from '@/lib/thai-date'
import { saveListAsTemplate } from '../actions'
import {
    KIND_LABELS,
    listTitle,
    validateListInput,
    type PurchaseList,
    type PurchaseListInput,
    type PurchasePerson,
    type PurchaseTemplate,
} from '../purchasing-logic'
import { FieldError, PersonSelect, SAVE_FAILED, errorOf } from './shared'

/** กล่องหน้าต่างมาตรฐานของหน้านี้ — เลื่อนในตัวเองเมื่อสูงเกินจอ */
const DIALOG_CLASS = 'max-h-[90dvh] overflow-y-auto sm:max-w-lg'

/** ช่องวันที่แบบเนทีฟ — มืด/สว่างตามธีม (ไอคอนปฏิทินมองเห็นในโหมดมืด) */
export const DATE_INPUT_CLASS = 'dark:[color-scheme:dark]'

// ============================================================================
// แก้ไขเช็กลิสต์
// ============================================================================

type ListField = 'title' | 'owner_id' | 'budget' | 'due_date' | 'note'
const LIST_FIELDS: ListField[] = ['title', 'owner_id', 'budget', 'due_date', 'note']

interface ListDraft {
    title: string
    owner_id: string | null
    budget: string
    due_date: string
    note: string
}

const toListDraft = (list: PurchaseList): ListDraft => ({
    title: list.title,
    owner_id: list.owner_id,
    budget: list.budget == null ? '' : String(list.budget),
    due_date: list.due_date ?? '',
    note: list.note ?? '',
})

/**
 * แก้ หมายเหตุ งบ กำหนด ผู้รับผิดชอบ (+ ชื่อ เฉพาะเช็กลิสต์ทั่วไป — ใบที่ผูกงานใช้ชื่อจาก CRM ส่ง title ไป server จะถูกปฏิเสธ)
 * ส่งเฉพาะช่องที่เปลี่ยนจริง · ไม่มีอะไรเปลี่ยน = ปิดเฉยๆ ไม่เรียก server
 */
export function EditListDialog({
    list,
    people,
    currentUserId,
    onSave,
    onOpenChange,
    onCloseAutoFocus,
}: {
    list: PurchaseList
    people: PurchasePerson[]
    currentUserId: string | null
    onSave: (patch: Partial<PurchaseListInput>) => void
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus: (event: Event) => void
}) {
    const uid = useId()
    const fieldId = (key: ListField) => `${uid}-${key}`
    const errorId = (key: ListField) => `${uid}-${key}-error`
    const linked = !!list.crm_lead_id
    const [draft, setDraft] = useState(() => toListDraft(list))
    const [errors, setErrors] = useState<Partial<Record<ListField, string>>>({})

    const set = <K extends ListField>(key: K, value: ListDraft[K]) => {
        setDraft(d => ({ ...d, [key]: value }))
        if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
    }

    const save = () => {
        const base = toListDraft(list)
        const nextErrors: Partial<Record<ListField, string>> = {}
        const patch: Partial<PurchaseListInput> = {}
        for (const key of LIST_FIELDS) {
            if (key === 'title' && linked) continue
            if (draft[key] === base[key]) continue
            // ตรวจทีละช่อง → รู้ว่าข้อความผิดเป็นของช่องไหน
            const checked = validateListInput({ [key]: draft[key] }, 'patch')
            if (!checked.ok) {
                nextErrors[key] = checked.error
                continue
            }
            // ค่าหลังตัดช่องว่างเท่าของเดิม (เช่นเติมแค่ช่องว่าง) = ไม่ใช่การเปลี่ยน
            if (checked.value[key] !== list[key]) Object.assign(patch, checked.value)
        }
        const firstInvalid = LIST_FIELDS.find(k => nextErrors[k])
        if (firstInvalid) {
            setErrors(nextErrors)
            document.getElementById(fieldId(firstInvalid))?.focus()
            return
        }
        onOpenChange(false)
        if (Object.keys(patch).length > 0) onSave(patch)
    }

    const invalid = (key: ListField) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': errorId(key) } : {})

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className={DIALOG_CLASS} onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>แก้ไขเช็กลิสต์</DialogTitle>
                    <DialogDescription className="wrap-anywhere">{listTitle(list)}</DialogDescription>
                </DialogHeader>
                <form
                    noValidate
                    className="space-y-4"
                    onSubmit={e => {
                        e.preventDefault()
                        save()
                    }}
                >
                    {linked ? (
                        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                            ชื่อ วันงาน และสถานที่ของเช็กลิสต์นี้มาจากการ์ด CRM — แก้ที่การ์ด CRM
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('title')}>ชื่อเช็กลิสต์</Label>
                            <Input
                                id={fieldId('title')}
                                value={draft.title}
                                onChange={e => set('title', e.target.value)}
                                {...invalid('title')}
                            />
                            <FieldError id={errorId('title')} message={errors.title} />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor={fieldId('owner_id')}>ผู้รับผิดชอบเช็กลิสต์</Label>
                        <PersonSelect
                            id={fieldId('owner_id')}
                            value={draft.owner_id}
                            onChange={v => set('owner_id', v)}
                            people={people}
                            currentUserId={currentUserId}
                            invalid={!!errors.owner_id}
                            describedBy={errors.owner_id ? errorId('owner_id') : undefined}
                        />
                        <FieldError id={errorId('owner_id')} message={errors.owner_id} />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('budget')}>งบของเช็กลิสต์ (บาท)</Label>
                            <Input
                                id={fieldId('budget')}
                                value={draft.budget}
                                onChange={e => set('budget', e.target.value)}
                                inputMode="decimal"
                                placeholder="ไม่ตั้ง = ใช้ผลรวมงบรายการ"
                                className="tabular-nums"
                                {...invalid('budget')}
                            />
                            <FieldError id={errorId('budget')} message={errors.budget} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('due_date')}>ต้องได้ของครบภายใน</Label>
                            <Input
                                id={fieldId('due_date')}
                                type="date"
                                value={draft.due_date}
                                onChange={e => set('due_date', e.target.value)}
                                className={DATE_INPUT_CLASS}
                                {...invalid('due_date')}
                            />
                            {draft.due_date && !errors.due_date && (
                                <p className="text-xs text-zinc-500">{formatThaiDate(draft.due_date)}</p>
                            )}
                            <FieldError id={errorId('due_date')} message={errors.due_date} />
                        </div>
                    </div>
                    {linked && list.lead?.event_date && (
                        <p className="-mt-2 text-xs text-zinc-500">
                            งานนี้ใช้วันงานจาก CRM ({formatThaiDate(list.lead.event_date)}) เป็นกำหนดหลัก — วันที่ด้านบนใช้เมื่อการ์ด CRM ไม่มีวันงาน
                        </p>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor={fieldId('note')}>หมายเหตุ</Label>
                        <Textarea
                            id={fieldId('note')}
                            value={draft.note}
                            onChange={e => set('note', e.target.value)}
                            rows={3}
                            {...invalid('note')}
                        />
                        <FieldError id={errorId('note')} message={errors.note} />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            ยกเลิก
                        </Button>
                        <Button type="submit">บันทึก</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// เพิ่มจากชุดสำเร็จรูป
// ============================================================================

/** เลือกชุดแล้วต่อท้ายรายการในเช็กลิสต์ (สถานะวางแผน ไม่มีผู้รับผิดชอบ — แบบเดียวกับที่ server เพิ่ม) */
export function ApplyTemplateDialog({
    list,
    templates,
    onApply,
    onOpenChange,
    onCloseAutoFocus,
}: {
    list: PurchaseList
    templates: PurchaseTemplate[]
    onApply: (template: PurchaseTemplate) => void
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus: (event: Event) => void
}) {
    const selectId = useId()
    const [templateId, setTemplateId] = useState(() => templates[0]?.id ?? '')
    const template = templates.find(t => t.id === templateId)

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className={DIALOG_CLASS} onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>เพิ่มจากชุดสำเร็จรูป</DialogTitle>
                    <DialogDescription className="wrap-anywhere">เพิ่มต่อท้ายเช็กลิสต์ &ldquo;{listTitle(list)}&rdquo;</DialogDescription>
                </DialogHeader>
                {templates.length === 0 ? (
                    <p className="text-sm text-zinc-500">ยังไม่มีชุดรายการสำเร็จรูป — สร้างได้จากปุ่ม &ldquo;ชุดรายการสำเร็จรูป&rdquo; ด้านบนของหน้า</p>
                ) : (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor={selectId}>ชุดรายการ</Label>
                            <Select value={templateId} onValueChange={setTemplateId}>
                                <SelectTrigger id={selectId} className="w-full">
                                    <SelectValue placeholder="เลือกชุดรายการ" />
                                </SelectTrigger>
                                <SelectContent>
                                    {templates.map(t => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name} ({t.items.length} รายการ)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {template && (
                            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-800">
                                {template.items.map((it, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <span className="mt-0.5 shrink-0 rounded border border-zinc-200 px-1 text-[11px] leading-4 text-zinc-500 dark:border-zinc-700">
                                            {KIND_LABELS[it.kind]}
                                        </span>
                                        <span className="min-w-0 wrap-anywhere">
                                            {it.title}
                                            {it.quantity && <span className="text-zinc-500"> · {it.quantity}</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="text-xs text-zinc-500">รายการจะเข้าไปในสถานะ &ldquo;วางแผน&rdquo; และยังไม่มีผู้รับผิดชอบ</p>
                    </div>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        ยกเลิก
                    </Button>
                    <Button
                        type="button"
                        disabled={!template}
                        onClick={() => {
                            if (!template) return
                            onOpenChange(false)
                            onApply(template)
                        }}
                    >
                        {template ? `เพิ่ม ${template.items.length} รายการ` : 'เพิ่มรายการ'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// บันทึกเป็นชุดสำเร็จรูป
// ============================================================================

const TEMPLATE_NAME_MAX = 80

/** เก็บรายการของเช็กลิสต์นี้เป็นชุดใหม่ (ชื่อ ประเภท จำนวน งบ ร้าน ลิงก์ หมายเหตุ — ไม่เก็บผู้รับผิดชอบ/สถานะ) */
export function SaveTemplateDialog({
    list,
    onOpenChange,
    onCloseAutoFocus,
}: {
    list: PurchaseList
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus: (event: Event) => void
}) {
    const nameId = useId()
    const [name, setName] = useState(() => [...listTitle(list)].slice(0, TEMPLATE_NAME_MAX).join(''))
    const [error, setError] = useState<string | null>(null)
    const [saving, startSaving] = useTransition()

    const save = () => {
        const trimmed = name.trim()
        if (!trimmed) return setError('กรุณาใส่ชื่อชุดสำเร็จรูป')
        if ([...trimmed].length > TEMPLATE_NAME_MAX) return setError(`ชื่อชุดสำเร็จรูปยาวเกิน ${TEMPLATE_NAME_MAX} ตัวอักษร`)
        setError(null)
        startSaving(async () => {
            try {
                const failure = errorOf(await saveListAsTemplate(list.id, trimmed))
                if (failure) {
                    setError(failure)
                    return
                }
                toast.success(`บันทึกชุด "${trimmed}" แล้ว`)
                onOpenChange(false)
            } catch (err) {
                console.error('[purchasing] save list as template:', err)
                setError(SAVE_FAILED)
            }
        })
    }

    return (
        <Dialog open onOpenChange={next => !saving && onOpenChange(next)}>
            <DialogContent className={DIALOG_CLASS} onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>บันทึกเป็นชุดสำเร็จรูป</DialogTitle>
                    <DialogDescription>
                        เก็บ {list.items.length} รายการของเช็กลิสต์นี้ไว้ใช้กับงานอื่น (ไม่เก็บผู้รับผิดชอบ สถานะ และยอดจ่ายจริง)
                    </DialogDescription>
                </DialogHeader>
                <form
                    noValidate
                    className="space-y-4"
                    onSubmit={e => {
                        e.preventDefault()
                        save()
                    }}
                >
                    <div className="space-y-1.5">
                        <Label htmlFor={nameId}>ชื่อชุด</Label>
                        <Input
                            id={nameId}
                            value={name}
                            onChange={e => {
                                setName(e.target.value)
                                if (error) setError(null)
                            }}
                            aria-invalid={!!error || undefined}
                            aria-describedby={error ? `${nameId}-error` : undefined}
                            autoFocus
                        />
                        <FieldError id={`${nameId}-error`} message={error} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
                            ยกเลิก
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving && <Loader2 className="animate-spin" aria-hidden />}
                            {saving ? 'กำลังบันทึก…' : 'บันทึกชุด'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ============================================================================
// คัดลอกเอง (สำรองเมื่อคัดลอกอัตโนมัติไม่ได้)
// ============================================================================

/** แสดงข้อความในช่องอ่านอย่างเดียว เลือกทั้งหมดให้ตอนโฟกัส — ผู้ใช้กดค้าง/Ctrl+C คัดลอกเอง */
export function CopyTextDialog({
    text,
    onOpenChange,
    onCloseAutoFocus,
}: {
    text: string
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus: (event: Event) => void
}) {
    const areaId = useId()
    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className={DIALOG_CLASS} onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>คัดลอกรายการ</DialogTitle>
                    <DialogDescription>
                        เครื่องนี้คัดลอกให้อัตโนมัติไม่ได้ — เลือกข้อความด้านล่างแล้วคัดลอกเอง (กดค้างบนมือถือ หรือ Ctrl+C)
                    </DialogDescription>
                </DialogHeader>
                <label htmlFor={areaId} className="sr-only">
                    ข้อความรายการสำหรับส่งต่อ
                </label>
                <Textarea
                    id={areaId}
                    readOnly
                    value={text}
                    rows={10}
                    autoFocus
                    onFocus={e => e.currentTarget.select()}
                    className="max-h-[50dvh] text-sm"
                />
                <DialogFooter>
                    <Button type="button" onClick={() => onOpenChange(false)}>
                        ปิด
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
