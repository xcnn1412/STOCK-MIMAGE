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
// UUID แบบหลวม (ตัวอักษร hex + ขีด 36 ตัว) — กัน id แปลกๆ เข้า query/ชื่อไฟล์
const ID_RE = /^[0-9a-f-]{36}$/i
// ชื่อไฟล์ใน Content-Disposition ต้องเป็น ASCII ล้วน (แบบ claim-bundle)
const asciiName = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_')

export async function GET(req: NextRequest) {
  try {
    const claimId = new URL(req.url).searchParams.get('id')
    if (!claimId) {
      return NextResponse.json({ error: 'Missing claim ID' }, { status: 400 })
    }
    if (!ID_RE.test(claimId)) {
      return NextResponse.json({ error: 'Invalid claim ID' }, { status: 400 })
    }

    // This route lives under /api, which proxy.ts does NOT session-guard —
    // so authenticate here or the voucher (bank account, ID) leaks to anyone
    // holding a claim UUID.
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
        'Content-Disposition': `inline; filename="payment-voucher-${asciiName(claim.claim_number || claimId)}.pdf"`,
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: 'Failed to generate PDF' }, // รายละเอียดอยู่ใน console.error เท่านั้น (L8)
      { status: 500 }
    )
  }
}
