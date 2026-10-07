// คู่มือ /howto/equipment — เรนเดอร์ HowtoView แบบ static (ไม่แตะฐานข้อมูล/เครือข่าย)
// ตรวจ: มี id ของทุกหัวข้อใน TOC หมวด equipment, ข้อความหลักครบ, หมวด stock ยังมี stock-packing-flow + ลิงก์คู่มือเต็ม,
//       หน้า landing มีการ์ดลิงก์ /howto/equipment
// Run:  npx tsx scripts/howto-equipment-render.check.ts
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "howto-equipment-render: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (/lib\/i18n\/context$/.test(request)) {
    const { getDictionary } = realLoad.call(this, '@/lib/i18n/dictionaries', ...rest) as typeof import('../lib/i18n/dictionaries')
    return { useLocale: () => ({ locale: 'th', setLocale() {}, t: getDictionary('th') }), LocaleProvider: ({ children }: { children: unknown }) => children }
  }
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const HowtoView = (require('../app/(authenticated)/howto/howto-view') as typeof import('../app/(authenticated)/howto/howto-view')).default
/* eslint-enable @typescript-eslint/no-require-imports */

type View = NonNullable<Parameters<typeof HowtoView>[0]>['view']
const View_ = HowtoView as (props: { view: View }) => ReturnType<typeof HowtoView>
const render = (view: View) => renderToStaticMarkup(createElement(View_, { view }))

let n = 0
const ok = (label: string) => console.log(`  ✓ ${++n}. ${label}`)

// ── 1. หมวด equipment ─────────────────────────────────────────────────
const html = render('equipment')
const SECTION_IDS = [
  'equip-start', 'equip-roles', 'equip-terms',
  'equip-setup-team', 'equip-setup-categories', 'equip-setup-packages', 'equip-setup-spots',
  'equip-sales-pick', 'equip-sales-booth', 'equip-sales-warning',
  'equip-pack-queue', 'equip-pack-select', 'equip-pack-pick', 'equip-pack-confirm', 'equip-pack-restock',
  'equip-site-handover', 'equip-site-return', 'equip-close',
  'equip-readiness', 'equip-usage', 'equip-trophies', 'equip-faq', 'equip-menu',
]
for (const id of SECTION_IDS) {
  assert.ok(html.includes(`id="${id}"`), `ไม่พบ section id="${id}"`)
  assert.ok(html.includes(`href="#${id}"`), `TOC ไม่มีลิงก์ #${id}`)
}
// TOC ต้องไม่มี id ที่ไม่มี section รองรับ
const tocIds = [...html.matchAll(/href="#(equip-[a-z-]+)"/g)].map(m => m[1])
for (const id of tocIds) assert.ok(SECTION_IDS.includes(id), `TOC มี #${id} ที่ไม่อยู่ในรายการ`)
ok(`หมวด equipment มี section + ลิงก์ TOC ครบ ${SECTION_IDS.length} หัวข้อ`)

const PHRASES = [
  '1 อีเวนต์ = 1 ใบจัดของ',
  'แทน &quot;กระเป๋า&quot; เดิม',
  'ทีมขายเลือกชิ้นเอง',
  'แบบประกอบ',
  'ของเสริม',
  'หน้าที่: จัดของ',
  'แผนกที่ดูแลอุปกรณ์',
  'พิมพ์ QR จุดรับของ',
  'บันทึกข้อกำหนด',
  'แก้แพ็กเกจ',
  'ระบบที่ใช้บริการ',
  'อุปกรณ์อาจไม่พอ',
  'แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ',
  'รอเปิดใบ',
  'รอคืนชั้น',
  'สร้างใบจัดของ',
  'ยกเลิกใบ',
  'ห้อง › ตู้ › ชั้น',
  'เปลี่ยนของ',
  'พิมพ์ใบจัดของ',
  'ยืนยันจัดของ',
  'คืนชั้นทั้งหมด',
  'ครบทุกชิ้น',
  'ยืนยันรับของ',
  'ขนของ',
  'ใช้ได้ทั้งหมด',
  'ยืนยันคืนของ',
  'ไม่ต้องติ๊กซ้ำ',
  'หยิบแล้ว x/y',
  'ไม่ต้องจัด',
  'นักจัดของ',
  'นักคืนของ',
  'รับหน้าที่จัดของ',
  'ใช้เฟรมเดิมชั่วคราว',
]
for (const p of PHRASES) assert.ok(html.includes(p), `ไม่พบข้อความ "${p}"`)
ok(`ข้อความหลักครบ ${PHRASES.length} ข้อ`)

const faqCount = (html.split('id="equip-faq"')[1].split('id="equip-menu"')[0].match(/\?<\/p>/g) ?? []).length
assert.ok(faqCount >= 8, `FAQ น้อยกว่า 8 ข้อ (${faqCount})`)
ok('FAQ อย่างน้อย 8 ข้อ')

const MENUS = ['/stock/settings', '/packages', '/packing', '/stock/usage', '/jobs/tracking', '/crm', '/reports', '/jobs/settings', '/settings?section=events']
const menuHtml = html.split('id="equip-menu"')[1]
for (const href of MENUS) assert.ok(menuHtml.includes(`href="${href}"`), `เมนูทั้งหมดไม่มีลิงก์ ${href}`)
ok(`เมนูทั้งหมดมีลิงก์ครบ ${MENUS.length} เมนู`)

assert.ok(!/window\.(confirm|alert)/.test(html), 'พบ window.confirm/alert')

// ── 2. หมวด stock ยังมีบล็อกใบจัดของ + ลิงก์คู่มือเต็ม ─────────────────
const stock = render('stock')
assert.ok(stock.includes('id="stock-packing-flow"'), 'หมวด stock ไม่มี stock-packing-flow')
const packingPart = stock.split('id="stock-packing-flow"')[1].split('id="stock-packing-roles"')[0]
assert.ok(packingPart.includes('href="/howto/equipment"'), 'บล็อก stock-packing-flow ไม่มีลิงก์ /howto/equipment')
assert.ok(!stock.includes('id="equip-start"'), 'หมวด stock ไม่ควรมีเนื้อหาหมวด equipment')
ok('หมวด stock ยังมี stock-packing-flow และลิงก์ไปคู่มือเต็ม')

// ── 3. landing มีการ์ด /howto/equipment ─────────────────────────────
const landing = render('landing')
assert.ok(landing.includes('href="/howto/equipment"'), 'landing ไม่มีลิงก์ /howto/equipment')
assert.ok(landing.includes('href="/howto/salary"'), 'landing การ์ดเดิม (salary) หาย')
assert.ok(!landing.includes('id="equip-start"'), 'landing ไม่ควรแสดงเนื้อหาหมวด equipment')
ok('landing มีการ์ดลิงก์ /howto/equipment')

// ── 4. หมวดอื่นไม่ปนเนื้อหา equipment ───────────────────────────────
assert.ok(!render('salary').includes('id="equip-start"'), 'หมวด salary ปนเนื้อหา equipment')
ok('หมวด salary ไม่ปนเนื้อหา equipment')

console.log('howto-equipment-render: ผ่านทั้งหมด')
