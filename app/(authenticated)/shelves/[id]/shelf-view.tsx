'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Briefcase, Package, Pencil, Trash2, QrCode, Plus, X, AlertTriangle, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/contexts/language-context'
import { cn } from '@/lib/utils'
import { auditDue, auditTargets, countProblems, kitShelfState, PROBLEM_STATUSES, AUDIT_DUE_DAYS } from '../shelf-logic'
import AuditPanel from './audit-panel'
import type { RoomLevel } from '../queries'

// รูปชั้นวาง 3D เล็กๆ (three.js ใช้ได้เฉพาะในเบราว์เซอร์)
const RackMini = dynamic(() => import('../rooms/room-scene').then(m => m.RackMini), { ssr: false })

export interface RackInfo {
  id: string
  code: string
  width: number
  roomId: string
  roomName: string
  level: number
  levels: RoomLevel[]
}
import ShelfFormDialog from '../shelf-form-dialog'
import { deleteShelf, moveToShelf, updateShelf } from '../actions'

export interface ShelfKit {
  id: string
  name: string
  event: { name: string | null; event_date: string | null } | null
  items: { id: string; name: string; status: string }[]
}
export interface ShelfItem {
  id: string
  name: string
  serial_number: string | null
  status: string
  quantity: number | null
}
export interface AuditRow {
  id: string
  createdAt: string
  expected: number
  found: number
  missing: { kind: 'kit' | 'item'; id: string; name: string }[]
  note: string | null
  by: string
}
export interface Candidate {
  id: string
  label: string
  /** รหัสชั้นที่ของชิ้นนี้อยู่ตอนนี้ — null = ยังไม่มีชั้น */
  currentShelf: string | null
}

const STATUS_TONE: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  in_use: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  damaged: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  maintenance: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  lost: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
}
const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'

const thaiDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : ''

