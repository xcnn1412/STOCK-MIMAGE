'use client'

// ตั้งค่า Meta Graph API token สำหรับปุ่ม "ดึงผลอัตโนมัติ" ของแพลนคอนเทนต์
// (แสดงในหน้า ตั้งค่า > คอนเทนต์ — admin เท่านั้น)

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, KeyRound, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveMetaToken } from './actions'

export default function MetaTokenSettings({ connected, hint }: { connected: boolean; hint: string | null }) {
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isConnected, setIsConnected] = useState(connected)
  const [tokenHint, setTokenHint] = useState(hint)

  async function save(value: string) {
    setSaving(true)
    setMsg(null)
    const res = await saveMetaToken(value)
    setSaving(false)
    if (res?.error) { setMsg({ ok: false, text: res.error }); return }
    if (value) {
      setIsConnected(true)
      setTokenHint(`…${value.trim().slice(-4)}`)
      setMsg({ ok: true, text: 'บันทึก Token แล้ว — ปุ่ม "ดึงผลอัตโนมัติ" ใช้กับ Facebook/Instagram ได้ทันที' })
    } else {
      setIsConnected(false)
      setTokenHint(null)
      setMsg({ ok: true, text: 'ลบ Token แล้ว' })
    }
    setToken('')
  }

  return (
    <div className="max-w-xl rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950/50 dark:text-fuchsia-400">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Meta Graph API — ดึงผลโพสต์ Facebook/Instagram</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            ใช้กับปุ่ม &quot;ดึงผลอัตโนมัติ&quot; ในหน้าแพลนคอนเทนต์ (TikTok ดึงได้เลยไม่ต้องใช้ Token)
          </p>
        </div>
      </div>

      {/* สถานะปัจจุบัน */}
      <div className="mt-4 flex items-center gap-2 text-xs">
        {isConnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> เชื่อมต่อแล้ว (Token ลงท้าย {tokenHint})
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" /> ยังไม่ได้เชื่อมต่อ
          </span>
        )}
      </div>

      {/* ฟอร์ม */}
      <div className="mt-3 flex items-center gap-2">
        <Input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder={isConnected ? 'วาง Token ใหม่เพื่อเปลี่ยน...' : 'วาง Page Access Token ที่นี่...'}
          className="font-mono text-xs"
        />
        <Button
          onClick={() => save(token)}
          disabled={saving || !token.trim()}
          className="shrink-0 bg-fuchsia-600 text-white hover:bg-fuchsia-700"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          บันทึก
        </Button>
        {isConnected && (
          <Button
            variant="outline"
            onClick={() => { if (confirm('ลบ Token ออกจากระบบ?')) save('') }}
            disabled={saving}
            className="shrink-0 border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
            title="ลบ Token"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {msg.text}
        </p>
      )}

      {/* วิธีขอ Token */}
      <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
        <p className="font-semibold text-zinc-600 dark:text-zinc-300">วิธีขอ Token (ทำครั้งเดียว):</p>
        <ol className="mt-1 list-inside list-decimal space-y-0.5">
          <li>สร้างแอปที่ developers.facebook.com (ประเภท Business)</li>
          <li>เพิ่มสิทธิ์ <code className="font-mono">pages_read_engagement</code> และ <code className="font-mono">read_insights</code></li>
          <li>ขอ <b>Page Access Token</b> ของเพจที่ต้องการ (แนะนำ Long-Lived Token อายุ ~60 วัน)</li>
          <li>วาง Token ด้านบนแล้วกดบันทึก — ดึงได้เฉพาะโพสต์ของเพจที่ผูกกับ Token นี้</li>
        </ol>
      </div>
    </div>
  )
}
