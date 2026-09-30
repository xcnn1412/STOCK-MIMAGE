// ============================================================================
// การ์ดกลุ่มของคิวใบเบิก (5 กลุ่ม) + หัวข้อ "งานที่รอคุณ … ใบ · ค้างนานเกินกำหนด … ใบ" + แถวเครื่องมือ (ค้นหา/ผู้เบิก/ประเภท/เรียง)
// แสดงผลล้วน ไม่มี hook — ใช้ได้ใน client component และในชุดตรวจ renderToStaticMarkup
// ============================================================================

import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { QUEUE_GROUPS, type QueueFilters, type QueueGroupKey, type QueueSort } from './claim-queue'

const CLAIM_TYPES: [string, string, string][] = [
  ['all', 'ทุกประเภท', 'All types'],
  ['event', 'อีเวนต์', 'Event'],
  ['advance', 'ทดลองจ่าย', 'Advance'],
  ['petty_cash', 'เงินสดย่อย', 'Petty cash'],
  ['other', 'ค่าอื่นๆ', 'Other'],
]
const SORTS: [QueueSort, string, string][] = [
  ['oldest', 'เรียง: เก่าสุดก่อน', 'Sort: oldest first'],
  ['newest', 'เรียง: ใหม่สุดก่อน', 'Sort: newest first'],
  ['amount', 'เรียง: ยอดมากสุดก่อน', 'Sort: largest amount'],
]

/** ค้นหาในใบที่โหลดมาแล้วทุกเดือน + ผู้เบิก + ประเภท + เรียง (ค่าเริ่มต้นเก่าสุดก่อน) — จอแคบ: ค้นหาเต็มแถว กล่องเลือก 2 คอลัมน์ */
export function QueueTools({
  filters,
  people,
  isEn,
  onChange,
}: {
  filters: QueueFilters
  people: { id: string; name: string; count: number }[]
  isEn: boolean
  onChange: (patch: Partial<QueueFilters>) => void
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <Input type="search" value={filters.q} onChange={e => onChange({ q: e.target.value })} maxLength={100}
          aria-label={isEn ? 'Search the queue' : 'ค้นหาในคิว'}
          placeholder={isEn ? 'Claim no., title, name, event — all months' : 'ค้นหาเลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน — ทุกเดือน'}
          className="h-10 pl-9"
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Label htmlFor="queue-by" className="sr-only">{isEn ? 'Submitter' : 'ผู้เบิก'}</Label>
        <Select value={filters.by || 'all'} onValueChange={v => onChange({ by: v === 'all' ? '' : v })}>
          <SelectTrigger id="queue-by" aria-label={isEn ? 'Submitter' : 'ผู้เบิก'} className="min-h-10 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isEn ? 'All submitters' : 'ผู้เบิกทุกคน'}</SelectItem>
            {people.map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.count})</SelectItem>)}
          </SelectContent>
        </Select>
        <Label htmlFor="queue-type" className="sr-only">{isEn ? 'Claim type' : 'ประเภท'}</Label>
        <Select value={filters.type} onValueChange={v => onChange({ type: v })}>
          <SelectTrigger id="queue-type" aria-label={isEn ? 'Claim type' : 'ประเภท'} className="min-h-10 w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CLAIM_TYPES.map(([v, th, en]) => <SelectItem key={v} value={v}>{isEn ? en : th}</SelectItem>)}
          </SelectContent>
        </Select>
        <Label htmlFor="queue-sort" className="sr-only">{isEn ? 'Sort' : 'เรียง'}</Label>
        <Select value={filters.sort} onValueChange={v => onChange({ sort: v as QueueSort })}>
          <SelectTrigger id="queue-sort" aria-label={isEn ? 'Sort' : 'เรียง'} className="col-span-2 min-h-10 w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map(([v, th, en]) => <SelectItem key={v} value={v}>{isEn ? en : th}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

export function QueueHeadline({ waiting, stale, isEn }: { waiting: number; stale: number; isEn: boolean }) {
  return (
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400" aria-live="polite">
      {isEn
        ? `${waiting} waiting on you · ${stale} overdue`
        : `งานที่รอคุณ ${waiting} ใบ · ค้างนานเกินกำหนด ${stale} ใบ`}
    </p>
  )
}

export function QueueGroups({
  counts,
  active,
  isEn,
  onSelect,
}: {
  counts: Record<QueueGroupKey, number>
  active: QueueGroupKey
  isEn: boolean
  onSelect: (key: QueueGroupKey) => void
}) {
  return (
    <div role="group" aria-label={isEn ? 'Queue groups' : 'กลุ่มงาน'} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3">
      {QUEUE_GROUPS.map(g => {
        const on = g.key === active
        return (
          <Button size="lg" key={g.key} type="button" variant="outline" aria-pressed={on} onClick={() => onSelect(g.key)}
            className={cn(
              'h-auto min-h-10 w-full min-w-0 flex-col items-start justify-start gap-0.5 whitespace-normal rounded-xl px-4 py-3 text-left',
              on
                ? 'border-emerald-600 bg-emerald-50 hover:bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/40'
                : 'bg-white dark:bg-zinc-900',
            )}
          >
            <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{counts[g.key]}</span>
            <span className={cn('text-xs font-medium', on ? 'text-emerald-800 dark:text-emerald-200' : 'text-zinc-600 dark:text-zinc-400')}>
              {isEn ? g.labelEn : g.labelTh}
            </span>
          </Button>
        )
      })}
    </div>
  )
}
