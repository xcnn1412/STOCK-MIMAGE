// สำเนา calcTax ทั้ง 13 ที่ในโค้ด เทียบกับ lib/finance/money.ts (ขั้น 3 · BATCH 0) — พิสูจน์ก่อนแทนสำเนาด้วยการ import
// Run:  npx tsx scripts/finance-calc-tax.check.ts                 (เทียบกับ scripts/fixtures/calc-tax-variants.json)
//       npx tsx scripts/finance-calc-tax.check.ts --write-golden  (ดึงสำเนาจากไฟล์ปัจจุบันเก็บลง fixture — ทำครั้งเดียวที่ 3248bde ก่อนแทน)
//       npx tsx scripts/finance-calc-tax.check.ts --sql-fixture   (พิมพ์ 6 ชุดค่า + ผล float8 ที่คาดไว้ ให้ scripts/finance-speed.check.sql)
//
// วิธีตรวจ: ตัดฟังก์ชัน `function calcTax` ของแต่ละไฟล์ด้วย regex + นับวงเล็บ → เก็บข้อความลง fixture (จัดกลุ่มแบบ A–F ตามเนื้อฟังก์ชัน
// หลังตัดคอมเมนต์/ช่องว่าง) → แปลง TS เป็น JS ด้วย typescript.transpileModule → รันเทียบกับ calcTax ของ money.ts ด้วย Object.is ทุกคีย์ที่คืน
// ชุดค่า: ยอด 13 ค่าคงที่ + 20,000 ค่าสุ่ม 2 ตำแหน่งใน [0, 200000] + 1,000 ค่า double ดิบ × VAT 7 แบบ × อัตรา 11 แบบ (1,618,001 ชุด)
// ความต่างทั้งหมดพิมพ์ออกมาเป็นกลุ่ม (ไฟล์ · คีย์ · VAT · อัตรา · ค่าที่ได้ / ค่าของ money.ts) พร้อมตัวอย่างยอด
// ที่ยอมรับได้มีแบบเดียว: overview/analytics-panel.tsx เมื่ออัตรา undefined/null (ตัวเดิมถือเป็น 0 · money.ts ได้ NaN) —
// หายไปเมื่อใช้ตัวแปลงที่จุดเรียก `calcTax(amount, vatMode ?? 'none', Number(whtRate || 0))` ซึ่งสคริปต์ตรวจให้ต่างเป็นศูนย์
// หลังแทนสำเนาแล้ว (BATCH 1): ไฟล์ที่ไม่มี `function calcTax` แล้วต้องอ้าง '@/lib/finance/money' · ไฟล์ที่ยังมีต้องตรงกับ fixture ทุกตัวอักษร
// ยกเว้น finance-download-view.tsx (ข้อแก้ 2 ของ orchestrator): หน้าได้ยอดที่ server รวมด้วย money.ts แล้ว (WhtCell) — ต้องไม่คิดภาษีเองเลย
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "finance-calc-tax: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { calcTax } from '../lib/finance/money'

const ROOT = join(__dirname, '..')
const GOLDEN = join(ROOT, 'scripts', 'fixtures', 'calc-tax-variants.json')
const WRITE = process.argv.includes('--write-golden')
const SQL_FIXTURE = process.argv.includes('--sql-fixture')

