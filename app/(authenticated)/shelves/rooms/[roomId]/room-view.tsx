'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Box, LayoutGrid, Plus, RotateCw, Trash2, Pencil, Minus, ChevronRight, ChevronDown, Loader2, QrCode, X, Briefcase, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { auditDue } from '../../shelf-logic'
import { nextRotation } from '../../room-logic'
import { attachShelfToRack, createRack, deleteRack, deleteRoom, setRackLevels, updateRack, updateRoom } from '../../room-actions'
import type { RoomData, RoomLevel, RoomRack } from '../../queries'
import LayoutEditor from '../layout-editor'
import FormDialog from '../../form-dialog'

// three.js ใช้ได้เฉพาะในเบราว์เซอร์
const RoomScene = dynamic(() => import('../room-scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังโหลดภาพ 3D…
    </div>
  ),
})

type Result = { error?: string }
type Tone = RoomLevel['things'][number]['tone']

const TONE: Record<Tone, { label: string; dot: string; pill: string }> = {
  home: { label: 'อยู่บนชั้น', dot: 'bg-violet-500', pill: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' },
  out: { label: 'ออกงาน', dot: 'bg-blue-500', pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' },
  problem: { label: 'มีปัญหา', dot: 'bg-amber-500', pill: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' },
}

const countTone = (things: RoomLevel['things'], tone: Tone) => things.filter(t => t.tone === tone).length

function rackStats(r: RoomRack) {
  const things = r.levels.flatMap(l => l.things)
  return {
    things: things.length,
    out: countTone(things, 'out'),
    problem: countTone(things, 'problem'),
    missing: r.levels.filter(l => (l.lastAudit?.missingCount ?? 0) > 0).length,
  }
}

export default function RoomView({
  room,
  canManage,
  looseShelves,
}: {
  room: RoomData
  canManage: boolean
  looseShelves: { id: string; code: string }[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'3d' | 'plan'>('3d')
  // จุดที่ focus: ไม่มี = ภาพรวมห้อง → ชั้นวาง → ระดับชั้น
  const [rackId, setRackId] = useState<string | null>(null)
  const [levelId, setLevelId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'room' | 'rack' | null>(null)
  const [now] = useState(() => new Date())
  const selected = room.racks.find(r => r.id === rackId) ?? null
  const openLevelId = selected?.levels.some(l => l.id === levelId) ? levelId : null

  const focusRack = (id: string | null) => {
    setRackId(id)
    setLevelId(null)
  }
  /** กดระดับเดิมซ้ำ = กลับไปมองทั้งตู้ */
  const focusLevel = (id: string) => setLevelId(cur => (cur === id ? null : id))

  // จอเล็ก: แผงอยู่ใต้ภาพ 3D — เลื่อนให้เห็นระดับที่เพิ่งเปิด
  useEffect(() => {
    if (openLevelId) document.getElementById(`level-${openLevelId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [openLevelId])

  const run = async (fn: () => Promise<Result>, ok: string) => {
    const res = await fn()
    if (res.error) toast.error(res.error)
    else {
      toast.success(ok)
      router.refresh()
    }
    return !res.error
  }

  return (
    <div className="space-y-3 pb-20">
      {/* หัวห้อง — จอเล็ก: ปุ่มลงมาอยู่แถวที่สองเต็มความกว้าง */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/shelves" className="shrink-0">
          <Button variant="ghost" size="icon" aria-label="กลับ"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight md:text-3xl">{room.name}</h1>
          <p className="truncate text-xs text-muted-foreground md:text-sm">
            {room.width} × {room.depth} ช่อง · ชั้นวาง {room.racks.length} ตู้ · {room.racks.reduce((n, r) => n + r.levels.length, 0)} ระดับ
          </p>
        </div>
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <div className="inline-flex rounded-md border p-0.5">
            <Button variant={mode === '3d' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('3d')}>
              <Box className="mr-1.5 hidden h-4 w-4 sm:inline-block" /> 3D
            </Button>
            {canManage && (
              <Button variant={mode === 'plan' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('plan')}>
                <LayoutGrid className="mr-1.5 hidden h-4 w-4 sm:inline-block" /> จัดผัง
              </Button>
            )}
          </div>
          {canManage && (
            <>
              <Button size="sm" className="ml-auto sm:ml-0" onClick={() => setDialog('rack')}><Plus className="mr-1 h-4 w-4" /> ชั้นวาง</Button>
              <Link href={`/shelves/rooms/${room.id}/print`}>
                <Button variant="outline" size="icon" className="h-8 w-8" title="พิมพ์ QR ทั้งห้อง (A4)" aria-label="พิมพ์ QR ทั้งห้อง"><QrCode className="h-4 w-4" /></Button>
              </Link>
              <Button variant="outline" size="icon" className="h-8 w-8" title="แก้ไขห้อง" onClick={() => setDialog('room')}><Pencil className="h-4 w-4" /></Button>
              <Button
                variant="outline"
                size="icon"
                title="ลบห้อง"
                className="h-8 w-8 text-red-600"
                onClick={async () => {
                  if (!confirm(`ลบห้อง ${room.name}? ชั้นวางจะถูกลบ แต่ระดับชั้น ของบนชั้น และ QR ยังอยู่ (ย้ายไป "ยังไม่อยู่ในห้อง")`)) return
                  const res = await deleteRoom(room.id)
                  if (res.error) toast.error(res.error)
                  else router.push('/shelves')
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_340px] lg:gap-4">
        {/* ภาพห้อง */}
        <div className="min-w-0">
          {mode === '3d' ? (
            <Card className="relative h-[46svh] min-h-64 overflow-hidden p-0 bg-linear-to-b from-zinc-100 to-white lg:h-[64vh] dark:from-zinc-900 dark:to-zinc-950">
              {room.racks.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  ยังไม่มีชั้นวาง{canManage ? ' — กด "+ ชั้นวาง" เพื่อเริ่ม' : ''}
                </div>
              ) : (
                <>
                  <RoomScene
                    room={room}
                    focusRackId={rackId}
                    focusLevelId={openLevelId}
                    onFocusRack={focusRack}
                    onFocusLevel={focusLevel}
                    onMove={canManage ? (id, x, y) => run(() => updateRack(id, { x, y }), 'ย้ายชั้นวางแล้ว') : undefined}
                  />
                  {/* แถบเลือกมุมมอง: ภาพรวม / ชั้นวางแต่ละตู้ — เลื่อนซ้ายขวาได้เมื่อมีหลายตู้ */}
                  <div className="pointer-events-none absolute inset-x-2 top-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                    <FocusChip active={!selected} onClick={() => focusRack(null)}>ภาพรวม</FocusChip>
                    {room.racks.map(r => (
                      <FocusChip key={r.id} active={r.id === rackId} onClick={() => focusRack(r.id)}>{r.code}</FocusChip>
                    ))}
                  </div>
                  {/* ความหมายของสี */}
                  <div className="pointer-events-none absolute bottom-2 left-2 flex gap-2.5 rounded-md bg-white/85 px-2 py-1 text-[10px] text-zinc-600 shadow-sm dark:bg-zinc-900/85 dark:text-zinc-300">
                    {(Object.keys(TONE) as Tone[]).map(t => (
                      <span key={t} className="inline-flex items-center gap-1">
                        <span className={cn('h-2 w-2 rounded-sm', TONE[t].dot)} /> {TONE[t].label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
          ) : (
            <LayoutEditor room={room} selectedId={rackId} onSelect={focusRack} onSaved={() => router.refresh()} />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {mode === '3d' ? (
              <>
                กดชั้นวางเพื่อซูมเข้า แล้วกดระดับชั้นเพื่อดูของบนชั้น · ลากพื้นเพื่อหมุน
                {canManage && <span className="hidden sm:inline"> · ลากชั้นวางด้วยเมาส์เพื่อย้าย (จอสัมผัสใช้โหมดจัดผัง)</span>}
              </>
            ) : (
              'ลากชั้นวางไปวางตามตำแหน่งจริง ปล่อยแล้วบันทึกทันที · เลือกชั้นวางแล้วกดหมุนในแผงข้อมูล'
            )}
          </p>
        </div>

        {/* แผงข้อมูล: ภาพรวม = รายการชั้นวาง · focus ตู้ = ระดับชั้นของตู้นั้น */}
        <div className="min-w-0">
          {!selected ? (
            <Card className="gap-0 overflow-hidden p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold">ชั้นวางในห้องนี้</div>
              {room.racks.length === 0 && <p className="p-4 text-sm text-muted-foreground">ยังไม่มีชั้นวาง</p>}
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {room.racks.map(r => {
                  const s = rackStats(r)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => focusRack(r.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-zinc-100 px-2 text-sm font-bold dark:bg-zinc-800">{r.code}</span>
                      <span className="min-w-0 flex-1 text-xs">
                        <span className="block text-sm font-medium">{r.levels.length} ระดับ · ของ {s.things} รายการ</span>
                        <span className="flex flex-wrap gap-x-2">
                          {s.out > 0 && <span className="text-blue-600">ออกงาน {s.out}</span>}
                          {s.problem > 0 && <span className="text-amber-600">มีปัญหา {s.problem}</span>}
                          {s.missing > 0 && <span className="text-rose-600">ตรวจล่าสุดของไม่ครบ {s.missing} ระดับ</span>}
                          {s.out + s.problem + s.missing === 0 && <span className="text-muted-foreground">ปกติ</span>}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                    </button>
                  )
                })}
              </div>
            </Card>
          ) : (
            <Card className="gap-4 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">ชั้นวาง</div>
                  <div className="text-xl font-bold">{selected.code}</div>
                </div>
                <div className="flex gap-1">
                  {canManage && (
                    <>
                      <Button variant="outline" size="icon" title="หมุน 90°" onClick={() => run(() => updateRack(selected.id, { rotation: nextRotation(selected.rotation) }), 'หมุนแล้ว')}>
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="ลบชั้นวาง"
                        className="text-red-600"
                        onClick={async () => {
                          if (!confirm(`ลบชั้นวาง ${selected.code}? ระดับชั้น ของบนชั้น และ QR ยังอยู่ (ย้ายไป "ยังไม่อยู่ในห้อง")`)) return
                          if (await run(() => deleteRack(selected.id), 'ลบชั้นวางแล้ว')) focusRack(null)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" title="กลับภาพรวม" onClick={() => focusRack(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* ระดับชั้น บน → ล่าง — กดเพื่อ focus ระดับนั้นและดูของ */}
              <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border dark:divide-zinc-800">
                {[...selected.levels].reverse().map(lv => {
                  const open = lv.id === openLevelId
                  const due = auditDue(lv.lastAudit?.createdAt ?? null, now)
                  const out = countTone(lv.things, 'out')
                  const problem = countTone(lv.things, 'problem')
                  return (
                    <div key={lv.id} id={`level-${lv.id}`} className={cn(open && 'bg-violet-50/70 dark:bg-violet-950/20')}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => focusLevel(lv.id)}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left"
                      >
                        <span className="w-12 shrink-0">
                          <span className="block text-[10px] text-muted-foreground">ระดับ {lv.level}</span>
                          <span className={cn('block text-sm font-semibold', open && 'text-violet-700 dark:text-violet-300')}>{lv.code}</span>
                        </span>
                        <span className="min-w-0 flex-1 text-xs">
                          <span className="block truncate">
                            {lv.things.length === 0 ? <span className="text-muted-foreground">ว่าง</span> : open ? `${lv.things.length} รายการ` : lv.things.map(t => t.name).join(', ')}
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                            {out > 0 && <span className="text-blue-600">ออกงาน {out}</span>}
                            {problem > 0 && <span className="text-amber-600">มีปัญหา {problem}</span>}
                            {lv.lastAudit && lv.lastAudit.missingCount > 0 ? (
                              <span className="text-rose-600">ตรวจล่าสุดไม่เจอ {lv.lastAudit.missingCount}</span>
                            ) : due.kind !== 'ok' && lv.things.length > 0 ? (
                              <span className="text-amber-600">{due.kind === 'never' ? 'ยังไม่เคยตรวจนับ' : `ไม่ได้ตรวจ ${due.days} วัน`}</span>
                            ) : null}
                          </span>
                        </span>
                        <ChevronDown className={cn('h-4 w-4 shrink-0 text-zinc-400 transition-transform', open && 'rotate-180')} />
                      </button>

                      {open && (
                        <div className="space-y-3 px-3 pb-3">
                          {lv.things.length === 0 ? (
                            <p className="text-xs text-muted-foreground">ยังไม่มีของบนระดับนี้</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {lv.things.map(t => (
                                <li key={`${t.kind}:${t.id}`} className="flex items-center gap-2 text-sm">
                                  {t.kind === 'kit'
                                    ? <Briefcase className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                                    : <Package className="h-3.5 w-3.5 shrink-0 text-zinc-400" />}
                                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', TONE[t.tone].pill)}>{TONE[t.tone].label}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="flex gap-2">
                            <Link href={`/shelves/${lv.id}`} className="flex-1">
                              <Button size="sm" className="w-full">{canManage ? 'จัดของ / ตรวจนับ' : 'ดูรายละเอียด / ตรวจนับ'}</Button>
                            </Link>
                            {canManage && (
                              <Link href={`/shelves/${lv.id}/print`}>
                                <Button size="sm" variant="outline"><QrCode className="mr-1.5 h-4 w-4" /> QR</Button>
                              </Link>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {canManage && (
                <details className="rounded-lg border px-3 py-2 text-sm">
                  <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">ตั้งค่าชั้นวาง (จำนวนระดับ ความกว้าง รหัส)</summary>
                  <div className="space-y-4 pb-1 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">จำนวนระดับ</div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8" disabled={selected.levels.length <= 1}
                            onClick={() => run(() => setRackLevels(selected.id, selected.levels.length - 1), 'ลดระดับแล้ว')}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-8 text-center font-semibold">{selected.levels.length}</span>
                          <Button variant="outline" size="icon" className="h-8 w-8"
                            onClick={() => run(() => setRackLevels(selected.id, selected.levels.length + 1), 'เพิ่มระดับแล้ว')}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">ความกว้าง (ช่อง)</div>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map(w => (
                            <Button key={w} variant={selected.width === w ? 'default' : 'outline'} size="sm" className="h-8 w-8 px-0"
                              onClick={() => run(() => updateRack(selected.id, { width: w }), 'บันทึกแล้ว')}>
                              {w}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {looseShelves.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">ย้ายชั้นเดิมเข้าเป็นระดับบนสุด (QR เดิมใช้ได้)</div>
                        <select
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                          defaultValue=""
                          onChange={async e => {
                            const id = e.target.value
                            e.target.value = ''
                            if (id) await run(() => attachShelfToRack(id, selected.id), 'ย้ายเข้าชั้นวางแล้ว')
                          }}
                        >
                          <option value="" disabled>เลือกชั้นเดิม…</option>
                          {looseShelves.map(s => <option key={s.id} value={s.id}>{s.code}</option>)}
                        </select>
                      </div>
                    )}

                    <RackCodeEditor key={selected.id} code={selected.code} onSave={code => run(() => updateRack(selected.id, { code }), 'เปลี่ยนรหัสแล้ว')} />
                  </div>
                </details>
              )}
            </Card>
          )}
        </div>
      </div>

      {canManage && dialog === 'rack' && (
        <FormDialog
          title="เพิ่มชั้นวาง"
          fields={[
            { key: 'code', label: 'รหัสชั้นวาง', placeholder: 'A', initial: '' },
            { key: 'levels', label: 'จำนวนระดับชั้น', type: 'number', initial: '4' },
            { key: 'width', label: 'ความกว้าง (ช่อง 1–4)', type: 'number', initial: '2' },
          ]}
          hint="ระดับชั้นได้รหัสอัตโนมัติ เช่น A-1 (ล่างสุด), A-2 … แต่ละระดับมี QR ของตัวเอง"
          onClose={() => setDialog(null)}
          onSubmit={v => run(() => createRack(room.id, { code: v.code, levels: Number(v.levels), width: Number(v.width) }), `เพิ่มชั้นวาง ${v.code} แล้ว`)}
        />
      )}
      {canManage && dialog === 'room' && (
        <FormDialog
          title="แก้ไขห้อง"
          fields={[
            { key: 'name', label: 'ชื่อห้อง', initial: room.name },
            { key: 'width', label: 'กว้าง (ช่อง)', type: 'number', initial: String(room.width) },
            { key: 'depth', label: 'ลึก (ช่อง)', type: 'number', initial: String(room.depth) },
          ]}
          onClose={() => setDialog(null)}
          onSubmit={v => run(() => updateRoom(room.id, { name: v.name, width: Number(v.width), depth: Number(v.depth) }), 'บันทึกแล้ว')}
        />
      )}
    </div>
  )
}

/** ปุ่มเลือกมุมมองบนภาพ 3D */
function FocusChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'pointer-events-auto h-8 shrink-0 rounded-full border px-3 text-xs font-semibold shadow-sm transition-colors',
        active
          ? 'border-violet-600 bg-violet-600 text-white'
          : 'border-zinc-200 bg-white/90 text-zinc-700 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200'
      )}
    >
      {children}
    </button>
  )
}

function RackCodeEditor({ code, onSave }: { code: string; onSave: (code: string) => Promise<boolean> }) {
  const [value, setValue] = useState(code)
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={e => {
        e.preventDefault()
        if (value.trim() && value.trim() !== code) onSave(value.trim())
      }}
    >
      <div className="flex-1">
        <div className="mb-1 text-xs text-muted-foreground">รหัสชั้นวาง (ระดับที่ใช้รหัสอัตโนมัติเปลี่ยนตาม)</div>
        <Input value={value} onChange={e => setValue(e.target.value)} className="h-8" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={!value.trim() || value.trim() === code}>บันทึก</Button>
    </form>
  )
}
