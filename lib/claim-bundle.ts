import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { PDFDocument, degrees, type PDFEmbeddedPage, type PDFImage, type PDFPage } from 'pdf-lib'
import {
  BundleChromePDF, STRIP_H, STRIP_MARGIN, type BundleChromePage,
} from '@/components/pdf/bundle-chrome-pdf'
import {
  BUNDLE_FAIL_REASON_TEXT, BUNDLE_KIND_LABEL,
  type BundleFailReason, type BundleFileKind, type BundleReport,
} from './claim-bundle-labels'

// ชนิดและข้อความที่หน้าจอใช้ด้วยอยู่ใน claim-bundle-labels.ts (ไฟล์นั้นไม่ import อะไร browser จึงใช้ได้)
export { BUNDLE_FAIL_REASON_TEXT, BUNDLE_KIND_LABEL }
export type { BundleFailReason, BundleFileKind, BundleReport }

// ============================================================================
// ประกอบ "ชุดเอกสาร" ของใบเบิก: หน้าใบเบิก + ไฟล์แนบ เป็น PDF เดียวพร้อมพิมพ์เข้าแฟ้ม
// ไม่แตะฐานข้อมูลและไม่ออกเครือข่าย — รับ bytes คืน bytes (ผู้เรียกดึงไฟล์มาให้เอง)
// ชนิดไฟล์ดูจากหัวไฟล์เสมอ: บน production มีไฟล์ชื่อ .png/.dng ที่เนื้อจริงเป็น JPEG
// แถบหัวกระดาษ/หน้าแจ้งวาดด้วย react-pdf (bundle-chrome-pdf.tsx) แล้ว pdf-lib วางทับ
// ponytail: pdf-lib ห้ามวาดอักษรไทยเอง (สระ/วรรณยุกต์ลอย) — เทคนิคเดียวกับ lib/pdf-stamp.ts
// ต้องรันบน Node runtime เท่านั้น (react-pdf อ่านฟอนต์จาก fs)
// ============================================================================

export interface BundleInputFile {
  kind: BundleFileKind
  /** ลำดับในชนิดเดียวกัน เริ่มที่ 1 */
  index: number
  total: number
  /** เลขที่ใบกำกับภาษี */
  note?: string
  /** null = ดึงไม่ได้ (ต้องมี failReason) */
  bytes: Uint8Array | null
  failReason?: BundleFailReason
}
export interface BundleClaimInput { claimNumber: string; voucher: Uint8Array; files: BundleInputFile[] }
export interface BundleOptions { layout: 'one' | 'two'; duplex: boolean }

export const A4 = { w: 595.28, h: 841.89 } as const

/** ลำดับชนิดในชุด (หน้าใบเบิกมาก่อนเสมอ) */
const KIND_ORDER: BundleFileKind[] = ['receipt', 'settlement', 'tax_invoice', 'refund_slip']

/** ขอบกรอบเนื้อหา = ขอบแถบ เพื่อให้แถบกับรูปตรงแนวเดียวกัน */
const MARGIN = STRIP_MARGIN
/** ช่องไฟระหว่างเส้นใต้แถบกับกรอบเนื้อหา */
const GAP = 8
/** รูปเล็กไม่ขยายเกิน 2 เท่าของจำนวนพิกเซล (1px = 1pt) — ขยายมากกว่านี้แตกจนอ่านไม่ออก */
const MAX_IMAGE_SCALE = 2

// ── ชนิดไฟล์ / EXIF ──────────────────────────────────────────────────────────

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PDF_SIG = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-

