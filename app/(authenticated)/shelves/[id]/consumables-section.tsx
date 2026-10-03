'use client'

// หมวด "วัสดุสิ้นเปลือง" บนหน้าชั้น — รับข้อมูลทาง props เท่านั้น (ไม่มี router / ภาษา / โหลดข้อมูลตอน render)
// เบิกใช้ + ประวัติ = ทุกคน · เติม / ตัดทิ้ง / ปรับยอด = ผู้ดูแล (server ตรวจสิทธิ์ซ้ำ)

import { useState } from 'react'
import { Droplet, Minus, Plus, Trash2, Scale, History } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { onShelf, parseCount, parseQty, shortage, stockLevel, totalFromShelfCount } from '../consumable-logic'
import {
  adjustStock,
  discardStock,
  drawStock,
  loadStockHistory,
  restockItem,
  type StockHistoryRow,
} from '../stock-actions'

export interface ConsumableRow {
  id: string
  name: string
  unit: string | null
  /** ยอดคงเหลือ (บนชั้น + ในกระเป๋า) */
  total: number
  /** ผลรวมจำนวนประจำกระเป๋า */
  inKits: number
  /** จำนวนขั้นต่ำ — null = ไม่เตือน */
  min: number | null
}

type Mode = 'draw' | 'restock' | 'discard' | 'adjust'

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'
const LEVEL_PILL = {
  out: { label: 'ของหมด', tone: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' },
  low: { label: 'ใกล้หมด', tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' },
} as const

const MODE: Record<Mode, { title: string; field: string }> = {
  draw: { title: 'เบิกใช้', field: 'จำนวนที่เบิก' },
  restock: { title: 'เติม', field: 'จำนวนที่เติม' },
  discard: { title: 'ตัดทิ้ง', field: 'จำนวนที่ตัดทิ้ง' },
  adjust: { title: 'ปรับยอด', field: 'นับได้บนชั้น' },
}

const REASON: Record<string, string> = { restock: 'เติม', use: 'เบิกใช้', discard: 'ตัดทิ้ง', adjust: 'ปรับยอด' }

const unitOf = (r: ConsumableRow) => r.unit || 'ชิ้น'

export default function ConsumablesSection({
  rows,
  canManage,
  onChanged,
}: {
  rows: ConsumableRow[]
  canManage: boolean
  /** หลังยอดเปลี่ยนสำเร็จ — หน้าแม่ refresh ข้อมูล */
  onChanged: () => void
}) {
  const [open, setOpen] = useState<{ row: ConsumableRow; mode: Mode | 'history' } | null>(null)
  const [raw, setRaw] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<StockHistoryRow[] | null>(null)

  const start = (row: ConsumableRow, mode: Mode) => {
    setRaw('')
    setNote('')
    setOpen({ row, mode })
  }

  const showHistory = async (row: ConsumableRow) => {
    setHistory(null)
    setOpen({ row, mode: 'history' })
    const res = await loadStockHistory(row.id)
    if (res.error) {
      toast.error(res.error)
      setOpen(null)
    } else setHistory(res.rows ?? [])
  }

  return (
    <section className="space-y-2">
      <h2 className="font-semibold flex items-center gap-2"><Droplet className="h-4 w-4" /> วัสดุสิ้นเปลือง</h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground py-3">ไม่มีวัสดุสิ้นเปลืองที่ต้องดู</p>}
      {rows.length > 0 && (
        <Card className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map(r => {
            const level = stockLevel(r.total, r.inKits, r.min)
            const short = shortage(r.total, r.inKits)
            return (
              <div key={r.id} className="px-3 py-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium wrap-break-word">{r.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      ทั้งหมด {r.total} · ในกระเป๋า {r.inKits}
                      {short > 0 && <span className="text-rose-600 dark:text-rose-400"> · ขาด {short}</span>}
                      {r.min != null && <> · ขั้นต่ำ {r.min}</>}
                    </div>
                    {level !== 'ok' && <span className={cn(PILL, 'mt-1', LEVEL_PILL[level].tone)}>{LEVEL_PILL[level].label}</span>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-2xl font-bold leading-none">
                      {onShelf(r.total, r.inKits)} <span className="text-sm font-normal text-muted-foreground">{unitOf(r)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">เหลือบนชั้น</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="h-9" onClick={() => start(r, 'draw')} disabled={r.total <= 0}>
                    <Minus className="h-4 w-4" /> เบิกใช้
                  </Button>
                  {canManage && (
                    <>
                      <Button variant="outline" className="h-9" onClick={() => start(r, 'restock')}>
                        <Plus className="h-4 w-4" /> เติม
                      </Button>
                      <Button variant="outline" className="h-9 text-red-600" onClick={() => start(r, 'discard')} disabled={r.total <= 0}>
                        <Trash2 className="h-4 w-4" /> ตัดทิ้ง
                      </Button>
                      <Button variant="outline" className="h-9" onClick={() => start(r, 'adjust')}>
                        <Scale className="h-4 w-4" /> ปรับยอด
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" className="h-9" onClick={() => showHistory(r)}>
                    <History className="h-4 w-4" /> ประวัติ
                  </Button>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <Dialog open={open !== null} onOpenChange={o => !o && !busy && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          {open && open.mode === 'history' && (
            <>
              <DialogHeader>
                <DialogTitle>ประวัติ · {open.row.name}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                {history === null && <p className="py-4 text-sm text-muted-foreground">กำลังโหลด...</p>}
                {history?.length === 0 && <p className="py-4 text-sm text-muted-foreground">ยังไม่มีประวัติ</p>}
                {history?.map(h => (
                  <div key={h.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        {new Date(h.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                        <span className="text-muted-foreground"> · {h.byName || 'ไม่ทราบชื่อ'}</span>
                      </span>
                      <span className={cn('shrink-0 font-semibold', h.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                        {h.delta > 0 ? `+${h.delta}` : h.delta}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {REASON[h.reason] ?? h.reason}
                      {h.eventName ? ` · ${h.eventName}` : ''}
                      {` · เหลือ ${h.balanceAfter}`}
                      {h.note ? ` · ${h.note}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {open && open.mode !== 'history' && (
            <StockForm
              row={open.row}
              mode={open.mode}
              raw={raw}
              setRaw={setRaw}
              note={note}
              setNote={setNote}
              busy={busy}
              onSubmit={async (n, text) => {
                const row = open.row
                const mode = open.mode as Mode
                setBusy(true)
                const res =
                  mode === 'draw' ? await drawStock(row.id, n, text)
                  : mode === 'restock' ? await restockItem(row.id, n, text)
                  : mode === 'discard' ? await discardStock(row.id, n, text)
                  : await adjustStock(row.id, totalFromShelfCount(n, row.inKits), text)
                setBusy(false)
                if (res.error) return void toast.error(res.error)
                toast.success(`${MODE[mode].title} ${row.name} แล้ว · คงเหลือ ${res.balance ?? ''} ${unitOf(row)}`)
                setOpen(null)
                onChanged()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function StockForm({
  row,
  mode,
  raw,
  setRaw,
  note,
  setNote,
  busy,
  onSubmit,
}: {
  row: ConsumableRow
  mode: Mode
  raw: string
  setRaw: (v: string) => void
  note: string
  setNote: (v: string) => void
  busy: boolean
  onSubmit: (n: number, note: string) => void
}) {
  // ปรับยอด: กรอก "นับได้บนชั้น" (0 ได้) → ยอดใหม่ = นับได้ + ในกระเป๋า
  const n = mode === 'adjust' ? parseCount(raw) : parseQty(raw)
  const after =
    n == null ? null
    : mode === 'restock' ? row.total + n
    : mode === 'adjust' ? totalFromShelfCount(n, row.inKits)
    : row.total - n
  const over = (mode === 'draw' || mode === 'discard') && n != null && n > row.total
  const needNote = mode === 'discard' && !note.trim()
  const disabled = busy || n == null || over || needNote

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (!disabled && n != null) onSubmit(n, note)
      }}
    >
      <DialogHeader>
        <DialogTitle>{MODE[mode].title} · {row.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <label htmlFor="stock-qty" className="text-sm font-medium">{MODE[mode].field} ({unitOf(row)})</label>
        <Input
          id="stock-qty"
          type="number"
          inputMode="numeric"
          min={mode === 'adjust' ? 0 : 1}
          step={1}
          value={raw}
          onChange={e => setRaw(e.target.value)}
          className="h-11 text-lg"
          autoFocus
        />
        {mode === 'adjust' && <p className="text-xs text-muted-foreground">ไม่ต้องนับของในกระเป๋า ({row.inKits} {unitOf(row)}) — ระบบบวกให้</p>}
        {over && <p className="text-xs text-rose-600">เกินยอดคงเหลือ ({row.total} {unitOf(row)})</p>}
      </div>
      <div className="space-y-2">
        <label htmlFor="stock-note" className="text-sm font-medium">
          {mode === 'discard' ? 'เหตุผลที่ตัดทิ้ง (ต้องกรอก)' : 'หมายเหตุ (ไม่บังคับ)'}
        </label>
        <Input id="stock-note" value={note} onChange={e => setNote(e.target.value)} className="h-11" />
      </div>
      <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm">
        ยอดคงเหลือ <span className="font-semibold">{row.total}</span>
        {' → '}
        <span className={cn('font-semibold', after != null && after < 0 && 'text-rose-600')}>{after ?? '–'}</span> {unitOf(row)}
      </div>
      <Button type="submit" className="w-full h-11" disabled={disabled}>
        {busy ? 'กำลังบันทึก...' : `ยืนยัน${MODE[mode].title}`}
      </Button>
    </form>
  )
}