/** 13 ไฟล์ที่มีสำเนา calcTax (ลำดับตามแผนขั้น 3) */
const PATHS = [
  'lib/claim-voucher.ts',
  'app/(authenticated)/finance/[id]/claim-detail-view.tsx',
  'app/(authenticated)/finance/archive/archive-list.tsx',
  'app/(authenticated)/finance/overview/overview-dashboard.tsx',
  'app/(authenticated)/finance/payouts/payout-dashboard.tsx',
  'app/(authenticated)/finance/new/create-claim-form.tsx',
  'app/(authenticated)/finance/download/finance-download-view.tsx',
  'app/(authenticated)/finance/claims-list-view.tsx',
  'app/(authenticated)/costs/reports/reports-view.tsx',
  'app/(authenticated)/costs/events/events-list-view.tsx',
  'app/(authenticated)/costs/events/[id]/event-cost-detail-view.tsx',
  'app/(authenticated)/overview/analytics-panel.tsx',
  'app/(authenticated)/overview/pl/pl-lib.ts',
] as const
const ANALYTICS = 'app/(authenticated)/overview/analytics-panel.tsx'
/** หน้าหัก ณ ที่จ่าย (ขั้น 3) ไม่คิดภาษีเอง — ยอดมาจาก server (report-data.ts / finance_wht_cells ใช้สูตรของ money.ts) */
const PRESUMMED = 'app/(authenticated)/finance/download/finance-download-view.tsx'
/** โค้ด JS ของไฟล์ (ไม่มีคอมเมนต์และชนิด) — ตรวจว่าไม่มีการคิดภาษีเหลืออยู่ */
const codeOnly = (file: string) =>
  ts.transpileModule(readFileSync(join(ROOT, file), 'utf8'), {
    compilerOptions: { removeComments: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText

type Variant = { class: string; source: string }
type Golden = Record<string, Variant>
type Money = ReturnType<typeof calcTax>
type Fn = (amount: unknown, vatMode: unknown, rate: unknown) => Record<string, unknown>

const pass = (label: string) => console.log(`PASS  ${label}`)

// ── ตัดฟังก์ชันออกจากไฟล์ ─────────────────────────────────────────────────────────
/** ตำแหน่งหลังตัวปิดของ ' " ` (ข้าม ${…} ใน template) */
function skipString(src: string, i: number): number {
  const q = src[i]
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++
    else if (q === '`' && src[j] === '$' && src[j + 1] === '{') j = matchBrace(src, j + 1)
    else if (src[j] === q) return j
  }
  throw new Error('สตริงไม่ปิด')
}
/** src[open] คือ '{' หรือ '(' → ตำแหน่งตัวปิดคู่ (ข้ามสตริงและคอมเมนต์) */
function matchBrace(src: string, open: number): number {
  const pair: Record<string, string> = { '{': '}', '(': ')' }
  const want = pair[src[open]]
  assert.ok(want, `ตำแหน่ง ${open} ไม่ใช่วงเล็บเปิด`)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === '/' && src[i + 1] === '/') i = src.indexOf('\n', i) < 0 ? src.length : src.indexOf('\n', i)
    else if (ch === '/' && src[i + 1] === '*') i = src.indexOf('*/', i + 2) + 1
    else if (ch === "'" || ch === '"' || ch === '`') i = skipString(src, i)
    else if (ch === src[open]) depth++
    else if (ch === want && --depth === 0) return i
  }
  throw new Error('วงเล็บไม่ปิด')
}
/** ข้อความของ `function calcTax(…) {…}` (ตัด export ออก · ขึ้นบรรทัดแบบ \n เสมอ ไม่ขึ้นกับ CRLF ของเครื่อง) — null เมื่อไฟล์ไม่มีแล้ว */
function extract(file: string): string | null {
  const src = readFileSync(join(ROOT, file), 'utf8').replace(/\r\n/g, '\n')
  const all = [...src.matchAll(/(?:^|\n)[ \t]*(?:export[ \t]+)?(function[ \t]+calcTax[ \t]*)\(/g)]
  if (all.length === 0) return null
  assert.equal(all.length, 1, `${file}: มี function calcTax มากกว่าหนึ่งที่`)
  const start = (all[0].index ?? 0) + all[0][0].indexOf('function')
  const paramsOpen = src.indexOf('(', start)
  const paramsClose = matchBrace(src, paramsOpen)
  const bodyOpen = src.indexOf('{', paramsClose)
  return src.slice(start, matchBrace(src, bodyOpen) + 1)
}

/** เนื้อฟังก์ชันหลังตัดชนิด คอมเมนต์ ช่องว่าง ; — ใช้จัดกลุ่ม */
const normalized = (source: string) =>
  ts.transpileModule(source, { compilerOptions: { removeComments: true, target: ts.ScriptTarget.ES2020 } }).outputText.replace(/[\s;]/g, '')

/** แปลงข้อความ TS เป็นฟังก์ชันที่เรียกได้ */
function compile(source: string): Fn {
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, removeComments: true },
  }).outputText
  return new Function(`${js}\nreturn calcTax`)() as Fn
}

