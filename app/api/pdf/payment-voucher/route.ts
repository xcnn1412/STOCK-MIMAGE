import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { PaymentVoucherPDF } from '@/components/pdf/payment-voucher'
import type { PaymentVoucherData } from '@/components/pdf/payment-voucher'
import { createServiceClient } from '@/lib/supabase-server'
import QRCode from 'qrcode'

// Force Node.js runtime for @react-pdf/renderer
export const runtime = 'nodejs'

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

// ============================================================================
// Format date to Thai
// ============================================================================
function formatThaiDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ]
  const day = d.getDate()
  const month = thaiMonths[d.getMonth()]
  const year = d.getFullYear() + 543 // พ.ศ.
  return `${day} ${month} ${year}`
}

// ============================================================================
// GET handler
// ============================================================================
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const claimId = searchParams.get('id')
    if (!claimId) {
      return NextResponse.json({ error: 'Missing claim ID' }, { status: 400 })
    }

    // Use service client to fetch claim data
    const supabase = createServiceClient()

    // Fetch claim data
    const { data: claim, error } = await supabase
      .from('expense_claims')
      .select(`
        *,
        submitter:profiles!expense_claims_submitted_by_fkey(id, full_name),
        approver:profiles!expense_claims_approved_by_fkey(id, full_name)
      `)
      .eq('id', claimId)
      .single()

    if (error || !claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    }

    // Calculate tax
    const amount = Number(claim.amount) || 0
    const quantity = Number(claim.quantity) || 1
    const totalBeforeTax = amount * quantity
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

    // Generate QR Code as base64 PNG data URL
    // Content = claim number for document verification
    const qrContent = claim.claim_number || claimId
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

    // Render PDF
    const pdfBuffer = await renderToBuffer(
      React.createElement(PaymentVoucherPDF, { data: voucherData }) as any
    )

    // Return PDF — convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="payment-voucher-${claim.claim_number || claimId}.pdf"`,
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err: any) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: err?.message },
      { status: 500 }
    )
  }
}
