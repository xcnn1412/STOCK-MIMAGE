/**
 * scripts/salary-pdf-check.ts — ตรวจว่า PDF สลิปเงินเดือนเรนเดอร์ผ่านด้วยข้อมูลปลอม
 * ในหน่วยความจำ (ไม่แตะ DB) 2 เคส: พนักงานประจำ (OT + ค่าสตาฟ + เบิ้ลต่างจังหวัด +
 * แก้มือ + รายการปรับมือ) และฟรีแลนซ์ (รันเนอร์ กรอกแล้ว/ยังไม่กรอก + ลายน้ำ "ร่าง")
 *
 *   npx tsx scripts/salary-pdf-check.ts        (ต้องรันจาก repo root; ฟอนต์อ่านจาก ./public/fonts)
 *   OUT_DIR=... npx tsx scripts/salary-pdf-check.ts   (เปลี่ยนที่เก็บไฟล์ผลลัพธ์)
 *
 * ตรวจสองชั้น (แนวเดียวกับ scripts/doc-pdf-check.ts ที่ตรวจแค่ไฟล์):
 *   1. ไฟล์ — ไม่ throw, ขึ้นต้นด้วย %PDF, ใหญ่พอว่าไม่ใช่หน้าเปล่า
 *   2. ข้อความ — ดึงข้อความจาก element tree ที่คอมโพเนนต์คืนออกมา แล้วเช็คว่ามีคำที่ต้องมี
 *      (ponytail: ไม่ถอดข้อความจากไบต์ PDF — ฟอนต์ถูก subset เป็น glyph id ต้องเขียน
 *      ตัวอ่าน ToUnicode CMap เอง ทั้งที่ tree คือแหล่งเดียวกับที่ถูกวาดลงกระดาษอยู่แล้ว)
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { SalarySlipPDF, type SalarySlipPdfData } from '../components/pdf/salary-slip-pdf'
import type { SalaryAdjustment, SalaryLine } from '../app/(authenticated)/salary/compute'
import { numberToThaiBahtText } from '../lib/thai-baht-text'

const OUT_DIR = process.env.OUT_DIR || path.join(os.tmpdir(), 'salary-pdf-check')

// วันพิมพ์คงที่ เพื่อให้ผลลัพธ์เหมือนเดิมทุกครั้งที่รัน
const PRINTED_AT = '2026-08-28'

// ────────────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────────────

function line(l: Partial<SalaryLine> & Pick<SalaryLine, 'key' | 'kind' | 'date' | 'label'>): SalaryLine {
  return { computed_amount: 0, amount: null, ...l }
}

/** ยอดสุทธิตามสูตร compute.ts §7 — คิดจาก fixture เองจะได้ไม่พิมพ์เลขผิดมือ */
function netTotal(base: number, lines: SalaryLine[], adjustments: SalaryAdjustment[]): number {
  const lineTotal = lines.reduce((sum, l) => sum + (l.amount ?? l.computed_amount ?? 0), 0)
  const adjustTotal = adjustments.reduce((sum, a) => sum + a.amount, 0)
  return base + lineTotal + adjustTotal
}

// ── 1. พนักงานประจำ · จ่ายแล้ว ──────────────────────────────────────────────
const fulltimeLines: SalaryLine[] = [
  line({
    key: 'ot:2026-07-28', kind: 'ot', date: '2026-07-28',
    label: 'OT 2.5 ชม.', hours: 2.5, computed_amount: 375, amount: 375,
  }),
  line({
    key: 'site:2026-07-28:c1:onsite_staff', kind: 'site', date: '2026-07-28',
    checkin_id: 'c1', duty: 'onsite_staff',
    label: 'ออกงานสตาฟ · งานแต่งคุณเอ', computed_amount: 700, amount: 700,
  }),
  line({
    key: 'oop:2026-07-28:c1', kind: 'oop', date: '2026-07-28', checkin_id: 'c1',
    label: 'เบิ้ลต่างจังหวัด · งานแต่งคุณเอ', computed_amount: 300, amount: 300,
  }),
  line({
    key: 'ot:2026-08-05', kind: 'ot', date: '2026-08-05',
    label: 'OT 1 ชม.', hours: 1, computed_amount: 150, amount: 150,
  }),
  line({
    key: 'site:2026-08-05:c2:drive_booth', kind: 'site', date: '2026-08-05',
    checkin_id: 'c2', duty: 'drive_booth',
    label: 'ขับรถออกบูธ · งานเปิดตัวสินค้า',
    computed_amount: 300, amount: 500, override_note: 'ขับไกลกว่าปกติ',
  }),
]