/** ตำแหน่งแรกของ needle ในช่วง [from, to) หรือ -1 */
function indexOfBytes(bytes: Uint8Array, needle: number[], from: number, to: number): number {
  const end = Math.min(to, bytes.length) - needle.length
  outer: for (let i = Math.max(0, from); i <= end; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

/** ชนิดไฟล์จากหัวไฟล์ (magic bytes) — ไม่ดูนามสกุล */
export function sniffFileType(bytes: Uint8Array): 'pdf' | 'jpeg' | 'png' | 'unsupported' {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= PNG_SIG.length && PNG_SIG.every((b, i) => bytes[i] === b)) return 'png'
  // สเปก PDF ยอมให้มีขยะนำหน้า %PDF- ได้ใน 1024 ไบต์แรก
  if (indexOfBytes(bytes, PDF_SIG, 0, 1024) >= 0) return 'pdf'
  return 'unsupported'
}

/** EXIF orientation 1–8 ของ JPEG — 1 เมื่อไม่มีหรืออ่านไม่ได้ (รูปจากมือถือที่ไม่ผ่านการบีบยังมี EXIF ติดมา) */
export function jpegOrientation(bytes: Uint8Array): number {
  if (sniffFileType(bytes) !== 'jpeg') return 1
  const u16 = (o: number, le: boolean) => (le ? bytes[o] | (bytes[o + 1] << 8) : (bytes[o] << 8) | bytes[o + 1])
  const u32 = (o: number, le: boolean) =>
    (le
      ? bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)
      : (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0

  let o = 2
  while (o + 4 <= bytes.length) {
    if (bytes[o] !== 0xff) return 1
    const marker = bytes[o + 1]
    if (marker === 0xff) { o++; continue } // fill byte
    if (marker === 0xd9 || marker === 0xda) return 1 // EOI / เริ่มข้อมูลภาพ — EXIF ต้องมาก่อน
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { o += 2; continue } // ไม่มีความยาว
    const len = u16(o + 2, false)
    if (len < 2 || o + 2 + len > bytes.length) return 1
    const seg = o + 4
    // APP1 "Exif\0\0" → TIFF header → IFD0 → tag 0x0112
    if (marker === 0xe1 && len >= 16 && indexOfBytes(bytes, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00], seg, seg + 6) === seg) {
      const tiff = seg + 6
      const tiffEnd = o + 2 + len
      const le = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49
      const be = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d
      if ((!le && !be) || u16(tiff + 2, le) !== 42) return 1
      const ifd = tiff + u32(tiff + 4, le)
      if (ifd + 2 > tiffEnd) return 1
      const count = u16(ifd, le)
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12
        if (entry + 12 > tiffEnd) return 1
        if (u16(entry, le) !== 0x0112) continue
        const value = u16(entry + 8, le)
        return value >= 1 && value <= 8 ? value : 1
      }
      return 1
    }
    o += 2 + len
  }
  return 1
}

// ── วางรูป/หน้า PDF ลงกรอบ ────────────────────────────────────────────────────

export interface Box { x: number; y: number; width: number; height: number }
export interface Placement {
  /** จุดยึดของ pdf-lib (มุมล่างซ้ายของภาพ "ก่อนหมุน") */
  x: number
  y: number
  /** ขนาดที่ส่งให้ pdf-lib (ก่อนหมุน) */
  width: number
  height: number
  /** หมุนตามเข็มนาฬิกากี่องศาให้ภาพตั้งตรง — ส่ง pdf-lib เป็น degrees(-rotateDegrees) */
  rotateDegrees: 0 | 90 | 180 | 270
  /** ขนาดบนกระดาษหลังหมุน — อยู่ในกรอบเสมอ */
  shownWidth: number
  shownHeight: number
}

/** EXIF orientation → มุมหมุนตามเข็มนาฬิกา · 2/4/5/7 (กลับด้าน) ใช้มุมของแบบไม่กลับด้าน */
const ORIENTATION_ROTATION: Record<number, 0 | 90 | 180 | 270> = { 1: 0, 2: 0, 3: 180, 4: 180, 5: 270, 6: 90, 7: 90, 8: 270 }

