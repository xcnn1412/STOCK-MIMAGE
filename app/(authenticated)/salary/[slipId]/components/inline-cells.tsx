'use client'

// ============================================================================
// ช่องแก้ "ในแถว" ของตารางรายวัน (spec: docs/specs/salary-slip-daily-ui.md §UI)
//
// ทุกช่องมีพฤติกรรมเดียวกัน: แสดงค่า → คลิกแล้วแก้ได้ → Enter/blur บันทึก,
// Esc ยกเลิก → แสดงค่าใหม่ทันทีระหว่างรอ server (optimistic) → สำเร็จแล้ว
// กระพริบยืนยันหนึ่งครั้ง (ไม่ toast) → ผิดพลาดค่อย toast แล้วคืนค่าเดิม
//
// ทุกช่องเป็น controlled จากภายนอก: `value` มาจากสลิป/เช็คอินล่าสุดเสมอ
// ค่าที่กำลังบันทึกอยู่ถูกเก็บแยก แล้วทิ้งทันทีที่ `value` เปลี่ยนตาม
// (ตารางรายวัน มือถือ และหน้าพนักงาน ใช้ชุดเดียวกันนี้ทั้งหมด)
// ============================================================================

import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { fmtMoney } from '../../format'
import type { SlipEventOption } from '../../actions'
import type { SalaryDutyRow } from '../../settings/actions'

/** ผลของการบันทึกหนึ่งช่อง — ไม่มี error = สำเร็จ (ตัวเรียกเป็นคนอัปเดตสลิปเอง) */
export type SaveResult = { error?: string }

const FLASH_MS = 700

/** คลาสกระพริบยืนยัน — ใส่ไว้ชั่วครู่หลังบันทึกสำเร็จแล้วถอดออก จึงกระพริบรอบเดียว */
const FLASH_CLASS = 'animate-pulse rounded bg-emerald-100 dark:bg-emerald-950/50'

/** ปุ่มที่ทำหน้าที่เป็น "ช่องในตาราง" — ดูเหมือนข้อความจนกว่าจะ hover */
const CELL_BUTTON =
  'inline-flex min-h-7 items-center gap-1 rounded px-1.5 py-0.5 text-left transition-colors hover:bg-muted focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none'

const CELL_INPUT =
  'border-input h-7 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30'

// ────────────────────────────────────────────────────────────────────────────
// ตัวช่วยที่ทุกช่องใช้ร่วมกัน
// ────────────────────────────────────────────────────────────────────────────

/**
 * บันทึกด้วย transition + กระพริบเมื่อสำเร็จ + toast เมื่อพลาด
 * `onFail` ใช้คืนค่า optimistic กลับเป็นของเดิม
 */
function useCellSave() {
  const [isPending, startTransition] = useTransition()
  const [flash, setFlash] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  function run(fn: () => Promise<SaveResult>, onFail?: () => void) {
    startTransition(async () => {
      const res = await fn()
      if (res?.error) {
        toast.error(res.error)
        if (alive.current) onFail?.()
        return
      }
      if (!alive.current) return
      setFlash(true)
      window.setTimeout(() => { if (alive.current) setFlash(false) }, FLASH_MS)
    })
  }

  return { isPending, flash, run }
}

/**
 * ค่าที่ช่องแสดง = ค่าที่กำลังบันทึก (ถ้ามี) ไม่งั้นคือค่าจริงจาก props
 * ทิ้งค่าที่กำลังบันทึกทันทีที่ props เปลี่ยน — ไม่ว่าจะเปลี่ยนเพราะบันทึกสำเร็จ
 * หรือเพราะข้อมูลถูกแก้จากที่อื่น (`keyOf` ใช้เทียบค่าที่เป็น array/object ได้ด้วย)
 */
function useDraftValue<T>(value: T, keyOf: (v: T) => string): [T, (next: T | undefined) => void] {
  const [draft, setDraft] = useState<{ value: T } | undefined>(undefined)
  const [seen, setSeen] = useState(() => keyOf(value))

  const currentKey = keyOf(value)
  if (seen !== currentKey) {
    setSeen(currentKey)
    setDraft(undefined)
  }

  const set = (next: T | undefined) => setDraft(next === undefined ? undefined : { value: next })
  return [draft ? draft.value : value, set]
}

