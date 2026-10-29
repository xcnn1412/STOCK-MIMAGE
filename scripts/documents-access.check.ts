/**
 * scripts/documents-access.check.ts — ชุดตรวจรายงานความปลอดภัยข้อ M6 (โมดูลเอกสาร)
 * ไม่แตะฐานข้อมูล: กติกาบริสุทธิ์ใน doc-types.ts + static scan ของ actions.ts / route PDF
 *
 *   npx tsx scripts/documents-access.check.ts      (รันจาก repo root)
 *
 * ponytail: ไม่มีฐานข้อมูลจำลองของโมดูลเอกสาร (doc-control-check.ts แตะ DB จริง)
 * จึงตรวจแค่กติกาบริสุทธิ์ + สแกนโค้ดว่าทุกทางเข้าเรียกยามและใช้กติกาตัวเดียวกัน
 */
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
  DOC_TYPES, DOC_TYPE_CODES, FILE_META_KEYS, PERSONAL_DOC_TYPES,
  canTransition, canViewDocument, isOwnDocPath, stripFileMeta,
  type DocTypeCode,
} from '../app/(authenticated)/documents/doc-types'

let n = 0
function ok(name: string, fn: () => void) {
  fn()
  n++
  console.log(`  ✓ ${name}`)
}

const A = 'user-a'
const B = 'user-b'
const ID = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

// ── 1. issue = ผู้สร้างหรือ admin ────────────────────────────────────────────
const draftDN = { created_by: A, status: 'draft' as const, doc_type: 'DN' as const }
ok('issue: staff คนอื่นออกเลขร่างของ A ไม่ได้', () => {
  assert.equal(canTransition('issue', draftDN, 'staff', B).ok, false)
})
ok('issue: ผู้สร้าง (A) ออกเลขได้', () => {
  assert.equal(canTransition('issue', draftDN, 'staff', A).ok, true)
})
ok('issue: admin ออกเลขได้', () => {
  assert.equal(canTransition('issue', draftDN, 'admin', B).ok, true)
})
ok('issue: ไม่มี userId ไม่ได้', () => {
  assert.equal(canTransition('issue', draftDN, 'staff', undefined).ok, false)
})

// ── 2. stripFileMeta ตัดครบ 4 คีย์ ไม่แตะคีย์อื่น ───────────────────────────
ok('stripFileMeta ตัดเฉพาะ file/file_name/file_size/file_pages', () => {
  const src = { file: 'documents/x/a.pdf', file_name: 'a.pdf', file_size: 1, file_pages: 2, purpose: 'p', stamp_mode: 's' }
  const out = stripFileMeta(src)
  assert.deepEqual(out, { purpose: 'p', stamp_mode: 's' })
  assert.deepEqual([...FILE_META_KEYS].sort(), ['file', 'file_name', 'file_pages', 'file_size'])
  assert.equal(src.file, 'documents/x/a.pdf', 'ต้องไม่แก้ object เดิม')
  assert.deepEqual(stripFileMeta(null), {})
  assert.deepEqual(stripFileMeta(undefined), {})
})

// ── 3. isOwnDocPath ─────────────────────────────────────────────────────────
ok('isOwnDocPath รับเฉพาะ documents/<id>/...', () => {
  assert.equal(isOwnDocPath(`documents/${ID}/x.pdf`, ID), true)
  assert.equal(isOwnDocPath(`documents/${OTHER}/x.pdf`, ID), false)
  assert.equal(isOwnDocPath('../x', ID), false)
  assert.equal(isOwnDocPath(`documents/${ID}/../${OTHER}/x.pdf`, ID), false)
  assert.equal(isOwnDocPath(`documents/${ID}/`, ID), false)
  assert.equal(isOwnDocPath(`documents/${ID}x/a.pdf`, ID), false)
  assert.equal(isOwnDocPath('', ID), false)
  assert.equal(isOwnDocPath(null, ID), false)
  assert.equal(isOwnDocPath(`documents//x.pdf`, ''), false)
})

// ── 4. ประเภทเอกสารส่วนตัว derive จาก DOC_TYPES ─────────────────────────────
ok('PERSONAL_DOC_TYPES = ทุกประเภทที่ party เป็น employee/applicant เท่านั้น', () => {
  const expected = (Object.keys(DOC_TYPES) as DocTypeCode[])
    .filter(c => DOC_TYPES[c].party === 'employee' || DOC_TYPES[c].party === 'applicant')
    .sort()
  assert.deepEqual([...PERSONAL_DOC_TYPES].sort(), expected)
  for (const c of ['SC', 'JA', 'IA'] as const) assert.ok(PERSONAL_DOC_TYPES.includes(c), `ต้องมี ${c}`)
  for (const c of DOC_TYPE_CODES) {
    const personal = DOC_TYPES[c].party === 'employee' || DOC_TYPES[c].party === 'applicant'
    assert.equal(PERSONAL_DOC_TYPES.includes(c), personal, c)
  }
  console.log(`    (ประเภทส่วนตัว: ${[...PERSONAL_DOC_TYPES].join(', ')})`)
})