/** คีย์ของ analytics-panel → คีย์ของ money.ts */
const KEY_MAP: Record<string, keyof Money> = {
  baseAmount: 'baseAmount', vatAmount: 'vatAmount', totalWithVat: 'totalWithVat', whtAmount: 'whtAmount', netPayable: 'netPayable',
  base: 'baseAmount', vat: 'vatAmount', wht: 'whtAmount', net: 'netPayable',
}

/** ตัวแปลงที่จุดเรียกของ analytics-panel (แผน BATCH 1) — คืนคีย์ชุดเดิมของ analytics-panel */
function analyticsAdapter(amount: number, vatMode: string | null | undefined, whtRate: number | null | undefined) {
  const t = calcTax(amount, vatMode ?? 'none', Number(whtRate || 0))
  return { base: t.baseAmount, vat: t.vatAmount, wht: t.whtAmount, totalWithVat: t.totalWithVat, net: t.netPayable }
}

// ── ชุดค่า ──────────────────────────────────────────────────────────────────
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const FIXED_AMOUNTS = [0, 0.01, 0.1, 1, 7, 100, 107, 535, 1250.5, 2501, 9999.99, 123456.78, 1e6]
const VAT_MODES: unknown[] = ['none', 'included', 'excluded', '', null, undefined, 'INCLUDED']
const RATES: unknown[] = [0, 1, 1.5, 2, 3, 5, 10, 15, null, undefined, '3']

function amountCorpus(): number[] {
  const rand = seeded(20261001)
  const twoDecimals = Array.from({ length: 20_000 }, () => Math.round(rand() * 20_000_000) / 100)
  // double ดิบ: ครึ่งแรกทศนิยมเต็ม (ไม่ปัด) ขนาด 1e-2 … 1e7 · ครึ่งหลังสุ่มบิตทั้ง 64 บิต (ทุกเครื่องหมาย/ขนาด) เฉพาะค่าจำกัด
  const raw: number[] = Array.from({ length: 500 }, () => rand() * 10 ** (Math.floor(rand() * 10) - 2))
  const view = new DataView(new ArrayBuffer(8))
  while (raw.length < 1000) {
    view.setUint32(0, Math.floor(rand() * 2 ** 32))
    view.setUint32(4, Math.floor(rand() * 2 ** 32))
    const x = view.getFloat64(0)
    if (Number.isFinite(x) && !Object.is(x, -0)) raw.push(x)
  }
  return [...FIXED_AMOUNTS, ...twoDecimals, ...raw]
}

const show = (v: unknown) => (v === undefined ? 'undefined' : typeof v === 'string' ? `'${v}'` : Object.is(v, -0) ? '-0' : String(v))

