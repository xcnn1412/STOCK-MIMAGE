'use client'

// หน้าต่างแก้รายการหนึ่งข้อ — ทุกช่อง + ใบเบิกที่ผูก + รูปแนบ
// บันทึก: ตรวจทีละช่องที่เปลี่ยนด้วย validateItemInput(…, 'patch') → ข้อความผิดขึ้นใต้ช่องของมัน
// ส่งเฉพาะช่องที่เปลี่ยนจริง (ไม่มีอะไรเปลี่ยน = ปิดเฉยๆ) · เปลี่ยนสถานะไปทาง setPurchaseItemStatus
// ปิดหน้าต่างทันที ค่าใหม่ขึ้นแบบชั่วคราว (onSave → purchasing-view) ข้อมูลจริงตามมาเอง
// ใบเบิกและรูปแนบไม่ทำแบบชั่วคราว: รอ server (หน้าต่างเปิดค้าง) แล้วแสดงจาก props ล่าสุด (revalidatePath ส่งมาให้)

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ExternalLink, ImagePlus, Link2, Link2Off, Loader2, Receipt, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn, compressImage } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import { deletePurchaseImage, linkPurchaseItemsToClaim, unlinkPurchaseItemClaim, uploadPurchaseImages } from '../actions'
import {
    IMAGE_MIME_TYPES,
    KIND_LABELS,
    MAX_IMAGES_PER_ITEM,
    PURCHASE_KINDS,
    PURCHASE_STATUSES,
    STATUS_LABELS,
    claimMismatch,
    formatMoney,
    imageFilesError,
    isPurchaseKind,
    isPurchaseStatus,
    isVoidClaimStatus,
    listDate,
    personName,
    statusTone,
    validateItemInput,
    type PurchaseClaim,
    type PurchaseClaimOption,
    type PurchaseItem,
    type PurchaseItemInput,
    type PurchaseKind,
    type PurchaseList,
    type PurchasePerson,
    type PurchaseStatus,
} from '../purchasing-logic'
import { ClaimPicker } from './claim-picker'
import { DATE_INPUT_CLASS } from './list-dialogs'
import { ConfirmDelete, FieldError, PersonSelect, SAVE_FAILED, errorOf, useFocusReturn } from './shared'

/** ช่องที่แก้ได้ เรียงตามลำดับในฟอร์ม (โฟกัสช่องผิดช่องแรกตามลำดับนี้) */
type ItemField =
    | 'title'
    | 'kind'
    | 'quantity'
    | 'assignee_id'
    | 'due_date'
    | 'est_price'
    | 'actual_price'
    | 'vendor'
    | 'link_url'
    | 'tracking_no'
    | 'note'
const ITEM_FIELDS: ItemField[] = [
    'title',
    'kind',
    'quantity',
    'assignee_id',
    'due_date',
    'est_price',
    'actual_price',
    'vendor',
    'link_url',
    'tracking_no',
    'note',
]

/** ค่าในช่องกรอก (ข้อความดิบ) — ตรวจ/แปลงตอนกดบันทึก */
interface ItemDraft {
    title: string
    kind: PurchaseKind
    quantity: string
    assignee_id: string | null
    due_date: string
    est_price: string
    actual_price: string
    vendor: string
    link_url: string
    tracking_no: string
    note: string
}

const moneyText = (n: number | null) => (n == null ? '' : String(n))

const toItemDraft = (item: PurchaseItem): ItemDraft => ({
    title: item.title,
    kind: item.kind,
    quantity: item.quantity ?? '',
    assignee_id: item.assignee_id,
    due_date: item.due_date ?? '',
    est_price: moneyText(item.est_price),
    actual_price: moneyText(item.actual_price),
    vendor: item.vendor ?? '',
    link_url: item.link_url ?? '',
    tracking_no: item.tracking_no ?? '',
    note: item.note ?? '',
})

/** รูปที่ถอดรหัสไม่ได้ (ไฟล์เสีย) ทำให้ compressImage ค้างตลอดไป — ตัดจบเมื่อเกินเวลา */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms)
        promise.then(
            value => {
                clearTimeout(timer)
                resolve(value)
            },
            err => {
                clearTimeout(timer)
                reject(err)
            }
        )
    })
}

