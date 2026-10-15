'use client'

import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Copy, KeyRound, Plug, TriangleAlert, Unplug, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLanguage } from '@/contexts/language-context'
import { createPersonalToken, revokeConnection } from './actions'

export interface ConnectionRow {
  id: string
  clientName: string
  /** personal = token ส่วนตัว (client_id 'personal-token') · oauth = เชื่อมผ่าน OAuth */
  kind: 'personal' | 'oauth'
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

const TTL_OPTIONS = [30, 90, 365] as const
type Ttl = (typeof TTL_OPTIONS)[number]

/**
 * หน้าผลลัพธ์หลังสร้าง token — แสดงค่าจริงครั้งเดียว + ปุ่มคัดลอก + คำเตือน
 * แยกเป็น component ให้ชุดตรวจ render แบบ static ได้ (เนื้อหา Dialog ไม่ render ใน SSR)
 */
export function CreatedTokenPanel({ token, expiresAt }: { token: string; expiresAt: string }) {
  const { t, lang } = useLanguage()
  const c = t.connectedApps
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState(false)

  // เลือกข้อความใน <code> ให้ผู้ใช้กดคัดลอกเอง (คลิปบอร์ดใช้ไม่ได้ เช่น http หรือเบราว์เซอร์ไม่อนุญาต)
  function selectToken() {
    const el = codeRef.current
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (!el || !sel) return
    const range = document.createRange()
    range.selectNodeContents(el)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  async function handleCopy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setFallback(false)
    } catch {
      selectToken()
      setFallback(true)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{c.personalOnceWarning}</p>
      </div>
      <code
        ref={codeRef}
        data-testid="personal-token"
        className="block break-all rounded-lg bg-zinc-100 p-3 font-mono text-sm text-zinc-900 select-all dark:bg-zinc-800 dark:text-zinc-100"
      >
        {token}
      </code>
      <Button type="button" variant="outline" className="w-full" onClick={handleCopy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? c.personalCopied : c.personalCopy}
      </Button>
      {fallback && <p className="text-xs text-amber-700 dark:text-amber-300">{c.personalCopyFallback}</p>}
      <dl className="space-y-1 text-sm">
        <div className="flex flex-wrap gap-x-1.5">
          <dt className="text-muted-foreground">{c.personalExpiresAt}</dt>
          <dd className="text-zinc-800 dark:text-zinc-200">{formatDate(expiresAt, lang)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{c.personalUsage}</p>
      <p className="text-xs text-muted-foreground">{c.personalDocsHint}</p>
    </div>
  )
}

// ปุ่ม + Dialog สร้าง token ส่วนตัว — ค่า token อยู่ใน state ของ Dialog เท่านั้น ปิดแล้วล้างทิ้ง
function CreateTokenDialog() {
  const { t } = useLanguage()
  const c = t.connectedApps
  const nameId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [ttl, setTtl] = useState<Ttl>(365)
  const [created, setCreated] = useState<{ token: string; expiresAt: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const ttlLabel: Record<Ttl, string> = { 30: c.personalTtl30, 90: c.personalTtl90, 365: c.personalTtl365 }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      // ปิด = ล้างค่า token ออกจากหน่วยความจำของหน้า (ไม่เก็บใน URL / localStorage)
      setCreated(null)
      setName('')
      setTtl(365)
    }
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createPersonalToken({ name, ttlDays: ttl })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setCreated(res)
    })
  }

  return (
    <>
      <Button type="button" size="sm" className="w-full shrink-0 sm:w-auto" onClick={() => setOpen(true)}>
        <KeyRound className="h-4 w-4" />
        {c.personalCreate}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>{c.personalCreatedTitle}</DialogTitle>
                <DialogDescription className="sr-only">{c.personalOnceWarning}</DialogDescription>
              </DialogHeader>
              <CreatedTokenPanel token={created.token} expiresAt={created.expiresAt} />
              <DialogFooter>
                <Button type="button" onClick={() => handleOpenChange(false)}>{c.personalDone}</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <DialogHeader>
                <DialogTitle>{c.personalDialogTitle}</DialogTitle>
                <DialogDescription>{c.personalDialogDesc}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor={nameId}>{c.personalName}</Label>
                <Input
                  id={nameId}
                  value={name}
                  maxLength={60}
                  placeholder={c.personalNamePlaceholder}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{c.personalTtl}</p>
                <RadioGroup
                  value={String(ttl)}
                  onValueChange={v => setTtl(Number(v) as Ttl)}
                  className="flex flex-wrap gap-4"
                >
                  {TTL_OPTIONS.map(d => (
                    <label key={d} className="flex cursor-pointer items-center gap-2 text-sm">
                      <RadioGroupItem value={String(d)} />
                      {ttlLabel[d]}
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <p className="text-xs text-muted-foreground">{c.personalLimit}</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>{c.personalCancel}</Button>
                <Button type="submit" disabled={pending || name.trim().length === 0}>
                  {pending ? c.personalCreating : c.personalCreateButton}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
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
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
          <Plug className="h-5 w-5" />
        </div>
        {/* basis-56: จอแคบที่ข้อความกับปุ่มอยู่บรรทัดเดียวไม่พอ ปุ่มตกลงบรรทัดใหม่เต็มความกว้าง */}
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{c.title}</h1>
          <p className="text-sm text-muted-foreground">{c.intro}</p>
          {isAdmin && <p className="mt-1 text-xs text-violet-700 dark:text-violet-300">{c.adminNote}</p>}
        </div>
        <CreateTokenDialog />
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
                  {row.kind === 'personal' && (
                    <span
                      data-testid="personal-badge"
                      className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                    >
                      <KeyRound className="h-3 w-3" />
                      {c.personalBadge}
                    </span>
                  )}
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
