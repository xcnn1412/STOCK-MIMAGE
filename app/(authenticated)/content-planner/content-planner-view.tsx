'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Pencil, Trash2, Megaphone, Loader2, ExternalLink, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  PLATFORMS, STATUSES, PILLARS, OBJECTIVES, FORMATS, PAGES,
  labelOf, statusLabel, statusStyle, formatLabel,
  type ContentPost, type PlatformKey, type StatusKey,
} from './constants'
import {
  createContentPost, updateContentPost, updateContentPostStatus, deleteContentPost,
  uploadContentExampleImages,
} from './actions'
import { compressImage } from '@/lib/utils'

// ค่าที่ใช้แทน "ไม่ระบุ" ใน Select (Radix ไม่ยอมให้ value เป็นสตริงว่าง)
const NONE = '__none__'

// ============================================================================
// Helpers
// ============================================================================

function compactNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function thaiDate(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00Z')
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' })
}

/** ผลลัพธ์แบบย่อสำหรับตาราง — Reach/Views บรรทัดบน, ยอดมีส่วนร่วมรวมบรรทัดล่าง */
function engagementSummary(p: ContentPost) {
  const top: string[] = []
  if (p.reach != null) top.push(`Reach ${compactNum(p.reach)}`)
  if (p.views != null) top.push(`Views ${compactNum(p.views)}`)
  const eng = [p.likes, p.comments, p.shares, p.saves].filter(v => v != null) as number[]
  const engTotal = eng.length ? eng.reduce((a, b) => a + b, 0) : null
  return { top, engTotal }
}

// ============================================================================
// Status badge / inline select
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const s = statusStyle(status)
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${s.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {statusLabel(status)}
    </span>
  )
}