export interface ItemDialogProps {
    item: PurchaseItem
    /** เช็กลิสต์ของรายการนี้ — ใช้บอกว่ากำหนดว่าง = ใช้วันไหน */
    list: PurchaseList
    /** ใบเบิกที่รายการนี้ผูกอยู่ (จาก snapshot — ตัดชื่อ/ยอดตามสิทธิ์แล้ว) · null = ไม่ผูก หรือข้อมูลใบยังไม่มา */
    claim: PurchaseClaim | null
    /** แอดมินผูกได้ทุกใบเบิก · คนอื่นเฉพาะใบที่ตัวเองเป็นผู้เบิก */
    isAdmin: boolean
    people: PurchasePerson[]
    currentUserId: string | null
    /** patch = เฉพาะช่องที่เปลี่ยน (ตรวจแล้ว) · status = สถานะใหม่ (null = ไม่เปลี่ยน) */
    onSave: (item: PurchaseItem, patch: Partial<PurchaseItemInput>, status: PurchaseStatus | null) => void
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus: (event: Event) => void
}

export function ItemDialog({
    item,
    list,
    claim,
    isAdmin,
    people,
    currentUserId,
    onSave,
    onOpenChange,
    onCloseAutoFocus,
}: ItemDialogProps) {
    const uid = useId()
    const fieldId = (key: ItemField | 'status') => `${uid}-${key}`
    const errorId = (key: ItemField) => `${uid}-${key}-error`
    const fileRef = useRef<HTMLInputElement>(null)
    const imageFocus = useFocusReturn()

    const [draft, setDraft] = useState(() => toItemDraft(item))
    const [status, setStatus] = useState<PurchaseStatus>(item.status)
    const [errors, setErrors] = useState<Partial<Record<ItemField, string>>>({})
    const [busy, startBusy] = useTransition()
    const [imageError, setImageError] = useState<string | null>(null)
    const [confirmImage, setConfirmImage] = useState<string | null>(null)

    // --- ใบเบิก: รอ server แล้วแสดงผลจาก props ล่าสุด (isPending ค้างจนข้อมูลใหม่มาถึง) ---
    const [claimBusy, startClaimBusy] = useTransition()
    const [picking, setPicking] = useState(false)
    const [claimError, setClaimError] = useState<string | null>(null)
    /** ปุ่ม "ผูกใบเบิก" / "เลิกผูก" ที่แสดงอยู่ — ผูก/เลิกผูก/ปิดตัวเลือกแล้วปุ่มที่กดอยู่หายไป จึงย้ายโฟกัสมาที่ปุ่มใหม่ */
    const claimActionRef = useRef<HTMLButtonElement>(null)
    /** ตั้งใน event handler: ให้ย้ายโฟกัสหลังข้อมูลใหม่มาถึง (ไม่มีปุ่มให้ย้ายเช่นผูกไม่สำเร็จ = โฟกัสอยู่ที่เดิม) */
    const refocusClaim = useRef(false)
    useEffect(() => {
        if (claimBusy || !refocusClaim.current) return
        refocusClaim.current = false
        claimActionRef.current?.focus()
    })

    const set = <K extends ItemField>(key: K, value: ItemDraft[K]) => {
        setDraft(d => ({ ...d, [key]: value }))
        if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }))
    }
    const invalid = (key: ItemField) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': errorId(key) } : {})
    const errorCount = ITEM_FIELDS.filter(k => errors[k]).length

    const save = () => {
        const base = toItemDraft(item)
        const nextErrors: Partial<Record<ItemField, string>> = {}
        const patch: Partial<PurchaseItemInput> = {}
        for (const key of ITEM_FIELDS) {
            if (draft[key] === base[key]) continue
            // ตรวจทีละช่อง → รู้ว่าข้อความผิดเป็นของช่องไหน
            const checked = validateItemInput({ [key]: draft[key] }, 'patch')
            if (!checked.ok) {
                nextErrors[key] = checked.error
                continue
            }
            // ค่าหลังตัดช่องว่าง/แปลงตัวเลขเท่าของเดิม = ไม่ใช่การเปลี่ยน
            if (checked.value[key] !== item[key]) Object.assign(patch, checked.value)
        }
        const firstInvalid = ITEM_FIELDS.find(k => nextErrors[k])
        if (firstInvalid) {
            setErrors(nextErrors)
            document.getElementById(fieldId(firstInvalid))?.focus()
            return
        }
        const statusChange = status !== item.status ? status : null
        onOpenChange(false)
        if (Object.keys(patch).length > 0 || statusChange) onSave(item, patch, statusChange)
    }

    // --- รูปแนบ ---
    const imageCount = item.images.length
    const full = imageCount >= MAX_IMAGES_PER_ITEM

    const addImages = (files: File[]) => {
        if (files.length === 0) return
        // ชนิด + จำนวนรวม + ไฟล์ว่าง ตรวจก่อนบีบ — ขนาดตรวจหลังบีบ (รูปกล้องมือถือเกิน 5MB บ่อย แต่บีบแล้วเหลือไม่ถึง 1MB)
        const early = imageFilesError(files.map(f => ({ type: f.type, size: Math.min(f.size, 1) })), imageCount)
        if (early) {
            setImageError(early)
            return
        }
        setImageError(null)
        startBusy(async () => {
            try {
                const compressed = await Promise.all(files.map(f => withTimeout(compressImage(f), 30_000)))
                const late = imageFilesError(compressed, imageCount)
                if (late) {
                    setImageError(late)
                    return
                }
                const form = new FormData()
                for (const file of compressed) form.append('files', file)
                const failure = errorOf(await uploadPurchaseImages(item.id, form))
                if (failure) setImageError(failure)
                else toast.success(`แนบรูปแล้ว ${compressed.length} รูป`)
            } catch (err) {
                console.error('[purchasing] upload images:', err)
                setImageError('อ่านหรืออัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
            }
        })
    }

    const removeImage = (url: string) => {
        setImageError(null)
        startBusy(async () => {
            try {
                const failure = errorOf(await deletePurchaseImage(item.id, url))
                if (failure) setImageError(failure)
            } catch (err) {
                console.error('[purchasing] remove image:', err)
                setImageError(SAVE_FAILED)
            }
        })
    }

    // --- ใบเบิก ---
    const linked = !!item.expense_claim_id
    /** ส่วนต่างระหว่างยอดใบเบิกกับยอดจ่ายจริงรวม (บาท ปัดสตางค์) — ใช้เมื่อ claimMismatch */
    const claimGap = claim ? Math.round(Math.abs((claim.amount ?? 0) - (claim.linked_actual ?? 0)) * 100) / 100 : 0

    const linkClaim = (option: PurchaseClaimOption) => {
        setClaimError(null)
        refocusClaim.current = true
        startClaimBusy(async () => {
            try {
                const failure = errorOf(await linkPurchaseItemsToClaim([item.id], option.id))
                if (failure) {
                    setClaimError(failure)
                    return
                }
                setPicking(false)
                toast.success(`ผูกกับใบเบิก ${option.claim_number} แล้ว`)
            } catch (err) {
                console.error('[purchasing] link claim:', err)
                setClaimError(SAVE_FAILED)
            }
        })
    }

    const unlinkClaim = () => {
        setClaimError(null)
        refocusClaim.current = true
        startClaimBusy(async () => {
            try {
                const failure = errorOf(await unlinkPurchaseItemClaim(item.id))
                if (failure) setClaimError(failure)
                else toast.success('เลิกผูกใบเบิกแล้ว')
            } catch (err) {
                console.error('[purchasing] unlink claim:', err)
                setClaimError(SAVE_FAILED)
            }
        })
    }

    const fallbackDate = listDate(list)
    const changedBy = item.status_changed_by ? people.find(p => p.id === item.status_changed_by) : undefined
    const anyBusy = busy || claimBusy

    return (
        // ระหว่างอัปโหลด/ลบรูป หรือผูก/เลิกผูกใบเบิก ปิดไม่ได้ — กันผู้ใช้เข้าใจว่ายกเลิกแล้ว
        <Dialog open onOpenChange={next => !anyBusy && onOpenChange(next)}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>แก้ไขรายการ</DialogTitle>
                    <DialogDescription className="wrap-anywhere">{item.title}</DialogDescription>
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
                        <Label htmlFor={fieldId('title')}>ชื่อรายการ</Label>
                        <Input id={fieldId('title')} value={draft.title} onChange={e => set('title', e.target.value)} {...invalid('title')} />
                        <FieldError id={errorId('title')} message={errors.title} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('kind')}>ประเภท</Label>
                            <Select
                                value={draft.kind}
                                onValueChange={v => {
                                    if (isPurchaseKind(v)) set('kind', v)
                                }}
                            >
                                <SelectTrigger id={fieldId('kind')} className="w-full" {...invalid('kind')}>
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
                            <FieldError id={errorId('kind')} message={errors.kind} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('status')}>สถานะ</Label>
                            <Select
                                value={status}
                                onValueChange={v => {
                                    if (isPurchaseStatus(v)) setStatus(v)
                                }}
                            >
                                <SelectTrigger id={fieldId('status')} className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PURCHASE_STATUSES.map(s => (
                                        <SelectItem key={s} value={s}>
                                            <span className={cn('h-2 w-2 shrink-0 rounded-full', statusTone(s).dot)} aria-hidden />
                                            {STATUS_LABELS[s]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    {item.status_changed_at && (
                        <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            เปลี่ยนสถานะล่าสุด {formatThaiDate(item.status_changed_at)}
                            {changedBy && ` โดย ${personName(changedBy)}`}
                        </p>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('quantity')}>จำนวน</Label>
                            <Input
                                id={fieldId('quantity')}
                                value={draft.quantity}
                                onChange={e => set('quantity', e.target.value)}
                                placeholder="เช่น 2 กล่อง"
                                {...invalid('quantity')}
                            />
                            <FieldError id={errorId('quantity')} message={errors.quantity} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('assignee_id')}>ผู้รับผิดชอบ</Label>
                            <PersonSelect
                                id={fieldId('assignee_id')}
                                value={draft.assignee_id}
                                onChange={v => set('assignee_id', v)}
                                people={people}
                                currentUserId={currentUserId}
                                invalid={!!errors.assignee_id}
                                describedBy={errors.assignee_id ? errorId('assignee_id') : undefined}
                            />
                            <FieldError id={errorId('assignee_id')} message={errors.assignee_id} />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor={fieldId('due_date')}>ต้องได้ของภายใน</Label>
                        <Input
                            id={fieldId('due_date')}
                            type="date"
                            value={draft.due_date}
                            onChange={e => set('due_date', e.target.value)}
                            className={cn('sm:w-56', DATE_INPUT_CLASS)}
                            aria-describedby={errors.due_date ? errorId('due_date') : `${uid}-due-hint`}
                            aria-invalid={!!errors.due_date || undefined}
                        />
                        <FieldError id={errorId('due_date')} message={errors.due_date} />
                        {!errors.due_date && (
                            <p id={`${uid}-due-hint`} className="text-xs text-zinc-500 dark:text-zinc-400">
                                {draft.due_date
                                    ? formatThaiDate(draft.due_date)
                                    : fallbackDate
                                      ? `ว่างไว้ = ใช้${list.lead?.event_date ? 'วันงาน' : 'กำหนดของเช็กลิสต์'} (${formatThaiDate(fallbackDate)})`
                                      : 'ว่างไว้ = ไม่มีกำหนด'}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('est_price')}>งบ (บาท)</Label>
                            <Input
                                id={fieldId('est_price')}
                                value={draft.est_price}
                                onChange={e => set('est_price', e.target.value)}
                                inputMode="decimal"
                                placeholder="0"
                                className="tabular-nums"
                                {...invalid('est_price')}
                            />
                            <FieldError id={errorId('est_price')} message={errors.est_price} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={fieldId('actual_price')}>จ่ายจริง (บาท)</Label>
                            <Input
                                id={fieldId('actual_price')}
                                value={draft.actual_price}
                                onChange={e => set('actual_price', e.target.value)}
                                inputMode="decimal"
                                placeholder="0"
                                className="tabular-nums"
                                {...invalid('actual_price')}
                            />
                            <FieldError id={errorId('actual_price')} message={errors.actual_price} />
                        </div>
                    </div>
                    <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">ยอดของทั้งรายการ ไม่ใช่ราคาต่อชิ้น</p>

                    <div className="space-y-1.5">
                        <Label htmlFor={fieldId('vendor')}>ร้าน/ผู้ขาย</Label>
                        <Input id={fieldId('vendor')} value={draft.vendor} onChange={e => set('vendor', e.target.value)} {...invalid('vendor')} />
                        <FieldError id={errorId('vendor')} message={errors.vendor} />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor={fieldId('link_url')}>ลิงก์สินค้า</Label>
                        <Input
                            id={fieldId('link_url')}
                            value={draft.link_url}
                            onChange={e => set('link_url', e.target.value)}
                            inputMode="url"
                            autoComplete="url"
                            placeholder="https://"
                            {...invalid('link_url')}
                        />
                        <FieldError id={errorId('link_url')} message={errors.link_url} />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor={fieldId('tracking_no')}>เลขพัสดุ</Label>
                        <Input
                            id={fieldId('tracking_no')}
                            value={draft.tracking_no}
                            onChange={e => set('tracking_no', e.target.value)}
                            autoComplete="off"
                            {...invalid('tracking_no')}
                        />
                        <FieldError id={errorId('tracking_no')} message={errors.tracking_no} />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor={fieldId('note')}>หมายเหตุ</Label>
                        <Textarea id={fieldId('note')} value={draft.note} onChange={e => set('note', e.target.value)} rows={3} {...invalid('note')} />
                        <FieldError id={errorId('note')} message={errors.note} />
                    </div>

                    {/* ใบเบิก — ไม่ผ่านปุ่มบันทึก: ผูก/เลิกผูกแล้วมีผลทันที · ระหว่างรอแสดงตัวเลือกเดิม (ปิดใช้) ไม่กระพริบ */}
                    <section aria-labelledby={`${uid}-claim`} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="flex items-center justify-between gap-2">
                            <h3 id={`${uid}-claim`} className="text-sm font-medium">
                                ใบเบิก
                            </h3>
                            {linked ? (
                                <Button ref={claimActionRef} type="button" variant="outline" size="sm" disabled={claimBusy} onClick={unlinkClaim}>
                                    {claimBusy ? <Loader2 className="animate-spin" aria-hidden /> : <Link2Off aria-hidden />}
                                    เลิกผูก
                                </Button>
                            ) : picking || claimBusy ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={claimBusy}
                                    onClick={() => {
                                        refocusClaim.current = true
                                        setPicking(false)
                                        setClaimError(null)
                                    }}
                                >
                                    ไม่ผูกตอนนี้
                                </Button>
                            ) : (
                                <Button ref={claimActionRef} type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
                                    <Link2 aria-hidden /> ผูกใบเบิก
                                </Button>
                            )}
                        </div>

                        {linked ? (
                            claim ? (
                                <div className="space-y-1">
                                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                        <Receipt className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
                                        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{claim.claim_number}</span>
                                        <span
                                            className={cn(
                                                'inline-flex items-center gap-1.5 text-xs',
                                                isVoidClaimStatus(claim.status)
                                                    ? 'font-medium text-red-700 dark:text-red-400'
                                                    : 'text-zinc-600 dark:text-zinc-400'
                                            )}
                                        >
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: claim.status_color }} aria-hidden />
                                            <span className="sr-only">สถานะ </span>
                                            {claim.status_label}
                                        </span>
                                    </p>
                                    {/* ใบที่ผู้ใช้ไม่เห็นรายละเอียด: server ส่ง title/amount/linked_actual มาเป็น null อยู่แล้ว — เงื่อนไขนี้แค่เลือกข้อความ */}
                                    {claim.visible ? (
                                        <>
                                            <p className="text-sm text-zinc-700 wrap-anywhere dark:text-zinc-300">{claim.title || 'ไม่มีชื่อใบเบิก'}</p>
                                            <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                                                ยอดใบเบิก {formatMoney(claim.amount ?? 0)} บาท · ผูกอยู่ {claim.linked_items} รายการ รวมจ่ายจริง{' '}
                                                {formatMoney(claim.linked_actual ?? 0)} บาท
                                            </p>
                                            {claimMismatch(claim) && (
                                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                                    ยอดใบเบิกไม่ตรงกับยอดจ่ายจริงรวมของรายการที่ผูก (ต่างกัน {formatMoney(claimGap)} บาท)
                                                </p>
                                            )}
                                            <Link
                                                href={`/finance/${claim.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex min-h-9 items-center gap-1 rounded text-xs font-medium text-violet-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:text-violet-300"
                                            >
                                                เปิดใบเบิก
                                                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                                                <span className="sr-only">(เปิดแท็บใหม่)</span>
                                            </Link>
                                        </>
                                    ) : (
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400">รายละเอียดใบเบิกเห็นได้เฉพาะผู้เบิกและแอดมิน</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">ผูกใบเบิกแล้ว — กำลังโหลดรายละเอียดใบเบิก…</p>
                            )
                        ) : picking || claimBusy ? (
                            <ClaimPicker isAdmin={isAdmin} onPick={linkClaim} disabled={claimBusy} />
                        ) : (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                ยังไม่ได้ผูกใบเบิก — ผูกไว้ให้รู้ว่ารายการนี้เบิกเงินด้วยใบเบิกใบไหน
                            </p>
                        )}

                        {claimBusy && (
                            <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                กำลังบันทึก…
                            </p>
                        )}
                        {claimError && (
                            <p role="alert" className="text-xs text-red-600 wrap-anywhere dark:text-red-400">
                                {claimError}
                            </p>
                        )}
                    </section>

                    {/* รูปแนบ — ไม่ผ่านปุ่มบันทึก: แนบ/ลบแล้วมีผลทันที */}
                    <section aria-labelledby={`${uid}-images`} className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="flex items-center justify-between gap-2">
                            <h3 id={`${uid}-images`} className="text-sm font-medium">
                                รูปแนบ{' '}
                                <span className="font-normal tabular-nums text-zinc-500 dark:text-zinc-400">
                                    รูป {imageCount}/{MAX_IMAGES_PER_ITEM}
                                </span>
                            </h3>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={full || busy}
                                onClick={() => fileRef.current?.click()}
                            >
                                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
                                {full ? 'ครบ 4 รูปแล้ว' : 'เพิ่มรูป'}
                            </Button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept={IMAGE_MIME_TYPES.join(',')}
                                multiple
                                hidden
                                onChange={e => {
                                    const files = Array.from(e.target.files ?? [])
                                    e.target.value = '' // เลือกไฟล์เดิมซ้ำได้
                                    addImages(files)
                                }}
                            />
                        </div>
                        {imageCount > 0 ? (
                            <ul className="grid grid-cols-4 gap-2">
                                {item.images.map((url, i) => (
                                    <li key={url} className="relative">
                                        <a
                                            href={url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block aspect-square overflow-hidden rounded-md border border-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:border-zinc-800"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={url} alt={`รูปที่ ${i + 1} (เปิดเต็มในแท็บใหม่)`} loading="lazy" className="h-full w-full object-cover" />
                                        </a>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            aria-label={`ลบรูปที่ ${i + 1}`}
                                            onClick={e => {
                                                imageFocus.remember(e.currentTarget)
                                                setConfirmImage(url)
                                            }}
                                            className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white outline-none hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                                        >
                                            <X className="h-3.5 w-3.5" aria-hidden />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                ยังไม่มีรูป — แนบรูปสินค้าหรือใบเสร็จได้สูงสุด {MAX_IMAGES_PER_ITEM} รูป (JPG, PNG, WEBP)
                            </p>
                        )}
                        {busy && (
                            <p className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                กำลังส่งรูป…
                            </p>
                        )}
                        {imageError && (
                            <p role="alert" className="text-xs text-red-600 wrap-anywhere dark:text-red-400">
                                {imageError}
                            </p>
                        )}
                    </section>

                    {errorCount > 0 && (
                        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                            กรุณาแก้ช่องที่มีข้อความสีแดง ({errorCount} ช่อง)
                        </p>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={anyBusy} onClick={() => onOpenChange(false)}>
                            ยกเลิก
                        </Button>
                        <Button type="submit" disabled={anyBusy}>
                            บันทึก
                        </Button>
                    </DialogFooter>
                </form>

                {confirmImage && (
                    <ConfirmDelete
                        title="ลบรูปนี้?"
                        description="รูปจะถูกลบออกจากรายการและลบไฟล์ถาวร กู้คืนไม่ได้"
                        confirmLabel="ลบรูป"
                        onConfirm={() => removeImage(confirmImage)}
                        onOpenChange={next => {
                            if (!next) setConfirmImage(null)
                        }}
                        onCloseAutoFocus={imageFocus.restore}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}
