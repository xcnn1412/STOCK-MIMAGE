'use client'

// แดชบอร์ดการใช้งานอุปกรณ์ — แสดงผลอย่างเดียว ตัวเลขทุกช่องมาจาก packing/usage-logic.ts (มีชุดตรวจ)
// สลับชิปช่วงฝั่ง client ล้วน (ข้อมูลโหลดครั้งเดียวจาก server)
import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  bangkokDayOf,
  boothUsage,
  categoryUsage,
  currentCounts,
  formatHours,
  hoursByMonth,
  inUsagePeriod,
  packageSales,
  peopleUsage,
  unitUsage,
  usagePeriodRange,
  USAGE_PERIOD_LABELS_TH,
  USAGE_PERIODS,
  type UsagePeriod,
} from '../../packing/usage-logic'
import type { UsageData } from '../../packing/usage-data'

const TOP_UNITS = 20
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** YYYY-MM → "ต.ค. 69" (พ.ศ. 2 หลัก) */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${TH_MONTHS[m - 1] ?? ym} ${String((y + 543) % 100).padStart(2, '0')}`
}

/** timestamptz → "7 ต.ค. 69" ตามเวลาไทย · ไม่มี = – */
function dayLabel(ts: string | null): string {
  const d = bangkokDayOf(ts)
  if (!d) return '–'
  const [y, m, day] = d.split('-').map(Number)
  return `${day} ${TH_MONTHS[m - 1]} ${String((y + 543) % 100).padStart(2, '0')}`
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200/60 bg-white p-4 dark:border-zinc-800/60 dark:bg-zinc-900/80">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{children}</p>
}

/** ตารางห่อ overflow-x-auto — จอแคบเลื่อนซ้ายขวาในกล่อง ไม่ดันหน้าทั้งหน้า */
function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {head.map((h, i) => (
              <th key={h} className={cn('whitespace-nowrap py-2 pr-3 font-medium', i > 0 && 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">{children}</tbody>
      </table>
    </div>
  )
}

const num = 'whitespace-nowrap py-2 pr-3 text-right tabular-nums'

export default function UsageView({ lines, lists, sold, unitsByCategory, salesPickCategoryIds, people, today }: UsageData) {
  const [period, setPeriod] = useState<UsagePeriod>('all')
  const [query, setQuery] = useState('')

  const view = useMemo(() => {
    const range = usagePeriodRange(period, today)
    const periodLines = lines.filter(l => inUsagePeriod(l, range))
    const periodLists = lists.filter(l => inUsagePeriod(l, range))
    return {
      units: unitUsage(periodLines),
      categories: categoryUsage(periodLines, unitsByCategory),
      packages: packageSales(sold, today, range),
      booths: boothUsage(periodLines, salesPickCategoryIds),
      people: peopleUsage(periodLists, people),
    }
  }, [period, today, lines, lists, sold, unitsByCategory, salesPickCategoryIds, people])

  const now = useMemo(() => currentCounts(lists), [lists])
  const months = useMemo(() => hoursByMonth(lines, today, 12).map(m => ({ ...m, label: monthLabel(m.month) })), [lines, today])
  const chartEmpty = months.every(m => m.count === 0)

  const q = query.trim().toLowerCase()
  const shownUnits = q
    ? view.units.filter(u => u.unitName.toLowerCase().includes(q) || (u.serial ?? '').toLowerCase().includes(q))
    : view.units.slice(0, TOP_UNITS)
  const periodText = period === 'all' ? '' : `ใน${USAGE_PERIOD_LABELS_TH[period]}`

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 md:text-2xl dark:text-zinc-100">การใช้งานอุปกรณ์</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          ชิ้นไหนออกงานบ่อย ใช้ไปกี่ชั่วโมง แพ็กเกจไหนขายดี และใครจัดของ/คืนของ — นับจากใบจัดของที่รับของออกงานแล้ว
        </p>
      </div>

      {/* ชิปช่วง — สลับฝั่ง client ล้วน */}
      <div className="flex flex-wrap items-center gap-2">
        {USAGE_PERIODS.map(p => {
          const active = period === p
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                active
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border border-zinc-200 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800',
              )}
            >
              {USAGE_PERIOD_LABELS_TH[p]}
            </button>
          )
        })}
      </div>

      {/* ตอนนี้ — ตามสถานะปัจจุบันของใบ ไม่ขึ้นกับชิปช่วง */}
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['พร้อมรับ', now.ready],
            ['ออกงาน', now.out],
            ['รอคืนชั้น', now.returned],
          ] as const
        ).map(([label, value]) => (
          <Link
            key={label}
            href="/packing"
            className="rounded-xl border border-zinc-200/60 bg-white p-3 transition-colors hover:bg-zinc-50 sm:p-4 dark:border-zinc-800/60 dark:bg-zinc-900/80 dark:hover:bg-zinc-800/60"
          >
            <div className="truncate text-xs font-semibold text-zinc-500 dark:text-zinc-400">{label}</div>
            <div className="mt-1 text-2xl font-extrabold tabular-nums text-zinc-900 sm:text-3xl dark:text-zinc-100">{value}</div>
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500">ใบ · ดูใบจัดของ</div>
          </Link>
        ))}
      </div>

      <Section title="ชั่วโมงใช้งานต่อเดือน (12 เดือน)" hint="รวมทุกหน่วย 12 เดือนล่าสุด — ไม่ขึ้นกับช่วงที่เลือกด้านบน">
        {chartEmpty ? (
          <Empty>ยังไม่มีการใช้งานใน 12 เดือนล่าสุด</Empty>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#a1a1aa" strokeOpacity={0.25} vertical={false} />
                <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa' }} interval="preserveStartEnd" minTickGap={4} />
                <YAxis width={36} fontSize={10} axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa' }} allowDecimals={false} />
                <Tooltip
                  formatter={v => [`${formatHours(Number(v) || 0)} ชม.`, 'ชั่วโมงใช้งาน']}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="hours" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      <Section title="หน่วยที่ใช้บ่อย" hint={q ? `ผลค้นหา ${shownUnits.length} รายการ` : `${TOP_UNITS} อันดับแรก${periodText} · ค้นหาเพื่อดูทุกชิ้น`}>
        <div className="relative mb-3 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือ serial" className="pl-8" aria-label="ค้นหาชื่อหรือ serial" />
        </div>
        {shownUnits.length === 0 ? (
          <Empty>{q ? 'ไม่พบอุปกรณ์ที่ตรงกับคำค้น' : `ยังไม่มีอุปกรณ์ที่ออกงาน${periodText}`}</Empty>
        ) : (
          <Table head={['อุปกรณ์', 'ประเภท', 'ครั้ง', 'ชั่วโมง', 'ใช้ล่าสุด']}>
            {shownUnits.map(u => (
              <tr key={u.unitId}>
                <td className="py-2 pr-3">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {u.unitName}
                    {u.kind === 'kit' && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">กระเป๋า</span>}
                  </div>
                  {u.serial && <div className="text-[11px] text-zinc-400">{u.serial}</div>}
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-right text-zinc-500 dark:text-zinc-400">{u.categoryName ?? '–'}</td>
                <td className={num}>{u.count}</td>
                <td className={num}>{formatHours(u.hours)}</td>
                <td className={num}>{dayLabel(u.lastUsedAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="ตามประเภท" hint={`ไม่ได้ใช้ = หน่วยในประเภทที่ไม่ได้ออกงานเลย${periodText || 'ตั้งแต่เริ่มใช้ใบจัดของ'}`}>
        {view.categories.length === 0 ? (
          <Empty>ยังไม่มีประเภทอุปกรณ์ — ตั้งได้ที่ตั้งค่าคลัง</Empty>
        ) : (
          <Table head={['ประเภท', 'หน่วยทั้งหมด', 'ครั้ง', 'ชั่วโมง', 'ไม่ได้ใช้']}>
            {view.categories.map(c => (
              <tr key={c.categoryId ?? 'none'}>
                <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-100">{c.categoryName}</td>
                <td className={num}>{c.unitCount}</td>
                <td className={num}>{c.count}</td>
                <td className={num}>{formatHours(c.hours)}</td>
                <td className={cn(num, c.unusedUnits > 0 && 'text-amber-600 dark:text-amber-400')}>{c.unusedUnits}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="ตามแพ็กเกจ" hint="งานที่ตอบรับแล้วและถึงวันงานแล้ว · มีใบจัดของ = จำนวนงานที่เปิดใบจัดของแล้ว">
        {view.packages.length === 0 ? (
          <Empty>{`ยังไม่มีแพ็กเกจที่ขาย${periodText}`}</Empty>
        ) : (
          <Table head={['แพ็กเกจ', 'ขาย (ชุด)', 'มีใบจัดของ (งาน)']}>
            {view.packages.map(p => (
              <tr key={p.packageId}>
                <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-100">{p.packageName}</td>
                <td className={num}>{p.soldSets}</td>
                <td className={num}>{p.listed}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {salesPickCategoryIds.length > 0 && (
        <Section title="ตู้และแบบประกอบ" hint="ตู้แต่ละชุดออกงานกี่ครั้ง แยกตามแบบประกอบ">
          {view.booths.length === 0 ? (
            <Empty>{`ยังไม่มีตู้ที่ออกงาน${periodText}`}</Empty>
          ) : (
            <Table head={['ตู้', 'ครั้ง', 'แบบประกอบ']}>
              {view.booths.map(b => (
                <tr key={b.unitId}>
                  <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-100">{b.unitName}</td>
                  <td className={num}>{b.count}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {b.byVariant.map(v => (
                        <span key={v.variant} className="whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {v.variant} × {v.count}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      )}

      <Section title="คน" hint="นับเป็นใบ · จัดของ = ยืนยันจัดของ · คืนชั้น = คืนของขึ้นชั้นครบ · รับของ/คืนของ = ทีมหน้างาน">
        {view.people.length === 0 ? (
          <Empty>{`ยังไม่มีใครจัดของหรือคืนของ${periodText}`}</Empty>
        ) : (
          <Table head={['ชื่อ', 'จัดของ', 'คืนชั้น', 'รับของ', 'คืนของ']}>
            {view.people.map(p => (
              <tr key={p.userId}>
                <td className="py-2 pr-3 font-medium text-zinc-900 dark:text-zinc-100">{p.name}</td>
                <td className={num}>{p.packed}</td>
                <td className={num}>{p.restocked}</td>
                <td className={num}>{p.handedOver}</td>
                <td className={num}>{p.returned}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        ชั่วโมง = เวลาตั้งแต่รับของจนคืนของ (ยังไม่คืน หรือไม่มีเวลา ใช้ช่วงเวลาอีเวนต์แทน) · ครั้ง = จำนวนใบที่รับของออกงานแล้ว · ช่วงเวลาอิงวันรับของ
      </p>
    </div>
  )
}