/** ความต่างหนึ่งกลุ่ม: (ไฟล์, คีย์, อัตรา, ชนิดค่าที่ได้, ชนิดค่าของ money.ts) — รวมทุกแบบ VAT ที่เกิด */
type Diff = {
  file: string; key: string; rate: string; got: string; want: string
  modes: Set<string>; count: number; examples: string[]
}
/** เทียบ fn กับ ref ทุกชุดค่า (ยอด × VAT × อัตรา) ด้วย Object.is ทุกคีย์ที่ fn คืน — จัดกลุ่มตามคีย์และอัตรา */
function compareAll(file: string, fn: Fn, ref: Fn, amounts: number[]): { diffs: Diff[]; calls: number } {
  const groups = new Map<string, Diff>()
  let calls = 0
  const kind = (v: unknown) =>
    typeof v === 'number' ? (Number.isNaN(v) ? 'NaN' : Object.is(v, -0) ? '-0' : v === 0 ? '+0' : 'ตัวเลข') : show(v)
  for (const mode of VAT_MODES) for (const rate of RATES) for (const amount of amounts) {
    calls++
    const got = fn(amount, mode, rate)
    const want = ref(amount, mode, rate)
    for (const key of Object.keys(got)) {
      const g = got[key], w = want[key]
      if (Object.is(g, w)) continue
      const k = `${key}|${show(rate)}|${kind(g)}|${kind(w)}`
      let d = groups.get(k)
      if (!d) groups.set(k, (d = { file, key, rate: show(rate), got: kind(g), want: kind(w), modes: new Set(), count: 0, examples: [] }))
      d.count++
      d.modes.add(show(mode))
      if (d.examples.length < 3) d.examples.push(`ยอด ${show(amount)} VAT ${show(mode)} อัตรา ${show(rate)} → ${show(g)} / ${show(w)}`)
    }
  }
  return { diffs: [...groups.values()], calls }
}

/** money.ts ในรูปคีย์ของสำเนานั้น (ชุดคีย์ย่อย / ชื่อคีย์ของ analytics-panel) */
function moneyAs(keys: string[]): Fn {
  for (const k of keys) assert.ok(KEY_MAP[k], `คีย์ที่ไม่รู้จัก: ${k}`)
  return (amount, mode, rate) => {
    const m = calcTax(amount as number, mode as string, rate as number)
    return Object.fromEntries(keys.map(k => [k, m[KEY_MAP[k]]]))
  }
}

function printDiffs(title: string, diffs: Diff[]) {
  console.log(`      ${title}: ${diffs.length === 0 ? 'ไม่ต่าง' : `${diffs.reduce((s, d) => s + d.count, 0).toLocaleString()} ค่าใน ${diffs.length} กลุ่ม`}`)
  for (const d of diffs) {
    const modes = d.modes.size === VAT_MODES.length ? `ทุกแบบ (${VAT_MODES.length})` : [...d.modes].join('/')
    console.log(`        · ${d.file} · ${d.key} · อัตรา ${d.rate} · VAT ${modes} · ได้ ${d.got} แต่ money.ts ได้ ${d.want} · ${d.count.toLocaleString()} ครั้ง (เช่น ${d.examples.join(' ; ')})`)
  }
}

// ── --sql-fixture ────────────────────────────────────────────────────────────
/** 6 ชุดค่าให้ finance_claim_money ของ 20261001_finance_speed.sql — ผล float8 ต้องตรงกับ money.ts ทุกบิต */
const SQL_TUPLES: [number, string, number | null][] = [
  [1250.5, 'included', 3],
  [2501, 'excluded', 3],
  [107, 'none', 1.5],
  [9999.99, 'included', 5],
  [0.1, 'excluded', 15],
  [123456.78, 'included', null],
]
function printSqlFixture() {
  console.log('-- finance-calc-tax --sql-fixture: (amount numeric, vat_mode text, wht_rate numeric) → base_amount, vat_amount, total_with_vat, wht_amount, net_payable')
  console.log('-- ผลที่คาด = calcTax ของ lib/finance/money.ts (อัตรา null = 0) พิมพ์แบบ round-trip ของ JS — float8 ของ Postgres อ่านค่าเดิมได้ทุกบิต')
  const rows = SQL_TUPLES.map(([amount, mode, rate]) => {
    const m = calcTax(amount, mode, Number(rate ?? 0))
    const f = (x: number) => `${String(x)}::float8`
    return `  (${amount}::numeric, '${mode}', ${rate === null ? 'NULL' : `${rate}::numeric`}, ${f(m.baseAmount)}, ${f(m.vatAmount)}, ${f(m.totalWithVat)}, ${f(m.whtAmount)}, ${f(m.netPayable)})`
  })
  console.log('VALUES')
  console.log(rows.join(',\n'))
}

