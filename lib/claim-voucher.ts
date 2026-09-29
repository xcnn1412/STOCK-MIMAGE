import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { PaymentVoucherPDF } from '@/components/pdf/payment-voucher'
import type { PaymentVoucherData } from '@/components/pdf/payment-voucher'
import type { createServiceClient } from '@/lib/supabase-server'
import { formatThaiDate } from '@/lib/thai-date'
import { fetchClaimFile, isPdfUrl } from '@/lib/claim-files'
import { sniffFileType } from '@/lib/claim-bundle'

// ============================================================================
// ข้อมูล + PDF หน้าใบเบิก (ใบสำคัญจ่าย / เงินทดลองจ่าย / สรุปเงินสดย่อยประจำเดือน)
// ย้ายมาจาก app/api/pdf/payment-voucher/route.ts เพื่อให้ชุดเอกสาร (/api/pdf/claim-bundle) ใช้ตัวเดียวกัน
// ผลต้องเหมือน route เดิมทุกกรณี — ตรวจด้วย scripts/claim-voucher.check.ts (เทียบผลอ้างอิงที่เก็บก่อนย้าย)
// server-only: ใช้ service-role client + ออกเครือข่าย (สลิปคืนเงิน) — ห้าม import จาก client component
// ============================================================================

type ServiceClient = ReturnType<typeof createServiceClient>

/** select ของใบเบิกที่หน้าใบเบิกใช้ (ชื่อผู้ส่ง/ผู้อนุมัติมาพร้อมกัน) */
export const VOUCHER_CLAIM_SELECT =
  '*, submitter:profiles!expense_claims_submitted_by_fkey(id, full_name), approver:profiles!expense_claims_approved_by_fkey(id, full_name)'

/** คอลัมน์ของใบเบิกที่หน้าใบเบิกอ่าน — แถวจาก VOUCHER_CLAIM_SELECT */
export interface VoucherClaim {
  id: string
  claim_number?: string | null
  claim_type?: string | null
  status?: string | null
  submitted_by?: string | null
  pettycash_fund_id?: string | null
  /** ยอดรวมก่อนภาษี (ราคาต่อหน่วย × จำนวน คูณมาแล้ว) */
  amount?: number | string | null
  quantity?: number | string | null
  vat_mode?: string | null
  withholding_tax_rate?: number | string | null
  title?: string | null
  description?: string | null
  expense_date?: string | null
  created_at?: string | null
  bank_name?: string | null
  bank_account_number?: string | null
  account_holder_name?: string | null
  actual_spent_items?: unknown
  actual_spent_amount?: number | string | null
  refund_amount?: number | string | null
  refund_slip_urls?: unknown
  refund_confirmed_at?: string | null
  advance_settled_at?: string | null
  pettycash_period_start?: string | null
  pettycash_period_end?: string | null
  pettycash_closed_at?: string | null
  submitter?: { full_name?: string | null } | null
  approver?: { full_name?: string | null } | null
}

/**
 * ใครเปิดเอกสารของใบเบิกนี้ได้ (หน้าใบเบิก / ชุดเอกสารทีละใบ)
 * แอดมิน · เจ้าของใบ · เอกสารเงินสดย่อย (วงเงิน / เติมเงิน / ค่าใช้จ่ายจากกล่อง) เป็นของกล่องกลางของ office
 * พนักงานทุกคนพิมพ์ได้ (ตรงกับการมองเห็นใน getClaim)
 */
export function canViewClaimDocs(
  session: { userId: string; role: string },
  claim: Pick<VoucherClaim, 'claim_type' | 'pettycash_fund_id' | 'submitted_by'>
): boolean {
  const isPettyRelated = claim.claim_type === 'petty_cash' || !!claim.pettycash_fund_id
  return session.role === 'admin' || claim.submitted_by === session.userId || isPettyRelated
}

// ============================================================================
// Tax Calculation (same logic as claim form)
// ============================================================================
function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let vatAmount = 0
  let totalWithVat = amount

  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    vatAmount = amount * 0.07
    totalWithVat = amount + vatAmount
  }

  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

/**
 * สลิปคืนเงินแบบรูปเป็น data URL (ฝังในหน้าหลักฐานการคืนเงิน) — ข้าม PDF (ฝังในหน้าไม่ได้ ชุดเอกสารเติมให้แทน)
 * ดึงผ่าน fetchClaimFile: เฉพาะสตอเรจของระบบเอง — เดิม fetch ทุก URL ที่อยู่ในช่องนี้
 * mime ดูจากหัวไฟล์ก่อน (นามสกุล/หัว HTTP เชื่อไม่ได้) ดูไม่ออกค่อยใช้หัว HTTP แบบเดิม
 */