export default function ShelfView({
  shelf,
  kits,
  items,
  canManage,
  kitCandidates,
  itemCandidates,
  audits,
  rack,
}: {
  shelf: { id: string; zone: string; code: string; name: string | null; note: string | null }
  kits: ShelfKit[]
  items: ShelfItem[]
  canManage: boolean
  kitCandidates: Candidate[]
  itemCandidates: Candidate[]
  audits: AuditRow[]
  rack: RackInfo | null
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [adding, setAdding] = useState<'kit' | 'item' | null>(null)
  const [onlyAway, setOnlyAway] = useState(false)
  const [auditing, setAuditing] = useState(false)
  // ponytail: วันนี้อ่านตอน render (หน้าเปิดสั้นๆ) — ไม่ต้อง tick ตามเวลา
  const [now] = useState(() => new Date())

  const statusLabel = (s: string) => t.items.status[s as keyof typeof t.items.status] || s

  const kitRows = kits.map(k => ({ ...k, state: kitShelfState(k.items.map(i => i.status), k.event) }))
  const outCount = kitRows.filter(k => k.state.kind === 'out').length
  const problemCount =
    kitRows.reduce((n, k) => n + countProblems(k.items.map(i => i.status)), 0) + countProblems(items.map(i => i.status))
  // "ไม่อยู่บนชั้น / มีปัญหา" = กระเป๋าที่ออกงานหรือมีของเสีย + อุปกรณ์ที่ไม่ว่าง
  const shownKits = onlyAway
    ? kitRows.filter(k => k.state.kind === 'out' || countProblems(k.items.map(i => i.status)) > 0)
    : kitRows
  const shownItems = onlyAway ? items.filter(i => i.status !== 'available') : items

  const plan = auditTargets(
    kits.map(k => ({ id: k.id, name: k.name, itemStatuses: k.items.map(i => i.status) })),
    items
  )
  const last = audits[0] ?? null
  const due = auditDue(last?.createdAt ?? null, now)

  const run = async (fn: () => Promise<{ error?: string }>, ok: string) => {
    const res = await fn()
    if (res.error) toast.error(res.error)
    else {
      toast.success(ok)
      router.refresh()
    }
    return !res.error
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20">
      {/* หัวชั้น */}
      <div className="flex items-start gap-3">
        <Link href="/shelves">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          {rack ? (
            <div className="text-xs font-medium text-muted-foreground">
              <Link href={`/shelves/rooms/${rack.roomId}`} className="hover:underline">{rack.roomName}</Link>
              {' › '}ชั้นวาง {rack.code}{' › '}ระดับ {rack.level} จาก {rack.levels.length}
            </div>
          ) : (
            <div className="text-xs font-medium text-muted-foreground">โซน {shelf.zone}</div>
          )}
          <h1 className="text-3xl font-bold tracking-tight">{shelf.code}</h1>
          {shelf.name && <p className="text-sm text-muted-foreground">{shelf.name}</p>}
          {shelf.note && <p className="mt-1 text-xs text-zinc-500 whitespace-pre-line">{shelf.note}</p>}
        </div>
        {canManage && (
          <div className="flex gap-1">
            <Link href={`/shelves/${shelf.id}/print`}>
              <Button variant="outline" size="icon" title="พิมพ์ QR"><QrCode className="h-4 w-4" /></Button>
            </Link>
            <Button variant="outline" size="icon" title="แก้ไขชั้น" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              title="ลบชั้น"
              className="text-red-600"
              onClick={async () => {
                if (!confirm(`ลบชั้น ${shelf.code}? กระเป๋าและอุปกรณ์บนชั้นจะกลายเป็น "ยังไม่มีชั้น" (ไม่ถูกลบ)`)) return
                const res = await deleteShelf(shelf.id)
                if (res.error) toast.error(res.error)
                else {
                  toast.success(`ลบชั้น ${shelf.code} แล้ว`)
                  router.push('/shelves')
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {rack && (
        <Card className="h-44 overflow-hidden p-0 bg-linear-to-b from-zinc-100 to-white dark:from-zinc-900 dark:to-zinc-950">
          <RackMini rack={rack} highlightLevelId={shelf.id} />
        </Card>
      )}

      {/* สรุป */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-2xl font-bold">{kits.length}</div>
          <div className="text-xs text-muted-foreground">กระเป๋า{outCount > 0 ? ` · ออกงาน ${outCount}` : ''}</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold">{items.length}</div>
          <div className="text-xs text-muted-foreground">อุปกรณ์แยกชิ้น</div>
        </Card>
        <Card className={cn('p-3', problemCount > 0 && 'border-amber-300 dark:border-amber-700')}>
          <div className="text-2xl font-bold">{problemCount}</div>
          <div className="text-xs text-muted-foreground">เสีย / ซ่อม / หาย</div>
        </Card>
      </div>

      {/* ตรวจนับ */}
      {auditing ? (
        <AuditPanel
          shelfId={shelf.id}
          expected={plan.expected}
          skipped={plan.skipped}
          onClose={() => setAuditing(false)}
          onSaved={() => {
            setAuditing(false)
            router.refresh()
          }}
        />
      ) : (
        <Card className={cn('p-3 flex items-center gap-3', due.kind !== 'ok' && 'border-amber-300 dark:border-amber-700')}>
          <ClipboardCheck className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0 text-sm">
            {due.kind === 'never' ? (
              <span className="text-amber-700 dark:text-amber-400 font-medium">ยังไม่เคยตรวจนับชั้นนี้</span>
            ) : (
              <>
                <span className={cn(due.kind === 'overdue' && 'text-amber-700 dark:text-amber-400 font-medium')}>
                  ตรวจล่าสุด {due.days === 0 ? 'วันนี้' : `${due.days} วันก่อน`}
                  {due.kind === 'overdue' ? ` (เกิน ${AUDIT_DUE_DAYS} วัน)` : ''}
                </span>
                <span className="text-muted-foreground"> · {last!.by} · </span>
                {last!.missing.length > 0
                  ? <span className="text-rose-600 dark:text-rose-400 font-medium">ไม่เจอ {last!.missing.length}</span>
                  : <span className="text-emerald-600 dark:text-emerald-400">ครบ</span>}
              </>
            )}
          </div>
          <Button size="sm" onClick={() => setAuditing(true)}>ตรวจนับ</Button>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button variant={onlyAway ? 'default' : 'outline'} size="sm" onClick={() => setOnlyAway(v => !v)}>
          <AlertTriangle className="mr-2 h-4 w-4" />
          เฉพาะที่ไม่อยู่บนชั้น / มีปัญหา
        </Button>
      </div>

      {/* กระเป๋า */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Briefcase className="h-4 w-4" /> กระเป๋า</h2>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setAdding('kit')}><Plus className="mr-1 h-4 w-4" /> เพิ่มกระเป๋า</Button>
          )}
        </div>
        {shownKits.length === 0 && <p className="text-sm text-muted-foreground py-3">ไม่มีกระเป๋า{onlyAway ? 'ที่ต้องดู' : 'บนชั้นนี้'}</p>}
        {shownKits.map(k => {
          const problems = countProblems(k.items.map(i => i.status))
          return (
            <Card key={k.id} className="p-0 overflow-hidden">
              <details>
                <summary className="flex items-center gap-3 p-3 cursor-pointer list-none">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{k.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {k.state.kind === 'out' && (
                        <span className={cn(PILL, STATUS_TONE.in_use)}>ออกงาน{k.state.eventName ? ` @ ${k.state.eventName}` : ''}</span>
                      )}
                      {k.state.kind === 'booked' && (
                        <span className={cn(PILL, 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200')}>
                          อยู่บนชั้น · จองไว้ {k.state.eventName} {thaiDate(k.state.eventDate)}
                        </span>
                      )}
                      {k.state.kind === 'home' && <span className={cn(PILL, STATUS_TONE.available)}>อยู่บนชั้น</span>}
                      <span className={cn(PILL, 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>{k.items.length} ชิ้น</span>
                      {problems > 0 && <span className={cn(PILL, STATUS_TONE.damaged)}>มีปัญหา {problems}</span>}
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="เอาออกจากชั้น"
                      onClick={e => {
                        e.preventDefault()
                        if (confirm(`เอา ${k.name} ออกจากชั้น ${shelf.code}?`)) run(() => moveToShelf('kit', k.id, null), 'เอาออกจากชั้นแล้ว')
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </summary>
                <ul className="border-t divide-y divide-zinc-100 dark:divide-zinc-800">
                  {k.items.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">กระเป๋าว่าง</li>}
                  {k.items.map(i => (
                    <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="truncate">{i.name}</span>
                      <span className={cn(PILL, STATUS_TONE[i.status] ?? 'bg-zinc-100 text-zinc-700')}>{statusLabel(i.status)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )
        })}
      </section>

      {/* อุปกรณ์แยกชิ้น */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4" /> อุปกรณ์แยกชิ้น</h2>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setAdding('item')}><Plus className="mr-1 h-4 w-4" /> เพิ่มอุปกรณ์</Button>
          )}
        </div>
        {shownItems.length === 0 && <p className="text-sm text-muted-foreground py-3">ไม่มีอุปกรณ์{onlyAway ? 'ที่ต้องดู' : 'แยกชิ้นบนชั้นนี้'}</p>}
        {shownItems.length > 0 && (
          <Card className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800">
            {shownItems.map(i => (
              <div key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{i.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.serial_number ? `S/N ${i.serial_number} · ` : ''}จำนวน {i.quantity ?? 1}
                  </div>
                </div>
                <span className={cn(PILL, STATUS_TONE[i.status] ?? 'bg-zinc-100 text-zinc-700', PROBLEM_STATUSES.includes(i.status) && 'font-semibold')}>
                  {statusLabel(i.status)}
                </span>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    title="เอาออกจากชั้น"
                    onClick={() => {
                      if (confirm(`เอา ${i.name} ออกจากชั้น ${shelf.code}?`)) run(() => moveToShelf('item', i.id, null), 'เอาออกจากชั้นแล้ว')
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ประวัติตรวจนับ */}
      {audits.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> ประวัติตรวจนับ</h2>
          <Card className="p-0 divide-y divide-zinc-100 dark:divide-zinc-800">
            {audits.map(a => (
              <div key={a.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {new Date(a.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                    <span className="text-muted-foreground"> · {a.by}</span>
                  </span>
                  <span className={cn(PILL, a.missing.length > 0 ? STATUS_TONE.lost : STATUS_TONE.available)}>
                    {a.missing.length > 0 ? `ไม่เจอ ${a.missing.length}/${a.expected}` : `ครบ ${a.found}/${a.expected}`}
                  </span>
                </div>
                {a.missing.length > 0 && (
                  <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">ไม่เจอ: {a.missing.map(m => m.name).join(', ')}</div>
                )}
                {a.note && <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line">{a.note}</div>}
              </div>
            ))}
          </Card>
        </section>
      )}

      {canManage && (
        <>
          <ShelfFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            title={`แก้ไขชั้น ${shelf.code}`}
            initial={{ zone: shelf.zone, code: shelf.code, name: shelf.name ?? '', note: shelf.note ?? '' }}
            onSubmit={input => run(() => updateShelf(shelf.id, input), 'บันทึกแล้ว')}
          />
          <AddDialog
            open={adding !== null}
            onOpenChange={o => !o && setAdding(null)}
            title={adding === 'kit' ? `เพิ่มกระเป๋าเข้าชั้น ${shelf.code}` : `เพิ่มอุปกรณ์เข้าชั้น ${shelf.code}`}
            hint={adding === 'item' ? 'แสดงเฉพาะอุปกรณ์ที่ไม่ได้อยู่ในกระเป๋า — ของในกระเป๋าอยู่ตามกระเป๋า' : undefined}
            candidates={adding === 'kit' ? kitCandidates : itemCandidates}
            onPick={async c => {
              if (c.currentShelf && !confirm(`${c.label} อยู่ชั้น ${c.currentShelf} — ย้ายมาชั้น ${shelf.code}?`)) return
              await run(() => moveToShelf(adding === 'kit' ? 'kit' : 'item', c.id, shelf.id), `วาง ${c.label} บนชั้น ${shelf.code} แล้ว`)
            }}
          />
        </>
      )}
    </div>
  )
}

function AddDialog({
  open,
  onOpenChange,
  title,
  hint,
  candidates,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  hint?: string
  candidates: Candidate[]
  onPick: (c: Candidate) => Promise<void>
}) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const list = candidates.filter(c => c.label.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) setQ('') }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <Input placeholder="ค้นหาชื่อ..." value={q} onChange={e => setQ(e.target.value)} autoFocus />
        <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
          {list.length === 0 && <p className="py-4 text-sm text-muted-foreground">ไม่พบรายการ</p>}
          {list.map(c => (
            <button
              key={c.id}
              type="button"
              disabled={busy !== null}
              className="w-full flex items-center justify-between gap-2 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
              onClick={async () => {
                setBusy(c.id)
                await onPick(c)
                setBusy(null)
              }}
            >
              <span className="truncate">{c.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{c.currentShelf ? `อยู่ชั้น ${c.currentShelf}` : 'ยังไม่มีชั้น'}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
