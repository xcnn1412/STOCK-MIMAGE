// ============================================================================
// ไฟล์แนบของใบเบิก — ดึงจากสตอเรจของระบบเอง (บัคเก็ต receipts) ให้หน้าใบเบิกและชุดเอกสาร
// server-only: ออกเครือข่าย — ห้าม import จาก client component
// ดึงเฉพาะ URL ของระบบเอง: ช่อง URL ในใบเบิกเป็นข้อความที่ผู้ใช้แก้ได้ ถ้าดึงทุก URL
// server จะกลายเป็นตัวยิงคำขอไปที่ไหนก็ได้แทนผู้ใช้ (SSRF)
// บัคเก็ต receipts เป็น private แล้ว (M3, migration 20261031) — URL สาธารณะเดิมเปิดผ่าน HTTP ไม่ได้
// จึงดาวน์โหลดผ่าน service client ด้วย path ที่แยกจาก URL แทน
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import { parsePrivateFileUrl } from '@/lib/file-url'

export type ClaimFileKind = 'receipt' | 'settlement' | 'tax_invoice' | 'refund_slip'
export type ClaimFileFailReason = 'fetch' | 'foreign-host' | 'too-large'

/** ไฟล์แนบหนึ่งไฟล์ของใบเบิก ตามลำดับที่จะเข้าชุด */
export interface ClaimFileRef {
  kind: ClaimFileKind
  /** ลำดับในชนิดเดียวกัน เริ่มที่ 1 */
  index: number
  /** จำนวนไฟล์ของชนิดนี้ */
  total: number
  /** เลขที่ใบกำกับภาษี (เฉพาะ tax_invoice ที่กรอกไว้) */
  note?: string
  url: string
}

/** ช่องไฟล์แนบของใบเบิกที่ collectClaimFiles อ่าน — ค่าจากฐานข้อมูลอาจเป็น null */
export interface ClaimFilesSource {
  receipt_urls?: unknown
  actual_receipt_urls?: unknown
  tax_invoice_urls?: unknown
  tax_invoice_numbers?: unknown
  refund_slip_urls?: unknown
}

const RECEIPTS_PATH = '/storage/v1/object/public/receipts/'
/** ไฟล์จริงบน production ใหญ่สุด ~826KB — 15MB เผื่อ PDF สแกนหลายหน้า แต่กันไฟล์ผิดปกติกินหน่วยความจำ */
export const CLAIM_FILE_MAX_BYTES = 15 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