function place(w: number, h: number, rotate: 0 | 90 | 180 | 270, box: Box, maxScale: number): Placement {
  if (!(w > 0 && h > 0)) return { x: box.x, y: box.y, width: 0, height: 0, rotateDegrees: rotate, shownWidth: 0, shownHeight: 0 }
  const turned = rotate === 90 || rotate === 270
  const naturalW = turned ? h : w
  const naturalH = turned ? w : h
  const scale = Math.min(box.width / naturalW, box.height / naturalH, maxScale)
  const shownWidth = naturalW * scale
  const shownHeight = naturalH * scale
  // กลางกรอบแนวนอน ชิดบนแนวตั้ง (ติดแถบที่บอกว่าเป็นไฟล์อะไร)
  const left = box.x + (box.width - shownWidth) / 2
  const bottom = box.y + box.height - shownHeight
  // pdf-lib หมุนรอบมุมล่างซ้ายของภาพก่อนหมุน → เลื่อนจุดยึดให้ภาพหลังหมุนลงกรอบพอดี
  const [x, y] =
    rotate === 0 ? [left, bottom]
      : rotate === 90 ? [left, bottom + shownHeight]
        : rotate === 180 ? [left + shownWidth, bottom + shownHeight]
          : [left + shownWidth, bottom]
  return { x, y, width: w * scale, height: h * scale, rotateDegrees: rotate, shownWidth, shownHeight }
}

/** วางรูปลงกรอบ: ตั้งตรงตาม EXIF, คงสัดส่วน, ไม่ขยายเกิน 2 เท่า */
export function placeImage(
  image: { width: number; height: number; orientation: number },
  box: Box
): Placement {
  return place(image.width, image.height, ORIENTATION_ROTATION[image.orientation] ?? 0, box, MAX_IMAGE_SCALE)
}

/** /Rotate ของหน้า PDF → 0/90/180/270 (ค่าที่ไม่ใช่ทวีคูณ 90 ถือเป็น 0 ตามที่ viewer ส่วนใหญ่ทำ) */
function normRotation(angle: number): 0 | 90 | 180 | 270 {
  const a = ((Math.round(angle) % 360) + 360) % 360
  return a === 90 || a === 180 || a === 270 ? a : 0
}

// ── วางแผนหน้า (ล้วน ไม่สร้าง PDF) ────────────────────────────────────────────

export type PlanContent =
  | { type: 'image'; width: number; height: number; orientation: number }
  | { type: 'pdf'; pages: { width: number; height: number; rotation: number }[] }
  | { type: 'failed'; reason: BundleFailReason }

export interface PlanFile {
  kind: BundleFileKind
  index: number
  total: number
  note?: string
  content: PlanContent
}
export interface PlanClaim { claimNumber: string; voucherPages: number; files: PlanFile[] }

export interface PlannedStrip {
  /** ระยะจากขอบบนกระดาษ (pt) */
  top: number
  text: string
}
export interface PlannedImageSlot { file: number; strip: PlannedStrip; box: Box; place: Placement }

interface PlannedBase {
  /** ลำดับใบเบิกใน claims */
  claim: number
  claimNumber: string
}
interface Numbered extends PlannedBase {
  /** หน้าที่ในชุดของใบนี้ เริ่มที่ 1 จากหน้าแรกของใบเบิก */
  n: number
  /** หน้าทั้งหมดของชุดใบนี้ (ไม่นับหน้าว่างคั่น) */
  N: number
}
export type PlannedPage =
  | (Numbered & { type: 'voucher'; voucherPage: number })
  | (Numbered & { type: 'image'; slots: PlannedImageSlot[] })
  | (Numbered & { type: 'pdf'; file: number; filePage: number; strip: PlannedStrip; box: Box; place: Placement })
  | (Numbered & { type: 'notice'; file: number; reason: BundleFailReason; strip: PlannedStrip })
  | (PlannedBase & { type: 'blank' })

