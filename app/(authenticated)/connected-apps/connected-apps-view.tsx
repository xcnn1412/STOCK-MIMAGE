'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plug, Unplug, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/language-context'
import { revokeConnection } from './actions'

export interface ConnectionRow {
  id: string
  clientName: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
  /** ชื่อเจ้าของการเชื่อมต่อ — มีค่าเฉพาะมุมมอง admin */
  ownerName: string | null
}

interface Props {
  connections: ConnectionRow[]
  isAdmin: boolean
}

// แสดงวันที่ตามภาษาที่เลือก — ล็อกโซนเวลาไทย ให้ server กับ client render ตรงกัน
function formatDate(iso: string, lang: string, withTime = false): string {
  return new Date(iso).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export default function ConnectedAppsView({ connections, isAdmin }: Props) {
  const { t, lang } = useLanguage()
  const c = t.connectedApps
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  // ยืนยันก่อน แล้วค่อยยกเลิก — ผลลัพธ์แจ้งด้วย toast
  async function handleRevoke(row: ConnectionRow) {
    if (!confirm(c.confirmRevoke.replace('{name}', row.clientName))) return
    setBusyId(row.id)
    const res = await revokeConnection(row.id)
    setBusyId(null)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success(c.revoked)
    router.refresh()
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {/* หัวหน้า */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
          <Plug className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{c.title}</h1>
          <p className="text-sm text-muted-foreground">{c.intro}</p>
          {isAdmin && <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">{c.adminNote}</p>}
        </div>
      </div>

      {connections.length === 0 ? (
        // สถานะว่าง — สรุปวิธีเชื่อมต่อ 3 ขั้น
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="font-semibold text-zinc-800 dark:text-zinc-200">{c.emptyTitle}</p>
          <p className="mt-2 text-sm text-muted-foreground">{c.emptyHint}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
            <li>{c.step1}</li>
            <li>{c.step2}</li>
            <li>{c.step3}</li>
          </ol>
        </div>
      ) : (
        <ul className="space-y-3">
          {connections.map(row => (
            <li
              key={row.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold text-zinc-900 dark:text-zinc-100">{row.clientName}</p>
                  {isAdmin && row.ownerName && (
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.owner}: {row.ownerName}</span>
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                  disabled={busyId === row.id}
                  onClick={() => handleRevoke(row)}
                >
                  <Unplug className="h-4 w-4" />
                  {busyId === row.id ? c.revoking : c.revoke}
                </Button>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">{c.connectedAt}</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">{formatDate(row.createdAt, lang)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">{c.lastUsed}</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">
                    {row.lastUsedAt ? formatDate(row.lastUsedAt, lang, true) : c.neverUsed}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="text-muted-foreground">{c.expires}</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200">{formatDate(row.expiresAt, lang)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
