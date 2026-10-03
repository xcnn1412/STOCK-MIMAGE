'use client'

// ตั้งค่าผู้มีสิทธิ์อีเวนต์ 2 ชุด (แสดงในหน้า ตั้งค่า > อีเวนต์ — admin เท่านั้น)

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveEventManagers } from './actions'

interface Person { id: string; full_name: string; nickname: string | null; role: string | null }
type Perm = 'edit' | 'close'

const COLUMNS: { key: Perm; label: string }[] = [
  { key: 'edit', label: 'สร้าง / แก้ไข' },
  { key: 'close', label: 'ปิดงาน / คืนกระเป๋า' },
]

export default function EventManagersSettings({ people, ids }: { people: Person[]; ids: Record<Perm, string[]> }) {
  const [selected, setSelected] = useState(() => ({ edit: new Set(ids.edit), close: new Set(ids.close) }))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function toggle(perm: Perm, id: string) {
    setMsg(null)
    setSelected(prev => {
      const next = new Set(prev[perm])
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, [perm]: next }
    })
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    const res = await saveEventManagers({ edit: [...selected.edit], close: [...selected.close] })
    setSaving(false)
    setMsg(res?.error ? { ok: false, text: res.error } : { ok: true, text: 'บันทึกแล้ว — มีผลทันทีที่ผู้ใช้เปิดหน้าใหม่' })
  }

  return (
    <div className="max-w-2xl rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">ผู้มีสิทธิ์จัดการอีเวนต์</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
            <li><b className="font-medium text-zinc-700 dark:text-zinc-300">สร้าง / แก้ไข</b> — สร้างอีเวนต์ แก้ไขอีเวนต์ และผูกอีเวนต์กับงาน CRM</li>
            <li><b className="font-medium text-zinc-700 dark:text-zinc-300">ปิดงาน / คืนกระเป๋า</b> — ปิดงาน คืนกระเป๋า อัปโหลดรูปตอนปิดงาน และล้างประวัติปิดงานเก่า</li>
            <li>admin ทำได้ทุกอย่างอยู่แล้ว · ผู้ใช้ต้องมีสิทธิ์เข้าโมดูลอีเวนต์ด้วยจึงจะเห็นหน้านี้</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-muted-foreground dark:bg-zinc-800/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">ชื่อ</th>
              {COLUMNS.map(c => <th key={c.key} className="w-32 px-3 py-2 text-center font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {people.map(p => {
              const isAdmin = p.role === 'admin'
              const name = p.full_name || 'ไม่ระบุชื่อ'
              return (
                <tr key={p.id} className={isAdmin ? 'opacity-60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}>
                  <td className="px-3 py-2.5 text-zinc-800 dark:text-zinc-200">
                    {name}
                    {p.nickname && <span className="text-muted-foreground"> ({p.nickname})</span>}
                    {isAdmin && <span className="ml-1.5 text-xs text-muted-foreground">admin</span>}
                  </td>
                  {COLUMNS.map(c => (
                    <td key={c.key} className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${name}: ${c.label}`}
                        className="h-4 w-4 cursor-pointer accent-zinc-900 disabled:cursor-default dark:accent-zinc-100"
                        checked={isAdmin || selected[c.key].has(p.id)}
                        disabled={isAdmin}
                        onChange={() => toggle(c.key, p.id)}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={saving} size="sm">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          บันทึก
        </Button>
        {msg && (
          <span className={`flex items-center gap-1.5 text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}
