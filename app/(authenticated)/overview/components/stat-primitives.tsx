'use client'

// ============================================================================
// Primitives ที่ใช้ร่วมกันในแท็บของหน้า Overview (Dashboard / งบกำไร-ขาดทุน / เงินสด&ลูกหนี้)
// ภาษาภาพเดียวกับ Sales Board: การ์ดไล่เฉดสี ขอบสี ไอคอนชิป ตัวเลข tabular-nums หนา
// พร้อม InfoTip (ℹ) อธิบาย "ฐานการนับ" ของทุกตัวเลข — นิยามอยู่ใน INFO ด้านล่าง
// ทุกคลาสสีเขียนเป็น literal (Tailwind JIT อ่าน string ที่ประกอบตอน runtime ไม่ได้)
// ============================================================================

import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type Tone = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'zinc' | 'slate'

const TONES: Record<Tone, { tint: string; text: string; chip: string; border: string; glow: string }> = {
  emerald: { tint: 'from-emerald-100 to-emerald-50/40 dark:from-emerald-950/50 dark:to-zinc-900', text: 'text-emerald-700 dark:text-emerald-300', chip: 'bg-emerald-500 text-white', border: 'border-emerald-300 dark:border-emerald-800', glow: 'shadow-emerald-500/20' },
  sky: { tint: 'from-sky-100 to-sky-50/40 dark:from-sky-950/50 dark:to-zinc-900', text: 'text-sky-700 dark:text-sky-300', chip: 'bg-sky-500 text-white', border: 'border-sky-300 dark:border-sky-800', glow: 'shadow-sky-500/20' },
  violet: { tint: 'from-violet-100 to-violet-50/40 dark:from-violet-950/50 dark:to-zinc-900', text: 'text-violet-700 dark:text-violet-300', chip: 'bg-violet-500 text-white', border: 'border-violet-300 dark:border-violet-800', glow: 'shadow-violet-500/20' },
  amber: { tint: 'from-amber-100 to-amber-50/40 dark:from-amber-950/50 dark:to-zinc-900', text: 'text-amber-700 dark:text-amber-300', chip: 'bg-amber-500 text-white', border: 'border-amber-300 dark:border-amber-800', glow: 'shadow-amber-500/20' },
  rose: { tint: 'from-rose-100 to-rose-50/40 dark:from-rose-950/50 dark:to-zinc-900', text: 'text-rose-700 dark:text-rose-300', chip: 'bg-rose-500 text-white', border: 'border-rose-300 dark:border-rose-800', glow: 'shadow-rose-500/20' },
  zinc: { tint: 'from-zinc-100 to-zinc-50/40 dark:from-zinc-800/60 dark:to-zinc-900', text: 'text-zinc-700 dark:text-zinc-200', chip: 'bg-zinc-600 text-white dark:bg-zinc-500', border: 'border-zinc-300 dark:border-zinc-700', glow: 'shadow-zinc-500/10' },
  slate: { tint: 'from-slate-100 to-slate-50/40 dark:from-slate-800/60 dark:to-zinc-900', text: 'text-slate-700 dark:text-slate-200', chip: 'bg-slate-600 text-white dark:bg-slate-500', border: 'border-slate-300 dark:border-slate-700', glow: 'shadow-slate-500/10' },
}

// ── icon ℹ อธิบายเกณฑ์การนับของการ์ด (กด/แตะเพื่อเปิด — ใช้ได้บนจอ touch) ──
export function InfoTip({ text, side = 'bottom' }: { text: string; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button title="เกณฑ์การนับ" aria-label="เกณฑ์การนับ"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200">
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 text-xs leading-relaxed sm:w-80" side={side} align="end">
        <div className="mb-1 font-semibold">เกณฑ์การนับ</div>
        <p className="text-muted-foreground">{text}</p>
      </PopoverContent>
    </Popover>
  )
}

// ── การ์ดตัวเลขมาตรฐาน (hero = size md, แถบ metric ย่อ = size sm) ──
export function StatCard({ tone = 'zinc', icon: Icon, label, value, sub, info, footer, size = 'md' }: {
  tone?: Tone
  icon?: React.ElementType
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  info?: string
  footer?: React.ReactNode
  size?: 'sm' | 'md'
}) {
  const c = TONES[tone]
  const sm = size === 'sm'
  return (
    <div className={cn(
      'group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-gradient-to-br shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
      sm ? 'p-3.5' : 'p-4 sm:p-5', c.tint, c.border, c.glow,
    )}>
      <div className="flex items-start justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className={cn('flex shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform group-hover:scale-110',
              sm ? 'h-8 w-8' : 'h-11 w-11', c.chip)}>
              <Icon className={sm ? 'h-4 w-4' : 'h-5 w-5'} />
            </span>
          )}
          <span className={cn('font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400', sm ? 'text-[10px]' : 'text-[11px] sm:text-xs')}>
            {label}
          </span>
        </span>
        {info && <InfoTip text={info} />}
      </div>
      <div className={cn('mt-2.5 font-extrabold tracking-tight tabular-nums', sm ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl', c.text)}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">{sub}</div>}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  )
}

// ── หัว/ช่องตารางตัวเลข (ใช้ร่วมกันใน pl-summary และ cash-ar-view) ──
export function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-right font-semibold px-5 py-2.5 whitespace-nowrap">{children}</th>
}
export function Td({ children, tone, strong, muted }: { children?: React.ReactNode; tone?: 'emerald' | 'rose'; strong?: boolean; muted?: boolean }) {
  const c = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'rose' ? 'text-rose-500 dark:text-rose-400'
    : muted ? 'text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'
  return <td className={`text-right px-5 py-2.5 whitespace-nowrap ${strong ? 'font-bold' : ''} ${c}`}>{children}</td>
}