const fulltimeAdjustments: SalaryAdjustment[] = [
  { id: 'a1', label: 'โบนัสประจำงวด', amount: 2000 },
  { id: 'a2', label: 'หักประกันสังคม', amount: -750 },
]

const fulltimeTotal = netTotal(18000, fulltimeLines, fulltimeAdjustments)

const fulltime: SalarySlipPdfData = {
  slip: {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'paid',
    employment_type: 'fulltime',
    base_salary: 18000,
    lines: fulltimeLines,
    adjustments: fulltimeAdjustments,
    total: fulltimeTotal,
    // เคยจ่ายไปแล้วด้วยยอดเก่า แล้วถูกเปิดแก้ + ปิดงวดใหม่ → ต้องมีทั้งประวัติและส่วนต่าง
    reopen_history: [
      {
        at: '2026-08-27T06:00:00Z',
        by_name: 'แอดมินหนึ่ง',
        reason: 'เวลาออกวันที่ 5 ผิด',
        total_before: fulltimeTotal - 200,
        total_after: fulltimeTotal,
      },
    ],
    paid_total: fulltimeTotal - 200,
    finalized_at: '2026-08-26T03:00:00Z',
    paid_at: '2026-08-27T04:30:00Z',
    period_key: '2026-08',
    period_start: '2026-07-26',
    period_end: '2026-08-25',
    full_name: 'นายสมชาย ใจดี',
    nickname: 'ชาย',
    department: 'ฝ่ายปฏิบัติการ',
    bank_name: 'ธนาคารกสิกรไทย',
    bank_account_number: '123-4-56789-0',
    account_holder_name: 'สมชาย ใจดี',
  },
  printedAt: PRINTED_AT,
}

// ── 2. ฟรีแลนซ์ · ร่าง (รันเนอร์ยังกรอกไม่ครบ) ───────────────────────────────
const freelanceLines: SalaryLine[] = [
  line({
    key: 'runner:2026-08-10:runner', kind: 'runner', date: '2026-08-10', duty: 'runner',
    label: 'รันเนอร์ · 3 เช็คอิน', computed_amount: 0, amount: 1200,
  }),
  line({
    key: 'runner:2026-08-12:runner', kind: 'runner', date: '2026-08-12', duty: 'runner',
    label: 'รันเนอร์ · 2 เช็คอิน', computed_amount: 0, amount: null,
  }),
]

const freelanceTotal = netTotal(0, freelanceLines, [])

const freelance: SalarySlipPdfData = {
  slip: {
    id: '00000000-0000-0000-0000-000000000002',
    status: 'draft',
    employment_type: 'freelance',
    // ฟรีแลนซ์ไม่คิดฐาน — ใส่ค่าไว้เพื่อพิสูจน์ว่า PDF ไม่เอาไปแสดง/ไม่เอาไปบวก
    base_salary: 9999,
    lines: freelanceLines,
    adjustments: [],
    total: freelanceTotal,
    finalized_at: null,
    paid_at: null,
    period_key: '2026-08',
    period_start: '2026-07-26',
    period_end: '2026-08-25',
    full_name: 'นางสาวสมหญิง ตั้งใจดี',
    nickname: 'หญิง',
    department: null,
    bank_name: null,
    bank_account_number: null,
    account_holder_name: null,
  },
  printedAt: PRINTED_AT,
}

// ────────────────────────────────────────────────────────────────────────────
// Text extraction — เดินลง element tree ที่คอมโพเนนต์คืนออกมา
// ────────────────────────────────────────────────────────────────────────────

function extractText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).filter(Boolean).join(' ')
  if (React.isValidElement(node)) {
    // primitive ของ @react-pdf (Text/View/Page/Document) เป็น "สตริง" — มีแต่ children ให้เดินต่อ
    // ส่วน type ที่เป็นฟังก์ชันคือคอมโพเนนต์ของเราเอง ต้องเรียกก่อนถึงจะเห็นข้อความข้างใน
    if (typeof node.type === 'function') {
      return extractText((node.type as (p: unknown) => unknown)(node.props))
    }
    return extractText((node.props as { children?: unknown }).children)
  }
  return ''
}

