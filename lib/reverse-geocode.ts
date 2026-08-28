/**
 * Reverse geocode พิกัด GPS → จังหวัด / เขต-อำเภอ (ภาษาไทย) ด้วย Nominatim (OpenStreetMap)
 *
 * ใช้ตอนเช็คอิน "ไปหน้างาน" เพื่อเติม staff_checkins.province / district ให้อัตโนมัติ
 * (โมดูลเงินเดือนใช้ดูเรื่องต่างจังหวัด) — พนักงานแก้เองได้ทีหลัง ดังนั้น "ล้มเหลว = คืน null"
 * เสมอ ไม่ throw และต้องไม่ทำให้การเช็คอินพัง
 *
 * ไม่มี API key / ไม่มี queue / ไม่มี cache — ถ้าโดน rate-limit ค่อยย้ายไป provider ที่มี key
 */

import { THAI_PROVINCES } from './thai-address'

const PROVINCE_SET: ReadonlySet<string> = new Set<string>(THAI_PROVINCES)
const TIMEOUT_MS = 3000
const USER_AGENT = 'stock-mimage-checkin/1.0'

export interface ReverseGeocodeResult {
  province: string | null
  district: string | null
}

const EMPTY: ReverseGeocodeResult = Object.freeze({ province: null, district: null })

/** ตัดคำนำหน้า "จังหวัด" / "จ." ออก แล้ว trim */
function stripProvincePrefix(raw: string): string {
  return raw.replace(/^\s*(จังหวัด|จ\.)\s*/, '').trim()
}

/** ตัดคำนำหน้า "เขต" / "อำเภอ" / "อ." ออก แล้ว trim */
function stripDistrictPrefix(raw: string): string {
  return raw.replace(/^\s*(เขต|อำเภอ|อ\.)\s*/, '').trim()
}

/**
 * คืน { province, district } จากพิกัด — ค่าใดหาไม่ได้จะเป็น null
 *
 * province: ใช้ address.province ?? address.state; ถ้าตัดคำนำหน้าแล้วตรงกับ THAI_PROVINCES
 *           จะเก็บชื่อมาตรฐาน ไม่ตรงก็เก็บข้อความดิบที่ Nominatim ส่งมา
 * district: ใช้ city_district ?? district ?? county ?? town (ตัด "เขต"/"อำเภอ"/"อ." ออก)
 */
export async function reverseGeocodeThai(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return EMPTY

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=th&zoom=10`
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return EMPTY

    const json = (await res.json()) as { address?: Record<string, string | undefined> } | null
    const address = json?.address
    if (!address) return EMPTY

    // ตัวอย่างจริงจาก Nominatim (2026-08):
    //   กทม.:     { suburb: 'เขตพระนคร', city: 'กรุงเทพมหานคร' }            ← ไม่มี province/state เลย
    //   นนทบุรี:  { city_district: 'ตำบลบางกระสอ', county: 'อำเภอเมืองนนทบุรี', province: 'จังหวัดนนทบุรี' }
    //   ชลบุรี:   { county: 'อำเภอบางละมุง', province: 'จังหวัดชลบุรี' }
    const cityAsProvince = address.city && PROVINCE_SET.has(stripProvincePrefix(address.city)) ? address.city : null
    const rawProvince = address.province ?? address.state ?? cityAsProvince ?? null
    // อำเภอ = county; เขตของ กทม. = suburb ที่ขึ้นต้น "เขต"; city_district มักเป็นตำบล จึงเป็นตัวเลือกท้ายๆ
    const suburbKhet = address.suburb && /^\s*เขต/.test(address.suburb) ? address.suburb : null
    const rawDistrict = address.county ?? suburbKhet ?? address.city_district ?? address.district ?? null

    let province: string | null = null
    if (rawProvince && rawProvince.trim()) {
      const cleaned = stripProvincePrefix(rawProvince)
      province = PROVINCE_SET.has(cleaned) ? cleaned : rawProvince.trim()
    }

    let district: string | null = null
    if (rawDistrict && rawDistrict.trim()) {
      district = stripDistrictPrefix(rawDistrict) || null
    }

    return { province, district }
  } catch (err) {
    // timeout / network / JSON พัง — เช็คอินต้องสำเร็จต่อได้เสมอ
    console.error('reverseGeocodeThai:', err instanceof Error ? err.message : err)
    return EMPTY
  } finally {
    clearTimeout(timer)
  }
}
