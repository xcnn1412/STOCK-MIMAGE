'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Settings2, RefreshCw, Trophy, CheckCircle2,
  Banknote, Wallet, TrendingUp, Handshake, Package, Target,
  Timer, Flame, Filter, CalendarClock,
  Tag, CalendarDays, Percent, Eye, Info, Coins,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  buildHealth, fmt, isRevLead, leadAmount,
  claimEffective, claimDate, CLAIM_TYPE_LABEL,
  type PLLead, type PLClaim, type PLInstallment, type DealPL,
} from '../overview/pl/pl-lib'
import { saveMonthTargets } from './actions'

// บอร์ดนี้วัด "ผลงานทีมขาย" เป็น KPI → ตัวเลขฝั่งลีดอิงเดือนที่ "สร้างลีดใน CRM"
// (created_at) — ลีดสร้างเดือนไหน ผลงานนับเดือนนั้น ไม่อิงวันปิดดีลหรือวันจัดงาน
// ต่างจาก overview/P&L ที่อิงเดือนจัดงาน (event_date) ผ่าน default ของ buildHealth
const createdDate = (l: PLLead) => l.created_at
// ยกเว้นการ์ดเดียว: "ดีลที่ปิดได้" นับตามวันปิดดีลจริง (closed_at = status_change →
// accepted/success ครั้งแรก คำนวณใน page.tsx จาก crm_activities; ไม่มีประวัติใช้วันสร้างลีด)
const closedDate = (l: PLLead) => (l as { closed_at?: string | null }).closed_at || l.created_at

// ── ชนิดข้อมูลที่ page.tsx ส่งเข้ามา ──
type JobEvent = { id: string; linked_lead_id: string | null; event_date: string | null }
type CostItem = { job_event_id: string; amount: number | null }
type LeadWithPkg = PLLead & { package_name: string | null; work_type: string | null }

interface Props {
  leads: LeadWithPkg[]; claims: PLClaim[]; installments: PLInstallment[]
  jobEvents: JobEvent[]; costItems: CostItem[]
  initialTargets: TargetStore
  packageLabels: Record<string, string>  // package_name → ชื่อ "ระบบที่ใช้บริการ"
}