// ────────────────────────────────────────────────────────────────────────────
// Cases
// ────────────────────────────────────────────────────────────────────────────

interface Case {
  name: string
  data: SalarySlipPdfData
  /** ข้อความที่ต้องมีในสลิป */
  expect: string[]
  /** ข้อความที่ต้องไม่มี */
  notExpect: string[]
}

const cases: Case[] = [
  {
    name: 'fulltime-paid',
    data: fulltime,
    expect: [
      'สลิปเงินเดือน',
      numberToThaiBahtText(fulltimeTotal),
      'สิงหาคม 2569',
      'เงินเดือนฐาน',
      'จ่ายแล้ว',
      'ประเภทการจ้าง',
      'ค่าสตาฟ · ออกงานสตาฟ · งานแต่งคุณเอ',
      'เบิ้ลต่างจังหวัด · งานแต่งคุณเอ',
      'OT 2.5 ชม.',
      'ขับไกลกว่าปกติ',
      'โบนัสประจำงวด',
      'ธนาคารกสิกรไทย',
      'ยอดสุทธิ',
      'เอกสารนี้ออกโดยระบบ',
      '28 สิงหาคม 2569',
      'ประวัติการแก้ไข',
      'ครั้งที่ 1 วันที่ 27 สิงหาคม 2569',
      'เวลาออกวันที่ 5 ผิด',
      'ยอดที่จ่ายไปแล้ว',
      '(ต้องโอนเพิ่ม)',
    ],
    // ป้ายชนิดต้องไม่ซ้ำกับ label ที่ขึ้นต้นด้วยชื่อชนิดอยู่แล้ว + สลิปที่ปิดงวดแล้วไม่มีลายน้ำ
    notExpect: ['OT · OT', 'เบิ้ลต่างจังหวัด · เบิ้ลต่างจังหวัด', 'ร่าง / DRAFT'],
  },
  {
    name: 'freelance-draft',
    data: freelance,
    expect: [
      'สลิปเงินเดือน',
      numberToThaiBahtText(freelanceTotal),
      'ฟรีแลนซ์',
      'ร่าง / DRAFT',
      'รันเนอร์ · 3 เช็คอิน',
      'ยังไม่กรอก',
      'ยอดสุทธิ',
    ],
    // ฟรีแลนซ์ไม่มีบรรทัดเงินเดือนฐาน และยอดฐานต้องไม่โผล่ที่ไหนเลย
    notExpect: ['เงินเดือนฐาน', '9,999.00', 'รันเนอร์ · รันเนอร์'],
  },
]

// ────────────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  let failed = 0

  for (const c of cases) {
    try {
      const buf = await renderToBuffer(
        React.createElement(SalarySlipPDF, c.data) as unknown as React.ReactElement<DocumentProps>
      )
      const file = path.join(OUT_DIR, `${c.name}.pdf`)
      fs.writeFileSync(file, buf)

      const magic = buf.subarray(0, 4).toString('latin1')
      if (magic !== '%PDF') throw new Error(`ไม่ใช่ไฟล์ PDF (magic = ${JSON.stringify(magic)})`)
      if (buf.length <= 5 * 1024) throw new Error(`ไฟล์เล็กเกินไป (${buf.length} bytes)`)

      const text = extractText(SalarySlipPDF(c.data))
      const missing = c.expect.filter(t => !text.includes(t))
      if (missing.length) throw new Error(`ไม่พบข้อความ: ${missing.map(t => `"${t}"`).join(', ')}`)
      const unexpected = c.notExpect.filter(t => text.includes(t))
      if (unexpected.length) {
        throw new Error(`เจอข้อความที่ไม่ควรมี: ${unexpected.map(t => `"${t}"`).join(', ')}`)
      }

      console.log(
        `✓ ${c.name}.pdf  ${(buf.length / 1024).toFixed(1)} KB  ` +
        `· ตรวจข้อความ ${c.expect.length + c.notExpect.length} รายการ  → ${file}`
      )
    } catch (err) {
      failed++
      console.error(`✗ ${c.name}: ${(err as Error).message}`)
    }
  }

  if (failed) {
    console.error(`\n${failed}/${cases.length} เคสไม่ผ่าน`)
    process.exit(1)
  }
  console.log(`\n${cases.length}/${cases.length} เคสผ่าน`)
}

main().catch((e) => { console.error(e); process.exit(1) })