// ── main ────────────────────────────────────────────────────────────────────
function main() {
  if (SQL_FIXTURE) {
    printSqlFixture()
    return
  }

  if (WRITE) {
    const golden: Golden = {}
    const classOf = new Map<string, string>()
    for (const file of PATHS) {
      const source = extract(file)
      assert.ok(source, `${file}: ไม่พบ function calcTax — --write-golden ต้องรันกับโค้ดที่ยังมีสำเนาครบ (3248bde)`)
      const norm = normalized(source)
      if (!classOf.has(norm)) classOf.set(norm, String.fromCharCode(65 + classOf.size))
      golden[file] = { class: classOf.get(norm) as string, source }
    }
    mkdirSync(dirname(GOLDEN), { recursive: true })
    writeFileSync(GOLDEN, JSON.stringify(golden, null, 2) + '\n', 'utf8')
    const byClass = [...classOf.values()].map(c => `${c}: ${PATHS.filter(p => golden[p].class === c).length}`).join(' · ')
    console.log(`เขียนสำเนา ${PATHS.length} ตัว (${classOf.size} แบบ — ${byClass}) → ${GOLDEN}`)
    return
  }

  assert.ok(existsSync(GOLDEN), `ไม่มี ${GOLDEN} — รันด้วย --write-golden กับโค้ดที่ยังมีสำเนาก่อน`)
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden
  assert.deepEqual(Object.keys(golden), [...PATHS], 'fixture ต้องมี 13 ไฟล์ตามลำดับของแผน')
  const classes = [...new Set(PATHS.map(p => golden[p].class))]
  assert.deepEqual(classes, ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, classes.length), 'แบบ A… ตามลำดับที่พบ')

  // ── ไฟล์ปัจจุบันกับ fixture: ยังมีสำเนา = ต้องตรงทุกตัวอักษร · ไม่มีแล้ว = ต้องอ้าง money.ts ──────────────────
  let copies = 0, replaced = 0, presummed = 0
  for (const file of PATHS) {
    const now = extract(file)
    if (now !== null) {
      assert.equal(now, golden[file].source, `${file}: calcTax ในไฟล์เปลี่ยนจาก fixture — แก้สำเนาโดยไม่ย้ายไป money.ts?`)
      copies++
    } else if (file === PRESUMMED) {
      // ไม่มีสำเนา และไม่มีการคิดภาษีเหลือ (ไม่เรียก calcTax · ไม่มี 1.07 / 0.07 · ไม่อ่านอัตราหรือแบบ VAT ของใบ) — ยอดมาจาก cells ของ server
      const code = codeOnly(file)
      const bad = [/\bcalcTax\b/, /\b1\.07\b/, /\b0\.07\b/, /\bwithholding_tax_rate\b/, /\bvat_mode\b/].filter(re => re.test(code)).map(String)
      assert.deepEqual(bad, [], `${file}: ยังคิดภาษีเองอยู่`)
      assert.match(code, /\bcells\b/, `${file}: ต้องใช้ยอดจาก cells ของ server`)
      presummed++
    } else {
      assert.match(readFileSync(join(ROOT, file), 'utf8'), /from '@\/lib\/finance\/money'/, `${file}: ไม่มี calcTax แล้วแต่ไม่ได้อ้าง '@/lib/finance/money'`)
      replaced++
    }
  }
  pass(`fixture ${PATHS.length} ไฟล์ ${classes.length} แบบ (${classes.map(c => `${c}=${PATHS.filter(p => golden[p].class === c).length}`).join(' ')}) · ไฟล์ปัจจุบัน: ยังมีสำเนาตรง fixture ${copies} · ใช้ money.ts แล้ว ${replaced} · ไม่คิดภาษีเอง (ยอดจาก server) ${presummed}`)

  // ── เทียบทุกสำเนากับ money.ts ─────────────────────────────────────────────────
  const amounts = amountCorpus()
  assert.equal(amounts.length, FIXED_AMOUNTS.length + 21_000)
  const allDiffs: Diff[] = []
  const adapterDiffs: Diff[] = []
  let calls = 0
  const probe = [1250.5, 'included', 3] as const
  for (const file of PATHS) {
    const fn = compile(golden[file].source)
    const keys = Object.keys(fn(...probe))
    const ref = moneyAs(keys)
    const r = compareAll(file, fn, ref, amounts)
    calls += r.calls
    allDiffs.push(...r.diffs)
    const label = `${golden[file].class} ${file} → { ${keys.join(', ')} }`
    if (file === ANALYTICS) {
      // จุดเรียกหลังแทน: ตัวแปลงของแผน (อัตรา Number(whtRate || 0) · VAT ?? 'none') ต้องไม่ต่างเลย
      const adapted = compareAll(file, fn, analyticsAdapter as Fn, amounts)
      adapterDiffs.push(...adapted.diffs)
      console.log(`      ${label}: ${r.diffs.length === 0 ? 'ตรงทุกค่า' : `ต่าง ${r.diffs.reduce((s, d) => s + d.count, 0).toLocaleString()} ค่า`} · ผ่านตัวแปลง Number(whtRate || 0): ${adapted.diffs.length === 0 ? 'ตรงทุกค่า' : 'ยังต่าง'}`)
    } else {
      console.log(`      ${label}: ${r.diffs.length === 0 ? 'ตรงทุกค่า' : `ต่าง ${r.diffs.reduce((s, d) => s + d.count, 0).toLocaleString()} ค่า`}`)
    }
  }
  printDiffs('ความต่างทั้งหมดเทียบ money.ts ตรงๆ', allDiffs)
  printDiffs('ความต่างของ analytics-panel หลังใช้ตัวแปลงที่จุดเรียก', adapterDiffs)

  const diffRates = [...new Set(allDiffs.map(d => d.rate))]
  const unexpected = allDiffs.filter(d => !(d.file === ANALYTICS && (d.rate === 'undefined' || d.rate === 'null')))
  assert.deepEqual(unexpected, [], 'ต่างจาก money.ts ในกรณีที่ไม่ได้คาดไว้')
  assert.ok(allDiffs.length > 0, 'ต้องพบความต่างของ analytics-panel เมื่ออัตรา undefined (ถ้าไม่พบ แปลว่าเทียบผิดคีย์)')
  assert.ok(allDiffs.every(d => (d.key === 'wht' || d.key === 'net') && d.want === 'NaN'), 'ความต่างที่คาด: wht/net ของ analytics-panel = ตัวเลข แต่ money.ts = NaN')
  assert.deepEqual(adapterDiffs, [], 'หลังใช้ตัวแปลงที่จุดเรียก analytics-panel ต้องไม่ต่างเลย')
  pass(`13 สำเนา × ${calls / PATHS.length} ชุดค่า (${amounts.length.toLocaleString()} ยอด × VAT ${VAT_MODES.length} × อัตรา ${RATES.length}) = ${calls.toLocaleString()} ครั้ง เทียบด้วย Object.is ทุกคีย์ที่คืน: 12 สำเนาตรง money.ts ทุกค่า · analytics-panel ต่างเฉพาะอัตรา ${diffRates.join('/')} (wht/net: ตัวเดิม = ตัวเลข, money.ts = NaN · อัตรา null ไม่ต่าง เพราะ null / 100 = 0) · ผ่านตัวแปลง Number(whtRate || 0) แล้วไม่ต่างเลย`)

  console.log('\nfinance-calc-tax: ผ่านทั้งหมด')
}

try {
  main()
} catch (e) {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
}
