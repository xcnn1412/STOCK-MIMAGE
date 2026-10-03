'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Box, LayoutGrid, Plus, RotateCw, Trash2, Pencil, Minus, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { auditDue } from '../../shelf-logic'
import { nextRotation } from '../../room-logic'
import { attachShelfToRack, createRack, deleteRack, deleteRoom, setRackLevels, updateRack, updateRoom } from '../../room-actions'
import type { RoomData } from '../../queries'
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'room' | 'rack' | null>(null)
  const [now] = useState(() => new Date())
  const selected = room.racks.find(r => r.id === selectedId) ?? null

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
    <div className="space-y-4 pb-20">
      {/* หัวห้อง */}
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/shelves">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{room.name}</h1>
          <p className="text-sm text-muted-foreground">
            ขนาด {room.width} × {room.depth} ช่อง · ชั้นวาง {room.racks.length} ตู้ · {room.racks.reduce((n, r) => n + r.levels.length, 0)} ระดับ
          </p>
        </div>
        <div className="flex gap-1.5">
          <div className="inline-flex rounded-md border p-0.5">
            <Button variant={mode === '3d' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('3d')}>
              <Box className="mr-1.5 h-4 w-4" /> 3D
            </Button>
            {canManage && (
              <Button variant={mode === 'plan' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('plan')}>
                <LayoutGrid className="mr-1.5 h-4 w-4" /> จัดผัง
              </Button>
            )}
          </div>
          {canManage && (
            <>
              <Button size="sm" onClick={() => setDialog('rack')}><Plus className="mr-1 h-4 w-4" /> ชั้นวาง</Button>
              <Button variant="outline" size="icon" title="แก้ไขห้อง" onClick={() => setDialog('room')}><Pencil className="h-4 w-4" /></Button>
              <Button
                variant="outline"
                size="icon"
                title="ลบห้อง"
                className="text-red-600"
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

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* ภาพห้อง */}
        <div>
          {mode === '3d' ? (
            <Card className="h-[55vh] min-h-[360px] overflow-hidden p-0 bg-gradient-to-b from-zinc-100 to-white dark:from-zinc-900 dark:to-zinc-950">
              {room.racks.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  ยังไม่มีชั้นวาง{canManage ? ' — กด "+ ชั้นวาง" เพื่อเริ่ม' : ''}
                </div>
              ) : (
                <RoomScene room={room} selectedId={selectedId} onSelect={setSelectedId} />
              )}
            </Card>
          ) : (
            <LayoutEditor room={room} selectedId={selectedId} onSelect={setSelectedId} onSaved={() => router.refresh()} />
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {mode === '3d'
              ? 'ลากเพื่อหมุน · scroll/บีบนิ้วเพื่อซูม · กดชั้นวางเพื่อดูแต่ละระดับ · 🟪 อยู่บนชั้น 🟦 ออกงาน 🟧 มีปัญหา'
              : 'ลากชั้นวางไปวางตามตำแหน่งจริง ปล่อยแล้วบันทึกทันที · เลือกชั้นวางแล้วกดหมุนในแผงด้านขวา'}
          </p>
        </div>

        {/* แผงชั้นวางที่เลือก */}
        <div>
          {!selected ? (
            <Card className="p-4 text-sm text-muted-foreground">
              กดชั้นวางเพื่อดูระดับชั้นและของบนชั้น
              {room.racks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {room.racks.map(r => (
                    <Button key={r.id} variant="outline" size="sm" onClick={() => setSelectedId(r.id)}>{r.code}</Button>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">ชั้นวาง</div>
                  <div className="text-xl font-bold">{selected.code}</div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
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
                        if (await run(() => deleteRack(selected.id), 'ลบชั้นวางแล้ว')) setSelectedId(null)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">จำนวนระดับ</div>
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
                    <div className="text-xs text-muted-foreground mb-1">ความกว้าง (ช่อง)</div>
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
              )}

              {/* ระดับชั้น บน → ล่าง */}
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-lg border">
                {[...selected.levels].reverse().map(lv => {
                  const due = auditDue(lv.lastAudit?.createdAt ?? null, now)
                  const out = lv.things.filter(t => t.tone === 'out').length
                  const problem = lv.things.filter(t => t.tone === 'problem').length
                  return (
                    <Link key={lv.id} href={`/shelves/${lv.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <div className="w-12 shrink-0">
                        <div className="text-[10px] text-muted-foreground">ระดับ {lv.level}</div>
                        <div className="text-sm font-semibold">{lv.code}</div>
                      </div>
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="truncate">{lv.things.length === 0 ? <span className="text-muted-foreground">ว่าง</span> : lv.things.map(t => t.name).join(', ')}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                          {out > 0 && <span className="text-blue-600">ออกงาน {out}</span>}
                          {problem > 0 && <span className="text-amber-600">มีปัญหา {problem}</span>}
                          {lv.lastAudit && lv.lastAudit.missingCount > 0 ? (
                            <span className="text-rose-600">ตรวจล่าสุดไม่เจอ {lv.lastAudit.missingCount}</span>
                          ) : due.kind !== 'ok' && lv.things.length > 0 ? (
                            <span className="text-amber-600">{due.kind === 'never' ? 'ยังไม่เคยตรวจนับ' : `ไม่ได้ตรวจ ${due.days} วัน`}</span>
                          ) : null}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                    </Link>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">กดระดับชั้นเพื่อจัดของ ตรวจนับ หรือพิมพ์ QR ของระดับนั้น</p>

              {canManage && looseShelves.length > 0 && (
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

              {canManage && <RackCodeEditor key={selected.id} code={selected.code} onSave={code => run(() => updateRack(selected.id, { code }), 'เปลี่ยนรหัสแล้ว')} />}
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
        <div className="text-xs text-muted-foreground mb-1">รหัสชั้นวาง (ระดับที่ใช้รหัสอัตโนมัติเปลี่ยนตาม)</div>
        <Input value={value} onChange={e => setValue(e.target.value)} className="h-8" />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={!value.trim() || value.trim() === code}>บันทึก</Button>
    </form>
  )
}
