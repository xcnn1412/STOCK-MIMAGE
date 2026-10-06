'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Banknote, LayoutDashboard, PlusCircle, Globe, Wallet, Archive, BarChart3, Percent, Coins, Search } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { Locale } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// adminOnly: หน้าที่ตรวจบทบาทใน page.tsx แล้ว — ซ่อนแท็บด้วย ไม่ให้พนักงานกดแล้วเด้งกลับ
const tabMeta = [
  { href: '/finance', key: 'claims' as const, icon: LayoutDashboard, exact: true, adminOnly: false },
  { href: '/finance/overview', key: 'overview' as const, icon: BarChart3, exact: false, adminOnly: true },
  { href: '/finance/payouts', key: 'payouts' as const, icon: Wallet, exact: false, adminOnly: true },
  { href: '/finance/petty-cash', key: 'pettyCash' as const, icon: Coins, exact: false, adminOnly: false },
  { href: '/finance/archive', key: 'archive' as const, icon: Archive, exact: false, adminOnly: false },
  { href: '/finance/download', key: 'download' as const, icon: Percent, exact: false, adminOnly: true },
  { href: '/finance/new', key: 'newClaim' as const, icon: PlusCircle, exact: false, adminOnly: false },
]

const labels = {
  en: { claims: 'All Claims', overview: 'Audit Report', payouts: 'Payouts', pettyCash: 'Petty Cash', archive: 'Archive', download: 'WHT 3%', newClaim: 'New Claim' },
  th: { claims: 'ใบเบิก', overview: 'รายงานตรวจสอบ', payouts: 'สรุปยอดจ่าย', pettyCash: 'เงินสดย่อย', archive: 'คลังเก็บ', download: 'หัก ณ ที่จ่าย', newClaim: 'สร้างใบเบิก' },
}

/** role มาจาก layout (บทบาทที่ยืนยันกับฐานข้อมูลแล้ว) */
export default function FinanceNav({ role, outstandingCount = 0 }: { role: string; outstandingCount?: number }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { locale, setLocale } = useLocale()
  const t = labels[locale] || labels.th
  const isEn = locale === 'en'
  const tabs = role === 'admin' ? tabMeta : tabMeta.filter(tab => !tab.adminOnly)
  // ช่องค้นหาแสดงคำที่ค้นอยู่เมื่ออยู่หน้าผลการค้นหา · key เปลี่ยนตามคำค้น → ช่องตามค่าใหม่เมื่อกดย้อนกลับ
  const onSearchPage = pathname === '/finance/search'
  const currentQ = onSearchPage ? (searchParams?.get('q') ?? '') : ''

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <div className="flex flex-col 2xl:flex-row 2xl:items-center 2xl:justify-between gap-2 2xl:gap-3">
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 2xl:flex-1">
        {/* Finance Brand Mark */}
        <div className="flex items-center gap-2 sm:gap-2.5 pr-3 sm:pr-4 border-r border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/25">
            <Banknote className="h-4.5 w-4.5" />
          </div>
          <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 hidden sm:block">
            Finance
          </span>
        </div>

        {/* Tabs — แถวเดียว เลื่อนแนวนอนบนจอแคบ (min-w-0 ให้หดได้ ไม่ดันหน้าให้กว้างเกินจอ) · ชื่อแท็บแสดงทุกขนาดจอ */}
        <nav
          aria-label={isEn ? 'Finance sections' : 'เมนูใบเบิก'}
          className="flex flex-1 min-w-0 flex-nowrap gap-1 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map(tab => {
            const Icon = tab.icon
            const active = isActive(tab.href, tab.exact)
            const label = t[tab.key]
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`
                  relative flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium
                  transition-all duration-200 whitespace-nowrap shrink-0
                  ${active
                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40'
                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60'
                  }
                `}
              >
                <Icon aria-hidden="true" className={`h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 transition-colors ${active ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                <span>{label}</span>
                {tab.key === 'claims' && outstandingCount > 0 && (
                  <span
                    data-testid="outstanding-pill"
                    aria-label={isEn ? `${outstandingCount} outstanding item(s)` : `มีรายการค้างเคลียร์ ${outstandingCount} ใบ`}
                    title={isEn ? `${outstandingCount} outstanding item(s)` : `มีรายการค้างเคลียร์ ${outstandingCount} ใบ`}
                    className="min-w-[1.125rem] rounded-full bg-red-600 px-1.5 py-0.5 text-center text-xs font-bold leading-none text-white"
                  >
                    {outstandingCount}
                  </span>
                )}
                {active && (
                  <span className="absolute -bottom-[9px] left-3 right-3 h-[2px] rounded-full bg-emerald-500 dark:bg-emerald-400 hidden sm:block" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* ค้นหาช่องเดียว: เลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน ทุกสถานะทุกเดือน → /finance/search?q= (ฟอร์ม GET ธรรมดา ใช้ได้แม้ JS ยังไม่โหลด) */}
      {/* ช่องค้นหาอยู่แถวที่สองจนจอกว้างพอ — แท็บของแอดมิน 7 แท็บ + ช่องค้นหา + ปุ่มภาษา ไม่พอในแถวเดียวที่ 1280px */}
      <div className="flex min-w-0 items-center justify-between gap-2 2xl:shrink-0 2xl:justify-start">
        <form action="/finance/search" method="get" role="search" className="relative min-w-0 flex-1 sm:max-w-md 2xl:w-80 2xl:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <Input
            key={currentQ}
            name="q"
            type="search"
            defaultValue={currentQ}
            maxLength={100}
            enterKeyHint="search"
            aria-label={isEn ? 'Search claims in every status and month' : 'ค้นหาใบเบิกทุกสถานะทุกเดือน'}
            placeholder={isEn ? 'Claim no., title, submitter, event — every status and month' : 'ค้นหาเลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน — ทุกสถานะ ทุกเดือน'}
            className="min-h-10 h-10 pl-9"
          />
        </form>

        {/* Language Toggle */}
        <Button type="button" variant="ghost" size="lg"
          onClick={() => setLocale(locale === 'th' ? 'en' : 'th' as Locale)}
          className="shrink-0 px-3 text-zinc-600 dark:text-zinc-400"
        >
          <Globe aria-hidden="true" />
          {locale === 'th' ? 'EN' : 'TH'}
        </Button>
      </div>
    </div>
  )
}
