import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { DocumentPDF, type DocumentPdfData } from '@/components/pdf/document-pdf'
import { createServiceClient } from '@/lib/supabase-server'
import { stampPdf } from '@/lib/pdf-stamp'
import { getSession } from '@/app/(authenticated)/documents/session'
import {
  stampModeOf,
  type DocBrandRow, type DocTemplateRow, type DocumentItemRow, type DocumentRow,
} from '@/app/(authenticated)/documents/doc-types'

// @react-pdf/renderer ต้องใช้ Node runtime (fs สำหรับฟอนต์)
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // /api ไม่ผ่าน proxy.ts — ต้องเช็ค session เองที่นี่
    // ใช้ getSession ของโมดูลเอกสาร: รองรับคุกกี้ legacy เหมือน actions ทุกตัว
    const { userId, role } = await getSession()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await ctx.params
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'ไม่พบเอกสาร' }, { status: 404 })
    }

    const supabase = createServiceClient()

    // ponytail: query ตรงแทนที่จะเรียก getDocument() (server action import จาก route ไม่ได้)
    // — จึงต้อง copy กติกาการมองเห็นมาด้วย ให้ตรงกับ actions.ts::getDocument
    const { data: docRow } = await supabase
      .from('documents')
      .select('*, creator:profiles!documents_created_by_fkey(id, full_name)')
      .eq('id', id)
      .single()

    if (!docRow) return NextResponse.json({ error: 'ไม่พบเอกสาร' }, { status: 404 })

    const doc = docRow as unknown as DocumentRow
    // admin เห็นทุกใบ; คนอื่นเห็นเฉพาะใบที่ออกเลขแล้ว หรือใบที่ตัวเองสร้าง
    if (role !== 'admin' && !doc.doc_no && doc.created_by !== userId) {
      return NextResponse.json({ error: 'ไม่พบเอกสาร' }, { status: 404 })
    }

    const search = new URL(req.url).searchParams
    const attach = search.get('disposition') === 'attachment'
    const meta = (doc.meta || {}) as Record<string, unknown>

    // ── เอกสารอัปโหลด (UP) — ไฟล์ต้นฉบับอยู่ใน bucket 'doc-files' แบบ private ──
    // ประตูเดียวที่เข้าถึงไฟล์ได้คือ route นี้ (ใช้กติกาการมองเห็นชุดเดียวกับ PDF อื่น)
    // Uint8Array<ArrayBuffer> ชัดเจน — NextResponse รับ BodyInit ที่ไม่ใช่ SharedArrayBuffer
    let source: Uint8Array<ArrayBuffer> | null = null
    if (doc.doc_type === 'UP') {
      const filePath = String(meta.file ?? '').trim()
      if (!filePath) return NextResponse.json({ error: 'ยังไม่ได้แนบไฟล์ PDF' }, { status: 404 })

      const { data: blob, error: dlErr } = await supabase.storage.from('doc-files').download(filePath)
      if (dlErr || !blob) return NextResponse.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 })
      source = new Uint8Array(await blob.arrayBuffer())

      // ?raw=1 = ไฟล์ต้นฉบับที่อัปโหลดมา (ยังไม่ประทับ)
      if (search.get('raw') === '1') {
        const rawName = String(meta.file_name ?? '') || `${doc.doc_no || doc.draft_no}.pdf`
        return new NextResponse(source, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `${attach ? 'attachment' : 'inline'}; filename="${encodeURIComponent(rawName)}"`,
            'Cache-Control': 'no-store',
            'X-Frame-Options': 'SAMEORIGIN',
          },
        })
      }
    }

    const [itemsRes, brandRes, approverRes, refRes, tplRes] = await Promise.all([
      supabase.from('document_items').select('*').eq('document_id', id).order('line_no', { ascending: true }),
      supabase.from('doc_brands').select('*').eq('code', doc.brand_code).maybeSingle(),
      doc.approved_by
        ? supabase.from('profiles').select('full_name, signature_url').eq('id', doc.approved_by).maybeSingle()
        : Promise.resolve({ data: null }),
      doc.ref_document_id
        ? supabase.from('documents').select('doc_no, doc_type').eq('id', doc.ref_document_id).maybeSingle()
        : Promise.resolve({ data: null }),
      // ผูกเวอร์ชันแม่แบบตอนออกเลข; ร่าง/preview ใช้เวอร์ชัน active ปัจจุบัน
      doc.template_version_id
        ? supabase.from('doc_templates').select('*').eq('id', doc.template_version_id).maybeSingle()
        : supabase
            .from('doc_templates')
            .select('*')
            .eq('brand_code', doc.brand_code)
            .eq('doc_type', doc.doc_type)
            .eq('is_active', true)
            .maybeSingle(),
    ])

    const data: DocumentPdfData = {
      doc,
      items: (itemsRes.data || []) as unknown as DocumentItemRow[],
      brand: (brandRes.data || null) as unknown as DocBrandRow | null,
      template: (tplRes.data || null) as unknown as DocTemplateRow | null,
      approver: (approverRes.data || null) as { full_name: string | null; signature_url: string | null } | null,
      creator: doc.creator ? { full_name: doc.creator.full_name } : null,
      refDoc: (refRes.data || null) as { doc_no: string | null; doc_type: string } | null,
    }

    const pdfBuffer = source
      ? await stampPdf({
          source, doc, brand: data.brand, template: data.template, mode: stampModeOf(meta),
        })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : await renderToBuffer(React.createElement(DocumentPDF, data) as any)

    const filename = `${doc.doc_no || doc.draft_no}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${attach ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err: any) {
    console.error('Document PDF generation error:', err)
    return NextResponse.json(
      { error: 'สร้าง PDF ไม่สำเร็จ', details: err?.message },
      { status: 500 }
    )
  }
}