/** ช่องหนึ่งช่องบน A4 (สูง height เริ่มที่ top จากขอบบน): แถบบนสุดของช่อง กรอบเนื้อหาใต้แถบ */
function slot(top: number, height: number): { top: number; box: Box } {
  const bottom = A4.h - top - height
  return {
    top,
    box: { x: MARGIN, y: bottom + MARGIN, width: A4.w - 2 * MARGIN, height: height - STRIP_H - GAP - MARGIN },
  }
}
const FULL = slot(0, A4.h)
const HALVES = [slot(0, A4.h / 2), slot(A4.h / 2, A4.h / 2)]

type FileId = Pick<PlanFile, 'kind' | 'index' | 'total' | 'note'>

function fileLabel(f: FileId): string {
  const label = `${BUNDLE_KIND_LABEL[f.kind]} ${f.index}/${f.total}`
  return f.kind === 'tax_invoice' && f.note ? `${label} · เลขที่ ${f.note}` : label
}

/** `<เลขที่ใบเบิก> · <ชนิด> <ลำดับ>/<ทั้งหมด> · หน้า <n>/<N>` (+ ` · เลขที่ <note>` ของใบกำกับภาษี) */
function stripText(claimNumber: string, f: FileId, n: number, N: number): string {
  const parts = [claimNumber, `${BUNDLE_KIND_LABEL[f.kind]} ${f.index}/${f.total}`, `หน้า ${n}/${N}`]
  if (f.kind === 'tax_invoice' && f.note) parts.push(`เลขที่ ${f.note}`)
  return parts.join(' · ')
}

/** ไฟล์ของใบเบิกเรียงตามชนิด (sort ของ JS เสถียร — ในชนิดเดียวกันคงลำดับเดิม) */
function orderedFiles(files: { kind: BundleFileKind }[]): number[] {
  return files.map((_, i) => i).sort((a, b) => KIND_ORDER.indexOf(files[a].kind) - KIND_ORDER.indexOf(files[b].kind))
}

/** หน้าทั้งหมดของชุดตามลำดับ — ล้วน ตรวจได้โดยไม่ต้องสร้าง PDF */
export function planPages(claims: PlanClaim[], options: BundleOptions): PlannedPage[] {
  const out: PlannedPage[] = []

  claims.forEach((c, ci) => {
    // หนึ่ง unit = หนึ่งหน้า
    type Unit =
      | { type: 'voucher'; page: number }
      | { type: 'image'; files: number[] }
      | { type: 'pdf'; file: number; page: number }
      | { type: 'notice'; file: number; reason: BundleFailReason }
    const units: Unit[] = []
    for (let p = 0; p < c.voucherPages; p++) units.push({ type: 'voucher', page: p })

    const order = orderedFiles(c.files)
    for (let k = 0; k < order.length; k++) {
      const fi = order[k]
      const content = c.files[fi].content
      if (content.type === 'image') {
        // สองรูปต่อหน้าเฉพาะรูปที่อยู่ติดกัน — PDF/ไฟล์ที่รวมไม่ได้คั่นกลางทำให้ไม่จับคู่ (ไม่สลับลำดับ)
        const next = order[k + 1]
        if (options.layout === 'two' && next !== undefined && c.files[next].content.type === 'image') {
          units.push({ type: 'image', files: [fi, next] })
          k++
        } else {
          units.push({ type: 'image', files: [fi] })
        }
      } else if (content.type === 'pdf' && content.pages.length > 0) {
        content.pages.forEach((_, p) => units.push({ type: 'pdf', file: fi, page: p }))
      } else {
        // PDF ที่ไม่มีหน้าเลยก็ต้องมีหน้าแจ้ง — ห้ามหายเงียบ
        units.push({ type: 'notice', file: fi, reason: content.type === 'failed' ? content.reason : 'broken' })
      }
    }

    const N = units.length
    units.forEach((u, ui) => {
      const base = { claim: ci, claimNumber: c.claimNumber, n: ui + 1, N }
      if (u.type === 'voucher') {
        out.push({ ...base, type: 'voucher', voucherPage: u.page })
      } else if (u.type === 'image') {
        const slots = options.layout === 'two' ? HALVES : [FULL]
        out.push({
          ...base,
          type: 'image',
          slots: u.files.map((fi, si) => {
            const f = c.files[fi]
            const img = f.content as Extract<PlanContent, { type: 'image' }>
            return {
              file: fi,
              strip: { top: slots[si].top, text: stripText(c.claimNumber, f, base.n, N) },
              box: slots[si].box,
              place: placeImage(img, slots[si].box),
            }
          }),
        })
      } else if (u.type === 'pdf') {
        const f = c.files[u.file]
        const pg = (f.content as Extract<PlanContent, { type: 'pdf' }>).pages[u.page]
        out.push({
          ...base,
          type: 'pdf',
          file: u.file,
          filePage: u.page,
          strip: { top: FULL.top, text: stripText(c.claimNumber, f, base.n, N) },
          box: FULL.box,
          // หน้า PDF เป็นเวกเตอร์ ขยายให้เต็มกรอบได้ไม่แตก
          place: place(pg.width, pg.height, normRotation(pg.rotation), FULL.box, Number.POSITIVE_INFINITY),
        })
      } else {
        const f = c.files[u.file]
        out.push({
          ...base,
          type: 'notice',
          file: u.file,
          reason: u.reason,
          strip: { top: FULL.top, text: stripText(c.claimNumber, f, base.n, N) },
        })
      }
    })

    // พิมพ์สองหน้า: ใบถัดไปต้องเริ่มแผ่นใหม่ — ไม่เติมหลังใบสุดท้าย
    if (options.duplex && claims.length > 1 && ci < claims.length - 1 && N % 2 === 1) {
      out.push({ type: 'blank', claim: ci, claimNumber: c.claimNumber })
    }
  })

  return out
}

