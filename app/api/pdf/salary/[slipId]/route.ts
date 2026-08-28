import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { SalarySlipPDF } from '@/components/pdf/salary-slip-pdf'
import { getSlipForView } from '@/app/(authenticated)/salary/actions'

// @react-pdf/renderer ต้องใช้ Node runtime (fs สำหรับฟอนต์)
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * ท่อนหนึ่งของชื่อไฟล์ — ต้องเป็น ASCII ล้วน (ชื่อเล่นเป็นภาษาไทยได้)
 * ตัดจนไม่เหลืออะไรก็ใช้ค่าสำรอง (8 ตัวแรกของ id) เพื่อให้ยังแยกไฟล์ของแต่ละคนออกจากกัน
 */
function asciiTag(value: string | null, fallback: string): string {
  const slug = (value || '').replace(/[^A-Za-z0-9._-]+/g, '')
  return slug || fallback.slice(0, 8)
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slipId: string }> }) {
  try {
    const { slipId } = await ctx.params
    if (!slipId || !UUID_RE.test(slipId)) {
      return NextResponse.json({ error: 'ไม่พบสลิป' }, { status: 404 })
    }

    // /api ไม่ผ่าน proxy.ts — สิทธิ์ทั้งหมดอยู่ใน getSlipForView (ตัวเดียวกับหน้าเว็บ):
    // ตรวจ session เอง (รองรับคุกกี้ legacy) · admin เห็นทุกใบ · เจ้าของเห็นเฉพาะที่ปิดงวดแล้ว
    // · คนอื่นได้ข้อความเดียวกับ "ไม่พบ" — ไม่ตอบ 403 เพื่อไม่ให้รู้ว่าสลิปนั้นมีจริง
    const res = await getSlipForView(slipId)
    if ('error' in res) {
      const unauthorized = res.error === 'Unauthorized'
      return NextResponse.json(
        { error: unauthorized ? 'กรุณาเข้าสู่ระบบ' : 'ไม่พบสลิป' },
        { status: unauthorized ? 401 : 404 }
      )
    }

    const { slip } = res
    // createElement คืน ReactElement<props ของเรา> — renderToBuffer ประกาศรับ
    // ReactElement<DocumentProps> จึงต้องแคสต์ (คอมโพเนนต์คืน <Document> อยู่แล้ว)
    const pdfBuffer = await renderToBuffer(
      React.createElement(SalarySlipPDF, { slip }) as unknown as React.ReactElement<DocumentProps>
    )

    // ทุกท่อนของชื่อไฟล์กรองเหลือ ASCII ก่อน — กันทั้งชื่อไทยและอักขระที่ทำให้ header เพี้ยน
    const period = asciiTag(slip.period_key, 'slip')
    const filename = `salary-slip-${period}-${asciiTag(slip.nickname, slip.id)}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err) {
    console.error('Salary slip PDF generation error:', err)
    return NextResponse.json(
      { error: 'สร้าง PDF ไม่สำเร็จ', details: err instanceof Error ? err.message : undefined },
      { status: 500 }
    )
  }
}
