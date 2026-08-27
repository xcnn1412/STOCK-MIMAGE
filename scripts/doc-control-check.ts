/* eslint-disable no-console */
// Document Control — ตรวจกติกาเหล็กของ numbering engine + guard triggers กับ DB จริง
//
// Run:  npx tsx scripts/doc-control-check.ts
//
// ใช้แบรนด์ทดสอบ 'ZZT' แล้วล้างทิ้งด้วย rpc purge_test_documents('ZZT') ตอนจบ
// (เอกสารที่ออกเลขแล้วลบตรงๆ ไม่ได้ — trigger บล็อกไว้)
//
// ต่อ DB อื่น (local stack) ได้ด้วย env CHECK_SUPABASE_URL / CHECK_SERVICE_KEY

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.CHECK_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.CHECK_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing CHECK_SUPABASE_URL/CHECK_SERVICE_KEY (or NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in .env.local)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BRAND = 'ZZT'

let failures = 0
let draftSeq = 0

function ok(name: string, detail = '') {
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name: string, detail: string) {
  failures++
  console.error(`  FAIL  ${name} — ${detail}`)
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name, detail)
  else fail(name, detail || 'assertion failed')
}

/** เลขที่เอกสารส่วนท้าย NNNN */
function seqOf(docNo: string): number {
  return Number(docNo.split('-').pop())
}

async function actorId(): Promise<string | null> {
  const { data } = await supabase.from('profiles').select('id').eq('is_approved', true).limit(1).single()
  return data?.id ?? null
}

