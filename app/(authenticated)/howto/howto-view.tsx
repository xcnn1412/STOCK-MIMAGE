'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/i18n/context'
import {
  BookOpen, Banknote, FileText, CheckCircle2, Clock, Receipt, Wallet, RefreshCw,
  XCircle, Ban, Send, ShieldAlert, Upload, Bell, Layout, User, UserCog,
  CircleDollarSign, ListChecks, ArrowRight, ExternalLink, Edit3, Lock,
  GitBranch, ChevronDown, Building2, Hash, Sparkles, FileSpreadsheet, Percent,
  AlertCircle, X, Camera, MapPin, Home, LogIn, LogOut, History, Zap, Image as ImageIcon,
  CalendarDays, Heart, Plane, Briefcase, ShieldCheck,
  LayoutDashboard, Users, BarChart3, AtSign, TrendingUp, Tag, Phone, MessageSquare,
  CreditCard, Calendar, Trash2, Download, Search, Filter, Bot, FolderArchive,
  Package, ClipboardList, MessageCircle, Smile, Paperclip,
  QrCode, Boxes, Hammer, AlertTriangle, ScrollText, Printer, ArrowDownToLine, ArrowUpFromLine,
  Target, Award, Trophy, Repeat, Coins, Gauge, MessagesSquare,
  Shield, Activity, KeyRound, UserX, Globe, Network,
  Calculator, CircleHelp, Settings,
  PackageCheck, ScanLine, Truck, ArchiveRestore, Warehouse,
} from 'lucide-react'

export type HowtoViewType = 'landing' | 'overview' | 'crm' | 'events' | 'jobs' | 'stock' | 'costs' | 'finance' | 'kpi' | 'security' | 'checkin' | 'salary' | 'equipment'

export default function HowtoView({ view = 'landing' }: { view?: HowtoViewType } = {}) {
  const { locale } = useLocale()
  const isEn = locale === 'en'

  return (
    <div id="top" className="max-w-5xl mx-auto space-y-8 pb-12">
      {view === 'landing' && (
      <>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/20 dark:via-zinc-900 dark:to-teal-950/20 p-6 md:p-8">
        <div className="relative flex items-start gap-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'How-to Guide' : 'คู่มือใช้งาน'}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5">
              {isEn
                ? 'Step-by-step guides for each feature in Office Hub.'
                : 'คู่มือการใช้งานฟีเจอร์ต่างๆ ในระบบ Office Hub แบบ step-by-step'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Module library — landing card grid ────────────────────── */}
      <ModuleLibrary modules={MODULES} isEn={isEn} />

      </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: OVERVIEW
          ════════════════════════════════════════════════════════════════ */}
      {view === 'overview' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[0]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[0]} isEn={isEn} />

        {/* ── Intro / admin only ──────────────────────────────────── */}
        <div id="overview-intro" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-violet-200 dark:border-violet-900 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-zinc-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-600 text-white">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-violet-900 dark:text-violet-200">
                  {isEn ? 'Overview — admin command center' : 'ภาพรวม — หน้าหลักของ admin'}
                </p>
                <p className="text-[11px] text-violet-700 dark:text-violet-400">
                  {isEn
                    ? 'Aggregates Costs, Finance, CRM, and Check-in into one screen for the whole company.'
                    : 'รวมข้อมูลจาก Costs / Finance / CRM / Check-in ให้เห็นภาพรวมทั้งบริษัทในหน้าเดียว'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Admin only. Regular users opening /overview are redirected to /dashboard. AI features and CSV exports are also gated server-side.'
                  : 'admin เท่านั้น — user ทั่วไปจะถูก redirect ไป /dashboard อัตโนมัติ ฟีเจอร์ AI และ export CSV ถูกตรวจสิทธิ์อีกชั้นที่ฝั่ง server'}
              </p>
            </div>
          </div>
        </div>

        {/* ── 4 view modes ────────────────────────────────────────── */}
        <div id="overview-views" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? '4 view modes — pick the lens you need' : '4 มุมมอง — เลือกใช้ตามจุดประสงค์'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <TypeCard
              emoji="📊"
              title={isEn ? 'Dashboard' : 'แดชบอร์ด'}
              subtitle="dashboard"
              desc={isEn ? 'KPI cards, insights, top/bottom events, customers — daily glance.' : 'การ์ด KPI, insights, top/bottom events, ลูกค้า — ดูเร็วทุกวัน'}
              receipt={isEn ? 'Default view' : 'มุมมองเริ่มต้น'}
              receiptColor="emerald"
            />
            <TypeCard
              emoji="📋"
              title={isEn ? 'Table' : 'ตาราง'}
              subtitle="table"
              desc={isEn ? 'Sortable list of every event with cost & expense breakdown on expand.' : 'รายการ event ทั้งหมด เรียง/ค้นได้ คลิกเพื่อกาง breakdown ต้นทุนและใบเบิก'}
              receipt={isEn ? 'Drill-down' : 'เจาะข้อมูล'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="📈"
              title={isEn ? 'Analytics' : 'วิเคราะห์'}
              subtitle="analytics"
              desc={isEn ? 'Year-over-year financials, 3 charts, monthly tax/cash-out summary, CSV.' : 'เปรียบเทียบรายปี 3 กราฟ + สรุปภาษี/cash-out รายเดือน + export CSV'}
              receipt={isEn ? 'Monthly close-out' : 'ใช้ปิดเดือน'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="🤖"
              title={isEn ? 'AI Assist' : 'AI Assist'}
              subtitle="ai"
              desc={isEn ? 'Gemini-powered Thai-language analyst — pick sections + date range and ask.' : 'นักวิเคราะห์ AI (Gemini ตอบเป็นภาษาไทย) — เลือกหัวข้อ + ช่วงวันที่ + พิมพ์คำถาม'}
              receipt={isEn ? 'Saves history' : 'เก็บประวัติ'}
              receiptColor="emerald"
            />
          </div>
        </div>

        {/* ── Dashboard view ──────────────────────────────────────── */}
        <div id="overview-dashboard" className="scroll-mt-6">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title={isEn ? 'Dashboard view — what each block tells you' : 'แดชบอร์ด — แต่ละบล็อกบอกอะไร'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="🔔 Insights panel"
              titleEn="🔔 Insights panel"
              lines={isEn
                ? [
                    'Color-coded rule-based alerts (no AI)',
                    'Surfaces low-margin / loss-making events',
                    'Highlights pending payouts and expense anomalies',
                  ]
                : [
                    'แจ้งเตือนตามกฎ (ไม่ใช้ AI) แยกสีตามความรุนแรง',
                    'ดึง event ที่ margin ต่ำ / ขาดทุน ขึ้นมาเตือน',
                    'เน้นเงินที่ค้างจ่าย และต้นทุนผิดปกติ',
                  ]}
            />
            <FeatureBlock
              titleTh="💰 KPI cards (4 + 4)"
              titleEn="💰 KPI cards (4 + 4)"
              lines={isEn
                ? [
                    'Financial: Events, Revenue, Cost, Net Profit (with margin)',
                    'Operational: Claims, Check-ins, Avg Profit/Event, Cost Ratio',
                  ]
                : [
                    'การเงิน: จำนวน Events / รายได้ / ต้นทุน / กำไร (พร้อม margin)',
                    'การดำเนินงาน: ใบเบิก / เช็คอิน / กำไรเฉลี่ย/งาน / Cost Ratio',
                  ]}
            />
            <FeatureBlock
              titleTh="📊 Margin distribution"
              titleEn="📊 Margin distribution"
              lines={isEn
                ? [
                    'Histogram of events by margin band',
                    'Loss / Low / Medium / High',
                    'Click a band to see who falls in it',
                  ]
                : [
                    'ฮิสโตแกรม event แยกตาม margin',
                    'ขาดทุน / ต่ำ / กลาง / สูง',
                    'คลิกที่แท่งเพื่อดูว่า event ไหนอยู่ในกลุ่มนั้น',
                  ]}
            />
            <FeatureBlock
              titleTh="📈 Monthly Revenue vs Cost"
              titleEn="📈 Monthly Revenue vs Cost"
              lines={isEn
                ? [
                    'Bar + line composite by month',
                    'Spot trend at a glance: are costs rising faster than revenue?',
                  ]
                : [
                    'กราฟ bar + line รายเดือน',
                    'ดูแนวโน้มเร็ว ๆ ว่าต้นทุนโตเร็วกว่ารายได้ไหม',
                  ]}
            />
            <FeatureBlock
              titleTh="🏆 Top 5 / Bottom 5 events"
              titleEn="🏆 Top 5 / Bottom 5 events"
              lines={isEn
                ? [
                    'Top: highest profit + margin %',
                    'Bottom: events to review (loss-making / low margin)',
                    'Click an event row to open Costs detail',
                  ]
                : [
                    'Top: กำไรสูงสุด + margin %',
                    'Bottom: event ที่ควรตรวจ (ขาดทุน / margin ต่ำ)',
                    'คลิกแถวเพื่อเปิดรายละเอียด Costs',
                  ]}
            />
            <FeatureBlock
              titleTh="👥 Top customers"
              titleEn="👥 Top customers"
              lines={isEn
                ? [
                    'Ranked by revenue',
                    'Shows job count, revenue, profit, margin',
                  ]
                : [
                    'จัดลำดับตามรายได้',
                    'บอกจำนวนงาน / รายได้ / กำไร / margin',
                  ]}
            />
          </div>
        </div>

        {/* ── Table view ──────────────────────────────────────────── */}
        <div id="overview-table" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Table view — every event in one place' : 'มุมมองตาราง — ทุก event ในที่เดียว'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-violet-200 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'A wide sortable table showing Name, Date, Seller, Customer, Revenue, Cost, Profit, Margin, Expenses for every event. Click a row to expand cost categories, expense claims, and check-ins.'
                : 'ตารางกว้างเรียงได้ แสดง ชื่องาน / วันที่ / Seller / ลูกค้า / รายได้ / ต้นทุน / กำไร / Margin / ใบเบิก ของทุก event — คลิกแถวเพื่อกางต้นทุนแยกหมวด ใบเบิก และข้อมูลเช็คอิน'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="🔍 ค้นหา + filter"
                titleEn="🔍 Search + filter"
                lines={isEn
                  ? [
                      'Live search by event name',
                      'Status filter: all / draft / completed',
                    ]
                  : [
                      'ค้นชื่อ event แบบ live',
                      'Filter สถานะ: all / draft / completed',
                    ]}
              />
              <FeatureBlock
                titleTh="🔽 ขยายแถว"
                titleEn="🔽 Expandable rows"
                lines={isEn
                  ? [
                      'Cost breakdown by category (staff, travel, equipment, etc.)',
                      'Linked expense claims (paid / pending)',
                      'Check-in summary (staff count + total hours)',
                    ]
                  : [
                      'ต้นทุนแยกหมวด (ค่าตัว, เดินทาง, อุปกรณ์, ฯลฯ)',
                      'ใบเบิกที่ผูกกับงานนี้ (จ่ายแล้ว / รอจ่าย)',
                      'สรุปเช็คอิน (จำนวน staff + ชั่วโมงรวม)',
                    ]}
              />
            </div>
          </div>
        </div>

        {/* ── Analytics view ──────────────────────────────────────── */}
        <div id="overview-analytics" className="scroll-mt-6">
          <SectionHeader
            icon={<TrendingUp className="h-4 w-4" />}
            title={isEn ? 'Analytics — monthly close-out workflow' : 'มุมมองวิเคราะห์ — ใช้ตอนปิดเดือน'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-violet-200 dark:border-violet-900 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-zinc-900 p-4 space-y-3">
            <p className="text-xs text-violet-900 dark:text-violet-200 leading-relaxed">
              {isEn
                ? 'Pick a year, then optionally toggle individual months. The page recomputes 3 charts, a 14-column monthly table, and a cost-category breakdown — all exportable to CSV with one click.'
                : 'เลือกปี → เลือกเดือนทีละเดือนได้ ระบบจะคำนวณกราฟ 3 ชุด ตารางสรุปรายเดือน 14 คอลัมน์ และ breakdown ต้นทุนตามหมวด — Export CSV ได้คลิกเดียว'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="📅 ตัวกรอง"
                titleEn="📅 Filters"
                lines={isEn
                  ? [
                      'Year picker (compares to previous year)',
                      'Month chips: pick any subset, or "all year"',
                    ]
                  : [
                      'เลือกปี (ระบบเทียบกับปีก่อนหน้าให้)',
                      'ปุ่มเดือน: กดเลือกหลายเดือนได้ หรือ "ทั้งปี"',
                    ]}
              />
              <FeatureBlock
                titleTh="📊 3 กราฟหลัก"
                titleEn="📊 3 main charts"
                lines={isEn
                  ? [
                      'Revenue · Cost · Profit by month',
                      'Tax base — VAT / WHT stacked by month',
                      'Cash out — Accrued cost vs Paid expenses',
                    ]
                  : [
                      'Revenue · Cost · Profit รายเดือน',
                      'ฐานภาษี — VAT / WHT แยกแท่งรายเดือน',
                      'เงินไหลออก — ต้นทุน accrued vs ใบเบิกจ่ายจริง',
                    ]}
              />
              <FeatureBlock
                titleTh="📋 ตารางสรุป 14 คอลัมน์"
                titleEn="📋 14-column summary table"
                lines={isEn
                  ? [
                      'Events / Revenue / VAT / WHT / Net / Cost / Margin / paid expenses…',
                      'Year-total row at the bottom',
                    ]
                  : [
                      'จำนวนงาน / รายได้ / VAT / WHT / สุทธิ / ต้นทุน / Margin / ใบเบิกจ่ายแล้ว…',
                      'แถว "รวมทั้งปี" ที่ท้ายตาราง',
                    ]}
              />
              <FeatureBlock
                titleTh="📥 Export CSV"
                titleEn="📥 CSV export"
                lines={isEn
                  ? [
                      'File: analytics-YYYY-M1-M2.csv',
                      'Includes all 14 columns + year total',
                    ]
                  : [
                      'ชื่อไฟล์: analytics-YYYY-M1-M2.csv',
                      'ครบทุก 14 คอลัมน์ + แถวรวมปี',
                    ]}
              />
            </div>

            <div className="flex items-start gap-2 p-2.5 bg-white dark:bg-zinc-900 border border-violet-200 dark:border-violet-900 rounded-lg">
              <span className="text-base">💡</span>
              <p className="text-[11px] text-violet-900 dark:text-violet-200">
                {isEn
                  ? 'Workflow at month-end: pick year → toggle current month only → cross-check the 14-column table against accounting → export CSV → forward to accounting.'
                  : 'วิธีใช้ปิดเดือน: เลือกปี → กดเฉพาะเดือนปัจจุบัน → ตรวจตาราง 14 คอลัมน์เทียบกับบัญชี → export CSV → ส่งสำนักงานบัญชี'}
              </p>
            </div>
          </div>
        </div>

        {/* ── AI Assist ───────────────────────────────────────────── */}
        <div id="overview-ai" className="scroll-mt-6">
          <SectionHeader
            icon={<Bot className="h-4 w-4" />}
            title={isEn ? 'AI Assist — ask a question, get a Thai analyst report' : 'AI Assist — ถามคำถาม ได้ผลวิเคราะห์เป็นภาษาไทย'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4 space-y-3">
            <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
              {isEn
                ? 'Powered by Google Gemini (2.5-flash with auto-fallback). The AI plays a "senior event business analyst (15 yrs)" — outputs Thai narrative with risk flags, root-cause diagnosis, and a tiered action plan.'
                : 'ใช้ Google Gemini (2.5-flash + fallback อัตโนมัติ) AI สวมบทบาท "Senior Event Business Analyst (15 ปี)" — ตอบเป็นภาษาไทย พร้อม flag ความเสี่ยง / root-cause / แผนปฏิบัติแบ่งระยะ'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RoleCard
                role="user"
                title={isEn ? 'How to ask' : 'วิธีใช้งาน'}
                steps={isEn ? [
                  { n: 1, label: 'Tick the data sections to feed in (financial, costs, per-event, sellers, expenses, check-ins, designers)', tag: null },
                  { n: 2, label: 'Optional: pick a date range', tag: 'date_from / date_to' },
                  { n: 3, label: 'Type your prompt (or leave blank for a default health check)', tag: null },
                  { n: 4, label: 'Click "Generate" → result renders in markdown with emoji', tag: null },
                  { n: 5, label: 'Result auto-saves to history (last 50 kept)', tag: null },
                ] : [
                  { n: 1, label: 'กา ☑ หัวข้อข้อมูลที่อยากให้ AI ใช้ (การเงิน, ต้นทุน, รายงาน event, sellers, ใบเบิก, เช็คอิน, designer)', tag: null },
                  { n: 2, label: 'เลือกช่วงวันที่ (ถ้าไม่กรอกจะใช้ทั้งหมด)', tag: 'date_from / date_to' },
                  { n: 3, label: 'พิมพ์คำถาม (หรือเว้นว่าง — ระบบจะวิเคราะห์ภาพรวมให้)', tag: null },
                  { n: 4, label: 'กด "Generate" → ผลแสดงเป็น markdown พร้อม emoji', tag: null },
                  { n: 5, label: 'ผลถูกบันทึกเข้า history อัตโนมัติ (เก็บ 50 ครั้งล่าสุด)', tag: null },
                ]}
              />
              <RoleCard
                role="admin"
                title={isEn ? 'What you get back' : 'AI ตอบอะไรมาบ้าง'}
                steps={isEn ? [
                  { n: 1, label: 'Health summary + trend (improving / flat / declining)', tag: null },
                  { n: 2, label: 'Risk flags by event name (low margin / loss)', tag: null },
                  { n: 3, label: 'Cost-structure anomalies', tag: null },
                  { n: 4, label: 'Team performance ranking (sellers, designers)', tag: null },
                  { n: 5, label: 'Payment / expense pipeline status', tag: null },
                  { n: 6, label: 'Root-cause diagnosis + 3-tier action plan (1wk / 1mo / 3mo)', tag: null },
                ] : [
                  { n: 1, label: 'สรุปสุขภาพธุรกิจ + แนวโน้ม (ดีขึ้น / ทรง / แย่ลง)', tag: null },
                  { n: 2, label: 'flag ความเสี่ยง — ระบุชื่อ event ที่ margin ต่ำ / ขาดทุน', tag: null },
                  { n: 3, label: 'ต้นทุนผิดปกติในแต่ละหมวด', tag: null },
                  { n: 4, label: 'ลำดับ performance ของทีม (sellers, designers)', tag: null },
                  { n: 5, label: 'สถานะการจ่ายเงิน / ใบเบิกค้าง', tag: null },
                  { n: 6, label: 'วินิจฉัย root-cause + แผนปฏิบัติ 3 ระยะ (1 สัปดาห์ / 1 เดือน / 3 เดือน)', tag: null },
                ]}
              />
            </div>

            <div className="rounded-lg border border-emerald-200/60 dark:border-emerald-900/50 bg-white dark:bg-zinc-900 p-3">
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1.5">
                {isEn ? 'AI history panel' : 'Panel ประวัติ AI'}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {isEn
                  ? 'Right-side panel lists the last 50 analyses with timestamp, event count, sections used, and model. Click to re-open the full result + the data snapshot it ran on. Delete anytime.'
                  : 'panel ขวามือลิสต์ประวัติ 50 ครั้งล่าสุด พร้อมเวลา / จำนวน event / หัวข้อที่เลือก / model — คลิกเพื่อเปิดผลเก่า + snapshot ของข้อมูลที่ใช้ตอนนั้น (ลบได้ทุกเมื่อ)'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="overview-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'User' : 'User'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Admin' : 'Admin'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'Open /overview' : 'เข้าหน้า /overview'} owner="—" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'View dashboard / table / analytics' : 'ดูแดชบอร์ด / ตาราง / วิเคราะห์'} owner="—" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Generate AI analysis' : 'สั่ง AI วิเคราะห์'} owner="—" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'View / delete AI history' : 'ดู / ลบประวัติ AI'} owner="—" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Export CSV (analytics + table)' : 'Export CSV'} owner="—" other="no" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Menu shortcuts ──────────────────────────────────────── */}
        <div id="overview-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/overview"        labelEn="Main overview (admin)"      labelTh="ภาพรวม (admin)" />
            <MenuLink href="/overview/goals"  labelEn="Goals & KPI tracking"       labelTh="เป้าหมาย / ติดตาม KPI" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: CRM
          ════════════════════════════════════════════════════════════════ */}
      {view === 'crm' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[1]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[1]} isEn={isEn} />

        {/* ── What's new ──────────────────────────────────────────── */}
        <div id="crm-whats-new" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-rose-200 dark:border-rose-900 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-rose-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-rose-900 dark:text-rose-200">
                  {isEn ? "What's new in CRM" : 'ฟีเจอร์ที่ควรรู้'}
                </p>
                <p className="text-[11px] text-rose-700 dark:text-rose-400">
                  {isEn
                    ? '6 capabilities that shape how leads flow into events and finance'
                    : '6 ฟีเจอร์ที่ทำให้ lead ไหลไปยัง event และ finance ได้เนียนขึ้น'}
                </p>
              </div>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-rose-900 dark:text-rose-200">
              <NewItem
                icon={<CreditCard className="h-3.5 w-3.5" />}
                titleTh="งวดผ่อนกี่งวดก็ได้"
                titleEn="Unlimited installments"
                descTh="เปลี่ยนจาก 4 งวดคงที่ → เพิ่มลบได้ตามจริง แต่ละงวดมีวันครบกำหนด + แนบหลักฐานชำระ"
                descEn="Replaced fixed 4 columns with a normalized table — add/remove freely, each row has due date + payment proof"
                isEn={isEn}
              />
              <NewItem
                icon={<Upload className="h-3.5 w-3.5" />}
                titleTh="แนบสลิป/ใบเสร็จงวดผ่อน"
                titleEn="Payment proof per installment"
                descTh="อัพโหลดสลิป/ใบเสร็จ/PDF (≤10MB) เก็บใน bucket crm-payment-proofs"
                descEn="Upload slip/receipt/PDF (≤10MB) stored in crm-payment-proofs bucket"
                isEn={isEn}
              />
              <NewItem
                icon={<Users className="h-3.5 w-3.5" />}
                titleTh="มอบหมายทีมแยกต่อ Event"
                titleEn="Per-event staff assignment"
                descTh="เก็บใน event_staff (แยกต่อ event) — 1 user มีหลาย role ต่อ event ได้ (sale / graphic / photographer / screen / lighting / general)"
                descEn="Stored in event_staff (per event) — one user can hold multiple roles on a single event"
                isEn={isEn}
              />
              <NewItem
                icon={<AtSign className="h-3.5 w-3.5" />}
                titleTh="@mention เพื่อนร่วมงาน"
                titleEn="@mention teammates"
                descTh="พิมพ์ @ ใน activity → เลือกชื่อ ผู้ที่ถูก mention จะได้แจ้งเตือน crm_mentioned"
                descEn="Type @ in an activity → pick a teammate; they get a crm_mentioned notification"
                isEn={isEn}
              />
              <NewItem
                icon={<Percent className="h-3.5 w-3.5" />}
                titleTh="VAT / WHT sync ไป Costs"
                titleEn="VAT / WHT sync to Costs"
                descTh="ตั้ง vat_mode + wht_rate ที่ lead → sync ตามไปยัง event ทำให้ Finance คำนวณภาษีถูก"
                descEn="Set vat_mode + wht_rate on lead → mirrored to linked event so Finance taxes are correct"
                isEn={isEn}
              />
              <NewItem
                icon={<Send className="h-3.5 w-3.5" />}
                titleTh="แปลง lead → event ปุ่มเดียว"
                titleEn="One-click lead → event"
                descTh="พอ lead = accepted กดสร้าง event ระบบจะคัดลอกชื่อลูกค้า / วันที่ / ราคา / ภาษี / ทีมไปให้"
                descEn="When lead = accepted, click to create a Costs event — customer, date, price, taxes, team are pre-filled"
                isEn={isEn}
              />
            </ul>
          </div>
        </div>

        {/* ── Intro / Kanban ──────────────────────────────────────── */}
        <div id="crm-intro" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? 'Overview — Kanban from inquiry to booking' : 'ภาพรวม — บอร์ด Kanban ตั้งแต่ลูกค้าทักมาจนปิดงาน'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-rose-200 dark:border-rose-900 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/20 dark:to-zinc-900 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Use /crm to track every customer inquiry as a card on a Kanban board. Drag cards across 4 columns as the deal progresses. Once a lead is accepted, you can spin off a Costs event with one click, carrying customer, dates, price, and tax settings forward.'
                : 'ใช้ /crm เก็บคำขอจากลูกค้าทุกคนเป็นการ์ดบนบอร์ด Kanban — ลากการ์ดข้าม 4 คอลัมน์ตามสถานะงาน เมื่อ lead = accepted กดสร้าง event ใน Costs ได้ปุ่มเดียว (ระบบเอาข้อมูลลูกค้า / วันที่ / ราคา / ภาษี ตามไปให้)'}
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <NewItem
                icon={<Layout className="h-3.5 w-3.5" />}
                titleTh="📋 หน้าหลัก: Kanban"
                titleEn="📋 Main view: Kanban"
                descTh="ลากการ์ดข้าม 4 คอลัมน์ — มี filter แหล่งที่มา / ทีม / tag"
                descEn="Drag cards across 4 columns — filters by source / team / tag"
                isEn={isEn}
              />
              <NewItem
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                titleTh="📈 /crm/dashboard"
                titleEn="📈 /crm/dashboard"
                descTh="กราฟ conversion / แหล่งที่มา / package / รายได้"
                descEn="Charts: conversion / source / package / revenue"
                isEn={isEn}
              />
              <NewItem
                icon={<Calendar className="h-3.5 w-3.5" />}
                titleTh="🗓 /crm/payments"
                titleEn="🗓 /crm/payments"
                descTh="ปฏิทินเงินเข้า — ดูงวดที่ครบกำหนด / เกินกำหนด"
                descEn="Payment calendar — see due / overdue installments"
                isEn={isEn}
              />
              <NewItem
                icon={<FolderArchive className="h-3.5 w-3.5" />}
                titleTh="📦 /crm/archive"
                titleEn="📦 /crm/archive"
                descTh="lead เก่า — restore กลับได้"
                descEn="Old leads — can be restored"
                isEn={isEn}
              />
            </ul>
          </div>
        </div>

        {/* ── Pipeline (4 statuses) ───────────────────────────────── */}
        <div id="crm-pipeline" className="scroll-mt-6">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Pipeline — 4 statuses' : 'Pipeline — 4 สถานะ'}
          />
          <FlowchartBox
            title={isEn ? 'Lead lifecycle' : 'วงจรชีวิต lead'}
            color="rose"
          >
            <FlowNode variant="start" emoji="📞" title={isEn ? 'Customer inquires (LINE / IG / phone / walk-in)' : 'ลูกค้าทักมา (LINE / IG / โทร / เดินเข้า)'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📝" title={isEn ? 'Create lead card' : 'สร้างการ์ด lead'} subtitle="/crm" tag="status: lead" />
            <FlowArrow />
            <FlowNode variant="user" emoji="💬" title={isEn ? 'Send quotation' : 'ส่งใบเสนอราคา'} tag="lead → quotation_sent" />
            <FlowArrow />
            <FlowNode variant="decision" emoji="⚖️" title={isEn ? 'Customer decision' : 'ลูกค้าตอบกลับ'} />

            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <FlowLane label={isEn ? '✓ Accepted' : '✓ ตกลง'} color="emerald">
                <FlowNode variant="success" compact emoji="🤝" title={isEn ? 'Booked' : 'ปิดงาน'} tag="accepted" />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="🎯" title={isEn ? 'Click "Create Event"' : 'กดสร้าง event'} subtitle={isEn ? 'pre-fills customer / date / price / VAT-WHT / team' : 'คัด customer / date / ราคา / VAT-WHT / ทีมไปให้'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="📁" title={isEn ? 'Linked to Costs event' : 'ผูกกับ event ใน Costs'} tag="event_id" />
              </FlowLane>

              <FlowLane label={isEn ? '✗ Rejected' : '✗ ไม่ตกลง'} color="red">
                <FlowNode variant="error" compact emoji="❌" title={isEn ? 'Lost / declined' : 'ลูกค้าปฏิเสธ'} tag="rejected" />
                <FlowArrow label={isEn ? 'optional' : 'ทำได้'} />
                <FlowNode variant="terminal" compact emoji="📦" title={isEn ? 'Move to archive' : 'ย้ายเข้า archive'} subtitle={isEn ? 'still searchable / restorable' : 'ค้นเจอ / restore กลับได้'} />
              </FlowLane>
            </div>
          </FlowchartBox>

          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Status' : 'สถานะ'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Meaning' : 'ความหมาย'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold hidden sm:table-cell">{isEn ? 'Terminal?' : 'ปลายทาง?'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <StatusRow emoji="📞" color="#6b7280" label={isEn ? 'lead' : 'lead'} code="lead" meaning={isEn ? 'New inquiry, not yet quoted' : 'เพิ่งทัก ยังไม่ส่งใบเสนอราคา'} />
                <StatusRow emoji="💬" color="#0ea5e9" label={isEn ? 'quotation_sent' : 'ส่งใบเสนอราคา'} code="quotation_sent" meaning={isEn ? 'Quotation sent, waiting for customer reply' : 'ส่งใบเสนอราคาแล้ว รอลูกค้าตอบกลับ'} />
                <StatusRow emoji="🤝" color="#22c55e" label={isEn ? 'accepted' : 'ตกลง'} code="accepted" meaning={isEn ? 'Booked — eligible to spin off a Costs event' : 'ลูกค้าตกลง — สร้าง event ใน Costs ได้'} terminal />
                <StatusRow emoji="❌" color="#ef4444" label={isEn ? 'rejected' : 'ปฏิเสธ'} code="rejected" meaning={isEn ? 'Customer declined / lost' : 'ลูกค้าปฏิเสธ'} terminal />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Workflow: Create lead ───────────────────────────────── */}
        <div id="crm-create" className="scroll-mt-6">
          <SectionHeader
            icon={<Send className="h-4 w-4" />}
            title={isEn ? 'Create a lead' : 'สร้าง lead ใหม่'}
            color="rose"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleCard
              role="user"
              title={isEn ? 'Anyone (sales / admin)' : 'ใครก็สร้างได้ (sales / admin)'}
              steps={isEn ? [
                { n: 1, label: 'Click "+ New Lead" on /crm', tag: null },
                { n: 2, label: 'Fill customer name + LINE / phone', tag: null },
                { n: 3, label: 'Pick lead source: LINE / FB / IG / Web / referral / phone / walk-in / other', tag: 'lead_source' },
                { n: 4, label: 'Set customer type (configurable)', tag: 'customer_type' },
                { n: 5, label: 'Add tags (optional, multi-select)', tag: 'tags[]' },
                { n: 6, label: 'Save → card appears in "lead" column', tag: 'status: lead' },
              ] : [
                { n: 1, label: 'กด "+ New Lead" หน้า /crm', tag: null },
                { n: 2, label: 'กรอกชื่อลูกค้า + LINE / เบอร์โทร', tag: null },
                { n: 3, label: 'เลือกแหล่งที่มา: LINE / FB / IG / เว็บ / referral / โทร / walk-in / อื่นๆ', tag: 'lead_source' },
                { n: 4, label: 'ตั้งประเภทลูกค้า (ปรับใน settings ได้)', tag: 'customer_type' },
                { n: 5, label: 'ใส่ tag (ไม่บังคับ — เลือกหลายอันได้)', tag: 'tags[]' },
                { n: 6, label: 'กดบันทึก → การ์ดขึ้นในคอลัมน์ "lead"', tag: 'status: lead' },
              ]}
            />
            <FeatureBlock
              titleTh="🎯 ทางลัด"
              titleEn="🎯 Shortcuts"
              lines={isEn
                ? [
                    'Returning customer? Tick "is_returning" — shows on the card',
                    'Drag cards across columns instead of opening detail',
                    'Bulk filter by tag / source / team to focus',
                  ]
                : [
                    'ลูกค้าเก่าที่กลับมา — กา ☑ "is_returning" จะมี badge บนการ์ด',
                    'ลากการ์ดข้ามคอลัมน์ได้เลย ไม่ต้องเปิด detail',
                    'ใช้ filter tag / แหล่งที่มา / ทีม เพื่อตัดเฉพาะที่สนใจ',
                  ]}
            />
          </div>
        </div>

        {/* ── Workflow: Lead detail ───────────────────────────────── */}
        <div id="crm-detail" className="scroll-mt-6">
          <SectionHeader
            icon={<FileText className="h-4 w-4" />}
            title={isEn ? 'Lead detail page — what you can edit' : 'หน้ารายละเอียด lead — แก้อะไรได้บ้าง'}
            color="rose"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="👤 ข้อมูลลูกค้า"
              titleEn="👤 Customer info"
              lines={isEn
                ? [
                    'Name, LINE, phone',
                    'Customer type + tags',
                    'is_returning flag',
                  ]
                : [
                    'ชื่อ / LINE / เบอร์โทร',
                    'ประเภท + tag',
                    'flag ลูกค้าเก่าที่กลับมา',
                  ]}
            />
            <FeatureBlock
              titleTh="📅 ข้อมูลงาน"
              titleEn="📅 Event info"
              lines={isEn
                ? [
                    'Event date + end date (auto-computes # days)',
                    'Location, details, package',
                    'Quoted price + confirmed price',
                  ]
                : [
                    'วันเริ่ม / วันจบ (ระบบนับวันให้)',
                    'สถานที่ / รายละเอียด / package',
                    'ราคาเสนอ / ราคาตกลง',
                  ]}
            />
            <FeatureBlock
              titleTh="💵 ภาษี"
              titleEn="💵 Tax setup"
              lines={isEn
                ? [
                    'VAT mode: none / included / excluded',
                    'WHT rate: 0–5%',
                    'Settings sync to linked event when created',
                  ]
                : [
                    'VAT mode: ไม่มี / รวม / แยก',
                    'อัตราหัก ณ ที่จ่าย: 0–5%',
                    'เมื่อสร้าง event แล้ว ค่าจะ sync ตามไปอัตโนมัติ',
                  ]}
            />
            <FeatureBlock
              titleTh="📜 Activity timeline"
              titleEn="📜 Activity timeline"
              lines={isEn
                ? [
                    'Types: call · line · email · meeting · note · status_change',
                    '@mention teammates → notification',
                    'Status changes auto-logged with old → new',
                  ]
                : [
                    'ประเภท: call · line · email · meeting · note · status_change',
                    '@mention เพื่อนร่วมงาน → ระบบส่งแจ้งเตือน',
                    'เปลี่ยน status ถูก log อัตโนมัติพร้อม old → new',
                  ]}
            />
          </div>
        </div>

        {/* ── Installments ────────────────────────────────────────── */}
        <div id="crm-installments" className="scroll-mt-6">
          <SectionHeader
            icon={<CreditCard className="h-4 w-4" />}
            title={isEn ? 'Installments — flexible payment plan' : 'ผ่อนชำระ — แผนงวดยืดหยุ่น'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Each lead has its own installment list. Add as many rows as you need (no longer limited to 4) — every row has installment number, amount, due date, paid flag + paid date, and a payment proof file.'
                : 'แต่ละ lead มีลิสต์งวดผ่อนของตัวเอง — เพิ่มกี่งวดก็ได้ (ไม่ติด 4 งวดเหมือนเก่า) แต่ละแถวมีเลขงวด ยอด วันครบกำหนด สถานะชำระ + วันที่ชำระ และไฟล์หลักฐาน'}
            </p>
            <div className="overflow-x-auto rounded-xl border border-rose-200/60 dark:border-rose-900/40 bg-white dark:bg-zinc-900">
              <table className="w-full text-sm">
                <thead className="bg-rose-50 dark:bg-rose-950/30 text-xs uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Field' : 'ช่อง'}</th>
                    <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'What it stores' : 'เก็บอะไร'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                  <tr><td className="px-3 py-2 font-mono text-xs text-rose-600">installment_number</td><td className="px-3 py-2 text-xs">{isEn ? 'งวดที่ 1, 2, 3, …' : 'งวดที่ 1, 2, 3, …'}</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-xs text-rose-600">amount</td><td className="px-3 py-2 text-xs">{isEn ? 'Money for this installment' : 'ยอดเงินงวดนั้น'}</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-xs text-rose-600">due_date</td><td className="px-3 py-2 text-xs">{isEn ? 'When this installment is due' : 'วันครบกำหนด'}</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-xs text-rose-600">is_paid · paid_date</td><td className="px-3 py-2 text-xs">{isEn ? 'Tick when paid; system stamps date' : 'กา ☑ เมื่อชำระ — ระบบบันทึกวันที่ให้'}</td></tr>
                  <tr><td className="px-3 py-2 font-mono text-xs text-rose-600">receipt_url</td><td className="px-3 py-2 text-xs">{isEn ? 'Slip / receipt / PDF (≤10MB) — bucket: crm-payment-proofs' : 'สลิป / ใบเสร็จ / PDF (≤10MB) — bucket: crm-payment-proofs'}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Total of installments should match confirmed_price. Use /crm/payments to spot installments due this month or overdue at a glance.'
                  : 'ผลรวมของทุกงวดควรเท่ากับราคาตกลง — ดูงวดที่ครบกำหนดเดือนนี้ / เกินกำหนด ได้ในหน้า /crm/payments'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Staff assignment ────────────────────────────────────── */}
        <div id="crm-staff" className="scroll-mt-6">
          <SectionHeader
            icon={<Users className="h-4 w-4" />}
            title={isEn ? 'Staff — per-event, role-based assignment' : 'มอบหมายทีม — แยกต่อ event แบ่งตาม role'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Staff is assigned per event (event_staff table) — each event under a CRM lead has its own independent team. The CRM lead page shows staff grouped by event (read-only); edit it on each event’s page. One person can have multiple roles on the same event. Roles are configurable in /crm/settings.'
                : 'มอบหมายทีมแยกต่อ event (ตาราง event_staff) — แต่ละ event ใน lead เดียวกันมีทีมของตัวเองแยกกัน หน้า CRM แสดงทีมจัดกลุ่มตาม event (read-only) แก้ไขได้ในหน้าแต่ละ event — 1 คนสวมหลาย role ต่อ event ได้ ตั้ง role ที่ /crm/settings'}
            </p>
            <ul className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <NewItem icon={<Send className="h-3.5 w-3.5" />} titleTh="🎯 sale" titleEn="🎯 sale" descTh="คนปิดดีล" descEn="Closes the deal" isEn={isEn} />
              <NewItem icon={<ImageIcon className="h-3.5 w-3.5" />} titleTh="🎨 graphic" titleEn="🎨 graphic" descTh="ดีไซน์ media" descEn="Designs media" isEn={isEn} />
              <NewItem icon={<Camera className="h-3.5 w-3.5" />} titleTh="📷 photographer" titleEn="📷 photographer" descTh="ช่างภาพ" descEn="Photographer" isEn={isEn} />
              <NewItem icon={<Layout className="h-3.5 w-3.5" />} titleTh="🖥 screen_operator" titleEn="🖥 screen_operator" descTh="คุมจอ / ภาพหน้างาน" descEn="Runs screens / live feed" isEn={isEn} />
              <NewItem icon={<Sparkles className="h-3.5 w-3.5" />} titleTh="💡 lighting" titleEn="💡 lighting" descTh="ไฟ / lighting" descEn="Lighting tech" isEn={isEn} />
              <NewItem icon={<User className="h-3.5 w-3.5" />} titleTh="👤 general" titleEn="👤 general" descTh="ทีมทั่วไป" descEn="General staff" isEn={isEn} />
            </ul>
            <div className="flex items-start gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                {isEn
                  ? 'Staff carry over to the linked Costs event when you spin one off. Check-in module also reads this list to know who is allowed to clock in to this event.'
                  : 'เมื่อสร้าง event ใน Costs ระบบจะคัดทีมตามไปให้ และโมดูล Check-in อ่านจากที่นี่เพื่อรู้ว่าใครเช็คอินงานนี้ได้บ้าง'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Lead → Event ────────────────────────────────────────── */}
        <div id="crm-to-event" className="scroll-mt-6">
          <SectionHeader
            icon={<ArrowRight className="h-4 w-4" />}
            title={isEn ? 'Convert accepted lead into a Costs event' : 'แปลง lead = accepted ให้กลายเป็น event ใน Costs'}
            color="rose"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleCard
              role="user"
              title={isEn ? 'When lead is accepted' : 'เมื่อ lead = accepted'}
              steps={isEn ? [
                { n: 1, label: 'Open lead detail', tag: '/crm/[id]' },
                { n: 2, label: 'Click "Create Event"', tag: null },
                { n: 3, label: 'System pre-fills: customer name, dates, location, confirmed_price, VAT mode, WHT rate, staff', tag: null },
                { n: 4, label: 'Confirm — event created in Costs (linked_lead_id back-pointer)', tag: 'event_id ↔ lead' },
                { n: 5, label: 'Lead detail now shows a link "→ Open linked event"', tag: null },
              ] : [
                { n: 1, label: 'เปิดหน้า lead detail', tag: '/crm/[id]' },
                { n: 2, label: 'กดปุ่ม "สร้าง Event"', tag: null },
                { n: 3, label: 'ระบบ pre-fill: ชื่อลูกค้า, วันที่, สถานที่, ราคาตกลง, VAT mode, WHT, ทีม', tag: null },
                { n: 4, label: 'ยืนยัน — event ถูกสร้างใน Costs พร้อมตัวชี้กลับ (linked_lead_id)', tag: 'event_id ↔ lead' },
                { n: 5, label: 'หน้า lead จะมีลิงก์ "→ เปิด event"', tag: null },
              ]}
            />
            <FeatureBlock
              titleTh="🔗 ทำไมต้องผูก?"
              titleEn="🔗 Why link?"
              lines={isEn
                ? [
                    'Finance pulls revenue + VAT/WHT settings from the lead via the link',
                    'Overview can show CRM source on each event row',
                    'Costs event reconciles confirmed_price vs actual_revenue',
                    'Open lead from event row, or event from lead — bidirectional',
                  ]
                : [
                    'Finance ดึงรายได้ + ภาษี (VAT/WHT) จาก lead ตามตัวชี้นี้',
                    'Overview แสดงแหล่ง CRM ของแต่ละ event ได้',
                    'Costs event เทียบราคาตกลง vs รายได้จริง',
                    'ลิงก์สองทาง — เปิด lead จาก event หรือเปิด event จาก lead',
                  ]}
            />
          </div>
        </div>

        {/* ── Payments calendar ───────────────────────────────────── */}
        <div id="crm-payments" className="scroll-mt-6">
          <SectionHeader
            icon={<Calendar className="h-4 w-4" />}
            title={isEn ? 'Payments calendar — /crm/payments' : 'ปฏิทินเงินเข้า — /crm/payments'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-3">
            <p className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
              {isEn
                ? 'Month-grid calendar showing every installment due date. Each cell shows leads + amounts; cells turn red when overdue.'
                : 'ปฏิทินรายเดือนแสดงงวดผ่อนทุกงวด — ช่องวันที่จะมีชื่อ lead + ยอด และเปลี่ยนสีแดงเมื่อเกินกำหนด'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="📅 ปฏิทินรายเดือน"
                titleEn="📅 Monthly grid"
                lines={isEn
                  ? [
                      'Click a date to open the leads with installment that day',
                      'Switch month with prev/next arrows',
                    ]
                  : [
                      'คลิกวันใดวันหนึ่ง → เห็นรายการ lead ที่มีงวดในวันนั้น',
                      'เลื่อนเดือนด้วยปุ่ม ◀ ▶',
                    ]}
              />
              <FeatureBlock
                titleTh="🚨 Highlights"
                titleEn="🚨 Highlights"
                lines={isEn
                  ? [
                      'Overdue installments — red badge',
                      'Paid installments — strike-through',
                      'Filter by lead / customer',
                    ]
                  : [
                      'งวดที่เกินกำหนด — badge สีแดง',
                      'งวดที่ชำระแล้ว — เส้นตัด',
                      'filter ตาม lead / ลูกค้าได้',
                    ]}
              />
            </div>
          </div>
        </div>

        {/* ── Archive ─────────────────────────────────────────────── */}
        <div id="crm-archive" className="scroll-mt-6">
          <SectionHeader
            icon={<FolderArchive className="h-4 w-4" />}
            title={isEn ? 'Archive — /crm/archive' : 'คลัง lead เก่า — /crm/archive'}
            color="rose"
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
            {isEn
              ? 'Soft-delete bin for leads you no longer want on the active board. Archived leads stay searchable, restorable, and keep their history. Use it for stale or rejected leads.'
              : 'ถังที่เก็บ lead ที่ไม่อยากให้ขึ้นบนบอร์ดหลัก แต่ยังค้นเจอ / restore กลับได้ + ประวัติยังอยู่ ใช้กับ lead ที่นิ่ง / ปฏิเสธ'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="📦 จัดการ"
              titleEn="📦 Manage"
              lines={isEn
                ? [
                    'Filter by source / customer type / tag',
                    'Search by name / phone / LINE',
                    'Restore puts the card back in its prior column',
                  ]
                : [
                    'filter ตามแหล่งที่มา / ประเภทลูกค้า / tag',
                    'ค้นด้วยชื่อ / เบอร์ / LINE',
                    'restore = การ์ดกลับไปอยู่คอลัมน์เดิม',
                  ]}
            />
            <FeatureBlock
              titleTh="🛡 ข้อมูลคงอยู่"
              titleEn="🛡 Data preserved"
              lines={isEn
                ? [
                    'Activity timeline kept',
                    'Installments + payment proofs kept',
                    'Linked event (if any) is unaffected',
                  ]
                : [
                    'Activity timeline ยังอยู่',
                    'งวดผ่อน + หลักฐานการชำระไม่ถูกลบ',
                    'event ที่ผูกอยู่ (ถ้ามี) ไม่ถูกกระทบ',
                  ]}
            />
          </div>
        </div>

        {/* ── Download / Export (admin) ───────────────────────────── */}
        <div id="crm-download" className="scroll-mt-6">
          <SectionHeader
            icon={<Download className="h-4 w-4" />}
            title={isEn ? 'Export — /crm/download (admin only)' : 'Export — /crm/download (admin)'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 p-4 space-y-2">
            <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed">
              {isEn
                ? 'Pick fields to include + status filter, then export to CSV / Excel. Useful for handing customer lists to accounting or marketing without giving them CRM access.'
                : 'เลือกคอลัมน์ + filter สถานะ → export CSV / Excel ใช้ส่งลิสต์ลูกค้าให้บัญชีหรือการตลาดโดยไม่ต้องเปิดสิทธิ์ CRM'}
            </p>
            <ul className="text-xs text-rose-800 dark:text-rose-300 space-y-1">
              <li className="flex items-start gap-2"><span className="text-rose-500">•</span><span>{isEn ? 'Field picker — choose only what you need' : 'เลือกเฉพาะคอลัมน์ที่ต้องการ'}</span></li>
              <li className="flex items-start gap-2"><span className="text-rose-500">•</span><span>{isEn ? 'Filter by status / source / date range' : 'filter สถานะ / แหล่งที่มา / ช่วงวันที่'}</span></li>
              <li className="flex items-start gap-2"><span className="text-rose-500">•</span><span>{isEn ? 'Batch export — handles large lists in pages' : 'รองรับลิสต์ใหญ่ — แบ่ง batch ให้'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Dashboard analytics ─────────────────────────────────── */}
        <div id="crm-dashboard" className="scroll-mt-6">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title={isEn ? 'Analytics dashboard — /crm/dashboard' : 'แดชบอร์ด — /crm/dashboard'}
            color="rose"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="📊 KPI หลัก"
              titleEn="📊 KPI cards"
              lines={isEn
                ? [
                    'Lead count by status',
                    'Conversion rate (lead → accepted)',
                    'Average deal size',
                    'Total committed revenue',
                  ]
                : [
                    'จำนวน lead ตามสถานะ',
                    'อัตราปิดงาน (lead → accepted)',
                    'ขนาดดีลเฉลี่ย',
                    'รายได้ที่ commit แล้ว',
                  ]}
            />
            <FeatureBlock
              titleTh="📈 กราฟ"
              titleEn="📈 Charts"
              lines={isEn
                ? [
                    'Leads by source (LINE / FB / IG / …)',
                    'Conversion funnel',
                    'Revenue by package',
                    'Monthly trend (lead in vs accepted)',
                  ]
                : [
                    'lead แยกตามแหล่งที่มา (LINE / FB / IG / …)',
                    'funnel การปิดงาน',
                    'รายได้แยกตาม package',
                    'แนวโน้มรายเดือน (lead เข้า vs ปิดได้)',
                  ]}
            />
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="crm-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'User' : 'User'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Other user' : 'user อื่น'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Admin' : 'Admin'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'View Kanban / dashboard / payments / archive' : 'ดู Kanban / dashboard / payments / archive'} owner="yes" other="yes" admin="yes" />
                <PermissionRow label={isEn ? 'Create lead' : 'สร้าง lead'} owner="yes" other="yes" admin="yes" />
                <PermissionRow label={isEn ? 'Edit lead detail' : 'แก้ lead'} owner="yes" other="yes" admin="yes" ownerNote={isEn ? 'team can edit any lead' : 'ทีมแก้ lead ของใครก็ได้'} />
                <PermissionRow label={isEn ? 'Add activity / @mention' : 'เพิ่ม activity / @mention'} owner="yes" other="yes" admin="yes" />
                <PermissionRow label={isEn ? 'Upload payment proof' : 'อัพโหลดหลักฐานการชำระ'} owner="yes" other="yes" admin="yes" />
                <PermissionRow label={isEn ? 'Archive / restore lead' : 'ย้ายเข้า/ออก archive'} owner="yes" other="yes" admin="yes" />
                <PermissionRow label={isEn ? 'Convert lead → event' : 'แปลง lead → event'} owner="yes" other="yes" admin="yes" ownerNote={isEn ? 'only when status = accepted' : 'เฉพาะ accepted'} />
                <PermissionRow label={isEn ? 'Export CSV (/crm/download)' : 'Export CSV (/crm/download)'} owner="no" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Manage settings (statuses, roles, tags)' : 'จัดการ settings (สถานะ / role / tag)'} owner="no" other="no" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Notifications ───────────────────────────────────────── */}
        <div id="crm-notifications" className="scroll-mt-6">
          <SectionHeader
            icon={<Bell className="h-4 w-4" />}
            title={isEn ? 'Notifications the system sends' : 'การแจ้งเตือนที่ระบบส่ง'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <NotifRow emoji="@" code="crm_mentioned" labelTh="ถูก @mention ในงาน lead" labelEn="You were @mentioned" toTh="คนที่ถูก @" toEn="Mentioned user(s)" isEn={isEn} />
          </div>
          <div className="mt-3 rounded-lg border border-rose-200/60 dark:border-rose-900/40 bg-white dark:bg-zinc-900 p-3">
            <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300 uppercase tracking-wider mb-1.5">
              {isEn ? 'How @mentions work' : 'วิธีใช้ @mention'}
            </p>
            <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
              <li className="flex items-start gap-2"><span className="text-rose-500">•</span><span>{isEn ? 'Type @ in any activity textarea — pick a teammate from the suggestion list' : 'พิมพ์ @ ในกล่อง activity → เลือกชื่อจาก suggestion'}</span></li>
              <li className="flex items-start gap-2"><span className="text-rose-500">•</span><span>{isEn ? 'They get an in-app notification with the lead name + a 200-char preview of your note' : 'คนที่ถูก mention จะได้แจ้งเตือนในแอป พร้อมชื่อ lead + ข้อความ preview 200 ตัวอักษร'}</span></li>
              <li className="flex items-start gap-2"><span className="text-rose-500">•</span><span>{isEn ? 'Click the notification → opens the lead detail at the activity timeline' : 'คลิกการแจ้งเตือน → เปิด lead detail พาไป activity'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Settings (admin) ────────────────────────────────────── */}
        <div id="crm-settings" className="scroll-mt-6">
          <SectionHeader
            icon={<Tag className="h-4 w-4" />}
            title={isEn ? 'Settings — /crm/settings (admin)' : 'ตั้งค่า — /crm/settings (admin)'}
            color="rose"
          />
          <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 p-4">
            <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed mb-3">
              {isEn
                ? 'Single page to manage every CRM dropdown. Each row has a label (Thai + English), color, sort order, optional price (for packages), and active toggle.'
                : 'หน้าเดียวจัดการ dropdown ทั้งหมดของ CRM — แต่ละแถวมี label (ไทย + อังกฤษ), สี, ลำดับ, ราคา (สำหรับ package), และ active toggle'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-rose-200/60 dark:border-rose-900/40 bg-white dark:bg-zinc-900 p-2.5">
                <p className="font-bold text-rose-700 dark:text-rose-300">{isEn ? 'Kanban statuses' : 'สถานะ Kanban'}</p>
                <p className="text-[11px] text-zinc-500">kanban_status</p>
              </div>
              <div className="rounded-lg border border-rose-200/60 dark:border-rose-900/40 bg-white dark:bg-zinc-900 p-2.5">
                <p className="font-bold text-rose-700 dark:text-rose-300">{isEn ? 'Packages' : 'แพ็กเกจ'}</p>
                <p className="text-[11px] text-zinc-500">package — has price</p>
              </div>
              <div className="rounded-lg border border-rose-200/60 dark:border-rose-900/40 bg-white dark:bg-zinc-900 p-2.5">
                <p className="font-bold text-rose-700 dark:text-rose-300">{isEn ? 'Customer types' : 'ประเภทลูกค้า'}</p>
                <p className="text-[11px] text-zinc-500">customer_type</p>
              </div>
              <div className="rounded-lg border border-rose-200/60 dark:border-rose-900/40 bg-white dark:bg-zinc-900 p-2.5">
                <p className="font-bold text-rose-700 dark:text-rose-300">{isEn ? 'Lead sources' : 'แหล่งที่มา'}</p>
                <p className="text-[11px] text-zinc-500">lead_source</p>
              </div>
              <div className="rounded-lg border border-rose-200/60 dark:border-rose-900/40 bg-white dark:bg-zinc-900 p-2.5">
                <p className="font-bold text-rose-700 dark:text-rose-300">{isEn ? 'Tags' : 'Tag'}</p>
                <p className="text-[11px] text-zinc-500">tag · tag_[status]</p>
              </div>
              <div className="rounded-lg border border-rose-200/60 dark:border-rose-900/40 bg-white dark:bg-zinc-900 p-2.5">
                <p className="font-bold text-rose-700 dark:text-rose-300">{isEn ? 'Staff roles' : 'role ของทีม'}</p>
                <p className="text-[11px] text-zinc-500">staff_role</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Menu shortcuts ──────────────────────────────────────── */}
        <div id="crm-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/crm"            labelEn="Kanban board"             labelTh="บอร์ด Kanban" />
            <MenuLink href="/crm/dashboard"  labelEn="Analytics dashboard"      labelTh="แดชบอร์ด / KPI" />
            <MenuLink href="/crm/payments"   labelEn="Payments calendar"        labelTh="ปฏิทินเงินเข้า" />
            <MenuLink href="/crm/archive"    labelEn="Archived leads"           labelTh="คลัง lead เก่า" />
            <MenuLink href="/crm/download"   labelEn="Export CSV (admin)"       labelTh="Export CSV (admin)" />
            <MenuLink href="/crm/settings"   labelEn="Settings (admin)"         labelTh="ตั้งค่า (admin)" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: EVENTS
          ════════════════════════════════════════════════════════════════ */}
      {view === 'events' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[2]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[2]} isEn={isEn} />

        {/* ── Intro ───────────────────────────────────────────────── */}
        <div id="events-intro" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-cyan-200 dark:border-cyan-900 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/20 dark:to-zinc-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-cyan-600 text-white">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-cyan-900 dark:text-cyan-200">
                  {isEn ? 'Events — client jobs in motion' : 'Events — งานลูกค้าที่กำลังทำ'}
                </p>
                <p className="text-[11px] text-cyan-700 dark:text-cyan-400">
                  {isEn
                    ? 'Each event is a real client job — link kits, staff, and check-ins to it.'
                    : 'แต่ละ event = งานลูกค้าจริง — ผูกชุดอุปกรณ์ ทีมงาน และเช็คอิน เข้าด้วยกัน'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Create / Edit are admin-only — gated server-side, page-level, and UI-level. Other actions (view list, kit check, return) are open to all staff.'
                  : 'สร้าง / แก้ไข สำหรับ admin เท่านั้น — กันทั้ง server action / หน้า / ปุ่ม UI ส่วนการกระทำอื่น (ดูรายการ, ตรวจของ, เช็คคืน) staff ทุกคนทำได้'}
              </p>
            </div>
          </div>
        </div>

        {/* ── End-to-end workflow ─────────────────────────────────── */}
        <div id="events-flow" className="scroll-mt-6 space-y-4">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'End-to-end workflow' : 'Flow ทั้งหมดของ event'}
            color="emerald"
          />
          <div className="flex flex-wrap items-center gap-2 text-[10px] p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="font-semibold text-zinc-500 uppercase tracking-wider">{isEn ? 'Legend' : 'สัญลักษณ์'}:</span>
            <LegendDot variant="user"    label={isEn ? 'Anyone' : 'ทุกคน'} />
            <LegendDot variant="admin"   label="Admin" />
            <LegendDot variant="decision" label={isEn ? 'Choice' : 'ทางเลือก'} />
            <LegendDot variant="success" label={isEn ? 'Done' : 'เสร็จ'} />
          </div>
          <FlowchartBox
            title={isEn ? 'From booking to closure' : 'จากปิดดีลจนคืนของ'}
            color="sky"
          >
            <FlowNode variant="start" emoji="🤝" title={isEn ? 'CRM lead = accepted' : 'CRM lead = accepted'} subtitle="/crm" />
            <FlowArrow />
            <FlowNode variant="admin" emoji="🎯" title={isEn ? 'Admin: create event from lead' : 'Admin: สร้าง event จาก lead'} subtitle="/events/new?from_crm={leadId}" tag={isEn ? 'prefilled' : 'pre-fill'} />
            <FlowArrow label={isEn ? 'or manual' : 'หรือสร้างเอง'} />
            <FlowNode variant="admin" emoji="🛠" title={isEn ? 'Assign kits + staff (by role)' : 'ผูกชุดอุปกรณ์ + ทีม (ตาม role)'} subtitle={isEn ? 'kits.event_id = event.id · event_staff junction' : 'kits.event_id = event.id · event_staff junction'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="✅" title={isEn ? 'Check-kits before going on-site' : 'ตรวจของก่อนไปหน้างาน'} subtitle="/events/[id]/check-kits" />
            <FlowArrow label={isEn ? 'on event day' : 'ถึงวันงาน'} />
            <FlowNode variant="user" emoji="📍" title={isEn ? 'Staff: on-site check-in' : 'Staff: เช็คอินหน้างาน'} subtitle="/check-in (type: on-site)" tag={isEn ? 'duties → salary slip' : 'ติ๊กหน้าที่ → สลิปเงินเดือน'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📷" title={isEn ? 'Return checklist + closure photos' : 'เช็คคืนของ + ถ่ายรูปปิดงาน'} subtitle="/events/[id]/return" />
            <FlowArrow />
            <FlowNode variant="success" emoji="📦" title={isEn ? 'Snapshot saved → event deleted' : 'เก็บ snapshot → event ถูกลบ'} subtitle="/events/event-closures" tag={isEn ? '60 days retention' : 'เก็บ 60 วัน'} />
          </FlowchartBox>
        </div>

        {/* ── Create / Edit ──────────────────────────────────────── */}
        <div id="events-create" className="scroll-mt-6">
          <SectionHeader
            icon={<Edit3 className="h-4 w-4" />}
            title={isEn ? 'Create / edit event (admin)' : 'สร้าง / แก้ไข event (admin)'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleCard
              role="admin"
              title={isEn ? 'Create from CRM (recommended)' : 'สร้างจาก CRM (แนะนำ)'}
              steps={isEn ? [
                { n: 1, label: 'Open accepted lead at /crm/[id]', tag: null },
                { n: 2, label: 'Click "Create Event"', tag: null },
                { n: 3, label: 'System pre-fills name, date, location, VAT/WHT (staff starts empty)', tag: 'prefill' },
                { n: 4, label: 'Add staff + roles for THIS event, pick kits to assign', tag: null },
                { n: 5, label: 'Save → events.crm_lead_id linked + staff saved to event_staff', tag: 'per-event' },
              ] : [
                { n: 1, label: 'เปิด lead ที่ accepted แล้วที่ /crm/[id]', tag: null },
                { n: 2, label: 'กดปุ่ม "สร้าง Event"', tag: null },
                { n: 3, label: 'ระบบ pre-fill ชื่อ / วันที่ / สถานที่ / VAT-WHT (ทีมเริ่มว่าง)', tag: 'prefill' },
                { n: 4, label: 'เพิ่มทีม + role สำหรับ event นี้ + เลือกชุดอุปกรณ์ (kits)', tag: null },
                { n: 5, label: 'บันทึก → events.crm_lead_id ถูกผูก + staff เก็บใน event_staff', tag: 'แยกต่อ event' },
              ]}
            />
            <RoleCard
              role="admin"
              title={isEn ? 'Create manually' : 'สร้างเอง (ไม่ใช้ CRM)'}
              steps={isEn ? [
                { n: 1, label: 'Go to /events/new (admin only)', tag: null },
                { n: 2, label: 'Fill name, location, event_date', tag: null },
                { n: 3, label: 'Pick staff by role (sale / graphic / photographer / …)', tag: 'event_staff junction' },
                { n: 4, label: 'Pick kits to assign', tag: null },
                { n: 5, label: 'Save', tag: null },
              ] : [
                { n: 1, label: 'ไปหน้า /events/new (admin เท่านั้น)', tag: null },
                { n: 2, label: 'กรอกชื่อ / สถานที่ / วันที่งาน', tag: null },
                { n: 3, label: 'เลือกทีมตาม role (sale / graphic / photographer / …)', tag: 'event_staff junction' },
                { n: 4, label: 'เลือก kits ที่จะใช้', tag: null },
                { n: 5, label: 'บันทึก', tag: null },
              ]}
            />
          </div>
          <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
            <span className="text-lg leading-none">💡</span>
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">{isEn ? 'Edit caveat' : 'ข้อควรรู้ตอนแก้ไข'}</p>
              <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                {isEn
                  ? 'When editing kit assignments, items currently in_use are reset to available before re-assigning. If you swap kits mid-event, expect items to flicker through "available" briefly — this is intentional, not a bug.'
                  : 'ตอนแก้รายการ kits ระบบจะ reset item ที่ in_use กลับเป็น available ก่อน แล้วค่อยผูกใหม่ — ถ้าเปลี่ยน kit ระหว่างงาน item จะกลับเป็น available ชั่วคราว เป็น behavior ที่ตั้งใจ'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Check-kits ──────────────────────────────────────────── */}
        <div id="events-check-kits" className="scroll-mt-6">
          <SectionHeader
            icon={<CheckCircle2 className="h-4 w-4" />}
            title={isEn ? 'Check-kits — verify before on-site' : 'ตรวจของก่อนไปหน้างาน'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-cyan-200 dark:border-cyan-900 bg-cyan-50/40 dark:bg-cyan-950/20 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Open /events/[id]/check-kits to see every kit attached to this event. Click a kit → opens /kits/[id]/check?eventId=… — bulk-checkout all items at once with a click.'
                : 'เปิด /events/[id]/check-kits เพื่อดูชุดอุปกรณ์ทุก kit ที่ผูกกับ event นี้ — คลิก kit ใดก็ได้จะพาไป /kits/[id]/check?eventId=… ให้กด checkout ครบทุก item ในชุดด้วยคลิกเดียว'}
            </p>
            <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2"><span className="text-cyan-500">•</span><span>{isEn ? 'Available to all staff (not admin-only)' : 'staff ทุกคนเข้าได้ (ไม่ admin-only)'}</span></li>
              <li className="flex items-start gap-2"><span className="text-cyan-500">•</span><span>{isEn ? 'Checkout marks items.status = in_use' : 'Checkout จะ set items.status = in_use'}</span></li>
              <li className="flex items-start gap-2"><span className="text-cyan-500">•</span><span>{isEn ? 'Each item logged with timestamp + actor' : 'ทุก item ถูก log เวลา + ผู้กระทำ'}</span></li>
              <li className="flex items-start gap-2"><span className="text-cyan-500">•</span><span>{isEn ? 'Kit detail page shows photos for visual confirmation' : 'หน้า kit detail แสดงรูป item ช่วย confirm ก่อนหยิบ'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Return / closure ────────────────────────────────────── */}
        <div id="events-return" className="scroll-mt-6">
          <SectionHeader
            icon={<FolderArchive className="h-4 w-4" />}
            title={isEn ? 'Return checklist + closure' : 'เช็คคืนของ + ปิดงาน'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3">
            <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
              {isEn
                ? 'When the event is over, /events/[id]/return is the single screen that closes everything. For each item, pick a condition; attach up to 15 closure photos; submit.'
                : 'งานเสร็จแล้วใช้ /events/[id]/return ปิดงานในหน้าเดียว — เลือกสภาพ item แต่ละชิ้น แนบรูปได้สูงสุด 15 รูป กดบันทึก'}
            </p>

            <div className="overflow-x-auto rounded-xl border border-emerald-200/60 dark:border-emerald-900/40 bg-white dark:bg-zinc-900">
              <table className="w-full text-sm">
                <thead className="bg-emerald-50 dark:bg-emerald-950/30 text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Pick condition' : 'เลือกสภาพ'}</th>
                    <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Item status becomes' : 'item.status จะเป็น'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                  <tr><td className="px-3 py-2 text-xs">✓ {isEn ? 'Good' : 'ของดี'}</td><td className="px-3 py-2 text-xs"><code className="font-mono text-emerald-600">available</code></td></tr>
                  <tr><td className="px-3 py-2 text-xs">⚠ {isEn ? 'Damaged' : 'เสียหาย'}</td><td className="px-3 py-2 text-xs"><code className="font-mono text-amber-600">maintenance</code></td></tr>
                  <tr><td className="px-3 py-2 text-xs">❌ {isEn ? 'Lost' : 'หาย'}</td><td className="px-3 py-2 text-xs"><code className="font-mono text-red-600">lost</code></td></tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-emerald-200/60 dark:border-emerald-900/40 bg-white dark:bg-zinc-900 p-3">
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-2">
                {isEn ? 'What submit does' : 'ตอนกดบันทึก ระบบทำอะไรบ้าง'}
              </p>
              <ol className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300 list-decimal list-inside">
                <li>{isEn ? 'Snapshot kits + items + photos → event_closures.kits_snapshot' : 'เก็บ snapshot ชุด kit + item + รูป → event_closures.kits_snapshot'}</li>
                <li>{isEn ? 'Batch update each item.status by condition picked' : 'อัปเดต items.status ทุกตัวตามสภาพที่เลือก (batch)'}</li>
                <li>{isEn ? 'Release all kits — kits.event_id = null' : 'ปลด kit ทั้งหมด — kits.event_id = null'}</li>
                <li>{isEn ? 'Delete the event row entirely' : 'ลบ event row นี้ทิ้ง'}</li>
                <li>{isEn ? 'Cascade-remove this event’s staff (event_staff) — the CRM lead keeps its other events' : 'ลบทีมของ event นี้อัตโนมัติ (event_staff cascade) — lead ใน CRM ยังเก็บ event อื่นไว้'}</li>
              </ol>
            </div>

            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'The event is permanently deleted after submit — only the closure snapshot remains. Closures older than 60 days are auto-cleaned (records + photos).'
                  : 'event row จะถูกลบถาวรทันทีหลังบันทึก — เหลือแค่ snapshot ใน event_closures เท่านั้น และ closure ที่เก่ากว่า 60 วันจะถูกลบอัตโนมัติ (record + รูป)'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Calendar ────────────────────────────────────────────── */}
        <div id="events-calendar" className="scroll-mt-6">
          <SectionHeader
            icon={<Calendar className="h-4 w-4" />}
            title={isEn ? 'Calendar — /events/calendar' : 'ปฏิทิน — /events/calendar'}
            color="emerald"
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
            {isEn
              ? 'A month/week calendar showing all active events plus closed events from event_closures. Useful for spotting busy weeks and looking back at past jobs.'
              : 'ปฏิทินรายเดือน/สัปดาห์ รวมทั้ง event ที่ active และ event ที่ปิดแล้วจาก event_closures — ใช้ดูสัปดาห์ที่งานเยอะ + ย้อนดูงานเก่า'}
          </p>
        </div>

        {/* ── Closures archive ────────────────────────────────────── */}
        <div id="events-closures" className="scroll-mt-6">
          <SectionHeader
            icon={<History className="h-4 w-4" />}
            title={isEn ? 'Closures archive — /events/event-closures' : 'คลังงานที่ปิดแล้ว — /events/event-closures'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="📦 มีอะไรบ้าง"
              titleEn="📦 What's in here"
              lines={isEn
                ? [
                    'Every closed event with date + name + location',
                    'Snapshot of kits & items at closure time',
                    'Closure photos (15 max per closure)',
                    'Who closed it (closed_by)',
                  ]
                : [
                    'ทุก event ที่ปิดแล้ว พร้อมวันที่ + ชื่อ + สถานที่',
                    'snapshot ของ kit + item ตอนปิด',
                    'รูป closure (สูงสุด 15 รูป/งาน)',
                    'ผู้ปิดงาน (closed_by)',
                  ]}
            />
            <FeatureBlock
              titleTh="🧹 60-day auto-clean"
              titleEn="🧹 60-day auto-clean"
              lines={isEn
                ? [
                    'Closures older than 60 days are auto-deleted',
                    'Storage photos in event_closures bucket also deleted',
                    'Export anything you want to keep before then',
                  ]
                : [
                    'closure ที่เก่ากว่า 60 วันถูกลบอัตโนมัติ',
                    'รูปใน bucket event_closures ก็ถูกลบ',
                    'อยากเก็บอะไรไว้ → export ก่อนครบ 60 วัน',
                  ]}
            />
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="events-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Staff' : 'staff'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'View list / calendar / closures' : 'ดูรายการ / ปฏิทิน / closures'} owner="yes" other="yes" admin="yes" />
                <PermissionRow label={isEn ? 'Create event' : 'สร้าง event'} owner="no" other="no" admin="yes" adminNote={isEn ? 'gated 3 layers' : 'กัน 3 ชั้น'} />
                <PermissionRow label={isEn ? 'Edit event' : 'แก้ไข event'} owner="no" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Link / unlink CRM' : 'ผูก / ปลด CRM'} owner="no" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Check-kits before on-site' : 'ตรวจของก่อน on-site'} owner="yes" other="yes" admin="yes" />
                <PermissionRow label={isEn ? 'Submit return / closure' : 'เช็คคืน / ปิดงาน'} owner="yes" other="yes" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Linked modules ──────────────────────────────────────── */}
        <div id="events-linked" className="scroll-mt-6">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Linked modules' : 'ผูกกับโมดูลอื่น'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock titleTh="🤝 CRM" titleEn="🤝 CRM" lines={isEn ? ['Lead → event prefill (one-click)', 'events.crm_lead_id (1 lead → N events)', 'Staff per event via event_staff'] : ['Lead → event pre-fill ปุ่มเดียว', 'events.crm_lead_id (1 lead → N events)', 'ทีมแยกต่อ event ผ่าน event_staff']} />
            <FeatureBlock titleTh="📍 Check-in" titleEn="📍 Check-in" lines={isEn ? ['On-site session picks an event from today', 'sessions.event_id stamped', 'Duties ticked at check-in feed the salary slip (no auto expense claim)'] : ['session on-site เลือก event ของวันนี้', 'sessions.event_id ถูก stamp', 'หน้าที่ที่ติ๊กตอนเช็คอินไปคิดในสลิปเงินเดือน (ไม่สร้างใบเบิกอัตโนมัติแล้ว)']} />
            <FeatureBlock titleTh="📦 Stock / Kits" titleEn="📦 Stock / Kits" lines={isEn ? ['kits.event_id = event.id when assigned', 'Items flip to in_use on checkout', 'Items flip back via return checklist'] : ['kits.event_id = event.id เมื่อผูก', 'item เปลี่ยนเป็น in_use ตอน checkout', 'item เปลี่ยนกลับผ่าน return checklist']} />
            <FeatureBlock titleTh="💰 Costs / Finance" titleEn="💰 Costs / Finance" lines={isEn ? ['job_cost_events.source_event_id (nullable)', 'expense_claims tied via job_event_id', 'VAT / WHT inherited from CRM lead'] : ['job_cost_events.source_event_id (ไม่บังคับ)', 'ใบเบิกผูกผ่าน job_event_id', 'VAT / WHT ตามที่ตั้งใน CRM lead']} />
          </div>
        </div>

        {/* ── Menu shortcuts ──────────────────────────────────────── */}
        <div id="events-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/events"                 labelEn="Events list"                  labelTh="รายการ events" />
            <MenuLink href="/events/new"             labelEn="Create event (admin)"         labelTh="สร้าง event (admin)" />
            <MenuLink href="/events/calendar"        labelEn="Calendar view"                labelTh="ปฏิทิน" />
            <MenuLink href="/events/event-closures"  labelEn="Closed events archive"        labelTh="คลังงานที่ปิดแล้ว" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: JOBS
          ════════════════════════════════════════════════════════════════ */}
      {view === 'jobs' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[3]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[3]} isEn={isEn} />

        {/* ── Intro ───────────────────────────────────────────────── */}
        <div id="jobs-intro" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-zinc-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-600 text-white">
                <Briefcase className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  {isEn ? 'Jobs — work tickets for the team' : 'Jobs — งานที่ทีมต้องทำ'}
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  {isEn
                    ? 'Two boards: shared system board (graphic + on-site) and your private board (my-job).'
                    : 'มี 2 บอร์ด — บอร์ดทีม (graphic + on-site) และบอร์ดส่วนตัวของคุณ (my-job)'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── System board ────────────────────────────────────────── */}
        <div id="jobs-system" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? 'System board — /jobs (Kanban for the team)' : 'บอร์ดทีม — /jobs (Kanban)'}
            color="amber"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TypeCard
              emoji="🎨"
              title={isEn ? 'Graphic jobs' : 'งาน Graphic'}
              subtitle="job_type: graphic"
              desc={isEn ? 'Design tasks. Statuses configurable per studio (e.g. pending → in_progress → review → done).' : 'งานออกแบบ — สถานะแก้ใน /jobs/settings ได้ (ตัวอย่าง: pending → in_progress → review → done)'}
              receipt={isEn ? 'Drag to move' : 'ลากย้าย'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="📍"
              title={isEn ? 'On-site jobs' : 'งาน On-site'}
              subtitle="job_type: onsite"
              desc={isEn ? 'Field jobs (event prep, setup, dispatch). Pulls customer + event date/location from CRM.' : 'งานหน้างาน (เตรียมอีเวนต์ / setup / dispatch) — ดึง customer + วันที่ / สถานที่ จาก CRM'}
              receipt={isEn ? 'Linked to CRM' : 'ผูกกับ CRM'}
              receiptColor="emerald"
            />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="🃏 บนการ์ด"
              titleEn="🃏 On each card"
              lines={isEn ? ['Title · customer · due date', 'Assigned avatars (multi-user)', 'Tag chips · priority badge', 'Hover → drag handle visible'] : ['ชื่อ · ลูกค้า · ครบกำหนด', 'avatar ทีม (หลายคน)', 'tag chips · ป้าย priority', 'hover เพื่อเห็น drag handle']}
            />
            <FeatureBlock
              titleTh="🚚 ลากย้าย"
              titleEn="🚚 Drag-drop"
              lines={isEn ? ['Drag card across status columns', 'Optimistic UI — reverts on error', 'Logs activity + notifies team', 'Status set defined in /jobs/settings'] : ['ลากการ์ดข้ามคอลัมน์', 'Optimistic UI — ถ้า error ระบบ revert ให้', 'log activity + แจ้งทีม', 'ชุดสถานะตั้งใน /jobs/settings']}
            />
          </div>
        </div>

        {/* ── My-Job (personal) ───────────────────────────────────── */}
        <div id="jobs-my-job" className="scroll-mt-6">
          <SectionHeader
            icon={<User className="h-4 w-4" />}
            title={isEn ? 'My Job — your private board (/jobs/my-job)' : 'บอร์ดส่วนตัว — /jobs/my-job'}
            color="amber"
          />
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Your own task board, separate from the system board. Two pipelines: Personal (life stuff) and Work. Only you can see your own; admin can spy via /jobs/admin-job?user={id}.'
                : 'บอร์ดงานของคุณเอง แยกจากบอร์ดทีม — มี 2 pipeline: Personal (เรื่องส่วนตัว) และ Work — คนอื่นมองไม่เห็น admin ดูได้ผ่าน /jobs/admin-job?user={id}'}
            </p>
            <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2"><span className="text-amber-500">•</span><span>{isEn ? 'Customize your own statuses in /jobs/my-job/settings' : 'ตั้งสถานะของตัวเองได้ใน /jobs/my-job/settings'}</span></li>
              <li className="flex items-start gap-2"><span className="text-amber-500">•</span><span>{isEn ? 'Drag-drop, tags, priority — same as the system board' : 'ลากย้าย / tag / priority — เหมือนบอร์ดทีม'}</span></li>
              <li className="flex items-start gap-2"><span className="text-amber-500">•</span><span>{isEn ? 'No notifications go out (private)' : 'ไม่มีการแจ้งเตือน (เป็นส่วนตัว)'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Tickets ─────────────────────────────────────────────── */}
        <div id="jobs-tickets" className="scroll-mt-6">
          <SectionHeader
            icon={<MessageCircle className="h-4 w-4" />}
            title={isEn ? 'Tickets — internal support requests' : 'Tickets — คำขอภายในทีม'}
            color="amber"
          />
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-4 space-y-3">
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              {isEn
                ? 'A separate tab in /jobs (Tickets switch) for internal staff requests/issues. Has its own Kanban with category, priority, threaded replies, emoji reactions, and file attachments (≤50MB).'
                : 'แท็บ Tickets ภายใน /jobs สำหรับคำขอ / ปัญหาภายในทีม — มี Kanban ของตัวเอง พร้อม category / priority / reply เป็น thread / emoji reaction / แนบไฟล์ ≤50MB'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="🧵 thread reply"
                titleEn="🧵 Threaded replies"
                lines={isEn
                  ? [
                      'Reply textarea with @mention',
                      'First reply auto-advances open → answered',
                      'All replies notify creator + assignees',
                      '@mentions also notify the tagged user',
                    ]
                  : [
                      'reply textarea + @mention',
                      'reply แรกเปลี่ยน open → answered อัตโนมัติ',
                      'ทุก reply แจ้ง creator + assignees',
                      '@mention แจ้งคนที่ถูก tag ด้วย',
                    ]}
              />
              <FeatureBlock
                titleTh="😀 reaction + แนบไฟล์"
                titleEn="😀 Reactions + files"
                lines={isEn
                  ? [
                      'React with native or custom emoji',
                      'Attach PDF / images / docs ≤50MB',
                      'Auto desired_outcome field for outcome capture',
                      'Closed → closed_at stamped',
                    ]
                  : [
                      'react ด้วย emoji ปกติ หรือ custom',
                      'แนบ PDF / รูป / เอกสาร ≤50MB',
                      'มีช่อง desired_outcome เก็บผลลัพธ์ที่อยาก',
                      'ปิด ticket → stamp closed_at',
                    ]}
              />
            </div>
          </div>
        </div>

        {/* ── Bulk-create from CRM ────────────────────────────────── */}
        <div id="jobs-from-crm" className="scroll-mt-6">
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            title={isEn ? 'Bulk-create from CRM lead' : 'สร้าง 2 jobs จาก CRM lead'}
            color="amber"
          />
          <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'On the CRM lead detail page, click "Create jobs" → spawns 2 linked jobs at once: 1 graphic + 1 on-site. Both pre-filled with customer name, event date/location, and team assignments from the lead.'
                : 'ที่หน้า CRM lead detail กดปุ่ม "Create jobs" → ระบบสร้าง 2 job พร้อมกัน: graphic 1 + onsite 1 — ทั้งคู่ pre-fill ลูกค้า / วันที่ / สถานที่ / ทีม จาก lead'}
            </p>
          </div>
        </div>

        {/* ── Archive + Report ────────────────────────────────────── */}
        <div id="jobs-archive-report" className="scroll-mt-6">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title={isEn ? 'Archive + report' : 'archive + report'}
            color="amber"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="📦 /jobs/archive"
              titleEn="📦 /jobs/archive"
              lines={isEn
                ? [
                    'Archived jobs + tickets (soft-delete)',
                    'Restore button puts the card back in its original column',
                    'Search + filter by date / type / customer',
                  ]
                : [
                    'job + ticket ที่ archive แล้ว (soft-delete)',
                    'restore = การ์ดกลับไปอยู่คอลัมน์เดิม',
                    'ค้น + filter วันที่ / ประเภท / ลูกค้า',
                  ]}
            />
            <FeatureBlock
              titleTh="📊 /jobs/report"
              titleEn="📊 /jobs/report"
              lines={isEn
                ? [
                    'Monthly trend (tickets opened / closed)',
                    'Breakdown by category and priority',
                    'Avg resolution time',
                    'Top creators / responders',
                  ]
                : [
                    'แนวโน้มรายเดือน (ticket เปิด / ปิด)',
                    'แยกตาม category + priority',
                    'เวลาเฉลี่ยที่แก้สำเร็จ',
                    'ผู้สร้าง / ผู้ตอบ ยอดสูงสุด',
                  ]}
            />
          </div>
        </div>

        {/* ── Notifications ───────────────────────────────────────── */}
        <div id="jobs-notifications" className="scroll-mt-6">
          <SectionHeader
            icon={<Bell className="h-4 w-4" />}
            title={isEn ? 'Notifications the system sends' : 'การแจ้งเตือนที่ระบบส่ง'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <NotifRow emoji="📌" code="job_assigned"          labelTh="ถูกมอบหมาย job"          labelEn="Job assigned to you"          toTh="คนที่ถูก assign"  toEn="New assignees"           isEn={isEn} />
            <NotifRow emoji="🔁" code="job_status_changed"    labelTh="status เปลี่ยน"          labelEn="Job status changed"           toTh="ทีม + creator"     toEn="Assigned + creator"      isEn={isEn} />
            <NotifRow emoji="@"  code="job_mentioned"         labelTh="ถูก @mention ใน job"     labelEn="@mentioned in job"            toTh="คนที่ถูก @"        toEn="Mentioned user"          isEn={isEn} />
            <NotifRow emoji="💬" code="job_comment"           labelTh="comment ใหม่บน job"      labelEn="New comment on job"           toTh="ทีม + creator"     toEn="Assigned + creator"      isEn={isEn} />
            <NotifRow emoji="🔄" code="ticket_status_changed" labelTh="status ticket เปลี่ยน"   labelEn="Ticket status changed"        toTh="ทีม + creator"     toEn="Assigned + creator"      isEn={isEn} />
            <NotifRow emoji="↩️" code="ticket_reply"          labelTh="reply ใหม่บน ticket"     labelEn="New ticket reply"             toTh="participants"      toEn="Participants + @-tagged" isEn={isEn} />
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="jobs-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'User' : 'User'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'View system board' : 'ดูบอร์ดทีม'}                       owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Create / move / comment on system jobs' : 'สร้าง / ย้าย / comment บอร์ดทีม'} owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'My-Job board (private)' : 'บอร์ดส่วนตัว my-job'}        owner="yes" other="no"  admin="yes" adminNote={isEn ? 'spy via admin-job' : 'ดูคนอื่นได้ผ่าน admin-job'} />
                <PermissionRow label={isEn ? 'Tickets — create / reply / react' : 'Tickets — สร้าง / reply / react'}        owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Archive / restore jobs' : 'archive / restore jobs'}      owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Reports' : 'รายงาน'}                                     owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Settings — types / statuses / emoji / checklists' : 'Settings — ชนิด / สถานะ / emoji / checklist'} owner="no" other="no" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Menu shortcuts ──────────────────────────────────────── */}
        <div id="jobs-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/jobs"                  labelEn="Team Kanban"                labelTh="บอร์ดทีม Kanban" />
            <MenuLink href="/jobs/my-job"           labelEn="My Job (private)"           labelTh="บอร์ดส่วนตัวของฉัน" />
            <MenuLink href="/jobs/admin-job"        labelEn="Admin: any user's board"    labelTh="admin: ดูบอร์ดของคนอื่น" />
            <MenuLink href="/jobs/archive"          labelEn="Archive"                    labelTh="archive" />
            <MenuLink href="/jobs/report"           labelEn="Ticket report"              labelTh="รายงาน ticket" />
            <MenuLink href="/jobs/settings"         labelEn="Settings (admin)"           labelTh="ตั้งค่า (admin)" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: STOCK
          ════════════════════════════════════════════════════════════════ */}
      {view === 'stock' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[4]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[4]} isEn={isEn} />

        {/* ── Intro ───────────────────────────────────────────────── */}
        <div id="stock-intro" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-zinc-700 dark:bg-zinc-600 text-white">
                <Package className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                  {isEn ? 'Stock — physical inventory' : 'Stock — คลังอุปกรณ์จริง'}
                </p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                  {isEn
                    ? 'Items (single units), kits (bundles for events), and templates (reusable kit recipes).'
                    : 'items (อุปกรณ์ทีละชิ้น) · kits (ชุดสำหรับงาน) · templates (สูตร kit ที่กลับมาใช้ใหม่ได้)'}
                </p>
              </div>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <NewItem icon={<Boxes className="h-3.5 w-3.5" />}        titleTh="📋 items"          titleEn="📋 items"          descTh="อุปกรณ์ทีละชิ้น มี serial / รูป / สถานะ"     descEn="Single units with serial / photos / status"   isEn={isEn} />
              <NewItem icon={<Package className="h-3.5 w-3.5" />}      titleTh="🎁 kits"           titleEn="🎁 kits"           descTh="ชุดที่จับไปงาน — ผูกกับ event"               descEn="Bundles dispatched to events"                  isEn={isEn} />
              <NewItem icon={<ClipboardList className="h-3.5 w-3.5" />}titleTh="📝 templates"      titleEn="📝 templates"      descTh="example-kits — สูตรไว้ clone หรือ checklist"  descEn="example-kits — recipe to clone or checklist"   isEn={isEn} />
            </ul>
          </div>
        </div>

        {/* ── Item statuses ───────────────────────────────────────── */}
        <div id="stock-statuses" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? '7 item statuses' : '7 สถานะของ item'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Status' : 'สถานะ'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Meaning' : 'ความหมาย'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <StatusRow emoji="✅" color="#22c55e" label={isEn ? 'available' : 'พร้อมใช้'}     code="available"     meaning={isEn ? 'In stock, ready to assign to a kit' : 'อยู่ในคลัง พร้อมผูกเข้า kit'} />
                <StatusRow emoji="🚚" color="#0ea5e9" label={isEn ? 'in_use' : 'กำลังใช้งาน'}    code="in_use"        meaning={isEn ? 'Currently dispatched to an active event' : 'อยู่ในงานที่ active ตอนนี้'} />
                <StatusRow emoji="🛠"  color="#f59e0b" label={isEn ? 'maintenance' : 'ซ่อมบำรุง'} code="maintenance"   meaning={isEn ? 'Damaged or scheduled for repair' : 'เสียหาย หรือเตรียมซ่อม'} />
                <StatusRow emoji="❌" color="#ef4444" label={isEn ? 'lost' : 'หาย'}              code="lost"          meaning={isEn ? 'Reported missing' : 'แจ้งว่าหาย'} />
                <StatusRow emoji="💥" color="#dc2626" label={isEn ? 'damaged' : 'เสียหายหนัก'}    code="damaged"       meaning={isEn ? 'Beyond quick repair' : 'ซ่อมไม่ไหวแล้ว'} />
                <StatusRow emoji="🛒" color="#8b5cf6" label={isEn ? 'purchasing' : 'กำลังจัดซื้อ'} code="purchasing"   meaning={isEn ? 'On order, not yet delivered' : 'สั่งแล้วแต่ยังไม่มาถึง'} />
                <StatusRow emoji="🚫" color="#94a3b8" label={isEn ? 'out_of_stock' : 'ของหมด'}    code="out_of_stock"  meaning={isEn ? 'Depleted, none in stock' : 'หมดสต๊อก'} />
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              {isEn
                ? 'Statuses move automatically: kit checkout → in_use; return checklist → available / maintenance / lost. You only set them by hand for special cases (purchasing, out_of_stock, damaged).'
                : 'สถานะส่วนใหญ่เปลี่ยนอัตโนมัติ — checkout kit → in_use ; เช็คคืนของ → available / maintenance / lost ส่วนที่ต้องตั้งเองคือกรณีพิเศษ (purchasing, out_of_stock, damaged)'}
            </p>
          </div>
        </div>

        {/* ── Kit lifecycle ───────────────────────────────────────── */}
        <div id="stock-kit-lifecycle" className="scroll-mt-6">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Kit lifecycle' : 'วงจรชีวิตของ kit'}
            color="emerald"
          />
          <FlowchartBox
            title={isEn ? 'Create → deploy → return → reuse' : 'สร้าง → ส่งงาน → คืน → ใช้ซ้ำ'}
            color="sky"
          >
            <FlowNode variant="user"  emoji="🆕" title={isEn ? 'Create kit at /kits/new' : 'สร้าง kit ที่ /kits/new'} subtitle={isEn ? 'name + description, no items yet' : 'ใส่ชื่อ + description, ยังไม่มี item'} tag="event_id = null" />
            <FlowArrow />
            <FlowNode variant="user"  emoji="➕" title={isEn ? 'Add items at /kits/[id]' : 'เพิ่ม item ที่ /kits/[id]'} subtitle={isEn ? 'one item per kit (no duplicates)' : 'item ละ kit (ห้ามซ้ำ)'} />
            <FlowArrow />
            <FlowNode variant="admin" emoji="🎯" title={isEn ? 'Booked to an event via its packing list' : 'ผูกกับ event ผ่านใบจัดของ'} subtitle={isEn ? 'no more direct kit booking in the event form' : 'ฟอร์มอีเวนต์ไม่มีช่องจองกระเป๋าแล้ว'} tag="kits.event_id = event.id" />
            <FlowArrow />
            <FlowNode variant="user"  emoji="✅" title={isEn ? 'Check-out at /kits/[id]/check' : 'check-out ที่ /kits/[id]/check'} subtitle={isEn ? 'bulk-mark all selected as in_use' : 'กดทีเดียว set in_use ทุก item ที่เลือก'} />
            <FlowArrow label={isEn ? 'event runs' : 'งานดำเนิน...'} />
            <FlowNode variant="user"  emoji="🔁" title={isEn ? 'Check-in at /kits/[id]/check' : 'check-in ที่ /kits/[id]/check'} subtitle={isEn ? 'pick condition per item: good / damaged / lost' : 'เลือกสภาพ item: good / damaged / lost'} />
            <FlowArrow />
            <FlowNode variant="success" emoji="🆓" title={isEn ? 'Released — back in pool' : 'ปลดล็อก — กลับเข้าคลัง'} subtitle={isEn ? 'kits.event_id = null when event return is submitted' : 'kits.event_id = null เมื่อปิดงาน'} tag={isEn ? 'reusable' : 'พร้อมใช้ใหม่'} />
          </FlowchartBox>
        </div>

        {/* ── Check-out / Check-in ────────────────────────────────── */}
        <div id="stock-check" className="scroll-mt-6">
          <SectionHeader
            icon={<ArrowDownToLine className="h-4 w-4" />}
            title={isEn ? 'Check-out & check-in — /kits/[id]/check' : 'Check-out + check-in — /kits/[id]/check'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border-2 border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpFromLine className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <p className="text-sm font-bold text-sky-900 dark:text-sky-200">{isEn ? 'Check-out' : 'Check-out (เบิกของ)'}</p>
              </div>
              <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                <li className="flex items-start gap-2"><span className="text-sky-500">•</span><span>{isEn ? 'Pick the event from dropdown' : 'เลือก event จาก dropdown'}</span></li>
                <li className="flex items-start gap-2"><span className="text-sky-500">•</span><span>{isEn ? 'Multi-select items via checkboxes' : 'กา ☑ item ที่จะเบิก (เลือกได้หลายอัน)'}</span></li>
                <li className="flex items-start gap-2"><span className="text-sky-500">•</span><span>{isEn ? 'Click "Checkout" → all flip to in_use' : 'กด "Checkout" → ทุก item ที่เลือกกลายเป็น in_use'}</span></li>
                <li className="flex items-start gap-2"><span className="text-sky-500">•</span><span>{isEn ? 'Each item logged with timestamp + actor' : 'ทุก item ถูก log เวลา + ผู้กระทำ'}</span></li>
              </ul>
            </div>
            <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownToLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{isEn ? 'Check-in' : 'Check-in (คืนของ)'}</p>
              </div>
              <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>{isEn ? 'Per-item: pick condition (good / damaged / lost)' : 'ของแต่ละชิ้น: เลือกสภาพ (good / damaged / lost)'}</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>{isEn ? 'good → available · damaged → maintenance · lost → lost' : 'good → available · damaged → maintenance · lost → lost'}</span></li>
                <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>{isEn ? 'Logs the condition per item for audit' : 'log สภาพของแต่ละ item เก็บไว้ audit'}</span></li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── QR Print ────────────────────────────────────────────── */}
        <div id="stock-qr" className="scroll-mt-6">
          <SectionHeader
            icon={<QrCode className="h-4 w-4" />}
            title={isEn ? 'QR print — /kits/[id]/print' : 'พิมพ์ QR — /kits/[id]/print'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-2">
            <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Generate a 450×450px white card with kit name + QR. Download as PNG → print and stick on the case. On-site, scan with phone → opens /kits/[id]/check straight to the action.'
                : 'สร้างการ์ดขาว 450×450px มีชื่อ kit + QR — download เป็น PNG ไปติดที่กล่องเครื่อง หน้างานสแกนด้วยมือถือ → เปิด /kits/[id]/check ไปทำงานต่อทันที'}
            </p>
            <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
              <li className="flex items-start gap-2"><Printer className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" /><span>{isEn ? 'Click Download → PNG file in your downloads folder' : 'กด Download → ได้ไฟล์ PNG ใน Downloads'}</span></li>
              <li className="flex items-start gap-2"><QrCode className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" /><span>{isEn ? 'QR encodes /kits/[id]/check?eventId=… (or just /kits/[id]/check)' : 'QR ฝัง URL /kits/[id]/check?eventId=… (หรือแค่ /kits/[id]/check)'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Templates / example-kits ────────────────────────────── */}
        <div id="stock-templates" className="scroll-mt-6">
          <SectionHeader
            icon={<ClipboardList className="h-4 w-4" />}
            title={isEn ? 'Templates — /example-kits' : 'Templates — /example-kits'}
            color="emerald"
          />
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Templates are kit recipes — a list of item names + quantities (decoupled from the items table). Use them to plan packing without locking actual items, or as a checklist before the event.'
                : 'template = สูตร kit — มีรายการ "ชื่อ item + จำนวน" (ไม่ผูกกับตาราง items จริง) ใช้วางแผนแพ็กของโดยไม่ต้องล็อก item จริง หรือเป็น checklist ก่อนงาน'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="📋 type: example"
                titleEn="📋 type: example"
                lines={isEn
                  ? [
                      'Plain item list (name + qty)',
                      'Use as a packing reference',
                      'Currently no auto-clone-to-kit (manual create kit + add items)',
                    ]
                  : [
                      'ลิสต์ item (ชื่อ + จำนวน) เฉยๆ',
                      'ใช้เป็น reference ตอนแพ็ก',
                      'ยังไม่มีปุ่ม clone อัตโนมัติ — สร้าง kit เอง + เพิ่ม item ตามลิสต์',
                    ]}
              />
              <FeatureBlock
                titleTh="✅ type: checklist"
                titleEn="✅ type: checklist"
                lines={isEn
                  ? [
                      'Each item has 3 states: none / in-progress / ready',
                      'Mark as you pack — visible to whole team',
                      'Useful as pre-event prep checklist',
                    ]
                  : [
                      'แต่ละ item มี 3 สถานะ: none / in-progress / ready',
                      'mark ระหว่างแพ็ก ทีมมองเห็น',
                      'ใช้เป็น checklist ก่อนงาน',
                    ]}
              />
            </div>
          </div>
        </div>

        {/* ── Stock dashboard ─────────────────────────────────────── */}
        <div id="stock-dashboard" className="scroll-mt-6">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title={isEn ? 'Stock dashboard — /stock/dashboard' : 'Stock dashboard — /stock/dashboard'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="💰 KPI cards"
              titleEn="💰 KPI cards"
              lines={isEn
                ? [
                    'Total inventory value (Σ items.price)',
                    'Items in_use (count)',
                    'Active kits (kits with event_id)',
                    'Active users (profile count)',
                  ]
                : [
                    'มูลค่าสต๊อกรวม (Σ items.price)',
                    'จำนวน item ที่ in_use',
                    'kits ที่ active (มี event_id)',
                    'จำนวน user ที่มี',
                  ]}
            />
            <FeatureBlock
              titleTh="🚨 Alerts + active deployments"
              titleEn="🚨 Alerts + active deployments"
              lines={isEn
                ? [
                    'Red banner if any item is maintenance / damaged / lost',
                    'Active deployments table — kit · event · date · "Track" button',
                    'Templates table preview',
                    '4 quick-access cards',
                  ]
                : [
                    'แถบแดงถ้ามี item maintenance / damaged / lost',
                    'ตาราง active deployments — kit · event · วัน · ปุ่ม "Track"',
                    'ตัวอย่าง template',
                    '4 quick-access cards',
                  ]}
            />
          </div>
        </div>

        {/* ── Logs (admin) ────────────────────────────────────────── */}
        <div id="stock-logs" className="scroll-mt-6">
          <SectionHeader
            icon={<ScrollText className="h-4 w-4" />}
            title={isEn ? 'Activity log — /logs (admin)' : 'Activity log — /logs (admin)'}
            color="emerald"
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
            {isEn
              ? 'Captures every CREATE / UPDATE / DELETE on items and kits, plus checkout/checkin actions. Filter by user, action type, and timestamp; expand a row to see full diff (old → new).'
              : 'เก็บทุก CREATE / UPDATE / DELETE บน items + kits และการ checkout/checkin — filter ตาม user / action / เวลา กดดูแถวแบบ expand จะเห็น diff เต็ม (old → new)'}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
            {[
              'CREATE_ITEM', 'UPDATE_ITEM', 'DELETE_ITEM',
              'CREATE_KIT', 'UPDATE_KIT', 'DELETE_KIT',
              'ADD_KIT_ITEM', 'REMOVE_KIT_ITEM', 'UPDATE_KIT_ITEM',
              'CREATE_TEMPLATE', 'DELETE_TEMPLATE', 'CHECKOUT/CHECKIN',
            ].map(action => (
              <code key={action} className="block px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono">{action}</code>
            ))}
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="stock-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'User' : 'User'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'View items / kits / dashboard / templates' : 'ดู items / kits / dashboard / templates'} owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Create / edit / delete item' : 'สร้าง / แก้ / ลบ item'} owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Create / edit / delete kit' : 'สร้าง / แก้ / ลบ kit'} owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Manage templates' : 'จัดการ template'} owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Check-out / check-in' : 'check-out / check-in'} owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'View activity log /logs' : 'ดู activity log /logs'} owner="no" other="—" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Menu shortcuts ──────────────────────────────────────── */}
        <div id="stock-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/items"             labelEn="All items"                   labelTh="รายการ items ทั้งหมด" />
            <MenuLink href="/items/new"         labelEn="Create item"                 labelTh="สร้าง item" />
            <MenuLink href="/kits"              labelEn="All kits"                    labelTh="รายการ kits ทั้งหมด" />
            <MenuLink href="/kits/new"          labelEn="Create kit"                  labelTh="สร้าง kit" />
            <MenuLink href="/example-kits"      labelEn="Templates"                   labelTh="Templates" />
            <MenuLink href="/stock/dashboard"   labelEn="Stock dashboard"             labelTh="แดชบอร์ดคลัง" />
            <MenuLink href="/logs"              labelEn="Activity log (admin)"        labelTh="Activity log (admin)" />
          </div>
        </div>

        {/* ════ ใบจัดของ (เฟส 1–6 ของแผนอุปกรณ์) ════════════════════════ */}
        <div id="stock-packing-flow" className="scroll-mt-6">
          <SectionHeader
            icon={<ClipboardList className="h-4 w-4" />}
            title={isEn ? 'Packing lists — /packing' : 'ใบจัดของ — /packing'}
            color="violet"
          />
          <div className="mb-3 rounded-lg border border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-3 space-y-2">
            <TipCard
              tone="violet"
              icon={<Boxes className="h-4 w-4" />}
              titleTh="คู่มือเต็มทั้งเส้น"
              titleEn="Full step-by-step guide"
              descTh="ตั้งค่า → ขาย → จัดของ → รับ/คืน → คืนชั้น → การใช้งาน อ่านแยกตามฝ่ายได้ที่หมวด อุปกรณ์"
              descEn="Setup → sales → packing → pickup/return → restock → usage, by team, in the Equipment guide."
              isEn={isEn}
            />
            <MenuLink href="/howto/equipment" labelEn="Equipment guide (full flow)" labelTh="คู่มืออุปกรณ์ (ทั้งเส้น)" />
          </div>
          <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
            {isEn
              ? 'Every event gets its equipment through one packing list. Booking kits directly from the event form or the job pool has been removed — the list books kits and items for you.'
              : 'อุปกรณ์ของทุกอีเวนต์จัดผ่านใบจัดของ (อีเวนต์ละ 1 ใบ) — การจองกระเป๋าตรงจากฟอร์มอีเวนต์หรือหน้าติดตามงานถูกถอดแล้ว ใบจัดของจองกระเป๋าและอุปกรณ์ให้เอง'}
          </p>
          <FlowchartBox
            title={isEn ? '6 steps of a packing list' : '6 ขั้นของใบจัดของ'}
            subtitle={isEn ? 'sales pick a package → packing team → on-site team → packing team' : 'ทีมขายเลือกแพ็กเกจ → ทีมจัดของ → ทีมหน้างาน → ทีมจัดของ'}
            color="purple"
          >
            <FlowNode variant="start" emoji="🛒" title={isEn ? 'Sales pick a package (and booth unit)' : 'ทีมขายเลือกแพ็กเกจ (และตู้)'} subtitle={isEn ? 'on the CRM lead page — warns when equipment may run short' : 'ที่หน้าลูกค้าใน CRM — เตือนเมื่ออุปกรณ์อาจไม่พอ'} />
            <FlowArrow label={isEn ? 'packing team opens the list' : 'ทีมจัดของเปิดใบจัดของ'} />
            <FlowNode variant="user" emoji="📝" title={isEn ? '1. Selecting' : '1. เลือกของ'} subtitle={isEn ? 'choose a unit for each package requirement + extras' : 'เลือกอุปกรณ์ให้ครบทุกข้อของแพ็กเกจ + ของเสริมได้'} tag="selecting" />
            <FlowArrow />
            <FlowNode variant="user" emoji="🧺" title={isEn ? '2. Picking' : '2. กำลังหยิบ'} subtitle={isEn ? 'walk room → cabinet → shelf, tick each line (or print A4)' : 'เดินตามห้อง → ตู้ → ชั้น ติ๊กทีละบรรทัด (หรือพิมพ์ A4)'} tag="picking" />
            <FlowArrow label={isEn ? 'photo + pickup spot' : 'ถ่ายรูป + เลือกจุดรับของ'} />
            <FlowNode variant="admin" emoji="📦" title={isEn ? '3. Ready for pickup' : '3. พร้อมรับ'} subtitle={isEn ? 'the "packing" readiness item passes · team lead is notified' : 'ความพร้อมข้อ "จัดของ" ผ่าน · แจ้งหัวหน้างาน'} tag="ready" />
            <FlowArrow label={isEn ? 'on-site team scans the pickup-spot QR' : 'ทีมหน้างานสแกน QR จุดรับของ'} />
            <FlowNode variant="user" emoji="🚚" title={isEn ? '4. Out at the event' : '4. ออกงาน'} subtitle={isEn ? 'tick every line while loading · job moves to "loading"' : 'ติ๊กครบทุกบรรทัดตอนขึ้นรถ · ใบงานหน้างานเลื่อนเป็น "ขนของ"'} tag="out" />
            <FlowArrow label={isEn ? 'back at the office, scan the same spot' : 'กลับออฟฟิศ สแกนจุดเดิม'} />
            <FlowNode variant="user" emoji="↩️" title={isEn ? '5. Returned' : '5. คืนแล้ว'} subtitle={isEn ? 'condition per line + consumables used · the event closes' : 'เลือกสภาพทีละบรรทัด + วัสดุสิ้นเปลืองที่ใช้ · อีเวนต์ปิดให้เอง'} tag="returned" />
            <FlowArrow />
            <FlowNode variant="success" emoji="🗄️" title={isEn ? '6. Restocked' : '6. คืนชั้นแล้ว'} subtitle={isEn ? 'packing team puts each line back on its shelf' : 'ทีมจัดของเก็บของขึ้นชั้นทีละบรรทัด สถานะอุปกรณ์กลับตามสภาพ'} tag="done" />
          </FlowchartBox>
        </div>

        <div id="stock-packing-roles" className="scroll-mt-6">
          <SectionHeader
            icon={<Users className="h-4 w-4" />}
            title={isEn ? 'Who does what' : 'ใครทำอะไร'}
            color="violet"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="🛒 ทีมขาย"
              titleEn="🛒 Sales"
              lines={isEn
                ? [
                    'Pick packages for the job on the CRM lead page',
                    'Booth-type categories: pick the exact unit (and variant)',
                    'A warning shows when equipment may run short that day',
                  ]
                : [
                    'เลือกแพ็กเกจของงานที่หน้าลูกค้าใน CRM',
                    'ประเภทตู้: ทีมขายเลือกชิ้นเอง (และแบบประกอบ)',
                    'ขึ้นคำเตือนเมื่ออุปกรณ์วันนั้นอาจไม่พอ',
                  ]}
            />
            <FeatureBlock
              titleTh="🧺 ทีมจัดของ"
              titleEn="🧺 Packing team"
              lines={isEn
                ? [
                    'Queue at /packing: jobs with a package but no list, lists in progress, lists to restock',
                    'Open the list from the queue or the "Packing" tab of job tracking',
                    'Select → pick → confirm with a photo and a pickup spot',
                    'Restock returned lists shelf by shelf',
                  ]
                : [
                    'คิวงานที่ /packing: งานที่มีแพ็กเกจแต่ยังไม่มีใบ · ใบที่กำลังทำ · ใบที่รอคืนชั้น',
                    'เปิดใบจากคิว หรือแท็บ "จัดของ" ในหน้าติดตามงาน',
                    'เลือกของ → หยิบ → ยืนยันพร้อมรูปและจุดรับของ',
                    'คืนชั้นใบที่คืนแล้วทีละบรรทัด',
                  ]}
            />
            <FeatureBlock
              titleTh="🚚 ทีมหน้างาน"
              titleEn="🚚 On-site team"
              lines={isEn
                ? [
                    'Scan the pickup-spot QR → /pickup/<spot> lists the ready lists there',
                    'Hand-over: tick lines (or "all items") while loading',
                    'Return: scan the same spot, set condition per line, add photos if needed',
                    'Kit QR codes still work for per-item check-out / check-in on site',
                  ]
                : [
                    'สแกน QR จุดรับของ → /pickup/<จุด> แสดงใบที่พร้อมรับ ณ จุดนั้น',
                    'รับของ: ติ๊กทีละบรรทัด (หรือ "ครบทุกชิ้น") ตอนขึ้นรถ',
                    'คืนของ: สแกนจุดเดิม เลือกสภาพทีละบรรทัด แนบรูปได้',
                    'QR กระเป๋ายังใช้นำออก/รับคืนรายชิ้นหน้างานได้เหมือนเดิม',
                  ]}
            />
            <FeatureBlock
              titleTh="✅ ผู้ปิดงาน"
              titleEn="✅ Whoever closes the event"
              lines={isEn
                ? [
                    'Returning the list closes the event (consumables, closure snapshot, on-site job done)',
                    'Events with a list: /events/<id>/return shows the list summary to confirm',
                    'Old events without a list close the old way',
                  ]
                : [
                    'คืนของตามใบ = ปิดอีเวนต์ให้ (ตัดวัสดุสิ้นเปลือง · บันทึกปิดงาน · ใบงานหน้างานเสร็จ)',
                    'อีเวนต์ที่มีใบ: /events/<id>/return แสดงสรุปจากใบให้ยืนยัน',
                    'อีเวนต์เก่าที่ไม่มีใบ ปิดงานแบบเดิม',
                  ]}
            />
          </div>
        </div>

        <div id="stock-packing-pickup" className="scroll-mt-6">
          <SectionHeader
            icon={<QrCode className="h-4 w-4" />}
            title={isEn ? 'Pickup-spot QR — /stock/settings' : 'QR จุดรับของ — /stock/settings'}
            color="violet"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="📍 ตั้งจุดรับของ"
              titleEn="📍 Set up pickup spots"
              lines={isEn
                ? [
                    'Stock settings → Pickup spots: add a spot (e.g. table by the door)',
                    'Print the spot QR on A4 and stick it at the spot',
                    'Anyone with the Events or Stock module can scan it',
                  ]
                : [
                    'ตั้งค่าคลัง → จุดรับของ: เพิ่มจุด (เช่น โต๊ะหน้าประตู)',
                    'พิมพ์ QR จุดรับของเป็น A4 แล้วติดไว้ที่จุดนั้น',
                    'คนที่มีโมดูลอีเวนต์หรือสต็อกสแกนได้',
                  ]}
            />
            <FeatureBlock
              titleTh="🧾 ความพร้อม 'จัดของ'"
              titleEn="🧾 'Packing' readiness"
              lines={isEn
                ? [
                    'Missing until every open event of the job has a list at "Ready" or later',
                    'Skipped on-site job or "no packing needed" = not counted',
                    'Old events without a list but with fully packed kits still pass',
                  ]
                : [
                    'ขาด จนกว่าทุกอีเวนต์ที่ยังไม่ปิดของงานมีใบจัดของถึง "พร้อมรับ" ขึ้นไป',
                    'ใบงานหน้างานถูกข้าม หรือตั้ง "ไม่ต้องจัด" = ไม่นับ',
                    'อีเวนต์เก่าที่ไม่มีใบแต่จัดกระเป๋าครบแล้ว ยังผ่านเหมือนเดิม',
                  ]}
            />
          </div>
        </div>

        <div id="stock-packing-usage" className="scroll-mt-6">
          <SectionHeader
            icon={<Trophy className="h-4 w-4" />}
            title={isEn ? 'Trophies & usage page — /stock/usage' : 'ถ้วยรางวัล + หน้าการใช้งาน — /stock/usage'}
            color="violet"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="🏆 ถ้วย 2 สาย"
              titleEn="🏆 Two trophy tracks"
              lines={isEn
                ? [
                    'Packer: lists confirmed (Ready or later) — one per list, to whoever confirmed',
                    'Restocker: lists fully restocked — one per list, to whoever finished',
                    'Shown with the other champions on the dashboard and in reports',
                  ]
                : [
                    'นักจัดของ: ใบที่ยืนยันจัดของแล้ว (พร้อมรับขึ้นไป) — ใบละ 1 ครั้งให้คนยืนยัน',
                    'นักคืนของ: ใบที่คืนชั้นครบ — ใบละ 1 ครั้งให้คนที่ทำจนจบ',
                    'แสดงคู่กับแชมป์อื่นในแดชบอร์ดและหน้ารายงาน',
                  ]}
            />
            <FeatureBlock
              titleTh="📊 หน้าการใช้งานอุปกรณ์"
              titleEn="📊 Equipment usage page"
              lines={isEn
                ? [
                    'Which packages and equipment are used most, hours out per unit',
                    'Period chips filter packages by event date and people by pickup date',
                    '12-month chart does not change with the chips',
                  ]
                : [
                    'แพ็กเกจ/อุปกรณ์ที่ใช้บ่อย และชั่วโมงที่ออกงานของแต่ละชิ้น',
                    'ชิปช่วงเวลา: แพ็กเกจกรองด้วยวันงาน · คนกรองด้วยวันรับของ',
                    'กราฟ 12 เดือนไม่เปลี่ยนตามชิป',
                  ]}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/packing"        labelEn="Packing queue"          labelTh="คิวใบจัดของ" />
            <MenuLink href="/packages"       labelEn="Packages"               labelTh="แพ็กเกจ" />
            <MenuLink href="/stock/settings" labelEn="Stock settings & spots" labelTh="ตั้งค่าคลัง + จุดรับของ" />
            <MenuLink href="/stock/usage"    labelEn="Equipment usage"        labelTh="การใช้งานอุปกรณ์" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: COSTS
          ════════════════════════════════════════════════════════════════ */}
      {view === 'costs' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[5]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[5]} isEn={isEn} />

        {/* ── Intro ───────────────────────────────────────────────── */}
        <div id="costs-intro" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-teal-200 dark:border-teal-900 bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/20 dark:to-zinc-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-teal-600 text-white">
                <Coins className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-teal-900 dark:text-teal-200">
                  {isEn ? 'Costs — profitability ledger per event' : 'Costs — บัญชีกำไร/ขาดทุนต่อ event'}
                </p>
                <p className="text-[11px] text-teal-700 dark:text-teal-400">
                  {isEn
                    ? 'A separate ledger that tracks revenue + cost line items per event so you can see margin at a glance.'
                    : 'บัญชีแยกเก็บ revenue + รายการต้นทุนต่อ event — ดูกำไร/ขาดทุนของแต่ละงานได้ทันที'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Costs ≠ Finance. Finance = expense claims (who reimburses what). Costs = post-event ledger (revenue vs total cost). Each Finance claim of type "event" is auto-tied here via job_event_id.'
                  : 'Costs ≠ Finance — Finance คือใบเบิก (ใครเบิกอะไร) ส่วน Costs คือบัญชีหลังจบงาน (รายได้ vs ต้นทุนรวม) ใบเบิก type=event จะผูกเข้ามาที่นี่อัตโนมัติผ่าน job_event_id'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Workflow ────────────────────────────────────────────── */}
        <div id="costs-flow" className="scroll-mt-6 space-y-4">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Workflow' : 'Flow ทำงาน'}
            color="emerald"
          />
          <FlowchartBox
            title={isEn ? 'From event → cost ledger → reports' : 'จาก event → ledger → รายงาน'}
            color="sky"
          >
            <FlowNode variant="start" emoji="🎬" title={isEn ? 'Event closed (return submitted)' : 'event ปิดแล้ว (กดเช็คคืน)'} subtitle="/events/[id]/return" />
            <FlowArrow label={isEn ? 'or import manually' : 'หรือ import เอง'} />
            <FlowNode variant="admin" emoji="📥" title={isEn ? 'Admin imports to /costs/import' : 'Admin import ที่ /costs/import'} subtitle={isEn ? '4-tier CRM auto-match' : 'จับคู่ CRM แบบ 4 ชั้น'} />
            <FlowArrow />
            <FlowNode variant="admin" emoji="💰" title={isEn ? 'Revenue + VAT/WHT pre-filled from CRM' : 'Revenue + VAT/WHT pre-fill จาก CRM'} tag="job_cost_events" />
            <FlowArrow />
            <FlowNode variant="admin" emoji="🧾" title={isEn ? 'Add cost line items by category' : 'ใส่รายการต้นทุน แยกหมวด'} subtitle={isEn ? 'staff / travel / equipment / food / venue / marketing / other' : 'staff / เดินทาง / อุปกรณ์ / อาหาร / สถานที่ / การตลาด / อื่นๆ'} />
            <FlowArrow label={isEn ? 'finance claims auto-tie via job_event_id' : 'ใบเบิก finance ผูกอัตโนมัติผ่าน job_event_id'} />
            <FlowNode variant="user" emoji="📊" title={isEn ? 'Dashboard / reports show margin %' : 'Dashboard / รายงาน แสดง margin %'} subtitle="/costs/dashboard · /costs/reports" />
            <FlowArrow />
            <FlowNode variant="success" emoji="📥" title={isEn ? 'Export to Excel for accounting' : 'Export Excel ส่งบัญชี'} subtitle="/costs/download" />
          </FlowchartBox>
        </div>

        {/* ── Import + 4-tier matching ────────────────────────────── */}
        <div id="costs-import" className="scroll-mt-6">
          <SectionHeader
            icon={<ArrowDownToLine className="h-4 w-4" />}
            title={isEn ? 'Import — 4-tier CRM matching' : 'Import — จับคู่ CRM 4 ชั้น'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/20 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Importing an event from /costs/import (or its closure record) auto-fills revenue + VAT/WHT by matching to a CRM lead. Matching tries 4 tiers in order — stops at first hit.'
                : 'import event จาก /costs/import (หรือจาก event_closures) ระบบจะ pre-fill revenue + VAT/WHT โดยจับคู่กับ CRM lead — ลองทีละ tier ตามลำดับ หยุดที่ tier แรกที่เจอ'}
            </p>
            <ol className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300 list-decimal list-inside">
              <li><span className="font-semibold text-teal-700 dark:text-teal-400">{isEn ? 'Tier 1 — explicit linked_lead_id' : 'Tier 1 — linked_lead_id ที่ผูกชัดอยู่แล้ว'}</span></li>
              <li><span className="font-semibold text-teal-700 dark:text-teal-400">{isEn ? 'Tier 2 — CRM lead\'s event_id matches' : 'Tier 2 — CRM lead.event_id ตรงกัน'}</span></li>
              <li><span className="font-semibold text-teal-700 dark:text-teal-400">{isEn ? 'Tier 3 — source_event_id back-pointer' : 'Tier 3 — source_event_id ตรงกัน'}</span></li>
              <li><span className="font-semibold text-teal-700 dark:text-teal-400">{isEn ? 'Tier 4 — fuzzy date + name match' : 'Tier 4 — fuzzy match วันที่ + ชื่อ'}</span></li>
            </ol>
            <div className="flex items-start gap-2 p-2.5 bg-white dark:bg-zinc-900 border border-teal-200 dark:border-teal-900 rounded-lg">
              <span className="text-base">💡</span>
              <p className="text-[11px] text-teal-900 dark:text-teal-200">
                {isEn
                  ? 'Already imported and revenue is 0? Use "Bulk Sync" on /costs/dashboard — re-runs the 4-tier match across every zero-revenue event in one click.'
                  : 'import ไปแล้วแต่ revenue = 0? กดปุ่ม "Bulk Sync" ที่ /costs/dashboard — ระบบจะลองจับคู่ใหม่ทั้งหมดในคลิกเดียว'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Revenue + VAT/WHT ──────────────────────────────────── */}
        <div id="costs-revenue" className="scroll-mt-6">
          <SectionHeader
            icon={<CircleDollarSign className="h-4 w-4" />}
            title={isEn ? 'Revenue + VAT / WHT' : 'Revenue + VAT / WHT'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="💰 ฝั่งรายได้"
              titleEn="💰 Revenue side"
              lines={isEn
                ? [
                    'revenue (the net selling price)',
                    'revenue_vat_mode: none | included | excluded',
                    'revenue_wht_rate: 0 — 5%',
                    'System computes baseAmount, vatAmount, netReceivable',
                  ]
                : [
                    'revenue (ราคาขายสุทธิ)',
                    'revenue_vat_mode: ไม่มี | รวม | แยก',
                    'revenue_wht_rate: 0 — 5%',
                    'ระบบคำนวณ baseAmount / vatAmount / netReceivable ให้',
                  ]}
            />
            <FeatureBlock
              titleTh="🧾 ฝั่งต้นทุน"
              titleEn="🧾 Cost side"
              lines={isEn
                ? [
                    'Each cost item has its own vat_mode + WHT rate',
                    'System computes net payable per item',
                    'Dashboard shows VAT receivable vs VAT payable',
                    'Net tax liability surfaces automatically',
                  ]
                : [
                    'cost item แต่ละแถวมี vat_mode + WHT ของตัวเอง',
                    'ระบบคำนวณ net payable ต่อรายการ',
                    'Dashboard แสดง VAT รับ vs VAT จ่าย',
                    'ภาษีสุทธิที่ต้องส่งโผล่อัตโนมัติ',
                  ]}
            />
          </div>
        </div>

        {/* ── Cost categories ────────────────────────────────────── */}
        <div id="costs-categories" className="scroll-mt-6">
          <SectionHeader
            icon={<Tag className="h-4 w-4" />}
            title={isEn ? 'Cost categories — 7 buckets' : 'หมวดต้นทุน — 7 หมวด'}
            color="emerald"
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <NewItem icon={<Users className="h-3.5 w-3.5" />}        titleTh="👥 staff"      titleEn="👥 staff"      descTh="ค่าตัวทีม"           descEn="Team fees"            isEn={isEn} />
            <NewItem icon={<Plane className="h-3.5 w-3.5" />}        titleTh="✈️ travel"     titleEn="✈️ travel"     descTh="เดินทาง / ที่พัก"     descEn="Travel + lodging"     isEn={isEn} />
            <NewItem icon={<Hammer className="h-3.5 w-3.5" />}       titleTh="🛠 equipment" titleEn="🛠 equipment"  descTh="อุปกรณ์ / เช่าเครื่อง" descEn="Equipment + rentals" isEn={isEn} />
            <NewItem icon={<Heart className="h-3.5 w-3.5" />}        titleTh="🍱 food"       titleEn="🍱 food"       descTh="อาหาร / น้ำ"          descEn="Food + drinks"        isEn={isEn} />
            <NewItem icon={<MapPin className="h-3.5 w-3.5" />}       titleTh="🏛 venue"      titleEn="🏛 venue"      descTh="ค่าสถานที่"           descEn="Venue fees"           isEn={isEn} />
            <NewItem icon={<Sparkles className="h-3.5 w-3.5" />}     titleTh="📣 marketing"  titleEn="📣 marketing"  descTh="โฆษณา / โปรโมต"        descEn="Ads + promo"          isEn={isEn} />
            <NewItem icon={<Boxes className="h-3.5 w-3.5" />}        titleTh="📦 other"      titleEn="📦 other"      descTh="อื่นๆ"                 descEn="Other costs"          isEn={isEn} />
          </div>
          <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
            {isEn
              ? 'Categories pull from the finance_categories table (configurable in Finance settings) with the 7 above as fallback.'
              : 'รายชื่อหมวดดึงจาก finance_categories (แก้ใน Finance settings ได้) — ถ้าไม่มีก็ใช้ 7 หมวดข้างต้นเป็น fallback'}
          </p>
        </div>

        {/* ── Linked claims ──────────────────────────────────────── */}
        <div id="costs-linked-claims" className="scroll-mt-6">
          <SectionHeader
            icon={<Receipt className="h-4 w-4" />}
            title={isEn ? 'Linked Finance claims' : 'ใบเบิก Finance ที่ผูกอยู่'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/20 p-4 space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'On the cost event detail page (/costs/events/[id]) you see every Finance claim where claim_type = "event" + job_event_id matches. The system can also recreate a cost line item directly from an approved claim.'
                : 'หน้า cost event detail (/costs/events/[id]) จะแสดงใบเบิก Finance ทุกใบที่ claim_type = "event" และ job_event_id ตรงกัน — กด recreate cost line item จากใบเบิกที่อนุมัติแล้วได้'}
            </p>
            <ul className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
              <li className="flex items-start gap-2"><span className="text-teal-500">•</span><span>{isEn ? 'Auto-link source: check-in on-site checkout creates the claim with job_event_id pre-set' : 'แหล่งหลัก: ตอนเช็คเอาต์ on-site session ระบบสร้างใบเบิก + ใส่ job_event_id ให้'}</span></li>
              <li className="flex items-start gap-2"><span className="text-teal-500">•</span><span>{isEn ? 'Manual link: claim form has an "Event" dropdown' : 'ใส่เอง: ฟอร์มใบเบิกมี dropdown "Event" ให้เลือก'}</span></li>
              <li className="flex items-start gap-2"><span className="text-teal-500">•</span><span>{isEn ? 'recreateCostItemFromClaim turns approved claims into cost items in this ledger' : 'recreateCostItemFromClaim เปลี่ยนใบเบิกที่อนุมัติแล้วเป็น cost item ใน ledger นี้'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Dashboard ──────────────────────────────────────────── */}
        <div id="costs-dashboard" className="scroll-mt-6">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title={isEn ? 'Dashboard — /costs/dashboard' : 'Dashboard — /costs/dashboard'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="📊 KPI cards"
              titleEn="📊 KPI cards"
              lines={isEn
                ? [
                    'Total revenue / cost / profit / margin %',
                    'Avg revenue per event',
                    'Total events imported',
                    'Sync status (events missing revenue)',
                  ]
                : [
                    'รายได้รวม / ต้นทุนรวม / กำไร / margin %',
                    'รายได้เฉลี่ยต่อ event',
                    'จำนวน event ที่ import',
                    'สถานะ sync (event ที่ revenue = 0)',
                  ]}
            />
            <FeatureBlock
              titleTh="📈 ภาพละเอียด"
              titleEn="📈 Drill-downs"
              lines={isEn
                ? [
                    'Cost breakdown pie by category',
                    'Top 5 / Bottom 5 events by profit',
                    'Staff cost headcount overview',
                    '"Bulk Sync" button to refresh CRM matches',
                  ]
                : [
                    'pie chart ต้นทุนแยกหมวด',
                    'Top 5 / Bottom 5 event ตามกำไร',
                    'สรุปต้นทุนค่าตัว staff',
                    'ปุ่ม "Bulk Sync" จับคู่ CRM ใหม่ทั้งหมด',
                  ]}
            />
          </div>
        </div>

        {/* ── Reports + download ─────────────────────────────────── */}
        <div id="costs-reports" className="scroll-mt-6">
          <SectionHeader
            icon={<FileSpreadsheet className="h-4 w-4" />}
            title={isEn ? 'Reports + download' : 'รายงาน + Export'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="📋 /costs/reports"
              titleEn="📋 /costs/reports"
              lines={isEn
                ? [
                    'Month + search filters',
                    'Per-event row: revenue / cost / profit / margin',
                    'Tax breakdown (revenue VAT/WHT, cost VAT/WHT)',
                    'Staff presence + import source visible',
                  ]
                : [
                    'filter เดือน + ค้นหา',
                    'แต่ละแถว: รายได้ / ต้นทุน / กำไร / margin',
                    'แยกภาษี (revenue VAT/WHT, cost VAT/WHT)',
                    'แสดง staff ที่อยู่ในงาน + แหล่ง import',
                  ]}
            />
            <FeatureBlock
              titleTh="📥 /costs/download"
              titleEn="📥 /costs/download"
              lines={isEn
                ? [
                    'Export cost events + line items to Excel',
                    'Batch processing for large lists',
                    'Use as cover sheet before sending accounting',
                  ]
                : [
                    'export cost events + รายการต้นทุน → Excel',
                    'batch processing รองรับลิสต์ใหญ่',
                    'ใช้เป็นใบปะหน้าก่อนส่งบัญชี',
                  ]}
            />
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="costs-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'User' : 'User'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'View dashboard / reports / event detail' : 'ดู dashboard / reports / detail'} owner="yes" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Import event' : 'Import event'} owner="no" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Edit revenue / VAT / WHT' : 'แก้ revenue / VAT / WHT'} owner="no" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Add / edit / delete cost items' : 'เพิ่ม / แก้ / ลบ cost item'} owner="no" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Bulk Sync revenue from CRM' : 'Bulk Sync revenue จาก CRM'} owner="no" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Link / unlink CRM lead' : 'ผูก / ปลด CRM lead'} owner="no" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Delete cost event' : 'ลบ cost event'} owner="no" other="—" admin="yes" />
                <PermissionRow label={isEn ? 'Export Excel' : 'Export Excel'} owner="no" other="—" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Menu shortcuts ──────────────────────────────────────── */}
        <div id="costs-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/costs/dashboard" labelEn="Dashboard"               labelTh="แดชบอร์ด" />
            <MenuLink href="/costs/events"    labelEn="All cost events"         labelTh="cost events ทั้งหมด" />
            <MenuLink href="/costs/import"    labelEn="Import from events"       labelTh="Import จาก events" />
            <MenuLink href="/costs/reports"   labelEn="Reports (filter + tax)"   labelTh="รายงาน (filter + ภาษี)" />
            <MenuLink href="/costs/download"  labelEn="Export Excel"             labelTh="Export Excel" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: FINANCE
          ════════════════════════════════════════════════════════════════ */}
      {view === 'finance' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[6]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[6]} isEn={isEn} />

        {/* ── What's new (Apr 2026) ───────────────────────────────── */}
        <div id="finance-whats-new" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-600 text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  {isEn ? "What's new — April 2026" : 'อัปเดตใหม่ — เมษายน 2026'}
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  {isEn
                    ? '5 changes that affect how you submit and audit claims'
                    : 'การเปลี่ยนแปลง 5 อย่างที่กระทบการเบิก/ตรวจสอบใบเบิก'}
                </p>
              </div>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-emerald-900 dark:text-emerald-200">
              <NewItem
                icon={<Building2 className="h-3.5 w-3.5" />}
                titleTh="แหล่งเงินที่ใช้เบิก"
                titleEn="Funding source"
                descTh="เลือกได้ว่าใช้เงินบริษัท หรือเงินส่วนตัวออกก่อน (reimbursement)"
                descEn="Choose: company money or personal money (reimburse)"
                isEn={isEn}
              />
              <NewItem
                icon={<Hash className="h-3.5 w-3.5" />}
                titleTh="เลขที่ใบกำกับภาษี + แนบหลายใบ"
                titleEn="Tax invoice numbers + multi-row"
                descTh="เพิ่มเลขที่ใบกำกับ และอัพโหลดได้หลายใบในครั้งเดียว — แต่ละใบมีเลขของตัวเอง"
                descEn="Pair file + number per invoice; upload multiple at once"
                isEn={isEn}
              />
              <NewItem
                icon={<ListChecks className="h-3.5 w-3.5" />}
                titleTh="Document checklist"
                titleEn="Document checklist"
                descTh="แสดงสถานะเอกสารแต่ละใบ: ใบเสร็จ • ใบกำกับ • คืนเงิน — ตรวจครบหรือยัง"
                descEn="Status of receipts / tax invoice / refund per claim"
                isEn={isEn}
              />
              <NewItem
                icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                titleTh="หน้ารายงานตรวจสอบ (overview)"
                titleEn="Audit Report page"
                descTh="ตาราง filter วัน/สัปดาห์/เดือน/ปี + export Excel/PDF — ใช้เป็นใบปะหน้าก่อนส่งบัญชี"
                descEn="Filter day/week/month/year + Excel/PDF export — for accounting handover"
                isEn={isEn}
              />
              <NewItem
                icon={<Percent className="h-3.5 w-3.5" />}
                titleTh="หน้า WHT แยกชัด"
                titleEn="WHT page focused"
                descTh="/finance/download → สรุปหัก ณ ที่จ่ายรายบุคคลเท่านั้น (ภ.ง.ด.3 / 53)"
                descEn="/finance/download → WHT-only summary (per-person)"
                isEn={isEn}
              />
            </ul>
          </div>
        </div>

        {/* ── Flowcharts ──────────────────────────────────────────── */}
        <div id="finance-flowcharts" className="scroll-mt-6 space-y-6">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Step-by-step flowcharts' : 'แผนผังขั้นตอน'}
          />

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="font-semibold text-zinc-500 uppercase tracking-wider">{isEn ? 'Legend' : 'สัญลักษณ์'}:</span>
            <LegendDot variant="start"   label={isEn ? 'Start' : 'เริ่ม'} />
            <LegendDot variant="user"    label={isEn ? 'User' : 'User'} />
            <LegendDot variant="admin"   label={isEn ? 'Admin' : 'Admin'} />
            <LegendDot variant="decision" label={isEn ? 'Decision' : 'ทางเลือก'} />
            <LegendDot variant="success" label={isEn ? 'Terminal' : 'จบ'} />
            <LegendDot variant="error"   label={isEn ? 'Rejected' : 'ปฏิเสธ'} />
          </div>

          {/* ═════ Flowchart 1: USER — Normal flow ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow A — User: Event / Other claim' : 'Flow A — User: เบิกงานอีเวนต์ / ค่าอื่นๆ'}
            subtitle={isEn ? 'How a regular employee files a normal claim' : 'พนักงานทั่วไปยื่นใบเบิกปกติ'}
            color="sky"
          >
            <FlowNode variant="start" emoji="🎬" title={isEn ? 'Need to claim expense' : 'ต้องการเบิกค่าใช้จ่าย'} />
            <FlowArrow />
            <FlowNode variant="user"  emoji="📝" title={isEn ? 'Create new claim' : 'สร้างใบเบิกใหม่'} subtitle="/finance/new" tag="status: draft" />
            <FlowArrow />
            <FlowNode variant="user"  emoji="✏️" title={isEn ? 'Fill in details' : 'กรอกข้อมูล'} subtitle={isEn ? 'type, funding source, category, amount, VAT/WHT, attach receipt, bank info' : 'ประเภท / แหล่งเงิน / หมวดหมู่ / ยอด / VAT / WHT / แนบใบเสร็จ / เลขบัญชี'} />
            <FlowArrow />
            <FlowNode variant="user"  emoji="📤" title={isEn ? 'Submit for approval' : 'กดส่งอนุมัติ'} tag="draft → pending" />
            <FlowArrow label={isEn ? 'can cancel anytime → cancelled' : 'ยกเลิกได้ตลอด → cancelled'} />
            <FlowNode variant="decision" emoji="⏳" title={isEn ? 'Admin reviews — 4 outcomes' : 'Admin ตรวจ — 4 ทางเลือก'} />

            {/* 4-way branch */}
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <FlowLane label={isEn ? '✓ Approved' : '✓ อนุมัติ'} color="emerald">
                <FlowNode variant="success" compact emoji="✅" title={isEn ? 'approved' : 'อนุมัติแล้ว'} tag="approved" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Admin pays out' : 'Admin จ่ายเงิน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '🧾 Tax invoice' : '🧾 ขอใบกำกับ'} color="sky">
                <FlowNode variant="decision" compact emoji="🧾" title="waiting_tax_invoice" />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="📤" title={isEn ? 'User uploads' : 'user อัพโหลด'} />
                <FlowArrow label="auto" />
                <FlowNode variant="success" compact emoji="✅" title="approved" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Pay' : 'จ่ายเงิน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '📅 Month-end' : '📅 สิ้นเดือน'} color="violet">
                <FlowNode variant="decision" compact emoji="📅" title="pending_month_end" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Batch pay at month-end' : 'จ่ายรอบสิ้นเดือน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '✗ Rejected' : '✗ ปฏิเสธ'} color="red">
                <FlowNode variant="error" compact emoji="❌" title={isEn ? 'With reason' : 'มีเหตุผล'} tag="rejected" />
                <FlowArrow />
                <FlowNode variant="terminal" compact emoji="🔄" title={isEn ? 'Create new claim' : 'สร้างใบใหม่'} />
              </FlowLane>
            </div>

            <FlowArrow />
            <FlowNode variant="success" emoji="🏁" title={isEn ? 'Done — claim closed' : 'จบเคส — ใบเบิกปิดแล้ว'} tag="paid (terminal)" />
          </FlowchartBox>

          {/* ═════ Flowchart 2: USER — Advance flow ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow B — User: Advance payment' : 'Flow B — User: เบิกทดลองจ่าย'}
            subtitle={isEn ? 'Get money upfront, settle actual spend + refund later' : 'ขอเงินล่วงหน้า แล้วเคลียร์ค่าใช้จ่ายจริง + คืนเงินทีหลัง'}
            color="amber"
          >
            <FlowNode variant="start" emoji="💰" title={isEn ? 'Need advance money' : 'ต้องการเงินล่วงหน้า'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📝" title={isEn ? 'Create claim — type: advance' : 'สร้างใบเบิก — ประเภท: เบิกทดลองจ่าย'} subtitle="/finance/new" />
            <FlowArrow />
            <FlowNode variant="user" emoji="💵" title={isEn ? 'Enter advance amount (no receipt needed yet)' : 'ใส่ยอดที่ขอเบิก (ยังไม่ต้องแนบใบเสร็จ)'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📤" title={isEn ? 'Submit → wait for admin approval + payout' : 'ส่งอนุมัติ → รอ admin อนุมัติ + จ่ายเงิน'} tag="→ paid" />
            <FlowArrow label={isEn ? 'now you have the money' : 'ได้รับเงินแล้ว'} />
            <FlowNode variant="decision" emoji="🛒" title={isEn ? 'Go spend — collect receipts' : 'ไปใช้เงินจริง — เก็บใบเสร็จ'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📂" title={isEn ? 'Re-open claim → "Update actual spend" box' : 'เปิดใบเดิม → กล่อง "อัพเดทค่าใช้จ่ายจริง"'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="➕" title={isEn ? 'Add line items + attach receipts' : 'เพิ่มรายการ + แนบใบเสร็จ'} subtitle={isEn ? 'System auto-calculates refund amount' : 'ระบบคำนวณเงินคืนให้อัตโนมัติ'} />
            <FlowArrow />
            <FlowNode variant="decision" emoji="💭" title={isEn ? 'Refund > 0?' : 'มีเงินคืน > 0 ไหม?'} />

            {/* Branch: refund or not */}
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <FlowLane label={isEn ? 'Yes — refund needed' : 'ใช่ — ต้องคืนเงิน'} color="cyan">
                <FlowNode variant="user" compact emoji="🏦" title={isEn ? 'Transfer refund to company' : 'โอนเงินคืนบริษัท'} />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="📎" title={isEn ? 'Attach refund slip' : 'แนบสลิปการโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="💾" title={isEn ? 'Click "Save update"' : 'กด "บันทึกการอัพเดท"'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="👀" title={isEn ? 'Admin checks refund slip' : 'Admin ตรวจสลิปโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Admin confirms received' : 'Admin ยืนยันรับเงิน'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="💸" title={isEn ? 'refund_confirmed (done)' : 'คืนเงินบริษัทแล้ว (จบ)'} tag="refund_confirmed" />
              </FlowLane>

              <FlowLane label={isEn ? 'No — used all' : 'ไม่ใช่ — ใช้หมดพอดี'} color="zinc">
                <FlowNode variant="user" compact emoji="💾" title={isEn ? 'Click "Save update"' : 'กด "บันทึกการอัพเดท"'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="🏁" title={isEn ? 'Stays "paid" — done' : 'อยู่ paid ตามเดิม — จบ'} tag="paid (terminal)" />
              </FlowLane>
            </div>
          </FlowchartBox>

          {/* ═════ Flowchart 3: ADMIN ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow C — Admin: Review & finalize' : 'Flow C — Admin: ตรวจและปิดเคส'}
            subtitle={isEn ? 'How admin handles every incoming claim' : 'วิธี admin จัดการใบเบิกที่เข้ามา'}
            color="purple"
          >
            <FlowNode variant="start" emoji="🔔" title={isEn ? 'New claim notification (pending)' : 'แจ้งเตือน: ใบเบิกใหม่ (pending)'} />
            <FlowArrow />
            <FlowNode variant="admin" emoji="📖" title={isEn ? 'Open claim detail' : 'เปิดดูใบเบิก'} subtitle="/finance/{id}" />
            <FlowArrow />
            <FlowNode variant="admin" emoji="🔍" title={isEn ? 'Review: receipt, amount, category, claimant' : 'ตรวจ: ใบเสร็จ / ยอด / หมวดหมู่ / ผู้เบิก'} />
            <FlowArrow />
            <FlowNode variant="decision" emoji="⚖️" title={isEn ? 'Decision — 4 options' : 'ตัดสิน — 4 ทางเลือก'} />

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <FlowLane label={isEn ? 'A. Approve' : 'A. อนุมัติ'} color="emerald">
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Click "Approve"' : 'กด "อนุมัติ"'} tag="→ approved" />
              </FlowLane>

              <FlowLane label={isEn ? 'B. Request invoice' : 'B. ขอใบกำกับ'} color="sky">
                <FlowNode variant="admin" compact emoji="🧾" title={isEn ? 'Wait for tax invoice' : 'ขอใบกำกับภาษี'} tag="→ waiting_tax_invoice" />
                <FlowArrow label={isEn ? 'user uploads → auto' : 'user upload → auto'} />
                <FlowNode variant="success" compact emoji="✅" title="approved" />
              </FlowLane>

              <FlowLane label={isEn ? 'C. Month-end' : 'C. สิ้นเดือน'} color="violet">
                <FlowNode variant="admin" compact emoji="📅" title={isEn ? 'Queue for month-end' : 'เข้าคิวสิ้นเดือน'} tag="→ pending_month_end" />
              </FlowLane>

              <FlowLane label={isEn ? 'D. Reject' : 'D. ปฏิเสธ'} color="red">
                <FlowNode variant="error" compact emoji="❌" title={isEn ? 'Reject with reason' : 'ปฏิเสธ + ใส่เหตุผล'} tag="→ rejected (end)" />
              </FlowLane>
            </div>

            <FlowArrow label={isEn ? 'paths A / B / C continue below' : 'ทางเลือก A / B / C ต่อด้านล่าง'} />
            <FlowNode variant="admin" emoji="💵" title={isEn ? 'Pay out → click "Paid"' : 'จ่ายเงิน → กด "ชำระแล้ว"'} tag="→ paid" />
            <FlowArrow />
            <FlowNode variant="decision" emoji="🤔" title={isEn ? 'Claim type?' : 'ประเภทใบเบิก?'} />

            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <FlowLane label={isEn ? 'Normal (event/other)' : 'ปกติ (event/other)'} color="emerald">
                <FlowNode variant="success" compact emoji="🏁" title={isEn ? 'Done — paid (terminal)' : 'จบ — paid (terminal)'} />
              </FlowLane>

              <FlowLane label={isEn ? 'Advance — wait for settle' : 'Advance — รอ user settle'} color="cyan">
                <FlowNode variant="admin" compact emoji="⏳" title={isEn ? 'Wait for user to settle actual spend' : 'รอ user อัพเดทค่าใช้จ่ายจริง'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="📋" title={isEn ? 'Review line items + refund slip' : 'ตรวจรายการ + สลิปโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="decision" compact emoji="💭" title={isEn ? 'Refund?' : 'มีเงินคืน?'} />
                <FlowArrow label={isEn ? 'yes, slip verified' : 'ใช่ ตรงกับสลิป'} />
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Click "Confirm received"' : 'กด "ยืนยันรับเงิน"'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="💸" title="refund_confirmed" tag="terminal" />
              </FlowLane>
            </div>
          </FlowchartBox>

          {/* Tips */}
          <div className="flex items-start gap-2.5 p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
            <span className="text-lg leading-none">💡</span>
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">{isEn ? 'Tips' : 'เคล็ดลับ'}</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800 dark:text-amber-300">
                <li>{isEn ? 'Admin can "Override status" anytime with a reason — useful for corrections.' : 'Admin กด "Override status" เปลี่ยน status ได้ทุกช่อง (ต้องใส่เหตุผล) — ใช้แก้ไขกรณีพิเศษ'}</li>
                <li>{isEn ? 'Advance claims: save update multiple times — each save is logged.' : 'เบิกทดลองจ่าย: กดบันทึกได้หลายครั้ง — ทุกครั้งถูกบันทึกใน log'}</li>
                <li>{isEn ? 'After refund_confirmed, editing is locked — need admin override to unlock.' : 'หลัง refund_confirmed แก้ไขไม่ได้ — ต้อง admin override ก่อน'}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── 3 claim types ───────────────────────────────────────── */}
        <div id="finance-types" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Claim types (3 kinds)' : 'ประเภทใบเบิก (3 แบบ)'}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TypeCard
              emoji="📅"
              title={isEn ? 'Event Claim' : 'เบิกงานอีเวนต์'}
              subtitle="event"
              desc={isEn ? 'Expenses linked to a client job/event.' : 'เบิกค่าใช้จ่ายที่เกิดจากงานลูกค้า (ผูกกับ job event)'}
              receipt={isEn ? 'Required' : 'ต้องแนบใบเสร็จ'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="📝"
              title={isEn ? 'Other Claim' : 'เบิกค่าอื่นๆ'}
              subtitle="other"
              desc={isEn ? 'General expenses not tied to a specific job.' : 'เบิกค่าใช้จ่ายทั่วไป ไม่ผูกกับ job'}
              receipt={isEn ? 'Required' : 'ต้องแนบใบเสร็จ'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="💰"
              title={isEn ? 'Advance Payment' : 'เบิกทดลองจ่าย'}
              subtitle="advance"
              desc={isEn ? 'Get money upfront, settle actual spend later.' : 'ขอเงินล่วงหน้าก่อนไปทำงาน แล้วเคลียร์ทีหลัง'}
              receipt={isEn ? 'Not required yet' : 'ไม่ต้องแนบใบเสร็จ (ยังไม่มี)'}
              receiptColor="emerald"
            />
          </div>
        </div>

        {/* ── Funding source (เงินบริษัท / เงินส่วนตัว) ──────────── */}
        <div id="finance-funding" className="scroll-mt-6">
          <SectionHeader
            icon={<Building2 className="h-4 w-4" />}
            title={isEn ? 'Funding source — who paid first?' : 'แหล่งเงินที่ใช้เบิก — ใครออกก่อน?'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border-2 border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-sky-900 dark:text-sky-200">
                    {isEn ? 'Company Money' : 'เงินบริษัท'}
                  </p>
                  <code className="text-[10px] font-mono text-sky-600">funding_source: company</code>
                </div>
              </div>
              <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
                {isEn
                  ? 'Default. The company pays the bill directly (e.g. via company card or transfer).'
                  : 'ค่า default — บริษัทจ่ายค่าใช้จ่ายตรง (บัตรบริษัท / โอนตรง)'}
              </p>
            </div>
            <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    {isEn ? 'Personal Money' : 'เงินส่วนตัว'}
                  </p>
                  <code className="text-[10px] font-mono text-amber-600">funding_source: personal</code>
                </div>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                {isEn
                  ? 'You paid out of pocket; the company will reimburse you after approval. Pick this when you bought something with your own money.'
                  : 'คุณออกเงินส่วนตัวก่อน — บริษัทจะโอนคืนให้หลังอนุมัติ เลือกแบบนี้เมื่อซื้อของด้วยเงินตัวเอง'}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <AlertCircle className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
              {isEn
                ? 'Advance claims always default to "Company Money" (the company is sending money out — there\'s nothing personal to reimburse).'
                : 'ใบเบิก "ทดลองจ่าย" จะใช้แหล่งเงิน "บริษัท" เสมอ (บริษัทจ่ายเงินล่วงหน้าให้ — ไม่ใช่การ reimburse)'}
            </p>
          </div>
        </div>

        {/* ── Normal flow (event / other) ─────────────────────────── */}
        <div id="finance-normal" className="scroll-mt-6">
          <SectionHeader
            icon={<Send className="h-4 w-4" />}
            title={isEn ? 'Normal flow — Event / Other' : 'Flow ปกติ — งานอีเวนต์ / ค่าอื่นๆ'}
            color="emerald"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* User column */}
            <RoleCard
              role="user"
              title={isEn ? 'User (Claimant)' : 'User (ผู้เบิก)'}
              steps={isEn ? [
                { n: 1, label: 'Create claim at /finance/new', tag: 'draft' },
                { n: 2, label: 'Pick funding source: company money OR personal (reimbursement)', tag: 'funding_source' },
                { n: 3, label: 'Fill in category, amount, VAT/WHT, attach receipt, bank info', tag: null },
                { n: 4, label: 'Click "Submit for approval"', tag: 'draft → pending' },
                { n: 5, label: 'While waiting, can still cancel', tag: 'pending → cancelled' },
                { n: 6, label: 'If admin requests tax invoice → upload paired (file + number)', tag: 'waiting_tax_invoice → approved (auto)' },
                { n: 7, label: 'If rejected → see reason, create new claim (old one is locked)', tag: null },
              ] : [
                { n: 1, label: 'สร้างใบเบิกที่ /finance/new', tag: 'draft' },
                { n: 2, label: 'เลือก "แหล่งเงิน": เงินบริษัท หรือ เงินส่วนตัว (เบิกย้อนหลัง)', tag: 'funding_source' },
                { n: 3, label: 'กรอก: หัวข้อ, หมวดหมู่, ยอด, VAT/WHT, แนบใบเสร็จ, เลขบัญชี', tag: null },
                { n: 4, label: 'กด "ส่งอนุมัติ"', tag: 'draft → pending' },
                { n: 5, label: 'ระหว่างรอ — ยกเลิกได้', tag: 'pending → cancelled' },
                { n: 6, label: 'ถ้า admin ขอใบกำกับภาษี → แนบเป็นคู่ (ไฟล์ + เลขที่) ได้หลายใบ', tag: 'waiting_tax_invoice → approved (auto)' },
                { n: 7, label: 'ถ้าถูกปฏิเสธ → ดูเหตุผล + สร้างใบใหม่ (แก้ใบเก่าไม่ได้)', tag: null },
              ]}
            />

            {/* Admin column */}
            <RoleCard
              role="admin"
              title={isEn ? 'Admin' : 'Admin'}
              steps={isEn ? [
                { n: 1, label: 'Review pending claims in queue', tag: null },
                { n: 2, label: 'Approve directly', tag: 'pending → approved' },
                { n: 3, label: 'Or: request tax invoice first', tag: 'pending → waiting_tax_invoice' },
                { n: 4, label: 'Or: queue for month-end payout', tag: 'pending → pending_month_end' },
                { n: 5, label: 'Or: reject (with reason)', tag: 'pending → rejected' },
                { n: 6, label: 'After payout → mark "Paid"', tag: '→ paid (terminal)' },
                { n: 7, label: 'Override any status with reason (admin-only)', tag: 'any → any' },
              ] : [
                { n: 1, label: 'รับใบเบิกในคิว "รออนุมัติ"', tag: null },
                { n: 2, label: 'อนุมัติเลย', tag: 'pending → approved' },
                { n: 3, label: 'หรือ: ขอใบกำกับภาษีก่อน', tag: 'pending → waiting_tax_invoice' },
                { n: 4, label: 'หรือ: เข้าคิวจ่ายสิ้นเดือน', tag: 'pending → pending_month_end' },
                { n: 5, label: 'หรือ: ปฏิเสธ (ใส่เหตุผล)', tag: 'pending → rejected' },
                { n: 6, label: 'หลังจ่ายเงินออก → กด "ชำระแล้ว"', tag: '→ paid (terminal)' },
                { n: 7, label: 'Override สถานะได้ทุกช่อง (พร้อมเหตุผล)', tag: 'any → any' },
              ]}
            />
          </div>
        </div>

        {/* ── Advance flow ───────────────────────────────────────── */}
        <div id="finance-advance" className="scroll-mt-6">
          <SectionHeader
            icon={<Wallet className="h-4 w-4" />}
            title={isEn ? 'Advance flow — 2 phases' : 'Flow เบิกทดลองจ่าย — 2 ช่วง'}
            color="amber"
          />

          {/* Phase 1 */}
          <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500 text-white text-xs font-bold">1</span>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {isEn ? 'Phase 1 — Get the advance' : 'ช่วง 1 — เบิกเงินล่วงหน้า'}
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniCard
                role="user"
                lines={isEn ? [
                  '1. Create claim, select type "Advance"',
                  '2. Enter advance amount requested',
                  '3. Submit — NO receipt needed yet',
                ] : [
                  '1. สร้างใบเบิก เลือกประเภท "เบิกทดลองจ่าย"',
                  '2. ใส่ยอดที่ขอเบิกล่วงหน้า',
                  '3. ส่งอนุมัติ — ไม่ต้องแนบใบเสร็จ',
                ]}
              />
              <MiniCard
                role="admin"
                lines={isEn ? [
                  '1. Review + approve',
                  '2. Transfer advance to user',
                  '3. Mark "Paid" (status: paid)',
                ] : [
                  '1. ตรวจ + อนุมัติ',
                  '2. โอนเงินล่วงหน้าให้ user',
                  '3. กด "ชำระแล้ว" (status: paid)',
                ]}
              />
            </div>
          </div>

          {/* Phase 2 */}
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/40 dark:bg-cyan-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-600 text-white text-xs font-bold">2</span>
              <h4 className="text-sm font-bold text-cyan-900 dark:text-cyan-200">
                {isEn ? 'Phase 2 — Settle actual spend + refund' : 'ช่วง 2 — เคลียร์ค่าใช้จ่ายจริง + คืนเงิน'}
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniCard
                role="user"
                lines={isEn ? [
                  '1. Open claim → "Update actual spend" box',
                  '2. Add line items (fuel, meals, etc.) — quick-add presets available',
                  '3. Attach receipts',
                  '4. System auto-calculates refund',
                  '5. If refund > 0 → transfer back + attach refund slip',
                  '6. Click "Save update" (can save multiple times — each saves to log)',
                  `7. ${isEn ? 'After save, items are locked — click ✏️ edit to modify' : 'หลังบันทึก — ข้อมูลถูกล็อก ต้องกด ✏️ แก้ไขก่อน'}`,
                ] : [
                  '1. เปิดใบเบิกเดิม → กล่อง "อัพเดทค่าใช้จ่ายจริง"',
                  '2. เพิ่มรายการทีละรายการ (ค่าน้ำมัน, อาหาร, ฯลฯ) — มี quick-add preset',
                  '3. แนบสลิป/ใบเสร็จ',
                  '4. ระบบคำนวณเงินคืนอัตโนมัติ',
                  '5. ถ้ามีเงินคืน → โอนคืนบริษัท + แนบสลิปโอนคืน',
                  '6. กด "บันทึกการอัพเดท" (บันทึกได้หลายครั้ง — log เก็บทุกครั้ง)',
                  '7. หลังบันทึก — รายการถูกล็อก ต้องกดไอคอน ✏️ ก่อนแก้ไข',
                ]}
              />
              <MiniCard
                role="admin"
                lines={isEn ? [
                  '1. Review line items + receipts + refund slip',
                  '2. Verify refund was actually received in company account',
                  '3. If refund > 0 → click "Confirm Received"',
                  '4. Status → refund_confirmed (TERMINAL, permanently locked)',
                  '5. If no refund (used all) → stays "paid" as usual',
                ] : [
                  '1. ตรวจรายการ + ใบเสร็จ + สลิปโอนคืน',
                  '2. เช็คว่าได้รับเงินคืนในบัญชีบริษัทจริง',
                  '3. ถ้า refund > 0 → กดปุ่ม "ยืนยันรับเงิน"',
                  '4. Status → refund_confirmed (TERMINAL, ล็อกถาวร)',
                  '5. ถ้าไม่มีเงินคืน (ใช้หมด) → อยู่ paid ต่อไปตามปกติ',
                ]}
              />
            </div>
          </div>
        </div>

        {/* ── Tax invoice (paired upload) ─────────────────────────── */}
        <div id="finance-tax-invoice" className="scroll-mt-6">
          <SectionHeader
            icon={<Receipt className="h-4 w-4" />}
            title={isEn ? 'Tax invoice — paired upload' : 'ใบกำกับภาษี — แนบไฟล์คู่กับเลขที่'}
          />
          <div className="rounded-xl border-2 border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 p-4 space-y-3">
            <p className="text-xs text-sky-800 dark:text-sky-300 leading-relaxed">
              {isEn
                ? 'When admin requests a tax invoice (status: waiting_tax_invoice), the upload box on the claim page lets you add multiple invoices — each row pairs one file with its own invoice number.'
                : 'เมื่อ admin ขอใบกำกับภาษี (สถานะ waiting_tax_invoice) ที่หน้าใบเบิกจะมีกล่องอัพโหลดที่เพิ่มได้หลายรายการ — แต่ละแถวคือใบกำกับ 1 ใบ พร้อมเลขที่ของตัวเอง'}
            </p>

            {/* Mock paired row */}
            <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-900 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400">
                  {isEn ? 'Invoice #1' : 'ใบกำกับ #1'}
                </span>
                <X className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 mb-1 flex items-center gap-1">
                    <Hash className="h-2.5 w-2.5" />
                    {isEn ? 'Tax Invoice Number' : 'เลขที่ใบกำกับภาษี'}
                  </label>
                  <div className="px-2.5 py-1.5 text-xs font-mono border border-sky-200 dark:border-sky-800 rounded-md bg-zinc-50 dark:bg-zinc-800 text-zinc-400">
                    INV-2026-0001
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 mb-1 flex items-center gap-1">
                    <Upload className="h-2.5 w-2.5" />
                    {isEn ? 'Invoice File' : 'ไฟล์ใบกำกับภาษี'}
                  </label>
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-sky-50 dark:bg-sky-950/40 rounded-md border border-sky-200 dark:border-sky-800">
                    <FileText className="h-3 w-3 text-sky-500" />
                    <span className="text-[11px] text-zinc-500">invoice-1.pdf</span>
                  </div>
                </div>
              </div>
            </div>

            <ul className="space-y-1.5 text-xs text-sky-900 dark:text-sky-200">
              <li className="flex items-start gap-2">
                <span className="text-sky-500">•</span>
                <span>
                  {isEn
                    ? 'Click "+ Add another invoice" to add more rows — no limit.'
                    : 'กด "+ เพิ่มใบกำกับภาษีอีก" เพื่อเพิ่มรายการ — ไม่จำกัดจำนวน'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">•</span>
                <span>
                  {isEn
                    ? 'You can have only a number, only a file, or both — at least one is required per row.'
                    : 'จะมีเฉพาะเลขที่ หรือเฉพาะไฟล์ก็ได้ — แต่อย่างน้อยต้องกรอก 1 อย่างต่อแถว'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">•</span>
                <span>
                  {isEn
                    ? 'After save, status auto-transitions back to "approved" — admin can then mark paid.'
                    : 'หลังบันทึก status จะเปลี่ยนกลับเป็น approved อัตโนมัติ — admin กดชำระเงินได้ต่อ'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-sky-500">•</span>
                <span>
                  {isEn
                    ? 'To edit/remove invoice numbers later: open the claim → "Tax Invoices" section → click "Edit".'
                    : 'แก้ไข/ลบเลขที่ภายหลัง: เปิดใบเบิก → ส่วน "ใบกำกับภาษี" → กดปุ่ม "แก้ไข"'}
                </span>
              </li>
            </ul>

            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Tax invoices are different from receipts. Use the "Receipts / Additional Documents" box (in Edit mode) for everything else — boarding passes, generic receipts, etc.'
                  : 'ใบกำกับภาษี ≠ ใบเสร็จทั่วไป — ใบเสร็จ/เอกสารอื่น ใช้กล่อง "ใบเสร็จ / เอกสารเพิ่มเติม" ในโหมดแก้ไข แทน'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Document checklist ─────────────────────────────────── */}
        <div id="finance-checklist" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Document checklist — pre-accounting handover' : 'ตรวจเอกสารก่อนส่งสำนักงานบัญชี'}
          />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
            {isEn
              ? 'Every claim has a checklist panel showing whether all required documents are in. Use it to spot incomplete claims before sending to accounting.'
              : 'ใบเบิกทุกใบมี panel checklist บอกว่าเอกสารครบหรือยัง — ใช้คัดกรองใบเบิกที่ยังไม่ครบก่อนส่งบัญชี'}
          </p>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Document' : 'เอกสาร'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'When required?' : 'ต้องมีเมื่อ?'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Counts as ✓ when' : 'นับ ✓ เมื่อ'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <ChecklistRow
                  emoji="📄"
                  label={isEn ? 'Receipt' : 'ใบเสร็จ'}
                  required={isEn ? 'Always (every claim)' : 'เสมอ (ทุกใบเบิก)'}
                  passes={isEn ? '≥1 receipt file uploaded (or actual_receipt for advance)' : 'แนบไฟล์ใบเสร็จอย่างน้อย 1 ไฟล์ (หรือ actual_receipt สำหรับ advance)'}
                />
                <ChecklistRow
                  emoji="🧾"
                  label={isEn ? 'Tax invoice' : 'ใบกำกับภาษี'}
                  required={isEn ? 'When status was waiting_tax_invoice OR a tax invoice was attached' : 'เมื่อสถานะเคยเป็น waiting_tax_invoice หรือเคยแนบใบกำกับ'}
                  passes={isEn ? '≥1 file uploaded OR ≥1 invoice number entered' : 'แนบไฟล์อย่างน้อย 1 ไฟล์ หรือ มีเลขที่ใบกำกับอย่างน้อย 1 รายการ'}
                />
                <ChecklistRow
                  emoji="🏦"
                  label={isEn ? 'Refund slip' : 'สลิปคืนเงิน'}
                  required={isEn ? 'Advance claims with refund > 0 only' : 'เฉพาะ advance ที่ refund > 0'}
                  passes={isEn ? '≥1 refund slip uploaded' : 'แนบสลิปการโอนคืนอย่างน้อย 1 ไฟล์'}
                />
                <ChecklistRow
                  emoji="✅"
                  label={isEn ? 'Refund confirmed' : 'ยืนยันคืนเงินแล้ว'}
                  required={isEn ? 'Advance claims with refund > 0 only' : 'เฉพาะ advance ที่ refund > 0'}
                  passes={isEn ? 'Status = refund_confirmed (admin clicked "Confirm received")' : 'สถานะ refund_confirmed (admin กด "ยืนยันรับเงิน")'}
                />
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            {isEn
              ? 'When all required boxes are ✓, the claim shows a green "READY" badge — safe to hand over to accounting. The audit report can filter to show only ready or only incomplete claims.'
              : 'เมื่อทุกช่องที่จำเป็น ✓ ใบเบิกจะแสดง badge สีเขียว "พร้อมส่งบัญชี" — รายงานตรวจสอบ filter ให้เห็นเฉพาะที่พร้อม/ที่ยังไม่ครบได้'}
          </p>
        </div>

        {/* ── Audit Report (/finance/overview) ────────────────────── */}
        <div id="finance-report" className="scroll-mt-6">
          <SectionHeader
            icon={<FileSpreadsheet className="h-4 w-4" />}
            title={isEn ? 'Audit Report — /finance/overview' : 'รายงานตรวจสอบ — /finance/overview'}
          />
          <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 space-y-3">
            <p className="text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
              {isEn
                ? 'A table-style audit page used as a cover sheet before sending claims to accounting. Filter by date range and status, verify document checklist per row, then export.'
                : 'หน้ารายงานตาราง ใช้เป็นใบปะหน้าตรวจเช็คก่อนส่งสำนักงานบัญชี — filter ช่วงวันที่ + สถานะ ตรวจ checklist รายแถว แล้ว export'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="📅 ช่วงเวลา (Range)"
                titleEn="📅 Date range"
                lines={isEn
                  ? ['Today / 7 Days / Month / Year / Custom (date picker) / All']
                  : ['วันนี้ / 7 วัน / เดือนนี้ / ปีนี้ / กำหนดเอง (เลือกวัน) / ทั้งหมด']}
              />
              <FeatureBlock
                titleTh="🔍 ตัวกรอง"
                titleEn="🔍 Filters"
                lines={isEn
                  ? [
                      'Status (multi-select + "All Statuses")',
                      'Type: event / other / advance',
                      'Funding: company / personal',
                      'Document status: ready / incomplete',
                      'Category, search by claim no./name/tax invoice number',
                    ]
                  : [
                      'สถานะ (เลือกหลายอันได้ + ปุ่ม "ทุกสถานะ")',
                      'ประเภท: อีเวนต์ / อื่นๆ / ทดลองจ่าย',
                      'แหล่งเงิน: บริษัท / ส่วนตัว',
                      'เอกสาร: ครบ / ยังไม่ครบ',
                      'หมวดหมู่ + ค้นหาตามเลขที่/ชื่อ/เลขใบกำกับ',
                    ]}
              />
              <FeatureBlock
                titleTh="📊 Summary cards"
                titleEn="📊 Summary cards"
                lines={isEn
                  ? [
                      'Total claims, total amount, net paid',
                      'Ready vs incomplete count',
                      'Personal-funded count',
                    ]
                  : [
                      'จำนวนใบเบิก / ยอดรวม / จ่ายจริง',
                      'พร้อมส่งบัญชี vs ยังไม่ครบ',
                      'ที่ใช้เงินส่วนตัว',
                    ]}
              />
              <FeatureBlock
                titleTh="📥 Export"
                titleEn="📥 Export"
                lines={isEn
                  ? [
                      'Excel (.xlsx) — 18 columns including checklist',
                      'PDF — printable cover sheet with summary + table',
                    ]
                  : [
                      'Excel (.xlsx) — 18 คอลัมน์รวม checklist',
                      'PDF — ใบปะหน้าพร้อม summary + ตาราง',
                    ]}
              />
            </div>

            <div className="flex items-start gap-2 p-2.5 bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900 rounded-lg">
              <span className="text-base">💡</span>
              <p className="text-[11px] text-emerald-900 dark:text-emerald-200">
                {isEn
                  ? 'Workflow: filter by month → set "Document status: incomplete" → fix the gaps → switch to "ready" → export Excel/PDF as the cover sheet.'
                  : 'วิธีใช้: filter เดือน → ตั้ง "เอกสาร: ยังไม่ครบ" → ตามแก้ → สลับเป็น "ครบ" → export Excel/PDF เป็นใบปะหน้าส่งบัญชี'}
              </p>
            </div>
          </div>
        </div>

        {/* ── WHT 3% Summary (/finance/download) ──────────────────── */}
        <div id="finance-wht" className="scroll-mt-6">
          <SectionHeader
            icon={<Percent className="h-4 w-4" />}
            title={isEn ? 'WHT 3% Summary — /finance/download' : 'สรุปหัก ณ ที่จ่าย — /finance/download'}
          />
          <div className="rounded-xl border-2 border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-3">
            <p className="text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
              {isEn
                ? 'Per-person summary of withholding tax for issuing WHT certificates and filing ภ.ง.ด.3 / 53. Pulls national_id, address, and bank info from each user\'s profile.'
                : 'สรุปหัก ณ ที่จ่าย รายบุคคล สำหรับออกหนังสือรับรองและยื่น ภ.ง.ด.3 / 53 — ดึงเลขบัตร ปชช. + ที่อยู่ + เลขบัญชีจากโปรไฟล์ผู้เบิก'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FeatureBlock
                titleTh="📋 หัวคอลัมน์"
                titleEn="📋 Columns"
                lines={isEn
                  ? [
                      'Full name + nickname',
                      'National ID + address',
                      'Bank name + account no. + holder',
                      'Count, gross, WHT 3%, net',
                    ]
                  : [
                      'ชื่อ-สกุล + ชื่อเล่น',
                      'เลขบัตรประชาชน + ที่อยู่',
                      'ธนาคาร + เลขบัญชี + ชื่อบัญชี',
                      'จำนวนรายการ / ยอดรวม / หัก 3% / จ่ายจริง',
                    ]}
              />
              <FeatureBlock
                titleTh="🎯 ใช้งานเมื่อ"
                titleEn="🎯 When to use"
                lines={isEn
                  ? [
                      'Month-end: export WHT for accounting filing',
                      'Issuing WHT certificates to staff/freelancers',
                      'Quick filter: status (paid/approved/...) + month',
                    ]
                  : [
                      'สิ้นเดือน — export ส่งสำนักงานบัญชี',
                      'ออกหนังสือรับรองหัก ณ ที่จ่ายให้พนักงาน/freelancer',
                      'Filter: สถานะ + เดือน',
                    ]}
              />
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Only includes claims with WHT > 0%. If the page is empty, no claim in the filter has withholding tax applied.'
                  : 'แสดงเฉพาะใบเบิกที่ตั้งค่าหัก ณ ที่จ่าย > 0% เท่านั้น — ถ้าว่าง = ไม่มีใบเบิกที่หัก ในช่วงที่เลือก'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Status reference ────────────────────────────────────── */}
        <div id="finance-status" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? 'All statuses' : 'สถานะทั้งหมด'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Status' : 'สถานะ'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Meaning' : 'ความหมาย'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold hidden sm:table-cell">{isEn ? 'Terminal?' : 'ปลายทาง?'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <StatusRow emoji="📝" color="#6b7280" label={isEn ? 'draft' : 'แบบร่าง'} code="draft" meaning={isEn ? 'Not yet submitted' : 'ยังไม่ส่ง'} />
                <StatusRow emoji="⏳" color="#f59e0b" label={isEn ? 'pending' : 'รออนุมัติ'} code="pending" meaning={isEn ? 'Awaiting admin review' : 'รอ admin ตรวจ'} />
                <StatusRow emoji="✅" color="#22c55e" label={isEn ? 'approved' : 'อนุมัติแล้ว'} code="approved" meaning={isEn ? 'Approved, awaiting payout' : 'อนุมัติแล้ว รอจ่าย'} />
                <StatusRow emoji="🧾" color="#0ea5e9" label={isEn ? 'waiting_tax_invoice' : 'รอใบกำกับภาษี'} code="waiting_tax_invoice" meaning={isEn ? 'Waiting for tax invoice upload' : 'รอ user แนบใบกำกับภาษี'} />
                <StatusRow emoji="📅" color="#8b5cf6" label={isEn ? 'pending_month_end' : 'รอจ่ายสิ้นเดือน'} code="pending_month_end" meaning={isEn ? 'Queued for month-end payout' : 'รวมจ่ายสิ้นเดือน'} />
                <StatusRow emoji="💵" color="#14b8a6" label={isEn ? 'paid' : 'ชำระเงินแล้ว'} code="paid" meaning={isEn ? 'Payout complete' : 'จ่ายเงินออกแล้ว'} terminal />
                <StatusRow emoji="💸" color="#0891b2" label={isEn ? 'refund_confirmed' : 'คืนเงินบริษัทแล้ว'} code="refund_confirmed" meaning={isEn ? 'Refund confirmed (advance only)' : 'ยืนยันรับเงินคืน (advance only)'} terminal />
                <StatusRow emoji="❌" color="#ef4444" label={isEn ? 'rejected' : 'ปฏิเสธ'} code="rejected" meaning={isEn ? 'Rejected with reason' : 'ปฏิเสธ (มีเหตุผล)'} terminal />
                <StatusRow emoji="🚫" color="#94a3b8" label={isEn ? 'cancelled' : 'ยกเลิก'} code="cancelled" meaning={isEn ? 'Cancelled by user' : 'user ยกเลิก'} terminal />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="finance-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Owner' : 'เจ้าของ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Other user' : 'user อื่น'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Admin' : 'Admin'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'Create claim' : 'สร้างใบเบิก'}      owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Edit claim' : 'แก้ใบเบิก'}           owner="partial" other="no" admin="yes" ownerNote={isEn ? 'only draft/pending' : 'เฉพาะ draft/pending'} adminNote={isEn ? 'anytime' : 'แก้ได้ตลอด'} />
                <PermissionRow label={isEn ? 'Submit for approval' : 'ส่งอนุมัติ'}   owner="yes" other="—"   admin="—" />
                <PermissionRow label={isEn ? 'Cancel' : 'ยกเลิก'}                   owner="partial" other="no" admin="—" ownerNote={isEn ? 'only draft/pending' : 'เฉพาะ draft/pending'} />
                <PermissionRow label={isEn ? 'Approve / reject' : 'อนุมัติ/ปฏิเสธ'}  owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Mark as paid' : 'กดชำระเงิน'}        owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Override status' : 'Override status'} owner="no"  other="no" admin="yes" adminNote={isEn ? 'with reason' : 'ต้องใส่เหตุผล'} />
                <PermissionRow label={isEn ? 'Settle advance' : 'อัพเดทค่าใช้จ่ายจริง (advance)'} owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Confirm refund received' : 'ยืนยันรับเงินคืน (advance)'} owner="no" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'View other users\' claims' : 'ดูใบเบิกคนอื่น'} owner="—" other="no" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Notifications ──────────────────────────────────────── */}
        <div id="finance-notifications" className="scroll-mt-6">
          <SectionHeader
            icon={<Bell className="h-4 w-4" />}
            title={isEn ? 'Notifications the system sends' : 'การแจ้งเตือนที่ระบบส่ง'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <NotifRow emoji="📨" code="expense_submitted" labelTh="มีใบเบิกยื่นขออนุมัติ" labelEn="Claim submitted" toTh="Admin" toEn="Admin" isEn={isEn} />
            <NotifRow emoji="✅" code="expense_approved" labelTh="ใบเบิกถูกอนุมัติ" labelEn="Claim approved" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="❌" code="expense_rejected" labelTh="ใบเบิกถูกปฏิเสธ" labelEn="Claim rejected" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="🧾" code="expense_waiting_tax_invoice" labelTh="ต้องแนบใบกำกับภาษี" labelEn="Tax invoice required" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="📤" code="expense_tax_invoice_uploaded" labelTh="แนบใบกำกับภาษีแล้ว" labelEn="Tax invoice uploaded" toTh="Admin" toEn="Admin" isEn={isEn} />
            <NotifRow emoji="💵" code="expense_paid" labelTh="ใบเบิกจ่ายเงินแล้ว" labelEn="Claim paid" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="💸" code="expense_refund_confirmed" labelTh="ยืนยันรับเงินคืนแล้ว" labelEn="Refund confirmed" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
          </div>
        </div>

        {/* ── Menu shortcuts ─────────────────────────────────────── */}
        <div id="finance-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/finance"           labelEn="All claims + checklist badges" labelTh="รายการใบเบิก + checklist" />
            <MenuLink href="/finance/new"        labelEn="Create new claim"             labelTh="สร้างใบเบิกใหม่" />
            <MenuLink href="/finance/overview"   labelEn="Audit Report (cover sheet)"   labelTh="รายงานตรวจสอบ (ใบปะหน้า)" />
            <MenuLink href="/finance/payouts"    labelEn="Payout queue (admin)"         labelTh="คิวรอจ่ายเงิน (admin)" />
            <MenuLink href="/finance/archive"    labelEn="Archive (closed)"             labelTh="คลังใบเบิกปิดเคส" />
            <MenuLink href="/finance/download"   labelEn="WHT 3% per-person summary"    labelTh="สรุปหัก ณ ที่จ่ายรายบุคคล" />
            <MenuLink href="/finance/settings"   labelEn="Category settings (admin)"    labelTh="ตั้งค่าหมวดหมู่ (admin)" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: KPI
          ════════════════════════════════════════════════════════════════ */}
      {view === 'kpi' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[7]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[7]} isEn={isEn} />

        {/* ── Intro ───────────────────────────────────────────────── */}
        <div id="kpi-intro" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-zinc-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-600 text-white">
                <Target className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                  {isEn ? 'KPI — performance management' : 'KPI — บริหารผลงาน'}
                </p>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-400">
                  {isEn
                    ? 'Admin sets targets per person/period, staff submit actuals; system computes achievement % + weighted scores.'
                    : 'admin ตั้งเป้าให้แต่ละคน/ช่วงเวลา · staff ส่งผลจริง · ระบบคำนวณ achievement % + คะแนนถ่วงน้ำหนัก'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Currently the actuals are submitted manually (not auto-pulled from CRM/Events/Finance). Staff types in their own number; admin can also enter on their behalf.'
                  : 'ตอนนี้ค่า actual ใส่เองด้วยมือ (ยังไม่ดึงอัตโนมัติจาก CRM/Events/Finance) — staff กรอกของตัวเอง admin ก็กรอกแทนได้'}
              </p>
            </div>
          </div>
        </div>

        {/* ── 3 modes ─────────────────────────────────────────────── */}
        <div id="kpi-modes" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? '3 template modes' : '3 โหมดของ template'}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TypeCard
              emoji="✅"
              title={isEn ? 'Task' : 'Task (ทำหรือไม่ทำ)'}
              subtitle="mode: task"
              desc={isEn ? 'Boolean / count of tasks done. Target = "should hit X actions per period".' : 'จำนวนงานที่ทำ — target = "ต้องทำให้ได้ X ครั้งต่อรอบ"'}
              receipt={isEn ? 'count' : 'นับจำนวน'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="💰"
              title={isEn ? 'Sales' : 'Sales (ยอดขาย)'}
              subtitle="mode: sales"
              desc={isEn ? 'Deal count or revenue. Target = "close X deals" or "X baht in sales".' : 'จำนวนดีล หรือยอดขาย — target = "ปิด X ดีล" หรือ "ยอดขาย X บาท"'}
              receipt={isEn ? 'amount or count' : 'ยอด หรือ จำนวน'}
              receiptColor="emerald"
            />
            <TypeCard
              emoji="📉"
              title={isEn ? 'Cost reduction' : 'ลดต้นทุน'}
              subtitle="mode: cost_reduction"
              desc={isEn ? 'Savings achieved. Target = "reduce cost by X%".' : 'ลดต้นทุน — target = "ลดได้ X %"'}
              receipt={isEn ? 'saving %' : '% ที่ลดได้'}
              receiptColor="emerald"
            />
          </div>
        </div>

        {/* ── Workflow ────────────────────────────────────────────── */}
        <div id="kpi-flow" className="scroll-mt-6 space-y-4">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Workflow' : 'Flow ทำงาน'}
            color="emerald"
          />
          <FlowchartBox
            title={isEn ? 'Template → assign → evaluate → score' : 'Template → กำหนดให้คน → ประเมิน → คะแนน'}
            color="purple"
          >
            <FlowNode variant="admin" emoji="📋" title={isEn ? 'Admin creates template' : 'Admin สร้าง template'} subtitle="/kpi/templates" tag={isEn ? 'mode + default target' : 'mode + target'} />
            <FlowArrow />
            <FlowNode variant="admin" emoji="🎯" title={isEn ? 'Assign to staff with cycle + weight' : 'กำหนดให้ staff พร้อม cycle + weight'} subtitle="/kpi/assignments" tag="weight 0–100%" />
            <FlowArrow label={isEn ? 'period runs (week / month / year)' : 'รอบ active (สัปดาห์ / เดือน / ปี)'} />
            <FlowNode variant="user" emoji="📝" title={isEn ? 'Staff submits actual via dashboard' : 'staff กรอกผลจริงในหน้า dashboard'} subtitle="/kpi/dashboard" />
            <FlowArrow label={isEn ? 'or admin submits' : 'หรือ admin ใส่ให้'} />
            <FlowNode variant="admin" emoji="🧮" title={isEn ? 'Auto-compute achievement % + score' : 'ระบบคำนวณ achievement % + คะแนน'} subtitle={isEn ? 'achievement = actual ÷ target × 100 · score = clamp(0, 100)' : 'achievement = actual ÷ target × 100 · score = clamp(0, 100)'} />
            <FlowArrow />
            <FlowNode variant="success" emoji="🏆" title={isEn ? 'Weighted score on leaderboard' : 'คะแนนถ่วงน้ำหนักขึ้น leaderboard'} subtitle={isEn ? 'Σ(achievement × weight) ÷ Σ(weight)' : 'Σ(achievement × weight) ÷ Σ(weight)'} />
          </FlowchartBox>
        </div>

        {/* ── Cycles ──────────────────────────────────────────────── */}
        <div id="kpi-cycles" className="scroll-mt-6">
          <SectionHeader
            icon={<Repeat className="h-4 w-4" />}
            title={isEn ? 'Cycles — weekly / monthly / yearly' : 'รอบเวลา — สัปดาห์ / เดือน / ปี'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FeatureBlock titleTh="📅 weekly"  titleEn="📅 weekly"  lines={isEn ? ['Resets every Friday',           'Use for high-frequency targets']     : ['reset ทุกวันศุกร์',           'ใช้กับเป้าที่ทำบ่อยๆ']} />
            <FeatureBlock titleTh="🗓 monthly" titleEn="🗓 monthly" lines={isEn ? ['Resets on the 25th',             'Default for most KPIs (sales, tasks)'] : ['reset ทุกวันที่ 25 ของเดือน', 'ใช้เป็น default สำหรับ KPI ส่วนใหญ่']} />
            <FeatureBlock titleTh="📆 yearly"  titleEn="📆 yearly"  lines={isEn ? ['Resets at year-end',             'Long-term goals + bonus calc']        : ['reset สิ้นปี',                'เป้าระยะยาว + คำนวณ bonus']} />
          </div>
          <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
            {isEn
              ? 'Period model: 1 assignment = 1 staff + 1 KPI + 1 full period (period_start → period_end). Multiple submissions in the same period are summed.'
              : 'รูปแบบ: 1 assignment = 1 staff + 1 KPI + 1 รอบเต็ม (period_start → period_end) — ถ้า submit หลายครั้งในรอบเดียวระบบบวกให้'}
          </p>
        </div>

        {/* ── Scoring formula ─────────────────────────────────────── */}
        <div id="kpi-scoring" className="scroll-mt-6">
          <SectionHeader
            icon={<Gauge className="h-4 w-4" />}
            title={isEn ? 'Scoring formula' : 'สูตรคำนวณคะแนน'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-zinc-900 p-4 space-y-3">
            <div className="rounded-lg border border-indigo-200/60 dark:border-indigo-900/40 bg-white dark:bg-zinc-900 p-3 space-y-2 text-xs font-mono text-zinc-700 dark:text-zinc-300">
              <p><span className="text-indigo-600 dark:text-indigo-400">difference</span> = actual − target</p>
              <p><span className="text-indigo-600 dark:text-indigo-400">achievement_pct</span> = (actual ÷ target) × 100</p>
              <p><span className="text-indigo-600 dark:text-indigo-400">score</span> = clamp(round(achievement_pct), 0, 100)</p>
              <p className="pt-2 border-t border-zinc-200 dark:border-zinc-800"><span className="text-indigo-600 dark:text-indigo-400">weighted_score</span> = Σ(achievement_pct × weight) ÷ Σ(weight)</p>
            </div>
            <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2"><span className="text-indigo-500">•</span><span>{isEn ? 'Score is capped at 100 — over-achievement still counts as 100' : 'คะแนนสูงสุด 100 — ทำเกินเป้าก็ได้ 100 (ไม่ทบ)'}</span></li>
              <li className="flex items-start gap-2"><span className="text-indigo-500">•</span><span>{isEn ? 'Color coding: ≥100% green · 70-100% orange · <70% red' : 'สีตามคะแนน: ≥100% เขียว · 70-100% ส้ม · <70% แดง'}</span></li>
              <li className="flex items-start gap-2"><span className="text-indigo-500">•</span><span>{isEn ? 'Weighted score lets you fairly compare roles (e.g., sales 60% vs support 40%)' : 'คะแนนถ่วงน้ำหนักทำให้เทียบบทบาทต่างกันได้ (เช่น sales 60% vs support 40%)'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Self-evaluation ─────────────────────────────────────── */}
        <div id="kpi-self-eval" className="scroll-mt-6">
          <SectionHeader
            icon={<User className="h-4 w-4" />}
            title={isEn ? 'Self-evaluation — staff dashboard' : 'ประเมินตัวเอง — dashboard ของ staff'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleCard
              role="user"
              title={isEn ? 'How staff submit' : 'staff ส่งผลยังไง'}
              steps={isEn ? [
                { n: 1, label: 'Open /kpi/dashboard — see your assigned KPIs as cards', tag: null },
                { n: 2, label: 'Each card shows target / current actual / achievement %', tag: null },
                { n: 3, label: 'Click "ประเมิน" — modal opens with auto-preview', tag: null },
                { n: 4, label: 'Enter actual_value + optional comment + submit', tag: null },
                { n: 5, label: 'Score updates immediately + admin gets notification', tag: null },
              ] : [
                { n: 1, label: 'เปิด /kpi/dashboard เห็น KPI ของตัวเองเป็น card', tag: null },
                { n: 2, label: 'แต่ละ card บอก target / actual / achievement %', tag: null },
                { n: 3, label: 'กด "ประเมิน" → modal เปิดพร้อม preview', tag: null },
                { n: 4, label: 'ใส่ค่า actual + comment (ไม่บังคับ) แล้วส่ง', tag: null },
                { n: 5, label: 'คะแนนอัปเดตทันที + admin ได้แจ้งเตือน', tag: null },
              ]}
            />
            <FeatureBlock
              titleTh="🎯 ตัวการ์ด"
              titleEn="🎯 What's on each card"
              lines={isEn
                ? [
                    'Target value + unit',
                    'Current actual (sum of all submissions in period)',
                    'Achievement % gauge ring (color-coded)',
                    'Submission history within the period',
                    'Comment thread (admin can reply)',
                  ]
                : [
                    'ค่า target + หน่วย',
                    'actual ปัจจุบัน (ผลรวมของทุก submission ในรอบ)',
                    'gauge ring แสดง achievement % (สี)',
                    'ประวัติ submission ในรอบนี้',
                    'thread comment (admin reply ได้)',
                  ]}
            />
          </div>
        </div>

        {/* ── Reports ─────────────────────────────────────────────── */}
        <div id="kpi-reports" className="scroll-mt-6">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title={isEn ? 'Reports — /kpi/reports' : 'รายงาน — /kpi/reports'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="🔍 ตัวกรอง"
              titleEn="🔍 Filters"
              lines={isEn
                ? [
                    'Employee (admin-only — sees all)',
                    'Department',
                    'Specific KPI',
                    'Month (from period_start)',
                  ]
                : [
                    'พนักงาน (admin เห็นทุกคน)',
                    'แผนก',
                    'KPI เฉพาะ',
                    'เดือน (อิง period_start)',
                  ]}
            />
            <FeatureBlock
              titleTh="📊 ผลลัพธ์"
              titleEn="📊 Output"
              lines={isEn
                ? [
                    'Summary stats: weighted avg score / achievement %',
                    'Bar chart: target vs actual',
                    'Trend chart: achievement % over time',
                    'User ranking with medals (top 3)',
                    'Detail table per evaluation + comment popover',
                  ]
                : [
                    'สรุป: คะแนนถ่วงน้ำหนักเฉลี่ย / achievement %',
                    'bar chart: target vs actual',
                    'trend chart: achievement % ตามเวลา',
                    'อันดับพนักงานพร้อมเหรียญ (top 3)',
                    'ตาราง detail ต่อ evaluation + popover comment',
                  ]}
            />
          </div>
        </div>

        {/* ── Feedback timeline ───────────────────────────────────── */}
        <div id="kpi-feedback" className="scroll-mt-6">
          <SectionHeader
            icon={<MessagesSquare className="h-4 w-4" />}
            title={isEn ? 'Feedback timeline — reply on evaluations' : 'Feedback timeline — reply ต่อ evaluation'}
            color="emerald"
          />
          <div className="rounded-xl border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Each evaluation can have a thread of replies — useful for coaching, asking for context, or recording follow-up actions. All participants get notified on new replies.'
                : 'แต่ละ evaluation มี thread reply ได้ — ใช้ coaching ขอ context หรือบันทึก follow-up · ทุกคนใน thread ได้แจ้งเตือนเมื่อมี reply ใหม่'}
            </p>
            <ul className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
              <li className="flex items-start gap-2"><span className="text-indigo-500">•</span><span>{isEn ? 'Admin can drop coaching notes per evaluation' : 'admin ใส่ note coaching ต่อ evaluation ได้'}</span></li>
              <li className="flex items-start gap-2"><span className="text-indigo-500">•</span><span>{isEn ? 'Staff can reply to clarify or push back' : 'staff reply กลับเพื่อเคลียร์หรือโต้แย้ง'}</span></li>
              <li className="flex items-start gap-2"><span className="text-indigo-500">•</span><span>{isEn ? '@mention with notification' : '@mention มี notification'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Notifications ───────────────────────────────────────── */}
        <div id="kpi-notifications" className="scroll-mt-6">
          <SectionHeader
            icon={<Bell className="h-4 w-4" />}
            title={isEn ? 'Notifications the system sends' : 'การแจ้งเตือนที่ระบบส่ง'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <NotifRow emoji="🎯" code="kpi_evaluated"        labelTh="ถูกประเมิน KPI"            labelEn="Your KPI was evaluated"   toTh="staff ที่ถูกประเมิน" toEn="Evaluated staff" isEn={isEn} />
            <NotifRow emoji="📝" code="kpi_self_evaluated"   labelTh="staff ส่ง self-eval"        labelEn="Staff self-evaluated"     toTh="admin"                toEn="Admin"           isEn={isEn} />
            <NotifRow emoji="💬" code="kpi_evaluation_reply" labelTh="reply ใหม่ใน evaluation"    labelEn="New reply on evaluation"  toTh="participants"         toEn="Participants"    isEn={isEn} />
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="kpi-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Staff' : 'staff'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'View own dashboard + own reports' : 'ดู dashboard + report ของตัวเอง'} owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Self-evaluate (submit own actual)' : 'ส่งผลของตัวเอง'}                  owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Reply on own evaluation thread' : 'reply ใน thread ของตัวเอง'}         owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'View / filter all employees' : 'ดู / filter พนักงานทุกคน'}              owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Create / edit templates' : 'สร้าง / แก้ template'}                       owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Assign KPI to staff' : 'กำหนด KPI ให้ staff'}                            owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Evaluate any staff (enter actuals)' : 'ประเมินใครก็ได้ (กรอก actual)'} owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Delete evaluations' : 'ลบ evaluation'}                                    owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Export all data (CSV / Excel / JSON)' : 'export ทั้งหมด (CSV / Excel / JSON)'} owner="no" other="no" admin="yes" adminNote={isEn ? 'staff exports own only' : 'staff export ของตัวเองได้'} />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Menu shortcuts ──────────────────────────────────────── */}
        <div id="kpi-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/kpi/dashboard"   labelEn="Dashboard (self-eval)"     labelTh="Dashboard (ประเมินตัวเอง)" />
            <MenuLink href="/kpi/templates"   labelEn="Templates (admin)"          labelTh="Template (admin)" />
            <MenuLink href="/kpi/assignments" labelEn="Assignments (admin)"        labelTh="กำหนด KPI (admin)" />
            <MenuLink href="/kpi/evaluate"    labelEn="Evaluate staff (admin)"     labelTh="ประเมิน staff (admin)" />
            <MenuLink href="/kpi/reports"     labelEn="Reports + leaderboard"      labelTh="รายงาน + leaderboard" />
            <MenuLink href="/kpi/download"    labelEn="Export CSV / Excel / JSON"  labelTh="export CSV / Excel / JSON" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: SECURITY
          ════════════════════════════════════════════════════════════════ */}
      {view === 'security' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[8]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[8]} isEn={isEn} />

        {/* ── Intro ───────────────────────────────────────────────── */}
        <div id="security-intro" className="scroll-mt-6">
          <div className="rounded-xl border-2 border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-zinc-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-red-600 text-white">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-900 dark:text-red-200">
                  {isEn ? 'Security — auth control center' : 'Security — ศูนย์ควบคุมความปลอดภัย'}
                </p>
                <p className="text-[11px] text-red-700 dark:text-red-400">
                  {isEn
                    ? 'Monitor login activity, locked accounts, active sessions, and IP rules in real-time.'
                    : 'ติดตามการ login · บัญชีที่โดนล็อก · session ที่ active · กฎ IP แบบเรียลไทม์'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
              <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                {isEn
                  ? 'Admin only. The page redirects non-admin to /dashboard. Every action (unlock, force-logout, IP rule change) is gated server-side and audit-logged.'
                  : 'admin เท่านั้น — user ทั่วไปจะถูก redirect ไป /dashboard และทุกการกระทำ (unlock / force logout / แก้ IP rule) ถูกตรวจสิทธิ์ที่ server + บันทึก audit log ครบ'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Dashboard overview ──────────────────────────────────── */}
        <div id="security-dashboard" className="scroll-mt-6">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title={isEn ? 'Dashboard — what each card shows' : 'Dashboard — แต่ละการ์ดแสดงอะไร'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="📊 KPI 2 ใบ"
              titleEn="📊 KPI cards"
              lines={isEn
                ? [
                    'Today\'s logins (count)',
                    'This week\'s logins (count)',
                  ]
                : [
                    'login วันนี้ (จำนวน)',
                    'login สัปดาห์นี้ (จำนวน)',
                  ]}
            />
            <FeatureBlock
              titleTh="🔐 4 sections"
              titleEn="🔐 4 main sections"
              lines={isEn
                ? [
                    'Active sessions — users currently online',
                    'Locked accounts — auto-locked after 10 fails',
                    'IP rules — block / allow list',
                    'Security events timeline — last 50 events',
                  ]
                : [
                    'Active sessions — user ที่กำลัง online',
                    'Locked accounts — บัญชีโดนล็อกอัตโนมัติหลัง fail 10 ครั้ง',
                    'IP rules — กฎ block / allow',
                    'Security events timeline — 50 event ล่าสุด',
                  ]}
            />
          </div>
        </div>

        {/* ── Account lockout ─────────────────────────────────────── */}
        <div id="security-lockout" className="scroll-mt-6">
          <SectionHeader
            icon={<UserX className="h-4 w-4" />}
            title={isEn ? 'Account lockout — auto-protection' : 'บัญชีโดนล็อกอัตโนมัติ'}
            color="rose"
          />
          <FlowchartBox
            title={isEn ? 'Lockout flow' : 'Flow การล็อกบัญชี'}
            color="rose"
          >
            <FlowNode variant="user"  emoji="🔑" title={isEn ? 'User enters wrong PIN' : 'user กรอก PIN ผิด'} />
            <FlowArrow label={isEn ? 'fail counter increments' : 'นับ fail เพิ่ม'} />
            <FlowNode variant="decision" emoji="🔢" title={isEn ? 'Reach 10 failed attempts?' : 'ครบ 10 ครั้งหรือยัง?'} />
            <FlowArrow label={isEn ? 'yes' : 'ครบ'} />
            <FlowNode variant="error" emoji="🚫" title={isEn ? 'Account auto-locked for 30 min' : 'บัญชีโดนล็อก 30 นาทีอัตโนมัติ'} subtitle={isEn ? 'profiles.locked_until = now + 30min' : 'profiles.locked_until = now + 30min'} tag="ACCOUNT_LOCKED" />
            <FlowArrow label={isEn ? 'or admin can unlock now' : 'หรือ admin ปลดล็อกได้เลย'} />
            <FlowNode variant="admin" emoji="🔓" title={isEn ? 'Admin: click "Unlock" on the row' : 'Admin: กดปุ่ม "Unlock" ที่แถวนั้น'} subtitle={isEn ? 'resets failed_login_attempts = 0, locked_until = null' : 'reset failed_login_attempts = 0, locked_until = null'} tag="ACCOUNT_UNLOCKED" />
            <FlowArrow />
            <FlowNode variant="success" emoji="✅" title={isEn ? 'User can log in immediately' : 'user เข้าระบบได้ทันที'} />
          </FlowchartBox>
          <div className="mt-3 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              {isEn
                ? 'Locked users see a countdown timer on the login screen. Without admin intervention, the lock auto-releases after 30 minutes.'
                : 'user ที่โดนล็อกจะเห็นนาฬิกานับถอยหลังที่หน้า login — ถ้าไม่มี admin ปลด ระบบจะปลดเองอัตโนมัติหลัง 30 นาที'}
            </p>
          </div>
        </div>

        {/* ── Force logout ────────────────────────────────────────── */}
        <div id="security-force-logout" className="scroll-mt-6">
          <SectionHeader
            icon={<LogOut className="h-4 w-4" />}
            title={isEn ? 'Force logout — kill an active session' : 'Force logout — ตัด session ที่ active'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 p-4 space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'In the Active Sessions table, click "Logout" on a row to immediately kill that user\'s session. Useful when a device is lost, a session looks compromised, or you suspect credential theft.'
                : 'ในตาราง Active Sessions กดปุ่ม "Logout" ที่แถวของ user คนนั้น → ตัด session ทันที — ใช้กรณีอุปกรณ์หาย / session ดูแปลก / สงสัยว่ารหัสรั่ว'}
            </p>
            <ul className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
              <li className="flex items-start gap-2"><span className="text-red-500">•</span><span>{isEn ? 'Just clears profiles.active_session_id — no token revocation needed' : 'เคลียร์ profiles.active_session_id เฉยๆ ไม่ต้อง revoke token'}</span></li>
              <li className="flex items-start gap-2"><span className="text-red-500">•</span><span>{isEn ? 'User is asked to re-login on their next request' : 'user ต้อง login ใหม่เมื่อ request ครั้งถัดไป'}</span></li>
              <li className="flex items-start gap-2"><span className="text-red-500">•</span><span>{isEn ? 'Action is logged with admin id + target user id' : 'log ไว้ admin id + target user id'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── IP rules ────────────────────────────────────────────── */}
        <div id="security-ip-rules" className="scroll-mt-6">
          <SectionHeader
            icon={<Network className="h-4 w-4" />}
            title={isEn ? 'IP rules — block / allow' : 'IP rules — block / allow'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-zinc-900 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Add IP-level rules that fire BEFORE credential check — stops brute-force at the gate. Useful for blocking attacker IPs immediately or allowlisting trusted office networks.'
                : 'เพิ่มกฎระดับ IP ที่ทำงาน "ก่อน" ตรวจ password — กัน brute-force ตั้งแต่ประตู เหมาะกับการ block IP ที่โจมตี หรือ allowlist เครือข่ายออฟฟิศ'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border-2 border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Ban className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <p className="text-sm font-bold text-red-900 dark:text-red-200">{isEn ? 'Block' : 'Block (ห้าม)'}</p>
                </div>
                <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
                  {isEn
                    ? 'Login from this IP is rejected before credential check. Logged as LOGIN_BLOCKED_IP.'
                    : 'login จาก IP นี้จะถูกปฏิเสธก่อนตรวจรหัสผ่าน — log เป็น LOGIN_BLOCKED_IP'}
                </p>
              </div>
              <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{isEn ? 'Allow' : 'Allow (อนุญาต)'}</p>
                </div>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  {isEn
                    ? 'Trusted network (e.g., office Wi-Fi) — bypass rate-limit + lockout for these IPs.'
                    : 'เครือข่ายที่เชื่อถือได้ (เช่น Wi-Fi ออฟฟิศ) — ข้าม rate-limit + lockout สำหรับ IP นี้'}
                </p>
              </div>
            </div>

            <ul className="text-xs text-zinc-700 dark:text-zinc-300 space-y-1">
              <li className="flex items-start gap-2"><span className="text-red-500">•</span><span>{isEn ? 'IPv4 + IPv6 supported · format validated before insert' : 'รองรับ IPv4 + IPv6 · ระบบ validate format ก่อนบันทึก'}</span></li>
              <li className="flex items-start gap-2"><span className="text-red-500">•</span><span>{isEn ? 'Optional expiry date — temp rules auto-expire' : 'ตั้งวันหมดอายุได้ — rule ชั่วคราวจะ expire เอง'}</span></li>
              <li className="flex items-start gap-2"><span className="text-red-500">•</span><span>{isEn ? 'Add reason text — visible to whoever reviews later' : 'ใส่เหตุผลได้ — คนตรวจในอนาคตจะเห็น'}</span></li>
              <li className="flex items-start gap-2"><span className="text-red-500">•</span><span>{isEn ? 'Delete with the trash icon — IP_RULE_DELETED logged' : 'ลบด้วยไอคอนถังขยะ → log เป็น IP_RULE_DELETED'}</span></li>
            </ul>
          </div>
        </div>

        {/* ── Audit trail / events timeline ───────────────────────── */}
        <div id="security-audit" className="scroll-mt-6">
          <SectionHeader
            icon={<Activity className="h-4 w-4" />}
            title={isEn ? 'Security events timeline — last 50' : 'Timeline เหตุการณ์ — 50 ล่าสุด'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Every action that touches authentication or session state is logged in activity_logs and surfaced here — with IP address, user agent, and geolocation extracted from request headers.'
                : 'ทุก action ที่แตะ auth หรือ session ถูก log ใน activity_logs และโผล่บนหน้านี้ พร้อม IP / user agent / location ที่ดึงจาก request header'}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
              {[
                'LOGIN', 'LOGOUT', 'REGISTER',
                'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'LOGIN_BLOCKED_IP',
                'IP_RULE_CREATED', 'IP_RULE_DELETED', 'SESSION_TIMEOUT',
              ].map(action => (
                <code key={action} className="block px-2 py-1 rounded bg-white dark:bg-zinc-900 border border-red-200/60 dark:border-red-900/40 text-red-700 dark:text-red-400 font-mono">{action}</code>
              ))}
            </div>
            <div className="rounded-lg border border-red-200/60 dark:border-red-900/40 bg-white dark:bg-zinc-900 p-3">
              <p className="text-[11px] font-bold text-red-700 dark:text-red-300 uppercase tracking-wider mb-1.5">
                {isEn ? 'Geolocation source' : 'แหล่ง geolocation'}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {isEn
                  ? 'Latitude/longitude come from Vercel/Cloudflare request headers (no external API call). Accuracy is country/city-level — not pinpoint.'
                  : 'latitude / longitude ดึงจาก header ของ Vercel / Cloudflare (ไม่ได้เรียก API นอก) — ความแม่นยำระดับประเทศ/เมือง ไม่ใช่ pinpoint'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Linked modules ──────────────────────────────────────── */}
        <div id="security-linked" className="scroll-mt-6">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Linked modules' : 'ผูกกับโมดูลอื่น'}
            color="rose"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="🔑 ระบบ login"
              titleEn="🔑 Login system"
              lines={isEn
                ? [
                    'Pulls from login_logs (with selfie URL + GPS)',
                    'IP block check runs BEFORE credentials',
                    'Rate-limit fires on too-many attempts',
                    'Auto-locks after 10 failed PIN attempts',
                  ]
                : [
                    'ดึงข้อมูลจาก login_logs (มี selfie + GPS)',
                    'ตรวจ IP block ก่อนตรวจรหัส',
                    'rate-limit ทำงานเมื่อกรอกบ่อยเกิน',
                    'ล็อกอัตโนมัติเมื่อ fail 10 ครั้ง',
                  ]}
            />
            <FeatureBlock
              titleTh="👥 จัดการ user"
              titleEn="👥 User management"
              lines={isEn
                ? [
                    'unlockUser + forceLogout update profiles',
                    'Revalidates /users + /security on change',
                    'Role checked server-side every action',
                    'Audit-logged via logActivity()',
                  ]
                : [
                    'unlockUser + forceLogout อัปเดต profiles',
                    'revalidate /users + /security ทุกครั้งที่แก้',
                    'ตรวจ role ที่ server ทุก action',
                    'log ทุกอย่างผ่าน logActivity()',
                  ]}
            />
          </div>
        </div>

        {/* ── Tips ────────────────────────────────────────────────── */}
        <div id="security-tips" className="scroll-mt-6">
          <SectionHeader
            icon={<AlertCircle className="h-4 w-4" />}
            title={isEn ? 'Tips & gotchas' : 'เคล็ดลับและข้อควรรู้'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard
              tone="emerald"
              icon={<KeyRound className="h-4 w-4" />}
              titleTh="🔑 30-min auto-unlock"
              titleEn="🔑 30-min auto-unlock"
              descTh="ถ้าไม่อยากปลดเอง รอ 30 นาที ระบบปลดให้อัตโนมัติ — ใช้กับเคสที่ user ลืม PIN"
              descEn="If you don't want to manually unlock, the lock auto-releases after 30 minutes — fine for forgot-PIN cases."
              isEn={isEn}
            />
            <TipCard
              tone="sky"
              icon={<Globe className="h-4 w-4" />}
              titleTh="🌐 Allowlist เครือข่ายออฟฟิศ"
              titleEn="🌐 Allowlist office network"
              descTh="เพิ่ม IP ออฟฟิศเป็น Allow rule — bypass rate-limit + lockout เพื่อให้ทีมไม่โดนล็อกตอนพิมพ์ผิด"
              descEn="Add the office IP as an Allow rule — bypasses rate-limit + lockout so the team doesn't get locked out from typos."
              isEn={isEn}
            />
            <TipCard
              tone="amber"
              icon={<Clock className="h-4 w-4" />}
              titleTh="⏰ Block แบบ expiry"
              titleEn="⏰ Temp blocks expire"
              descTh="ถ้า block IP เพราะโจมตีรอบเดียว ตั้ง expires_at เป็น 24h — กัน block ค้างหลังจากภัยหายไปแล้ว"
              descEn="One-off attack? Set expires_at to 24h — avoids stale rules sticking around after the threat is gone."
              isEn={isEn}
            />
            <TipCard
              tone="violet"
              icon={<MapPin className="h-4 w-4" />}
              titleTh="📍 Location ใช้ดูแนวโน้ม"
              titleEn="📍 Location is rough"
              descTh="ความแม่นยำระดับเมือง — ใช้ดูว่า login จากต่างประเทศไหม ไม่ใช่ ตำแหน่งจริงระดับบ้าน"
              descEn="City-level only — use it to spot foreign-country logins, not for street-level accuracy."
              isEn={isEn}
            />
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="security-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'User' : 'User'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'Open /security' : 'เข้าหน้า /security'}                             owner="—" other="no" admin="yes" adminNote={isEn ? 'redirect non-admin' : 'redirect ถ้าไม่ใช่ admin'} />
                <PermissionRow label={isEn ? 'View KPI / sessions / events / IP rules' : 'ดู KPI / sessions / events / IP rules'} owner="—" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Unlock locked account' : 'ปลดล็อกบัญชี'}                             owner="—" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Force-logout active session' : 'Force logout session'}                owner="—" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Create / delete IP rule' : 'สร้าง / ลบ IP rule'}                       owner="—" other="no" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Menu shortcuts ──────────────────────────────────────── */}
        <div id="security-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/security" labelEn="Security dashboard (admin)" labelTh="Security dashboard (admin)" />
            <MenuLink href="/users"    labelEn="User management (admin)"    labelTh="จัดการ user (admin)" />
          </div>
        </div>

      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: CHECK-IN
          ════════════════════════════════════════════════════════════════ */}
      {view === 'checkin' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[9]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[9]} isEn={isEn} />

        {/* ── Overview ─────────────────────────────────────────────── */}
        <div id="checkin-overview" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Overview' : 'ภาพรวม'}
          />
          <div className="rounded-xl border-2 border-sky-200 dark:border-sky-900 bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/20 dark:to-zinc-900 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Each day you can have up to 1 active session per type — office, on-site (event), and remote run independently. Office + event can run at the same time (you don\'t need to check out from office before checking in to an event).'
                : 'แต่ละวันสามารถมี active session ได้สูงสุด 1 รอบต่อประเภท — ออฟฟิศ / อีเวนต์ / นอกสถานที่ เป็นอิสระจากกัน เช่น เช็คอินออฟฟิศพร้อมเช็คอินอีเวนต์ได้เลย ไม่ต้อง checkout ออฟฟิศก่อน'}
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <NewItem
                icon={<Building2 className="h-3.5 w-3.5" />}
                titleTh="🏢 ออฟฟิศ"
                titleEn="🏢 Office"
                descTh="เข้า-ออกที่บริษัท สูงสุด 1 รอบ active"
                descEn="Clock in at company HQ — max 1 active"
                isEn={isEn}
              />
              <NewItem
                icon={<MapPin className="h-3.5 w-3.5" />}
                titleTh="📍 อีเวนต์"
                titleEn="📍 On-site"
                descTh="ผูกกับงาน auto-สร้างใบเบิกตอน checkout"
                descEn="Linked to event; auto-creates expense claim on checkout"
                isEn={isEn}
              />
              <NewItem
                icon={<Home className="h-3.5 w-3.5" />}
                titleTh="🏠 WFH"
                titleEn="🏠 Remote"
                descTh="ทำงานนอกสถานที่ ต้องระบุหมายเหตุ"
                descEn="Working from home/elsewhere — note required"
                isEn={isEn}
              />
            </ul>
          </div>
        </div>

        {/* ── Check-in types ───────────────────────────────────────── */}
        <div id="checkin-types" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? 'Check-in types — when to use which' : 'ประเภทเช็คอิน — ใช้เมื่อไหร่'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Type' : 'ประเภท'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'When to use' : 'ใช้เมื่อไหร่'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Required fields' : 'ข้อมูลที่ต้องมี'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold hidden sm:table-cell">{isEn ? 'On checkout' : 'ตอน checkout'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <CheckinTypeRow
                  emoji="🏢"
                  label={isEn ? 'Office' : 'ออฟฟิศ'}
                  when={isEn ? 'You are working from the company office' : 'มาทำงานที่บริษัท'}
                  required={isEn ? 'Photo only' : 'รูปถ่ายเท่านั้น'}
                  onCheckout={isEn ? 'Photo' : 'รูปถ่าย'}
                />
                <CheckinTypeRow
                  emoji="📍"
                  label={isEn ? 'On-site (event)' : 'อีเวนต์'}
                  when={isEn ? 'Working at a client event' : 'ออกไปจัดงานลูกค้า'}
                  required={isEn ? 'Photo + select event from today\'s list' : 'รูปถ่าย + เลือกอีเวนต์ของวัน'}
                  onCheckout={isEn ? 'Photo — hours/duties go to the salary slip' : 'รูปถ่าย — ชั่วโมง/หน้าที่ไปคิดในสลิปเงินเดือน'}
                />
                <CheckinTypeRow
                  emoji="🏠"
                  label={isEn ? 'Remote (WFH)' : 'WFH'}
                  when={isEn ? 'Working from home or elsewhere' : 'ทำงานนอกสถานที่'}
                  required={isEn ? 'Photo + note (where/what you\'re doing)' : 'รูปถ่าย + หมายเหตุ (อยู่ที่ไหน ทำอะไร)'}
                  onCheckout={isEn ? 'Photo' : 'รูปถ่าย'}
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Normal flow ──────────────────────────────────────────── */}
        <div id="checkin-normal" className="scroll-mt-6">
          <SectionHeader
            icon={<Clock className="h-4 w-4" />}
            title={isEn ? 'Normal flow — single session' : 'Flow ปกติ — เช็คอินรอบเดียว'}
            color="emerald"
          />
          <FlowchartBox
            title={isEn ? 'Single check-in → check-out' : 'เช็คอิน → เลิกงาน → checkout'}
            color="sky"
          >
            <FlowNode variant="start" emoji="🚪" title={isEn ? 'Arrive at workplace' : 'มาถึงที่ทำงาน'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📝" title={isEn ? 'Pick type — office / on-site / remote' : 'เลือกประเภท — ออฟฟิศ / อีเวนต์ / WFH'} subtitle={isEn ? 'Camera opens automatically' : 'กล้องจะเปิดอัตโนมัติ'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📷" title={isEn ? 'Take check-in photo' : 'ถ่ายรูป Check-in'} subtitle={isEn ? 'GPS auto-captured' : 'ระบบเก็บ GPS อัตโนมัติ'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="✅" title={isEn ? 'Tap the dynamic submit button' : 'กดปุ่มส่ง (บอกประเภทชัดเจน)'} subtitle={isEn ? 'e.g. "Check in at office"' : 'เช่น "เช็คอินเข้าออฟฟิศ"'} tag={isEn ? 'session active' : 'session active'} />
            <FlowArrow label={isEn ? 'work happens' : 'ทำงาน...'} />
            <FlowNode variant="user" emoji="📷" title={isEn ? 'When done — take check-out photo' : 'เลิกงาน — ถ่ายรูป Check-out'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="🚶" title={isEn ? 'Click "Check-out"' : 'กด "Check-out"'} tag={isEn ? 'session closed' : 'session ปิด'} />
            <FlowArrow />
            <FlowNode variant="success" emoji="🏁" title={isEn ? 'Done — appears in history' : 'จบ — ขึ้นในประวัติ'} />
          </FlowchartBox>
        </div>

        {/* ── Overlap flow (NEW feature) ──────────────────────────── */}
        <div id="checkin-overlap" className="scroll-mt-6">
          <SectionHeader
            icon={<Sparkles className="h-4 w-4" />}
            title={isEn ? 'Overlap flow — office + event at the same time (NEW)' : 'Flow คาบเกี่ยว — ออฟฟิศ + อีเวนต์พร้อมกัน (ใหม่)'}
            color="amber"
          />
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'You no longer need to check out of the office before going to an event. Office and event sessions can run concurrently — checkout each one independently when you finish.'
                : 'ไม่ต้อง checkout ออฟฟิศก่อนไปงานอีเวนต์อีกต่อไป — เช็คอินทั้งสองได้พร้อมกัน แล้ว checkout แยกตามงานที่จบจริง'}
            </p>

            {/* Example timeline */}
            <div className="rounded-lg border border-amber-200/60 dark:border-amber-900/50 bg-white dark:bg-zinc-900 p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                {isEn ? 'Example timeline' : 'ตัวอย่างไทม์ไลน์'}
              </p>
              <TimelineRow time="09:00" emoji="🏢" textTh="เช็คอินเข้าออฟฟิศ" textEn="Check in at office" tagTh="office active" tagEn="office active" isEn={isEn} />
              <TimelineRow time="14:00" emoji="📍" textTh="ไปงานอีเวนต์ — เช็คอินอีเวนต์ (ออฟฟิศยัง active)" textEn="Go to event — check in (office still active)" tagTh="office + event active" tagEn="office + event active" isEn={isEn} variant="highlight" />
              <TimelineRow time="18:00" emoji="🚶" textTh="งานเสร็จ — checkout จากอีเวนต์" textEn="Event done — check out" tagTh="office still active" tagEn="office still active" isEn={isEn} />
              <TimelineRow time="19:00" emoji="🏁" textTh="กลับถึงออฟฟิศ — checkout ออฟฟิศ" textEn="Back at office — check out" tagTh="all closed" tagEn="all closed" isEn={isEn} variant="success" />
            </div>

            <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {isEn
                    ? 'You\'ll see a card per active session, with its own checkout button + photo capture.'
                    : 'จะเห็น card ต่อ session ที่ active แต่ละ card มีปุ่ม checkout + ถ่ายรูปของตัวเอง'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {isEn
                    ? 'Cards are color-coded by type (office=blue, event=amber, remote=violet) and sorted oldest → newest.'
                    : 'การ์ดแยกสีตามประเภท (ออฟฟิศ=ฟ้า, อีเวนต์=อำพัน, WFH=ม่วง) และเรียงเก่า→ใหม่'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {isEn
                    ? 'You can\'t have two active sessions of the same type — checkout the first one before re-opening that type.'
                    : 'ห้ามซ้ำประเภทเดียวกัน — เช่น มี office active อยู่ จะเช็คอิน office อีกรอบไม่ได้จนกว่าจะ checkout'}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500">•</span>
                <span>
                  {isEn
                    ? 'When all 3 types are active, the check-in form hides — checkout one before starting another type.'
                    : 'ถ้า active ครบ 3 ประเภท ฟอร์มเช็คอินจะซ่อน — ต้อง checkout อย่างน้อย 1 รอบก่อน'}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* ── Smart shortcuts (recent UX update) ──────────────────── */}
        <div id="checkin-shortcuts" className="scroll-mt-6">
          <SectionHeader
            icon={<Zap className="h-4 w-4" />}
            title={isEn ? 'Smart shortcuts — fewer taps' : 'ทางลัด — เช็คอินเร็วขึ้น'}
            color="violet"
          />
          <div className="rounded-xl border-2 border-violet-200 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/10 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'Recent updates trim the typical office check-in from ~5 taps to 2. The form auto-fills what it can, and the submit button names exactly what\'s about to happen — no more confirm() dialog interrupting the flow.'
                : 'อัพเดทล่าสุด ลดการกดเช็คอินจาก ~5 ปุ่มเหลือ 2 ฟอร์มจะกรอกข้อมูลให้อัตโนมัติเท่าที่เดาได้ และปุ่มส่งจะบอกชัดว่ากำลังจะส่งอะไร — ไม่มี confirm dialog ขั้นกลางอีกต่อไป'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <TipCard
                tone="violet"
                icon={<Camera className="h-4 w-4" />}
                titleTh="📷 กล้องเปิดเองเมื่อกดเลือกประเภท"
                titleEn="📷 Camera opens on type select"
                descTh="พอแตะปุ่มออฟฟิศ/อีเวนต์/WFH กล้องจะเด้งให้ทันที — ไม่ต้องกด &quot;แตะเพื่อถ่ายรูป&quot; เป็นขั้นที่สอง"
                descEn="Tap a type and the camera opens immediately — no second tap on the photo button."
                isEn={isEn}
              />
              <TipCard
                tone="sky"
                icon={<MapPin className="h-4 w-4" />}
                titleTh="🎯 เลือกอีเวนต์อัตโนมัติ"
                titleEn="🎯 Auto-select event"
                descTh="ถ้าวันนี้มีอีเวนต์เดียว ระบบจะเลือกให้เลย — ข้าม dropdown ไปได้"
                descEn="If there's only one event today, it's pre-selected — skip the dropdown entirely."
                isEn={isEn}
              />
              <TipCard
                tone="emerald"
                icon={<CheckCircle2 className="h-4 w-4" />}
                titleTh="🏷 ปุ่มบอกชัดว่ากำลังเช็คอินอะไร"
                titleEn="🏷 Submit button names the action"
                descTh="ปุ่มจะแสดงเช่น &quot;เช็คอินเข้าออฟฟิศ&quot; / &quot;เช็คอินไปหน้างาน · ชื่ออีเวนต์&quot; / &quot;เช็คอิน WFH&quot; — ตรวจง่ายก่อนส่ง"
                descEn='Button reads e.g. "Check in at office" / "On-site · {event name}" / "Check in WFH" — easy to verify before submitting.'
                isEn={isEn}
              />
              <TipCard
                tone="amber"
                icon={<RefreshCw className="h-4 w-4" />}
                titleTh="🔁 ใช้ note ครั้งก่อน (WFH)"
                titleEn="🔁 Reuse last WFH note"
                descTh="ถ้าเคยเช็คอิน WFH มาก่อน ระบบจะเสนอปุ่มกดครั้งเดียวเพื่อใช้ note ของรอบล่าสุด — ใครอยู่บ้านเดิมไม่ต้องพิมพ์ซ้ำ"
                descEn="If you've checked in remote before, one tap pastes your last note — no retyping the same address every day."
                isEn={isEn}
              />
              <TipCard
                tone="violet"
                icon={<ImageIcon className="h-4 w-4" />}
                titleTh="📸 ใช้รูป checkout ร่วมกันได้"
                titleEn="📸 Reuse checkout photo"
                descTh="ถ้าจะ checkout หลายรอบติดกัน (ออฟฟิศ + อีเวนต์ ฯลฯ) — card ถัดไปจะเสนอปุ่ม &quot;ใช้รูปเดียวกันกับรอบก่อนหน้า&quot; แทนถ่ายซ้ำ"
                descEn="Closing several sessions in one go? Sibling cards offer to reuse the photo just captured — no need to re-shoot."
                isEn={isEn}
              />
              <TipCard
                tone="amber"
                icon={<AlertCircle className="h-4 w-4" />}
                titleTh="🔔 แจ้งเตือน session ค้างจากวันก่อน"
                titleEn="🔔 Stale-session sticky banner"
                descTh="ถ้ามีรอบจากวันก่อนยังไม่ได้ checkout จะมีแถบสีส้มลอยบนสุดของหน้า พร้อมปุ่ม &quot;ไป Checkout →&quot; กดแล้วหน้าจะ scroll ไปการ์ดนั้นให้"
                descEn="If a previous-day session was never closed, an orange banner sticks to the top of the page with a jump-to button."
                isEn={isEn}
              />
            </div>
            <div className="rounded-lg border border-violet-200/60 dark:border-violet-900/50 bg-white dark:bg-zinc-900 p-3">
              <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider mb-1.5">
                {isEn ? 'Per-type reminder popup' : 'Pop-up เตือนแยกตามประเภท'}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {isEn
                  ? 'Office and on-site are independent. Trying to check in to a type that already has an open session shows a scoped popup naming that specific session (with the event name for on-site) — sessions of other types stay unblocked.'
                  : 'ออฟฟิศ กับ อีเวนต์ เป็นอิสระจากกัน — ถ้าเช็คอินซ้ำประเภทเดิมที่ยังเปิดอยู่ จะมี pop-up ระบุชื่อ session นั้นโดยเฉพาะ (สำหรับอีเวนต์ก็แสดงชื่อด้วย) ส่วนประเภทอื่นไม่ถูกบล็อก'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Leave requests (NEW feature) ────────────────────────── */}
        <div id="checkin-leave" className="scroll-mt-6">
          <SectionHeader
            icon={<CalendarDays className="h-4 w-4" />}
            title={isEn ? 'Leave requests — personal / sick / vacation' : 'ลางาน — ลากิจ / ลาป่วย / ลาพักร้อน'}
            color="rose"
          />
          <div className="rounded-xl border-2 border-rose-200 dark:border-rose-900 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/20 dark:to-zinc-900 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'A "Leave requests" section lives between the today-summary footer and the check-in form. Tap the "+ ขอลางาน" pill in the section header to open the request modal — pick a type, set the date range, add a reason, and submit. Admins review pending requests in their own panel below.'
                : 'ส่วน "คำขอลางาน" อยู่ระหว่าง footer สรุปวันนี้ กับฟอร์มเช็คอิน — แตะปุ่ม "+ ขอลางาน" มุมขวาบนของ section จะเปิด modal เลือกประเภท ระบุช่วงวันที่ เหตุผล แล้วกดส่ง · admin จะเห็น panel "รออนุมัติ" สีเหลืองด้านล่าง'}
            </p>

            {/* 3 leave types */}
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <NewItem
                icon={<Briefcase className="h-3.5 w-3.5" />}
                titleTh="📋 ลากิจ"
                titleEn="📋 Personal"
                descTh="ธุระส่วนตัว — เหตุผลจำเป็น"
                descEn="Personal errands — reason required"
                isEn={isEn}
              />
              <NewItem
                icon={<Heart className="h-3.5 w-3.5" />}
                titleTh="🤒 ลาป่วย"
                titleEn="🤒 Sick"
                descTh="เจ็บป่วย — แนบใบรับรองแพทย์ได้"
                descEn="Sick day — attach doctor's note (optional)"
                isEn={isEn}
              />
              <NewItem
                icon={<Plane className="h-3.5 w-3.5" />}
                titleTh="🌴 ลาพักร้อน"
                titleEn="🌴 Vacation"
                descTh="พักร้อน — เหตุผลไม่บังคับ"
                descEn="Vacation — reason optional"
                isEn={isEn}
              />
            </ul>
          </div>
        </div>

        {/* ── Leave flow ──────────────────────────────────────────── */}
        <div id="checkin-leave-flow" className="scroll-mt-6">
          <SectionHeader
            icon={<Send className="h-4 w-4" />}
            title={isEn ? 'Leave flow — request → review → outcome' : 'Flow การลา — ขอ → review → ผลลัพธ์'}
            color="rose"
          />
          <FlowchartBox
            title={isEn ? 'From request to approval' : 'จากการขอจนถึงผลลัพธ์'}
            color="rose"
          >
            <FlowNode variant="user" emoji="📝" title={isEn ? 'Tap "+ ขอลางาน"' : 'กด "+ ขอลางาน"'} subtitle="/check-in" />
            <FlowArrow />
            <FlowNode variant="user" emoji="🗂" title={isEn ? 'Pick type · date range · reason' : 'เลือกประเภท · ช่วงวันที่ · เหตุผล'} subtitle={isEn ? 'half-day toggle if start = end' : 'มี checkbox ครึ่งวันถ้า start = end'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📷" title={isEn ? 'Optional: attach doctor\'s note' : 'แนบใบรับรองแพทย์ (ไม่บังคับ)'} />
            <FlowArrow />
            <FlowNode variant="success" emoji="📨" title={isEn ? 'Submit — status: รออนุมัติ' : 'ส่งคำขอ — status: รออนุมัติ'} tag="pending" />
            <FlowArrow label={isEn ? 'admin reviews' : 'admin ตรวจ'} />
            <FlowNode variant="user" emoji="👀" title={isEn ? 'Admin sees in "รออนุมัติ" panel' : 'Admin เห็นใน panel "รออนุมัติ"'} subtitle={isEn ? 'amber-highlighted on /check-in' : 'แถบสีเหลืองบน /check-in'} />
            <FlowArrow />
            <FlowNode variant="success" emoji="✅" title={isEn ? 'Approve OR reject (with reason)' : 'อนุมัติ หรือ ปฏิเสธ (พร้อมเหตุผล)'} tag={isEn ? 'approved / rejected' : 'approved / rejected'} />
          </FlowchartBox>
        </div>

        {/* ── Leave reference (status + rules) ────────────────────── */}
        <div id="checkin-leave-ref" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldCheck className="h-4 w-4" />}
            title={isEn ? 'Status & rules' : 'สถานะ และกฎการลา'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard
              tone="amber"
              icon={<Clock className="h-4 w-4" />}
              titleTh="⏳ รออนุมัติ (pending)"
              titleEn="⏳ Pending"
              descTh="เพิ่งส่งคำขอ admin ยังไม่ตรวจ — user ยังกด &quot;ยกเลิกคำขอ&quot; ได้"
              descEn="Just submitted, awaiting admin review. User can still cancel their own request."
              isEn={isEn}
            />
            <TipCard
              tone="emerald"
              icon={<CheckCircle2 className="h-4 w-4" />}
              titleTh="✅ อนุมัติ (approved)"
              titleEn="✅ Approved"
              descTh="Admin อนุมัติแล้ว — บล็อกการลาช่วงเดียวกันไม่ให้ขอซ้ำ"
              descEn="Admin approved. Blocks overlapping pending/approved requests in the same range."
              isEn={isEn}
            />
            <TipCard
              tone="sky"
              icon={<X className="h-4 w-4" />}
              titleTh="❌ ปฏิเสธ (rejected)"
              titleEn="❌ Rejected"
              descTh="Admin ปฏิเสธ — ต้องระบุเหตุผล user เห็น note ใน card"
              descEn="Admin rejected with a required note — user sees the reason on the card."
              isEn={isEn}
            />
            <TipCard
              tone="violet"
              icon={<Ban className="h-4 w-4" />}
              titleTh="🚫 ยกเลิกแล้ว (cancelled)"
              titleEn="🚫 Cancelled"
              descTh="User ยกเลิกเอง — ลบจาก active list, ย้ายไปประวัติด้านล่าง"
              descEn="User cancelled. Moves out of active view into the history footer."
              isEn={isEn}
            />
            <TipCard
              tone="amber"
              icon={<AlertCircle className="h-4 w-4" />}
              titleTh="⚠ กันลาทับซ้อน"
              titleEn="⚠ Overlap blocked"
              descTh="ระบบบล็อกถ้าช่วงใหม่ทับกับ pending/approved ที่มีอยู่ — ต้องยกเลิกตัวเดิมก่อน"
              descEn="System blocks new requests that overlap any pending/approved range — cancel the existing one first."
              isEn={isEn}
            />
            <TipCard
              tone="sky"
              icon={<CalendarDays className="h-4 w-4" />}
              titleTh="½ ลาครึ่งวัน (0.5)"
              titleEn="½ Half-day (0.5)"
              descTh="ถ้าเลือกวันเริ่ม = วันสิ้นสุด จะมี checkbox &quot;ลาครึ่งวัน&quot; ให้กด → total_days = 0.5"
              descEn="When start = end date, a half-day checkbox appears — sets total_days to 0.5."
              isEn={isEn}
            />
          </div>
        </div>

        {/* ── Tips ─────────────────────────────────────────────────── */}
        <div id="checkin-tips" className="scroll-mt-6">
          <SectionHeader
            icon={<AlertCircle className="h-4 w-4" />}
            title={isEn ? 'Tips & gotchas' : 'เคล็ดลับและข้อควรรู้'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard
              tone="emerald"
              icon={<Camera className="h-4 w-4" />}
              titleTh="รูปถ่ายจำเป็นเสมอ"
              titleEn="Photo always required"
              descTh="ทั้งตอนเช็คอินและ checkout ระบบบังคับถ่ายรูป (เลือกกล้องหน้า/หลังได้)"
              descEn="Both check-in and check-out require a photo. You can switch between front/rear camera."
              isEn={isEn}
            />
            <TipCard
              tone="sky"
              icon={<MapPin className="h-4 w-4" />}
              titleTh="GPS เก็บอัตโนมัติ"
              titleEn="GPS captured automatically"
              descTh="ระบบขอ location เพื่อบันทึกพิกัดตอนเช็คอิน — กรุณาอนุญาตในเบราว์เซอร์"
              descEn="The browser prompts for location on load — allow it so check-ins are geo-tagged."
              isEn={isEn}
            />
            <TipCard
              tone="amber"
              icon={<RefreshCw className="h-4 w-4" />}
              titleTh="ยกเลิก checkout ภายใน 5 นาที"
              titleEn="Undo checkout within 5 minutes"
              descTh="ถ้าเผลอกด Check-out ใช้ปุ่มย้อนกลับ ↩ ภายใน 5 นาที — เกินจากนั้นต้องให้ admin แก้"
              descEn="Accidentally checked out? Use the undo arrow within 5 minutes. After that, admin override only."
              isEn={isEn}
            />
            <TipCard
              tone="violet"
              icon={<Clock className="h-4 w-4" />}
              titleTh="งานข้ามวันได้ (22:00 → 05:00)"
              titleEn="Overnight shifts supported"
              descTh="ระบบไม่ปิด session อัตโนมัติตอนเที่ยงคืน — เปิด session ค้างได้ checkout ตอนเช้าวันถัดไป"
              descEn="Sessions don't auto-close at midnight, so a 22:00 → 05:00 shift works fine."
              isEn={isEn}
            />
            <TipCard
              tone="emerald"
              icon={<Receipt className="h-4 w-4" />}
              titleTh="On-site → สลิปเงินเดือน"
              titleEn="On-site → salary slip"
              descTh="ตอนเช็คอินไปหน้างานให้ติ๊กหน้าที่ที่ทำ (ส่ง/เก็บตู้ ขับรถ ออกงานสตาฟ รันเนอร์) — ค่าสตาฟ OT และเบิ้ลต่างจังหวัดจะถูกคิดในสลิปเงินเดือนของงวดนั้น ไม่มีใบเบิกอัตโนมัติอีกแล้ว"
              descEn="Tick the duties you perform when checking in on-site (deliver/collect booth, driving, on-site staff, runner) — site pay, OT and out-of-province bonus are calculated in that period's salary slip; no automatic expense claim anymore."
              isEn={isEn}
            />
            <TipCard
              tone="sky"
              icon={<History className="h-4 w-4" />}
              titleTh="ดูประวัติได้ที่ /check-in/history"
              titleEn="History at /check-in/history"
              descTh="ดูรอบเช็คอินย้อนหลัง พร้อมรูปและตำแหน่ง GPS"
              descEn="Browse past sessions including photos and GPS coordinates."
              isEn={isEn}
            />
          </div>
        </div>

        {/* ── Menu shortcuts ───────────────────────────────────────── */}
        <div id="checkin-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/check-in"            labelEn="Check in / out"               labelTh="เช็คอิน / Check-out" />
            <MenuLink href="/check-in/history"    labelEn="My history (7 days)"          labelTh="ประวัติของฉัน (7 วัน)" />
            <MenuLink href="/check-in/dashboard"  labelEn="Leave calendar"               labelTh="ปฏิทินลางาน" />
            <MenuLink href="/check-in/report"     labelEn="Team report (admin)"          labelTh="รายงานทีม (admin)" />
          </div>
        </div>
      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: SALARY
          ════════════════════════════════════════════════════════════════ */}
      {view === 'salary' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES[10]} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES[10]} isEn={isEn} />

        {/* ── Start here ───────────────────────────────────────────── */}
        <div id="salary-start" className="scroll-mt-6">
          <SectionHeader
            icon={<Wallet className="h-4 w-4" />}
            title={isEn ? 'Start here — what the salary module does' : 'เริ่มที่นี่ — ระบบเงินเดือนทำอะไร'}
          />
          <div className="rounded-xl border-2 border-teal-200 dark:border-teal-900 bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/20 dark:to-zinc-900 p-4 space-y-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'The system works out pay from the check-ins of each person and puts it on one slip per period. The admin checks and closes the slip, then the employee can see it.'
                : 'ระบบคิดเงินให้จากการเช็คอินของแต่ละคน แล้วออกเป็นสลิปทีละงวด แอดมินตรวจและปิดงวดก่อน พนักงานจึงเห็นสลิปของตัวเอง'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RoleCard
                role="user"
                title={isEn ? 'Staff — only 3 things to do' : 'พนักงาน — ทำแค่ 3 อย่าง'}
                steps={[
                  { n: 1, label: isEn ? 'Check in as usual. When you go on-site, tick the duties you do.' : 'เช็คอินตามปกติ ถ้า "ไปหน้างาน" ให้ติ๊กหน้าที่ที่ทำ', tag: null },
                  { n: 2, label: isEn ? 'Wait for the admin to close the period. The bell will notify you.' : 'รอแอดมินปิดงวด ระบบจะแจ้งเตือนที่กระดิ่ง', tag: null },
                  { n: 3, label: isEn ? 'Open "My slips" to view your slip and download the PDF.' : 'เปิดเมนู "สลิปของฉัน" ดูสลิปและดาวน์โหลด PDF', tag: null },
                ]}
              />
              <RoleCard
                role="admin"
                title={isEn ? 'Admin — every period' : 'แอดมิน — ทำทุกงวด'}
                steps={[
                  { n: 1, label: isEn ? 'First-time setup (only once).' : 'ตั้งค่าครั้งแรก (ทำครั้งเดียว)', tag: null },
                  { n: 2, label: isEn ? 'Open a period and calculate. Everyone gets a slip in the "ร่าง" (in progress) state.' : 'เปิดงวดแล้วคำนวณ ทุกคนจะได้สลิปสถานะ "ร่าง"', tag: null },
                  { n: 3, label: isEn ? 'Check each slip and bring the open items ("งานค้าง") down to 0.' : 'ตรวจสลิป เคลียร์ "งานค้าง" ให้เหลือ 0', tag: null },
                  { n: 4, label: isEn ? 'Press "ปิดงวด" (close). The employee sees the slip right away.' : 'กด "ปิดงวด" พนักงานเห็นสลิปทันที', tag: null },
                  { n: 5, label: isEn ? 'Transfer the money, then press "จ่ายแล้ว" (paid).' : 'โอนเงินแล้วกด "จ่ายแล้ว"', tag: null },
                ]}
              />
            </div>
          </div>

          <div className="mt-4">
            <FlowchartBox
              title={isEn ? 'One period — from check-in to payment' : 'หนึ่งงวด — ตั้งแต่เช็คอินจนได้เงิน'}
              color="sky"
            >
              <FlowNode variant="start" emoji="📍" title={isEn ? 'Staff check in every day' : 'พนักงานเช็คอินทุกวัน'} />
              <FlowArrow />
              <FlowNode variant="admin" emoji="🗓" title={isEn ? 'Admin opens the period and calculates' : 'แอดมินเปิดงวดและคำนวณ'} />
              <FlowArrow />
              <FlowNode variant="admin" emoji="📝" title={isEn ? 'Slip is "ร่าง" (in progress) — check and edit' : 'สลิปเป็น "ร่าง" — ตรวจและแก้ได้'} subtitle={isEn ? 'Staff cannot see it yet' : 'พนักงานยังมองไม่เห็น'} />
              <FlowArrow />
              <FlowNode variant="decision" emoji="⚠️" title={isEn ? 'Are the open items down to 0?' : 'งานค้างเหลือ 0 หรือยัง?'} />
              <FlowArrow label={isEn ? 'yes' : 'ใช่'} />
              <FlowNode variant="admin" emoji="🔒" title={isEn ? 'Press "ปิดงวด" (close)' : 'กด "ปิดงวด"'} subtitle={isEn ? 'Staff now see it as "รอจ่าย" (awaiting payment)' : 'พนักงานเห็นสลิป สถานะ "รอจ่าย"'} />
              <FlowArrow />
              <FlowNode variant="success" emoji="💸" title={isEn ? 'Transfer the money, then press "จ่ายแล้ว"' : 'โอนเงิน แล้วกด "จ่ายแล้ว"'} />
            </FlowchartBox>
          </div>

          <div className="mt-4 rounded-lg border border-teal-200/60 dark:border-teal-900/50 bg-white dark:bg-zinc-900 p-3 space-y-2">
            <p className="text-[11px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider">
              {isEn ? 'Example: cut-off day 25 (default)' : 'ตัวอย่าง: วันตัดรอบ 25 (ค่าเริ่มต้น)'}
            </p>
            <TimelineRow time={isEn ? 'Jul 26' : '26 ก.ค.'} emoji="🟢" textTh="วันแรกของงวดเดือนสิงหาคม" textEn="First day of the August period" tagTh="เริ่มงวด" tagEn="start" isEn={isEn} />
            <TimelineRow time={isEn ? 'Aug 25' : '25 ส.ค.'} emoji="🏁" textTh="วันสุดท้ายของงวดเดือนสิงหาคม" textEn="Last day of the August period" tagTh="วันตัดรอบ" tagEn="cut-off" isEn={isEn} variant="success" />
            <TimelineRow time={isEn ? 'Aug 26' : '26 ส.ค.'} emoji="➡️" textTh="เช็คอินตั้งแต่วันนี้ไปอยู่งวดเดือนกันยายน" textEn="Check-ins from this day go to the September period" tagTh="งวดถัดไป" tagEn="next period" isEn={isEn} variant="highlight" />
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {isEn
                ? 'The admin can change the cut-off day in Settings. The change only affects periods opened afterwards.'
                : 'แอดมินเปลี่ยนวันตัดรอบได้ที่เมนู "ตั้งค่า" — มีผลกับงวดที่เปิดใหม่หลังจากนั้นเท่านั้น'}
            </p>
          </div>
        </div>

        {/* ── What the money is made of ────────────────────────────── */}
        <div id="salary-money" className="scroll-mt-6">
          <SectionHeader
            icon={<Calculator className="h-4 w-4" />}
            title={isEn ? 'What the money is made of' : 'เงินมาจากอะไรบ้าง'}
            color="emerald"
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Employment type' : 'ประเภทการจ้าง'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Monthly period' : 'งวดรายเดือน'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Weekly / custom period' : 'งวดรายสัปดาห์ / กำหนดเอง'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <tr>
                  <td className="px-3 py-2.5 font-medium text-zinc-800 dark:text-zinc-200 align-top">{isEn ? 'Full-time (ประจำ)' : 'ประจำ'}</td>
                  <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{isEn ? 'Base salary + OT + on-site duty pay' : 'เงินเดือนฐาน + OT + ค่าหน้าที่หน้างาน'}</td>
                  <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{isEn ? 'Duty pay + OT on on-site days only (no base salary)' : 'ค่าหน้าที่ + OT เฉพาะวันไปหน้างาน (ไม่มีเงินเดือนฐาน)'}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 font-medium text-zinc-800 dark:text-zinc-200 align-top">{isEn ? 'Intern (นักศึกษาฝึกงาน)' : 'นักศึกษาฝึกงาน'}</td>
                  <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{isEn ? 'Base salary + OT + on-site duty pay' : 'เงินเดือนฐาน + OT + ค่าหน้าที่หน้างาน'}</td>
                  <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{isEn ? 'Duty pay + OT on on-site days only (no base salary)' : 'ค่าหน้าที่ + OT เฉพาะวันไปหน้างาน (ไม่มีเงินเดือนฐาน)'}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2.5 font-medium text-zinc-800 dark:text-zinc-200 align-top">{isEn ? 'Freelance (ฟรีแลนซ์)' : 'ฟรีแลนซ์'}</td>
                  <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{isEn ? 'Duty pay + OT on on-site days only (never a base salary)' : 'ค่าหน้าที่ + OT เฉพาะวันไปหน้างาน (ไม่มีเงินเดือนฐานเลย)'}</td>
                  <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{isEn ? 'Duty pay + OT on on-site days only' : 'ค่าหน้าที่ + OT เฉพาะวันไปหน้างาน'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            {isEn
              ? 'Every type also adds the out-of-province bonus, runner amounts and manual adjustments, if any.'
              : 'ทุกประเภทบวกเบิ้ลต่างจังหวัด รันเนอร์ และรายการปรับมือเพิ่มด้วย (ถ้ามี)'}
          </p>

          <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <NewItem icon={<Wallet className="h-3.5 w-3.5" />} titleTh="เงินเดือนฐาน" titleEn="Base salary" descTh="เฉพาะประจำและนักศึกษาฝึกงาน และเฉพาะงวดรายเดือน" descEn="Full-time and interns only, and only in monthly periods." isEn={isEn} />
            <NewItem icon={<Clock className="h-3.5 w-3.5" />} titleTh="OT" titleEn="OT" descTh="เวลาที่อยู่นอกเวลาทำงานของคนนั้น ปัดลงทีละ 30 นาที" descEn="Time outside the working hours of that person, rounded down to 30-minute blocks." isEn={isEn} />
            <NewItem icon={<ListChecks className="h-3.5 w-3.5" />} titleTh="ค่าหน้าที่หน้างาน (ค่าสตาฟ)" titleEn="On-site duty pay" descTh="ตามหน้าที่ที่ติ๊กตอนเช็คอินไปหน้างาน คิดเป็นครั้ง" descEn="Based on the duties ticked at on-site check-in, paid per check-in." isEn={isEn} />
            <NewItem icon={<MapPin className="h-3.5 w-3.5" />} titleTh="เบิ้ลต่างจังหวัด" titleEn="Out-of-province bonus" descTh="ค่าเริ่มต้น 300 บาทต่อเช็คอิน แอดมินเป็นคนติ๊ก ตจว. ให้" descEn="Default 300 baht per check-in. The admin ticks ตจว. (out of province)." isEn={isEn} />
            <NewItem icon={<Zap className="h-3.5 w-3.5" />} titleTh="รันเนอร์" titleEn="Runner" descTh="ไม่มีอัตราตายตัว แอดมินกรอกยอดเองเป็นรายวัน" descEn="No fixed rate. The admin types the amount for each day." isEn={isEn} />
            <NewItem icon={<Edit3 className="h-3.5 w-3.5" />} titleTh="รายการปรับมือ" titleEn="Manual adjustments" descTh="ยอดบวก (เช่น โบนัส) หรือยอดลบ (เช่น หักเงิน) ที่แอดมินเพิ่มเอง" descEn="Plus lines (e.g. bonus) or minus lines (e.g. deductions) added by the admin." isEn={isEn} />
          </ul>

          <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
            <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
              {isEn ? 'Duty rates — defaults, the admin can change them' : 'อัตราค่าหน้าที่ — ค่าเริ่มต้น แอดมินเปลี่ยนได้'}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <span className="rounded-md bg-zinc-50 dark:bg-zinc-800 px-2 py-1.5 text-zinc-700 dark:text-zinc-300">{isEn ? 'On-site staff · 700 baht' : 'ออกงานสตาฟ · 700 บาท'}</span>
              <span className="rounded-md bg-zinc-50 dark:bg-zinc-800 px-2 py-1.5 text-zinc-700 dark:text-zinc-300">{isEn ? 'Booth delivery · 150 baht' : 'ส่งโฟโต้บูธ · 150 บาท'}</span>
              <span className="rounded-md bg-zinc-50 dark:bg-zinc-800 px-2 py-1.5 text-zinc-700 dark:text-zinc-300">{isEn ? 'Booth pickup · 150 baht' : 'เก็บโฟโต้บูธ · 150 บาท'}</span>
              <span className="rounded-md bg-zinc-50 dark:bg-zinc-800 px-2 py-1.5 text-zinc-700 dark:text-zinc-300">{isEn ? 'Booth driving · 300 baht' : 'ขับรถออกบูธ · 300 บาท'}</span>
              <span className="rounded-md bg-zinc-50 dark:bg-zinc-800 px-2 py-1.5 text-zinc-700 dark:text-zinc-300">{isEn ? 'Runner · typed per day' : 'รันเนอร์ · กรอกเองรายวัน'}</span>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-emerald-200/60 dark:border-emerald-900/50 bg-white dark:bg-zinc-900 p-3 space-y-2">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
              {isEn ? 'OT example — working hours 10:00–19:00' : 'ตัวอย่าง OT — เวลาทำงาน 10:00–19:00'}
            </p>
            <TimelineRow time="09:40" emoji="🟢" textTh="เช็คอินก่อนเวลางาน 20 นาที" textEn="Checked in 20 minutes early" tagTh="+20 นาที" tagEn="+20 min" isEn={isEn} />
            <TimelineRow time="21:10" emoji="🔴" textTh="เช็คเอาท์หลังเวลางาน 2 ชม. 10 นาที" textEn="Checked out 2 h 10 min late" tagTh="+130 นาที" tagEn="+130 min" isEn={isEn} />
            <TimelineRow time="=" emoji="🧮" textTh="รวม 150 นาที = 5 ช่วงครึ่งชั่วโมง" textEn="Total 150 minutes = 5 half-hour blocks" tagTh="OT 2.5 ชม." tagEn="OT 2.5 h" isEn={isEn} variant="success" />
            <ul className="space-y-1.5 pt-1 text-xs text-zinc-700 dark:text-zinc-300">
              <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>{isEn ? 'Only 25 minutes over (under 30) = no OT.' : 'เกินเวลาแค่ 25 นาที (ไม่ถึง 30 นาที) = ไม่มี OT'}</span></li>
              <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>{isEn ? 'WFH check-ins do not count for OT.' : 'เช็คอิน WFH ไม่นับ OT'}</span></li>
              <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>{isEn ? 'Forgot to check out = no OT that day until the admin fills in the time.' : 'ลืมเช็คเอาท์ = วันนั้นไม่มี OT จนกว่าแอดมินจะเติมเวลาออกให้'}</span></li>
              <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>{isEn ? 'Default working hours are 10:00–19:00. The admin can set them per person.' : 'เวลาทำงานค่าเริ่มต้น 10:00–19:00 แอดมินตั้งแยกรายคนได้'}</span></li>
              <li className="flex items-start gap-2"><span className="text-emerald-500">•</span><span>{isEn ? 'Weekly and custom periods count OT on on-site days only. No office OT.' : 'งวดรายสัปดาห์และกำหนดเอง คิด OT เฉพาะวันไปหน้างาน ไม่มี OT ออฟฟิศ'}</span></li>
            </ul>
          </div>

          <div className="mt-3">
            <TipCard
              tone="amber"
              icon={<AlertTriangle className="h-4 w-4" />}
              titleTh="ระบบไม่หักเงินอะไรให้เอง"
              titleEn="The system does not deduct anything by itself"
              descTh={'ไม่หักประกันสังคม ภาษี หรือวันลา และไม่คิดตามส่วนถ้าเข้าหรือออกกลางงวด ให้แอดมินใช้ "รายการปรับมือ"'}
              descEn="No social security, tax or leave deductions, and no pro-rating for people who join or leave mid-period. The admin uses manual adjustments."
              isEn={isEn}
            />
          </div>
        </div>

        {/* ════ STAFF ════ */}
        <p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 pt-2">
          {isEn ? 'For staff' : 'สำหรับพนักงาน'}
        </p>

        {/* ── P1: tick duties at check-in ──────────────────────────── */}
        <div id="salary-staff-checkin" className="scroll-mt-6">
          <SectionHeader
            icon={<MapPin className="h-4 w-4" />}
            title={isEn ? 'Staff: tick your duties when checking in on-site' : 'พนักงาน: ติ๊กหน้าที่ตอนเช็คอินไปหน้างาน'}
          />
          <RoleCard
            role="user"
            title={isEn ? 'Do this every time you go on-site' : 'ทำตามนี้ทุกครั้งที่ออกงาน'}
            steps={[
              { n: 1, label: isEn ? 'Open the check-in page and choose "ไปหน้างาน" (on-site).' : 'เปิดหน้าเช็คอิน แล้วเลือก "ไปหน้างาน"', tag: null },
              { n: 2, label: isEn ? 'Pick the event you are going to today.' : 'เลือกอีเวนต์ที่ไปวันนี้', tag: null },
              { n: 3, label: isEn ? 'Under "หน้าที่หน้างาน" (on-site duties), tick what you really do. You can tick several.' : 'ในช่อง "หน้าที่หน้างาน" ติ๊กสิ่งที่ทำจริง ติ๊กได้หลายข้อ เช่น ส่งและเก็บโฟโต้บูธ', tag: null },
              { n: 4, label: isEn ? 'Take the photo and press the check-in button.' : 'ถ่ายรูป แล้วกดปุ่มเช็คอิน', tag: null },
              { n: 5, label: isEn ? 'When you finish, remember to check out. OT is based on your check-out time.' : 'เลิกงานแล้วอย่าลืมเช็คเอาท์ เพราะ OT คิดจากเวลาออก', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="sky" icon={<CheckCircle2 className="h-4 w-4" />} titleTh="ต้องติ๊กอย่างน้อย 1 หน้าที่" titleEn="Tick at least 1 duty" descTh="ถ้ายังไม่ติ๊ก ระบบจะไม่ให้เช็คอินไปหน้างาน" descEn="You cannot check in on-site until at least one duty is ticked." isEn={isEn} />
            <TipCard tone="amber" icon={<MapPin className="h-4 w-4" />} titleTh="ตจว. แอดมินเป็นคนติ๊ก" titleEn="The admin ticks ตจว." descTh="งานต่างจังหวัดได้เบิ้ลต่อเช็คอิน แอดมินติ๊กให้ในสลิป พนักงานไม่ต้องทำอะไร" descEn="Out-of-province work earns a bonus per check-in. The admin ticks it on the slip. Staff do nothing." isEn={isEn} />
            <TipCard tone="emerald" icon={<Building2 className="h-4 w-4" />} titleTh="ออฟฟิศ / WFH ไม่ต้องติ๊กอะไร" titleEn="Office / WFH: nothing to tick" descTh="หน้าที่หน้างานมีเฉพาะตอนเช็คอินไปหน้างาน" descEn="Duties only apply to on-site check-ins." isEn={isEn} />
            <TipCard tone="violet" icon={<Lock className="h-4 w-4" />} titleTh="เช็คอินหน้างานได้เงินครั้งเดียว" titleEn="Each on-site check-in is paid once" descTh="จ่ายในงวดไหนแล้ว งวดอื่นจะไม่ดึงมาคิดซ้ำ" descEn="Once it is paid in one period, no other period counts it again." isEn={isEn} />
          </div>
        </div>

        {/* ── P2: my slips + statuses ──────────────────────────────── */}
        <div id="salary-staff-slips" className="scroll-mt-6">
          <SectionHeader
            icon={<Receipt className="h-4 w-4" />}
            title={isEn ? 'Staff: your slips and their status' : 'พนักงาน: สลิปของฉัน และสถานะ'}
          />
          <RoleCard
            role="user"
            title={isEn ? 'Find your slips' : 'หาสลิปของตัวเอง'}
            steps={[
              { n: 1, label: isEn ? 'Open the menu "เงินเดือน" (Salary) → "สลิปของฉัน" (My slips).' : 'เปิดเมนู "เงินเดือน" → "สลิปของฉัน"', tag: null },
              { n: 2, label: isEn ? 'Slips are listed with the newest period on top.' : 'สลิปเรียงจากงวดล่าสุดอยู่บนสุด', tag: null },
              { n: 3, label: isEn ? 'Look at the status badge next to the slip name.' : 'ดูป้ายสถานะข้างชื่อสลิป', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="amber" icon={<Clock className="h-4 w-4" />} titleTh="รอจ่าย" titleEn="รอจ่าย — awaiting payment" descTh="แอดมินปิดงวดแล้ว ยอดนี้คือยอดที่คุณจะได้ กำลังรอโอนเงิน" descEn="The admin has closed the period. This is the amount you will get. The transfer is pending." isEn={isEn} />
            <TipCard tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} titleTh="จ่ายแล้ว" titleEn="จ่ายแล้ว — paid" descTh="แอดมินโอนเงินแล้ว และบันทึกว่าจ่ายแล้ว" descEn="The admin has transferred the money and marked it as paid." isEn={isEn} />
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
            <li className="flex items-start gap-2"><span className="text-sky-500">•</span><span>{isEn ? 'You only see your own slips, never anyone else.' : 'เห็นเฉพาะสลิปของตัวเอง ไม่เห็นของคนอื่น'}</span></li>
            <li className="flex items-start gap-2"><span className="text-sky-500">•</span><span>{isEn ? 'You only see closed periods. Slips the admin is still checking ("ร่าง") do not show up.' : 'เห็นเฉพาะงวดที่ปิดแล้ว สลิปที่แอดมินยังตรวจอยู่ (ร่าง) จะไม่ขึ้น'}</span></li>
            <li className="flex items-start gap-2"><span className="text-sky-500">•</span><span>{isEn ? 'Empty page = the admin has not closed your period yet.' : 'หน้ายังว่าง = แอดมินยังไม่ปิดงวดของคุณ'}</span></li>
            <li className="flex items-start gap-2"><span className="text-sky-500">•</span><span>{isEn ? 'Monthly slips are called "สลิปเงินเดือน". Weekly and custom ones are called "สลิปค่าจ้าง".' : 'งวดรายเดือนชื่อ "สลิปเงินเดือน" ส่วนงวดรายสัปดาห์และกำหนดเองชื่อ "สลิปค่าจ้าง"'}</span></li>
          </ul>
        </div>

        {/* ── P3: read slip + PDF ──────────────────────────────────── */}
        <div id="salary-staff-read" className="scroll-mt-6">
          <SectionHeader
            icon={<Download className="h-4 w-4" />}
            title={isEn ? 'Staff: read a slip and download the PDF' : 'พนักงาน: อ่านสลิป และดาวน์โหลด PDF'}
          />
          <RoleCard
            role="user"
            title={isEn ? 'Reading your slip' : 'อ่านสลิปของตัวเอง'}
            steps={[
              { n: 1, label: isEn ? 'Tap a slip in the list to open it.' : 'แตะที่สลิปในรายการเพื่อเปิดดู', tag: null },
              { n: 2, label: isEn ? 'The top shows the net amount (baht) you will receive.' : 'ด้านบนคือยอดสุทธิ (บาท) ที่จะได้รับ', tag: null },
              { n: 3, label: isEn ? 'The table shows one day per row: times in and out, event, duties and the pay for that day.' : 'ตารางแสดงทีละวัน: เวลาเข้า–ออก อีเวนต์ หน้าที่ และเงินของวันนั้น', tag: null },
              { n: 4, label: isEn ? 'The bottom shows base salary, manual adjustments and the net total.' : 'ท้ายสลิปมีเงินเดือนฐาน รายการปรับมือ และยอดสุทธิ', tag: null },
              { n: 5, label: isEn ? 'For the PDF, tap the download icon at the end of the row, or the ⋯ menu → "ดาวน์โหลด PDF".' : 'โหลด PDF: แตะไอคอนดาวน์โหลดท้ายแถวในรายการ หรือเมนู ⋯ → "ดาวน์โหลด PDF"', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="sky" icon={<Lock className="h-4 w-4" />} titleTh="สลิปเป็นแบบอ่านอย่างเดียว" titleEn="The slip is read-only" descTh="ถ้าเห็นตัวเลขผิด ให้แจ้งแอดมิน แอดมินแก้ให้ได้" descEn="If a number looks wrong, tell the admin. The admin can fix it." isEn={isEn} />
            <TipCard tone="violet" icon={<History className="h-4 w-4" />} titleTh="เคยถูกแก้ไข?" titleEn="Was it ever edited?" descTh={'ท้ายสลิปจะมี "ประวัติการแก้ไข" บอกเหตุผล และยอดก่อน → หลัง'} descEn="The bottom of the slip shows the edit history with the reason and the amount before → after." isEn={isEn} />
          </div>
        </div>

        {/* ── P4: notifications + reopened slips ───────────────────── */}
        <div id="salary-staff-notify" className="scroll-mt-6">
          <SectionHeader
            icon={<Bell className="h-4 w-4" />}
            title={isEn ? 'Staff: notifications and reopened slips' : 'พนักงาน: แจ้งเตือน และเมื่อสลิปถูกเปิดแก้ไข'}
          />
          <FlowchartBox
            title={isEn ? 'What you will see in the bell' : 'สิ่งที่จะเห็นในกระดิ่งแจ้งเตือน'}
            color="sky"
          >
            <FlowNode variant="admin" emoji="🔒" title={isEn ? 'The admin closes the period' : 'แอดมินปิดงวด'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="🔔" title={isEn ? 'Bell: your slip is closed, with the net amount' : 'กระดิ่งแจ้ง: สลิปปิดงวดแล้ว พร้อมยอดสุทธิ'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="👀" title={isEn ? 'Open it right away in "สลิปของฉัน"' : 'เปิดดูได้ทันทีที่ "สลิปของฉัน"'} />
            <FlowArrow label={isEn ? 'if the admin finds a mistake' : 'ถ้าแอดมินพบว่าต้องแก้'} />
            <FlowNode variant="admin" emoji="✏️" title={isEn ? 'The admin reopens the slip with a reason' : 'แอดมินกด "เปิดแก้ไข" พร้อมเหตุผล'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="🔔" title={isEn ? 'Bell: your slip was reopened, with the reason' : 'กระดิ่งแจ้ง: สลิปถูกเปิดแก้ไข พร้อมเหตุผล'} />
            <FlowArrow />
            <FlowNode variant="terminal" emoji="🙈" title={isEn ? 'While it is being fixed, the slip is hidden from you' : 'ระหว่างแก้ สลิปจะหายจากหน้าของคุณชั่วคราว'} />
            <FlowArrow />
            <FlowNode variant="success" emoji="🔔" title={isEn ? 'The admin closes it again: you are notified and the slip is back' : 'แอดมินปิดงวดใหม่: ได้แจ้งเตือนอีกครั้ง สลิปกลับมา'} />
          </FlowchartBox>
          <div className="mt-3">
            <TipCard tone="amber" icon={<Coins className="h-4 w-4" />} titleTh="ถ้าเคยได้เงินไปแล้ว" titleEn="If you were already paid" descTh="ยอดใหม่ต่างจากเดิม แอดมินจะโอนเพิ่ม หรือหักคืนเฉพาะส่วนต่าง" descEn="If the new amount is different, the admin transfers or takes back only the difference." isEn={isEn} />
          </div>
        </div>

        {/* ════ ADMIN ════ */}
        <p className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 pt-2">
          {isEn ? 'For admin' : 'สำหรับแอดมิน'}
        </p>

        {/* ── A1: first-time setup ─────────────────────────────────── */}
        <div id="salary-admin-setup" className="scroll-mt-6">
          <SectionHeader
            icon={<Settings className="h-4 w-4" />}
            title={isEn ? '1. First-time setup (only once)' : '1. ตั้งค่าครั้งแรก (ทำครั้งเดียว)'}
            color="violet"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleCard
              role="admin"
              title={isEn ? 'Menu "เงินเดือน" → "ตั้งค่า" (Settings)' : 'เมนู "เงินเดือน" → "ตั้งค่า"'}
              steps={[
                { n: 1, label: isEn ? 'Tab "ค่าตั้งค่างวด": set the cut-off day (default 25), then press "บันทึก" (save).' : 'แท็บ "ค่าตั้งค่างวด": ตั้ง "วันตัดรอบ" (ค่าเริ่มต้น 25) แล้วกด "บันทึก"', tag: null },
                { n: 2, label: isEn ? 'Same tab: set the out-of-province bonus (default 300 baht per check-in).' : 'แท็บเดียวกัน: ตั้งอัตราเบิ้ลต่างจังหวัด (ค่าเริ่มต้น 300 บาทต่อครั้ง)', tag: null },
                { n: 3, label: isEn ? 'Tab "หน้าที่หน้างาน": check the rate of each duty, edit it in the row, then press "บันทึก" on that row.' : 'แท็บ "หน้าที่หน้างาน": ตรวจอัตราของแต่ละหน้าที่ แก้ในแถว แล้วกด "บันทึก" ของแถวนั้น', tag: null },
                { n: 4, label: isEn ? 'New duty: press "เพิ่มหน้าที่". To stop using one, switch off "เปิดใช้งาน" instead of deleting it.' : 'หน้าที่ใหม่กด "เพิ่มหน้าที่" ถ้าเลิกใช้ให้ปิดสวิตช์ "เปิดใช้งาน" แทนการลบ', tag: null },
                { n: 5, label: isEn ? 'Tab "โปรไฟล์เงินเดือน": press the pencil icon for each person.' : 'แท็บ "โปรไฟล์เงินเดือน": กดไอคอนดินสอทีละคน', tag: null },
                { n: 6, label: isEn ? 'Fill in employment type, base salary, working hours, OT rate, position and start date, then save.' : 'กรอก "ประเภทการจ้าง" "เงินเดือนฐาน" "เวลาเริ่มงาน" "เวลาเลิกงาน" อัตรา OT ตำแหน่ง วันเริ่มงาน แล้วกด "บันทึก"', tag: null },
                { n: 7, label: isEn ? 'People marked "ยังไม่ตั้งค่า" (not set up) are skipped when calculating.' : 'คนที่มีป้าย "ยังไม่ตั้งค่า" จะถูกข้ามตอนคำนวณ', tag: null },
              ]}
            />
            <RoleCard
              role="admin"
              title={isEn ? 'Give staff access — menu "ผู้ใช้งาน" (Users)' : 'เปิดสิทธิ์ให้พนักงาน — เมนู "ผู้ใช้งาน"'}
              steps={[
                { n: 1, label: isEn ? 'Find the employee and open their module access ("สิทธิ์โมดูล").' : 'หาชื่อพนักงาน แล้วเปิดช่อง "สิทธิ์โมดูล" ของคนนั้น', tag: null },
                { n: 2, label: isEn ? 'Turn on "เงินเดือน" so they can see their own slips.' : 'เปิดโมดูล "เงินเดือน" เพื่อให้เห็นสลิปของตัวเอง', tag: null },
                { n: 3, label: isEn ? 'Admins already have access. No need to turn it on for yourself.' : 'แอดมินเข้าได้อยู่แล้ว ไม่ต้องเปิดให้ตัวเอง', tag: null },
                { n: 4, label: isEn ? 'Press "แก้ไขข้อมูล" (edit) and fill in the bank and account number of everyone you pay by transfer.' : 'กด "แก้ไขข้อมูล" แล้วกรอก "ธนาคาร" และ "เลขบัญชี" ของทุกคนที่รับเงินโอน', tag: null },
              ]}
            />
          </div>
        </div>

        {/* ── A2: open a period ────────────────────────────────────── */}
        <div id="salary-admin-open" className="scroll-mt-6">
          <SectionHeader
            icon={<CalendarDays className="h-4 w-4" />}
            title={isEn ? '2. Open a period — 3 kinds' : '2. เปิดงวด — มี 3 แบบ'}
            color="violet"
          />
          <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
            {isEn ? 'Everything starts from the menu "งวดคำนวณ" (pay periods).' : 'ทุกอย่างเริ่มที่เมนู "งวดคำนวณ"'}
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <NewItem icon={<Calendar className="h-3.5 w-3.5" />} titleTh="รายเดือน" titleEn="Monthly" descTh="ตามวันตัดรอบ มีเงินเดือนฐานและ OT ออฟฟิศ เดือนหนึ่งเปิดได้งวดเดียว" descEn="Follows the cut-off day. Has base salary and office OT. Only one per month." isEn={isEn} />
            <NewItem icon={<CalendarDays className="h-3.5 w-3.5" />} titleTh="รายสัปดาห์" titleEn="Weekly" descTh="จันทร์–อาทิตย์ เหมาะกับฟรีแลนซ์ ไม่มีเงินเดือนฐาน ไม่มี OT ออฟฟิศ" descEn="Monday to Sunday, good for freelancers. No base salary, no office OT." isEn={isEn} />
            <NewItem icon={<Edit3 className="h-3.5 w-3.5" />} titleTh="กำหนดเอง" titleEn="Custom" descTh="เลือกวันเริ่ม–วันสิ้นสุดเอง ไม่เกิน 62 วัน ไม่มีเงินเดือนฐาน ไม่มี OT ออฟฟิศ" descEn="Pick the start and end dates yourself, up to 62 days. No base salary, no office OT." isEn={isEn} />
          </ul>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleCard
              role="admin"
              title={isEn ? 'Fast way — one click' : 'วิธีเร็ว — กดครั้งเดียว'}
              steps={[
                { n: 1, label: isEn ? 'When a period is due but not opened yet, a green banner appears at the top.' : 'ถ้างวดถึงเวลาแล้วแต่ยังไม่เปิด จะมีแบนเนอร์สีเขียวขึ้นด้านบน', tag: null },
                { n: 2, label: isEn ? 'Press "เปิดและคำนวณ" (open and calculate).' : 'กด "เปิดและคำนวณ"', tag: null },
                { n: 3, label: isEn ? 'The system opens the period, ticks everyone with unpaid check-ins inside the period dates and makes their slips at once.' : 'ระบบเปิดงวด เลือกทุกคนที่มีเช็คอินยังไม่ถูกจ่ายในช่วงวันของงวด และทำสลิปร่างให้ทันที', tag: null },
                { n: 4, label: isEn ? 'A monthly period also includes every full-time employee and intern.' : 'งวดรายเดือนจะรวมพนักงานประจำและนักศึกษาฝึกงานทุกคนให้ด้วย', tag: null },
              ]}
            />
            <RoleCard
              role="admin"
              title={isEn ? 'Manual way — "เปิดงวดเอง"' : 'วิธีเอง — ปุ่ม "เปิดงวดเอง"'}
              steps={[
                { n: 1, label: isEn ? 'Press "เปิดงวดเอง" (open manually).' : 'กด "เปิดงวดเอง"', tag: null },
                { n: 2, label: isEn ? 'Choose the period kind: monthly, weekly or custom.' : 'เลือก "ชนิดงวด": รายเดือน / รายสัปดาห์ / กำหนดเอง', tag: null },
                { n: 3, label: isEn ? 'Enter the month, the starting Monday, or the start and end dates, depending on the kind.' : 'กรอกเดือน หรือวันจันทร์ที่เริ่ม หรือวันเริ่ม–วันสิ้นสุด ตามชนิดที่เลือก', tag: null },
                { n: 4, label: isEn ? 'Optionally tick the option to calculate right away, then press "เปิดงวด" (open).' : 'ติ๊กให้คำนวณทันทีได้ถ้าต้องการ แล้วกด "เปิดงวด"', tag: null },
              ]}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="amber" icon={<AlertTriangle className="h-4 w-4" />} titleTh="แต่ละงวดนับเฉพาะวันในงวด" titleEn="Each period counts only its own dates" descTh="งวดจะจ่ายเฉพาะเช็คอินที่อยู่ในช่วงวันของงวดนั้น ไม่ดึงงานก่อนวันเริ่มงวดมาให้ งานของงวดก่อนที่ยังไม่ถูกจ่ายจะขึ้นกล่องเตือนที่หน้างวดคำนวณ หน้าสลิปของคนนั้น และหน้าแรก ให้จ่ายโดยปิดงวดสลิปของงวดนั้น" descEn="A period pays only the check-ins inside its own dates. Work before the start date is not pulled in. Unpaid work from earlier periods shows a warning on the runs page, on that person's slip and on the home page: pay it by closing the slip of that period." isEn={isEn} />
            <TipCard tone="emerald" icon={<Repeat className="h-4 w-4" />} titleTh="งวดทับกันได้ ไม่จ่ายซ้ำ" titleEn="Periods may overlap — no double pay" descTh="เช็คอินหน้างานจ่ายได้ครั้งเดียว จึงเปิดงวดรายสัปดาห์ทับช่วงงวดรายเดือนได้" descEn="Each on-site check-in is paid only once, so a weekly period can overlap a monthly one." isEn={isEn} />
          </div>
        </div>

        {/* ── A3: pick people + calculate ──────────────────────────── */}
        <div id="salary-admin-calc" className="scroll-mt-6">
          <SectionHeader
            icon={<Users className="h-4 w-4" />}
            title={isEn ? '3. Pick people and calculate' : '3. เลือกคนและคำนวณ'}
            color="violet"
          />
          <RoleCard
            role="admin"
            title={isEn ? 'On the period page' : 'ในหน้างวด'}
            steps={[
              { n: 1, label: isEn ? 'Click the period name in the table to open it.' : 'กดชื่องวดในตาราง เพื่อเข้าหน้างวด', tag: null },
              { n: 2, label: isEn ? 'In "เลือกคนเข้างวด" (choose people), the people who should be paid are already ticked.' : 'ในส่วน "เลือกคนเข้างวด" ระบบติ๊กคนที่ควรได้เงินไว้ให้แล้ว', tag: null },
              { n: 3, label: isEn ? 'Filter by department or employment type, then tick or untick people.' : 'กรองตาม "แผนก" หรือ "ประเภทการจ้าง" แล้วติ๊กเพิ่มหรือเอาออกได้', tag: null },
              { n: 4, label: isEn ? 'Press "คำนวณที่เลือก" (calculate selected). Everyone ticked gets a slip.' : 'กด "คำนวณที่เลือก" ทุกคนที่ติ๊กจะได้สลิปร่าง', tag: null },
              { n: 5, label: isEn ? 'You can add people later. Just repeat steps 2–4.' : 'เพิ่มคนเข้างวดทีหลังได้ ทำซ้ำขั้นที่ 2–4', tag: null },
            ]}
          />
          <div className="mt-3">
            <TipCard tone="amber" icon={<UserX className="h-4 w-4" />} titleTh={'คนที่ "ยังไม่ตั้งค่าเงินเดือน" ถูกข้าม'} titleEn="People without a salary profile are skipped" descTh={'ไปตั้งค่าในแท็บ "โปรไฟล์เงินเดือน" ก่อน แล้วกลับมาคำนวณอีกครั้ง'} descEn="Set them up in the salary profiles tab first, then calculate again." isEn={isEn} />
          </div>
        </div>

        {/* ── A4: check + edit the daily slip ──────────────────────── */}
        <div id="salary-admin-edit" className="scroll-mt-6">
          <SectionHeader
            icon={<Edit3 className="h-4 w-4" />}
            title={isEn ? '4. Check and edit the day-by-day slip' : '4. ตรวจและแก้สลิปแบบรายวัน'}
            color="violet"
          />
          <RoleCard
            role="admin"
            title={isEn ? 'Open the slip and edit right in the cells' : 'เปิดสลิปแล้วแก้ในช่องได้เลย'}
            steps={[
              { n: 1, label: isEn ? 'On the period page, press "เปิดดู" (view) on that person.' : 'ในหน้างวด กด "เปิดดู" ที่แถวของคนนั้น', tag: null },
              { n: 2, label: isEn ? 'One row per day: times in and out, duties, event, ตจว. and the pay for that day.' : 'ตาราง 1 วัน 1 แถว: เวลาเข้า–ออก หน้าที่ อีเวนต์ ตจว. และเงินของวันนั้น', tag: null },
              { n: 3, label: isEn ? 'Click a cell, type the new value, then press Enter or click somewhere else.' : 'คลิกช่องที่จะแก้ พิมพ์ค่าใหม่ แล้วกด Enter หรือคลิกที่อื่น', tag: null },
              { n: 4, label: isEn ? 'It saves and recalculates at once. There is no calculate button to press.' : 'ระบบบันทึกและคำนวณใหม่ให้ทันที ไม่ต้องกดปุ่มคำนวณ', tag: null },
              { n: 5, label: isEn ? 'Out-of-province job? Switch on ตจว. for that check-in.' : 'งานต่างจังหวัด ให้เปิดสวิตช์ ตจว. ของเช็คอินนั้น', tag: null },
              { n: 6, label: isEn ? 'A day is missing? Use "เพิ่มเช็คอินที่ลืม" (add a forgotten check-in) under the table.' : 'ลืมเช็คอินบางวัน ใช้ "เพิ่มเช็คอินที่ลืม" ท้ายตาราง', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="violet" icon={<Edit3 className="h-4 w-4" />} titleTh="พิมพ์ยอดทับตัวเลขที่ระบบคิด" titleEn="Typing over a calculated amount" descTh="คลิกยอดเงิน (ค่าสตาฟ เบิ้ล OT) แล้วพิมพ์ยอดใหม่ ต้องใส่เหตุผลทุกครั้ง ยอดที่พิมพ์ไม่หายแม้ระบบคำนวณใหม่" descEn="Click an amount (duty pay, bonus, OT) and type a new one. A reason is always required. Your amount stays even after recalculation." isEn={isEn} />
            <TipCard tone="sky" icon={<RefreshCw className="h-4 w-4" />} titleTh="อยากกลับไปใช้ยอดของระบบ" titleEn="Back to the calculated amount" descTh={'กดไอคอนลูกศรวนข้างยอดนั้น ("ล้างการแก้มือ") ยอดจะกลับเป็นค่าที่ระบบคำนวณ'} descEn="Press the circular-arrow icon next to the amount (clear manual edit) to go back to the calculated value." isEn={isEn} />
            <TipCard tone="amber" icon={<Clock className="h-4 w-4" />} titleTh="เวลาออกน้อยกว่าเวลาเข้า" titleEn="Check-out earlier than check-in" descTh="ระบบจะถามก่อนว่าเป็นงานข้ามคืนหรือไม่ ไม่บันทึกเองเงียบๆ" descEn="The system asks first whether it was an overnight job. It never saves this silently." isEn={isEn} />
            <TipCard tone="emerald" icon={<Smile className="h-4 w-4" />} titleTh="บนมือถือ" titleEn="On mobile" descTh="แต่ละวันเป็นการ์ด แตะการ์ดเพื่อเปิดช่องแก้ใต้การ์ด" descEn="Each day is a card. Tap the card to open the edit fields below it." isEn={isEn} />
          </div>
        </div>

        {/* ── A5: open items + accept ──────────────────────────────── */}
        <div id="salary-admin-pending" className="scroll-mt-6">
          <SectionHeader
            icon={<ClipboardList className="h-4 w-4" />}
            title={isEn ? '5. Open items ("งานค้าง") and the accept button' : '5. งานค้าง และปุ่มยอมรับ'}
            color="violet"
          />
          <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3 leading-relaxed">
            {isEn
              ? 'The box "งานค้างก่อนปิดงวด" at the top of the slip counts what is left. It must reach 0 before the slip can be closed.'
              : 'กล่อง "งานค้างก่อนปิดงวด" อยู่บนสุดของสลิป บอกว่าเหลือกี่รายการ ต้องเหลือ 0 ถึงจะปิดงวดได้'}
          </p>
          <RoleCard
            role="admin"
            title={isEn ? 'Clear the open items' : 'เคลียร์งานค้าง'}
            steps={[
              { n: 1, label: isEn ? 'Click an item. The page jumps to that day and highlights it.' : 'คลิกรายการ หน้าจอจะเลื่อนไปวันนั้นและไฮไลต์ให้', tag: null },
              { n: 2, label: isEn ? 'Fix the data. The item disappears by itself.' : 'แก้ข้อมูลให้ถูก รายการจะหายไปเอง', tag: null },
              { n: 3, label: isEn ? 'Already correct? Press "ยอมรับ" (accept). It no longer counts as open.' : 'ถ้าถูกอยู่แล้วไม่ต้องแก้ กด "ยอมรับ" รายการนั้นจะไม่นับเป็นงานค้าง', tag: null },
              { n: 4, label: isEn ? 'Pressed by mistake? Press "ยกเลิกการยอมรับ" (undo).' : 'กดผิด กด "ยกเลิกการยอมรับ" ได้', tag: null },
            ]}
          />
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Item' : 'รายการ'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'What to do' : 'ต้องทำอะไร'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Can accept?' : 'กดยอมรับได้ไหม'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <ChecklistRow emoji="🕘" label={isEn ? 'No check-out time' : 'ไม่มีเวลาออก'} required={isEn ? 'Fill in the check-out time' : 'เติมเวลาออก'} passes={isEn ? 'Yes' : 'ได้'} />
                <ChecklistRow emoji="🎪" label={isEn ? 'No event linked' : 'ไม่ได้ผูกอีเวนต์'} required={isEn ? 'Pick the event' : 'เลือกอีเวนต์'} passes={isEn ? 'Yes' : 'ได้'} />
                <ChecklistRow emoji="🧰" label={isEn ? 'No duty ticked' : 'ไม่ได้ติ๊กหน้าที่'} required={isEn ? 'Tick the duties' : 'ติ๊กหน้าที่'} passes={isEn ? 'Yes' : 'ได้'} />
                <ChecklistRow emoji="✍️" label={isEn ? 'A typed amount was lost' : 'ค่าที่แก้มือหาย'} required={isEn ? 'Check the amount again' : 'ตรวจยอดนั้นอีกครั้ง'} passes={isEn ? 'Yes' : 'ได้'} />
                <ChecklistRow emoji="🏃" label={isEn ? 'Runner amount empty' : 'รันเนอร์ยังไม่กรอกยอด'} required={isEn ? 'Type the amount (0 is allowed)' : 'กรอกยอด (ใส่ 0 ได้)'} passes={isEn ? 'No — must be filled in' : 'ไม่ได้ ต้องกรอกเท่านั้น'} />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── A6: runner + manual adjustments ──────────────────────── */}
        <div id="salary-admin-runner" className="scroll-mt-6">
          <SectionHeader
            icon={<Coins className="h-4 w-4" />}
            title={isEn ? '6. Runner amounts and manual adjustments' : '6. รันเนอร์ และรายการปรับมือ'}
            color="violet"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleCard
              role="admin"
              title={isEn ? 'Runner — type the amount per day' : 'รันเนอร์ — กรอกยอดรายวัน'}
              steps={[
                { n: 1, label: isEn ? 'Days with the runner duty ticked have an empty runner cell.' : 'วันที่ติ๊กหน้าที่รันเนอร์ จะมีช่องรันเนอร์ว่างรอกรอก', tag: null },
                { n: 2, label: isEn ? 'Type the amount, then press Tab to jump to the next empty day.' : 'พิมพ์ยอด แล้วกด Tab เพื่อไปวันถัดไปที่ยังว่าง', tag: null },
                { n: 3, label: isEn ? 'Same amount every day? Press "ใช้ยอดนี้กับวันที่ยังว่าง" to fill them all at once.' : 'ยอดเท่ากันทุกวัน กด "ใช้ยอดนี้กับวันที่ยังว่าง" เติมให้ครบในครั้งเดียว', tag: null },
                { n: 4, label: isEn ? 'No runner pay that day? Type 0. Do not leave it empty.' : 'วันไหนไม่ได้เงินรันเนอร์ ให้ใส่ 0 ห้ามปล่อยว่าง', tag: null },
              ]}
            />
            <RoleCard
              role="admin"
              title={isEn ? 'Manual adjustments — add or deduct money' : 'รายการปรับมือ — บวกหรือหักเงินเอง'}
              steps={[
                { n: 1, label: isEn ? 'Scroll to the bottom of the slip, to "รายการปรับมือ".' : 'เลื่อนลงท้ายสลิป ไปที่ "รายการปรับมือ"', tag: null },
                { n: 2, label: isEn ? 'Type a name, e.g. bonus or social security.' : 'พิมพ์ชื่อรายการ เช่น โบนัส หรือหักประกันสังคม', tag: null },
                { n: 3, label: isEn ? 'Type the amount: positive adds money, negative deducts it. It cannot be 0.' : 'ใส่จำนวนเงิน ยอดบวก = เพิ่มเงิน ยอดติดลบ = หักเงิน (ใส่ 0 ไม่ได้)', tag: null },
                { n: 4, label: isEn ? 'Press "เพิ่มรายการปรับมือ" (add).' : 'กด "เพิ่มรายการปรับมือ"', tag: null },
              ]}
            />
          </div>
          <div className="mt-3">
            <TipCard tone="sky" icon={<Edit3 className="h-4 w-4" />} titleTh="ใช้รายการปรับมือเมื่อไร" titleEn="When to use manual adjustments" descTh="ประกันสังคม ภาษี หักวันลา โบนัส และคนที่เข้าหรือออกกลางงวด" descEn="Social security, tax, leave deductions, bonuses, and people who join or leave mid-period." isEn={isEn} />
          </div>
        </div>

        {/* ── A7: close the period ─────────────────────────────────── */}
        <div id="salary-admin-close" className="scroll-mt-6">
          <SectionHeader
            icon={<Lock className="h-4 w-4" />}
            title={isEn ? '7. Close the period' : '7. ปิดงวด'}
            color="violet"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleCard
              role="admin"
              title={isEn ? 'Close one slip' : 'ปิดทีละใบ'}
              steps={[
                { n: 1, label: isEn ? 'Bring the open items down to 0.' : 'เคลียร์งานค้างให้เหลือ 0', tag: null },
                { n: 2, label: isEn ? 'Press "ปิดงวด" in the slip header. While items are open it shows the count and cannot be pressed.' : 'กด "ปิดงวด" บนหัวสลิป ถ้ายังมีงานค้าง ปุ่มจะบอกจำนวนค้างและกดไม่ได้', tag: null },
                { n: 3, label: isEn ? 'Confirm. The slip locks, and the employee is notified and can see it.' : 'กดยืนยัน สลิปล็อก พนักงานได้แจ้งเตือนและเห็นสลิปทันที', tag: null },
              ]}
            />
            <RoleCard
              role="admin"
              title={isEn ? 'Close all the rest' : 'ปิดที่เหลือทั้งหมด'}
              steps={[
                { n: 1, label: isEn ? 'On the period page press "ปิดงวดที่เหลือทั้งหมด" (close all remaining).' : 'ในหน้างวด กด "ปิดงวดที่เหลือทั้งหมด"', tag: null },
                { n: 2, label: isEn ? 'Slips that still have open items are skipped, and their names are shown.' : 'ใบที่ยังมีงานค้างจะถูกข้าม ระบบบอกชื่อให้', tag: null },
                { n: 3, label: isEn ? 'Fix the skipped slips, then press it again.' : 'แก้ใบที่ถูกข้าม แล้วกดอีกครั้ง', tag: null },
              ]}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <TipCard tone="emerald" icon={<Receipt className="h-4 w-4" />} titleTh="ปิดแล้วส่งเข้าต้นทุนให้เอง" titleEn="Sent to Costs automatically" descTh="ค่าสตาฟ เบิ้ลต่างจังหวัด และรันเนอร์ ถูกส่งเข้าโมดูลต้นทุนของแต่ละอีเวนต์ ส่วน OT และรายการปรับมือไม่ส่ง" descEn="Duty pay, out-of-province bonus and runner amounts go to the Costs module of each event. OT and manual adjustments do not." isEn={isEn} />
            <TipCard tone="sky" icon={<Send className="h-4 w-4" />} titleTh="ส่งเข้าต้นทุนไม่สำเร็จ" titleEn="Costs did not update?" descTh={'เมนู ⋯ บนหัวสลิป → "ส่งเข้าต้นทุนอีกครั้ง"'} descEn="Slip header ⋯ menu → send to Costs again." isEn={isEn} />
            <TipCard tone="amber" icon={<Lock className="h-4 w-4" />} titleTh="ปิดแล้วแก้ตัวเลขไม่ได้" titleEn="Closed slips are locked" descTh={'ต้องการแก้ ให้ใช้ "เปิดแก้ไข" (ข้อ 9)'} descEn="To change anything, reopen the slip (step 9)." isEn={isEn} />
          </div>
        </div>

        {/* ── A8: transfer summary + paid ──────────────────────────── */}
        <div id="salary-admin-pay" className="scroll-mt-6">
          <SectionHeader
            icon={<FileSpreadsheet className="h-4 w-4" />}
            title={isEn ? '8. Transfer summary, Excel and marking paid' : '8. สรุปยอดโอน Excel และบันทึกว่าจ่ายแล้ว'}
            color="violet"
          />
          <RoleCard
            role="admin"
            title={isEn ? 'Pay everyone' : 'จ่ายเงินทุกคน'}
            steps={[
              { n: 1, label: isEn ? 'On the period page scroll down to "สรุปยอดโอน" (transfer summary).' : 'ในหน้างวด เลื่อนลงไปที่ "สรุปยอดโอน"', tag: null },
              { n: 2, label: isEn ? 'Check the name, bank, account number and amount of each person.' : 'ดูชื่อ ธนาคาร เลขบัญชี และยอดโอนของแต่ละคน', tag: null },
              { n: 3, label: isEn ? 'People without an account are flagged. Fill it in under the menu "ผู้ใช้งาน".' : 'ใครยังไม่มีเลขบัญชีจะมีคำเตือน ให้ไปกรอกที่เมนู "ผู้ใช้งาน"', tag: null },
              { n: 4, label: isEn ? 'Press "ดาวน์โหลด Excel" to get the file for the bank transfer.' : 'กด "ดาวน์โหลด Excel" ไว้ใช้โอนเงิน', tag: null },
              { n: 5, label: isEn ? 'After transferring, press "จ่ายแล้วทั้งหมด" (all paid), or "จ่ายแล้ว" for one person.' : 'โอนเสร็จ กด "จ่ายแล้วทั้งหมด" หรือกด "จ่ายแล้ว" ทีละคน', tag: null },
              { n: 6, label: isEn ? 'The employee slip changes from "รอจ่าย" to "จ่ายแล้ว".' : 'สลิปของพนักงานเปลี่ยนจาก "รอจ่าย" เป็น "จ่ายแล้ว"', tag: null },
            ]}
          />
        </div>

        {/* ── A9: reopen after closing ─────────────────────────────── */}
        <div id="salary-admin-reopen" className="scroll-mt-6">
          <SectionHeader
            icon={<RefreshCw className="h-4 w-4" />}
            title={isEn ? '9. Reopen a slip after closing' : '9. เปิดแก้ไขหลังปิดงวด'}
            color="violet"
          />
          <FlowchartBox
            title={isEn ? 'Found a mistake after closing' : 'พบข้อผิดพลาดหลังปิดงวด'}
            color="purple"
          >
            <FlowNode variant="admin" emoji="⋯" title={isEn ? 'Open the slip → ⋯ menu → "เปิดแก้ไข" (reopen)' : 'เปิดสลิป → เมนู ⋯ → "เปิดแก้ไข"'} />
            <FlowArrow />
            <FlowNode variant="admin" emoji="✍️" title={isEn ? 'Type the reason — at least 10 characters' : 'ใส่ "เหตุผลที่เปิดแก้ไข" อย่างน้อย 10 ตัวอักษร'} />
            <FlowArrow />
            <FlowNode variant="terminal" emoji="🙈" title={isEn ? 'The slip goes back to "ร่าง" and is hidden from the employee' : 'สลิปกลับเป็น "ร่าง" พนักงานมองไม่เห็นชั่วคราว'} />
            <FlowArrow />
            <FlowNode variant="admin" emoji="✏️" title={isEn ? 'Fix it, then press "ปิดงวด" again' : 'แก้ให้ถูก แล้วกด "ปิดงวด" ใหม่'} />
            <FlowArrow />
            <FlowNode variant="success" emoji="🔔" title={isEn ? 'The employee is notified on reopen and again on re-close' : 'พนักงานได้แจ้งเตือนทั้งตอนเปิดแก้และตอนปิดงวดใหม่'} />
          </FlowchartBox>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="amber" icon={<Banknote className="h-4 w-4" />} titleTh="สลิปที่จ่ายแล้วก็เปิดแก้ได้" titleEn="Paid slips can be reopened too" descTh={'หัวสลิปจะบอกยอดที่จ่ายไป ยอดใหม่ และส่วนต่าง ว่าต้องโอนเพิ่มหรือหักคืน จนกว่าจะกด "จ่ายแล้ว" อีกครั้ง'} descEn="The slip header shows the amount paid, the new amount and the difference to transfer or take back, until you press paid again." isEn={isEn} />
            <TipCard tone="sky" icon={<History className="h-4 w-4" />} titleTh="เก็บประวัติทุกครั้ง" titleEn="Every change is recorded" descTh={'ท้ายสลิปและใน PDF มี "ประวัติการแก้ไข": ใคร เมื่อไร เหตุผล ยอดก่อน → หลัง'} descEn="The bottom of the slip and the PDF show the edit history: who, when, why, and the amount before → after." isEn={isEn} />
          </div>
        </div>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <div id="salary-faq" className="scroll-mt-6">
          <SectionHeader
            icon={<CircleHelp className="h-4 w-4" />}
            title={isEn ? 'Frequently asked questions' : 'คำถามที่พบบ่อย'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="ทำไมยังไม่เห็นสลิป?" titleEn="Why can I not see my slip yet?" descTh="แอดมินยังไม่ปิดงวด หรือสลิปกำลังถูกเปิดแก้ไข สลิปจะขึ้นเมื่อปิดงวดแล้ว" descEn="The admin has not closed it yet, or it is being fixed. It appears once it is closed." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="ทำไมวันนั้นไม่มี OT?" titleEn="Why is there no OT for that day?" descTh="อาจลืมเช็คเอาท์ เกินเวลาไม่ถึง 30 นาที หรือเป็นเช็คอิน WFH" descEn="You may have forgotten to check out, stayed less than 30 minutes extra, or it was a WFH check-in." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="ฟรีแลนซ์ได้เงินเดือนฐานไหม?" titleEn="Do freelancers get a base salary?" descTh="ไม่ได้ ฟรีแลนซ์ได้ค่าหน้าที่ และ OT เฉพาะวันไปหน้างาน" descEn="No. Freelancers get duty pay and OT on on-site days only." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="ใครเป็นคนติ๊ก ตจว.?" titleEn="Who ticks ตจว. (out of province)?" descTh="แอดมินติ๊กในสลิป ได้เบิ้ลต่างจังหวัดต่อเช็คอิน (ค่าเริ่มต้น 300 บาท)" descEn="The admin ticks it on the slip. It adds the out-of-province bonus per check-in (default 300 baht)." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="ระบบหักประกันสังคมหรือภาษีให้ไหม?" titleEn="Does it deduct social security or tax?" descTh="ไม่หักให้เอง แอดมินใส่เป็นรายการปรับมือยอดติดลบ" descEn="Not by itself. The admin adds a negative manual adjustment." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="เช็คอินเดียวจะถูกจ่ายซ้ำสองงวดไหม?" titleEn="Can one check-in be paid twice?" descTh="ไม่ เช็คอินหน้างานจ่ายได้ครั้งเดียว งวดอื่นจะไม่ดึงมาอีก" descEn="No. An on-site check-in is paid once. Other periods will not pick it up again." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="เปลี่ยนวันตัดรอบแล้ว งวดเก่าเปลี่ยนด้วยไหม?" titleEn="Does changing the cut-off day change old periods?" descTh="ไม่ มีผลกับงวดที่เปิดใหม่หลังจากนั้นเท่านั้น" descEn="No. It only affects periods opened afterwards." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="ปุ่มปิดงวดกดไม่ได้?" titleEn="The close button cannot be pressed?" descTh={'ยังมีงานค้าง ดูกล่อง "งานค้างก่อนปิดงวด" แล้วแก้หรือกด "ยอมรับ" จนเหลือ 0'} descEn="There are still open items. Check the open-items box, then fix them or accept them until 0 are left." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="เดือนหนึ่งเปิดงวดรายเดือนได้กี่งวด?" titleEn="How many monthly periods per month?" descTh="ได้งวดเดียว ถ้าต้องการเพิ่มคน ให้เพิ่มเข้างวดเดิม" descEn="Only one. To add people, add them to the existing period." isEn={isEn} />
          </div>
        </div>

        {/* ── Menu shortcuts ───────────────────────────────────────── */}
        <div id="salary-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/salary"          labelEn="My slips"                 labelTh="สลิปของฉัน" />
            <MenuLink href="/salary/runs"     labelEn="Pay periods (admin)"      labelTh="งวดคำนวณ (แอดมิน)" />
            <MenuLink href="/salary/settings" labelEn="Salary settings (admin)"  labelTh="ตั้งค่าเงินเดือน (แอดมิน)" />
            <MenuLink href="/check-in"        labelEn="Check in"                 labelTh="เช็คอิน" />
          </div>
        </div>
      </section>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODULE: EQUIPMENT FLOW (ใบจัดของทั้งเส้น)
          ════════════════════════════════════════════════════════════════ */}
      {view === 'equipment' && (
      <section className="space-y-6">
        <ModuleHero mod={MODULES.find(m => m.slug === 'equipment')!} isEn={isEn} backHref="/howto" />
        <ModuleSubToc mod={MODULES.find(m => m.slug === 'equipment')!} isEn={isEn} />

        {/* ── Start here ───────────────────────────────────────────── */}
        <div id="equip-start" className="scroll-mt-6">
          <SectionHeader
            icon={<Boxes className="h-4 w-4" />}
            title={isEn ? 'Start here — the whole equipment flow' : 'เริ่มที่นี่ — flow อุปกรณ์ทั้งเส้น'}
            color="violet"
          />
          <div className="rounded-xl border-2 border-violet-200 dark:border-violet-900 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-zinc-900 p-4 space-y-2">
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {isEn
                ? 'From the moment sales pick a package until every item is back on its shelf, the equipment of an event moves through one packing list. 1 event = 1 packing list.'
                : 'ตั้งแต่ทีมขายเลือกแพ็กเกจ จนของทุกชิ้นกลับขึ้นชั้น อุปกรณ์ของอีเวนต์เดินผ่าน "ใบจัดของ" ใบเดียว — 1 อีเวนต์ = 1 ใบจัดของ'}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {isEn
                ? 'On the job tracking page, readiness item 5 is now called "จัดของ" (packing), replacing the old "กระเป๋า" (kits).'
                : 'ในหน้าติดตามงาน ความพร้อมข้อที่ 5 ชื่อ "จัดของ" (แทน "กระเป๋า" เดิม)'}
            </p>
          </div>

          <div className="mt-4">
            <FlowchartBox
              title={isEn ? 'One event — from the sale to the shelf' : 'หนึ่งอีเวนต์ — ตั้งแต่ขายจนของกลับขึ้นชั้น'}
              subtitle={isEn ? 'sales → packing team → on-site team → packing team' : 'ทีมขาย → ทีมจัดของ → ทีมหน้างาน → ทีมจัดของ'}
              color="purple"
            >
              <FlowNode variant="start" emoji="🛒" title={isEn ? 'Sales pick a package (+ booth unit)' : 'ทีมขายเลือกแพ็กเกจ (+ตู้)'} />
              <FlowArrow />
              <FlowNode variant="user" emoji="📝" title={isEn ? 'Packing team opens the packing list' : 'ทีมจัดของเปิดใบจัดของ'} />
              <FlowArrow />
              <FlowNode variant="user" emoji="🔎" title={isEn ? 'Select the items' : 'เลือกของ'} />
              <FlowArrow />
              <FlowNode variant="user" emoji="🧺" title={isEn ? 'Pick them shelf by shelf' : 'หยิบตามชั้น'} />
              <FlowArrow />
              <FlowNode variant="admin" emoji="📦" title={isEn ? 'Photo + place at the pickup spot' : 'ถ่ายรูป + วางที่จุดรับของ'} subtitle={isEn ? 'list becomes "พร้อมรับ" (ready)' : 'ใบเป็น "พร้อมรับ"'} />
              <FlowArrow />
              <FlowNode variant="user" emoji="🚚" title={isEn ? 'On-site team scans the QR and takes the items' : 'ทีมหน้างานสแกน QR รับของ'} subtitle={isEn ? 'list becomes "ออกงาน" (out) · the on-site job on the event-day board becomes "ขนของ" (loading)' : 'ใบเป็น "ออกงาน" · ใบงานบนบอร์ดวันงานเป็น "ขนของ"'} />
              <FlowArrow />
              <FlowNode variant="user" emoji="📍" title={isEn ? 'Check in on-site as usual' : 'เช็คอินหน้างานตามเดิม'} />
              <FlowArrow />
              <FlowNode variant="user" emoji="↩️" title={isEn ? 'Back at the office, scan the QR and return' : 'กลับมาสแกน QR คืนของ'} subtitle={isEn ? 'list becomes "คืนแล้ว" (returned) · the event closes' : 'ใบเป็น "คืนแล้ว" · อีเวนต์ปิด'} />
              <FlowArrow />
              <FlowNode variant="success" emoji="🗄️" title={isEn ? 'Packing team puts everything back on the shelves' : 'ทีมจัดของคืนชั้น'} subtitle={isEn ? 'list becomes "คืนชั้นแล้ว" (restocked)' : 'ใบเป็น "คืนชั้นแล้ว"'} />
            </FlowchartBox>
          </div>
        </div>

        {/* ── Roles ────────────────────────────────────────────────── */}
        <div id="equip-roles" className="scroll-mt-6">
          <SectionHeader
            icon={<Users className="h-4 w-4" />}
            title={isEn ? 'Who does what' : 'ใครทำอะไร'}
            color="violet"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="🛒 ทีมขาย"
              titleEn="🛒 Sales"
              lines={isEn
                ? ['Pick the package, the booth unit and the build style for the job', 'Watch the "equipment may run short" warning']
                : ['เลือกแพ็กเกจ ตู้ และแบบประกอบให้งาน', 'ดูคำเตือน "อุปกรณ์อาจไม่พอ"']}
            />
            <FeatureBlock
              titleTh="🧺 ทีมจัดของ"
              titleEn="🧺 Packing team"
              lines={isEn
                ? ['People in the department set as "ทีมจัดของ" in /jobs/settings', 'Open the list, select, pick, confirm and restock', 'Set up the stock settings and packages together with the admin']
                : ['คนในแผนก "ทีมจัดของ" ที่ตั้งไว้ใน /jobs/settings', 'เปิดใบ เลือกของ หยิบ ยืนยัน และคืนชั้น', 'ตั้งค่าคลังและแพ็กเกจร่วมกับแอดมิน']}
            />
            <FeatureBlock
              titleTh="🚚 ทีมหน้างาน"
              titleEn="🚚 On-site team"
              lines={isEn
                ? ['Everyone who can use Events or Stock', 'Take and return the items at the pickup-spot QR']
                : ['ทุกคนที่มีสิทธิ์อีเวนต์หรือคลัง', 'รับของ / คืนของที่จุด QR']}
            />
            <FeatureBlock
              titleTh="✅ ผู้ปิดงาน"
              titleEn="✅ Event closers"
              lines={isEn
                ? ['Admins and the people listed in Settings > Events', 'Close the event']
                : ['แอดมิน และรายชื่อใน ตั้งค่า > อีเวนต์', 'ปิดอีเวนต์']}
            />
            <FeatureBlock
              titleTh="🛠️ แอดมิน"
              titleEn="🛠️ Admin"
              lines={isEn
                ? ['Sets up everything', 'Can change the packages of every job']
                : ['ตั้งค่าทุกอย่าง', 'แก้แพ็กเกจของทุกงานได้']}
            />
          </div>
        </div>

        {/* ── Terms ────────────────────────────────────────────────── */}
        <div id="equip-terms" className="scroll-mt-6">
          <SectionHeader
            icon={<BookOpen className="h-4 w-4" />}
            title={isEn ? 'Words used in this guide' : 'ศัพท์ที่ใช้'}
            color="violet"
          />
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <NewItem icon={<Tag className="h-3.5 w-3.5" />} titleTh="ประเภทอุปกรณ์" titleEn="Equipment category" descTh="กลุ่มของอุปกรณ์ เช่น กล้อง ไฟ ตู้ประกอบ" descEn="A group of equipment, e.g. cameras, lights, booth frames." isEn={isEn} />
            <NewItem icon={<Package className="h-3.5 w-3.5" />} titleTh="หน่วยอุปกรณ์" titleEn="Equipment unit" descTh="อุปกรณ์เดี่ยว 1 ชิ้น หรือกระเป๋า 1 ใบ (ของข้างในไปทั้งใบ)" descEn="One single item, or one kit bag (everything inside goes with it)." isEn={isEn} />
            <NewItem icon={<Boxes className="h-3.5 w-3.5" />} titleTh="แพ็กเกจ / ข้อกำหนด / ตัวเลือกอุปกรณ์" titleEn="Package / requirement / allowed items" descTh="แพ็กเกจมีข้อกำหนด = ประเภท × จำนวนต่อชุด แต่ละข้อมีตัวเลือกอุปกรณ์ (ไม่เลือก = ทุกชิ้นในประเภท)" descEn="A package has requirements = category × quantity per set. Each has allowed items (none chosen = every item of the category)." isEn={isEn} />
            <NewItem icon={<Building2 className="h-3.5 w-3.5" />} titleTh="ตู้" titleEn="Booth" descTh={'ประเภทที่ติ๊ก "ทีมขายเลือกชิ้นเอง" แต่ละชุดตู้เป็นอุปกรณ์ 1 ชิ้น'} descEn="A category marked so that sales pick the exact unit. Each booth set is one item." isEn={isEn} />
            <NewItem icon={<Hammer className="h-3.5 w-3.5" />} titleTh="แบบประกอบ" titleEn="Build style" descTh="ป้ายบอกแบบ (ประกอบ 1/2/3) ไม่บังคับ ไม่มีชิ้นส่วนต่างกัน ตู้ชุดเดียวกันใช้ได้แบบเดียวต่องาน" descEn="A label for the style (build 1/2/3). Optional, no different parts. One booth set uses one style per job." isEn={isEn} />
            <NewItem icon={<ClipboardList className="h-3.5 w-3.5" />} titleTh="ใบจัดของ (6 สถานะ)" titleEn="Packing list (6 states)" descTh="เลือกของ → กำลังหยิบ → พร้อมรับ → ออกงาน → คืนแล้ว → คืนชั้นแล้ว" descEn="Selecting → picking → ready → out → returned → restocked." isEn={isEn} />
            <NewItem icon={<QrCode className="h-3.5 w-3.5" />} titleTh="จุดรับของ (QR)" titleEn="Pickup spot (QR)" descTh="จุดในออฟฟิศที่วางของที่จัดเสร็จ มี QR ให้สแกนรับและคืนของ" descEn="A place in the office where packed items wait, with a QR to scan for taking and returning them." isEn={isEn} />
            <NewItem icon={<Sparkles className="h-3.5 w-3.5" />} titleTh="ของเสริม" titleEn="Extras" descTh="หน่วยอุปกรณ์นอกแพ็กเกจที่ทีมจัดของเติมเข้าใบ" descEn="Units outside the package that the packing team adds to the list." isEn={isEn} />
          </ul>
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'List state' : 'สถานะใบ'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Meaning' : 'ความหมาย'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-xs">
                <tr><td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">📝 {isEn ? 'เลือกของ (selecting)' : 'เลือกของ'}</td><td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{isEn ? 'The packing team chooses an item for every requirement' : 'ทีมจัดของเลือกชิ้นให้ครบทุกข้อกำหนด'}</td></tr>
                <tr><td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">🧺 {isEn ? 'กำลังหยิบ (picking)' : 'กำลังหยิบ'}</td><td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{isEn ? 'Items are taken off the shelves one by one' : 'กำลังหยิบของลงจากชั้นทีละชิ้น'}</td></tr>
                <tr><td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">📦 {isEn ? 'พร้อมรับ (ready)' : 'พร้อมรับ'}</td><td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{isEn ? 'Packed, photographed and waiting at the pickup spot' : 'จัดเสร็จ ถ่ายรูปแล้ว วางรอที่จุดรับของ'}</td></tr>
                <tr><td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">🚚 {isEn ? 'ออกงาน (out)' : 'ออกงาน'}</td><td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{isEn ? 'The on-site team has taken the items' : 'ทีมหน้างานรับของไปแล้ว'}</td></tr>
                <tr><td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">↩️ {isEn ? 'คืนแล้ว (returned)' : 'คืนแล้ว'}</td><td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{isEn ? 'Back at the pickup spot, waiting to be restocked' : 'ของกลับมาที่จุดรับของ รอคืนชั้น'}</td></tr>
                <tr><td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-200">🗄️ {isEn ? 'คืนชั้นแล้ว (restocked)' : 'คืนชั้นแล้ว'}</td><td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{isEn ? 'Everything is back on its shelf. Done.' : 'ของทุกชิ้นกลับขึ้นชั้นแล้ว จบ'}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ════ SETUP ════ */}
        <p className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 pt-2">
          {isEn ? 'First-time setup (admin / equipment keeper)' : 'ตั้งค่าครั้งแรก (แอดมิน/ผู้ดูแลอุปกรณ์)'}
        </p>

        {/* ── Setup: team ──────────────────────────────────────────── */}
        <div id="equip-setup-team" className="scroll-mt-6">
          <SectionHeader
            icon={<UserCog className="h-4 w-4" />}
            title={isEn ? 'Setup 1–3: the packing team and event closers' : 'ตั้งค่าขั้น 1–3: ทีมจัดของ และผู้ปิดงาน'}
            color="violet"
          />
          <div className="rounded-lg border border-violet-200/60 dark:border-violet-900/50 bg-white dark:bg-zinc-900 p-3 space-y-2 mb-3">
            <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
              {isEn ? 'All 7 setup steps' : 'ตั้งค่าทั้งหมด 7 ขั้น'}
            </p>
            <TimelineRow time="1" emoji="👥" textTh={'/users ตั้งแผนก "ทีมจัดของ" ให้คนในทีม'} textEn={'/users: put the team in the "ทีมจัดของ" department'} tagTh="ทีม" tagEn="team" isEn={isEn} />
            <TimelineRow time="2" emoji="🧩" textTh="/jobs/settings ตั้งทีมของพูลงาน" textEn="/jobs/settings: set the job pool team" tagTh="ทีม" tagEn="team" isEn={isEn} />
            <TimelineRow time="3" emoji="✅" textTh={'ตั้งค่า > อีเวนต์ ตั้ง "ผู้ปิดงาน"'} textEn={'Settings > Events: set the event closers'} tagTh="ปิดงาน" tagEn="close" isEn={isEn} />
            <TimelineRow time="4" emoji="🏷️" textTh="ตั้งค่าคลัง → ประเภทอุปกรณ์" textEn="Stock settings → equipment categories" tagTh="คลัง" tagEn="stock" isEn={isEn} />
            <TimelineRow time="5" emoji="📦" textTh="ใส่ประเภทให้อุปกรณ์และกระเป๋าทุกชิ้น" textEn="Give every item and kit bag a category" tagTh="คลัง" tagEn="stock" isEn={isEn} />
            <TimelineRow time="6" emoji="🎁" textTh="คลังอุปกรณ์ → แพ็กเกจ" textEn="Stock → packages" tagTh="แพ็กเกจ" tagEn="package" isEn={isEn} variant="highlight" />
            <TimelineRow time="7" emoji="📍" textTh="ตั้งค่าคลัง → จุดรับของ + พิมพ์ QR" textEn="Stock settings → pickup spots + print the QR" tagTh="QR" tagEn="QR" isEn={isEn} variant="success" />
          </div>
          <RoleCard
            role="admin"
            title={isEn ? 'Steps 1–3' : 'ขั้น 1–3'}
            steps={[
              { n: 1, label: isEn ? 'Open /users and set the department "ทีมจัดของ" (packing team) for everyone in the team.' : 'เปิด /users ตั้งแผนก "ทีมจัดของ" ให้คนในทีม', tag: null },
              { n: 2, label: isEn ? 'Open /jobs/settings, tab "job pool team": set "หน้าที่: จัดของ" (duty: packing) and "แผนกที่ดูแลอุปกรณ์" (department in charge of equipment) to the packing team.' : 'เปิด /jobs/settings แท็บทีมของพูลงาน ตั้ง "หน้าที่: จัดของ" และ "แผนกที่ดูแลอุปกรณ์" เป็นทีมจัดของ', tag: null },
              { n: 3, label: isEn ? 'Settings > Events: set the "ผู้ปิดงาน" (event closers) to include the people who return items, if you want the event to close by itself at return.' : 'ตั้งค่า > อีเวนต์ ตั้ง "ผู้ปิดงาน" ให้ครอบคนที่จะคืนของ ถ้าอยากให้อีเวนต์ปิดเองตอนคืน', tag: null },
            ]}
          />
        </div>

        {/* ── Setup: categories ────────────────────────────────────── */}
        <div id="equip-setup-categories" className="scroll-mt-6">
          <SectionHeader
            icon={<Tag className="h-4 w-4" />}
            title={isEn ? 'Setup 4–5: equipment categories' : 'ตั้งค่าขั้น 4–5: ประเภทอุปกรณ์'}
            color="violet"
          />
          <RoleCard
            role="admin"
            title={isEn ? 'Stock → Stock settings → Equipment categories' : 'คลังอุปกรณ์ → ตั้งค่าคลัง → ประเภทอุปกรณ์'}
            steps={[
              { n: 1, label: isEn ? 'Add, reorder or turn off categories. A category can be deleted only when no item uses it.' : 'เพิ่ม / เรียง / ปิดใช้ / ลบ ประเภท (ลบได้เมื่อไม่มีของอ้างถึง)', tag: null },
              { n: 2, label: isEn ? 'For booth categories tick "ทีมขายเลือกชิ้นเอง" (sales pick the unit) and type the build styles, one per line.' : 'ประเภทตู้ ให้ติ๊ก "ทีมขายเลือกชิ้นเอง" และใส่ "แบบประกอบ" (1 บรรทัดต่อแบบ)', tag: null },
              { n: 3, label: isEn ? 'The "เพิ่มอุปกรณ์" (add item) button on a category row opens the add-item form with that category already chosen.' : 'ปุ่ม "เพิ่มอุปกรณ์" ในแถวประเภท พาไปฟอร์มเพิ่มอุปกรณ์ที่เลือกประเภทไว้แล้ว', tag: null },
              { n: 4, label: isEn ? 'Every item and kit bag can get a category in the item form and in the kit edit box.' : 'อุปกรณ์และกระเป๋าทุกชิ้นเลือกประเภทได้ที่ฟอร์มอุปกรณ์ และกล่องแก้ไขกระเป๋า', tag: null },
            ]}
          />
          <div className="mt-3 rounded-lg border border-violet-200/60 dark:border-violet-900/50 bg-white dark:bg-zinc-900 p-3 space-y-2">
            <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wider">
              {isEn ? 'Example: a booth category' : 'ตัวอย่าง: ประเภทตู้'}
            </p>
            <TimelineRow time="1" emoji="🏷️" textTh={'ประเภท "ตู้ประกอบ" — ติ๊กทีมขายเลือกชิ้นเอง'} textEn={'Category "ตู้ประกอบ" — sales pick the unit'} tagTh="ติ๊ก" tagEn="ticked" isEn={isEn} />
            <TimelineRow time="2" emoji="🔧" textTh="แบบประกอบ: ประกอบ 1 / ประกอบ 2 / ประกอบ 3" textEn="Build styles: ประกอบ 1 / 2 / 3" tagTh="แบบ" tagEn="styles" isEn={isEn} />
            <TimelineRow time="3" emoji="📦" textTh={'อุปกรณ์ "ตู้ประกอบ ชุด 1", "ตู้ประกอบ ชุด 2"'} textEn={'Items "ตู้ประกอบ ชุด 1", "ตู้ประกอบ ชุด 2"'} tagTh="อุปกรณ์" tagEn="items" isEn={isEn} variant="success" />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="sky" icon={<Edit3 className="h-4 w-4" />} titleTh="เปลี่ยนชื่อประเภทได้" titleEn="Renaming a category" descTh="เปลี่ยนชื่อประเภทแล้ว ชื่อบนอุปกรณ์เปลี่ยนตามให้เอง" descEn="Rename a category and the name on its items changes too." isEn={isEn} />
            <TipCard tone="emerald" icon={<Filter className="h-4 w-4" />} titleTh="กรองตามประเภท" titleEn="Filter by category" descTh="หน้ารายการอุปกรณ์กรองตามประเภทได้" descEn="The item list can be filtered by category." isEn={isEn} />
          </div>
        </div>

        {/* ── Setup: packages ──────────────────────────────────────── */}
        <div id="equip-setup-packages" className="scroll-mt-6">
          <SectionHeader
            icon={<Boxes className="h-4 w-4" />}
            title={isEn ? 'Setup 6: packages' : 'ตั้งค่าขั้น 6: แพ็กเกจ'}
            color="violet"
          />
          <RoleCard
            role="admin"
            title={isEn ? 'Stock → Packages' : 'คลังอุปกรณ์ → แพ็กเกจ'}
            steps={[
              { n: 1, label: isEn ? 'Add a package: name, details, price (used to fill the quoted price in CRM) and active.' : 'เพิ่มแพ็กเกจ: ชื่อ รายละเอียด ราคา (ใช้เติมราคาเสนอใน CRM) เปิดใช้', tag: null },
              { n: 2, label: isEn ? 'On the edit page add requirements = category × quantity per set.' : 'ในหน้าแก้ เพิ่มข้อกำหนด = ประเภท × จำนวนต่อชุด', tag: null },
              { n: 3, label: isEn ? 'For each requirement press "ตัวเลือก" (options) and tick the items that may be used. Nothing ticked = every item of the category.' : 'ต่อข้อกำหนด กด "ตัวเลือก" ติ๊กชิ้นที่ใช้ได้ (ไม่ติ๊ก = ทุกชิ้นในประเภท)', tag: null },
              { n: 4, label: isEn ? 'Items that live inside a kit bag cannot be chosen alone — choose the whole bag instead.' : 'ของที่อยู่ในกระเป๋าเลือกเดี่ยวไม่ได้ ให้เลือกกระเป๋าทั้งใบแทน', tag: null },
              { n: 5, label: isEn ? 'Press "บันทึกข้อกำหนด" (save requirements).' : 'กด "บันทึกข้อกำหนด"', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="sky" icon={<Repeat className="h-4 w-4" />} titleTh="คัดลอก / เรียง / ปิดใช้" titleEn="Copy / reorder / turn off" descTh="คัดลอกแพ็กเกจ เรียงลำดับ และปิดใช้ได้ ลบได้เมื่อไม่มีงานใช้" descEn="Packages can be copied, reordered and turned off. Delete only when no job uses it." isEn={isEn} />
            <TipCard tone="amber" icon={<AlertCircle className="h-4 w-4" />} titleTh="ที่เดียวที่ตั้งแพ็กเกจ" titleEn="The only place for packages" descTh="รายการแพ็กเกจเดิมในตั้งค่า CRM ถูกย้ายมาที่นี่ที่เดียวแล้ว" descEn="The old package list in the CRM settings has moved here." isEn={isEn} />
          </div>
        </div>

        {/* ── Setup: pickup spots ──────────────────────────────────── */}
        <div id="equip-setup-spots" className="scroll-mt-6">
          <SectionHeader
            icon={<QrCode className="h-4 w-4" />}
            title={isEn ? 'Setup 7: pickup spots and their QR' : 'ตั้งค่าขั้น 7: จุดรับของ และ QR'}
            color="violet"
          />
          <RoleCard
            role="admin"
            title={isEn ? 'Stock settings → Pickup spots' : 'ตั้งค่าคลัง → จุดรับของ'}
            steps={[
              { n: 1, label: isEn ? 'Add a spot: name and code (and a note if you like).' : 'เพิ่มจุด: ชื่อ + รหัส (+หมายเหตุ)', tag: null },
              { n: 2, label: isEn ? 'Press "พิมพ์ QR จุดรับของ" (print pickup-spot QR) — one A4 sheet.' : 'กด "พิมพ์ QR จุดรับของ" (แผ่น A4)', tag: null },
              { n: 3, label: isEn ? 'Stick it at the spot.' : 'ติดไว้ที่จุดนั้น', tag: null },
              { n: 4, label: isEn ? 'Scanning it opens the spot page: you see the lists placed there and can take or return items.' : 'สแกนแล้วเปิดหน้าจุด: เห็นใบที่วางอยู่ รับของ / คืนของได้', tag: null },
            ]}
          />
        </div>

        {/* ════ SALES ════ */}
        <p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 pt-2">
          {isEn ? 'Sales' : 'ทีมขาย'}
        </p>

        {/* ── Sales: pick a package ────────────────────────────────── */}
        <div id="equip-sales-pick" className="scroll-mt-6">
          <SectionHeader
            icon={<Package className="h-4 w-4" />}
            title={isEn ? 'Pick packages for a job' : 'เลือกแพ็กเกจให้งาน'}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FeatureBlock
              titleTh="1. กล่องเพิ่มลูกค้า"
              titleEn="1. Add-customer box"
              lines={isEn
                ? ['Pick the first package (1 set)', 'Fills the quoted price if it is empty']
                : ['เลือกแพ็กเกจแรก 1 ชุด', 'เติมราคาเสนอให้ถ้ายังว่าง']}
            />
            <FeatureBlock
              titleTh="2. การ์ดลูกค้าในหน้า lead"
              titleEn="2. Customer card on the lead page"
              lines={isEn
                ? ['Press "แก้แพ็กเกจ" (edit packages)', 'Pick several packages + the number of sets']
                : ['กดปุ่ม "แก้แพ็กเกจ"', 'เลือกได้หลายแพ็กเกจ + จำนวนชุด']}
            />
            <FeatureBlock
              titleTh="3. หน้าติดตามงาน"
              titleEn="3. Job tracking page"
              lines={isEn
                ? ['The "แพ็กเกจ" (packages) column']
                : ['คอลัมน์ "แพ็กเกจ"']}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="violet" icon={<Lock className="h-4 w-4" />} titleTh="ใครแก้แพ็กเกจได้" titleEn="Who can change packages" descTh="ผู้สร้างการ์ด แอดมิน และฝ่ายประสานงาน" descEn="Whoever created the card, admins and the coordination team." isEn={isEn} />
            <TipCard tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} titleTh="เติมระบบที่ใช้บริการให้เอง" titleEn="Service field filled for you" descTh={'ชื่อแพ็กเกจของงานขึ้นในช่อง "ระบบที่ใช้บริการ" ให้เอง'} descEn={'The package names appear in the "ระบบที่ใช้บริการ" (services) field automatically.'} isEn={isEn} />
          </div>
        </div>

        {/* ── Sales: booth ─────────────────────────────────────────── */}
        <div id="equip-sales-booth" className="scroll-mt-6">
          <SectionHeader
            icon={<Building2 className="h-4 w-4" />}
            title={isEn ? 'Booth set and build style' : 'เลือกชุดตู้ และแบบประกอบ'}
          />
          <RoleCard
            role="user"
            title={isEn ? 'When the package has a booth category' : 'เมื่อแพ็กเกจมีประเภทตู้'}
            steps={[
              { n: 1, label: isEn ? 'Choose the "ชุดตู้" (booth set). Labels: ว่าง (free) / ต่อคิว (back-to-back) / ชน (clash) / ไม่พร้อม (not available). If only one set is free it is chosen for you.' : 'ต้องเลือก "ชุดตู้" ป้ายบอก ว่าง / ต่อคิว / ชน / ไม่พร้อม (ถ้ามีชุดว่างชุดเดียว ระบบเลือกให้เอง)', tag: null },
              { n: 2, label: isEn ? 'Choose the build style if you like. Optional, and can be changed later until the items are taken.' : 'เลือกแบบประกอบได้ (ไม่บังคับ แก้ทีหลังได้จนก่อนรับของ)', tag: null },
              { n: 3, label: isEn ? 'A set that clashes with another job at the same time can still be chosen, after a confirmation.' : 'ชุดที่ชนกับงานอื่นเวลาทับกัน เลือกได้แต่จะถามยืนยันก่อน', tag: null },
            ]}
          />
          <div className="mt-3">
            <TipCard tone="amber" icon={<Lock className="h-4 w-4" />} titleTh="ตู้ที่ขายแล้วถูกล็อก" titleEn="A sold booth is locked" descTh="ในใบจัดของ ทีมจัดของเปลี่ยนตู้ที่ทีมขายเลือกไม่ได้ ถ้าตู้เสีย ทีมจัดของจะแจ้งให้ทีมขายเปลี่ยน" descEn="The packing team cannot change the booth that sales chose. If it breaks, the packing team asks sales to change it." isEn={isEn} />
          </div>
        </div>

        {/* ── Sales: warning ───────────────────────────────────────── */}
        <div id="equip-sales-warning" className="scroll-mt-6">
          <SectionHeader
            icon={<AlertTriangle className="h-4 w-4" />}
            title={isEn ? '"Equipment may run short" warnings' : 'คำเตือน "อุปกรณ์อาจไม่พอ"'}
            color="amber"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="amber" icon={<AlertTriangle className="h-4 w-4" />} titleTh="เหลือง — อุปกรณ์อาจไม่พอ" titleEn="Yellow — may run short" descTh="รวมงานอื่นที่ยังไม่ได้เลือกของแล้ว อุปกรณ์อาจไม่พอ" descEn="Counting other jobs whose items are not chosen yet, there may not be enough." isEn={isEn} />
            <div className="rounded-lg border p-3 border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 text-red-700 dark:text-red-400">
              <div className="flex items-center gap-1.5 mb-1.5">
                <XCircle className="h-4 w-4 shrink-0" />
                <p className="text-xs font-bold">{isEn ? 'Red — not enough' : 'แดง — ไม่พอ'}</p>
              </div>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {isEn
                  ? 'Items already chosen for sure are not enough, or the same booth set is sold to another job on the same day.'
                  : 'ของที่ถูกเลือกแน่นอนแล้วไม่พอ หรือตู้ชุดเดียวกันถูกขายให้งานอื่นวันเดียวกัน'}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <FeatureBlock
              titleTh="ขึ้นที่ไหนบ้าง"
              titleEn="Where it shows"
              lines={isEn
                ? [
                    'Right under the package picker',
                    'On the job row and on the customer card',
                    'The panel "แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ" on the home page and the job tracking page (jobs in the next 30 days)',
                  ]
                : [
                    'ใต้ช่องเลือกแพ็กเกจทันที',
                    'บนแถวงาน และการ์ดลูกค้า',
                    'แผง "แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ" บนหน้าแรกและหน้าติดตามงาน (งานใน 30 วัน)',
                  ]}
            />
          </div>
          <div className="mt-3">
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="เป็นคำเตือน ไม่ห้ามขาย" titleEn="A warning, not a block" descTh="ขายต่อได้ เพราะของจริงทีมจัดของเป็นคนเลือก ตั้งแต่งานมีใบจัดของแล้ว ระบบนับจากของในใบจริง" descEn="You can still sell, because the packing team chooses the real items. Once a job has a packing list, the count uses the items on the list." isEn={isEn} />
          </div>
        </div>

        {/* ════ PACKING TEAM ════ */}
        <p className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400 pt-2">
          {isEn ? 'Packing team' : 'ทีมจัดของ'}
        </p>

        {/* ── Pack: queue ──────────────────────────────────────────── */}
        <div id="equip-pack-queue" className="scroll-mt-6">
          <SectionHeader
            icon={<ClipboardList className="h-4 w-4" />}
            title={isEn ? 'The packing queue — /packing' : 'คิวใบจัดของ — /packing'}
            color="violet"
          />
          <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
            {isEn ? 'Menu Stock → Packing lists. The queue has 5 groups:' : 'เมนู คลังอุปกรณ์ → ใบจัดของ แบ่งเป็น 5 กลุ่ม'}
          </p>
          <div className="rounded-lg border border-violet-200/60 dark:border-violet-900/50 bg-white dark:bg-zinc-900 p-3 space-y-2">
            <TimelineRow time="1" emoji="🕒" textTh="รอเปิดใบ — งานที่มีแพ็กเกจแต่ยังไม่มีใบ" textEn="Waiting — jobs with a package but no list yet" tagTh="รอเปิดใบ" tagEn="waiting" isEn={isEn} />
            <TimelineRow time="2" emoji="🧺" textTh="กำลังทำ — ใบที่กำลังเลือกของหรือหยิบ" textEn="In progress — lists being selected or picked" tagTh="กำลังทำ" tagEn="in progress" isEn={isEn} />
            <TimelineRow time="3" emoji="📦" textTh="พร้อมรับ — วางรอที่จุดรับของ" textEn="Ready — waiting at the pickup spot" tagTh="พร้อมรับ" tagEn="ready" isEn={isEn} variant="success" />
            <TimelineRow time="4" emoji="🚚" textTh="ออกงาน — ทีมหน้างานรับไปแล้ว" textEn="Out — taken by the on-site team" tagTh="ออกงาน" tagEn="out" isEn={isEn} />
            <TimelineRow time="5" emoji="🗄️" textTh="รอคืนชั้น — คืนแล้ว รอเก็บขึ้นชั้น" textEn="To restock — returned, waiting for the shelves" tagTh="รอคืนชั้น" tagEn="restock" isEn={isEn} variant="highlight" />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="violet" icon={<ClipboardList className="h-4 w-4" />} titleTh="เปิดใบได้ 2 ที่" titleEn="Two ways to open a list" descTh={'จากคิว หรือจากช่อง "จัดของ" ในหน้าติดตามงาน (ปุ่ม "เปิดใบจัดของ" สำหรับงานที่มีแพ็กเกจ งานที่ยังไม่มีแพ็กเกจจะบอกให้ทีมขายเลือกก่อน)'} descEn={'From the queue, or from the "จัดของ" box on the job tracking page (button "เปิดใบจัดของ" for jobs with a package; jobs without one ask sales to pick it first).'} isEn={isEn} />
            <TipCard tone="sky" icon={<Bell className="h-4 w-4" />} titleTh={'แจ้งเตือน "งานรอจัดของ"'} titleEn={'"Job waiting to be packed" notification'} descTh="ทีมจัดของได้แจ้งเตือนเมื่องานตอบรับแล้วและมีแพ็กเกจ" descEn="The packing team is notified when a job is accepted and has a package." isEn={isEn} />
          </div>
        </div>

        {/* ── Pack: select ─────────────────────────────────────────── */}
        <div id="equip-pack-select" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Step 1: select the items' : 'ขั้นเลือกของ'}
            color="violet"
          />
          <RoleCard
            role="user"
            title={isEn ? 'Fill every requirement' : 'เลือกให้ครบทุกข้อกำหนด'}
            steps={[
              { n: 1, label: isEn ? 'The list is laid out from the package × number of sets.' : 'โครงใบมาจากแพ็กเกจ × จำนวนชุด', tag: null },
              { n: 2, label: isEn ? 'For each category choose an item slot by slot. Labels: ว่าง (free) / ต่อคิว (back-to-back) / ชน (clash) / ไม่พร้อม (not available) / ออกงานอยู่ (out at another job).' : 'ต่อประเภท เลือกชิ้นทีละช่อง ป้ายบอก ว่าง / ต่อคิว / ชน / ไม่พร้อม / ออกงานอยู่', tag: null },
              { n: 3, label: isEn ? 'The booth chosen by sales is already there with its build style (locked).' : 'ตู้ที่ทีมขายเลือกขึ้นให้พร้อมแบบประกอบ (ล็อก)', tag: null },
              { n: 4, label: isEn ? 'Add "ของเสริม" (extras): any unit outside the package.' : 'เติม "ของเสริม" ได้ เป็นหน่วยใดก็ได้นอกแพ็กเกจ', tag: null },
              { n: 5, label: isEn ? 'Press "บันทึกรายการ" (save) to keep a draft, or "สร้างใบจัดของ" (create) once every requirement is filled.' : 'กด "บันทึกรายการ" เก็บไว้ก่อน หรือ "สร้างใบจัดของ" (ต้องเลือกครบทุกข้อกำหนด)', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <TipCard tone="amber" icon={<AlertTriangle className="h-4 w-4" />} titleTh="ชน = ถามยืนยัน" titleEn="Clash = asks first" descTh="ชิ้นที่ชนกับงานอื่นเลือกได้ แต่ระบบถามยืนยันก่อน" descEn="An item that clashes with another job can be chosen after a confirmation." isEn={isEn} />
            <TipCard tone="sky" icon={<Truck className="h-4 w-4" />} titleTh="ออกงานอยู่ = จองล่วงหน้า" titleEn="Out = book ahead" descTh="เลือกไว้ล่วงหน้าได้ แต่หยิบได้เมื่อชิ้นนั้นคืนชั้นแล้ว" descEn="You can choose it ahead, but you can pick it only after it is back on the shelf." isEn={isEn} />
            <TipCard tone="violet" icon={<Ban className="h-4 w-4" />} titleTh="ยกเลิกใบ" titleEn="Cancel the list" descTh={'กด "ยกเลิกใบ" ได้ก่อนใบเป็นพร้อมรับ'} descEn="The list can be cancelled before it is ready." isEn={isEn} />
          </div>
        </div>

        {/* ── Pack: pick ───────────────────────────────────────────── */}
        <div id="equip-pack-pick" className="scroll-mt-6">
          <SectionHeader
            icon={<Warehouse className="h-4 w-4" />}
            title={isEn ? 'Step 2: pick from the shelves' : 'ขั้นกำลังหยิบ'}
            color="violet"
          />
          <RoleCard
            role="user"
            title={isEn ? 'Walk the route and tick each item' : 'เดินตามเส้นทาง แล้วกดทีละชิ้น'}
            steps={[
              { n: 1, label: isEn ? 'The list is sorted as a walking route: room › cabinet › shelf.' : 'รายการเรียงเป็นเส้นทางเดิน ห้อง › ตู้ › ชั้น', tag: null },
              { n: 2, label: isEn ? 'Press "หยิบแล้ว" (picked) item by item. The item becomes "ออกงาน" (out) right away; a kit bag takes out every usable item inside.' : 'กด "หยิบแล้ว" ทีละชิ้น ของเป็น "ออกงาน" ทันที (กระเป๋า = นำออกทุกชิ้นที่ใช้ได้)', tag: null },
              { n: 3, label: isEn ? 'Pressed by mistake? Use "ยกเลิกหยิบ" (undo pick).' : 'กดผิด กด "ยกเลิกหยิบ" ได้', tag: null },
              { n: 4, label: isEn ? 'Cannot pick an item (broken or out at another job)? Press "เปลี่ยนของ" (swap) and choose another allowed item.' : 'ชิ้นที่หยิบไม่ได้ (เสีย / ออกงานอยู่) กด "เปลี่ยนของ" เลือกชิ้นอื่นในตัวเลือก', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="emerald" icon={<Printer className="h-4 w-4" />} titleTh="พิมพ์ใบจัดของ" titleEn="Print the packing list" descTh={'กด "พิมพ์ใบจัดของ" ได้แผ่น A4 มี QR สแกนกลับมาหน้าใบ'} descEn="Print it on A4. Its QR brings you back to the list." isEn={isEn} />
            <TipCard tone="sky" icon={<RefreshCw className="h-4 w-4" />} titleTh="ถอยกลับไปเลือกของ" titleEn="Back to selecting" descTh="ถ้ายังไม่ได้หยิบอะไร ถอยกลับไปขั้นเลือกของได้" descEn="If nothing is picked yet, you can go back to selecting." isEn={isEn} />
          </div>
        </div>

        {/* ── Pack: confirm ────────────────────────────────────────── */}
        <div id="equip-pack-confirm" className="scroll-mt-6">
          <SectionHeader
            icon={<PackageCheck className="h-4 w-4" />}
            title={isEn ? 'Step 3: confirm packing' : 'ยืนยันจัดของ'}
            color="violet"
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Needed' : 'ต้องมี'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'What to do' : 'ทำอย่างไร'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Done when' : 'ผ่านเมื่อ'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-xs">
                <ChecklistRow emoji="🧺" label={isEn ? 'All picked' : 'หยิบครบ'} required={isEn ? 'Press "หยิบแล้ว" on every line' : 'กด "หยิบแล้ว" ครบทุกรายการ'} passes={isEn ? 'No line left' : 'ไม่เหลือรายการค้าง'} />
                <ChecklistRow emoji="📸" label={isEn ? 'Photo' : 'รูป'} required={isEn ? 'Photo of the packed set (from the gallery is fine)' : 'ถ่ายรูปชุดที่จัดเสร็จ (เลือกจากคลังรูปได้)'} passes={isEn ? 'At least 1 photo' : 'อย่างน้อย 1 รูป'} />
                <ChecklistRow emoji="📍" label={isEn ? 'Pickup spot' : 'จุดรับของ'} required={isEn ? 'Choose where you place the set' : 'เลือกจุดที่วางของ'} passes={isEn ? 'A spot is chosen' : 'เลือกจุดแล้ว'} />
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <FlowchartBox title={isEn ? 'Press "ยืนยันจัดของ" (confirm packing)' : 'กด "ยืนยันจัดของ"'} color="purple">
              <FlowNode variant="admin" emoji="📦" title={isEn ? 'The list becomes "พร้อมรับ" (ready)' : 'ใบเป็น "พร้อมรับ"'} />
              <FlowArrow />
              <FlowNode variant="user" emoji="🔔" title={isEn ? 'The team lead and the event team are notified' : 'แจ้งเตือนหัวหน้างานและทีมในอีเวนต์'} />
              <FlowArrow />
              <FlowNode variant="success" emoji="✅" title={isEn ? 'The job passes the "จัดของ" (packing) item' : 'งานผ่านข้อ "จัดของ"'} />
            </FlowchartBox>
          </div>
          <div className="mt-3">
            <TipCard tone="sky" icon={<Edit3 className="h-4 w-4" />} titleTh={'ยังแก้ได้ด้วยปุ่ม "แก้ไข"'} titleEn="Still editable" descTh={'ก่อนมีคนรับของ กด "แก้ไข" ใบจะถอยกลับเป็นกำลังหยิบ'} descEn="Before anyone takes the items, press แก้ไข (edit) to go back to picking." isEn={isEn} />
          </div>
        </div>

        {/* ── Pack: restock ────────────────────────────────────────── */}
        <div id="equip-pack-restock" className="scroll-mt-6">
          <SectionHeader
            icon={<ArchiveRestore className="h-4 w-4" />}
            title={isEn ? 'Restock: put everything back' : 'คืนชั้น'}
            color="violet"
          />
          <RoleCard
            role="user"
            title={isEn ? 'After the items come back' : 'หลังของกลับมาแล้ว'}
            steps={[
              { n: 1, label: isEn ? 'You get the "คืนของแล้ว" (items returned) notification.' : 'ได้แจ้งเตือน "คืนของแล้ว"', tag: null },
              { n: 2, label: isEn ? 'Open the list from the "รอคืนชั้น" (to restock) group.' : 'เปิดใบจากกลุ่ม "รอคืนชั้น"', tag: null },
              { n: 3, label: isEn ? 'Lines are sorted by home shelf and show the condition at return.' : 'รายการเรียงตามชั้นบ้านของแต่ละชิ้น มีป้ายสภาพตอนคืน', tag: null },
              { n: 4, label: isEn ? 'Press "คืนชั้นแล้ว" (restocked) line by line, or "คืนชั้นทั้งหมด" (restock all).' : 'กด "คืนชั้นแล้ว" ทีละรายการ หรือ "คืนชั้นทั้งหมด"', tag: null },
              { n: 5, label: isEn ? 'Usable items go back to "พร้อมใช้" (available). When every line is done the list is "คืนชั้นแล้ว" — finished.' : 'ของที่ใช้ได้กลับเป็นพร้อมใช้ ครบทุกรายการ = ใบเป็นคืนชั้นแล้ว จบ', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="amber" icon={<Hammer className="h-4 w-4" />} titleTh="ของเสีย / ซ่อม / หาย" titleEn="Broken / repair / lost" descTh="มีกล่องสรุปให้เห็น ของพวกนี้ถูกตั้งสถานะไปแล้วตั้งแต่ตอนคืนของ" descEn="A summary box lists them. Their status was already set when they were returned." isEn={isEn} />
            <TipCard tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} titleTh="ไม่ต้องรอปิดงาน" titleEn="No need to wait for closing" descTh="คืนชั้นได้แม้อีเวนต์ยังไม่ปิด" descEn="You can restock even if the event is not closed yet." isEn={isEn} />
          </div>
        </div>

        {/* ════ ON-SITE / CLOSING ════ */}
        <p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400 pt-2">
          {isEn ? 'On-site team / event closers' : 'ทีมหน้างาน / ผู้ปิดงาน'}
        </p>

        {/* ── Site: handover ───────────────────────────────────────── */}
        <div id="equip-site-handover" className="scroll-mt-6">
          <SectionHeader
            icon={<ScanLine className="h-4 w-4" />}
            title={isEn ? 'Take the items (pickup)' : 'รับของ'}
          />
          <RoleCard
            role="user"
            title={isEn ? 'At the office, before you leave' : 'ที่ออฟฟิศ ก่อนออกงาน'}
            steps={[
              { n: 1, label: isEn ? 'Scan the QR at the pickup spot.' : 'สแกน QR จุดรับของ', tag: null },
              { n: 2, label: isEn ? 'Open the "พร้อมรับ" (ready) list of your job.' : 'เปิดใบ "พร้อมรับ" ของงาน', tag: null },
              { n: 3, label: isEn ? 'Tick every item while loading the car (or press "ครบทุกชิ้น" — all items).' : 'ติ๊กทุกชิ้นขณะขึ้นรถ (หรือกด "ครบทุกชิ้น")', tag: null },
              { n: 4, label: isEn ? 'Press "ยืนยันรับของ" (confirm pickup).' : 'กด "ยืนยันรับของ"', tag: null },
              { n: 5, label: isEn ? 'The list is now "ออกงาน" (out). The on-site job on the event-day board becomes "ขนของ" (loading) by itself.' : 'ใบเป็นออกงาน ใบงานหน้างานบนบอร์ดวันงานเป็น "ขนของ" เอง', tag: null },
            ]}
          />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="sky" icon={<MapPin className="h-4 w-4" />} titleTh="เช็คอินหน้างานตามเดิม" titleEn="Check in on-site as usual" descTh={'เช็คอินแล้วใบงานเลื่อนเป็น "ออกหน้างาน"'} descEn={'Checking in moves the job to "ออกหน้างาน" (on-site).'} isEn={isEn} />
            <TipCard tone="emerald" icon={<QrCode className="h-4 w-4" />} titleTh="QR กระเป๋ายังใช้ได้" titleEn="Kit QR codes still work" descTh="QR กระเป๋ายังใช้นำออก / รับคืนรายชิ้นหน้างานได้" descEn="Kit QR codes still check single items out and in on site." isEn={isEn} />
          </div>
        </div>

        {/* ── Site: return ─────────────────────────────────────────── */}
        <div id="equip-site-return" className="scroll-mt-6">
          <SectionHeader
            icon={<ArrowDownToLine className="h-4 w-4" />}
            title={isEn ? 'Return the items' : 'คืนของ'}
          />
          <RoleCard
            role="user"
            title={isEn ? 'Back at the office' : 'กลับถึงออฟฟิศ'}
            steps={[
              { n: 1, label: isEn ? 'Put the items at the same spot and scan its QR.' : 'วางของที่จุดเดิม แล้วสแกน QR', tag: null },
              { n: 2, label: isEn ? 'Open the "ออกงาน" (out) list.' : 'เปิดใบ "ออกงาน"', tag: null },
              { n: 3, label: isEn ? 'Set the condition of every line: ใช้ได้ (OK) / เสียหาย (damaged) / ซ่อม (repair) / หาย (lost). "ใช้ได้ทั้งหมด" sets all to OK.' : 'เลือกสภาพทุกรายการ ใช้ได้ / เสียหาย / ซ่อม / หาย (มีปุ่ม "ใช้ได้ทั้งหมด")', tag: null },
              { n: 4, label: isEn ? 'Open a kit bag to set each item inside.' : 'กระเป๋า กดขยายเพื่อระบุรายชิ้น', tag: null },
              { n: 5, label: isEn ? 'Fill in the consumables used. Photos and a note are optional.' : 'กรอกวัสดุสิ้นเปลืองที่ใช้ไป ถ่ายรูป / หมายเหตุ (ไม่บังคับ)', tag: null },
              { n: 6, label: isEn ? 'Press "ยืนยันคืนของ" (confirm return). If something is not OK you are asked to confirm.' : 'กด "ยืนยันคืนของ" (ถ้ามีของสภาพไม่ปกติ ระบบจะถามยืนยัน)', tag: null },
            ]}
          />
          <div className="mt-3">
            <TipCard tone="amber" icon={<Zap className="h-4 w-4" />} titleTh="มีผลทันที" titleEn="Takes effect right away" descTh="ของเสีย / ซ่อม / หาย ถูกตั้งสถานะทันที และวัสดุสิ้นเปลืองถูกตัดยอดทันที" descEn="Broken / repair / lost items get their status at once, and consumables are deducted at once." isEn={isEn} />
          </div>
        </div>

        {/* ── Close ────────────────────────────────────────────────── */}
        <div id="equip-close" className="scroll-mt-6">
          <SectionHeader
            icon={<Lock className="h-4 w-4" />}
            title={isEn ? 'Closing the event' : 'ปิดอีเวนต์'}
          />
          <FlowchartBox title={isEn ? 'After "ยืนยันคืนของ"' : 'หลังกด "ยืนยันคืนของ"'} color="sky">
            <FlowNode variant="decision" emoji="❓" title={isEn ? 'Is the person returning an event closer?' : 'คนคืนของมีสิทธิ์ปิดงานไหม?'} />
            <FlowArrow label={isEn ? 'yes' : 'มี'} />
            <FlowNode variant="success" emoji="🔒" title={isEn ? 'The event closes right away' : 'อีเวนต์ปิดให้ทันที'} subtitle={isEn ? 'the on-site job is finished' : 'ใบงานหน้างานจบ'} />
            <FlowArrow label={isEn ? 'no' : 'ไม่มี'} />
            <FlowNode variant="admin" emoji="✅" title={isEn ? 'An event closer opens the close page of the event' : 'ผู้ปิดงานเปิดหน้าปิดงานของอีเวนต์'} subtitle={isEn ? 'sees the summary from the list, presses "ปิดงาน" — no ticking again' : 'เห็นสรุปจากใบ กด "ปิดงาน" ได้เลย ไม่ต้องติ๊กซ้ำ'} />
          </FlowchartBox>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="amber" icon={<Ban className="h-4 w-4" />} titleTh="ยังไม่คืนของ = ปิดแบบเดิมไม่ได้" titleEn="Not returned = cannot close the old way" descTh="อีเวนต์ที่ยังไม่คืนของปิดแบบเดิมไม่ได้ หน้าปิดงานมีลิงก์ไปที่ใบจัดของ" descEn="An event whose items are not returned cannot be closed the old way. The close page links to the list." isEn={isEn} />
            <TipCard tone="sky" icon={<History className="h-4 w-4" />} titleTh="งานเก่าที่ไม่มีใบจัดของ" titleEn="Old events without a list" descTh="งานเก่าที่จองกระเป๋าแบบเดิม ใช้หน้าปิดงานเดิมเหมือนเดิม" descEn="Old events that booked kits the old way close on the old close page as before." isEn={isEn} />
          </div>
        </div>

        {/* ════ FOLLOW-UP ════ */}
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 pt-2">
          {isEn ? 'Follow-up' : 'ติดตามผล'}
        </p>

        {/* ── Readiness ────────────────────────────────────────────── */}
        <div id="equip-readiness" className="scroll-mt-6">
          <SectionHeader
            icon={<Gauge className="h-4 w-4" />}
            title={isEn ? 'Job tracking: the "จัดของ" item' : 'หน้าติดตามงาน: ข้อ "จัดของ"'}
            color="emerald"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FeatureBlock
              titleTh="ผ่านเมื่อไร"
              titleEn="When it passes"
              lines={isEn
                ? [
                    'Every event of the job that is not closed has a list at "พร้อมรับ" (ready) or later',
                    'Old jobs that booked kits the old way pass when the kits are fully packed',
                    '"ไม่ต้องจัด" (no packing needed) can still be set',
                  ]
                : [
                    'ทุกอีเวนต์ที่ยังไม่ปิดของงานมีใบถึง "พร้อมรับ" ขึ้นไป',
                    'งานเก่าที่จองกระเป๋าแบบเดิม จัดครบก็ผ่าน',
                    'ยังตั้ง "ไม่ต้องจัด" ได้',
                  ]}
            />
            <FeatureBlock
              titleTh={'ช่อง "จัดของ"'}
              titleEn={'The "จัดของ" box'}
              lines={isEn
                ? ['Shows the list state', 'Shows "หยิบแล้ว x/y" (picked x of y)']
                : ['แสดงสถานะใบ', 'แสดง "หยิบแล้ว x/y"']}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <TipCard tone="sky" icon={<Bell className="h-4 w-4" />} titleTh="งานรอจัดของ" titleEn="Job waiting to be packed" descTh="ส่งถึงทีมจัดของ" descEn="Goes to the packing team." isEn={isEn} />
            <TipCard tone="emerald" icon={<Bell className="h-4 w-4" />} titleTh="ของพร้อมรับ" titleEn="Items ready for pickup" descTh="ส่งถึงหัวหน้างาน และทีมในอีเวนต์" descEn="Goes to the team lead and the event team." isEn={isEn} />
            <TipCard tone="violet" icon={<Bell className="h-4 w-4" />} titleTh="คืนของแล้ว" titleEn="Items returned" descTh="ส่งถึงทีมจัดของ" descEn="Goes to the packing team." isEn={isEn} />
          </div>
        </div>

        {/* ── Usage ────────────────────────────────────────────────── */}
        <div id="equip-usage" className="scroll-mt-6">
          <SectionHeader
            icon={<BarChart3 className="h-4 w-4" />}
            title={isEn ? 'Usage page — /stock/usage' : 'หน้าการใช้งาน — /stock/usage'}
            color="emerald"
          />
          <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
            {isEn
              ? 'Menu Stock → Usage. Period chips: ภาพรวม (all time) / เดือนนี้ (this month) / 3 เดือน (3 months) / ปีนี้ (this year).'
              : 'เมนู คลังอุปกรณ์ → การใช้งาน มีชิปช่วงเวลา ภาพรวม / เดือนนี้ / 3 เดือน / ปีนี้'}
          </p>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <NewItem icon={<TrendingUp className="h-3.5 w-3.5" />} titleTh="ชิ้นที่ใช้บ่อย" titleEn="Most used items" descTh="จำนวนครั้ง ชั่วโมง ใช้ล่าสุด ค้นหาได้" descEn="Times used, hours, last used. Searchable." isEn={isEn} />
            <NewItem icon={<Tag className="h-3.5 w-3.5" />} titleTh="ตามประเภท" titleEn="By category" descTh="รวมชิ้นที่ไม่ได้ใช้ด้วย" descEn="Includes items that were never used." isEn={isEn} />
            <NewItem icon={<Boxes className="h-3.5 w-3.5" />} titleTh="ตามแพ็กเกจ" titleEn="By package" descTh="ขายไปกี่ชุด มีใบจัดของกี่งาน" descEn="How many sets were sold, how many jobs have a list." isEn={isEn} />
            <NewItem icon={<Building2 className="h-3.5 w-3.5" />} titleTh="ตู้และแบบประกอบ" titleEn="Booths and build styles" descTh="ตู้แต่ละชุดใช้แบบไหนบ่อย" descEn="Which style each booth set is used with." isEn={isEn} />
            <NewItem icon={<Activity className="h-3.5 w-3.5" />} titleTh="ตอนนี้" titleEn="Right now" descTh="พร้อมรับ / ออกงาน / รอคืนชั้น" descEn="Ready / out / to restock." isEn={isEn} />
            <NewItem icon={<CalendarDays className="h-3.5 w-3.5" />} titleTh="กราฟชั่วโมงรายเดือน และคน" titleEn="Monthly hours chart and people" descTh="ชั่วโมงใช้งานแต่ละเดือน และใครจัด / รับ / คืนของ" descEn="Hours of use per month, and who packed, took and returned items." isEn={isEn} />
          </ul>
          <div className="mt-3">
            <TipCard tone="sky" icon={<Clock className="h-4 w-4" />} titleTh="ชั่วโมงใช้งานคิดอย่างไร" titleEn="How hours are counted" descTh="นับจากตอนรับของถึงตอนคืนของ ถ้าไม่มีเวลาให้ใช้ช่วงเวลาของอีเวนต์แทน" descEn="From pickup to return. If those times are missing, the event time is used." isEn={isEn} />
          </div>
        </div>

        {/* ── Trophies ─────────────────────────────────────────────── */}
        <div id="equip-trophies" className="scroll-mt-6">
          <SectionHeader
            icon={<Trophy className="h-4 w-4" />}
            title={isEn ? 'Trophies' : 'ถ้วยรางวัล'}
            color="amber"
          />
          <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
            {isEn ? 'Shown on the home page and in /reports.' : 'แสดงบนหน้าแรก และหน้า /reports'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TipCard tone="amber" icon={<Trophy className="h-4 w-4" />} titleTh="นักจัดของ" titleEn="Top packer" descTh="ยืนยันจัดของมากที่สุด" descEn="Confirmed the most packing lists." isEn={isEn} />
            <TipCard tone="emerald" icon={<Trophy className="h-4 w-4" />} titleTh="นักคืนของ" titleEn="Top restocker" descTh="คืนชั้นครบมากที่สุด" descEn="Fully restocked the most lists." isEn={isEn} />
            <TipCard tone="violet" icon={<Award className="h-4 w-4" />} titleTh="รับหน้าที่จัดของ" titleEn="Packing duty" descTh="กดรับหน้าที่จัดของในพูลงานมากที่สุด" descEn="Took the packing duty in the job pool the most." isEn={isEn} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {isEn ? 'The two new tracks use an existing picture frame for now.' : 'เฟรมรูปของ 2 สายใหม่ ยังใช้เฟรมเดิมชั่วคราว'}
          </p>
        </div>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <div id="equip-faq" className="scroll-mt-6">
          <SectionHeader
            icon={<CircleHelp className="h-4 w-4" />}
            title={isEn ? 'Frequently asked questions' : 'คำถามที่พบบ่อย'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="หยิบไม่ได้เพราะชิ้นนั้นออกงานอยู่ ทำไง?" titleEn="Cannot pick an item that is out at another job?" descTh={'กด "เปลี่ยนของ" เลือกชิ้นอื่น หรือรอให้ชิ้นนั้นคืนชั้นก่อน'} descEn="Press เปลี่ยนของ (swap) for another item, or wait until it is back on the shelf." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="ตู้ที่ขายไว้เสีย ทำไง?" titleEn="The sold booth is broken?" descTh="แจ้งทีมขายให้เปลี่ยนชุดตู้ที่หน้าติดตามงาน หรือการ์ดลูกค้า" descEn="Ask sales to change the booth set on the job tracking page or the customer card." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="กดยืนยันจัดของไม่ได้?" titleEn="Cannot confirm packing?" descTh="เช็ก 3 อย่าง: หยิบครบหรือยัง มีรูปอย่างน้อย 1 รูป และเลือกจุดรับของแล้ว" descEn="Check: everything picked, at least 1 photo, and a pickup spot chosen." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="เปิดใบจัดของไม่ได้?" titleEn="Cannot open a packing list?" descTh="งานยังไม่มีแพ็กเกจ (ให้ทีมขายเลือกก่อน) หรือคุณไม่ได้อยู่ในทีมจัดของ" descEn="The job has no package yet (sales must pick one), or you are not in the packing team." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="รับของไปแล้ว อยากแก้ใบ?" titleEn="Want to change the list after pickup?" descTh="ทำไม่ได้ ต้องคืนของก่อน" descEn="Not possible. Return the items first." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="คืนของแล้ว ทำไมอีเวนต์ไม่ปิด?" titleEn="Returned, but the event did not close?" descTh={'คนคืนของไม่มีสิทธิ์ปิดงาน ให้ผู้ปิดงานกด "ปิดงาน" จากหน้าปิดงานของอีเวนต์'} descEn="The person returning is not an event closer. An event closer presses ปิดงาน on the close page." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="กระเป๋าใบเดียวถูกขายสองงานวันเดียวกัน?" titleEn="One kit bag sold to two jobs on the same day?" descTh="ระบบเตือน แต่ไม่ห้าม ของจริงจะกันกันเองตอนหยิบ (ชิ้นที่ออกงานอยู่หยิบซ้ำไม่ได้)" descEn="You get a warning, not a block. The real items sort it out at picking (an item that is out cannot be picked again)." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="ทำไมเห็นเฟรมถ้วยซ้ำกัน?" titleEn="Why do two trophies share a frame?" descTh="เฟรมของถ้วย 2 สายใหม่ยังใช้เฟรมเดิมชั่วคราว" descEn="The two new trophy tracks use an existing frame for now." isEn={isEn} />
            <TipCard tone="sky" icon={<CircleHelp className="h-4 w-4" />} titleTh="งานเก่าที่จองกระเป๋าไว้แบบเดิม?" titleEn="Old jobs that booked kits the old way?" descTh={'ยังปิดงานได้ตามเดิม ดูความพร้อมที่ช่อง "จัดของ" ในหน้าติดตามงาน'} descEn={'They still close the old way. Check the "จัดของ" box on the job tracking page.'} isEn={isEn} />
          </div>
        </div>

        {/* ── Menu shortcuts ───────────────────────────────────────── */}
        <div id="equip-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/stock/settings"           labelEn="Stock settings"        labelTh="ตั้งค่าคลัง" />
            <MenuLink href="/packages"                 labelEn="Packages"              labelTh="แพ็กเกจ" />
            <MenuLink href="/packing"                  labelEn="Packing lists"         labelTh="ใบจัดของ" />
            <MenuLink href="/stock/usage"              labelEn="Equipment usage"       labelTh="การใช้งาน" />
            <MenuLink href="/jobs/tracking"            labelEn="Job tracking"          labelTh="ติดตามงาน" />
            <MenuLink href="/crm"                      labelEn="CRM"                   labelTh="CRM" />
            <MenuLink href="/reports"                  labelEn="Team stats"            labelTh="สถิติทีม" />
            <MenuLink href="/jobs/settings"            labelEn="Job pool team"         labelTh="ทีมของพูลงาน" />
            <MenuLink href="/settings?section=events"  labelEn="Event closers"         labelTh="ผู้ปิดงาน" />
          </div>
        </div>
      </section>
      )}

      {/* ── Footer note (landing only) ─────────────────────────────── */}
      {view === 'landing' && (
        <p className="text-xs text-zinc-400 text-center pt-4">
          {isEn
            ? 'More guides for other modules coming soon.'
            : 'คู่มือโมดูลอื่นกำลังจะตามมา'}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  color = 'zinc',
}: {
  icon: React.ReactNode
  title: string
  color?: 'zinc' | 'emerald' | 'amber' | 'rose' | 'violet'
}) {
  const colorMap = {
    zinc:    'text-zinc-500',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber:   'text-amber-600 dark:text-amber-400',
    rose:    'text-rose-600 dark:text-rose-400',
    violet:  'text-violet-600 dark:text-violet-400',
  } as const
  return (
    <h3 className={`flex items-center gap-2 text-sm font-semibold mb-3 ${colorMap[color]}`}>
      {icon}
      {title}
    </h3>
  )
}

function TypeCard({
  emoji, title, subtitle, desc, receipt, receiptColor,
}: {
  emoji: string; title: string; subtitle: string; desc: string; receipt: string; receiptColor: 'amber' | 'emerald'
}) {
  const colorMap = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
  }
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{emoji}</span>
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
          <code className="text-[10px] text-zinc-400 font-mono">{subtitle}</code>
        </div>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">{desc}</p>
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border ${colorMap[receiptColor]}`}>
        <Receipt className="h-3 w-3" />
        {receipt}
      </span>
    </div>
  )
}

function RoleCard({
  role, title, steps,
}: {
  role: 'user' | 'admin'
  title: string
  steps: { n: number; label: string; tag: string | null }[]
}) {
  const isAdmin = role === 'admin'
  const accent = isAdmin
    ? 'border-purple-200 bg-purple-50/40 dark:border-purple-900 dark:bg-purple-950/10'
    : 'border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/10'
  const iconColor = isAdmin ? 'text-purple-600 dark:text-purple-400' : 'text-sky-600 dark:text-sky-400'
  const badgeColor = isAdmin ? 'bg-purple-600' : 'bg-sky-600'
  const Icon = isAdmin ? UserCog : User

  return (
    <div className={`rounded-xl border ${accent} p-4`}>
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-700/60">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{title}</h4>
      </div>
      <ol className="space-y-2.5">
        {steps.map(s => (
          <li key={s.n} className="flex items-start gap-2.5 text-xs">
            <span className={`flex items-center justify-center h-5 w-5 rounded-full ${badgeColor} text-white font-bold text-[10px] shrink-0 mt-0.5`}>
              {s.n}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{s.label}</p>
              {s.tag && (
                <code className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded">
                  {s.tag}
                </code>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MiniCard({ role, lines }: { role: 'user' | 'admin'; lines: string[] }) {
  const isAdmin = role === 'admin'
  const Icon = isAdmin ? UserCog : User
  const iconColor = isAdmin ? 'text-purple-500' : 'text-sky-500'
  return (
    <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          {isAdmin ? 'Admin' : 'User'}
        </p>
      </div>
      <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

function StatusRow({
  emoji, color, label, code, meaning, terminal = false,
}: { emoji: string; color: string; label: string; code: string; meaning: string; terminal?: boolean }) {
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2 align-top">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-base">{emoji}</span>
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full text-white" style={{ backgroundColor: color }}>
            {label}
          </span>
        </span>
        <code className="block mt-1 text-[10px] font-mono text-zinc-400">{code}</code>
      </td>
      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 align-top">{meaning}</td>
      <td className="px-3 py-2 align-top hidden sm:table-cell">
        {terminal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
            <Lock className="h-2.5 w-2.5" />
            Terminal
          </span>
        )}
      </td>
    </tr>
  )
}

function PermissionRow({
  label, owner, other, admin, ownerNote, adminNote,
}: {
  label: string
  owner: 'yes' | 'no' | 'partial' | '—'
  other: 'yes' | 'no' | '—'
  admin: 'yes' | 'no' | '—'
  ownerNote?: string
  adminNote?: string
}) {
  const badge = (v: string) => {
    if (v === 'yes') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-[11px]">✓</span>
    if (v === 'no') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400 text-[11px]">✗</span>
    if (v === 'partial') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 text-[11px]">△</span>
    return <span className="text-zinc-300 text-xs">—</span>
  }
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{label}</td>
      <td className="px-3 py-2 text-center">
        {badge(owner)}
        {ownerNote && <p className="text-[10px] text-zinc-400 mt-0.5">{ownerNote}</p>}
      </td>
      <td className="px-3 py-2 text-center">{badge(other)}</td>
      <td className="px-3 py-2 text-center">
        {badge(admin)}
        {adminNote && <p className="text-[10px] text-zinc-400 mt-0.5">{adminNote}</p>}
      </td>
    </tr>
  )
}

function NotifRow({
  emoji, code, labelTh, labelEn, toTh, toEn, isEn,
}: { emoji: string; code: string; labelTh: string; labelEn: string; toTh: string; toEn: string; isEn: boolean }) {
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <span className="text-lg leading-none mt-0.5">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{isEn ? labelEn : labelTh}</p>
        <code className="text-[10px] font-mono text-zinc-400">{code}</code>
        <p className="text-[10px] text-zinc-500 mt-0.5">
          <ArrowRight className="inline h-2.5 w-2.5" /> {isEn ? toEn : toTh}
        </p>
      </div>
    </div>
  )
}

function NewItem({
  icon, titleTh, titleEn, descTh, descEn, isEn,
}: {
  icon: React.ReactNode
  titleTh: string
  titleEn: string
  descTh: string
  descEn: string
  isEn: boolean
}) {
  return (
    <li className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/70 dark:bg-zinc-900/70 border border-emerald-200/60 dark:border-emerald-900/40">
      <span className="flex items-center justify-center h-6 w-6 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
          {isEn ? titleEn : titleTh}
        </p>
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-snug mt-0.5">
          {isEn ? descEn : descTh}
        </p>
      </div>
    </li>
  )
}

function ChecklistRow({
  emoji, label, required, passes,
}: { emoji: string; label: string; required: string; passes: string }) {
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2.5 align-top">
        <span className="inline-flex items-center gap-2 text-zinc-800 dark:text-zinc-200 font-medium">
          <span className="text-base">{emoji}</span>
          {label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{required}</td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{passes}</td>
    </tr>
  )
}

function FeatureBlock({
  titleTh, titleEn, lines,
}: { titleTh: string; titleEn: string; lines: string[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  return (
    <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-2">
        {isEn ? titleEn : titleTh}
      </p>
      <ul className="space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
        {lines.map((l, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="text-zinc-300 mt-0.5">•</span>
            <span>{l}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CheckinTypeRow({
  emoji, label, when, required, onCheckout,
}: { emoji: string; label: string; when: string; required: string; onCheckout: string }) {
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2.5 align-top">
        <span className="inline-flex items-center gap-2 text-zinc-800 dark:text-zinc-200 font-medium">
          <span className="text-base">{emoji}</span>
          {label}
        </span>
      </td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{when}</td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top">{required}</td>
      <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 align-top hidden sm:table-cell">{onCheckout}</td>
    </tr>
  )
}

function TimelineRow({
  time, emoji, textTh, textEn, tagTh, tagEn, isEn, variant,
}: {
  time: string
  emoji: string
  textTh: string
  textEn: string
  tagTh: string
  tagEn: string
  isEn: boolean
  variant?: 'highlight' | 'success'
}) {
  const tagCls = variant === 'highlight'
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800'
    : variant === 'success'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
  return (
    <div className="flex items-center gap-2.5 text-xs">
      <span className="font-mono text-[11px] font-bold text-zinc-500 w-12 shrink-0 tabular-nums">{time}</span>
      <span className="text-base shrink-0">{emoji}</span>
      <span className="flex-1 min-w-0 text-zinc-700 dark:text-zinc-300">{isEn ? textEn : textTh}</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold border ${tagCls}`}>
        {isEn ? tagEn : tagTh}
      </span>
    </div>
  )
}

function TipCard({
  tone, icon, titleTh, titleEn, descTh, descEn, isEn,
}: {
  tone: 'emerald' | 'sky' | 'amber' | 'violet'
  icon: React.ReactNode
  titleTh: string
  titleEn: string
  descTh: string
  descEn: string
  isEn: boolean
}) {
  const toneMap = {
    emerald: 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400',
    sky:     'border-sky-200 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 text-sky-700 dark:text-sky-400',
    amber:   'border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
    violet:  'border-violet-200 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400',
  }
  return (
    <div className={`rounded-lg border p-3 ${toneMap[tone]}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="shrink-0">{icon}</span>
        <p className="text-xs font-bold">
          {isEn ? titleEn : titleTh}
        </p>
      </div>
      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {isEn ? descEn : descTh}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Module library — config-driven so adding a new module = 1 entry
// ─────────────────────────────────────────────────────────────────────

type ModuleAccent = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'zinc' | 'cyan' | 'teal' | 'indigo' | 'red'

interface ModuleSubItem { id: string; titleTh: string; titleEn: string }
interface ModuleSubGroup {
  titleTh: string
  titleEn: string
  items: ModuleSubItem[]
}
interface ModuleConfig {
  id: string                    // anchor id used inside a module page (e.g. "mod-overview")
  /** URL slug — module is reachable at /howto/{slug} */
  slug: 'overview' | 'crm' | 'events' | 'jobs' | 'stock' | 'costs' | 'finance' | 'kpi' | 'security' | 'checkin' | 'salary' | 'equipment'
  accent: ModuleAccent
  Icon: typeof BookOpen
  titleTh: string
  titleEn: string
  descTh: string
  descEn: string
  /** Sub-section groups for the in-module navigation */
  groups: ModuleSubGroup[]
  /** Optional badge ("New", "Beta", "Coming soon") */
  badge?: { th: string; en: string; tone: 'new' | 'soon' }
  /** When set, the card is shown but not clickable (placeholder for future modules) */
  comingSoon?: boolean
}

const MODULES: ModuleConfig[] = [
  {
    id: 'mod-overview',
    slug: 'overview',
    accent: 'violet',
    Icon: LayoutDashboard,
    titleTh: 'Overview — ภาพรวมระบบ',
    titleEn: 'Overview — Command Center',
    descTh: 'แดชบอร์ดผู้บริหาร: KPI, Top events, สรุปรายเดือน + ผู้ช่วย AI ภาษาไทย',
    descEn: 'Executive dashboard — KPI, top events, monthly close-out + Thai AI analyst.',
    badge: { th: 'admin only', en: 'Admin only', tone: 'new' },
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'overview-intro', titleTh: 'ภาพรวม',      titleEn: 'Overview' },
          { id: 'overview-views', titleTh: '4 มุมมอง',    titleEn: '4 view modes' },
        ],
      },
      {
        titleTh: 'มุมมอง',
        titleEn: 'Views',
        items: [
          { id: 'overview-dashboard', titleTh: 'แดชบอร์ด',   titleEn: 'Dashboard' },
          { id: 'overview-table',     titleTh: 'ตาราง',       titleEn: 'Table' },
          { id: 'overview-analytics', titleTh: 'วิเคราะห์',   titleEn: 'Analytics' },
          { id: 'overview-ai',        titleTh: 'AI Assist',   titleEn: 'AI Assist' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'overview-permissions', titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'overview-menu',        titleTh: 'เมนูทั้งหมด',     titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-crm',
    slug: 'crm',
    accent: 'rose',
    Icon: Users,
    titleTh: 'CRM — ลูกค้าและงานขาย',
    titleEn: 'CRM — Leads & Sales',
    descTh: 'บอร์ด Kanban ติดตาม lead ลูกค้า · ผ่อนชำระ · มอบหมายทีม · แปลงเป็น event',
    descEn: 'Kanban lead tracking · installments · staff assignment · convert to event.',
    badge: { th: 'ฟีเจอร์ใหม่', en: 'NEW', tone: 'new' },
    groups: [
      {
        titleTh: 'อัปเดตล่าสุด',
        titleEn: 'Highlights',
        items: [
          { id: 'crm-whats-new', titleTh: 'อัปเดตล่าสุด', titleEn: "What's new" },
        ],
      },
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'crm-intro',    titleTh: 'ภาพรวม Kanban', titleEn: 'Kanban overview' },
          { id: 'crm-pipeline', titleTh: 'Pipeline 4 สถานะ', titleEn: '4-status pipeline' },
        ],
      },
      {
        titleTh: 'ฟลูว์งาน',
        titleEn: 'Workflow',
        items: [
          { id: 'crm-create',       titleTh: 'สร้าง lead',           titleEn: 'Create lead' },
          { id: 'crm-detail',       titleTh: 'แก้รายละเอียด lead',   titleEn: 'Lead detail' },
          { id: 'crm-installments', titleTh: 'ผ่อนชำระ',             titleEn: 'Installments' },
          { id: 'crm-staff',        titleTh: 'มอบหมายทีม',           titleEn: 'Staff assignment' },
          { id: 'crm-to-event',     titleTh: 'แปลง lead → event',    titleEn: 'Lead → event' },
        ],
      },
      {
        titleTh: 'เครื่องมือ',
        titleEn: 'Tools',
        items: [
          { id: 'crm-payments',  titleTh: 'ปฏิทินเงินเข้า',  titleEn: 'Payments calendar' },
          { id: 'crm-archive',   titleTh: 'คลัง lead เก่า',   titleEn: 'Archive' },
          { id: 'crm-download',  titleTh: 'Export CSV',       titleEn: 'Export' },
          { id: 'crm-dashboard', titleTh: 'แดชบอร์ด / KPI',  titleEn: 'Dashboard' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'crm-permissions',   titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'crm-notifications', titleTh: 'การแจ้งเตือน',     titleEn: 'Notifications' },
          { id: 'crm-settings',      titleTh: 'ตั้งค่า',          titleEn: 'Settings' },
          { id: 'crm-menu',          titleTh: 'เมนูทั้งหมด',     titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-events',
    slug: 'events',
    accent: 'cyan',
    Icon: CalendarDays,
    titleTh: 'Events — งานลูกค้า',
    titleEn: 'Events — Client Jobs',
    descTh: 'จัดการงานลูกค้าครบวงจร — ตรวจของ, on-site, เช็คคืน, ปิดงาน',
    descEn: 'End-to-end client job management — kit check, on-site, return, closure.',
    badge: { th: 'admin สร้าง/แก้', en: 'Admin create/edit', tone: 'new' },
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'events-intro', titleTh: 'ภาพรวม',                 titleEn: 'Overview' },
          { id: 'events-flow',  titleTh: 'Flow ทั้งหมด',           titleEn: 'End-to-end flow' },
        ],
      },
      {
        titleTh: 'ฟลูว์งาน',
        titleEn: 'Workflow',
        items: [
          { id: 'events-create',     titleTh: 'สร้าง / แก้ event',          titleEn: 'Create / edit' },
          { id: 'events-check-kits', titleTh: 'ตรวจของก่อน on-site',        titleEn: 'Check-kits' },
          { id: 'events-return',     titleTh: 'เช็คคืน + ปิดงาน',           titleEn: 'Return + closure' },
        ],
      },
      {
        titleTh: 'เครื่องมือ',
        titleEn: 'Tools',
        items: [
          { id: 'events-calendar', titleTh: 'ปฏิทิน',           titleEn: 'Calendar' },
          { id: 'events-closures', titleTh: 'งานที่ปิดแล้ว',    titleEn: 'Closures archive' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'events-permissions', titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'events-linked',      titleTh: 'ผูกกับโมดูลอื่น',  titleEn: 'Linked modules' },
          { id: 'events-menu',        titleTh: 'เมนูทั้งหมด',      titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-jobs',
    slug: 'jobs',
    accent: 'amber',
    Icon: Briefcase,
    titleTh: 'Jobs — งานทีม + tickets',
    titleEn: 'Jobs — Team Tasks + Tickets',
    descTh: 'Kanban งานทีม (graphic + on-site) · บอร์ดส่วนตัว · ระบบ ticket ภายใน',
    descEn: 'Team Kanban (graphic + on-site) · personal board · internal tickets.',
    badge: { th: 'ฟีเจอร์ใหม่', en: 'NEW', tone: 'new' },
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'jobs-intro',  titleTh: 'ภาพรวม',                titleEn: 'Overview' },
          { id: 'jobs-system', titleTh: 'บอร์ดทีม Kanban',        titleEn: 'System board' },
          { id: 'jobs-my-job', titleTh: 'บอร์ดส่วนตัว',           titleEn: 'My-Job board' },
        ],
      },
      {
        titleTh: 'ฟีเจอร์',
        titleEn: 'Features',
        items: [
          { id: 'jobs-tickets',         titleTh: 'Tickets ภายใน',          titleEn: 'Tickets' },
          { id: 'jobs-from-crm',        titleTh: 'สร้าง 2 jobs จาก CRM',    titleEn: 'Bulk-create from CRM' },
          { id: 'jobs-archive-report',  titleTh: 'archive + report',       titleEn: 'Archive + report' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'jobs-notifications', titleTh: 'การแจ้งเตือน',     titleEn: 'Notifications' },
          { id: 'jobs-permissions',   titleTh: 'สิทธิ์การใช้งาน',  titleEn: 'Permissions' },
          { id: 'jobs-menu',          titleTh: 'เมนูทั้งหมด',      titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-stock',
    slug: 'stock',
    accent: 'zinc',
    Icon: Package,
    titleTh: 'Stock — คลังอุปกรณ์',
    titleEn: 'Stock — Inventory',
    descTh: 'items · kits · ใบจัดของ · templates · dashboard · QR · activity log',
    descEn: 'items · kits · packing lists · templates · dashboard · QR · activity log',
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'stock-intro',    titleTh: 'ภาพรวม',          titleEn: 'Overview' },
          { id: 'stock-statuses', titleTh: '7 สถานะ item',     titleEn: '7 item statuses' },
        ],
      },
      {
        titleTh: 'ฟลูว์งาน',
        titleEn: 'Workflow',
        items: [
          { id: 'stock-kit-lifecycle', titleTh: 'วงจรชีวิต kit',    titleEn: 'Kit lifecycle' },
          { id: 'stock-check',         titleTh: 'check-out / -in',  titleEn: 'Check-out / check-in' },
          { id: 'stock-qr',            titleTh: 'พิมพ์ QR',         titleEn: 'QR print' },
          { id: 'stock-templates',     titleTh: 'Templates',        titleEn: 'Templates' },
        ],
      },
      {
        titleTh: 'รายงาน',
        titleEn: 'Reports',
        items: [
          { id: 'stock-dashboard', titleTh: 'Stock dashboard',  titleEn: 'Stock dashboard' },
          { id: 'stock-logs',      titleTh: 'Activity log',     titleEn: 'Activity log' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'stock-permissions', titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'stock-menu',        titleTh: 'เมนูทั้งหมด',     titleEn: 'Menu shortcuts' },
        ],
      },
      {
        titleTh: 'ใบจัดของ',
        titleEn: 'Packing lists',
        items: [
          { id: 'stock-packing-flow',   titleTh: '6 ขั้นของใบจัดของ',  titleEn: '6 steps' },
          { id: 'stock-packing-roles',  titleTh: 'ใครทำอะไร',         titleEn: 'Who does what' },
          { id: 'stock-packing-pickup', titleTh: 'QR จุดรับของ',       titleEn: 'Pickup-spot QR' },
          { id: 'stock-packing-usage',  titleTh: 'ถ้วย + การใช้งาน',   titleEn: 'Trophies & usage' },
        ],
      },
    ],
  },
  {
    id: 'mod-costs',
    slug: 'costs',
    accent: 'teal',
    Icon: Coins,
    titleTh: 'Costs — บัญชีกำไร/ขาดทุนต่อ event',
    titleEn: 'Costs — Per-event Profitability Ledger',
    descTh: 'เก็บ revenue + ต้นทุนรายหมวด ต่อ event · จับคู่ CRM อัตโนมัติ · ผูกใบเบิก Finance',
    descEn: 'Revenue + cost line items per event · auto CRM matching · linked Finance claims.',
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'costs-intro', titleTh: 'ภาพรวม',          titleEn: 'Overview' },
          { id: 'costs-flow',  titleTh: 'Flow ทำงาน',     titleEn: 'Workflow' },
        ],
      },
      {
        titleTh: 'เนื้อหา',
        titleEn: 'Core',
        items: [
          { id: 'costs-import',         titleTh: 'Import + จับคู่ CRM', titleEn: 'Import + CRM matching' },
          { id: 'costs-revenue',        titleTh: 'Revenue + VAT/WHT',   titleEn: 'Revenue + VAT/WHT' },
          { id: 'costs-categories',     titleTh: 'หมวดต้นทุน',          titleEn: 'Cost categories' },
          { id: 'costs-linked-claims',  titleTh: 'ใบเบิก Finance ที่ผูก', titleEn: 'Linked claims' },
        ],
      },
      {
        titleTh: 'รายงาน',
        titleEn: 'Reports',
        items: [
          { id: 'costs-dashboard', titleTh: 'Dashboard',          titleEn: 'Dashboard' },
          { id: 'costs-reports',   titleTh: 'รายงาน + Export',    titleEn: 'Reports + Export' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'costs-permissions', titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'costs-menu',        titleTh: 'เมนูทั้งหมด',     titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-finance',
    slug: 'finance',
    accent: 'emerald',
    Icon: Banknote,
    titleTh: 'Finance — ใบเบิกเงิน',
    titleEn: 'Finance — Expense Claims',
    descTh: 'ระบบเบิกค่าใช้จ่าย ใบกำกับภาษี และรายงานตรวจสอบก่อนส่งบัญชี',
    descEn: 'Expense claims, tax invoices, and pre-accounting audit reports.',
    groups: [
      {
        titleTh: 'อัปเดตล่าสุด',
        titleEn: 'Highlights',
        items: [
          { id: 'finance-whats-new', titleTh: 'อัปเดตล่าสุด', titleEn: "What's new" },
        ],
      },
      {
        titleTh: 'ฟลูว์งาน',
        titleEn: 'Workflow',
        items: [
          { id: 'finance-flowcharts', titleTh: 'แผนผังขั้นตอน', titleEn: 'Flowcharts' },
          { id: 'finance-types',      titleTh: 'ประเภทใบเบิก',  titleEn: 'Claim types' },
          { id: 'finance-funding',    titleTh: 'แหล่งเงินที่ใช้เบิก', titleEn: 'Funding source' },
          { id: 'finance-normal',     titleTh: 'Flow ปกติ',     titleEn: 'Normal flow' },
          { id: 'finance-advance',    titleTh: 'Flow เบิกทดลองจ่าย', titleEn: 'Advance flow' },
        ],
      },
      {
        titleTh: 'เอกสาร',
        titleEn: 'Documents',
        items: [
          { id: 'finance-tax-invoice', titleTh: 'ใบกำกับภาษี',           titleEn: 'Tax invoice' },
          { id: 'finance-checklist',   titleTh: 'ตรวจเอกสารก่อนส่งบัญชี', titleEn: 'Document checklist' },
        ],
      },
      {
        titleTh: 'รายงาน',
        titleEn: 'Reports',
        items: [
          { id: 'finance-report', titleTh: 'รายงานตรวจสอบ',  titleEn: 'Audit report' },
          { id: 'finance-wht',    titleTh: 'สรุปหัก ณ ที่จ่าย', titleEn: 'WHT 3% summary' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'finance-status',        titleTh: 'สถานะทั้งหมด', titleEn: 'All statuses' },
          { id: 'finance-permissions',   titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'finance-notifications', titleTh: 'การแจ้งเตือน',   titleEn: 'Notifications' },
          { id: 'finance-menu',          titleTh: 'เมนูทั้งหมด',     titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-kpi',
    slug: 'kpi',
    accent: 'indigo',
    Icon: Target,
    titleTh: 'KPI — บริหารผลงาน',
    titleEn: 'KPI — Performance Management',
    descTh: 'ตั้งเป้า / รับผลจริง / คำนวณคะแนน — leaderboard + reports + feedback timeline',
    descEn: 'Set targets / submit actuals / compute scores — leaderboard + reports + feedback timeline.',
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'kpi-intro', titleTh: 'ภาพรวม',          titleEn: 'Overview' },
          { id: 'kpi-modes', titleTh: '3 โหมด template',  titleEn: '3 modes' },
          { id: 'kpi-flow',  titleTh: 'Flow ทำงาน',      titleEn: 'Workflow' },
        ],
      },
      {
        titleTh: 'การคำนวณ',
        titleEn: 'Mechanics',
        items: [
          { id: 'kpi-cycles',    titleTh: 'รอบเวลา',         titleEn: 'Cycles' },
          { id: 'kpi-scoring',   titleTh: 'สูตรคำนวณคะแนน', titleEn: 'Scoring formula' },
          { id: 'kpi-self-eval', titleTh: 'ประเมินตัวเอง',   titleEn: 'Self-evaluation' },
        ],
      },
      {
        titleTh: 'รายงาน',
        titleEn: 'Reports',
        items: [
          { id: 'kpi-reports',  titleTh: 'รายงาน + leaderboard', titleEn: 'Reports + leaderboard' },
          { id: 'kpi-feedback', titleTh: 'Feedback timeline',     titleEn: 'Feedback timeline' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'kpi-notifications', titleTh: 'การแจ้งเตือน',    titleEn: 'Notifications' },
          { id: 'kpi-permissions',   titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'kpi-menu',          titleTh: 'เมนูทั้งหมด',     titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-security',
    slug: 'security',
    accent: 'red',
    Icon: Shield,
    titleTh: 'Security — ความปลอดภัย',
    titleEn: 'Security — Auth Control Center',
    descTh: 'ติดตาม login · บัญชีโดนล็อก · session ที่ active · กฎ IP block/allow',
    descEn: 'Monitor logins · locked accounts · active sessions · IP block/allow rules.',
    badge: { th: 'admin only', en: 'Admin only', tone: 'new' },
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'security-intro',     titleTh: 'ภาพรวม',         titleEn: 'Overview' },
          { id: 'security-dashboard', titleTh: 'Dashboard',      titleEn: 'Dashboard' },
        ],
      },
      {
        titleTh: 'การกระทำ',
        titleEn: 'Actions',
        items: [
          { id: 'security-lockout',      titleTh: 'บัญชีโดนล็อก',     titleEn: 'Account lockout' },
          { id: 'security-force-logout', titleTh: 'Force logout',     titleEn: 'Force logout' },
          { id: 'security-ip-rules',     titleTh: 'IP rules',         titleEn: 'IP rules' },
        ],
      },
      {
        titleTh: 'ตรวจสอบ',
        titleEn: 'Audit',
        items: [
          { id: 'security-audit',  titleTh: 'Timeline เหตุการณ์', titleEn: 'Events timeline' },
          { id: 'security-linked', titleTh: 'ผูกกับโมดูลอื่น',     titleEn: 'Linked modules' },
          { id: 'security-tips',   titleTh: 'เคล็ดลับ',           titleEn: 'Tips & gotchas' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'security-permissions', titleTh: 'สิทธิ์การใช้งาน', titleEn: 'Permissions' },
          { id: 'security-menu',        titleTh: 'เมนูทั้งหมด',     titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-checkin',
    slug: 'checkin',
    accent: 'sky',
    Icon: LogIn,
    titleTh: 'Check-in — ลงเวลาทำงาน',
    titleEn: 'Check-in — Time Tracking',
    descTh: 'ลงเวลาเข้า-ออก สำหรับออฟฟิศ งานอีเวนต์ และทำงานนอกสถานที่',
    descEn: 'Daily clock in/out for office, on-site events, and remote work.',
    badge: { th: 'ฟีเจอร์ใหม่', en: 'NEW', tone: 'new' },
    groups: [
      {
        titleTh: 'เริ่มต้น',
        titleEn: 'Get started',
        items: [
          { id: 'checkin-overview', titleTh: 'ภาพรวม',         titleEn: 'Overview' },
          { id: 'checkin-types',    titleTh: 'ประเภทเช็คอิน',  titleEn: 'Check-in types' },
        ],
      },
      {
        titleTh: 'ฟลูว์งาน',
        titleEn: 'Workflow',
        items: [
          { id: 'checkin-normal',    titleTh: 'Flow ปกติ',                  titleEn: 'Normal flow' },
          { id: 'checkin-overlap',   titleTh: 'Flow คาบเกี่ยว (ใหม่)',      titleEn: 'Overlap flow (new)' },
          { id: 'checkin-shortcuts', titleTh: 'ทางลัด — เช็คอินเร็วขึ้น',   titleEn: 'Smart shortcuts' },
          { id: 'checkin-leave',      titleTh: 'ลางาน (ใหม่)',              titleEn: 'Leave requests (new)' },
          { id: 'checkin-leave-flow', titleTh: 'Flow การลา',                titleEn: 'Leave flow' },
          { id: 'checkin-leave-ref',  titleTh: 'สถานะ และกฎการลา',          titleEn: 'Leave status & rules' },
        ],
      },
      {
        titleTh: 'อ้างอิง',
        titleEn: 'Reference',
        items: [
          { id: 'checkin-tips', titleTh: 'เคล็ดลับและข้อควรรู้', titleEn: 'Tips & gotchas' },
          { id: 'checkin-menu', titleTh: 'เมนูทั้งหมด',          titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
  {
    id: 'mod-salary',
    slug: 'salary',
    accent: 'teal',
    Icon: Wallet,
    titleTh: 'เงินเดือน — สลิปและงวดคำนวณ',
    titleEn: 'Salary — Slips & Pay Periods',
    descTh: 'พนักงานดูสลิปของตัวเอง แอดมินเปิดงวด คำนวณ ปิดงวด และจ่ายเงิน',
    descEn: 'Staff view their own slips. Admins open periods, calculate, close and pay.',
    badge: { th: 'ฟีเจอร์ใหม่', en: 'NEW', tone: 'new' },
    groups: [
      {
        titleTh: 'ทั่วไป (ทุกคนอ่าน)',
        titleEn: 'General (everyone)',
        items: [
          { id: 'salary-start', titleTh: 'เริ่มที่นี่',          titleEn: 'Start here' },
          { id: 'salary-money', titleTh: 'เงินมาจากอะไรบ้าง',  titleEn: 'What the money is made of' },
          { id: 'salary-faq',   titleTh: 'คำถามที่พบบ่อย',      titleEn: 'FAQ' },
          { id: 'salary-menu',  titleTh: 'เมนูทั้งหมด',         titleEn: 'Menu shortcuts' },
        ],
      },
      {
        titleTh: 'สำหรับพนักงาน',
        titleEn: 'For staff',
        items: [
          { id: 'salary-staff-checkin', titleTh: 'ติ๊กหน้าที่ตอนเช็คอิน',   titleEn: 'Tick duties at check-in' },
          { id: 'salary-staff-slips',   titleTh: 'สลิปของฉัน และสถานะ',    titleEn: 'My slips & statuses' },
          { id: 'salary-staff-read',    titleTh: 'อ่านสลิป / โหลด PDF',     titleEn: 'Read a slip / get PDF' },
          { id: 'salary-staff-notify',  titleTh: 'แจ้งเตือน และสลิปถูกแก้', titleEn: 'Notifications & reopened slips' },
        ],
      },
      {
        titleTh: 'สำหรับแอดมิน',
        titleEn: 'For admin',
        items: [
          { id: 'salary-admin-setup',   titleTh: '1. ตั้งค่าครั้งแรก',        titleEn: '1. First-time setup' },
          { id: 'salary-admin-open',    titleTh: '2. เปิดงวด',               titleEn: '2. Open a period' },
          { id: 'salary-admin-calc',    titleTh: '3. เลือกคนและคำนวณ',       titleEn: '3. Pick people & calculate' },
          { id: 'salary-admin-edit',    titleTh: '4. ตรวจและแก้สลิปรายวัน',   titleEn: '4. Check & edit the daily slip' },
          { id: 'salary-admin-pending', titleTh: '5. งานค้าง และยอมรับ',     titleEn: '5. Open items & accept' },
          { id: 'salary-admin-runner',  titleTh: '6. รันเนอร์ และรายการปรับมือ', titleEn: '6. Runner & manual adjustments' },
          { id: 'salary-admin-close',   titleTh: '7. ปิดงวด',                titleEn: '7. Close the period' },
          { id: 'salary-admin-pay',     titleTh: '8. สรุปยอดโอน และจ่ายเงิน', titleEn: '8. Transfer summary & pay' },
          { id: 'salary-admin-reopen',  titleTh: '9. เปิดแก้ไขหลังปิดงวด',    titleEn: '9. Reopen after closing' },
        ],
      },
    ],
  },
  {
    id: 'mod-equipment',
    slug: 'equipment',
    accent: 'violet',
    Icon: Boxes,
    titleTh: 'อุปกรณ์ — flow ใบจัดของทั้งเส้น',
    titleEn: 'Equipment — the whole packing flow',
    descTh: 'ตั้งค่า → ขาย → จัดของ → รับ/คืน → คืนชั้น → การใช้งาน สำหรับทุกฝ่าย',
    descEn: 'Setup → sales → packing → pickup/return → restock → usage, for every team.',
    badge: { th: 'ฟีเจอร์ใหม่', en: 'NEW', tone: 'new' },
    groups: [
      {
        titleTh: 'เริ่มที่นี่',
        titleEn: 'Start here',
        items: [
          { id: 'equip-start', titleTh: 'ภาพรวม flow', titleEn: 'The whole flow' },
          { id: 'equip-roles', titleTh: 'ใครทำอะไร',   titleEn: 'Who does what' },
          { id: 'equip-terms', titleTh: 'ศัพท์',        titleEn: 'Words' },
        ],
      },
      {
        titleTh: 'ตั้งค่าครั้งแรก (แอดมิน/ผู้ดูแลอุปกรณ์)',
        titleEn: 'First-time setup (admin / equipment keeper)',
        items: [
          { id: 'equip-setup-team',       titleTh: '1–3. ทีมจัดของ + ผู้ปิดงาน', titleEn: '1–3. Packing team + closers' },
          { id: 'equip-setup-categories', titleTh: '4–5. ประเภทอุปกรณ์',        titleEn: '4–5. Categories' },
          { id: 'equip-setup-packages',   titleTh: '6. แพ็กเกจ',               titleEn: '6. Packages' },
          { id: 'equip-setup-spots',      titleTh: '7. จุดรับของ + QR',         titleEn: '7. Pickup spots + QR' },
        ],
      },
      {
        titleTh: 'ทีมขาย',
        titleEn: 'Sales',
        items: [
          { id: 'equip-sales-pick',    titleTh: 'เลือกแพ็กเกจ',            titleEn: 'Pick packages' },
          { id: 'equip-sales-booth',   titleTh: 'ชุดตู้ + แบบประกอบ',       titleEn: 'Booth set + style' },
          { id: 'equip-sales-warning', titleTh: 'คำเตือนอุปกรณ์อาจไม่พอ',   titleEn: 'Shortage warnings' },
        ],
      },
      {
        titleTh: 'ทีมจัดของ',
        titleEn: 'Packing team',
        items: [
          { id: 'equip-pack-queue',   titleTh: 'คิวใบจัดของ',  titleEn: 'Packing queue' },
          { id: 'equip-pack-select',  titleTh: 'เลือกของ',     titleEn: 'Select' },
          { id: 'equip-pack-pick',    titleTh: 'กำลังหยิบ',    titleEn: 'Pick' },
          { id: 'equip-pack-confirm', titleTh: 'ยืนยันจัดของ', titleEn: 'Confirm' },
          { id: 'equip-pack-restock', titleTh: 'คืนชั้น',      titleEn: 'Restock' },
        ],
      },
      {
        titleTh: 'ทีมหน้างาน / ผู้ปิดงาน',
        titleEn: 'On-site team / event closers',
        items: [
          { id: 'equip-site-handover', titleTh: 'รับของ',    titleEn: 'Pickup' },
          { id: 'equip-site-return',   titleTh: 'คืนของ',    titleEn: 'Return' },
          { id: 'equip-close',         titleTh: 'ปิดอีเวนต์', titleEn: 'Close the event' },
        ],
      },
      {
        titleTh: 'ติดตามผล',
        titleEn: 'Follow-up',
        items: [
          { id: 'equip-readiness', titleTh: 'ข้อ "จัดของ" + แจ้งเตือน', titleEn: 'Packing item + notifications' },
          { id: 'equip-usage',     titleTh: 'หน้าการใช้งาน',          titleEn: 'Usage page' },
          { id: 'equip-trophies',  titleTh: 'ถ้วยรางวัล',             titleEn: 'Trophies' },
          { id: 'equip-faq',       titleTh: 'คำถามที่พบบ่อย',          titleEn: 'FAQ' },
          { id: 'equip-menu',      titleTh: 'เมนูทั้งหมด',             titleEn: 'Menu shortcuts' },
        ],
      },
    ],
  },
]

// Tailwind class maps for accent colors — kept here so the per-accent classes
// are picked up by Tailwind's JIT scanner via static literal strings.
const accentClasses: Record<ModuleAccent, {
  cardBorder: string
  cardBg: string
  cardHover: string
  iconBox: string
  iconText: string
  titleText: string
  pillBg: string
  heroBg: string
  heroBorder: string
  groupTitle: string
  badgeNew: string
}> = {
  emerald: {
    cardBorder: 'border-emerald-200 dark:border-emerald-900/50',
    cardBg:     'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-500/10',
    iconBox:    'bg-emerald-100 dark:bg-emerald-900/40',
    iconText:   'text-emerald-600 dark:text-emerald-400',
    titleText:  'text-emerald-900 dark:text-emerald-200',
    pillBg:     'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50',
    heroBg:     'bg-gradient-to-r from-emerald-500/10 via-emerald-50 to-white dark:from-emerald-900/30 dark:via-emerald-950/20 dark:to-zinc-900',
    heroBorder: 'border-emerald-200 dark:border-emerald-900/50',
    groupTitle: 'text-emerald-700 dark:text-emerald-400',
    badgeNew:   'bg-emerald-500 text-white',
  },
  sky: {
    cardBorder: 'border-sky-200 dark:border-sky-900/50',
    cardBg:     'bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-sky-300 hover:shadow-md hover:shadow-sky-500/10',
    iconBox:    'bg-sky-100 dark:bg-sky-900/40',
    iconText:   'text-sky-600 dark:text-sky-400',
    titleText:  'text-sky-900 dark:text-sky-200',
    pillBg:     'text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-950/50',
    heroBg:     'bg-gradient-to-r from-sky-500/10 via-sky-50 to-white dark:from-sky-900/30 dark:via-sky-950/20 dark:to-zinc-900',
    heroBorder: 'border-sky-200 dark:border-sky-900/50',
    groupTitle: 'text-sky-700 dark:text-sky-400',
    badgeNew:   'bg-sky-500 text-white',
  },
  violet: {
    cardBorder: 'border-violet-200 dark:border-violet-900/50',
    cardBg:     'bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-violet-300 hover:shadow-md hover:shadow-violet-500/10',
    iconBox:    'bg-violet-100 dark:bg-violet-900/40',
    iconText:   'text-violet-600 dark:text-violet-400',
    titleText:  'text-violet-900 dark:text-violet-200',
    pillBg:     'text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50',
    heroBg:     'bg-gradient-to-r from-violet-500/10 via-violet-50 to-white dark:from-violet-900/30 dark:via-violet-950/20 dark:to-zinc-900',
    heroBorder: 'border-violet-200 dark:border-violet-900/50',
    groupTitle: 'text-violet-700 dark:text-violet-400',
    badgeNew:   'bg-violet-500 text-white',
  },
  amber: {
    cardBorder: 'border-amber-200 dark:border-amber-900/50',
    cardBg:     'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-amber-300 hover:shadow-md hover:shadow-amber-500/10',
    iconBox:    'bg-amber-100 dark:bg-amber-900/40',
    iconText:   'text-amber-600 dark:text-amber-400',
    titleText:  'text-amber-900 dark:text-amber-200',
    pillBg:     'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50',
    heroBg:     'bg-gradient-to-r from-amber-500/10 via-amber-50 to-white dark:from-amber-900/30 dark:via-amber-950/20 dark:to-zinc-900',
    heroBorder: 'border-amber-200 dark:border-amber-900/50',
    groupTitle: 'text-amber-700 dark:text-amber-400',
    badgeNew:   'bg-amber-500 text-white',
  },
  rose: {
    cardBorder: 'border-rose-200 dark:border-rose-900/50',
    cardBg:     'bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-rose-300 hover:shadow-md hover:shadow-rose-500/10',
    iconBox:    'bg-rose-100 dark:bg-rose-900/40',
    iconText:   'text-rose-600 dark:text-rose-400',
    titleText:  'text-rose-900 dark:text-rose-200',
    pillBg:     'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50',
    heroBg:     'bg-gradient-to-r from-rose-500/10 via-rose-50 to-white dark:from-rose-900/30 dark:via-rose-950/20 dark:to-zinc-900',
    heroBorder: 'border-rose-200 dark:border-rose-900/50',
    groupTitle: 'text-rose-700 dark:text-rose-400',
    badgeNew:   'bg-rose-500 text-white',
  },
  zinc: {
    cardBorder: 'border-zinc-200 dark:border-zinc-800',
    cardBg:     'bg-zinc-50/50 dark:bg-zinc-900',
    cardHover:  'hover:border-zinc-300',
    iconBox:    'bg-zinc-100 dark:bg-zinc-800',
    iconText:   'text-zinc-500 dark:text-zinc-400',
    titleText:  'text-zinc-700 dark:text-zinc-300',
    pillBg:     'text-zinc-700 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800',
    heroBg:     'bg-zinc-50 dark:bg-zinc-900',
    heroBorder: 'border-zinc-200 dark:border-zinc-800',
    groupTitle: 'text-zinc-700 dark:text-zinc-400',
    badgeNew:   'bg-zinc-500 text-white',
  },
  cyan: {
    cardBorder: 'border-cyan-200 dark:border-cyan-900/50',
    cardBg:     'bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-cyan-300 hover:shadow-md hover:shadow-cyan-500/10',
    iconBox:    'bg-cyan-100 dark:bg-cyan-900/40',
    iconText:   'text-cyan-600 dark:text-cyan-400',
    titleText:  'text-cyan-900 dark:text-cyan-200',
    pillBg:     'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 hover:bg-cyan-100 dark:hover:bg-cyan-950/50',
    heroBg:     'bg-gradient-to-r from-cyan-500/10 via-cyan-50 to-white dark:from-cyan-900/30 dark:via-cyan-950/20 dark:to-zinc-900',
    heroBorder: 'border-cyan-200 dark:border-cyan-900/50',
    groupTitle: 'text-cyan-700 dark:text-cyan-400',
    badgeNew:   'bg-cyan-500 text-white',
  },
  teal: {
    cardBorder: 'border-teal-200 dark:border-teal-900/50',
    cardBg:     'bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-teal-300 hover:shadow-md hover:shadow-teal-500/10',
    iconBox:    'bg-teal-100 dark:bg-teal-900/40',
    iconText:   'text-teal-600 dark:text-teal-400',
    titleText:  'text-teal-900 dark:text-teal-200',
    pillBg:     'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-950/50',
    heroBg:     'bg-gradient-to-r from-teal-500/10 via-teal-50 to-white dark:from-teal-900/30 dark:via-teal-950/20 dark:to-zinc-900',
    heroBorder: 'border-teal-200 dark:border-teal-900/50',
    groupTitle: 'text-teal-700 dark:text-teal-400',
    badgeNew:   'bg-teal-500 text-white',
  },
  indigo: {
    cardBorder: 'border-indigo-200 dark:border-indigo-900/50',
    cardBg:     'bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-500/10',
    iconBox:    'bg-indigo-100 dark:bg-indigo-900/40',
    iconText:   'text-indigo-600 dark:text-indigo-400',
    titleText:  'text-indigo-900 dark:text-indigo-200',
    pillBg:     'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50',
    heroBg:     'bg-gradient-to-r from-indigo-500/10 via-indigo-50 to-white dark:from-indigo-900/30 dark:via-indigo-950/20 dark:to-zinc-900',
    heroBorder: 'border-indigo-200 dark:border-indigo-900/50',
    groupTitle: 'text-indigo-700 dark:text-indigo-400',
    badgeNew:   'bg-indigo-500 text-white',
  },
  red: {
    cardBorder: 'border-red-200 dark:border-red-900/50',
    cardBg:     'bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-zinc-900',
    cardHover:  'hover:border-red-300 hover:shadow-md hover:shadow-red-500/10',
    iconBox:    'bg-red-100 dark:bg-red-900/40',
    iconText:   'text-red-600 dark:text-red-400',
    titleText:  'text-red-900 dark:text-red-200',
    pillBg:     'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50',
    heroBg:     'bg-gradient-to-r from-red-500/10 via-red-50 to-white dark:from-red-900/30 dark:via-red-950/20 dark:to-zinc-900',
    heroBorder: 'border-red-200 dark:border-red-900/50',
    groupTitle: 'text-red-700 dark:text-red-400',
    badgeNew:   'bg-red-500 text-white',
  },
}

// ─── Module library — landing card grid ──────────────────────────────

function ModuleLibrary({ modules, isEn }: { modules: ModuleConfig[]; isEn: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        {isEn ? 'Modules in this guide' : 'หมวดในคู่มือ'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {modules.map(mod => (
          <ModuleCard key={mod.id} mod={mod} isEn={isEn} />
        ))}
      </div>
    </div>
  )
}

function ModuleCard({ mod, isEn }: { mod: ModuleConfig; isEn: boolean }) {
  const a = accentClasses[mod.accent]
  const Icon = mod.Icon
  const itemCount = mod.groups.reduce((sum, g) => sum + g.items.length, 0)
  const isComing = mod.comingSoon

  const inner = (
    <>
      <div className="flex items-start gap-3">
        <div className={`flex items-center justify-center h-10 w-10 rounded-xl shrink-0 ${a.iconBox}`}>
          <Icon className={`h-5 w-5 ${a.iconText}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-bold ${a.titleText}`}>
              {isEn ? mod.titleEn : mod.titleTh}
            </p>
            {mod.badge && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                mod.badge.tone === 'new' ? a.badgeNew : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
              }`}>
                {isEn ? mod.badge.en : mod.badge.th}
              </span>
            )}
            {isComing && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                {isEn ? 'COMING SOON' : 'เร็วๆ นี้'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
            {isEn ? mod.descEn : mod.descTh}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
          {itemCount} {isEn ? 'topics' : 'หัวข้อ'}
        </span>
        {!isComing && (
          <span className={`flex items-center gap-1 text-[10px] font-semibold ${a.iconText}`}>
            {isEn ? 'Read guide' : 'อ่านคู่มือ'}
            <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </>
  )

  if (isComing) {
    return (
      <div className={`rounded-xl border ${a.cardBorder} ${a.cardBg} p-4 opacity-60 cursor-not-allowed`}>
        {inner}
      </div>
    )
  }
  return (
    <Link
      href={`/howto/${mod.slug}`}
      className={`block rounded-xl border ${a.cardBorder} ${a.cardBg} ${a.cardHover} p-4 transition-all group`}
    >
      {inner}
    </Link>
  )
}

// ─── Module hero — colored top of each module section ────────────────

function ModuleHero({ mod, isEn, backHref }: { mod: ModuleConfig; isEn: boolean; backHref?: string }) {
  const a = accentClasses[mod.accent]
  const Icon = mod.Icon
  return (
    <div id={mod.id} className={`scroll-mt-6 rounded-2xl border ${a.heroBorder} ${a.heroBg} p-5 md:p-6`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center h-12 w-12 rounded-xl shrink-0 ${a.iconBox}`}>
            <Icon className={`h-6 w-6 ${a.iconText}`} />
          </div>
          <div>
            <h2 className={`text-xl md:text-2xl font-bold ${a.titleText}`}>
              {isEn ? mod.titleEn : mod.titleTh}
            </h2>
            <p className="text-xs md:text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
              {isEn ? mod.descEn : mod.descTh}
            </p>
          </div>
        </div>
        {backHref ? (
          <Link
            href={backHref}
            className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-white/40 dark:hover:bg-zinc-800/40 transition-colors shrink-0"
            title={isEn ? 'All guides' : 'คู่มือทั้งหมด'}
          >
            ← {isEn ? 'All guides' : 'คู่มือทั้งหมด'}
          </Link>
        ) : (
          <a
            href="#top"
            className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-2 py-1 rounded-md hover:bg-white/40 dark:hover:bg-zinc-800/40 transition-colors shrink-0"
            title={isEn ? 'Back to top' : 'กลับขึ้นบน'}
          >
            ↑ {isEn ? 'Top' : 'บน'}
          </a>
        )}
      </div>
    </div>
  )
}

// ─── In-module sub-TOC, grouped by category ──────────────────────────

function ModuleSubToc({ mod, isEn }: { mod: ModuleConfig; isEn: boolean }) {
  const a = accentClasses[mod.accent]
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
        {isEn ? 'Jump to' : 'ไปยัง'}
      </p>
      <div className="space-y-2.5">
        {mod.groups.map((g, gi) => (
          <div key={gi}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${a.groupTitle}`}>
              {isEn ? g.titleEn : g.titleTh}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {g.items.map(it => (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    className={`inline-flex items-center px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${a.pillBg}`}
                  >
                    {isEn ? it.titleEn : it.titleTh}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function MenuLink({ href, labelTh, labelEn }: { href: string; labelTh: string; labelEn: string }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-300 dark:hover:border-emerald-800 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 transition-colors group"
    >
      <div className="min-w-0">
        <code className="text-[10px] font-mono text-zinc-400">{href}</code>
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
          {isEn ? labelEn : labelTh}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-500 shrink-0 transition-colors" />
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Flowchart primitives
// ─────────────────────────────────────────────────────────────────────

type FlowVariant = 'start' | 'user' | 'admin' | 'decision' | 'success' | 'error' | 'terminal'

const flowVariantStyles: Record<FlowVariant, string> = {
  start:    'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200',
  user:     'bg-sky-50 dark:bg-sky-950/20 border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-200',
  admin:    'bg-purple-50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200',
  decision: 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200 border-dashed',
  success:  'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200',
  error:    'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-300',
  terminal: 'bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300',
}

function FlowchartBox({
  title, subtitle, color, children,
}: {
  title: string
  subtitle?: string
  color: 'sky' | 'amber' | 'purple' | 'rose'
  children: React.ReactNode
}) {
  const headerMap = {
    sky:    'bg-sky-600 text-white',
    amber:  'bg-amber-500 text-white',
    purple: 'bg-purple-600 text-white',
    rose:   'bg-rose-600 text-white',
  }
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className={`px-4 py-2.5 ${headerMap[color]}`}>
        <p className="text-sm font-bold">{title}</p>
        {subtitle && <p className="text-[11px] opacity-90 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4 md:p-6 flex flex-col items-center">
        {children}
      </div>
    </div>
  )
}

function FlowNode({
  variant, emoji, title, subtitle, tag, compact = false,
}: {
  variant: FlowVariant
  emoji?: string
  title: string
  subtitle?: string
  tag?: string
  compact?: boolean
}) {
  return (
    <div
      className={`
        ${compact ? 'w-full max-w-55' : 'min-w-60 max-w-90'}
        px-3 py-2.5 rounded-lg border-2 shadow-sm
        flex items-start gap-2
        ${flowVariantStyles[variant]}
      `}
    >
      {emoji && <span className="text-base leading-none mt-0.5 shrink-0">{emoji}</span>}
      <div className="min-w-0 flex-1">
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold leading-snug`}>{title}</p>
        {subtitle && (
          <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} opacity-75 mt-0.5 leading-snug`}>{subtitle}</p>
        )}
        {tag && (
          <code className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-mono bg-white/60 dark:bg-black/30 rounded">
            {tag}
          </code>
        )}
      </div>
    </div>
  )
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center my-1.5">
      <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600" />
      <ChevronDown className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 -mt-0.5" />
      {label && (
        <span className="mt-0.5 text-[10px] italic text-zinc-500 dark:text-zinc-400 text-center max-w-60">
          {label}
        </span>
      )}
    </div>
  )
}

function FlowLane({
  label, color, children,
}: {
  label: string
  color: 'emerald' | 'sky' | 'violet' | 'red' | 'cyan' | 'zinc'
  children: React.ReactNode
}) {
  const colorMap = {
    emerald: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/10',
    sky:     'border-sky-300 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/10',
    violet:  'border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/10',
    red:     'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/10',
    cyan:    'border-cyan-300 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/10',
    zinc:    'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40',
  }
  const pillMap = {
    emerald: 'bg-emerald-600',
    sky:     'bg-sky-600',
    violet:  'bg-violet-600',
    red:     'bg-red-600',
    cyan:    'bg-cyan-600',
    zinc:    'bg-zinc-600',
  }
  return (
    <div className={`relative rounded-lg border-2 border-dashed ${colorMap[color]} p-3 pt-5 flex flex-col items-center`}>
      <span className={`absolute -top-2.5 left-3 px-2 py-0.5 text-[10px] font-semibold text-white rounded-full ${pillMap[color]}`}>
        {label}
      </span>
      {children}
    </div>
  )
}

function LegendDot({ variant, label }: { variant: FlowVariant; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${flowVariantStyles[variant]}`} />
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
    </span>
  )
}