function InlineStatusSelect({
  status, disabled, onChange,
}: { status: string; disabled?: boolean; onChange: (v: string) => void }) {
  const s = statusStyle(status)
  return (
    <Select value={status} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className={`h-8 w-[130px] rounded-full border text-xs font-medium ${s.badge}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map(st => (
          <SelectItem key={st.value} value={st.value}>
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${statusStyle(st.value).dot}`} />
              {st.th}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ============================================================================
// Main view
// ============================================================================

export default function ContentPlannerView({ posts, ownerOptions }: { posts: ContentPost[]; ownerOptions: string[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [platform, setPlatform] = useState<PlatformKey>('facebook')
  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all')
  const [search, setSearch] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ContentPost | null>(null)
  // เปิดจากการคลิกแถว = โหมดดูอย่างเดียว ต้องกดดินสอถึงแก้ได้
  const [dialogView, setDialogView] = useState(false)

  // สถานะที่เพิ่งกดเปลี่ยน — แสดงทันทีระหว่างรอข้อมูลใหม่จาก server
  // (ล้างทิ้งใน transition เดียวกับ router.refresh() จึงไม่ค้างทับค่าจริง)
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({})
  const effStatus = (p: ContentPost) => statusOverride[p.id] ?? p.status

  function clearOverride(id: string) {
    setStatusOverride(prev => {
      if (!(id in prev)) return prev
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  // ---- filtering ----
  const platformPosts = useMemo(
    () => posts.filter(p => p.platform === platform),
    [posts, platform]
  )

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return platformPosts
    return platformPosts.filter(p =>
      [p.topic, p.caption, p.post_code, p.owner, p.page]
        .some(v => (v || '').toLowerCase().includes(q))
    )
  }, [platformPosts, search])

  const visible = useMemo(
    () => statusFilter === 'all' ? searched : searched.filter(p => effStatus(p) === statusFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched, statusFilter, statusOverride]
  )

  // นับต่อสถานะ (ของแพลตฟอร์มปัจจุบัน + คำค้นปัจจุบัน)
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of searched) {
      const s = effStatus(p)
      m[s] = (m[s] || 0) + 1
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, statusOverride])

  // ตัวเลขบนแท็บแพลตฟอร์ม = โพสต์ที่ยังไม่ได้โพสต์ (งานค้าง)
  const pendingByPlatform = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of posts) {
      if ((statusOverride[p.id] ?? p.status) === 'published') continue
      m[p.platform] = (m[p.platform] || 0) + 1
    }
    return m
  }, [posts, statusOverride])

  // ---- actions ----
  function handleInlineStatus(post: ContentPost, next: string) {
    setStatusOverride(prev => ({ ...prev, [post.id]: next }))
    startTransition(async () => {
      const res = await updateContentPostStatus(post.id, next)
      if (res?.error) {
        clearOverride(post.id)
        alert(res.error)
        return
      }
      router.refresh()
      clearOverride(post.id)
    })
  }

  function handleDelete(post: ContentPost) {
    if (!confirm(`ลบโพสต์ ${post.post_code} ?\nการลบนี้ย้อนกลับไม่ได้`)) return
    startTransition(async () => {
      const res = await deleteContentPost(post.id)
      if (res?.error) { alert(res.error); return }
      setDialogOpen(false)
      setEditing(null)
      router.refresh()
    })
  }

  function openCreate() { setEditing(null); setDialogView(false); setDialogOpen(true) }
  function openEdit(post: ContentPost) { setEditing(post); setDialogView(false); setDialogOpen(true) }
  function openView(post: ContentPost) { setEditing(post); setDialogView(true); setDialogOpen(true) }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* ---------------- Header ---------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              แพลนคอนเทนต์ (Content Planner)
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              วางแผน ลงมือ และติดตามสถานะโพสต์ Facebook / Instagram / TikTok — 1 แถว = 1 โพสต์
            </p>
          </div>
        </div>
        <Button
          onClick={openCreate}
          className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
        >
          <Plus className="h-4 w-4" />
          เพิ่มโพสต์
        </Button>
      </div>

      {/* ---------------- Platform tabs ---------------- */}
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map(pf => {
          const active = pf.value === platform
          const count = pendingByPlatform[pf.value] || 0
          return (
            <button
              key={pf.value}
              onClick={() => { setPlatform(pf.value); setStatusFilter('all') }}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${active
                ? 'border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-300'
                : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50'
                }`}
            >
              {pf.th}
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${active
                ? 'bg-violet-600 text-white dark:bg-violet-500'
                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ---------------- Status chips (ทำหน้าที่เป็นสรุปจำนวนต่อสถานะด้วย) ------------- */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === 'all'
            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
            : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50'
            }`}
        >
          ทั้งหมด <span className="font-bold">{searched.length}</span>
        </button>
        {STATUSES.map(st => {
          const active = statusFilter === st.value
          const s = statusStyle(st.value)
          return (
            <button
              key={st.value}
              onClick={() => setStatusFilter(active ? 'all' : st.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active ? s.chip : s.badge + ' hover:opacity-80'
                }`}
            >
              {!active && <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />}
              {st.th}
              <span className="font-bold">{statusCounts[st.value] || 0}</span>
            </button>
          )
        })}
      </div>

      {/* ---------------- Search ---------------- */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ค้นหา หัวข้อ / แคปชัน / รหัส / ผู้รับผิดชอบ"
          className="pl-9"
        />
      </div>

      {/* ---------------- Empty state ---------------- */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">ยังไม่มีโพสต์ในมุมมองนี้</p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">กด “เพิ่มโพสต์” เพื่อเริ่มวางแผนคอนเทนต์</p>
        </div>
      ) : (
        <>
          {/* ---------------- Desktop table ---------------- */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">รหัส</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">วันที่+เวลา</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">รูปแบบ</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">หัวข้อ</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">เสาหลัก</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">เป้าหมาย</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">สถานะ</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">ผลลัพธ์</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {visible.map(p => {
                  const { top, engTotal } = engagementSummary(p)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openView(p)}
                      className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        {p.post_code}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                        {p.post_date ? thaiDate(p.post_date) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                        {p.post_time && <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">{p.post_time}</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {formatLabel(p.platform, p.format) || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                          {p.topic || <span className="font-normal text-zinc-300 dark:text-zinc-600">(ยังไม่ตั้งหัวข้อ)</span>}
                        </div>
                        {(p.page || p.owner) && (
                          <div className="flex items-center gap-1.5 truncate text-xs text-zinc-400 dark:text-zinc-500">
                            {p.page && (
                              <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                                {p.page}
                              </span>
                            )}
                            {p.owner && <span className="truncate">{p.owner}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {labelOf(PILLARS, p.pillar) || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {labelOf(OBJECTIVES, p.objective) || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <InlineStatusSelect
                          status={effStatus(p)}
                          disabled={isPending}
                          onChange={v => handleInlineStatus(p, v)}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {top.length === 0 && engTotal === null ? (
                          <span className="text-zinc-300 dark:text-zinc-600">—</span>
                        ) : (
                          <div className="leading-tight">
                            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                              {top.join(' · ') || '—'}
                            </div>
                            {engTotal !== null && (
                              <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                มีส่วนร่วม {compactNum(engTotal)}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {p.post_url && (
                            <a
                              href={p.post_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                              title="เปิดโพสต์"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            onClick={() => openEdit(p)}
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            title="แก้ไข"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={isPending}
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                            title="ลบ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ---------------- Mobile cards ---------------- */}
          <div className="lg:hidden space-y-2.5">
            {visible.map(p => (
              <button
                key={p.id}
                onClick={() => openView(p)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-3.5 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">{p.post_code}</span>
                  <StatusBadge status={effStatus(p)} />
                </div>
                <div className="mt-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
                  {p.topic || <span className="font-normal text-zinc-400 dark:text-zinc-500">(ยังไม่ตั้งหัวข้อ)</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{p.post_date ? thaiDate(p.post_date) : 'ยังไม่กำหนดวัน'}{p.post_time ? ` ${p.post_time}` : ''}</span>
                  {p.format && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span>{formatLabel(p.platform, p.format)}</span></>}
                  {p.page && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span className="text-violet-500 dark:text-violet-400">{p.page}</span></>}
                  {p.owner && <><span className="text-zinc-300 dark:text-zinc-600">·</span><span>{p.owner}</span></>}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---------------- Dialog ---------------- */}
      <PostDialog
        key={`${editing?.id || 'new'}:${dialogView}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        post={editing}
        defaultPlatform={platform}
        ownerOptions={ownerOptions}
        startInView={dialogView}
        onDelete={handleDelete}
        onSaved={() => { setDialogOpen(false); setEditing(null); router.refresh() }}
      />
    </div>
  )
}

// ============================================================================
// Create / Edit dialog
// ============================================================================

type FormState = Record<string, string>

function emptyForm(platform: PlatformKey): FormState {
  return {
    platform,
    post_date: '', post_time: '', format: '', status: 'idea', owner: '', page: '',
    pillar: '', objective: '',
    topic: '', hook: '', caption: '', cta: '', link: '', hashtags: '',
    example_images: '[]', example_video_url: '', example_post_url: '',
    post_url: '',
    reach: '', views: '', likes: '', comments: '', shares: '', saves: '', note: '',
  }
}

function formFromPost(p: ContentPost): FormState {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  return {
    platform: p.platform,
    post_date: s(p.post_date), post_time: s(p.post_time), format: s(p.format),
    status: s(p.status) || 'idea', owner: s(p.owner), page: s(p.page),
    pillar: s(p.pillar), objective: s(p.objective),
    topic: s(p.topic), hook: s(p.hook), caption: s(p.caption), cta: s(p.cta), link: s(p.link), hashtags: s(p.hashtags),
    example_images: JSON.stringify(p.example_images || []),
    example_video_url: s(p.example_video_url), example_post_url: s(p.example_post_url),
    post_url: s(p.post_url),
    reach: s(p.reach), views: s(p.views), likes: s(p.likes),
    comments: s(p.comments), shares: s(p.shares), saves: s(p.saves), note: s(p.note),
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{children}</h3>
      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
    </div>
  )
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
        {action}
      </label>
      {children}
    </div>
  )
}

// ปุ่มคัดลอกข้อความในช่อง — เป็น span เพื่อให้ยังกดได้แม้อยู่ใน fieldset ที่ถูก disabled (โหมดดู)
function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span
      role="button"
      tabIndex={0}
      title="คัดลอกข้อความ"
      onClick={() => {
        if (!value.trim()) return
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="inline-flex cursor-pointer select-none items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {copied
        ? <><Check className="h-3 w-3 text-emerald-500" /> คัดลอกแล้ว</>
        : <><Copy className="h-3 w-3" /> คัดลอก</>}
    </span>
  )
}

function PostDialog({
  open, onOpenChange, post, defaultPlatform, ownerOptions, startInView, onSaved, onDelete,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  post: ContentPost | null
  defaultPlatform: PlatformKey
  ownerOptions: string[]
  startInView?: boolean
  onSaved: () => void
  onDelete: (p: ContentPost) => void
}) {
  const isEdit = !!post
  const [form, setForm] = useState<FormState>(() => post ? formFromPost(post) : emptyForm(defaultPlatform))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // เปิดจากการคลิกแถว = ดูอย่างเดียว จนกว่าจะกดปุ่มดินสอ (parent remount ผ่าน key เมื่อโหมดเปลี่ยน)
  const [viewing, setViewing] = useState(!!startInView && !!post)

  // รูปตัวอย่าง — เก็บในฟอร์มเป็น JSON string (FormState เป็น Record<string,string>)
  const exampleImages: string[] = useMemo(() => {
    try { const a = JSON.parse(form.example_images || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
  }, [form.example_images])

  async function handleExampleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    setError(null)
    const fd = new FormData()
    for (const f of files) fd.append('files', await compressImage(f))
    const res = await uploadContentExampleImages(fd)
    setUploading(false)
    if (res.error) { setError(res.error); return }
    set('example_images', JSON.stringify([...exampleImages, ...res.urls].slice(0, 12)))
  }

  function removeExampleImage(url: string) {
    set('example_images', JSON.stringify(exampleImages.filter(u => u !== url)))
  }

  const platform = (form.platform || defaultPlatform) as PlatformKey
  const formatOptions = FORMATS[platform] || []

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  // เปลี่ยนแพลตฟอร์ม → ล้างรูปแบบถ้าใช้กับแพลตฟอร์มใหม่ไม่ได้
  function changePlatform(next: string) {
    const nextPlatform = next as PlatformKey
    setForm(prev => {
      const stillValid = (FORMATS[nextPlatform] || []).some(f => f.value === prev.format)
      return { ...prev, platform: nextPlatform, format: stillValid ? prev.format : '' }
    })
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.set(k, v ?? ''))
    const res = isEdit && post
      ? await updateContentPost(post.id, fd)
      : await createContentPost(fd)
    setSaving(false)
    if (res?.error) { setError(res.error); return }
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {!isEdit ? 'เพิ่มโพสต์ใหม่' : viewing ? `โพสต์ ${post?.post_code}` : `แก้ไขโพสต์ ${post?.post_code}`}
          </DialogTitle>
          <DialogDescription>
            {viewing
              ? 'โหมดดูอย่างเดียว — กดปุ่ม "แก้ไข" ด้านล่างเพื่อแก้ข้อมูล'
              : 'วางแผนโพสต์ 1 รายการ — รหัสโพสต์ระบบสร้างให้อัตโนมัติตามแพลตฟอร์ม'}
          </DialogDescription>
        </DialogHeader>

        {/* fieldset disabled = ปิดทุก input/select ทีเดียวในโหมดดู (ปุ่ม copy เป็น span ไม่โดนปิด) */}
        <fieldset disabled={viewing} className="min-w-0 space-y-4">
          {/* ---------- 1) ข้อมูลจัดการ ---------- */}
          <SectionTitle>ข้อมูลจัดการ</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="แพลตฟอร์ม">
              <Select value={platform} onValueChange={changePlatform}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(pf => <SelectItem key={pf.value} value={pf.value}>{pf.th}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="รหัสโพสต์">
              <Input
                value={isEdit ? (post?.post_code || '') : 'สร้างอัตโนมัติเมื่อบันทึก'}
                readOnly
                disabled
                className="font-mono text-xs"
              />
            </Field>
            <Field label="เพจ">
              <Select value={form.page || NONE} onValueChange={v => set('page', v === NONE ? '' : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกเพจ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ไม่ระบุ</SelectItem>
                  {form.page && !PAGES.includes(form.page as (typeof PAGES)[number]) && (
                    <SelectItem value={form.page}>{form.page}</SelectItem>
                  )}
                  {PAGES.map(pg => <SelectItem key={pg} value={pg}>{pg}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="วันที่โพสต์">
              <Input type="date" value={form.post_date} onChange={e => set('post_date', e.target.value)} />
            </Field>
            <Field label="เวลาโพสต์">
              <Input type="time" value={form.post_time} onChange={e => set('post_time', e.target.value)} />
            </Field>
            <Field label="รูปแบบ">
              <Select
                value={form.format || NONE}
                onValueChange={v => set('format', v === NONE ? '' : v)}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือกรูปแบบ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ไม่ระบุ</SelectItem>
                  {formatOptions.map(f => <SelectItem key={f.value} value={f.value}>{f.th}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="สถานะ">
              <Select value={form.status || 'idea'} onValueChange={v => set('status', v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(st => (
                    <SelectItem key={st.value} value={st.value}>
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${statusStyle(st.value).dot}`} />
                        {st.th}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="ผู้รับผิดชอบ">
              <Select value={form.owner || '__none__'} onValueChange={v => set('owner', v === '__none__' ? '' : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกผู้รับผิดชอบ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ไม่ระบุ</SelectItem>
                  {/* ค่าเดิมที่ไม่อยู่ในรายชื่อ (เช่นพิมพ์เองสมัยยังเป็นช่องข้อความ) คงไว้ไม่ให้หาย */}
                  {form.owner && !ownerOptions.includes(form.owner) && (
                    <SelectItem value={form.owner}>{form.owner}</SelectItem>
                  )}
                  {ownerOptions.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* ---------- 2) กลยุทธ์ ---------- */}
          <SectionTitle>กลยุทธ์</SectionTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="เสาหลักคอนเทนต์">
              <Select value={form.pillar || NONE} onValueChange={v => set('pillar', v === NONE ? '' : v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือกเสาหลัก" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ไม่ระบุ</SelectItem>
                  {PILLARS.map(o => <SelectItem key={o.value} value={o.value}>{o.th}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="เป้าหมาย">
              <Select value={form.objective || NONE} onValueChange={v => set('objective', v === NONE ? '' : v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือกเป้าหมาย" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>ไม่ระบุ</SelectItem>
                  {OBJECTIVES.map(o => <SelectItem key={o.value} value={o.value}>{o.th}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* ---------- 3) เนื้อหา — เรียงตามโครงสร้างโพสต์จริงบนโซเชียล บนลงล่าง ---------- */}
          <SectionTitle>เนื้อหา</SectionTitle>
          <div className="space-y-3">
            <Field label="หัวข้อ (ชื่องานภายใน — ใช้แสดงในตาราง)" action={<CopyBtn value={form.topic} />}>
              <Input value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="หัวข้อโพสต์" />
            </Field>
            <Field label="Hook" action={<CopyBtn value={form.hook} />}>
              <Textarea rows={1} className="field-sizing-content min-h-9 resize-y" value={form.hook} onChange={e => set('hook', e.target.value)} placeholder="บรรทัดแรกที่ต้องปัง / คำถามหรือตัวเลข" />
            </Field>
            <Field label="Description" action={<CopyBtn value={form.caption} />}>
              <Textarea rows={4} className="field-sizing-content min-h-20 resize-y" value={form.caption} onChange={e => set('caption', e.target.value)} placeholder={'เล่าเรื่อง/ให้คุณค่า แบ่งเป็นย่อหน้าสั้น'} />
            </Field>
            <Field label="CTA" action={<CopyBtn value={form.cta} />}>
              <Textarea rows={1} className="field-sizing-content min-h-9 resize-y" value={form.cta} onChange={e => set('cta', e.target.value)} placeholder="อยากให้ทำอะไรต่อ" />
            </Field>
            <Field label="ลิงก์" action={<CopyBtn value={form.link} />}>
              <Textarea rows={1} className="field-sizing-content min-h-9 resize-y" value={form.link} onChange={e => set('link', e.target.value)} placeholder={'ลิงก์ หรือพิมพ์ "ลิงก์อยู่คอมเมนต์"'} />
            </Field>
            <Field label="แฮชแท็ก" action={<CopyBtn value={form.hashtags} />}>
              <Textarea rows={1} className="field-sizing-content min-h-9 resize-y" value={form.hashtags} onChange={e => set('hashtags', e.target.value)} placeholder="#tag1 #tag2" />
            </Field>
          </div>

          {/* ---------- 4) ตัวอย่าง — รูป/ลิงก์อ้างอิงแนวทางการทำงาน ---------- */}
          <SectionTitle>ตัวอย่าง</SectionTitle>
          <div className="space-y-3">
            <Field label="รูปตัวอย่าง">
              <div className="space-y-2">
                {exampleImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {exampleImages.map(url => (
                      <div key={url} className="group/img relative">
                        {/* a ไม่โดน fieldset ปิด — โหมดดูก็กดเปิดรูปเต็มได้ */}
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="ตัวอย่าง" className="h-20 w-20 rounded-lg border border-zinc-200 object-cover dark:border-zinc-700" />
                        </a>
                        <button
                          type="button"
                          onClick={() => removeExampleImage(url)}
                          title="ลบรูป"
                          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow group-hover/img:flex disabled:!hidden"
                        >
                          <span className="text-xs leading-none">✕</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {!viewing && (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500 transition-colors hover:border-violet-400 hover:text-violet-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-violet-600 dark:hover:text-violet-400">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {uploading ? 'กำลังอัปโหลด...' : 'อัปโหลดรูป (สูงสุด 12 รูป)'}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handleExampleUpload} disabled={uploading} />
                  </label>
                )}
                {viewing && exampleImages.length === 0 && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">— ไม่มีรูปตัวอย่าง —</p>
                )}
              </div>
            </Field>
            <Field
              label="ลิงก์วิดีโอตัวอย่าง"
              action={form.example_video_url ? (
                <a href={form.example_video_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40">
                  <ExternalLink className="h-3 w-3" /> เปิดลิงก์
                </a>
              ) : undefined}
            >
              <Input value={form.example_video_url} onChange={e => set('example_video_url', e.target.value)} placeholder="https://… (YouTube / TikTok / Drive)" />
            </Field>
            <Field
              label="ลิงก์โพสต์ตัวอย่าง"
              action={form.example_post_url ? (
                <a href={form.example_post_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40">
                  <ExternalLink className="h-3 w-3" /> เปิดลิงก์
                </a>
              ) : undefined}
            >
              <Input value={form.example_post_url} onChange={e => set('example_post_url', e.target.value)} placeholder="https://… โพสต์ที่ใช้เป็นแนวทาง" />
            </Field>
          </div>

          {/* ---------- 5) เผยแพร่ ---------- */}
          <SectionTitle>เผยแพร่</SectionTitle>
          <Field label="ลิงก์โพสต์">
            <Input type="url" value={form.post_url} onChange={e => set('post_url', e.target.value)} placeholder="https://…" />
          </Field>

          {/* ---------- 6) ผลลัพธ์ ---------- */}
          <SectionTitle>ผลลัพธ์</SectionTitle>
          <p className="-mt-2 text-xs text-zinc-400 dark:text-zinc-500">กรอกหลังโพสต์ 24–48 ชม.</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              ['reach', 'Reach'],
              ['views', 'Views'],
              ['likes', 'ไลก์'],
              ['comments', 'คอมเมนต์'],
              ['shares', 'แชร์'],
              ['saves', 'เซฟ'],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form[key]}
                  onChange={e => set(key, e.target.value)}
                  placeholder="—"
                />
              </Field>
            ))}
          </div>
          <Field label="บันทึกเรียนรู้">
            <Textarea value={form.note} onChange={e => set('note', e.target.value)} rows={3} placeholder="อะไรได้ผล อะไรควรปรับครั้งหน้า" />
          </Field>

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
        </fieldset>

        <DialogFooter className="gap-2 sm:justify-between">
          {viewing ? (
            <>
              <span />
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>ปิด</Button>
                <Button
                  type="button"
                  onClick={() => setViewing(false)}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <Pencil className="h-4 w-4" />
                  แก้ไข
                </Button>
              </div>
            </>
          ) : (
            <>
              {isEdit && post ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onDelete(post)}
                  className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-4 w-4" />
                  ลบโพสต์
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? 'บันทึก' : 'สร้างโพสต์'}
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