// ── ประกอบ PDF ───────────────────────────────────────────────────────────────

/** หน้าเกินเพดานที่ผู้เรียกกำหนด — โยนก่อนเรนเดอร์แถบและประกอบไฟล์ (งานหนัก) */
export class BundleTooLargeError extends Error {
  constructor(public readonly pages: number, public readonly limit: number) {
    super(`ชุดเอกสารมี ${pages} หน้า เกินเพดาน ${limit} หน้า`)
    this.name = 'BundleTooLargeError'
  }
}

type Loaded =
  | { type: 'image'; image: PDFImage; orientation: number }
  /** page = null: หน้าว่างที่ไม่มี /Contents (หน้า PDF ที่ถูกต้อง แต่ pdf-lib ฝังไม่ได้) — วาดแค่แถบ */
  | { type: 'pdf'; pages: { page: PDFEmbeddedPage | null; width: number; height: number; rotation: number }[] }
  | { type: 'failed'; reason: BundleFailReason }

/** กรอบที่มองเห็นของหน้า = CropBox ∩ MediaBox (embedPages ค่าเริ่มต้นใช้ MediaBox ที่เริ่ม 0,0 เสมอ) */
function visibleBox(page: PDFPage) {
  const mb = page.getMediaBox()
  const cb = page.getCropBox()
  const left = Math.max(mb.x, cb.x)
  const bottom = Math.max(mb.y, cb.y)
  const right = Math.min(mb.x + mb.width, cb.x + cb.width)
  const top = Math.min(mb.y + mb.height, cb.y + cb.height)
  return right > left && top > bottom
    ? { left, bottom, right, top }
    : { left: mb.x, bottom: mb.y, right: mb.x + mb.width, top: mb.y + mb.height }
}

const EOF = [0x25, 0x25, 0x45, 0x4f, 0x46] // %%EOF