// ── 5. canViewDocument ──────────────────────────────────────────────────────
ok('canViewDocument: ใบส่วนตัวที่ออกเลขแล้ว non-admin เห็นเฉพาะของตัวเอง', () => {
  const sc = { doc_type: 'SC', doc_no: 'SC-001', created_by: A }
  assert.equal(canViewDocument(sc, 'staff', A), true)
  assert.equal(canViewDocument(sc, 'staff', B), false)
  assert.equal(canViewDocument(sc, 'admin', B), true)
  const draftSc = { ...sc, doc_no: null }
  assert.equal(canViewDocument(draftSc, 'staff', B), false)
})
ok('canViewDocument: ใบทั่วไปคงกติกาเดิม (ออกเลขแล้ว = ทุกคน, ร่าง = ผู้สร้าง)', () => {
  const dn = { doc_type: 'DN', doc_no: 'DN-001', created_by: A }
  assert.equal(canViewDocument(dn, 'staff', B), true)
  assert.equal(canViewDocument({ ...dn, doc_no: null }, 'staff', B), false)
  assert.equal(canViewDocument({ ...dn, doc_no: null }, 'staff', A), true)
  assert.equal(canViewDocument({ ...dn, doc_no: null }, 'admin', B), true)
  assert.equal(canViewDocument({ ...dn, doc_no: null, created_by: null }, 'staff', undefined), false)
})

// ── 6. static scan ──────────────────────────────────────────────────────────
const root = path.resolve(__dirname, '..')
const actionsSrc = fs.readFileSync(path.join(root, 'app/(authenticated)/documents/actions.ts'), 'utf8')
const routeSrc = fs.readFileSync(path.join(root, 'app/api/pdf/document/[id]/route.ts'), 'utf8')
const sessionSrc = fs.readFileSync(path.join(root, 'app/(authenticated)/documents/session.ts'), 'utf8')

ok('ทุก export async function ใน documents/actions.ts เรียก requireDocuments(/requireAdmin( ภายใน 6 บรรทัดแรก', () => {
  const lines = actionsSrc.split(/\r?\n/)
  const fns: string[] = []
  lines.forEach((l, i) => {
    const m = l.match(/^export async function (\w+)/)
    if (!m) return
    fns.push(m[1])
    const head = lines.slice(i, i + 7).join('\n')
    assert.ok(/requireDocuments\(|requireAdmin\(/.test(head), `${m[1]} ไม่เรียกยามโมดูล`)
  })
  assert.ok(fns.length >= 12, `เจอ export แค่ ${fns.length} ตัว`)
  assert.ok(!/\bgetSession\b/.test(actionsSrc), 'actions.ts ต้องไม่ใช้ getSession แล้ว')
})
ok('requireAdmin / requireDocuments ใน session.ts ตรวจโมดูล documents', () => {
  assert.ok(/requireModule\('documents'\)/.test(sessionSrc))
  const adminBody = sessionSrc.slice(sessionSrc.indexOf('export async function requireAdmin'))
  assert.ok(/await requireDocuments\(\)/.test(adminBody.split('\n').slice(0, 4).join('\n')), 'requireAdmin ต้องเรียก requireDocuments')
})
ok('route PDF import และเรียก requireDocuments( + ใช้ canViewDocument/isOwnDocPath', () => {
  assert.ok(/import \{[^}]*requireDocuments[^}]*\} from '@\/app\/\(authenticated\)\/documents\/session'/.test(routeSrc))
  assert.ok(/await requireDocuments\(\)/.test(routeSrc))
  assert.ok(!/\bgetSession\b/.test(routeSrc))
  assert.ok(/canViewDocument\(doc, role, userId\)/.test(routeSrc))
  assert.ok(/isOwnDocPath\(rawPath, id\)/.test(routeSrc))
})
ok('actions.ts: saveDraft ใช้ stripFileMeta, docFilePath ทุกจุดส่ง id, getDocument/listDocuments/duplicate ใช้ canViewDocument', () => {
  assert.ok(/sanitizeMeta\(stripFileMeta\(payload\.meta\)\)/.test(actionsSrc))
  const calls = actionsSrc.match(/docFilePath\([^)]*\)/g) || []
  assert.ok(calls.length >= 4)
  for (const c of calls) assert.ok(/docFilePath\((doc\.meta, id|meta: unknown, docId: string)\)/.test(c), c)
  assert.ok((actionsSrc.match(/canViewDocument\(/g) || []).length >= 3)
  assert.ok(/PERSONAL_DOC_TYPES as string\[\]\)\.includes\(doc_type/.test(actionsSrc), 'searchParties ต้องกรองเอกสารส่วนตัว')
})

console.log(`\n${n} เคส`)
console.log('documents-access: ผ่านทั้งหมด')