/** URL อยู่ในบัคเก็ต receipts ของสตอเรจของระบบเองหรือไม่ */
export function isOwnReceiptUrl(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (typeof url !== 'string' || !url || !base) return false
  // new URL() ยุบ .. ให้เองแล้ว แต่ปฏิเสธตั้งแต่ข้อความดิบ (รวมแบบเข้ารหัส / backslash) กันตีความต่างกันกับฝั่งสตอเรจ
  if (/\.\.|%2e|%2f|%5c|\\/i.test(url.split(/[?#]/)[0])) return false
  try {
    const own = new URL(base)
    const u = new URL(url)
    return u.protocol === own.protocol
      && u.host === own.host
      && !u.username && !u.password
      && u.pathname.startsWith(RECEIPTS_PATH)
      && u.pathname.length > RECEIPTS_PATH.length
  } catch {
    return false
  }
}

/** path ของ URL ลงท้าย .pdf หรือไม่ (ไม่สนตัวพิมพ์ ไม่นับ ?query) — ใช้คัดสลิปคืนเงินที่หน้าใบเบิกฝังเองไม่ได้ */
export function isPdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf')
  } catch {
    return url.split(/[?#]/)[0].toLowerCase().endsWith('.pdf')
  }
}

/** อ่าน body ทีละก้อน หยุดทันทีเมื่อเกินเพดาน (content-length โกหกหรือไม่ส่งมาก็ไม่อ่านจนหมด) */
export async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array(0)
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/**
 * ดึงไฟล์แนบ — เฉพาะ URL ของระบบเอง หมดเวลา 15 วินาที ไม่เกิน 15MB
 * บัคเก็ตส่วนตัว (receipts) → ดาวน์โหลดผ่าน service client · อย่างอื่น → fetch ไม่ตาม redirect (เผื่อไว้)
 * คืน contentType ด้วย: หน้าใบเบิกใช้เมื่อดูชนิดจากหัวไฟล์ไม่ออก (พฤติกรรมเดิม)
 */
export async function fetchClaimFile(
  url: string
): Promise<{ bytes: Uint8Array; contentType: string | null } | { failReason: ClaimFileFailReason }> {
  if (!isOwnReceiptUrl(url)) return { failReason: 'foreign-host' }
  const priv = parsePrivateFileUrl(url)
  if (priv) return downloadPrivateFile(priv.bucket, priv.path)
  try {
    // redirect: 'error' — URL ของระบบเองที่เด้งไปที่อื่นก็ไม่ตาม
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) {
      await res.body?.cancel().catch(() => {})
      return { failReason: 'fetch' }
    }
    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > CLAIM_FILE_MAX_BYTES) {
      await res.body?.cancel().catch(() => {})
      return { failReason: 'too-large' }
    }
    const bytes = await readCapped(res, CLAIM_FILE_MAX_BYTES)
    if (!bytes) return { failReason: 'too-large' }
    return { bytes, contentType: res.headers.get('content-type') }
  } catch {
    // เครือข่ายหลุด / หมดเวลา / ถูก redirect
    return { failReason: 'fetch' }
  }
}

/** ดาวน์โหลดจากบัคเก็ตส่วนตัวด้วย service client — path ใน URL เข้ารหัสไว้ (%20) ถอดก่อนส่งให้สตอเรจ */
async function downloadPrivateFile(
  bucket: string,
  encodedPath: string
): Promise<{ bytes: Uint8Array; contentType: string | null } | { failReason: ClaimFileFailReason }> {
  let path: string
  try {
    path = encodedPath.split('/').map(decodeURIComponent).join('/')
  } catch {
    return { failReason: 'fetch' }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), FETCH_TIMEOUT_MS) })
    const got = await Promise.race([createServiceClient().storage.from(bucket).download(path), timeout])
    clearTimeout(timer)
    if (!got || got.error || !got.data) return { failReason: 'fetch' }
    const blob = got.data
    if (blob.size > CLAIM_FILE_MAX_BYTES) return { failReason: 'too-large' }
    return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type || null }
  } catch {
    clearTimeout(timer)
    return { failReason: 'fetch' }
  }
}

/** ค่าในช่อง URL ที่เป็นไฟล์จริง — tax_invoice_urls มี '' แทนรายการที่กรอกแต่เลขที่ไม่มีไฟล์ */
const isFileUrl = (u: unknown): u is string => typeof u === 'string' && u.trim() !== ''
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** ไฟล์แนบของใบเบิกตามลำดับในชุด */
export function collectClaimFiles(claim: ClaimFilesSource): ClaimFileRef[] {
  const numbers = asList(claim.tax_invoice_numbers)
  // เลขที่ใบกำกับจับคู่กับ URL ตามตำแหน่งในฐานข้อมูล (ก่อนตัดช่องว่างทิ้ง)
  const taxInvoices = asList(claim.tax_invoice_urls)
    .map((url, i) => {
      const n = numbers[i]
      return { url, note: typeof n === 'string' && n.trim() ? n.trim() : undefined }
    })
    .filter((f): f is { url: string; note: string | undefined } => isFileUrl(f.url))

  const groups: [ClaimFileKind, { url: string; note?: string }[]][] = [
    ['receipt', asList(claim.receipt_urls).filter(isFileUrl).map(url => ({ url }))],
    ['settlement', asList(claim.actual_receipt_urls).filter(isFileUrl).map(url => ({ url }))],
    ['tax_invoice', taxInvoices],
    // สลิปรูปถูกฝังในหน้าใบเบิกแล้ว — ชุดเอกสารเติมเฉพาะสลิป PDF
    ['refund_slip', asList(claim.refund_slip_urls).filter(isFileUrl).filter(isPdfUrl).map(url => ({ url }))],
  ]

  return groups.flatMap(([kind, files]) =>
    files.map((f, i) => ({
      kind,
      index: i + 1,
      total: files.length,
      ...(f.note ? { note: f.note } : {}),
      url: f.url,
    }))
  )
}

/** ทำงานพร้อมกันไม่เกิน limit — ผลลัพธ์เรียงตามลำดับ items เสมอ */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return out
}
