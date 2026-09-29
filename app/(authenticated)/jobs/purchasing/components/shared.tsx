'use client'

// ชิ้นส่วนที่หลายส่วนของหน้าจัดซื้อใช้ร่วมกัน — ยืนยันการลบ · ช่องเลือกคน · คืนโฟกัสเมื่อปิดหน้าต่าง
// · ชนิดของตัวส่งการเปลี่ยนแปลง (Mutate) ที่ purchasing-view.tsx สร้างแล้วส่งลงมาให้การ์ด/แถว/บอร์ด

import { useRef } from 'react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TEMP_ID_PREFIX, personName, type OptimisticAction, type PurchasePerson } from '../purchasing-logic'

/** ข้อความเมื่อเรียก server ไม่ได้เลย (เน็ตหลุด / server ล้ม) — ข้อความเดียวกับ actions.ts */
export const SAVE_FAILED = 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'

let tempSeq = 0
/**
 * id ชั่วคราวของรายการที่เพิ่งเพิ่ม (ขึ้นต้น TEMP_ID_PREFIX — isTempId จับได้ และ server ไม่รับเพราะไม่ใช่ uuid)
 * เรียกใน event handler เท่านั้น · ไม่ใช้ crypto.randomUUID เพราะใช้ไม่ได้บนหน้า http ธรรมดา
 */
export function newTempId(): string {
    tempSeq += 1
    return `${TEMP_ID_PREFIX}${Date.now().toString(36)}-${tempSeq}`
}

/** ข้อความ error จากผลของ server action — สำเร็จ = null */
export function errorOf(res: unknown): string | null {
    if (res && typeof res === 'object' && 'error' in res && typeof res.error === 'string') return res.error
    return null
}

/**
 * ส่งการเปลี่ยนแปลงหนึ่งครั้ง: ใส่ค่าชั่วคราวทันที → เรียก server (call คืนข้อความ error หรือ null)
 * → พลาด = toast (ค่าชั่วคราวหายเองเมื่องานจบ) · สำเร็จ = ข้อมูลจริงมาจาก revalidatePath
 */
export type Mutate = (
    optimistic: OptimisticAction[],
    call: () => Promise<string | null>,
    after?: { success?: string; onSuccess?: () => void }
) => void

/**
 * คืนโฟกัสให้ปุ่มที่เปิดหน้าต่าง — หน้าต่างที่เปิดด้วย state (ไม่ใช่ DialogTrigger) Radix ไม่รู้ว่าจะคืนให้ใคร
 * remember() เรียกใน event handler ตอนเปิด · restore ส่งให้ onCloseAutoFocus ของ DialogContent/AlertDialogContent
 */
export function useFocusReturn() {
    const target = useRef<HTMLElement | null>(null)
    const remember = (el: EventTarget | null | undefined) => {
        target.current = el instanceof HTMLElement ? el : null
    }
    const restore = (event: Event) => {
        const el = target.current
        // ปุ่มเดิมหายไปแล้ว (เช่นแถวถูกลบ) = ปล่อยให้ Radix จัดการเอง
        // preventScroll: หลังสร้างเช็กลิสต์ การ์ดใหม่เลื่อนมาให้เห็นเอง — คืนโฟกัสต้องไม่ดึงหน้ากลับขึ้นไป
        if (el && el.isConnected) {
            event.preventDefault()
            el.focus({ preventScroll: true })
        }
    }
    return { remember, restore }
}

/** หน้าต่างยืนยันการลบ — โฟกัสแรกอยู่ที่ "ยกเลิก" เสมอ (Radix AlertDialog) ปุ่มลบไม่ใช่ค่าเริ่มต้น */
export function ConfirmDelete({
    title,
    description,
    confirmLabel = 'ลบ',
    onConfirm,
    onOpenChange,
    onCloseAutoFocus,
}: {
    title: string
    description: string
    confirmLabel?: string
    onConfirm: () => void
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus?: (event: Event) => void
}) {
    return (
        <AlertDialog open onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-lg sm:max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
                <AlertDialogHeader>
                    <AlertDialogTitle className="wrap-anywhere">{title}</AlertDialogTitle>
                    <AlertDialogDescription className="wrap-anywhere">{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0">
                    <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                    <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={onConfirm}>
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

/** ค่าของตัวเลือก "ไม่ระบุ" — Radix Select ห้ามใช้สตริงว่างเป็นค่า */
const NOBODY = '__none__'

/** ชื่อเต็มในรายการตัวเลือก: "ต้น (สมชาย ใจดี)" · ไม่มีชื่อเล่นใช้ชื่อจริง */
const optionLabel = (p: PurchasePerson) => (p.nickname?.trim() ? `${p.nickname.trim()} (${p.name})` : p.name)

/** เลือกผู้รับผิดชอบ — "ไม่ระบุ" และ "ฉันเอง" อยู่บนสุด แล้วตามด้วยทุกคน (เรียงชื่อตามที่ server ส่งมา) */
export function PersonSelect({
    id,
    value,
    onChange,
    people,
    currentUserId,
    invalid,
    describedBy,
}: {
    id?: string
    value: string | null
    onChange: (value: string | null) => void
    people: PurchasePerson[]
    currentUserId: string | null
    invalid?: boolean
    describedBy?: string
}) {
    const me = currentUserId ? people.find(p => p.id === currentUserId) : undefined
    const others = people.filter(p => p.id !== currentUserId)
    // คนที่ถูกเลือกไว้แต่ไม่อยู่ในรายชื่อแล้ว (เช่นถูกถอนการอนุมัติ) — ยังต้องแสดงค่าเดิมได้
    const missing = value !== null && !people.some(p => p.id === value)
    return (
        <Select value={value ?? NOBODY} onValueChange={v => onChange(v === NOBODY ? null : v)}>
            <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined} aria-describedby={describedBy}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={NOBODY}>ไม่ระบุ</SelectItem>
                {me && <SelectItem value={me.id}>ฉันเอง ({personName(me)})</SelectItem>}
                {missing && <SelectItem value={value}>ผู้ใช้เดิม (ไม่อยู่ในรายชื่อแล้ว)</SelectItem>}
                {others.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                        {optionLabel(p)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

/** ข้อความผิดพลาดใต้ช่องกรอก — id ใช้กับ aria-describedby ของช่องนั้น */
export function FieldError({ id, message }: { id: string; message?: string | null }) {
    if (!message) return null
    return (
        <p id={id} className="text-xs text-red-600 wrap-anywhere dark:text-red-400">
            {message}
        </p>
    )
}