/** เปิดไฟล์แนบหนึ่งไฟล์เข้าเอกสารปลายทาง — อะไรที่เปิดไม่ได้กลายเป็นเหตุผลของหน้าแจ้ง ไม่ throw */
async function loadFile(out: PDFDocument, f: BundleInputFile): Promise<Loaded> {
  if (!f.bytes) return { type: 'failed', reason: f.failReason ?? 'fetch' }
  if (f.bytes.length === 0) return { type: 'failed', reason: 'broken' }
  const type = sniffFileType(f.bytes)
  if (type === 'unsupported') return { type: 'failed', reason: 'unsupported' }
  try {
    if (type === 'pdf') {
      // ไฟล์ที่ดาวน์โหลดไม่ครบไม่มี %%EOF ท้ายไฟล์ — pdf-lib อ่านแบบผ่อนปรนแล้วได้หน้าไม่ครบแบบเงียบๆ
      if (indexOfBytes(f.bytes, EOF, f.bytes.length - 1024, f.bytes.length) < 0) return { type: 'failed', reason: 'broken' }
      // ไฟล์ล็อกรหัส: load โยน EncryptedPDFError (ไม่ ignoreEncryption — ถอดไม่ได้ก็วาดไม่ออก)
      const src = await PDFDocument.load(f.bytes, { updateMetadata: false })
      const pages = src.getPages()
      if (pages.length === 0) return { type: 'failed', reason: 'broken' }
      const drawable = pages.filter(p => p.node.Contents() !== undefined)
      const boxes = drawable.map(visibleBox)
      // ลองฝังในเอกสารทิ้งก่อน: pdf-lib เก็บหน้าที่ฝังค้างไว้จน save() — ถ้าไปพังตอนนั้นในเอกสารจริง
      // ทั้งชุดจะ save ไม่ได้ ถอดเนื้อหาที่นี่ content stream ที่ถอดไม่ได้จึงเป็นแค่หน้าแจ้งของไฟล์นี้
      const probe = await PDFDocument.create()
      for (const p of await probe.embedPages(drawable, boxes)) await p.embed()
      const embedded = await out.embedPages(drawable, boxes)
      let k = 0
      return {
        type: 'pdf',
        pages: pages.map(p => {
          const box = visibleBox(p)
          return {
            page: p.node.Contents() !== undefined ? embedded[k++] : null,
            width: box.right - box.left,
            height: box.top - box.bottom,
            rotation: p.getRotation().angle,
          }
        }),
      }
    }
    const image = type === 'jpeg' ? await out.embedJpg(f.bytes) : await out.embedPng(f.bytes)
    await image.embed()
    return { type: 'image', image, orientation: type === 'jpeg' ? jpegOrientation(f.bytes) : 1 }
  } catch {
    return { type: 'failed', reason: 'broken' }
  }
}

function contentOf(l: Loaded): PlanContent {
  if (l.type === 'image') return { type: 'image', width: l.image.width, height: l.image.height, orientation: l.orientation }
  if (l.type === 'pdf') {
    return { type: 'pdf', pages: l.pages.map(p => ({ width: p.width, height: p.height, rotation: p.rotation })) }
  }
  return l
}

/**
 * ประกอบชุดเอกสาร — ใบเบิกตามลำดับที่ส่งมา แต่ละใบ: หน้าใบเบิก → ไฟล์แนบเรียงตามชนิด
 * limits.maxPages: เกิน → โยน BundleTooLargeError ก่อนงานหนัก
 */
