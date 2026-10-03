'use client'

// ตั้งค่าผู้มีสิทธิ์จัดการอีเวนต์ (แสดงในหน้า ตั้งค่า > อีเวนต์ — admin เท่านั้น)

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveEventManagers } from './actions'

interface Person { id: string; full_name: string; nickname: string | null; role: string | null }

export default function EventManagersSettings({ people, managerIds }: { people: Person[]; managerIds: string[] }) {
  const [selected, setSelected] = useState(() => new Set(managerIds))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function toggle(id: string) {
    setMsg(null)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setMsg(null)
    const res = await saveEventManagers([...selected])
    setSaving(false)
    setMsg(res?.error ? { ok: false, text: res.error } : { ok: true, text: 'บันทึกแล้ว — มีผลทันทีที่ผู้ใช้เปิดหน้าใหม่' })
  }

  return (
    <div className="max-w-xl rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">ผู้มีสิทธิ์จัดการอีเวนต์</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            คนที่ติ๊กไว้สร้าง แก้ไข ปิดงาน/คืนกระเป๋า และผูกอีเวนต์กับงาน CRM ได้เหมือน admin
            (admin ทำได้ทุกอย่างอยู่แล้ว) ผู้ใช้ต้องมีสิทธิ์เข้าโมดูลอีเวนต์ด้วยจึงจะเห็นหน้านี้
          </p>
        </div>
      </div>

      <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {people.map(p => {
          const isAdmin = p.role === 'admin'
          return (
            <li key={p.id}>
              <label className={`flex items-center gap-3 px-3 py-2.5 text-sm ${isAdmin ? 'opacity-60' : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                  checked={isAdmin || selected.has(p.id)}
                  disabled={isAdmin}
                  onChange={() => toggle(p.id)}
                />
                <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200">
                  {p.full_name || 'ไม่ระบุชื่อ'}
                  {p.nickname && <span className="text-muted-foreground"> ({p.nickname})</span>}
                </span>
                {isAdmin && <span className="text-xs text-muted-foreground">admin</span>}
              </label>
            </li>
          )
        })}
      </ul>

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