// ── helper วันที่/เดือน (พ.ศ.) ──
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${TH_MONTHS[mo - 1]} ${y + 543}` }
const addMonth = (m: string, delta: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const inMonth = (d: string | null, m: string) => !!d && d.slice(0, 7) === m

// ── จานสี (literal class ทั้งหมด — JIT ของ Tailwind อ่าน dynamic string ไม่ได้) ──
const COLORS: Record<string, { tint: string; text: string; chip: string; bar: string; border: string; glow: string }> = {
  emerald: { tint: 'from-emerald-100 to-emerald-50/40 dark:from-emerald-950/50 dark:to-zinc-900', text: 'text-emerald-700 dark:text-emerald-300', chip: 'bg-emerald-500 text-white', bar: 'bg-emerald-500', border: 'border-emerald-300 dark:border-emerald-800', glow: 'shadow-emerald-500/20' },
  sky: { tint: 'from-sky-100 to-sky-50/40 dark:from-sky-950/50 dark:to-zinc-900', text: 'text-sky-700 dark:text-sky-300', chip: 'bg-sky-500 text-white', bar: 'bg-sky-500', border: 'border-sky-300 dark:border-sky-800', glow: 'shadow-sky-500/20' },
  rose: { tint: 'from-rose-100 to-rose-50/40 dark:from-rose-950/50 dark:to-zinc-900', text: 'text-rose-700 dark:text-rose-300', chip: 'bg-rose-500 text-white', bar: 'bg-rose-500', border: 'border-rose-300 dark:border-rose-800', glow: 'shadow-rose-500/20' },
  violet: { tint: 'from-violet-100 to-violet-50/40 dark:from-violet-950/50 dark:to-zinc-900', text: 'text-violet-700 dark:text-violet-300', chip: 'bg-violet-500 text-white', bar: 'bg-violet-500', border: 'border-violet-300 dark:border-violet-800', glow: 'shadow-violet-500/20' },
  amber: { tint: 'from-amber-100 to-amber-50/40 dark:from-amber-950/50 dark:to-zinc-900', text: 'text-amber-700 dark:text-amber-300', chip: 'bg-amber-500 text-white', bar: 'bg-amber-500', border: 'border-amber-300 dark:border-amber-800', glow: 'shadow-amber-500/20' },
  cyan: { tint: 'from-cyan-100 to-cyan-50/40 dark:from-cyan-950/50 dark:to-zinc-900', text: 'text-cyan-700 dark:text-cyan-300', chip: 'bg-cyan-500 text-white', bar: 'bg-cyan-500', border: 'border-cyan-300 dark:border-cyan-800', glow: 'shadow-cyan-500/20' },
  orange: { tint: 'from-orange-100 to-orange-50/40 dark:from-orange-950/50 dark:to-zinc-900', text: 'text-orange-700 dark:text-orange-300', chip: 'bg-orange-500 text-white', bar: 'bg-orange-500', border: 'border-orange-300 dark:border-orange-800', glow: 'shadow-orange-500/20' },
  teal: { tint: 'from-teal-100 to-teal-50/40 dark:from-teal-950/50 dark:to-zinc-900', text: 'text-teal-700 dark:text-teal-300', chip: 'bg-teal-500 text-white', bar: 'bg-teal-500', border: 'border-teal-300 dark:border-teal-800', glow: 'shadow-teal-500/20' },
}

// ระบบที่ใช้บริการ = สินค้า/บริการที่ขายจริง (CRM package_name → ชื่อจาก crm_settings)
const PKG_LABEL: Record<string, string> = { basic: 'Basic', standard: 'Standard', premium: 'Premium', premium_video: 'Premium Video', custom: 'Custom' }
const pkgLabel = (p: string, labels: Record<string, string>) =>
  p ? (labels[p] || PKG_LABEL[p] || p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())) : 'ไม่ระบุระบบ'

// ── นิยาม metric (แต่ละตัวตั้งเป้าได้) ──
type MetricKey = 'sales' | 'revenue' | 'inflow' | 'expense' | 'deals'
interface MetricDef { key: MetricKey; label: string; sub: string; money: boolean; invert?: boolean; noTarget?: boolean; icon: typeof Target; color: string }
const METRICS: MetricDef[] = [
  { key: 'sales', label: 'ยอดขาย', sub: 'มูลค่าดีลจากลีดเดือนนี้', money: true, icon: TrendingUp, color: 'emerald' },
  { key: 'revenue', label: 'เก็บเงินแล้ว', sub: 'ยอดเก็บของดีลเดือนนี้ เทียบยอดต้องเก็บ', money: true, icon: Banknote, color: 'sky' },
  // เงินเข้าเดือนนี้ = งวดที่ชำระจริง (paid_date) ในเดือน — นับทุกดีลไม่สนสถานะ/เดือนที่สร้างลีด
  // ต่างจาก "เก็บเงินแล้ว" ที่เป็นเงินสะสมของดีลจากลีดเดือนนี้ (ไม่รวมมัดจำ เพราะมัดจำไม่มีวันที่)
  { key: 'inflow', label: 'เงินเข้าเดือนนี้', sub: 'งวดที่ชำระจริงในเดือน ทุกดีล (ไม่รวมมัดจำ)', money: true, noTarget: true, icon: Coins, color: 'teal' },
  { key: 'expense', label: 'รายจ่าย', sub: 'ใบเบิกทั้งหมด (ยิ่งต่ำยิ่งดี)', money: true, invert: true, icon: Wallet, color: 'rose' },
  { key: 'deals', label: 'ดีลที่ปิดได้', sub: 'นับตามวันที่ปิดดีลจริง', money: false, icon: Handshake, color: 'amber' },
]

// เป้า auto (คิดจากค่าจริง ไม่ต้องตั้งเองใน dialog): เก็บเงินแล้ว, เงินเข้า, รายจ่าย
const AUTO_TARGET_KEYS: MetricKey[] = ['revenue', 'inflow', 'expense']

// ── คำอธิบายเกณฑ์การนับของแต่ละการ์ด (แสดงใน icon ℹ) — ต้องตรงกับสูตรจริงเสมอ ──
const CREATED_BASIS = 'นับตามเดือนที่สร้างลีดใน CRM (ใช้เป็น KPI ทีมขาย) — ลีดสร้างเดือนไหน ผลงานนับเดือนนั้น ไม่อิงวันปิดดีลหรือวันจัดงาน'
const LEAD_RULE = `นับดีลจาก CRM ที่สถานะ "ตอบรับ" หรือ "สำเร็จ" และมีมูลค่ามากกว่า 0 — ใช้ราคายืนยัน (ถ้าไม่มีใช้ราคาเสนอ) · ${CREATED_BASIS}`
const INFO: Record<string, string> = {
  sales: `${LEAD_RULE} · ยอดที่แสดง = ราคาเต็มตามที่ตกลง (รวม VAT ถ้ามี)`,
  deals: 'นับดีลสถานะ "ตอบรับ" หรือ "สำเร็จ" ที่มูลค่ามากกว่า 0 ตาม "วันที่ปิดดีลจริง" (วันแรกที่สถานะเปลี่ยนเป็น ตอบรับ/สำเร็จ จากประวัติใน CRM; ดีลที่ไม่มีประวัติใช้วันสร้างลีด) — ดีลจากลีดเดือนก่อนที่เพิ่งปิดได้เดือนนี้ก็นับ · เป็นการ์ดเดียวบนบอร์ดที่ใช้วันปิดดีล การ์ดอื่นนับตามเดือนสร้างลีด · บรรทัดย่อยแยกให้ว่ามาจากลีดเดือนนี้กี่ดีล ลีดเดือนก่อนหน้ากี่ดีล',
  revenue: `เงินที่เก็บได้ของดีลชุดเดียวกับการ์ดยอดขาย (${CREATED_BASIS}) = มัดจำ + งวดที่บันทึกว่าจ่ายแล้วทุกเดือน ไม่เกินยอดสุทธิของแต่ละดีล · เป้า = ยอดที่ต้องเก็บสุทธิ ซึ่งไม่เท่ายอดขายตรงๆ เพราะ "ยอดขาย + VAT ที่ต้องเรียกเก็บเพิ่ม (ดีลที่ตั้งราคาไม่รวม VAT) − ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักนำส่งเอง" ตามบรรทัดสรุปในการ์ด · ต่างจากการ์ด "เงินเข้าเดือนนี้" ที่นับตามวันที่เงินเข้าจริง ไม่ว่าลีดจะสร้างเดือนไหน`,
  inflow: 'เงินที่เข้าจริงในเดือนที่เลือก = Σ งวดชำระที่ติ๊กว่าจ่ายแล้วและมีวันที่ชำระอยู่ในเดือนนี้ — นับทุกดีลทุกสถานะ · ไม่รวมมัดจำ (ระบบไม่ได้เก็บวันที่รับมัดจำ) · แตกเป็น 2 ก้อนตามเดือนที่สร้างลีดใน CRM: "จากลีดที่สร้างเดือนนี้" + "จากลีดเดือนก่อนหน้า" (เงินตามเก็บ)',
  inflowPrev: 'งวดที่ชำระในเดือนนี้ของลีด CRM ที่สร้างไว้ตั้งแต่เดือนก่อนหน้า — เงินตามเก็บ/งวดค้างจ่ายที่เพิ่งเข้าจริงเดือนนี้ นับทุกสถานะดีล (รวมดีลที่ถูกเปลี่ยนสถานะ เช่น รายรับเงินสดย่อย Office)',
  expense: 'ใบเบิกทุกประเภท (งานอีเวนต์ / office-อื่นๆ / เงินทดลองจ่าย) ที่ไม่ถูกปฏิเสธ/ยกเลิก จัดเข้าเดือนตามวันที่ใช้จ่าย (ถ้าไม่มีใช้วันสร้างใบ) · เงินทดลองจ่ายที่เคลียร์คืนแล้วนับตามยอดใช้จริง · แสดงยอดเต็มตามใบเบิก (รวม VAT)',
  workType: `${LEAD_RULE} · นับเฉพาะดีลที่ระบุประเภทงานนี้ — ดีลที่ไม่ระบุประเภทงานแสดงในหมายเหตุใต้การ์ด`,
  pace: 'เฉลี่ยยอดสะสมและเป้าเป็นรายวัน/สัปดาห์ บนฐานจำนวนวันทั้งเดือน · "ต้องทำวันละ" = ยอดที่ยังขาดหารด้วยจำนวนวันที่เหลือถึงสิ้นเดือน',
  funnel: `นับลีดที่สร้างในเดือนนี้แบบสะสมตามขั้น — ${CREATED_BASIS} · ลูกค้าใหม่ = ลีดที่สร้างเดือนนี้ทั้งหมดทุกสถานะ · ส่งใบเสนอราคา = ถึงขั้นส่งใบเสนอหรือไกลกว่า · ปิดการขาย = ตอบรับ/สำเร็จ (เฉพาะลีดเดือนนี้ — ต่างจากการ์ดดีลที่ปิดได้ซึ่งนับตามวันปิด) · เสียดีล = ปฏิเสธ/ยกเลิก · อัตราปิดการขาย = ปิดได้ ÷ ลีดทั้งหมด`,
  due: 'งวดชำระที่ยังไม่จ่าย และถึงกำหนดภายใน 14 วันหรือเลยกำหนดแล้ว — ดูล่วงหน้าทุกเดือน ไม่ผูกกับเดือนที่เลือก · ไม่รวมดีลที่ปฏิเสธ/ยกเลิก',
  products: 'นับจำนวนดีลชุดเดียวกับการ์ดยอดขาย แยกตามระบบที่ใช้บริการ (แพ็กเกจ) · คอลัมน์สะสม = นับทุกเดือนรวมกัน',
}

// ── ประเภทงาน (work_type) — ตั้งเป้า/แสดงยอดแยกได้ ──
type WorkTypeTargetKey = 'wt_sale' | 'wt_event' | 'wt_gp'
interface WorkTypeDef { key: WorkTypeTargetKey; wt: string; label: string; color: string; icon: typeof Target }
const WORK_TYPES: WorkTypeDef[] = [
  { key: 'wt_sale', wt: 'sale', label: 'ขาย', color: 'violet', icon: Tag },
  { key: 'wt_event', wt: 'event', label: 'อีเวนต์', color: 'cyan', icon: CalendarDays },
  { key: 'wt_gp', wt: 'gp', label: 'GP', color: 'orange', icon: Percent },
]
// work_type → ป้ายภาษาไทย (ใช้ในตาราง viewer)
const WT_LABEL: Record<string, string> = { sale: 'ขาย', event: 'อีเวนต์', gp: 'GP' }

// ฐานเทียบงบรายจ่าย
type ExpenseBase = 'sales' | 'revenue'
const EXPENSE_BASE_KEY = 'sales-board-expense-base'

// ── ลำดับกรวยขาย (สะสม — นับตามสถานะที่ถึงขั้นนั้น "หรือไกลกว่า"; keys=null = ทุกสถานะ) ──
// ลูกค้าใหม่ = ลีดทั้งหมดที่สร้างเดือนนี้ · ส่งใบเสนอราคา ⊇ ปิดการขาย → conversion ≤ 100% เสมอ
const FUNNEL_STAGES: { keys: string[] | null; label: string; color: string }[] = [
  { keys: null, label: 'ลูกค้าใหม่', color: 'bg-blue-500' },
  { keys: ['quotation_sent', 'accepted', 'success'], label: 'ส่งใบเสนอราคา', color: 'bg-amber-500' },
  { keys: ['accepted', 'success'], label: 'ปิดการขาย', color: 'bg-emerald-600' },
]

type Targets = Partial<Record<MetricKey | WorkTypeTargetKey, number>>
type TargetStore = Record<string, Targets>

// ── โมเดลตาราง "ดูรายการ" ของแต่ละการ์ด (viewer) ──
type ViewerColumn = { label: string; align?: 'right' }
type ViewerRow = { href: string; cells: ReactNode[] }
type ViewerModel = { title: string; columns: ViewerColumn[]; rows: ViewerRow[]; footer: (ReactNode | null)[] }
const bahtCell = (n: number) => `฿${fmt(n)}`

export default function SalesBoardView(props: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [month, setMonth] = useState(curMonth)
  // เป้าใช้ร่วมกันทั้งองค์กร — มาจาก DB ผ่าน props, ตั้งใหม่ = บันทึกลง DB แล้ว router.refresh()
  const store = props.initialTargets
  const [editorOpen, setEditorOpen] = useState(false)
  const [viewer, setViewer] = useState<string | null>(null) // การ์ดที่กำลังเปิดดูรายการ
  const [updatedAt, setUpdatedAt] = useState('')
  const [expenseBase, setExpenseBase] = useState<ExpenseBase>('sales')

  // client-only gate → เลี่ยง hydration mismatch จาก new Date()/localStorage
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- ตั้งค่าเริ่มต้นหลัง mount */
    setMounted(true)
    setUpdatedAt(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
    const b = localStorage.getItem(EXPENSE_BASE_KEY)
    if (b === 'sales' || b === 'revenue') setExpenseBase(b)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const changeExpenseBase = (b: ExpenseBase) => {
    setExpenseBase(b)
    try { localStorage.setItem(EXPENSE_BASE_KEY, b) } catch { /* localStorage ปิดอยู่ */ }
  }

  // รีเฟรชข้อมูลอัตโนมัติทุก 60 วิ (หยุดตอนแก้เป้า) — สำหรับจอ monitor
  useEffect(() => {
    if (editorOpen) return
    const id = setInterval(() => {
      router.refresh()
      setUpdatedAt(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
    }, 60_000)
    return () => clearInterval(id)
  }, [editorOpen, router])

  const targets = store[month] || {}

  // รายจ่ายจริงของเดือน = Σ ใบเบิกที่ไม่ถูก reject/cancel (เงินออกจริง หลังรวม VAT/หัก ณ ที่จ่าย)
  //   ต่างจาก h.totalCost ซึ่งเป็นฐานก่อน VAT — ป้ายการ์ดคือ "ใบเบิกทั้งหมด" จึงต้องใช้ยอดเต็ม
  const monthClaims = (m: string) => props.claims.filter((c) =>
    c.status !== 'rejected' && c.status !== 'cancelled' && inMonth(claimDate(c), m) && claimEffective(c) > 0)
  const expenseOf = (list: PLClaim[]) => list.reduce((s, c) => s + claimEffective(c), 0)

  // เงินเข้าจริงของเดือน = งวดที่ชำระแล้ว (paid_date อยู่ในเดือน) — ทุกดีลทุกสถานะ
  const paidInMonth = (m: string) => props.installments.filter((i) => i.is_paid && inMonth(i.paid_date, m) && Number(i.amount) > 0)
  const inflowOf = (list: PLInstallment[]) => list.reduce((s, i) => s + Number(i.amount || 0), 0)

  // ดีลที่ปิดได้ตามวันปิดจริงของเดือน m (การ์ดเดียวที่ใช้ closedDate)
  const closedDealsOf = (m: string) =>
    props.leads.filter((l) => isRevLead(l) && leadAmount(l) > 0 && inMonth(closedDate(l), m))

  // ── สุขภาพการเงิน + รายการใบเบิก/งวดที่เข้าของเดือนที่เลือก (ใช้ทั้งค่าการ์ดและ viewer) ──
  // h = ฐานเดือนที่สร้างลีด (createdDate) — ยอดขาย และเก็บเงินแล้ว/ยอดต้องเก็บ เป็นชุดดีล
  // เดียวกันตาม KPI ทีมขาย · การ์ดดีลที่ปิดได้ใช้ closedDeals (วันปิดจริง) แยกต่างหาก
  const cur = useMemo(() => {
    const range = (d: string | null) => inMonth(d, month)
    const h = buildHealth(props.leads, props.claims, props.installments, props.jobEvents, props.costItems, range, createdDate)
    const expClaims = monthClaims(month)
    const inflowIns = paidInMonth(month)
    // แตกเงินเข้าเป็น 2 ก้อนตามเดือนที่สร้างลีด: ลีดเดือนนี้ vs ลีดเดือนก่อนหน้า (เงินตามเก็บ)
    const newLeadIds = new Set(props.leads.filter((l) => inMonth(l.created_at, month)).map((l) => l.id))
    const inflowInsPrev = inflowIns.filter((i) => !newLeadIds.has(i.lead_id))
    const closedDeals = closedDealsOf(month)
    const closedFromThisMonth = closedDeals.filter((l) => inMonth(l.created_at, month)).length
    return {
      h, expClaims, expense: expenseOf(expClaims), inflowIns, inflow: inflowOf(inflowIns), inflowInsPrev, inflowPrev: inflowOf(inflowInsPrev),
      closedDeals, closedFromThisMonth,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monthClaims/expenseOf/paidInMonth/closedDealsOf เป็น pure จาก props+month
  }, [props, month])

  // ── คำนวณค่าจริงของเดือนที่เลือก (revenue เทียบ "ยอดที่ต้องเก็บ" = collectible ชุดเดียวกัน) ──
  const values = useMemo<Record<MetricKey, number> & { collectible: number }>(() => ({
    sales: cur.h.bookedGross, revenue: cur.h.cashCollected, inflow: cur.inflow, expense: cur.expense, deals: cur.closedDeals.length, collectible: cur.h.collectible,
  }), [cur])

  // ── ค่าจริงของ "เดือนก่อน" (ไว้เทียบ MoM) ──
  const prevValues = useMemo<Record<MetricKey, number> & { collectible: number }>(() => {
    const pm = addMonth(month, -1)
    const range = (d: string | null) => inMonth(d, pm)
    const h = buildHealth(props.leads, props.claims, props.installments, props.jobEvents, props.costItems, range, createdDate)
    return { sales: h.bookedGross, revenue: h.cashCollected, inflow: inflowOf(paidInMonth(pm)), expense: expenseOf(monthClaims(pm)), deals: closedDealsOf(pm).length, collectible: h.collectible }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monthClaims/expenseOf/closedDealsOf เป็น pure จาก props+month
  }, [props, month])

  // ── กรวยขาย: ลีดที่ "สร้าง" ในเดือนนี้ (created_at) นับสะสมตามขั้น ──
  //    ทุกขั้นนับจากชุดลีดเดียวกัน → conversion ≤ 100% เสมอ (ต่างจากการ์ดดีลที่ปิดได้ซึ่งนับตามวันปิด)
  const funnel = useMemo(() => {
    const monthLeads = props.leads.filter((l) => inMonth(createdDate(l), month))
    const hit = (keys: string[] | null, s: string) => keys === null || keys.includes(s)
    const stages = FUNNEL_STAGES.map((st) => ({
      label: st.label, color: st.color,
      count: monthLeads.filter((l) => hit(st.keys, (l.status || '').toLowerCase())).length,
    }))
    const lost = monthLeads.filter((l) => { const s = (l.status || '').toLowerCase(); return s === 'rejected' || s === 'cancelled' }).length
    const top = Math.max(1, ...stages.map((s) => s.count))
    return { stages, top, lost }
  }, [props.leads, month])

  // ── งวดที่ครบ/เลยกำหนด (ไปข้างหน้า ไม่ผูกกับเดือนที่เลือก) — to-do ตามเก็บเงิน ──
  const dueList = useMemo(() => {
    const nameOf = new Map(props.leads.map((l) => [l.id, l.customer_name || '(ไม่ระบุชื่อ)']))
    // ลีดที่ยกเลิก/ไม่ปิดการขายแล้ว ไม่ต้องตามเก็บเงิน
    const dead = new Set(props.leads.filter((l) => {
      const s = (l.status || '').toLowerCase(); return s === 'rejected' || s === 'cancelled'
    }).map((l) => l.id))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const rows: { name: string; due: string; amount: number; days: number }[] = []
    for (const i of props.installments) {
      if (i.is_paid || !i.due_date || !(Number(i.amount) > 0) || dead.has(i.lead_id)) continue
      const days = Math.round((new Date(i.due_date).getTime() - today.getTime()) / 86_400_000)
      if (days > 14) continue // แสดงเฉพาะเลยกำหนด + ครบภายใน 14 วัน
      rows.push({ name: nameOf.get(i.lead_id) || '—', due: i.due_date, amount: Number(i.amount), days })
    }
    rows.sort((a, b) => a.days - b.days)
    const overdueAmt = rows.filter((r) => r.days < 0).reduce((s, r) => s + r.amount, 0)
    return { rows, overdueAmt, overdueCount: rows.filter((r) => r.days < 0).length }
  }, [props.installments, props.leads])

  // ── ระบบที่ใช้บริการ (package_name): ขายได้เดือนนี้ + สะสมทั้งหมด, เรียงตามขายได้เดือนนี้ ──
  const products = useMemo(() => {
    const agg = new Map<string, { key: string; name: string; month: number; total: number }>()
    for (const l of props.leads) {
      if (!isRevLead(l) || leadAmount(l) <= 0) continue
      const key = l.package_name || ''
      const g = agg.get(key) || { key, name: pkgLabel(key, props.packageLabels), month: 0, total: 0 }
      g.total++
      if (inMonth(createdDate(l), month)) g.month++
      agg.set(key, g)
    }
    return [...agg.values()].sort((a, b) => b.month - a.month || b.total - a.total)
  }, [props.leads, props.packageLabels, month])

  // ── เทรนด์ยอดขาย 6 เดือนล่าสุด (จบที่เดือนที่เลือก) ──
  const trend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => addMonth(month, i - 5))
    return months.map((m) => {
      let amount = 0
      for (const l of props.leads) if (isRevLead(l) && inMonth(createdDate(l), m) && leadAmount(l) > 0) amount += leadAmount(l)
      return { month: m, amount }
    })
  }, [props.leads, month])

  // ── ยอด/ดีล แยกตามประเภทงาน ของเดือนที่เลือก ──
  const workTypeStats = useMemo(() => {
    const stat: Record<string, { amount: number; deals: number }> = {}
    for (const w of WORK_TYPES) stat[w.wt] = { amount: 0, deals: 0 }
    let unspecAmount = 0, unspecDeals = 0
    for (const l of props.leads) {
      if (!isRevLead(l) || leadAmount(l) <= 0 || !inMonth(createdDate(l), month)) continue
      const wt = l.work_type
      if (wt && stat[wt]) { stat[wt].amount += leadAmount(l); stat[wt].deals++ }
      else { unspecAmount += leadAmount(l); unspecDeals++ }
    }
    return { stat, unspecAmount, unspecDeals }
  }, [props.leads, month])

  // ── เทรนด์ 6 เดือน แยกตามประเภทงาน (จบที่เดือนที่เลือก) ──
  const wtTrend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => addMonth(month, i - 5))
    const result: Record<string, { month: string; amount: number }[]> = {}
    for (const w of WORK_TYPES) {
      result[w.wt] = months.map((m) => {
        let amount = 0
        for (const l of props.leads) if (l.work_type === w.wt && isRevLead(l) && inMonth(createdDate(l), m) && leadAmount(l) > 0) amount += leadAmount(l)
        return { month: m, amount }
      })
    }
    return result
  }, [props.leads, month])

  // ── รายการเบื้องหลังตัวเลขการ์ด (viewer) — สร้างจากชุดข้อมูลเดียวกับที่คิดเป็นยอดการ์ด ──
  const viewerModel = useMemo<ViewerModel | null>(() => {
    if (!viewer) return null
    const ml = monthLabel(month)

    // การ์ดฝั่งลีด (ยอดขาย / ดีลที่ปิดได้ / ประเภทงาน) — rev leads ของเดือน, leadAmount>0
    // กรองด้วย createdDate ตัวเดียวกับที่คิดยอดการ์ด → รายการในตารางตรงกับตัวเลขบนการ์ดเสมอ
    const leadModel = (label: string, wt?: string): ViewerModel => {
      const ls = props.leads
        .filter((l) => isRevLead(l) && leadAmount(l) > 0 && inMonth(createdDate(l), month) && (!wt || l.work_type === wt))
        .sort((a, b) => leadAmount(b) - leadAmount(a))
      const total = ls.reduce((s, l) => s + leadAmount(l), 0)
      return {
        title: `${label} — ${ml}`,
        columns: [{ label: 'ลูกค้า' }, { label: 'สร้างลีดเมื่อ' }, { label: 'ประเภทงาน' }, { label: 'ระบบ' }, { label: 'สถานะ' }, { label: 'ยอด', align: 'right' }],
        rows: ls.map((l) => ({
          href: `/crm/${l.id}`,
          cells: [l.customer_name || '(ไม่ระบุชื่อ)', (createdDate(l) || '').slice(0, 10), WT_LABEL[l.work_type || ''] || 'ไม่ระบุ', pkgLabel(l.package_name || '', props.packageLabels), l.status || '—', bahtCell(leadAmount(l))],
        })),
        footer: ['รวม', null, null, null, null, bahtCell(total)],
      }
    }

    if (viewer === 'sales') return leadModel('ยอดขาย')
    const wtDef = WORK_TYPES.find((w) => w.key === viewer)
    if (wtDef) return leadModel(wtDef.label, wtDef.wt)

    // ดีลที่ปิดได้ — การ์ดเดียวที่ใช้วันปิดดีลจริง (closedDate) ไม่ใช่เดือนสร้างลีด
    if (viewer === 'deals') {
      const ls = [...cur.closedDeals].sort((a, b) => (closedDate(b) || '').localeCompare(closedDate(a) || ''))
      return {
        title: `ดีลที่ปิดได้ — ${ml}`,
        columns: [{ label: 'ลูกค้า' }, { label: 'วันปิดดีล' }, { label: 'สร้างลีดเมื่อ' }, { label: 'ประเภทงาน' }, { label: 'สถานะ' }, { label: 'ยอด', align: 'right' }],
        rows: ls.map((l) => ({
          href: `/crm/${l.id}`,
          cells: [l.customer_name || '(ไม่ระบุชื่อ)', (closedDate(l) || '').slice(0, 10), (l.created_at || '').slice(0, 10), WT_LABEL[l.work_type || ''] || 'ไม่ระบุ', l.status || '—', bahtCell(leadAmount(l))],
        })),
        footer: [`รวม ${ls.length} ดีล`, null, null, null, null, bahtCell(ls.reduce((s, l) => s + leadAmount(l), 0))],
      }
    }

    if (viewer === 'revenue') {
      // ดีลชุดเดียวกับการ์ดยอดขาย (ฐานเดือนที่สร้างลีด) — เรียงคงค้างมาก→น้อย เป็นลิสต์ไล่เก็บเงิน
      const leadOf = new Map(props.leads.map((l) => [l.id, l]))
      const dayOf = (id: string, f: (l: LeadWithPkg) => string | null) => {
        const l = leadOf.get(id); return l ? (f(l) || '').slice(0, 10) || '—' : '—'
      }
      const deals: DealPL[] = [...cur.h.deals].sort((a, b) => b.outstanding - a.outstanding)
      return {
        title: `เก็บเงินแล้ว — ${ml}`,
        columns: [{ label: 'ลูกค้า' }, { label: 'สร้างลีดเมื่อ' }, { label: 'วันงาน' }, { label: 'ยอดที่ต้องเก็บ', align: 'right' }, { label: 'เก็บแล้ว', align: 'right' }, { label: 'คงค้าง', align: 'right' }],
        rows: deals.map((d) => ({
          href: `/crm/${d.leadId}`,
          cells: [d.name, dayOf(d.leadId, createdDate), dayOf(d.leadId, (l) => l.event_date), bahtCell(d.receivable), bahtCell(d.paid), bahtCell(d.outstanding)],
        })),
        footer: ['รวม', null, null, bahtCell(cur.h.collectible), bahtCell(cur.h.cashCollected), bahtCell(cur.h.ar)],
      }
    }

    if (viewer === 'expense') {
      const cs = [...cur.expClaims].sort((a, b) => claimEffective(b) - claimEffective(a))
      return {
        title: `รายจ่าย — ${ml}`,
        columns: [{ label: 'รายการ' }, { label: 'ประเภท' }, { label: 'วันที่' }, { label: 'สถานะ' }, { label: 'จำนวน', align: 'right' }],
        rows: cs.map((c) => ({
          href: `/finance/${c.id}`,
          cells: [
            c.category || CLAIM_TYPE_LABEL[c.claim_type || ''] || c.claim_type || 'รายจ่าย',
            CLAIM_TYPE_LABEL[c.claim_type || ''] || c.claim_type || '—',
            (claimDate(c) || '').slice(0, 10), c.status || '—', bahtCell(claimEffective(c)),
          ],
        })),
        footer: ['รวม', null, null, null, bahtCell(cur.expense)],
      }
    }

    if (viewer === 'inflow' || viewer === 'inflowPrev') {
      const prevOnly = viewer === 'inflowPrev'
      const leadOf = new Map(props.leads.map((l) => [l.id, l]))
      const ins = [...(prevOnly ? cur.inflowInsPrev : cur.inflowIns)].sort((a, b) => (b.paid_date || '').localeCompare(a.paid_date || ''))
      return {
        title: `${prevOnly ? 'เงินเข้าจากลีดเดือนก่อนหน้า' : 'เงินเข้าเดือนนี้'} — ${ml}`,
        columns: [{ label: 'ลูกค้า' }, { label: 'สร้างลีดเมื่อ' }, { label: 'สถานะดีล' }, { label: 'วันที่ชำระ' }, { label: 'จำนวน', align: 'right' }],
        rows: ins.map((i) => {
          const l = leadOf.get(i.lead_id)
          return {
            href: `/crm/${i.lead_id}`,
            cells: [
              l?.customer_name || '(ไม่ระบุชื่อ)',
              (l?.created_at || '').slice(0, 10) || '—',
              l?.status || '—',
              (i.paid_date || '').slice(0, 10),
              bahtCell(Number(i.amount || 0)),
            ],
          }
        }),
        footer: ['รวม', null, null, null, bahtCell(prevOnly ? cur.inflowPrev : cur.inflow)],
      }
    }
    return null
  }, [viewer, month, props.leads, props.packageLabels, cur])

  if (!mounted) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">กำลังโหลดสรุปยอดขาย…</div>
  }

  const saveTargets = async (next: Targets) => {
    await saveMonthTargets(month, next as Record<string, number>)
    router.refresh()
  }

  const trendMax = Math.max(1, ...trend.map((t) => t.amount))

  return (
    <div className="mx-auto flex max-w-[1900px] flex-col gap-2.5 xl:h-[calc(100vh-3rem)] xl:overflow-hidden">
      {/* ── หัวเรื่อง + ตัวเลือกเดือน ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-500" />
          <div>
            <h1 className="text-xl font-bold leading-tight tracking-tight md:text-2xl">สรุปยอดขาย</h1>
            <p className="text-xs text-muted-foreground">
              ผลงานนับตามเดือนที่สร้างลีด (KPI ทีมขาย) · เงินเข้า/รายจ่ายนับตามวันที่เงินเข้า-ใช้จ่ายจริง
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            LIVE · {updatedAt}
          </span>
          <div className="flex items-center rounded-lg border bg-card">
            <Button variant="ghost" size="icon" onClick={() => setMonth(addMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[140px] text-center text-sm font-semibold">{monthLabel(month)}</span>
            <Button variant="ghost" size="icon" onClick={() => setMonth(addMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {month !== curMonth() && <Button variant="outline" size="sm" onClick={() => setMonth(curMonth())}>เดือนนี้</Button>}
          <Button variant="ghost" size="icon" onClick={() => router.refresh()} title="รีเฟรช"><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => setEditorOpen(true)}><Settings2 className="mr-1.5 h-4 w-4" /> ตั้งเป้า</Button>
        </div>
      </div>

      {/* ── นับถอยหลัง + HERO ยอดขาย (คู่กันเพื่อประหยัดความสูง) ── */}
      <div className="grid shrink-0 grid-cols-1 gap-2.5 lg:grid-cols-[1fr_1.6fr]">
        <Countdown />
        <HeroCard value={values.sales} prev={prevValues.sales} target={targets.sales} trend={trend} trendMax={trendMax} onView={() => setViewer('sales')} />
      </div>

      {/* ── การ์ดตามประเภทงาน (ขาย/อีเวนต์/GP) ── */}
      <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-3">
        {WORK_TYPES.map((w) => (
          <WorkTypeCard key={w.key} def={w}
            amount={workTypeStats.stat[w.wt].amount} deals={workTypeStats.stat[w.wt].deals}
            target={targets[w.key]} trend={wtTrend[w.wt]} onSetTarget={() => setEditorOpen(true)}
            onView={() => setViewer(w.key)} />
        ))}
      </div>
      {workTypeStats.unspecDeals > 0 && (
        <p className="-mt-1 shrink-0 text-[11px] text-muted-foreground">
          * ไม่ระบุประเภทงาน: {fmtDeal(workTypeStats.unspecDeals)} ดีล · ฿{fmt(workTypeStats.unspecAmount)}
        </p>
      )}

      {/* ── การ์ด metric ที่เหลือ ── */}
      <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.filter((m) => m.key !== 'sales').map((m) => (
          <MetricCard key={m.key} def={m} value={values[m.key]} prev={prevValues[m.key]}
            target={m.key === 'revenue' ? values.collectible
              : m.key === 'expense' ? (expenseBase === 'sales' ? values.sales : values.revenue)
              : targets[m.key]}
            baseToggle={m.key === 'expense' ? <ExpenseBaseToggle value={expenseBase} onChange={changeExpenseBase} /> : undefined}
            onSetTarget={() => setEditorOpen(true)} onView={() => setViewer(m.key)}
            extra={m.key === 'inflow' ? (
              // แตกยอดในการ์ด: ก้อนที่ซ้ำกับ "เก็บเงินแล้ว" vs เงินตามเก็บจากดีลเดือนก่อน (มี ℹ/👁 ของตัวเอง)
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-muted-foreground">จากลีดที่สร้างเดือนนี้</span>
                  <span className="font-bold tabular-nums">฿{fmt(cur.inflow - cur.inflowPrev)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-0.5 font-medium text-muted-foreground">
                    จากลีดเดือนก่อนหน้า
                    <InfoTip text={INFO.inflowPrev} />
                    <EyeButton onClick={() => setViewer('inflowPrev')} />
                  </span>
                  <span className="font-bold tabular-nums">฿{fmt(cur.inflowPrev)}</span>
                </div>
              </div>
            ) : m.key === 'revenue' ? (
              // ที่มาของ "ยอดที่ต้องเก็บ" — กัน user งงว่าทำไมไม่เท่ายอดขาย (ขาย+อีเวนต์+GP)
              // vat ที่เรียกเก็บเพิ่ม = Σ totalWithVat − Σ ราคาเต็ม = collectible + wht − bookedGross
              <div className="mt-3 space-y-0.5 text-xs">
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span>ยอดขาย (ราคาเต็ม)</span><span className="tabular-nums">฿{fmt(cur.h.bookedGross)}</span>
                </div>
                <div className="pl-3 text-[11px] leading-snug text-muted-foreground/70">
                  {WORK_TYPES.map((w) => `${w.label} ฿${fmt(workTypeStats.stat[w.wt].amount)}`).join(' + ')}
                  {workTypeStats.unspecAmount > 0 ? ` + ไม่ระบุ ฿${fmt(workTypeStats.unspecAmount)}` : ''}
                </div>
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span>+ VAT ที่ต้องเรียกเก็บเพิ่ม</span><span className="tabular-nums">฿{fmt(cur.h.collectible + cur.h.revWht - cur.h.bookedGross)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span>− ลูกค้าหักภาษี ณ ที่จ่าย</span><span className="tabular-nums">฿{fmt(cur.h.revWht)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t pt-0.5 font-semibold text-foreground/80">
                  <span>= ยอดที่ต้องเก็บ (เป้า)</span><span className="tabular-nums">฿{fmt(cur.h.collectible)}</span>
                </div>
              </div>
            ) : m.key === 'deals' ? (
              // แสดงคู่: ยอดใหญ่ = ตามวันปิดจริง, บรรทัดย่อยแยกตามเดือนที่สร้างลีด (KPI)
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-muted-foreground">จากลีดที่สร้างเดือนนี้</span>
                  <span className="font-bold tabular-nums">{fmtDeal(cur.closedFromThisMonth)} ดีล</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-muted-foreground">จากลีดเดือนก่อนหน้า</span>
                  <span className="font-bold tabular-nums">{fmtDeal(cur.closedDeals.length - cur.closedFromThisMonth)} ดีล</span>
                </div>
              </div>
            ) : undefined} />
        ))}
      </div>

      {/* ── แถวล่าง: เป้าต่อวัน/สัปดาห์ · กรวยขาย · งวดครบกำหนด · สินค้า (เติมความสูงที่เหลือ) ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        <TargetBreakdown salesTarget={targets.sales} salesValue={values.sales} dealsTarget={targets.deals} dealsValue={values.deals} month={month} />
        <FunnelPanel funnel={funnel} monthName={monthLabel(month)} />
        <DuePanel due={dueList} />
        <ProductTable products={products} monthName={monthLabel(month)} />
      </div>

      <TargetDialog key={`${month}|${editorOpen}`} open={editorOpen} month={month} initial={targets} onSave={saveTargets} onOpenChange={setEditorOpen} />
      <CardViewerDialog model={viewerModel} onClose={() => setViewer(null)} />
    </div>
  )
}

// ── ป้ายเทียบเดือนก่อน (MoM) ──
function MoMBadge({ value, prev, goodWhenUp = true, onDark = false }: { value: number; prev: number; goodWhenUp?: boolean; onDark?: boolean }) {
  if (prev <= 0) return null // ไม่มีฐานเทียบ
  const pct = ((value - prev) / prev) * 100
  if (Math.abs(pct) < 0.5) {
    return <span className={cn('text-xs font-semibold', onDark ? 'text-white/70' : 'text-muted-foreground')}>เท่าเดือนก่อน</span>
  }
  const up = pct > 0
  const good = up === goodWhenUp
  const color = onDark ? 'text-white' : good ? 'text-emerald-600' : 'text-rose-600'
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-bold tabular-nums antialiased', color, onDark && 'rounded-full bg-white/20 px-1.5 py-0.5')}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% <span className="font-normal opacity-70">จากเดือนก่อน</span>
    </span>
  )
}

// ── icon ℹ อธิบายเกณฑ์การนับของการ์ด (กด/แตะเพื่อเปิด — ใช้ได้บนจอ touch) ──
function InfoTip({ text, onDark = false }: { text: string; onDark?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button title="เกณฑ์การนับ" aria-label="เกณฑ์การนับ"
          className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors',
            onDark ? 'text-white/70 hover:bg-white/20 hover:text-white' : 'text-muted-foreground/60 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10')}>
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 text-xs leading-relaxed" side="bottom" align="end">
        <div className="mb-1 font-semibold">เกณฑ์การนับ</div>
        <p className="text-muted-foreground">{text}</p>
      </PopoverContent>
    </Popover>
  )
}

// ── ปุ่มไอคอน "ดูรายการ" บนหัวการ์ด ──
function EyeButton({ onClick, onDark = false }: { onClick: () => void; onDark?: boolean }) {
  return (
    <button onClick={onClick} title="ดูรายการ"
      className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
        onDark ? 'bg-white/15 text-white hover:bg-white/30' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10')}>
      <Eye className="h-4 w-4" />
    </button>
  )
}

// ── Dialog แสดงรายการเบื้องหลังตัวเลขการ์ด (ยอดรวมท้ายตาราง = ตัวเลขบนการ์ด) ──
function CardViewerDialog({ model, onClose }: { model: ViewerModel | null; onClose: () => void }) {
  return (
    <Dialog open={!!model} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[85vh] sm:max-w-3xl">
        {model && (
          <>
            <DialogHeader>
              <DialogTitle>{model.title}</DialogTitle>
            </DialogHeader>
            <p className="-mt-1 text-xs text-muted-foreground">{model.rows.length} รายการ</p>
            {/* มือถือ: ตารางกว้างกว่าจอ → เลื่อนแนวนอนในกรอบตัวเอง แทนการบีบคอลัมน์จนอ่านไม่ได้ */}
            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <table className="w-full min-w-[560px] text-sm sm:min-w-0">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-xs text-muted-foreground">
                    {model.columns.map((c, i) => (
                      <th key={i} className={cn('px-2 py-1.5 font-medium', c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.rows.length === 0 ? (
                    <tr><td colSpan={model.columns.length} className="py-6 text-center text-muted-foreground">ไม่มีข้อมูล</td></tr>
                  ) : model.rows.map((r, ri) => (
                    <tr key={ri} className="border-b last:border-0 hover:bg-muted/40">
                      {r.cells.map((cell, ci) => (
                        <td key={ci} className={cn('px-2 py-1.5 align-top', model.columns[ci].align === 'right' ? 'text-right tabular-nums' : 'text-left')}>
                          {ci === 0 ? <a href={r.href} className="font-medium text-sky-600 hover:underline dark:text-sky-400">{cell}</a> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-card">
                  <tr className="border-t font-bold">
                    {model.footer.map((f, i) => (
                      <td key={i} className={cn('px-2 py-2', model.columns[i]?.align === 'right' ? 'text-right tabular-nums' : 'text-left')}>{f}</td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── การ์ดใหญ่ ยอดขาย + เทรนด์ ──
function HeroCard({ value, prev, target, trend, trendMax, onView }: { value: number; prev: number; target?: number; trend: { month: string; amount: number }[]; trendMax: number; onView?: () => void }) {
  const pct = target && target > 0 ? (value / target) * 100 : 0
  const hit = target ? value >= target : false
  return (
    <div className="grid h-full grid-cols-1 gap-3 rounded-2xl border bg-gradient-to-br from-emerald-600 to-emerald-700 p-4 text-white shadow-lg lg:grid-cols-[1.1fr_1fr] md:px-5">
      <div className="flex flex-col justify-center">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-50/90"><TrendingUp className="h-4 w-4" /> ยอดขายเดือนนี้</div>
          <span className="flex items-center gap-1">
            <InfoTip text={INFO.sales} onDark />
            {onView && <EyeButton onClick={onView} onDark />}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <span className="text-4xl font-extrabold tracking-tight tabular-nums md:text-5xl">฿{fmt(value)}</span>
          {hit && <span className="mb-1.5 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold"><CheckCircle2 className="h-3.5 w-3.5" /> ถึงเป้าแล้ว!</span>}
          <span className="mb-1.5"><MoMBadge value={value} prev={prev} onDark /></span>
        </div>
        {target && target > 0 ? (
          <div className="mt-2.5 max-w-md">
            <div className="flex justify-between text-sm font-bold tabular-nums text-white antialiased"><span>เป้า ฿{fmt(target)}</span><span className="font-extrabold">{pct.toFixed(0)}%</span></div>
            <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-black/20">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            {!hit && <p className="mt-1 text-xs text-emerald-50/80">เหลืออีก ฿{fmt(Math.max(0, target - value))} ถึงเป้า</p>}
          </div>
        ) : (
          <p className="mt-2.5 text-xs text-emerald-50/80">ยังไม่ได้ตั้งเป้าเดือนนี้ — กด “ตั้งเป้า” มุมขวาบน</p>
        )}
      </div>
      {/* mini trend 6 เดือน */}
      <div className="flex flex-col">
        <div className="mb-1 text-xs font-medium text-emerald-50/90">ยอดขาย 6 เดือนล่าสุด</div>
        <div className="flex flex-1 items-end justify-between gap-2">
          {trend.map((t, i) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="text-[10px] font-medium tabular-nums text-emerald-50/80">{t.amount > 0 ? fmtShort(t.amount) : ''}</span>
              <div className="flex w-full items-end justify-center" style={{ height: 64 }}>
                <div className={cn('w-full max-w-[40px] rounded-t-md transition-all', i === trend.length - 1 ? 'bg-white' : 'bg-white/40')}
                  style={{ height: `${Math.max(3, (t.amount / trendMax) * 64)}px` }} />
              </div>
              <span className="text-[10px] text-emerald-50/70">{t.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── ปุ่มสลับฐานเทียบงบรายจ่าย: ยอดขาย / เก็บเงินแล้ว ──
function ExpenseBaseToggle({ value, onChange }: { value: ExpenseBase; onChange: (b: ExpenseBase) => void }) {
  const opts: { key: ExpenseBase; label: string }[] = [
    { key: 'sales', label: 'ยอดขายเดือนนี้' },
    { key: 'revenue', label: 'เก็บเงินแล้ว' },
  ]
  return (
    <div className="inline-flex rounded-lg border border-rose-200 bg-white/60 p-0.5 text-xs dark:border-rose-900 dark:bg-zinc-900/60">
      <span className="flex items-center px-1.5 text-[11px] font-medium text-muted-foreground">เทียบกับ</span>
      {opts.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={cn('rounded-md px-2 py-0.5 font-semibold transition-colors',
            value === o.key ? 'bg-rose-500 text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── การ์ด metric ทั่วไป (มีสีตามหมวด + เทียบเป้า %/จำนวน) ──
function MetricCard({ def, value, prev, target, baseToggle, onSetTarget, onView, extra }: { def: MetricDef; value: number; prev: number; target?: number; baseToggle?: ReactNode; onSetTarget: () => void; onView?: () => void; extra?: ReactNode }) {
  const info = INFO[def.key]
  const Icon = def.icon
  const c = COLORS[def.color] || COLORS.sky
  const has = typeof target === 'number' && target > 0
  const pct = has ? (value / target!) * 100 : 0
  // invert (รายจ่าย): อยู่ในงบ = ดี (เขียว), เกินงบ = แดง
  const hit = has && (def.invert ? value <= target! : value >= target!)
  const over = has && def.invert && value > target!
  const fmtV = (n: number) => def.money ? `฿${fmt(n)}` : fmt(n)
  return (
    <div className={cn('group relative flex flex-col justify-center overflow-hidden rounded-2xl border-2 bg-gradient-to-br p-5 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl md:p-6', c.tint, c.border, c.glow)}>
      {hit && <span className="pointer-events-none absolute right-0 top-0 h-24 w-24 -translate-y-9 translate-x-9 rounded-full bg-emerald-400/25 blur-2xl" />}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2.5 text-lg font-bold text-foreground/80">
          <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-110', c.chip)}><Icon className="h-6 w-6" /></span>
          {def.label}
        </span>
        <span className="flex items-center gap-2">
          <MoMBadge value={value} prev={prev} goodWhenUp={!def.invert} />
          {info && <InfoTip text={info} />}
          {onView && <EyeButton onClick={onView} />}
        </span>
      </div>
      <div className={cn('mt-3 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl xl:text-5xl', c.text)}>
        {fmtV(value)}
        {has && <span className="ml-1.5 text-base font-semibold text-muted-foreground sm:text-lg">/ {fmtV(target!)}</span>}
      </div>
      {baseToggle && <div className="mt-2.5">{baseToggle}</div>}
      {has ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-base">
            <span className="font-bold text-foreground tabular-nums antialiased">เป้า {fmtV(target!)}</span>
            <span className={cn('text-lg font-extrabold tabular-nums antialiased', over ? 'text-rose-600' : hit ? 'text-emerald-600' : c.text)}>{pct.toFixed(0)}%</span>
          </div>
          <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className={cn('h-full rounded-full transition-all duration-500', over ? 'bg-rose-500' : hit ? 'bg-emerald-500' : c.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="mt-1 text-xs font-medium">
            {def.invert
              ? (over ? <span className="text-rose-600">เกินงบ {fmtV(value - target!)}</span> : <span className="text-emerald-600">เหลืองบอีก {fmtV(target! - value)}</span>)
              : (hit ? <span className="text-emerald-600">เกินเป้า {fmtV(value - target!)} 🎉</span> : <span className="text-muted-foreground">เหลืออีก {fmtV(target! - value)} ถึงเป้า</span>)}
          </div>
        </div>
      ) : def.noTarget ? (
        extra ?? <p className="mt-3 text-sm font-medium text-muted-foreground/70">{def.sub}</p>
      ) : (
        <button onClick={onSetTarget} className="mt-3 text-sm font-medium text-muted-foreground/70 transition-colors hover:text-foreground hover:underline">+ ตั้งเป้าเดือนนี้ ({def.sub})</button>
      )}
      {/* การ์ดที่มีเป้า (เช่น ดีลที่ปิดได้) ยังแสดง breakdown ต่อท้ายได้ — เว้น noTarget ซึ่ง render extra ไปแล้วด้านบน */}
      {!def.noTarget && extra}
    </div>
  )
}

// ── การ์ดยอดตามประเภทงาน (compact) — ยอดเดือนนี้ + ดีล + เทียบเป้า + เทรนด์ 6 เดือน ──
function WorkTypeCard({ def, amount, deals, target, trend, onSetTarget, onView }: {
  def: WorkTypeDef; amount: number; deals: number; target?: number
  trend: { month: string; amount: number }[]; onSetTarget: () => void; onView?: () => void
}) {
  const Icon = def.icon
  const c = COLORS[def.color] || COLORS.violet
  const has = typeof target === 'number' && target > 0
  const pct = has ? (amount / target!) * 100 : 0
  const hit = has && amount >= target!
  const trendMax = Math.max(1, ...trend.map((t) => t.amount))
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border-2 bg-gradient-to-br p-3 shadow-sm md:p-4', c.tint, c.border)}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground/80">
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg shadow-sm', c.chip)}><Icon className="h-4 w-4" /></span>
          {def.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{fmtDeal(deals)} ดีล</span>
          <InfoTip text={INFO.workType} />
          {onView && <EyeButton onClick={onView} />}
        </span>
      </div>
      <div className={cn('mt-2 text-2xl font-extrabold tracking-tight tabular-nums', c.text)}>฿{fmt(amount)}</div>
      {has ? (
        <div className="mt-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-foreground tabular-nums">เป้า ฿{fmt(target!)}</span>
            <span className={cn('text-sm font-extrabold tabular-nums', hit ? 'text-emerald-600' : c.text)}>{pct.toFixed(0)}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className={cn('h-full rounded-full transition-all duration-500', hit ? 'bg-emerald-500' : c.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="mt-1 text-[11px] font-medium">
            {hit ? <span className="text-emerald-600">เกินเป้า ฿{fmt(amount - target!)} 🎉</span> : <span className="text-muted-foreground">เหลืออีก ฿{fmt(target! - amount)} ถึงเป้า</span>}
          </div>
        </div>
      ) : (
        <button onClick={onSetTarget} className="mt-1.5 self-start text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground hover:underline">+ ตั้งเป้า</button>
      )}
      {/* mini trend 6 เดือน */}
      <div className="mt-2 flex items-end justify-between gap-1" style={{ height: 40 }}>
        {trend.map((t, i) => (
          <div key={t.month} className="flex flex-1 flex-col items-center justify-end gap-0.5">
            <div className="flex w-full items-end justify-center" style={{ height: 28 }}>
              <div className={cn('w-full max-w-[16px] rounded-t transition-all', i === trend.length - 1 ? c.bar : cn('bg-current opacity-25', c.text))}
                style={{ height: `${Math.max(2, (t.amount / trendMax) * 28)}px` }} />
            </div>
            <span className="text-[9px] text-muted-foreground">{t.month.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// แสดงตัวเลขแบบสั้นบนกราฟ (1.2M / 45K)
function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'K'
  return String(Math.round(n))
}

// ── นับถอยหลังถึงวันที่ 25 ของเดือน (deadline ปิดยอด) ──
function CountdownUnit({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="min-w-[38px] rounded-lg bg-white/20 px-1.5 py-0.5 text-center text-xl font-extrabold tabular-nums md:text-2xl">{String(n).padStart(2, '0')}</span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wide text-white/80">{label}</span>
    </div>
  )
}
function Countdown() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const d = new Date(now)
  let target = new Date(d.getFullYear(), d.getMonth(), 25, 23, 59, 59)
  if (now > target.getTime()) target = new Date(d.getFullYear(), d.getMonth() + 1, 25, 23, 59, 59)
  const diff = Math.max(0, target.getTime() - now)
  const days = Math.floor(diff / 86_400_000)
  const hrs = Math.floor(diff / 3_600_000) % 24
  const mins = Math.floor(diff / 60_000) % 60
  const secs = Math.floor(diff / 1_000) % 60
  const urgent = diff < 3 * 86_400_000
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className={cn('flex h-full flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5 text-white shadow-lg md:px-5',
      urgent ? 'bg-gradient-to-r from-rose-600 to-red-600' : 'bg-gradient-to-r from-indigo-600 to-violet-600')}>
      <div className="flex items-center gap-2.5">
        {urgent ? <Flame className="h-7 w-7 animate-pulse" /> : <Timer className="h-7 w-7" />}
        <div>
          <div className="text-xs font-medium text-white/90">{urgent ? '🔥 โค้งสุดท้าย! เร่งปิดยอด' : 'นับถอยหลังปิดยอดเดือนนี้'}</div>
          <div className="text-sm font-bold leading-tight">ปิดยอดทุกวันที่ 25 · {monthLabel(`${target.getFullYear()}-${pad(target.getMonth() + 1)}`)}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 md:gap-1.5">
        <CountdownUnit n={days} label="วัน" /><span className="pb-3.5 text-lg font-bold opacity-50">:</span>
        <CountdownUnit n={hrs} label="ชม." /><span className="pb-3.5 text-lg font-bold opacity-50">:</span>
        <CountdownUnit n={mins} label="นาที" /><span className="pb-3.5 text-lg font-bold opacity-50">:</span>
        <CountdownUnit n={secs} label="วินาที" />
      </div>
    </div>
  )
}

// แสดงดีลแบบทศนิยม 1 ตำแหน่งถ้าไม่ลงตัว
const fmtDeal = (n: number) => { const r = Math.round(n * 10) / 10; return r % 1 === 0 ? r.toFixed(0) : r.toFixed(1) }
// สีของ % badge ตาม pace
const paceBadge = (pct: number) =>
  pct >= 100 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : pct >= 70 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
const paceBar = (pct: number) => pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500'

// แถวช่วงเวลา 1 บรรทัด: ปัจจุบัน / เป้า + progress
function PaceRow({ label, actual, target, fmtN, textColor }: {
  label: string; actual: number; target: number; fmtN: (n: number) => string; textColor: string
}) {
  const pct = target > 0 ? (actual / target) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className="truncate">
            <span className={cn('text-sm font-bold tabular-nums antialiased', textColor)}>{fmtN(actual)}</span>
            <span className="text-[11px] font-normal text-muted-foreground"> / เป้า {fmtN(target)}</span>
          </span>
          <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums', paceBadge(pct))}>{pct.toFixed(0)}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full transition-all', paceBar(pct))} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      </div>
    </div>
  )
}

// ── เป้าเฉลี่ย ต่อวัน/สัปดาห์/เดือน (ยอดขาย + ดีล) — ปัจจุบัน (pace จริง) เทียบเป้า ──
function TargetBreakdown({ salesTarget, salesValue, dealsTarget, dealsValue, month }: {
  salesTarget?: number; salesValue: number; dealsTarget?: number; dealsValue: number; month: string
}) {
  const hasS = !!salesTarget && salesTarget > 0
  const hasD = !!dealsTarget && dealsTarget > 0
  if (!hasS && !hasD) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-xl border bg-card p-3 text-center md:p-4">
        <Target className="mb-2 h-6 w-6 text-emerald-500" />
        <p className="text-sm text-muted-foreground">ตั้งเป้ายอดขาย/ดีลเดือนนี้ก่อน<br />เพื่อดูเป้าเฉลี่ยต่อวัน/สัปดาห์</p>
      </div>
    )
  }
  const [y, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()
  const isCur = month === curMonth()
  const remainingDays = isCur ? Math.max(1, daysInMonth - new Date().getDate() + 1) : daysInMonth
  // แต่ละช่วงมีขนาด unitDays วัน — เฉลี่ยบนฐานเดียวกันทั้ง ปัจจุบัน/เป้า (÷ จำนวนช่วงในเดือน)
  //   ปัจจุบัน(เฉลี่ย) = ยอดสะสม ÷ (วันในเดือน ÷ unitDays)
  //   เป้า(เฉลี่ย)     = เป้าเดือน  ÷ (วันในเดือน ÷ unitDays)
  const periods = [
    { label: 'ต่อวัน', unitDays: 1 },
    { label: 'ต่อสัปดาห์', unitDays: 7 },
    { label: 'ต่อเดือน', unitDays: daysInMonth },
  ]
  const sections = [
    hasS && { key: 's', label: 'ยอดขาย', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', target: salesTarget!, value: salesValue, fmtN: (n: number) => `฿${fmt(Math.round(n))}`, need: Math.max(0, salesTarget! - salesValue) / remainingDays },
    hasD && { key: 'd', label: 'ดีล', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', target: dealsTarget!, value: dealsValue, fmtN: fmtDeal, need: Math.max(0, dealsTarget! - dealsValue) / remainingDays },
  ].filter(Boolean) as { key: string; label: string; dot: string; text: string; target: number; value: number; fmtN: (n: number) => string; need: number }[]
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 md:p-4">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-emerald-500" /> เป้าเฉลี่ย · ปัจจุบัน</span>
        <InfoTip text={INFO.pace} />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {sections.map((s) => (
          <div key={s.key}>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground/70">
              <span className={cn('h-2 w-2 rounded-full', s.dot)} /> {s.label}
            </div>
            <div className="space-y-2">
              {periods.map((p) => (
                <PaceRow key={p.label} label={p.label}
                  actual={s.value / (daysInMonth / p.unitDays)}
                  target={s.target / (daysInMonth / p.unitDays)}
                  fmtN={s.fmtN} textColor={s.text} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {isCur && (
        <div className="mt-2 shrink-0 rounded-lg bg-emerald-50 px-3 py-2 text-xs dark:bg-emerald-950/40">
          เหลือ <span className="font-bold text-emerald-700 dark:text-emerald-300">{remainingDays} วัน</span> · ต้องทำวันละ
          {sections.map((s, i) => (
            <span key={s.key}>
              {i > 0 && <span className="text-muted-foreground"> · </span>}
              <span className={cn('ml-1 text-sm font-extrabold tabular-nums antialiased', s.text)}>{s.fmtN(s.need)}{s.key === 'd' ? ' ดีล' : ''}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── กรวยขาย: ลีดแยกตามสถานะ (เดือนนี้) ──
function FunnelPanel({ funnel, monthName }: { funnel: { stages: { label: string; color: string; count: number }[]; top: number; lost: number }; monthName: string }) {
  const entered = funnel.stages[0]?.count ?? 0
  const closed = funnel.stages[funnel.stages.length - 1]?.count ?? 0
  const conv = entered > 0 ? (closed / entered) * 100 : 0
  const empty = funnel.stages.every((s) => s.count === 0) && funnel.lost === 0
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 md:p-4">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold"><Filter className="h-4 w-4 text-sky-500" /> กรวยขาย — {monthName}</span>
        <InfoTip text={INFO.funnel} />
      </div>
      {empty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีลีดในเดือนนี้</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col justify-between">
          <div className="flex flex-1 flex-col justify-around gap-2">
            {funnel.stages.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-muted-foreground">{s.label}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted">
                  <div className={cn('flex h-full items-center justify-end rounded-md px-2 text-xs font-bold text-white transition-all', s.color)}
                    style={{ width: `${Math.max(s.count > 0 ? 12 : 0, (s.count / funnel.top) * 100)}%` }}>
                    {s.count > 0 && s.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex shrink-0 items-center justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">เสียดีล <span className="font-bold text-rose-600">{funnel.lost}</span></span>
            <span className="font-semibold">อัตราปิดการขาย <span className="text-base font-extrabold tabular-nums text-emerald-600 antialiased">{conv.toFixed(0)}%</span></span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── งวดที่ครบ/เลยกำหนด — ลิสต์ตามเก็บเงิน ──
function DuePanel({ due }: { due: { rows: { name: string; due: string; amount: number; days: number }[]; overdueAmt: number; overdueCount: number } }) {
  const dueLabel = (days: number) =>
    days < 0 ? `เลย ${-days} วัน` : days === 0 ? 'ครบวันนี้' : `อีก ${days} วัน`
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 md:p-4">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-rose-500" /> งวดที่ครบ/เลยกำหนด
          <InfoTip text={INFO.due} />
        </span>
        {due.overdueCount > 0 && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
            เลย {due.overdueCount} · ฿{fmt(due.overdueAmt)}
          </span>
        )}
      </div>
      {due.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีงวดที่ครบภายใน 14 วัน 🎉</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {due.rows.map((r, i) => {
            const overdue = r.days < 0
            const soon = r.days >= 0 && r.days <= 3
            return (
              <div key={r.name + r.due + i} className="flex items-center gap-2 rounded-lg px-2 py-1 odd:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">{r.due}</div>
                </div>
                <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold antialiased',
                  overdue ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : soon ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-muted text-muted-foreground')}>
                  {dueLabel(r.days)}
                </span>
                <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums antialiased">฿{fmt(r.amount)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── ตารางสินค้า/บริการ (แพ็กเกจ) ที่ขายได้ ──
function ProductTable({ products, monthName }: { products: { key: string; name: string; month: number; total: number }[]; monthName: string }) {
  const monthTotal = products.reduce((s, p) => s + p.month, 0)
  const grandTotal = products.reduce((s, p) => s + p.total, 0)
  const max = Math.max(1, ...products.map((p) => p.month))
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card p-3 md:p-4">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold"><Package className="h-4 w-4 text-teal-500" /> ระบบที่ใช้บริการที่ขายได้ — {monthName}</span>
        <InfoTip text={INFO.products} />
      </div>
      {products.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b text-xs text-muted-foreground">
                <th className="pb-1.5 text-left font-medium">ระบบที่ใช้บริการ</th>
                <th className="pb-1.5 text-right font-medium">เดือนนี้</th>
                <th className="pb-1.5 text-right font-medium">สัดส่วน</th>
                <th className="pb-1.5 text-right font-medium">สะสม</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const share = monthTotal > 0 ? (p.month / monthTotal) * 100 : 0
                return (
                  <tr key={p.key} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${(p.month / max) * 100}%` }} />
                      </div>
                    </td>
                    <td className="py-1.5 text-right text-base font-bold tabular-nums text-teal-700 dark:text-teal-300">{p.month}</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{share.toFixed(0)}%</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{p.total}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t font-semibold">
                <td className="pt-1.5">รวมทั้งหมด</td>
                <td className="pt-1.5 text-right tabular-nums">{monthTotal}</td>
                <td className="pt-1.5 text-right text-muted-foreground">100%</td>
                <td className="pt-1.5 text-right tabular-nums text-muted-foreground">{grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── dialog ตั้งเป้ารายเดือน (เก็บใน localStorage) ──
function TargetDialog({ open, month, initial, onSave, onOpenChange }: {
  open: boolean; month: string; initial: Targets; onSave: (t: Targets) => void; onOpenChange: (o: boolean) => void
}) {
  // ตั้งค่า draft ครั้งเดียวตอน mount (parent ใส่ key ใหม่ทุกครั้งที่เปิด → remount = ค่าล่าสุด)
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const m of METRICS) { const v = initial[m.key]; d[m.key] = v != null ? String(v) : '' }
    for (const w of WORK_TYPES) { const v = initial[w.key]; d[w.key] = v != null ? String(v) : '' }
    return d
  })

  const save = () => {
    const next: Targets = {}
    for (const m of METRICS) { const n = Number(draft[m.key]); if (n > 0) next[m.key] = n }
    for (const w of WORK_TYPES) { const n = Number(draft[w.key]); if (n > 0) next[w.key] = n }
    onSave(next); onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>ตั้งเป้าหมาย — {monthLabel(month)}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          {METRICS.filter((m) => !AUTO_TARGET_KEYS.includes(m.key)).map((m) => {
            const Icon = m.icon
            return (
              <div key={m.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <Label htmlFor={`t-${m.key}`} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm"><Icon className="h-4 w-4 text-muted-foreground" /> {m.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{m.money ? 'บาท' : 'จำนวน'}{m.invert ? ' · งบสูงสุด' : ''}</span>
                </Label>
                <Input id={`t-${m.key}`} type="number" inputMode="numeric" min={0} placeholder="—" className="w-36 text-right"
                  value={draft[m.key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))} />
              </div>
            )
          })}

          {/* เป้าตามประเภทงาน */}
          <div className="border-t pt-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">เป้าตามประเภทงาน</div>
            <div className="space-y-3">
              {WORK_TYPES.map((w) => {
                const Icon = w.icon
                return (
                  <div key={w.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <Label htmlFor={`t-${w.key}`} className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-sm"><Icon className="h-4 w-4 text-muted-foreground" /> {w.label}</span>
                      <span className="text-xs font-normal text-muted-foreground">บาท</span>
                    </Label>
                    <Input id={`t-${w.key}`} type="number" inputMode="numeric" min={0} placeholder="—" className="w-36 text-right"
                      value={draft[w.key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [w.key]: e.target.value }))} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => { onSave({}); onOpenChange(false) }} className="text-muted-foreground">ล้างเป้าเดือนนี้</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={save}>บันทึก</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