// ============================================================================
// นิยาม/ฐานการนับของทุกตัวเลขในหน้า Overview — ต้องตรงกับสูตรจริงใน pl/pl-lib.ts
// (buildHealth, buildArStatus, calcTax) เสมอ แก้สูตรเมื่อไหร่ให้แก้ข้อความที่นี่ด้วย
// ============================================================================
const REV_BASIS = 'นับดีลจาก CRM ที่สถานะ "ตอบรับ" หรือ "สำเร็จ" และมีมูลค่ามากกว่า 0 ตามวันจัดงาน (ถ้าไม่มีวันจัดงานใช้วันที่สร้างลีด)'
const EXP_BASIS = 'ใบเบิกทุกใบยกเว้นที่ถูกปฏิเสธ/ยกเลิก คิดเป็นยอดก่อน VAT จัดเข้าช่วงตามวันที่ใช้จ่าย (ถ้าไม่มีใช้วันสร้างใบ) · ใบเงินทดลองจ่ายที่เคลียร์คืนแล้วใช้ยอดจ่ายจริง'

export const INFO = {
  revBase: `รายรับฐาน = มูลค่างานก่อน VAT ของดีลที่รับรู้รายรับ · ${REV_BASIS} · VAT/ภาษีหัก ณ ที่จ่าย แยกออกไม่รวมในตัวเลขนี้`,
  bookedGross: `ยอดออกบิลเต็มจำนวน (รวม VAT ถ้ามี) ของดีลชุดเดียวกับรายรับฐาน · ${REV_BASIS}`,
  expense: `รายจ่ายฐาน = ${EXP_BASIS} · แบ่งเป็น "ต้นทุนงาน" (ใบเบิกที่ผูกกับดีลที่มีรายรับ) กับ "overhead" (ใบเบิก office/ลอย หรือผูกงานที่ไม่ใช่ดีลรายรับ)`,
  opProfit: 'กำไรดำเนินงาน = รายรับฐาน − ต้นทุนงาน − overhead · ทุกก้อนคิดบนฐานก่อน VAT จึงเทียบกันได้ตรงๆ',
  grossProfit: 'กำไรขั้นต้น = รายรับฐาน − ต้นทุนงาน (ใบเบิกที่ผูกกับดีลที่มีรายรับ) ยังไม่หัก overhead',
  ar: 'ลูกหนี้คงค้าง (AR) = ยอดที่ต้องเก็บ (สุทธิหลัง VAT/หักภาษี ณ ที่จ่าย) − เงินที่เก็บแล้ว (มัดจำ + งวดที่จ่ายแล้ว) · ภาษีหัก ณ ที่จ่ายที่ลูกค้านำส่งเองไม่นับเป็นหนี้ค้าง',
  cashCollected: 'เก็บเงินแล้ว = มัดจำ + งวดที่บันทึกว่าชำระแล้ว (นับไม่เกินยอดที่ต้องเก็บของแต่ละดีล)',
  collectible: 'ยอดที่ต้องเก็บ = มูลค่าดีล + VAT ที่เรียกเก็บเพิ่ม − ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักนำส่งเอง (ยอดสุทธิที่ลูกค้าต้องโอนจริง)',
  cashRate: 'อัตราเก็บเงิน = เงินที่เก็บแล้ว (มัดจำ + งวดที่จ่ายแล้ว) ÷ ยอดที่ต้องเก็บสุทธิ ของดีลในช่วงที่เลือก',
  grossMargin: 'Gross Margin = กำไรขั้นต้น ÷ รายรับฐาน · กำไรขั้นต้น = รายรับฐาน − ต้นทุนงานที่ผูกกับดีล',
  opMargin: 'Operating Margin = กำไรดำเนินงาน ÷ รายรับฐาน · กำไรดำเนินงาน = รายรับฐาน − ต้นทุนงาน − overhead',
  revWithCost: 'สัดส่วนรายรับที่มีข้อมูลต้นทุนแล้ว — ถ้าต่ำแปลว่ายังลงใบเบิกไม่ครบ กำไรที่เห็นอาจสูงเกินจริง',
  overheadRatio: 'สัดส่วน overhead (ใบเบิก office/ไม่ผูกดีลรายรับ) เทียบต้นทุนรวมทั้งหมดในช่วงที่เลือก',
  dealCount: `จำนวนดีลที่รับรู้รายรับในช่วงที่เลือก · ${REV_BASIS}`,
  customers: `จำนวนลูกค้าไม่ซ้ำจากดีลที่รับรู้รายรับในช่วง · ${REV_BASIS}`,
  avgDeal: 'มูลค่าเฉลี่ยต่อดีล = รายรับฐาน ÷ จำนวนดีลที่รับรู้รายรับในช่วงที่เลือก',
  claims: `จำนวนและยอดใบเบิกในช่วงที่เลือก · ${EXP_BASIS}`,
  arAging: 'แบ่งลูกหนี้คงค้างตามวันครบกำหนดของงวดที่ยังไม่จ่าย — "ยังไม่แบ่งงวด" คือส่วนที่ยังไม่ได้วางบิลเป็นงวด, "รอครบกำหนด" คือยังไม่ถึงวันครบกำหนด, ที่เหลือแยกตามจำนวนวันที่เลยกำหนดแล้ว',
} as const