export async function buildBundle(
  claims: BundleClaimInput[],
  options: BundleOptions,
  limits: { maxPages?: number } = {}
): Promise<{ pdf: Uint8Array; report: BundleReport }> {
  const out = await PDFDocument.create()

  const vouchers: PDFDocument[] = []
  const loaded: Loaded[][] = []
  for (const c of claims) {
    // หน้าใบเบิกมาจาก renderVoucherPdf ของระบบเอง — เปิดไม่ได้คือบั๊ก ให้ throw ขึ้นไป
    vouchers.push(await PDFDocument.load(c.voucher))
    const files: Loaded[] = []
    for (const f of c.files) files.push(await loadFile(out, f))
    loaded.push(files)
  }

  const plan = planPages(
    claims.map((c, ci) => ({
      claimNumber: c.claimNumber,
      voucherPages: vouchers[ci].getPageCount(),
      files: c.files.map((f, fi) => ({
        kind: f.kind, index: f.index, total: f.total, note: f.note, content: contentOf(loaded[ci][fi]),
      })),
    })),
    options
  )
  if (limits.maxPages !== undefined && plan.length > limits.maxPages) {
    throw new BundleTooLargeError(plan.length, limits.maxPages)
  }

  // ชั้นครอบ: เรนเดอร์ครั้งเดียวทั้งชุด 1 หน้าต่อหน้าที่ไม่ใช่ใบเบิก/หน้าว่าง
  const chromePages: BundleChromePage[] = []
  const chromeOf = new Map<number, number>()
  plan.forEach((p, i) => {
    if (p.type === 'image') chromePages.push({ strips: p.slots.map(sl => sl.strip) })
    else if (p.type === 'pdf') chromePages.push({ strips: [p.strip] })
    else if (p.type === 'notice') {
      chromePages.push({
        strips: [p.strip],
        notice: {
          claimNumber: p.claimNumber,
          fileLabel: fileLabel(claims[p.claim].files[p.file]),
          reason: BUNDLE_FAIL_REASON_TEXT[p.reason],
        },
      })
    } else return
    chromeOf.set(i, chromePages.length - 1)
  })
  let chrome: PDFEmbeddedPage[] = []
  if (chromePages.length > 0) {
    const chromeBuf = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(BundleChromePDF, { pages: chromePages }) as any
    )
    const chromeDoc = await PDFDocument.load(new Uint8Array(chromeBuf))
    // embedPdf ค่าเริ่มต้นเอาแค่หน้าแรก — ต้องส่งทุกหน้า
    chrome = await out.embedPdf(chromeDoc, chromeDoc.getPageIndices())
    if (chrome.length !== chromePages.length) {
      throw new Error(`ชั้นครอบได้ ${chrome.length} หน้า ควรเป็น ${chromePages.length}`)
    }
  }

  // หน้าใบเบิกคัดลอกทีละใบทั้งชุด (copier ตัวเดียวต่อใบ ฟอนต์ไม่ถูกคัดลอกซ้ำทุกหน้า)
  const voucherPages: PDFPage[][] = []
  for (const v of vouchers) voucherPages.push(await out.copyPages(v, v.getPageIndices()))

  plan.forEach((p, i) => {
    if (p.type === 'voucher') {
      out.addPage(voucherPages[p.claim][p.voucherPage])
      return
    }
    const page = out.addPage([A4.w, A4.h])
    if (p.type === 'image') {
      for (const sl of p.slots) {
        const l = loaded[p.claim][sl.file]
        if (l.type !== 'image') continue
        const pl = sl.place
        page.drawImage(l.image, { x: pl.x, y: pl.y, width: pl.width, height: pl.height, rotate: degrees(-pl.rotateDegrees) })
      }
    } else if (p.type === 'pdf') {
      const l = loaded[p.claim][p.file]
      const src = l.type === 'pdf' ? l.pages[p.filePage].page : null
      if (src) {
        const pl = p.place
        page.drawPage(src, { x: pl.x, y: pl.y, width: pl.width, height: pl.height, rotate: degrees(-pl.rotateDegrees) })
      }
    }
    const ci = chromeOf.get(i)
    if (ci !== undefined) page.drawPage(chrome[ci], { x: 0, y: 0 })
  })

  const report: BundleReport = {
    pages: plan.length,
    claims: claims.map((c, ci) => ({
      claimNumber: c.claimNumber,
      pages: plan.filter(p => p.claim === ci && p.type !== 'blank').length,
      included: loaded[ci].filter(l => l.type !== 'failed').length,
      failed: orderedFiles(c.files).flatMap(fi => {
        const l = loaded[ci][fi]
        return l.type === 'failed' ? [{ kind: c.files[fi].kind, index: c.files[fi].index, reason: l.reason }] : []
      }),
    })),
  }

  return { pdf: await out.save(), report }
}
