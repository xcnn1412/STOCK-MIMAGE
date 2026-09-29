import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { logActivity } from '@/lib/logger'
import {
  VOUCHER_CLAIM_SELECT, buildVoucherData, canViewClaimDocs, renderVoucherPdf, type VoucherClaim,
} from '@/lib/claim-voucher'
import { collectClaimFiles, fetchClaimFile, mapLimit, type ClaimFilesSource } from '@/lib/claim-files'
import {
  BundleTooLargeError, buildBundle,
  type BundleClaimInput, type BundleInputFile, type BundleOptions, type BundleReport,
} from '@/lib/claim-bundle'

// react-pdf อ่านฟอนต์จาก fs + pdf-lib ใช้หน่วยความจำมาก — Node runtime เท่านั้น
export const runtime = 'nodejs'

// ============================================================================
// GET /api/pdf/claim-bundle?ids=<uuid>[,<uuid>…]&layout=one|two&duplex=0|1
// "จับชุดเอกสาร": หน้าใบเบิก + ไฟล์แนบของแต่ละใบ เป็น PDF เดียวพร้อมพิมพ์เข้าแฟ้ม
// สร้างสดทุกครั้ง ไม่เก็บลงสตอเรจ (พื้นที่เก็บไฟล์เคยเต็ม)
// อยู่ใต้ /api ซึ่ง proxy.ts ไม่ได้ตรวจ session — ต้องตรวจเองก่อนทำอย่างอื่น
// ============================================================================

const MAX_CLAIMS = 20
const MAX_FILES_PER_CLAIM = 60
const MAX_PAGES = 600
/** ดึงไฟล์พร้อมกันไม่เกินนี้ — ไม่ถล่มสตอเรจ และไม่ถือไฟล์ในหน่วยความจำพร้อมกันมากเกิน */
const FETCH_CONCURRENCY = 6
/**
 * ไฟล์แนบรวมทั้งคำขอ — pdf-lib ใช้หน่วยความจำหลายเท่าของขนาดไฟล์ ชุดใหญ่เกินไปทำให้ server ล้มทั้งตัว
 * ชุดจริงทั่วไปราว 12MB (20 ใบ × ~4 ไฟล์ × ~150KB) เพดานนี้จึงกันเฉพาะกรณีผิดปกติ เช่นใบที่แนบ PDF สแกนหลายสิบไฟล์
 */
const MAX_TOTAL_BYTES = 100 * 1024 * 1024
/** รายการไฟล์ที่รวมไม่ได้ที่ใส่ในหัว X-Bundle-Report — หัว HTTP ที่ใหญ่เกิน proxy จะทิ้งทั้งคำตอบ (ตัว PDF มีหน้าแจ้งครบทุกไฟล์เสมอ) */
const MAX_FAILED_IN_HEADER = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (status: number, error: string) => NextResponse.json({ error }, { status })

/** ชื่อไฟล์ใน Content-Disposition ต้องเป็น ASCII ล้วน */
const asciiName = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_')

type ClaimRow = VoucherClaim & ClaimFilesSource

