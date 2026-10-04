'use client'

import Link from 'next/link'
import { Plug, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'

interface Props {
  /** จำนวนการเชื่อมต่อที่ยังใช้งานได้ของทุกคน */
  liveCount: number
  /** ที่อยู่ MCP เต็ม เช่น https://<โดเมน>/api/mcp — ให้ admin คัดลอกส่งพนักงาน */
  endpoint: string
}

// การ์ดเล็กในหน้าตั้งค่า (admin): จำนวนการเชื่อมต่อ Claude + ที่อยู่สำหรับเพิ่ม connector
export default function McpAdminCard({ liveCount, endpoint }: Props) {
  const { t } = useLanguage()
  const c = t.connectedApps

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
            <Plug className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{c.adminCardTitle}</p>
            <p className="text-xs text-muted-foreground">
              {c.adminCardLive}: <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{liveCount}</span>
            </p>
          </div>
        </div>
        <Link
          href="/connected-apps"
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {c.adminCardOpen}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {c.adminCardEndpoint}{' '}
        <code className="break-all rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-800 select-all dark:bg-zinc-800 dark:text-zinc-200">{endpoint}</code>
      </p>
    </div>
  )
}