async function createDraft(docType: string, actor: string | null): Promise<string> {
  draftSeq++
  const { data, error } = await supabase
    .from('documents')
    .insert({
      draft_no: `ZZTEST-${Date.now()}-${draftSeq}`,
      brand_code: BRAND,
      doc_type: docType,
      status: 'draft',
      party_name: 'ทดสอบ',
      total: 100,
      created_by: actor,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createDraft failed: ${error?.message}`)
  return data.id as string
}

async function issue(docId: string, actor: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('issue_document_number', {
    p_doc_id: docId, p_actor: actor, p_template_version_id: null,
  })
  if (error) throw new Error(`issue failed: ${error.message}`)
  return data as unknown as string
}

async function main() {
  const actor = await actorId()

  // แบรนด์ทดสอบ (ถ้าค้างจากรอบก่อนให้ล้างก่อน)
  await supabase.rpc('purge_test_documents', { p_brand: BRAND })
  const { error: brandErr } = await supabase.from('doc_brands').insert({
    code: BRAND, name_th: 'แบรนด์ทดสอบ', vat_registered: true, tax_id: '0000000000000',
    address: 'ที่อยู่ทดสอบ', is_active: true, sort_order: 999,
  })
  if (brandErr) throw new Error(`seed brand failed: ${brandErr.message}`)

  // ── 1. ออกเลขพร้อมกัน 20 ใบ → 0001..0020 ไม่ซ้ำ ไม่ข้าม ────────────────
  console.log('\n[1] concurrent issue × 20')
  const draftIds = await Promise.all(Array.from({ length: 20 }, () => createDraft('QT', actor)))
  const docNos = await Promise.all(draftIds.map(id => issue(id, actor)))
  const seqs = docNos.map(seqOf).sort((a, b) => a - b)
  const expected = Array.from({ length: 20 }, (_, i) => i + 1)
  assert(new Set(docNos).size === 20, 'เลขที่ไม่ซ้ำ 20 ใบ', `unique=${new Set(docNos).size}`)
  assert(JSON.stringify(seqs) === JSON.stringify(expected), 'เลข 0001–0020 ครบไม่ข้าม', seqs.join(','))

  // ── 2. pending_approval ต้องไม่มี doc_no ──────────────────────────────
  console.log('\n[2] pending_approval has no doc_no')
  const pendingId = await createDraft('QT', actor)
  await supabase.from('documents').update({ status: 'pending_approval', submitted_at: new Date().toISOString() }).eq('id', pendingId)
  {
    const { data } = await supabase.from('documents').select('status, doc_no').eq('id', pendingId).single()
    assert(data?.status === 'pending_approval' && data?.doc_no === null, 'pending_approval ยังไม่มีเลขจริง', String(data?.doc_no))
  }

  // ── 3. DELETE เอกสารที่ออกเลขแล้ว → error ─────────────────────────────
  console.log('\n[3] delete issued document is blocked')
  const issuedId = draftIds[0]
  {
    const { error } = await supabase.from('documents').delete().eq('id', issuedId)
    assert(!!error, 'ลบเอกสารที่ออกเลขแล้วถูกปฏิเสธ', error?.message || 'no error returned')
  }

  // ── 4. UPDATE เนื้อหา/items ถูกบล็อก แต่ void ผ่าน ────────────────────
  console.log('\n[4] issued document is immutable except status/void')
  {
    const { error: e1 } = await supabase.from('documents').update({ total: 999 }).eq('id', issuedId)
    assert(!!e1, 'แก้ total ของเอกสารที่ออกเลขแล้วถูกปฏิเสธ', e1?.message || 'no error')

    const { error: e2 } = await supabase.from('documents').update({ party_name: 'เปลี่ยนชื่อ' }).eq('id', issuedId)
    assert(!!e2, 'แก้ party_name ถูกปฏิเสธ', e2?.message || 'no error')

    const { error: e3 } = await supabase.from('document_items').insert({
      document_id: issuedId, line_no: 1, description: 'x', quantity: 1, unit_price: 1, amount: 1,
    })
    assert(!!e3, 'เพิ่ม document_items ของเอกสารที่ออกเลขแล้วถูกปฏิเสธ', e3?.message || 'no error')

    const { error: e4 } = await supabase
      .from('documents')
      .update({ status: 'void', void_reason: 'ทดสอบ', void_at: new Date().toISOString() })
      .eq('id', issuedId)
    assert(!e4, 'VOID เอกสารที่ออกเลขแล้วทำได้', e4?.message || '')
  }

  // ── 5. กติกา "ตีกลับต้องมีเหตุผล" อยู่ใน TRANSITIONS ──────────────────
  console.log('\n[5] TRANSITIONS config')
  {
    // ponytail: server action รันนอก Next ไม่ได้ → ตรวจที่ config ที่ action ใช้แทน
    const { TRANSITIONS } = await import('../app/(authenticated)/documents/doc-types')
    assert(TRANSITIONS.reject.requiresNote === true, 'reject บังคับใส่เหตุผล')
    assert(TRANSITIONS.void.requiresNote === true && TRANSITIONS.void.adminOnly === true, 'void บังคับเหตุผล + admin เท่านั้น')
  }

  // ── 6. TX ใช้ตัวนับรายปี, QT ใช้รายเดือน ─────────────────────────────
  console.log('\n[6] TX yearly counter vs QT monthly counter')
  {
    const tx1 = await issue(await createDraft('TX', actor), actor)
    const tx2 = await issue(await createDraft('TX', actor), actor)
    assert(seqOf(tx2) === seqOf(tx1) + 1, 'TX เลขต่อเนื่อง', `${tx1} → ${tx2}`)

    const { data: counters } = await supabase
      .from('doc_counters').select('doc_type, period, last_number').eq('brand_code', BRAND)
    const tx = (counters || []).find((c: any) => c.doc_type === 'TX')
    const qt = (counters || []).find((c: any) => c.doc_type === 'QT')
    assert(!!tx && tx.period.length === 2, 'ตัวนับ TX ใช้ period = YY (รายปี)', tx?.period)
    assert(!!qt && qt.period.length === 4, 'ตัวนับ QT ใช้ period = YYMM (รายเดือน)', qt?.period)
  }

  // ── 7. VOID แล้วออกใบใหม่ → เลขถัดไป ไม่ใช้เลขซ้ำ ────────────────────
  console.log('\n[7] void never frees its number')
  {
    const { data: before } = await supabase
      .from('documents').select('doc_no').eq('brand_code', BRAND).eq('doc_type', 'QT').not('doc_no', 'is', null)
    const maxBefore = Math.max(...(before || []).map((d: any) => seqOf(d.doc_no)))
    const next = await issue(await createDraft('QT', actor), actor)
    assert(seqOf(next) === maxBefore + 1, 'เลขใหม่ = max เดิม + 1 (ไม่วนกลับไปใช้เลข VOID)', `${maxBefore} → ${next}`)
  }

  // ── 8. รายงานเลขต่อเนื่อง: จงใจกระโดด 3 เลข → ตรวจเจอเลขหาย 3 ────────
  console.log('\n[8] gap detection')
  {
    const { data: c } = await supabase
      .from('doc_counters').select('last_number, period')
      .eq('brand_code', BRAND).eq('doc_type', 'QT').single()
    await supabase
      .from('doc_counters').update({ last_number: (c!.last_number as number) + 3 })
      .eq('brand_code', BRAND).eq('doc_type', 'QT').eq('period', c!.period as string)

    await issue(await createDraft('QT', actor), actor)

    const { data: rows } = await supabase
      .from('documents').select('doc_no').eq('brand_code', BRAND).eq('doc_type', 'QT').not('doc_no', 'is', null)
    const nums = (rows || []).map((r: any) => seqOf(r.doc_no)).sort((a: number, b: number) => a - b)
    const missing: number[] = []
    for (let n = nums[0]; n <= nums[nums.length - 1]; n++) if (!nums.includes(n)) missing.push(n)
    assert(missing.length === 3, 'ตรวจพบเลขหายพอดี 3 เลข', missing.join(',') || 'none')
  }

  // ── 9. ทุกเอกสารที่ออกเลขแล้วมี log อย่างน้อย 1 แถว พร้อม changed_by ──
  console.log('\n[9] every issued document has a log row')
  {
    const { data: issuedDocs } = await supabase
      .from('documents').select('id, doc_no').eq('brand_code', BRAND).not('doc_no', 'is', null)
    const { data: logs } = await supabase
      .from('document_logs').select('document_id, changed_by')
      .in('document_id', (issuedDocs || []).map((d: any) => d.id))
    const withLog = new Set((logs || []).filter((l: any) => l.changed_by).map((l: any) => l.document_id))
    const missing = (issuedDocs || []).filter((d: any) => !withLog.has(d.id))
    assert(missing.length === 0, 'ทุกใบที่ออกเลขแล้วมี log + changed_by', missing.map((d: any) => d.doc_no).join(','))
  }
}

main()
  .catch(err => {
    failures++
    console.error('\nUNEXPECTED ERROR:', err instanceof Error ? err.message : err)
  })
  .finally(async () => {
    const { error } = await supabase.rpc('purge_test_documents', { p_brand: BRAND })
    if (error) console.error(`cleanup failed: ${error.message}`)
    else console.log('\ncleanup: purged brand ZZT')

    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
    process.exit(failures === 0 ? 0 : 1)
  })