export async function GET(req: NextRequest) {
  const session = await requireAuth()
  if (!session) return fail(401, 'กรุณาเข้าสู่ระบบก่อนจับชุดเอกสาร')

  // ── อินพุต ──
  const params = new URL(req.url).searchParams
  const ids = (params.get('ids') ?? '').split(',')
  if (ids.length > MAX_CLAIMS) return fail(400, `จับชุดได้ครั้งละไม่เกิน ${MAX_CLAIMS} ใบเบิก`)
  if (!ids.every(id => UUID_RE.test(id))) return fail(400, 'รหัสใบเบิกไม่ถูกต้อง')
  if (new Set(ids.map(id => id.toLowerCase())).size !== ids.length) return fail(400, 'มีใบเบิกซ้ำในรายการ')
  const layoutParam = params.get('layout') ?? 'one'
  if (layoutParam !== 'one' && layoutParam !== 'two') return fail(400, 'รูปแบบการวางหน้าไม่ถูกต้อง (one หรือ two)')
  const options: BundleOptions = { layout: layoutParam, duplex: params.get('duplex') === '1' }

  // หลายใบในไฟล์เดียว: แอดมินเท่านั้น — ตัดสินก่อนอ่านฐานข้อมูล (ไม่บอกด้วยซ้ำว่าใบมีอยู่ไหม)
  if (ids.length > 1 && session.role !== 'admin') return fail(403, 'จับชุดหลายใบพร้อมกันได้เฉพาะแอดมิน')

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('expense_claims')
      .select(VOUCHER_CLAIM_SELECT)
      .in('id', ids)
    if (error) {
      console.error('claim-bundle: load claims', error)
      return fail(500, 'โหลดใบเบิกไม่สำเร็จ')
    }
    const rows = (data ?? []) as ClaimRow[]
    if (rows.length !== ids.length) return fail(404, 'ไม่พบใบเบิกบางใบ')
    if (rows.some(r => !canViewClaimDocs(session, r))) return fail(403, 'คุณไม่มีสิทธิ์ดูเอกสารของใบเบิกนี้')

    // หลายใบเรียงตามเลขที่ใบเบิกจากน้อยไปมาก — เทียบเลขเป็นตัวเลข (ใบที่ 1000 มาหลัง 999)
    // ต้องเป็นกติกาเดียวกับ chunkClaims ของหน้าจอ ไม่งั้นป้าย "ชุดที่ n" กับลำดับในไฟล์จะไม่ตรงกัน
    const numberOf = (r: ClaimRow) => r.claim_number || r.id
    const byNumber = new Intl.Collator('en', { numeric: true })
    rows.sort((a, b) => byNumber.compare(numberOf(a), numberOf(b)))

    // ── เพดานไฟล์แนบต่อใบ (ก่อนดึงอะไร) ──
    const refs = rows.map(r => collectClaimFiles(r))
    const overLimit = rows.findIndex((_, i) => refs[i].length > MAX_FILES_PER_CLAIM)
    if (overLimit >= 0) {
      return fail(413, `ใบเบิก ${numberOf(rows[overLimit])} มีไฟล์แนบ ${refs[overLimit].length} ไฟล์ เกินเพดาน ${MAX_FILES_PER_CLAIM} ไฟล์ต่อใบ — กรุณาพิมพ์ใบนี้แยก`)
    }

    // ── หน้าใบเบิก (ทีละใบ — ใบไหนพังทั้งคำขอพัง พร้อมบอกเลขที่) ──
    const vouchers: Uint8Array[] = []
    for (const r of rows) {
      try {
        vouchers.push(await renderVoucherPdf(await buildVoucherData(supabase, r)))
      } catch (err) {
        console.error(`claim-bundle: voucher ${numberOf(r)}`, err)
        return fail(500, `สร้างหน้าใบเบิก ${numberOf(r)} ไม่สำเร็จ`)
      }
    }

    // ── ไฟล์แนบ: ทุกใบรวมกันดึงพร้อมกันไม่เกิน FETCH_CONCURRENCY ──
    const flat = refs.flatMap((list, ci) => list.map(ref => ({ ci, ref })))
    let totalBytes = 0
    const fetched = await mapLimit(flat, FETCH_CONCURRENCY, async ({ ref }) => {
      // เกินเพดานรวมแล้ว คำขอนี้ถูกปฏิเสธแน่ — ไม่ดึงไฟล์ที่เหลือมาถือไว้เพิ่ม
      if (totalBytes > MAX_TOTAL_BYTES) return { failReason: 'too-large' as const }
      const got = await fetchClaimFile(ref.url)
      if ('bytes' in got) totalBytes += got.bytes.byteLength
      return got
    })
    if (totalBytes > MAX_TOTAL_BYTES) {
      return fail(413, 'ไฟล์แนบของชุดนี้รวมกันเกิน 100MB — กรุณาเลือกใบเบิกให้น้อยลง หรือพิมพ์ใบที่ไฟล์ใหญ่แยก')
    }
    const files: BundleInputFile[][] = rows.map(() => [])
    flat.forEach(({ ci, ref }, i) => {
      const got = fetched[i]
      files[ci].push({
        kind: ref.kind,
        index: ref.index,
        total: ref.total,
        ...(ref.note ? { note: ref.note } : {}),
        ...('bytes' in got ? { bytes: got.bytes } : { bytes: null, failReason: got.failReason }),
      })
    })

    const input: BundleClaimInput[] = rows.map((r, ci) => ({ claimNumber: numberOf(r), voucher: vouchers[ci], files: files[ci] }))
    let result: Awaited<ReturnType<typeof buildBundle>>
    try {
      result = await buildBundle(input, options, { maxPages: MAX_PAGES })
    } catch (err) {
      if (err instanceof BundleTooLargeError) {
        return fail(413, `ชุดเอกสารมี ${err.pages} หน้า เกินเพดาน ${MAX_PAGES} หน้าต่อไฟล์ — กรุณาเลือกใบเบิกให้น้อยลง`)
      }
      throw err
    }
    const { pdf, report } = result

    const claimNumbers = rows.map(numberOf)
    const failedTotal = report.claims.reduce((n, c) => n + c.failed.length, 0)
    let room = MAX_FAILED_IN_HEADER
    const headerReport: BundleReport = {
      ...report,
      failedTotal,
      claims: report.claims.map(c => {
        const failed = c.failed.slice(0, room)
        room -= failed.length
        return { ...c, failed }
      }),
    }
    await logActivity(
      'EXPORT_CLAIM_BUNDLE',
      {
        claims: claimNumbers,
        pages: report.pages,
        failed: failedTotal,
        layout: options.layout,
        duplex: options.duplex,
      },
      undefined,
      session.userId
    )

    const more = rows.length > 1 ? `-and-${rows.length - 1}-more` : ''
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="claim-bundle-${asciiName(claimNumbers[0])}${more}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Frame-Options': 'SAMEORIGIN',
        // หน้าต่างจับชุดอ่านสรุป (จำนวนหน้า / ไฟล์ที่รวมไม่ได้) จากหัวนี้โดยไม่ต้องเปิด PDF
        'X-Bundle-Report': encodeURIComponent(JSON.stringify(headerReport)),
      },
    })
  } catch (err) {
    console.error('claim-bundle: build', err)
    return fail(500, 'จับชุดเอกสารไม่สำเร็จ กรุณาลองใหม่')
  }
}
