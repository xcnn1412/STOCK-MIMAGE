import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import {
  VOUCHER_CLAIM_SELECT, buildVoucherData, canViewClaimDocs, renderVoucherPdf,
} from '@/lib/claim-voucher'

// Force Node.js runtime for @react-pdf/renderer
export const runtime = 'nodejs'

// ============================================================================
// GET handler — ตรรกะหน้าใบเบิกอยู่ที่ lib/claim-voucher.ts (ชุดเอกสารใช้ร่วม)
// คำตอบ/สถานะ/หัวต้องเหมือนเดิม — scripts/claim-voucher.check.ts เทียบกับผลอ้างอิงของ route เดิม
// ============================================================================
export async function GET(req: NextRequest) {
  try {
    // This route lives under /api, which proxy.ts does NOT session-guard —
    // so authenticate here or the voucher (bank account, ID) leaks to anyone
    // holding a claim UUID.
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const claimId = searchParams.get('id')
    if (!claimId) {
      return NextResponse.json({ error: 'Missing claim ID' }, { status: 400 })
    }

    // Use service client to fetch claim data
    const supabase = createServiceClient()

    const { data: claim, error } = await supabase
      .from('expense_claims')
      .select(VOUCHER_CLAIM_SELECT)
      .eq('id', claimId)
      .single()

    if (error || !claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
    }

    // Non-admins may only export their own claim's voucher — except petty-cash
    // docs (fund / top-up / box expense), which belong to the shared office box.
    if (!canViewClaimDocs(session, claim)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const pdf = await renderVoucherPdf(await buildVoucherData(supabase, claim))

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="payment-voucher-${claim.claim_number || claimId}.pdf"`,
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: (err as { message?: string } | null)?.message },
      { status: 500 }
    )
  }
}
