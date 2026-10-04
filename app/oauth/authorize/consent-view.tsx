'use client'

import { useState, useTransition } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { AuthorizeParams } from '@/lib/oauth'
import { denyAuthorization, grantAuthorization } from './actions'

export interface ExistingConnection {
  id: string
  clientName: string
  createdAt: string
  lastUsedAt: string | null
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })

export default function ConsentView(props: {
  params: AuthorizeParams
  clientName: string
  userName: string
  modules: string[]
  connections: ExistingConnection[]
}) {
  const { params, clientName, userName, modules, connections } = props
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState<'allow' | 'deny' | null>(null)
  const [error, setError] = useState('')

  const run = (which: 'allow' | 'deny') => {
    setChoice(which)
    setError('')
    startTransition(async () => {
      // สำเร็จ = server redirect กลับไปที่ Claude · ไม่สำเร็จ = ได้ข้อความกลับมา
      const res = await (which === 'allow' ? grantAuthorization(params) : denyAuthorization(params))
      if (res?.error) setError(res.error)
    })
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="space-y-2">
        <div className="flex justify-center">
          <ShieldCheck className="h-10 w-10 text-emerald-600" />
        </div>
        <CardTitle className="text-center text-xl">อนุญาตให้ Claude เข้าถึงข้อมูล</CardTitle>
        <CardDescription className="text-center">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{clientName}</span> ขออ่านข้อมูลในระบบแทน{' '}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">{userName}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {modules.length > 0 ? (
          <div className="space-y-2">
            <p className="font-medium">Claude จะเห็นข้อมูลของ</p>
            <ul className="flex flex-wrap gap-2">
              {modules.map(m => (
                <li key={m} className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {m}
                </li>
              ))}
            </ul>
            <p className="text-zinc-500">อ่านอย่างเดียว แก้ไขหรือลบข้อมูลไม่ได้ · ยกเลิกการเชื่อมต่อได้ทุกเมื่อ</p>
          </div>
        ) : (
          <p className="rounded-md bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            บัญชีนี้ไม่มีโมดูลที่ Claude ใช้ได้
          </p>
        )}

        {connections.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium">การเชื่อมต่อที่มีอยู่แล้ว</p>
            <ul className="divide-y rounded-md border text-xs dark:border-zinc-800">
              {connections.map(c => (
                <li key={c.id} className="flex flex-col gap-0.5 p-2">
                  <span className="font-medium">{c.clientName}</span>
                  <span className="text-zinc-500">
                    เชื่อมเมื่อ {fmt(c.createdAt)} · ใช้ล่าสุด {c.lastUsedAt ? fmt(c.lastUsedAt) : 'ยังไม่เคยใช้'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="rounded-md bg-red-50 p-3 text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      </CardContent>

      <CardFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" className="w-full sm:w-auto" disabled={pending} onClick={() => run('deny')}>
          {pending && choice === 'deny' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          ปฏิเสธ
        </Button>
        {modules.length > 0 && (
          <Button className="w-full sm:w-auto" disabled={pending} onClick={() => run('allow')}>
            {pending && choice === 'allow' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            อนุญาต
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
