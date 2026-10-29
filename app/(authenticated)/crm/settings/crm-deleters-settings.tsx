'use client'

// ตั้งค่าผู้ที่ลบลูกค้าได้ (หน้า ตั้งค่า > CRM — admin เท่านั้น) · markup เดียวกับ events/event-managers-settings.tsx

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/lib/i18n/context'
import { saveCrmDeleters } from '../actions'

interface Person { id: string; full_name: string; nickname: string | null; role: string | null }

export default function CrmDeletersSettings({ people, ids }: { people: Person[]; ids: string[] }) {
  const tc = useLocale().t.crm.deleters
  const [selected, setSelected] = useState(() => new Set(ids))
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
    const res = await saveCrmDeleters([...selected])
    setSaving(false)
    setMsg(res?.error ? { ok: false, text: res.error } : { ok: true, text: tc.saved })
  }

  return (
    <div className="max-w-2xl rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{tc.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tc.desc}</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs text-muted-foreground dark:bg-zinc-800/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{tc.name}</th>
              <th className="w-32 px-3 py-2 text-center font-medium">{tc.canDelete}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {people.map(p => {
              const isAdmin = p.role === 'admin'
              const name = p.full_name || tc.noName
              return (
                <tr key={p.id} className={isAdmin ? 'opacity-60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}>
                  <td className="px-3 py-2.5 text-zinc-800 dark:text-zinc-200">
                    {name}
                    {p.nickname && <span className="text-muted-foreground"> ({p.nickname})</span>}
                    {isAdmin && <span className="ml-1.5 text-xs text-muted-foreground">admin</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${name}: ${tc.canDelete}`}
                      className="h-4 w-4 cursor-pointer accent-zinc-900 disabled:cursor-default dark:accent-zinc-100"
                      checked={isAdmin || selected.has(p.id)}
                      disabled={isAdmin}
                      onChange={() => toggle(p.id)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={saving} size="sm">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {tc.save}
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
