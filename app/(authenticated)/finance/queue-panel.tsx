// ============================================================================
// แผงข้างของคิวใบเบิก — ดูรูปใบเสร็จ ยอด และทำงานต่อโดยไม่เปลี่ยนหน้า (ทำเสร็จแล้วผู้เรียกเลื่อนไปใบถัดไปในกลุ่ม)
// QueuePanelBody แสดงผลล้วน ไม่มี hook (ใช้ในชุดตรวจ renderToStaticMarkup ได้) · QueuePanel = Sheet ด้านขวาที่ห่อไว้
// ============================================================================

import Link from 'next/link'
import {
  AlertCircle, Building2, ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, Undo2, User as UserIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { calcTax } from '@/lib/finance/money'
import { cn } from '@/lib/utils'
import { getCategoryLabel, getFundingSourceLabel } from '../costs/types'
import { paymentLock } from './claim-rules'
import { advanceState } from './claim-queue'
import type { QueueClaim } from './queue-data'
import { AdvanceBadge, DocBadge, PRIMARY_BUTTON, rowActions, type RowActionKey } from './queue-row'
import type { FinanceCategory } from './settings-actions'
import { StatusBadge } from './status-badge'

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ไฟล์แนบที่แสดงได้ — เฉพาะ http(s) และไม่ว่าง (tax_invoice_urls ใช้ '' แทนใบกำกับที่มีแต่เลขที่) */
const httpUrls = (list: readonly (string | null)[] | null | undefined) =>
  (list ?? []).filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u.trim()))