/**
 * โฟกัสช่องรันเนอร์ถัดไปที่ยังว่าง (Tab จากช่องรันเนอร์)
 * ใช้ attribute ร่วม `data-runner-input` แทนการส่ง ref ข้ามแถวทั้งตาราง
 */
export function focusNextEmptyRunner(current: HTMLInputElement): boolean {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>('[data-runner-input]'))
  const from = all.indexOf(current)
  for (let i = from + 1; i < all.length; i++) {
    if (all[i].value.trim() === '') {
      all[i].focus()
      all[i].select()
      return true
    }
  }
  return false
}

// ────────────────────────────────────────────────────────────────────────────
// เวลาเข้า / เวลาออก
// ────────────────────────────────────────────────────────────────────────────

interface TimeCellProps {
  /** 'HH:MM' ตามเวลาไทย · null = ยังไม่มีเวลานี้ */
  value: string | null
  onSave: (next: string | null) => Promise<SaveResult>
  disabled?: boolean
  /** ล้างค่าว่างได้ไหม — เวลาออกล้างได้ (= ยังไม่ออก) เวลาเข้าล้างไม่ได้ */
  allowClear?: boolean
  placeholder?: string
  ariaLabel: string
}

export function TimeCell({
  value, onSave, disabled, allowClear = false, placeholder = '—', ariaLabel,
}: TimeCellProps) {
  const { flash, run } = useCellSave()
  const [shown, setShown] = useDraftValue(value, v => v ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // Enter แล้ว blur ตามมาทันที — กันไม่ให้ยิงบันทึกซ้ำสองรอบ
  const doneRef = useRef(false)

  function open() {
    if (disabled) return
    doneRef.current = false
    setDraft(shown ?? '')
    setEditing(true)
  }

  function cancel() {
    doneRef.current = true
    setEditing(false)
  }

  function commit() {
    if (doneRef.current) return
    doneRef.current = true
    setEditing(false)

    const next = draft.trim() === '' ? null : draft
    if ((next ?? '') === (shown ?? '')) return
    if (next === null && !allowClear) {
      toast.error('เวลาเข้าจะว่างไม่ได้')
      return
    }
    setShown(next)
    run(() => onSave(next), () => setShown(undefined))
  }

  if (editing) {
    return (
      <input
        type="time"
        autoFocus
        value={draft}
        aria-label={ariaLabel}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        className={cn(CELL_INPUT, 'w-26 tabular-nums')}
      />
    )
  }

  if (disabled) {
    return <span className="px-1.5 tabular-nums text-muted-foreground">{shown || placeholder}</span>
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={ariaLabel}
      className={cn(CELL_BUTTON, 'tabular-nums', !shown && 'text-muted-foreground', flash && FLASH_CLASS)}
    >
      {shown || placeholder}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// หน้าที่หน้างาน (เลือกหลายรายการ)
// ────────────────────────────────────────────────────────────────────────────

interface DutiesCellProps {
  value: string[]
  duties: SalaryDutyRow[]
  onSave: (next: string[]) => Promise<SaveResult>
  disabled?: boolean
  ariaLabel?: string
}

/** ป้ายอัตราของหน้าที่ในลิสต์ — รันเนอร์ (manual_daily) ไม่มีอัตราตายตัว */
function dutyRateLabel(d: SalaryDutyRow): string {
  return d.pay_mode === 'manual_daily' ? 'กรอกยอดเอง' : `${fmtMoney(d.rate)} บาท/ครั้ง`
}

function sortedKey(codes: string[]): string {
  return [...codes].sort().join('|')
}

export function DutiesCell({
  value, duties, onSave, disabled, ariaLabel = 'หน้าที่หน้างาน',
}: DutiesCellProps) {
  const { flash, run } = useCellSave()
  const [shown, setShown] = useDraftValue(value, sortedKey)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(value)

  const nameOf = new Map(duties.map(d => [d.code, d.name_th]))
  const active = duties.filter(d => d.is_active || shown.includes(d.code))

  /** บันทึกเมื่อปิด popover เท่านั้น — ติ๊กหลายอันแล้วยิงครั้งเดียว */
  function handleOpenChange(next: boolean) {
    if (next) {
      setSelected(shown)
      setOpen(true)
      return
    }
    setOpen(false)
    if (sortedKey(shown) === sortedKey(selected)) return
    const chosen = selected
    setShown(chosen)
    run(() => onSave(chosen), () => setShown(undefined))
  }

  const badges =
    shown.length === 0
      ? <span className="text-muted-foreground">—</span>
      : (
        <span className="flex flex-wrap gap-1">
          {shown.map(code => (
            <Badge key={code} variant="outline" className="text-[11px] font-normal">
              {nameOf.get(code) || code}
            </Badge>
          ))}
        </span>
      )

  if (disabled) return <span className="px-1.5">{badges}</span>

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(CELL_BUTTON, 'max-w-52 flex-wrap', flash && FLASH_CLASS)}
        >
          {badges}
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2">
        <p className="text-xs font-medium">หน้าที่หน้างาน</p>
        {active.length === 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            ยังไม่มีหน้าที่ที่เปิดใช้อยู่ — เพิ่มได้ที่ตั้งค่าเงินเดือน
          </p>
        ) : (
          <div className="space-y-2">
            {active.map(d => (
              <div key={d.code} className="flex items-start gap-2">
                <Checkbox
                  id={`duty-${ariaLabel}-${d.code}`}
                  checked={selected.includes(d.code)}
                  onCheckedChange={v =>
                    setSelected(prev =>
                      v === true ? [...prev, d.code] : prev.filter(c => c !== d.code)
                    )
                  }
                />
                <Label
                  htmlFor={`duty-${ariaLabel}-${d.code}`}
                  className="flex flex-col items-start gap-0 text-sm font-normal"
                >
                  {d.name_th}
                  <span className="text-[11px] text-muted-foreground">{dutyRateLabel(d)}</span>
                </Label>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">ปิดหน้าต่างนี้แล้วระบบจะบันทึกให้</p>
      </PopoverContent>
    </Popover>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// อีเวนต์ที่ผูกกับเช็คอิน
// ────────────────────────────────────────────────────────────────────────────

interface EventCellProps {
  /** events.id · null = ไม่ผูกอีเวนต์ */
  value: string | null
  /** ชื่ออีเวนต์ที่ผูกอยู่ — ใช้เมื่ออีเวนต์นั้นอยู่นอกลิสต์ที่โหลดมา */
  eventName?: string | null
  events: SlipEventOption[]
  onSave: (next: string | null) => Promise<SaveResult>
  disabled?: boolean
}

export function EventCell({ value, eventName, events, onSave, disabled }: EventCellProps) {
  const { flash, run } = useCellSave()
  const [shown, setShown] = useDraftValue(value, v => v ?? '')
  const [open, setOpen] = useState(false)

  const nameOf = new Map(events.map(e => [e.id, e.name]))
  const label = shown
    ? nameOf.get(shown) || (shown === value ? eventName : null) || 'อีเวนต์ที่ผูกอยู่'
    : null

  function choose(next: string | null) {
    setOpen(false)
    if ((next ?? '') === (shown ?? '')) return
    setShown(next)
    run(() => onSave(next), () => setShown(undefined))
  }

  if (disabled) {
    return (
      <span className={cn('px-1.5', !label && 'text-muted-foreground')}>{label || '—'}</span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="อีเวนต์ที่ผูกกับเช็คอิน"
          className={cn(CELL_BUTTON, 'max-w-48', !label && 'text-muted-foreground', flash && FLASH_CLASS)}
        >
          <span className="truncate">{label || 'ไม่ผูกอีเวนต์'}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="ค้นชื่ออีเวนต์…" />
          <CommandList>
            <CommandEmpty>ไม่พบอีเวนต์ที่ค้นหา</CommandEmpty>
            <CommandGroup>
              <CommandItem value="ไม่ผูกอีเวนต์" onSelect={() => choose(null)}>
                <Check className={cn('size-4', shown ? 'opacity-0' : 'opacity-100')} />
                ไม่ผูกอีเวนต์
              </CommandItem>
              {events.map(e => (
                <CommandItem key={e.id} value={`${e.name} ${e.event_date}`} onSelect={() => choose(e.id)}>
                  <Check className={cn('size-4', shown === e.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{e.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {e.event_date}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ตจว. (สวิตช์)
// ────────────────────────────────────────────────────────────────────────────

interface ToggleCellProps {
  value: boolean
  onSave: (next: boolean) => Promise<SaveResult>
  disabled?: boolean
  ariaLabel: string
}

export function ToggleCell({ value, onSave, disabled, ariaLabel }: ToggleCellProps) {
  const { isPending, flash, run } = useCellSave()
  const [shown, setShown] = useDraftValue(value, v => (v ? '1' : '0'))

  if (disabled) {
    return (
      <span className="px-1.5 text-muted-foreground">{shown ? 'ตจว.' : '—'}</span>
    )
  }

  return (
    <span className={cn('inline-flex items-center rounded px-1', flash && FLASH_CLASS)}>
      <Switch
        checked={shown}
        disabled={isPending}
        aria-label={ariaLabel}
        onCheckedChange={next => {
          setShown(next)
          run(() => onSave(next), () => setShown(undefined))
        }}
      />
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ยอดเงินที่แก้มือทับได้ (ค่าสตาฟ / เบิ้ล / OT)
// ────────────────────────────────────────────────────────────────────────────

interface MoneyCellProps {
  /** ยอดที่ใช้จริง — null = ยังไม่กรอก */
  amount: number | null
  /** ยอดที่ระบบคำนวณได้ */
  computed: number
  /** มีค่า = บรรทัดนี้ถูกแก้มือไว้ */
  overrideNote?: string
  onSave: (amount: number, note: string) => Promise<SaveResult>
  onClear: () => Promise<SaveResult>
  disabled?: boolean
  ariaLabel: string
}

export function MoneyCell({
  amount, computed, overrideNote, onSave, onClear, disabled, ariaLabel,
}: MoneyCellProps) {
  const { isPending, flash, run } = useCellSave()
  const [open, setOpen] = useState(false)
  const [draftAmount, setDraftAmount] = useState('')
  const [draftNote, setDraftNote] = useState('')

  const overridden = !!overrideNote?.trim()
  const shownAmount = amount ?? computed

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftAmount(String(amount ?? computed ?? 0))
      setDraftNote(overrideNote || '')
    }
    setOpen(next)
  }

  function save() {
    const value = Number(draftAmount)
    if (draftAmount.trim() === '' || !Number.isFinite(value) || value < 0) {
      toast.error('จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    const note = draftNote.trim()
    if (!note) {
      toast.error('กรุณาระบุเหตุผลของการแก้มือ')
      return
    }
    setOpen(false)
    run(() => onSave(value, note))
  }

  const display = (
    <span
      className={cn(
        'tabular-nums',
        overridden && 'border-b border-dashed border-amber-500 font-medium'
      )}
      title={overridden ? `ระบบคำนวณ ${fmtMoney(computed)} บาท · ${overrideNote}` : undefined}
    >
      {fmtMoney(shownAmount)}
    </span>
  )

  if (disabled) return <span className="px-1.5">{display}</span>

  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded', flash && FLASH_CLASS)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={ariaLabel} className={cn(CELL_BUTTON, 'justify-end')}>
            {display}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div>
            <p className="text-sm font-medium">แก้มือทับยอดนี้</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              ระบบคำนวณได้ {fmtMoney(computed)} บาท — ค่าที่แก้จะไม่ถูกทับตอนคำนวณใหม่
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">จำนวนเงิน (บาท)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              value={draftAmount}
              onChange={e => setDraftAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
              className="h-8 tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">เหตุผล (บังคับ)</Label>
            <Input
              value={draftNote}
              onChange={e => setDraftNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
              placeholder="เช่น ตกลงอัตราพิเศษกับพนักงาน"
              className="h-8"
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={isPending} onClick={save}>
              บันทึก
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {overridden && (
        <button
          type="button"
          title="ล้างการแก้มือ กลับไปใช้ค่าที่ระบบคำนวณ"
          aria-label={`ล้างการแก้มือของ ${ariaLabel}`}
          disabled={isPending}
          onClick={() => run(onClear)}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// รันเนอร์ (กรอกยอดในแถว)
// ────────────────────────────────────────────────────────────────────────────

interface RunnerCellProps {
  /** null = ยังไม่กรอก */
  value: number | null
  onSave: (next: number | null) => Promise<SaveResult>
  disabled?: boolean
  ariaLabel: string
  /** ปุ่ม "ใช้ยอดนี้กับวันที่ยังว่าง" — ตัวเรียกเป็นคนตัดสินว่าช่องไหนได้ปุ่ม */
  onApplyToEmpty?: (amount: number) => Promise<SaveResult>
}

export function RunnerCell({ value, onSave, disabled, ariaLabel, onApplyToEmpty }: RunnerCellProps) {
  const { isPending, flash, run } = useCellSave()
  const [seen, setSeen] = useState(value)
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value))
  const doneRef = useRef(false)

  // ค่าจาก server เปลี่ยน (บันทึกสำเร็จ / "ใช้ยอดนี้กับวันที่ยังว่าง") → รับค่าใหม่มาแสดง
  // (doneRef ปลดล็อกที่ onChange/onFocus — ตอนนี้ text ตรงกับ value อยู่แล้ว commit จึงไม่ยิงซ้ำ)
  if (seen !== value) {
    setSeen(value)
    setText(value === null || value === undefined ? '' : String(value))
  }

  const original = value === null || value === undefined ? '' : String(value)

  function commit() {
    if (doneRef.current) return
    const raw = text.trim()
    if (raw === original) return
    doneRef.current = true

    if (raw === '') {
      run(() => onSave(null), () => { doneRef.current = false })
      return
    }
    const next = Number(raw)
    if (!Number.isFinite(next) || next < 0) {
      doneRef.current = false
      toast.error('จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ')
      return
    }
    run(() => onSave(next), () => { doneRef.current = false })
  }

  if (disabled) {
    return (
      <span className="tabular-nums">
        {value === null || value === undefined
          ? <span className="text-xs text-amber-600 dark:text-amber-500">ยังไม่กรอก</span>
          : fmtMoney(value)}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        data-runner-input=""
        value={text}
        aria-label={ariaLabel}
        placeholder="ยังไม่กรอก"
        onChange={e => { setText(e.target.value); doneRef.current = false }}
        onFocus={() => { doneRef.current = false }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Tab' && !e.shiftKey && focusNextEmptyRunner(e.currentTarget)) {
            // Tab จากช่องรันเนอร์ = ข้ามไปวันถัดไปที่ยังว่าง (ไม่ไล่ตามลำดับ tab ปกติ)
            e.preventDefault()
            commit()
          }
        }}
        className={cn(CELL_INPUT, 'w-28 text-right tabular-nums', flash && FLASH_CLASS)}
      />
      {onApplyToEmpty && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px] whitespace-nowrap"
          disabled={isPending}
          title="กรอกยอดเดียวกันนี้ให้ทุกวันที่ยังไม่ได้กรอก"
          onClick={() => {
            const amount = Number(text.trim())
            if (text.trim() === '' || !Number.isFinite(amount) || amount < 0) {
              toast.error('กรอกยอดในช่องนี้ก่อน')
              return
            }
            run(() => onApplyToEmpty(amount))
          }}
        >
          ใช้ยอดนี้กับวันที่ยังว่าง
        </Button>
      )}
    </span>
  )
}
