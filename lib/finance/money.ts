// ============================================================================
// เงินของใบเบิก — VAT และหัก ณ ที่จ่ายคิดจาก amount (ยอดรวมของใบ ไม่คูณจำนวนซ้ำ)
// ไฟล์กติกาล้วน: ไม่ import next/*, supabase หรือ react — ใช้ได้ทั้ง server, client และในชุดตรวจ
//
// สูตรคัดลอกจาก calcTax ใน app/(authenticated)/finance/claims-list-view.tsx (ตัวเดียวกับ archive-list.tsx)
// ponytail: ตอนนี้มีสำเนาอีกหลายที่ (claims-list-view, archive-list, costs/events, costs/reports) — ย้ายมาใช้ไฟล์นี้ในขั้น 3
// ผลเท่ากันทุกบิตกับสำเนาทั้ง 13 ที่ตรวจด้วย scripts/finance-calc-tax.check.ts (ต่างเฉพาะ overview/analytics-panel.tsx เมื่ออัตราเป็น undefined)
// ============================================================================

/**
 * vatMode: 'included' = amount รวม VAT แล้ว · 'excluded' = VAT บวกเพิ่มจาก amount · อื่นๆ = ไม่มี VAT
 * whtRatePercent: อัตราหัก ณ ที่จ่าย (%) คิดจากยอดก่อน VAT
 */
export function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let vatAmount = 0
  let totalWithVat = amount
  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    vatAmount = amount * 0.07
    totalWithVat = amount + vatAmount
  }
  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

/** ช่องเงินของแถวใบเบิกที่ moneyOf / netOf อ่าน — ค่าจากฐานข้อมูลเป็น null ได้ */
export type MoneyFields = { amount: number | null; vat_mode: string | null; withholding_tax_rate: number | null }

/**
 * ยอดทั้งชุดของแถวใบเบิกหนึ่งใบ — แปลงค่าว่างแบบเดียวกับทุกหน้า (ยอด/อัตราว่าง = 0 · VAT ว่าง = 'none')
 * แล้วคิดด้วย calcTax ตัวเดียวกัน
 */
export function moneyOf(c: MoneyFields) {
  return calcTax(Number(c.amount) || 0, c.vat_mode || 'none', Number(c.withholding_tax_rate) || 0)
}

/** ยอดจ่ายจริง (หลัง VAT และหัก ณ ที่จ่าย) ของแถวใบเบิกหนึ่งใบ */
export function netOf(c: MoneyFields): number {
  return moneyOf(c).netPayable
}