const isPdf = (url: string) => /\.pdf($|[?#])/i.test(url)

export interface PanelFile { url: string; label: string; pdf: boolean }

/** ใบเสร็จ → ใบเสร็จตอนเคลียร์ → ใบกำกับภาษี → สลิปคืนเงิน */
export function panelFiles(c: QueueClaim, isEn: boolean): PanelFile[] {
  const groups: [readonly (string | null)[] | null | undefined, string, string][] = [
    [c.receipt_urls, 'ใบเสร็จ', 'Receipt'],
    [c.actual_receipt_urls, 'ใบเสร็จตอนเคลียร์', 'Settlement receipt'],
    [c.tax_invoice_urls, 'ใบกำกับภาษี', 'Tax invoice'],
    [c.refund_slip_urls, 'สลิปคืนเงิน', 'Refund slip'],
  ]
  return groups.flatMap(([list, th, en]) =>
    httpUrls(list).map((url, i) => ({ url, label: `${isEn ? en : th} ${i + 1}`, pdf: isPdf(url) })))
}

export interface QueuePanelBodyProps {
  claim: QueueClaim
  isEn: boolean
  /** ปุ่มที่กำลังทำงาน (ทุกปุ่มกดไม่ได้ระหว่างนั้น) */
  busy: string | null
  error: string | null
  categories?: FinanceCategory[]
  onAction: (key: RowActionKey) => void
  onSendBack: () => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
}

function Row({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-sm text-zinc-600 dark:text-zinc-400">{label}</dt>
      <dd className={cn('min-w-0 wrap-break-word text-right tabular-nums', strong ? 'text-base font-bold text-zinc-900 dark:text-zinc-100' : 'text-sm text-zinc-800 dark:text-zinc-200')}>
        {children}
      </dd>
    </div>
  )
}

export function QueuePanelBody({
  claim: c, isEn, busy, error, categories, onAction, onSendBack, onPrev, onNext, hasPrev, hasNext,
}: QueuePanelBodyProps) {
  const lock = paymentLock(c)
  const tax = calcTax(Number(c.amount) || 0, c.vat_mode || 'none', Number(c.withholding_tax_rate) || 0)
  const files = panelFiles(c, isEn)
  const actions = rowActions(c, isEn, 'panel')
  const adv = advanceState(c)
  const personal = c.funding_source === 'personal'
  const FundIcon = personal ? UserIcon : Building2
  const last4 = (c.bank_account_number || '').replace(/\D/g, '').slice(-4)
  const sentBack = c.status === 'draft' && !!c.reject_reason

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 pr-14 sm:p-5 sm:pr-14">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-zinc-600 dark:text-zinc-400">{c.claim_number}</span>
            <StatusBadge status={c.status} isEn={isEn} />
            {adv ? <AdvanceBadge claim={c} isEn={isEn} /> : <DocBadge claim={c} isEn={isEn} />}
          </div>
          <p className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-100">{c.title}</p>
        </header>

        {sentBack && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">
            <Undo2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{isEn ? 'Sent back for changes: ' : 'ส่งกลับให้แก้: '}{c.reject_reason}</span>
          </p>
        )}
        {lock.locked && (
          <p className="flex items-start gap-2 rounded-lg bg-red-100 p-3 text-sm font-medium text-red-900 dark:bg-red-950/60 dark:text-red-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{lock.message}</span>
          </p>
        )}

        <section aria-label={isEn ? 'Amounts' : 'ยอดเงิน'} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <Row label={isEn ? 'Amount' : 'ยอด'}>฿{fmtDec(Number(c.amount) || 0)}</Row>
            <Row label="VAT">฿{fmtDec(tax.vatAmount)}</Row>
            <Row label={isEn ? 'Withholding tax' : 'หัก ณ ที่จ่าย'}>{tax.whtAmount > 0 ? '−' : ''}฿{fmtDec(tax.whtAmount)}</Row>
            <Row label={isEn ? 'Net payable' : 'ยอดจ่ายจริง'} strong>฿{fmtDec(tax.netPayable)}</Row>
            {c.claim_type === 'advance' && c.actual_spent_amount != null && (
              <>
                <Row label={isEn ? 'Actually spent' : 'ใช้จริง'}>฿{fmtDec(Number(c.actual_spent_amount) || 0)}</Row>
                <Row label={isEn ? 'Refund to company' : 'เงินคืนบริษัท'}>฿{fmtDec(Number(c.refund_amount) || 0)}</Row>
              </>
            )}
          </dl>
        </section>

        <section aria-label={isEn ? 'Documents' : 'เอกสาร'} className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isEn ? `Documents (${files.length})` : `เอกสาร (${files.length})`}
          </h3>
          {files.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{isEn ? 'No attachments yet' : 'ยังไม่มีไฟล์แนบ'}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {files.map(f => (
                <li key={f.url} className="min-w-0">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={f.label}
                    className="block overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-600/50 dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {f.pdf ? (
                      <span data-kind="pdf" className="flex aspect-square flex-col items-center justify-center gap-1 text-zinc-700 dark:text-zinc-200">
                        <FileText className="h-7 w-7" aria-hidden="true" />
                        <span className="text-xs font-semibold">PDF</span>
                      </span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.url} alt={f.label} loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                    )}
                    <span className="block truncate px-1.5 py-1 text-xs text-zinc-700 dark:text-zinc-300">{f.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <dl className="space-y-0.5">
          <Row label={isEn ? 'Submitter' : 'ผู้เบิก'}>{c.submitter?.full_name || '—'}</Row>
          <Row label={isEn ? 'Event' : 'งาน'}>{c.job_event?.event_name || '—'}</Row>
          <Row label={isEn ? 'Category' : 'หมวดหมู่'}>{getCategoryLabel(c.category, isEn ? 'en' : 'th', categories)}</Row>
          <Row label={isEn ? 'Expense date' : 'วันที่ใช้จ่าย'}>
            {c.expense_date ? new Date(c.expense_date).toLocaleDateString(isEn ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          </Row>
          <Row label={isEn ? 'Funding' : 'แหล่งเงิน'}>
            <span className="inline-flex items-center gap-1">
              <FundIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {getFundingSourceLabel(c.funding_source, isEn ? 'en' : 'th')}
            </span>
          </Row>
          <Row label={isEn ? 'Pay to' : 'รับเงินที่'}>
            {c.bank_name || last4 ? `${c.bank_name || '—'}${last4 ? ` ••••${last4}` : ''}` : '—'}
          </Row>
        </dl>
      </div>

      <footer className="space-y-3 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:p-5">
        {error && <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
        {actions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {actions.map(a => (
              <Button size="lg" key={a.key} type="button" variant={a.variant} disabled={a.disabled || !!busy} title={a.title}
                onClick={() => (a.key === 'send_back' ? onSendBack() : onAction(a.key))}
                className={cn('grow px-4 sm:grow-0', a.variant === 'default' && PRIMARY_BUTTON)}
              >
                {busy === a.key && <Loader2 className="animate-spin" aria-hidden="true" />}
                {a.label}
              </Button>
            ))}
          </div>
        )}
        {/* จอแคบ: ก่อนหน้า | ถัดไป แถวบน ลิงก์หน้าใบเบิกเต็มแถวล่าง */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="lg" type="button" variant="outline" className="px-3" onClick={onPrev} disabled={!hasPrev || !!busy}>
            <ChevronLeft aria-hidden="true" />
            {isEn ? 'Previous' : 'ก่อนหน้า'}
          </Button>
          <Button size="lg" asChild variant="ghost" className="order-last w-full px-3 sm:order-0 sm:w-auto">
            <Link href={`/finance/${c.id}`}>
              <ExternalLink aria-hidden="true" />
              {isEn ? 'Open claim page' : 'เปิดหน้าใบเบิก'}
            </Link>
          </Button>
          <Button size="lg" type="button" variant="outline" className="px-3" onClick={onNext} disabled={!hasNext || !!busy}>
            {isEn ? 'Next' : 'ถัดไป'}
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </footer>
    </div>
  )
}

/** แผงข้างขวา — จอเล็กเต็มความกว้าง · จอใหญ่กว้างไม่เกิน 440px · ปุ่มปิดของ Sheet ขยายเป็น 40px */
export function QueuePanel({
  open, claim, onClose, ...body
}: Omit<QueuePanelBodyProps, 'claim'> & { open: boolean; claim: QueueClaim | null; onClose: () => void }) {
  return (
    <Sheet open={open && !!claim} onOpenChange={next => { if (!next) onClose() }}>
      <SheetContent
        side="right"
        // เปิดแผงแล้วโฟกัสที่ตัวแผง ไม่ใช่ปุ่มแรก (ปุ่มแรกคือ "ปฏิเสธ" — ดูเหมือนถูกเลือกไว้ และกด Enter/Space พลาดได้)
        onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement | null)?.focus() }}
        className="w-full gap-0 p-0 sm:max-w-[440px] [&>button:last-child]:top-3 [&>button:last-child]:right-3 [&>button:last-child]:flex [&>button:last-child]:size-10 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-md"
      >
        {claim && (
          <>
            <SheetTitle className="sr-only">{`${claim.claim_number} · ${claim.title}`}</SheetTitle>
            <SheetDescription className="sr-only">
              {body.isEn ? 'Claim details, attachments and actions' : 'รายละเอียดใบเบิก ไฟล์แนบ และปุ่มดำเนินการ'}
            </SheetDescription>
            <QueuePanelBody claim={claim} {...body} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