async function slipImages(urls: unknown): Promise<string[]> {
  const list = Array.isArray(urls) ? urls.filter((u): u is string => typeof u === 'string') : []
  const images: string[] = []
  for (const url of list) {
    if (isPdfUrl(url)) continue
    const file = await fetchClaimFile(url)
    if (!('bytes' in file)) continue // skip unreachable slip
    const sniffed = sniffFileType(file.bytes)
    const mime = sniffed === 'jpeg' ? 'image/jpeg' : sniffed === 'png' ? 'image/png' : file.contentType || 'image/jpeg'
    images.push(`data:${mime};base64,${Buffer.from(file.bytes).toString('base64')}`)
  }
  return images
}

/** ข้อมูลหน้าใบเบิกทั้งหมด (รวม QR) — supabase ใช้อ่านรายการลูกของวงเงินสดย่อย */
export async function buildVoucherData(supabase: ServiceClient, claim: VoucherClaim): Promise<PaymentVoucherData> {
  // Calculate tax — amount คือยอดรวมก่อนภาษีแล้ว (createClaim เก็บ unit_price × quantity)
  // ห้ามคูณ quantity ซ้ำ: เคยทำให้ใบที่จำนวนมากกว่า 1 พิมพ์ยอดเกินหน้าจอ
  const totalBeforeTax = Number(claim.amount) || 0
  const vatMode = claim.vat_mode || 'none'
  const whtRate = Number(claim.withholding_tax_rate) || 0
  const tax = calcTax(totalBeforeTax, vatMode, whtRate)

  // Build description
  const descParts: string[] = []
  if (claim.title) descParts.push(claim.title)
  if (claim.description) descParts.push(claim.description)

  // Build items
  const items = [{
    no: 1,
    description: descParts.join(' - '),
    amount: totalBeforeTax,
  }]

  // Build voucher data
  const voucherData: PaymentVoucherData = {
    claimNumber: claim.claim_number || '',
    date: formatThaiDate(claim.expense_date || claim.created_at),
    payeeName: claim.account_holder_name || claim.submitter?.full_name || '',
    paymentMethod: claim.bank_name ? 'transfer' : 'cash',
    bankName: claim.bank_name || undefined,
    accountName: claim.account_holder_name || undefined,
    accountNumber: claim.bank_account_number || undefined,
    description: claim.description || undefined,
    items,
    totalAmount: totalBeforeTax,
    vatAmount: tax.vatAmount > 0 ? tax.vatAmount : undefined,
    whtAmount: tax.whtAmount > 0 ? tax.whtAmount : undefined,
    netAmount: tax.netPayable,
    vatMode: vatMode !== 'none' ? vatMode : undefined,
    whtRate: whtRate > 0 ? whtRate : undefined,
    receiverName: claim.account_holder_name || claim.submitter?.full_name || undefined,
    approverName: claim.approver?.full_name || undefined,
  }

  // ── Advance (ทดลองจ่าย) overrides ──
  if (claim.claim_type === 'advance') {
    const actualItems = Array.isArray(claim.actual_spent_items) ? claim.actual_spent_items : []
    const actualSpent = claim.actual_spent_amount != null ? Number(claim.actual_spent_amount) : null
    const refundAmount = claim.refund_amount != null ? Number(claim.refund_amount) : 0

    voucherData.isAdvance = true
    voucherData.docTitle = 'เงินทดลองจ่าย'
    voucherData.docTitleEn = 'ADVANCE PAYMENT VOUCHER'
    voucherData.advanceAmount = totalBeforeTax
    voucherData.actualSpent = actualSpent ?? undefined
    voucherData.refundAmount = refundAmount

    // Table = itemized actual spend once settled; otherwise keep the advance line
    if (actualItems.length > 0) {
      voucherData.items = actualItems.map((it: { description?: string; amount?: number }, i: number) => ({
        no: i + 1,
        description: it.description || '(ไม่ระบุ)',
        amount: Number(it.amount) || 0,
      }))
      const sum = actualSpent ?? voucherData.items.reduce((a, b) => a + b.amount, 0)
      voucherData.totalAmount = sum
      voucherData.netAmount = sum
      // Advance has no VAT/WHT
      voucherData.vatAmount = undefined
      voucherData.whtAmount = undefined
    }

    // Refund proof page — slip images only
    const slipUrls = Array.isArray(claim.refund_slip_urls) ? claim.refund_slip_urls : []
    if (refundAmount > 0 && slipUrls.length > 0) {
      const images = await slipImages(slipUrls)
      if (images.length > 0) {
        voucherData.refundSlipImages = images
        voucherData.refundConfirmedAt = claim.refund_confirmed_at
          ? formatThaiDate(claim.refund_confirmed_at)
          : claim.advance_settled_at
            ? formatThaiDate(claim.advance_settled_at)
            : undefined
        voucherData.refundPayerName = claim.account_holder_name || claim.submitter?.full_name || undefined
        voucherData.refundBankName = claim.bank_name || undefined
        voucherData.refundAccountNumber = claim.bank_account_number || undefined
        voucherData.refundAccountName = claim.account_holder_name || undefined
      }
    }
  }

  // ── Petty cash FUND (วงเงินสดย่อยประจำเดือน) — monthly summary ──
  // Top-ups (petty_cash + fund_id) and box expenses fall through to the
  // normal voucher; only the fund itself gets the monthly-report layout.
  if (claim.claim_type === 'petty_cash' && !claim.pettycash_fund_id) {
    // Children: expenses (any type + fund_id) and top-ups (petty_cash + fund_id)
    const { data: childRows } = await supabase
      .from('expense_claims')
      .select('claim_number, claim_type, title, amount, expense_date, status, refund_amount')
      .eq('pettycash_fund_id', claim.id)
      .order('expense_date', { ascending: true })
    type Child = {
      claim_number: string; claim_type: string; title: string | null; amount: unknown
      expense_date: string | null; status: string; refund_amount: unknown
    }
    const live = ((childRows || []) as Child[]).filter(c => !['cancelled', 'rejected'].includes(c.status))
    const topups = live.filter(c => c.claim_type === 'petty_cash')
    const expenses = live.filter(c => c.claim_type !== 'petty_cash')

    // Mirror the app's balance math: the initial only counts once the fund
    // was actually paid out, and every sum is rounded to satang.
    const round2 = (n: number) => Math.round(n * 100) / 100
    const funded = ['paid', 'refund_confirmed'].includes(claim.status || '')
    const nominal = round2(Number(claim.amount) || 0)
    const initial = funded ? nominal : 0
    const topupPaid = round2(topups.filter(t => t.status === 'paid').reduce((s, t) => s + (Number(t.amount) || 0), 0))
    // Fund-linked advance with confirmed refund: leftover went back in the box.
    const effAmount = (e: { claim_type: string; status: string; amount: unknown; refund_amount?: unknown }) =>
      round2((Number(e.amount) || 0) - (e.claim_type === 'advance' && e.status === 'refund_confirmed' ? (Number(e.refund_amount) || 0) : 0))
    const spent = round2(expenses.reduce((s, e) => s + effAmount(e), 0))

    voucherData.isPettyCash = true
    voucherData.docTitle = 'สรุปเงินสดย่อยประจำเดือน'
    voucherData.docTitleEn = 'PETTY CASH MONTHLY SUMMARY'
    voucherData.pettyOpening = initial
    voucherData.pettyTopup = topupPaid
    voucherData.pettyStarting = round2(initial + topupPaid)
    voucherData.pettySpent = spent
    voucherData.pettyClosing = round2(initial + topupPaid - spent)
    voucherData.pettyPeriodStart = claim.pettycash_period_start || undefined
    voucherData.pettyPeriodEnd = claim.pettycash_period_end || undefined
    voucherData.vatAmount = undefined
    voucherData.whtAmount = undefined

    if (expenses.length > 0) {
      voucherData.items = expenses.map((e, i) => ({
        no: i + 1,
        date: e.expense_date || undefined,
        description: `${e.title || '(ไม่ระบุ)'}  [${e.claim_number}]`,
        amount: effAmount(e),
      }))
      voucherData.totalAmount = spent
      voucherData.netAmount = spent
    } else {
      // No expenses yet — the voucher doubles as the initial disbursement doc
      // (nominal = requested amount, shown even before payout).
      voucherData.items = [{ no: 1, description: claim.title || 'เงินสดย่อยสำรอง Office', amount: nominal }]
      voucherData.totalAmount = nominal
      voucherData.netAmount = nominal
    }

    // Month-end return proof — reuse the advance refund page for the leftover
    // that was returned to the company.
    const pettyRefund = claim.refund_amount != null ? Number(claim.refund_amount) : 0
    const pettySlipUrls = Array.isArray(claim.refund_slip_urls) ? claim.refund_slip_urls : []
    if (pettyRefund > 0 && pettySlipUrls.length > 0) {
      const images = await slipImages(pettySlipUrls)
      if (images.length > 0) {
        voucherData.refundSlipImages = images
        voucherData.refundAmount = pettyRefund
        voucherData.refundConfirmedAt = claim.pettycash_closed_at ? formatThaiDate(claim.pettycash_closed_at) : undefined
        voucherData.refundPayerName = claim.account_holder_name || claim.submitter?.full_name || undefined
        voucherData.refundBankName = claim.bank_name || undefined
        voucherData.refundAccountNumber = claim.bank_account_number || undefined
        voucherData.refundAccountName = claim.account_holder_name || undefined
      }
    }
  }

  // Generate QR Code as base64 PNG data URL
  // Content = claim number for document verification
  const qrContent = claim.claim_number || claim.id
  try {
    const qrDataUrl = await QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 200,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
    voucherData.qrCodeDataUrl = qrDataUrl
  } catch (qrErr) {
    console.warn('QR code generation failed:', qrErr)
  }

  return voucherData
}

/** PDF หน้าใบเบิก (react-pdf) — ต้องรันบน Node runtime (อ่านฟอนต์จาก fs) */
export async function renderVoucherPdf(data: PaymentVoucherData): Promise<Uint8Array> {
  const buf = await renderToBuffer(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    React.createElement(PaymentVoucherPDF, { data }) as any
  )
  return new Uint8Array(buf)
}
