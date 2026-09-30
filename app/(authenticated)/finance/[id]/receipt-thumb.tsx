'use client'

// ============================================================================
// รูปใบเสร็จ/เอกสารแนบในหน้าใบเบิก — แสดงรูปย่อ (<ชื่อไฟล์>_thumb.jpg ~15KB) แทนไฟล์เต็ม และโหลดเมื่อเลื่อนถึง
// ไฟล์เก่าที่ยังไม่มีรูปย่อ / โหลดรูปย่อไม่ได้ → กลับไปใช้ไฟล์เดิมเอง · ลิงก์ที่ครอบรูปยังชี้ไฟล์เต็มเสมอ
// + ตัวช่วยฝั่ง browser ตอนแนบไฟล์: รูปย่อทำจากไฟล์ที่บีบแล้ว (compressImage(file, THUMB_MAX_MB, THUMB_MAX_DIMENSION))
//   แล้วส่งคู่กับไฟล์เดิมใน FormData คีย์ *_thumbs (ตำแหน่งตรงกัน ไม่มีรูปย่อ = Blob ว่าง)
// ============================================================================

import { useState } from 'react'
import { thumbUrlFor } from '@/lib/finance/receipt-thumbs'

/**
 * รูปของไฟล์แนบหนึ่งไฟล์ — src = รูปย่อ (ถ้ามี) · loading="lazy" · โหลดรูปย่อไม่ได้ → ใช้ url เดิม
 * ใช้แทน <img> ทุกที่ในหน้าใบเบิก (ไฟล์ PDF ไม่ต้องใช้ — แสดงเป็นไอคอน)
 */
export function ReceiptThumb({ url, alt, className }: { url: string; alt: string; className?: string }) {
  // url ที่รูปย่อโหลดไม่ได้ (ไฟล์เก่าก่อนมีรูปย่อ) — เก็บเป็น url ไม่ใช่ true/false: เปลี่ยนไฟล์แล้วลองรูปย่อของไฟล์ใหม่
  const [thumbFailedFor, setThumbFailedFor] = useState<string | null>(null)
  const failed = thumbFailedFor === url
  /** src เป็นรูปย่ออยู่ → เปลี่ยนเป็นไฟล์เดิม */
  const fallback = () => {
    if (!failed && thumbUrlFor(url)) setThumbFailedFor(url)
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ไฟล์จากสตอเรจของผู้ใช้ ขนาดไม่คงที่ · รูปย่อทำไว้แล้ว ไม่ผ่าน next/image
    <img
      loading="lazy"
      decoding="async"
      src={failed ? url : thumbUrlFor(url) ?? url}
      alt={alt}
      onError={fallback}
      // รูปที่พังก่อน React ผูก onError (ตอนเปิดหน้า) — ตรวจตอนติดตั้ง: โหลดเสร็จแล้วแต่ไม่มีขนาด = พัง
      ref={el => {
        if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) fallback()
      }}
      className={className}
    />
  )
}

/** รอรูปย่อไม่เกินเท่านี้ — ไฟล์ที่ browser ถอดรหัสไม่ได้ต้องไม่ทำให้การส่งค้าง */
const THUMB_TIMEOUT_MS = 10_000

/**
 * ผลของการทำรูปย่อ: ได้ไฟล์ใหม่ = รูปย่อ · ได้ไฟล์เดิมกลับมา (browser ย่อไม่ได้) / ผิดพลาด / เกินเวลา = null (ไม่มีรูปย่อ)
 * เรียกคู่กับ compressImage(file, THUMB_MAX_MB, THUMB_MAX_DIMENSION) — ไม่มีรูปย่อก็ส่งไฟล์ได้ตามปกติ
 */
export async function settleThumb(source: File, making: Promise<File>): Promise<File | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), THUMB_TIMEOUT_MS) })
  try {
    const thumb = await Promise.race([making.catch(() => null), timeout])
    return thumb && thumb !== source && thumb.size > 0 ? thumb : null
  } finally {
    clearTimeout(timer)
  }
}

/** ไฟล์ที่ส่ง + รูปย่อที่ตรงตำแหน่ง */
export type FilePair = { file: File; thumb: File | null }

/**
 * ใส่ไฟล์ลง FormData คู่กับรูปย่อ: key = ไฟล์ (เช่น receipt_files) · thumbKey = รูปย่อ (เช่น receipt_thumbs)
 * ตำแหน่งตรงกันเสมอ — ไฟล์ที่ไม่มีรูปย่อ (PDF / ย่อไม่ได้) ใส่ Blob ว่างแทน server ถือว่าไม่มีรูปย่อ
 */
export function appendFilePairs(fd: FormData, key: string, thumbKey: string, pairs: FilePair[]) {
  for (const { file, thumb } of pairs) {
    fd.append(key, file)
    if (thumb) fd.append(thumbKey, thumb, thumb.name || 'thumb.jpg')
    else fd.append(thumbKey, new Blob([]), '')
  }
}
