// Runnable self-check for purchasing-logic.ts (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/jobs/purchasing/purchasing-logic.check.ts"
// ข้อมูลสังเคราะห์ทั้งหมด · บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "purchasing-logic: ผ่านทั้งหมด"
import assert from 'node:assert/strict'
import { CLAIM_STATUSES, CLAIM_TYPES } from '@/app/(authenticated)/costs/types'
import {
    addDays,
    applyOptimistic,
    bangkokDate,
    boardColumns,
    budgetOf,
    canDelete,
    canSeeClaim,
    claimAmountOf,
    claimMismatch,
    claimsOf,
    cleanSearchQuery,
    COORDINATOR_DEPARTMENT,
    copyText,
    countdownLabel,
    effectiveDue,
    filterLists,
    formatMoney,
    imageFilesError,
    isLinkableClaim,
    isListFinished,
    isPurchaseKind,
    isPurchaseStatus,
    isTempId,
    isUuid,
    isValidDate,
    isVoidClaimStatus,
    KIND_LABELS,
    LINKABLE_CLAIM_TYPES,
    listDate,
    listsSummary,
    listTitle,
    listUrgency,
    MAX_ITEMS_PER_LINK,
    moneyDiffers,
    moneyOf,
    nextStatus,
    parseMoney,
    personName,
    progressOf,
    PURCHASE_ITEM_COLUMNS,
    PURCHASE_STATUSES,
    purchaseAlerts,
    sortLists,
    splitLines,
    STATUS_LABELS,
    statusTone,
    TEMP_ID_PREFIX,
    toPurchaseClaim,
    toPurchaseClaimOption,
    toPurchaseItem,
    toPurchaseTemplate,
    URGENCY_LABELS,
    urgencyOf,
    urgencyTone,
    validateItemInput,
    validateListInput,
    validateTemplateInput,
    type ListFilter,
    type OptimisticAction,
    type PurchaseItem,
    type PurchaseLead,
    type PurchaseList,
    type PurchaseStatus,
    type Urgency,
    type Validated,
    type Viewer,
} from './purchasing-logic'

const TODAY = '2026-09-29'
const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const CREATOR = '33333333-3333-4333-8333-333333333333'
const OWNER = '44444444-4444-4444-8444-444444444444'
const BUYER = '55555555-5555-4555-8555-555555555555'

let seq = 0
function mkItem(overrides: Partial<PurchaseItem> = {}): PurchaseItem {
    seq++
    return {
        id: `item-${seq}`,
        list_id: 'list-1',
        title: `รายการ ${seq}`,
        kind: 'buy',
        status: 'planning',
        quantity: null,
        est_price: null,
        actual_price: null,
        vendor: null,
        link_url: null,
        tracking_no: null,
        assignee_id: null,
        due_date: null,
        note: null,
        images: [],
        expense_claim_id: null,
        sort_order: seq,
        status_changed_at: null,
        status_changed_by: null,
        done_at: null,
        created_by: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        ...overrides,
    }
}

function mkLead(overrides: Partial<PurchaseLead> = {}): PurchaseLead {
    return {
        id: 'lead-1',
        customer_name: 'ลูกค้า',
        event_location: null,
        event_date: null,
        event_end_date: null,
        status: 'accepted',
        ...overrides,
    }
}

function mkList(overrides: Partial<PurchaseList> = {}): PurchaseList {
    return {
        id: 'list-1',
        crm_lead_id: null,
        title: 'เช็กลิสต์',
        note: null,
        budget: null,
        due_date: null,
        owner_id: null,
        created_by: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        lead: null,
        items: [],
        ...overrides,
    }
}

const ids = (lists: PurchaseList[]) => lists.map(l => l.id)

/** ผลตรวจต้องผ่าน — คืนค่าที่ตรวจแล้ว */
function valid<T>(r: Validated<T>): T {
    assert.ok(r.ok, `ควรผ่าน แต่ได้: ${r.ok ? '' : r.error}`)
    return r.value
}

/** ผลตรวจต้องไม่ผ่าน — คืนข้อความ error */
function invalid<T>(r: Validated<T>): string {
    assert.equal(r.ok, false, 'ควรไม่ผ่าน')
    return r.ok ? '' : r.error
}

// --- สถานะ / ประเภท -----------------------------------------------------------
assert.equal(nextStatus('planning'), 'purchasing')
assert.equal(nextStatus('purchasing'), 'awaiting_delivery')
assert.equal(nextStatus('awaiting_delivery'), 'done')
assert.equal(nextStatus('done'), null)

assert.deepEqual([...PURCHASE_STATUSES], ['planning', 'purchasing', 'awaiting_delivery', 'done'])
assert.deepEqual(STATUS_LABELS, { planning: 'วางแผน', purchasing: 'กำลังจัดซื้อ', awaiting_delivery: 'รอจัดส่ง', done: 'เสร็จสิ้น' })
assert.deepEqual(KIND_LABELS, { buy: 'ซื้อ', order: 'สั่ง', other: 'อื่นๆ' })

for (const s of PURCHASE_STATUSES) assert.equal(isPurchaseStatus(s), true)
for (const bad of ['cancelled', 'DONE', 'Done', '', ' done', null, undefined, 3, {}]) assert.equal(isPurchaseStatus(bad), false)
for (const k of ['buy', 'order', 'other']) assert.equal(isPurchaseKind(k), true)
for (const bad of ['rent', 'BUY', '', null, undefined, 1]) assert.equal(isPurchaseKind(bad), false)

// --- วันที่ -----------------------------------------------------------------
assert.equal(isValidDate('2026-02-28'), true)
assert.equal(isValidDate('2024-02-29'), true) // ปีอธิกสุรทิน
assert.equal(isValidDate('2026-02-29'), false)
assert.equal(isValidDate('2026-02-30'), false)
assert.equal(isValidDate('2026-13-01'), false)
assert.equal(isValidDate('2026-9-1'), false)
assert.equal(isValidDate('2026-09-01T00:00:00Z'), false)
assert.equal(isValidDate(null), false)
assert.equal(addDays('2026-09-29', -7), '2026-09-22')
assert.equal(addDays('2026-12-30', 3), '2027-01-02')
assert.equal(addDays('2026-03-01', -1), '2026-02-28')
// เวลาไทย: 28 ก.ย. 17:30 UTC = 29 ก.ย. 00:30 ที่ไทย · 16:59 UTC ยังเป็น 28 ก.ย.
assert.equal(bangkokDate(Date.UTC(2026, 8, 28, 17, 30)), '2026-09-29')
assert.equal(bangkokDate(Date.UTC(2026, 8, 28, 16, 59)), '2026-09-28')

// --- ชื่อ / วันอ้างอิง / กำหนดของรายการ ----------------------------------------------
assert.equal(listTitle(mkList({ title: 'ชื่อที่เก็บไว้', lead: mkLead({ customer_name: 'ชื่อใหม่ใน CRM' }) })), 'ชื่อใหม่ใน CRM')
assert.equal(listTitle(mkList({ title: 'ชื่อที่เก็บไว้', lead: mkLead({ customer_name: '  ' }) })), 'ชื่อที่เก็บไว้')
assert.equal(listTitle(mkList({ title: 'ของส่วนกลาง' })), 'ของส่วนกลาง')

const linked = mkList({ lead: mkLead({ event_date: '2026-10-10' }), due_date: '2026-10-05' })
assert.equal(listDate(linked), '2026-10-10') // วันงานจาก CRM มาก่อนกำหนดของเช็กลิสต์
assert.equal(listDate(mkList({ lead: mkLead({ event_date: null }), due_date: '2026-10-05' })), '2026-10-05')
assert.equal(listDate(mkList({ due_date: '2026-10-05' })), '2026-10-05')
assert.equal(listDate(mkList()), null)

// ลำดับ: กำหนดของรายการ > วันงาน CRM > กำหนดของเช็กลิสต์ > ไม่มี
assert.equal(effectiveDue(mkItem({ due_date: '2026-10-01' }), linked), '2026-10-01')
assert.equal(effectiveDue(mkItem(), linked), '2026-10-10')
assert.equal(effectiveDue(mkItem(), mkList({ due_date: '2026-10-05' })), '2026-10-05')
assert.equal(effectiveDue(mkItem(), mkList({ lead: mkLead({ event_date: null }), due_date: '2026-10-05' })), '2026-10-05')
assert.equal(effectiveDue(mkItem(), mkList()), null)

// --- ความด่วน: ทุกขอบ --------------------------------------------------------------
const urgency = (due: string | null, status: PurchaseStatus = 'planning') =>
    urgencyOf(mkItem({ due_date: due, status }), mkList(), TODAY)
assert.equal(urgency('2026-09-28'), 'overdue') // เมื่อวาน
assert.equal(urgency('2026-09-29'), 'urgent') // วันนี้
assert.equal(urgency('2026-10-02'), 'urgent') // +3
assert.equal(urgency('2026-10-03'), 'soon') // +4
assert.equal(urgency('2026-10-06'), 'soon') // +7
assert.equal(urgency('2026-10-07'), null) // +8
assert.equal(urgency(null), null) // ไม่มีกำหนด
assert.equal(urgency('2026-09-01', 'done'), null) // เสร็จแล้วไม่มีความด่วนแม้เลยกำหนด
assert.equal(urgency('2026-09-28', 'awaiting_delivery'), 'overdue')
// ข้ามปี: 30 ธ.ค. → 2 ม.ค. = +3
assert.equal(urgencyOf(mkItem({ due_date: '2027-01-02' }), mkList(), '2026-12-30'), 'urgent')
// ไม่มีกำหนดของตัวเอง → ใช้วันงานของเช็กลิสต์
assert.equal(urgencyOf(mkItem(), mkList({ lead: mkLead({ event_date: '2026-10-01' }) }), TODAY), 'urgent')

assert.equal(countdownLabel('2026-09-27', TODAY), 'เลยมา 2 วัน')
assert.equal(countdownLabel('2026-09-28', TODAY), 'เลยมา 1 วัน')
assert.equal(countdownLabel('2026-09-29', TODAY), 'วันนี้')
assert.equal(countdownLabel('2026-09-30', TODAY), 'พรุ่งนี้')
assert.equal(countdownLabel('2026-10-02', TODAY), 'อีก 3 วัน')

assert.equal(
    listUrgency(mkList({ items: [mkItem({ due_date: '2026-10-05' }), mkItem({ due_date: '2026-09-01' }), mkItem({ due_date: '2026-09-30' })] }), TODAY),
    'overdue'
)
assert.equal(listUrgency(mkList({ items: [mkItem({ due_date: '2026-10-05' }), mkItem({ due_date: '2026-09-30' })] }), TODAY), 'urgent')
assert.equal(listUrgency(mkList({ items: [mkItem({ due_date: '2026-09-01', status: 'done' })] }), TODAY), null)
assert.equal(listUrgency(mkList(), TODAY), null)

// --- เช็กลิสต์เสร็จ / ความคืบหน้า / เงิน ----------------------------------------------
assert.equal(isListFinished(mkList()), false) // ใบว่าง = ยังไม่เสร็จ
assert.equal(isListFinished(mkList({ items: [mkItem({ status: 'done' }), mkItem({ status: 'done' })] })), true)
assert.equal(isListFinished(mkList({ items: [mkItem({ status: 'done' }), mkItem({ status: 'awaiting_delivery' })] })), false)

const moneyItems = [
    mkItem({ status: 'done', est_price: 100, actual_price: 120 }),
    mkItem({ status: 'done', est_price: 50.5, actual_price: null }), // เสร็จแล้วแต่ยังไม่ใส่ยอดจ่ายจริง
    mkItem({ status: 'purchasing', est_price: null, actual_price: 30 }),
    mkItem({ status: 'planning', est_price: null, actual_price: null }), // ยังไม่เสร็จ — ไม่นับเป็นขาดยอด
]
assert.deepEqual(progressOf(moneyItems), {
    total: 4,
    done: 2,
    percent: 50,
    byStatus: { planning: 1, purchasing: 1, awaiting_delivery: 0, done: 2 },
})
assert.deepEqual(moneyOf(moneyItems), { est: 150.5, actual: 150, missingActual: 1 })
assert.deepEqual(progressOf([]), { total: 0, done: 0, percent: 0, byStatus: { planning: 0, purchasing: 0, awaiting_delivery: 0, done: 0 } })
assert.deepEqual(moneyOf([]), { est: 0, actual: 0, missingActual: 0 })
// ปัดลง: 2 ใน 3 = 66% · 199 ใน 200 ยังไม่ขึ้น 100%
assert.equal(progressOf([mkItem({ status: 'done' }), mkItem({ status: 'done' }), mkItem()]).percent, 66)
assert.equal(progressOf([...Array.from({ length: 199 }, () => mkItem({ status: 'done' })), mkItem()]).percent, 99)
// ทศนิยมสตางค์ไม่เพี้ยน
assert.equal(moneyOf([mkItem({ est_price: 0.1 }), mkItem({ est_price: 0.2 })]).est, 0.3)

// --- เรียงเช็กลิสต์ -------------------------------------------------------------------
const sortInput = [
    mkList({ id: 'finished', due_date: '2026-09-30', items: [mkItem({ status: 'done' })] }),
    mkList({ id: 'late', due_date: '2026-10-20', items: [mkItem()] }),
    mkList({ id: 'nodate-old', created_at: '2026-09-01T00:00:00Z' }),
    mkList({ id: 'early', lead: mkLead({ event_date: '2026-10-01' }) }), // ใบว่าง = ยังไม่เสร็จ
    mkList({ id: 'nodate-new', created_at: '2026-09-20T00:00:00Z' }),
    mkList({ id: 'overdue', due_date: '2026-09-20', items: [mkItem()] }),
    mkList({ id: 'late-newer', due_date: '2026-10-20', created_at: '2026-09-15T00:00:00Z', items: [mkItem()] }),
]
assert.deepEqual(ids(sortLists(sortInput)), ['overdue', 'early', 'late-newer', 'late', 'nodate-new', 'nodate-old', 'finished'])
assert.equal(sortInput[0].id, 'finished', 'sortLists ต้องไม่แก้ array เดิม')

// --- ตัวกรอง ------------------------------------------------------------------------
const me: Viewer = { userId: ME, isAdmin: false, department: 'สตาฟ' }
const i1 = mkItem({ list_id: 'L1', title: 'ป้ายไวนิล', vendor: 'ร้านป้าย', assignee_id: ME })
const i2 = mkItem({ list_id: 'L1', title: 'กระดาษโฟโต้', status: 'done' })
const i3 = mkItem({ list_id: 'L1', title: 'ขาตั้ง', vendor: 'Lazada', status: 'purchasing', assignee_id: OTHER })
const i4 = mkItem({ list_id: 'L2', title: 'หมึกพิมพ์', status: 'awaiting_delivery' })
const i5 = mkItem({ list_id: 'D', title: 'ของเสร็จแล้ว', status: 'done', assignee_id: ME })
const L1 = mkList({ id: 'L1', title: 'งานสยาม', lead: mkLead({ customer_name: 'บริษัท สยามพาราไดซ์', event_location: 'พารากอน ฮอลล์' }), items: [i1, i2, i3] })
const L2 = mkList({ id: 'L2', title: 'ของส่วนกลาง', items: [i4] })
const EMPTY = mkList({ id: 'E', title: 'ใบว่าง' })
const DONE = mkList({ id: 'D', title: 'เสร็จครบแล้ว', items: [i5] })
const everything = [L1, L2, EMPTY, DONE]
const noFilter: ListFilter = { status: 'all', mine: false, query: '', showFinished: true }
const f = (patch: Partial<ListFilter>, viewer: Viewer = me) => filterLists(everything, { ...noFilter, ...patch }, viewer)
const itemIds = (lists: PurchaseList[]) => Object.fromEntries(lists.map(l => [l.id, l.items.map(i => i.id)]))

// ไม่มีตัวกรอง = ทุกใบ รวมใบว่าง (รายการครบตามเดิม)
assert.deepEqual(ids(f({})), ['L1', 'L2', 'E', 'D'])
assert.equal(f({})[0], L1)
assert.deepEqual(ids(f({ query: '   ' })), ['L1', 'L2', 'E', 'D']) // คำค้นช่องว่างล้วน = ไม่มีตัวกรอง
assert.deepEqual(ids(f({ showFinished: false })), ['L1', 'L2', 'E']) // ซ่อนใบที่เสร็จครบ
// สถานะ — ทำที่ระดับรายการ ใบที่ไม่เหลือรายการถูกซ่อน (ใบว่างด้วย)
assert.deepEqual(itemIds(f({ status: 'done' })), { L1: [i2.id], D: [i5.id] })
assert.deepEqual(itemIds(f({ status: 'done', showFinished: false })), { L1: [i2.id] })
assert.deepEqual(itemIds(f({ status: 'awaiting_delivery' })), { L2: [i4.id] })
// ของฉัน = ผู้รับผิดชอบรายการ
assert.deepEqual(itemIds(f({ mine: true })), { L1: [i1.id], D: [i5.id] })
assert.deepEqual(f({ mine: true }, { userId: null, isAdmin: true, department: null }), [])
// คำค้น: สถานที่ / ชื่อลูกค้าจาก CRM / ชื่อที่เก็บไว้ → ทุกรายการในใบ
assert.deepEqual(itemIds(f({ query: 'พารากอน' })), { L1: [i1.id, i2.id, i3.id] })
assert.deepEqual(itemIds(f({ query: 'สยามพาราไดซ์' })), { L1: [i1.id, i2.id, i3.id] })
assert.deepEqual(itemIds(f({ query: 'งานสยาม' })), { L1: [i1.id, i2.id, i3.id] })
// คำค้น: ชื่อรายการ / ร้าน (ไม่สนตัวพิมพ์เล็กใหญ่)
assert.deepEqual(itemIds(f({ query: 'หมึก' })), { L2: [i4.id] })
assert.deepEqual(itemIds(f({ query: 'LAZADA' })), { L1: [i3.id] })
// ใบว่างที่ชื่อตรงคำค้น ยังถูกซ่อน — ไม่มีรายการเหลือ
assert.deepEqual(f({ query: 'ใบว่าง' }), [])
// ตัวกรองหลายตัวพร้อมกัน
assert.deepEqual(itemIds(f({ query: 'พารากอน', status: 'purchasing' })), { L1: [i3.id] })
assert.deepEqual(itemIds(f({ query: 'พารากอน', mine: true })), { L1: [i1.id] })
assert.equal(L1.items.length, 3, 'filterLists ต้องไม่แก้เช็กลิสต์เดิม')

// --- บอร์ด ------------------------------------------------------------------------
const a1 = mkItem({ title: 'a1', due_date: '2026-10-10' }) // +11 ไม่ด่วน
const a2 = mkItem({ title: 'a2' }) // ใช้กำหนดของใบ 20 ต.ค. — ไม่ด่วน
const a3 = mkItem({ title: 'a3', due_date: '2026-09-25' }) // เลยกำหนด
const a4 = mkItem({ title: 'a4', status: 'done', due_date: '2026-09-01' })
const b1 = mkItem({ title: 'b1', due_date: '2026-10-01' }) // +2 ด่วน
const b2 = mkItem({ title: 'b2', due_date: '2026-10-05' }) // +6 ใกล้ถึง
const b3 = mkItem({ title: 'b3' }) // ไม่มีกำหนด
const b4 = mkItem({ title: 'b4', status: 'purchasing', due_date: '2026-10-02' })
const boardA = mkList({ id: 'A', title: 'ใบ A', due_date: '2026-10-20', items: [a1, a2, a3, a4] })
const boardB = mkList({ id: 'B', title: 'ใบ B', items: [b1, b2, b3, b4] })
const board = boardColumns([boardA, boardB], TODAY)
assert.deepEqual(board.planning.map(c => c.item.title), ['a3', 'b1', 'b2', 'a1', 'a2', 'b3'])
assert.deepEqual(board.planning.map(c => c.urgency), ['overdue', 'urgent', 'soon', null, null, null])
assert.deepEqual(board.planning.map(c => c.listId), ['A', 'B', 'B', 'A', 'A', 'B'])
assert.deepEqual(board.planning.map(c => c.listTitle), ['ใบ A', 'ใบ B', 'ใบ B', 'ใบ A', 'ใบ A', 'ใบ B'])
assert.equal(board.planning[4].due, '2026-10-20')
assert.deepEqual(board.purchasing.map(c => [c.item.title, c.urgency]), [['b4', 'urgent']])
assert.deepEqual(board.awaiting_delivery, [])
assert.deepEqual(board.done.map(c => [c.item.title, c.urgency]), [['a4', null]])

// --- ข้อความคัดลอก ------------------------------------------------------------------
const copyList = mkList({
    title: 'ชื่อเก่า',
    lead: mkLead({ customer_name: 'คุณเอ', event_location: 'ห้องประชุมใหญ่', event_date: '2026-10-02' }),
    items: [
        mkItem({ title: 'ป้าย', quantity: '2 ชิ้น', status: 'done', assignee_id: ME }),
        mkItem({ title: 'ขาตั้ง', status: 'purchasing', assignee_id: OTHER }), // ไม่มีชื่อใน names → ไม่แสดง
        mkItem({ title: 'เทปกาว', status: 'awaiting_delivery', assignee_id: ME }),
    ],
})
const copied = copyText(copyList, TODAY, { [ME]: 'ต้น' }).split('\n')
assert.equal(copied[0], '🛒 คุณเอ')
assert.ok(copied[1].startsWith('📅 วันงาน ') && copied[1].includes('2 ต.ค. 69'), copied[1])
assert.ok(copied[1].includes('(อีก 3 วัน)') && copied[1].endsWith(' · 📍 ห้องประชุมใหญ่'), copied[1])
assert.equal(copied[2], 'ความคืบหน้า 1/3 รายการ (33%)')
assert.equal(copied[3], '')
assert.equal(copied[4], '✅ 1. ป้าย (2 ชิ้น) — เสร็จสิ้น · ต้น')
assert.equal(copied[5], '⬜ 2. ขาตั้ง — กำลังจัดซื้อ')
assert.equal(copied[6], '⬜ 3. เทปกาว — รอจัดส่ง · ต้น')
assert.equal(copied.length, 7)
// เช็กลิสต์ทั่วไป ไม่มีวันไม่มีสถานที่ → ไม่มีบรรทัดวัน/สถานที่
const plain = copyText(mkList({ title: 'ของส่วนกลาง', items: [mkItem({ title: 'ถ่าน' })] }), TODAY, {}).split('\n')
assert.deepEqual(plain, ['🛒 ของส่วนกลาง', 'ความคืบหน้า 0/1 รายการ (0%)', '', '⬜ 1. ถ่าน — วางแผน'])
// เช็กลิสต์ทั่วไปมีกำหนด → "กำหนด …"
const withDue = copyText(mkList({ title: 'ของ', due_date: '2026-09-27' }), TODAY, {}).split('\n')
assert.ok(withDue[1].startsWith('📅 กำหนด ') && withDue[1].endsWith('(เลยมา 2 วัน)'), withDue[1])
assert.equal(withDue[withDue.length - 1], 'ยังไม่มีรายการ')

// --- วางหลายบรรทัด / คำค้น ----------------------------------------------------------
assert.deepEqual(splitLines('  เทปกาว \r\n\n ป้ายไวนิล\n   \nขาตั้ง  \rถ่าน'), ['เทปกาว', 'ป้ายไวนิล', 'ขาตั้ง', 'ถ่าน'])
assert.deepEqual(splitLines(''), [])
assert.deepEqual(splitLines('\n \n'), [])

assert.equal(cleanSearchQuery('a,b)%'), 'ab')
assert.equal(cleanSearchQuery(' x,(y)%*\\"z '), 'xyz')
assert.equal(cleanSearchQuery('ก'.repeat(100)), 'ก'.repeat(80))
assert.equal(cleanSearchQuery(null), '')
assert.equal(cleanSearchQuery(42), '')
assert.equal(cleanSearchQuery('สยาม พารากอน'), 'สยาม พารากอน')

// --- ตรวจรายการ: ขีดจำกัดทุกช่องที่ขอบ ----------------------------------------------------
const item = (patch: Record<string, unknown>) => validateItemInput({ title: 'ของ', ...patch })

assert.deepEqual(valid(validateItemInput({ title: '  ป้ายไวนิล  ' })), {
    title: 'ป้ายไวนิล',
    kind: 'buy',
    quantity: null,
    est_price: null,
    actual_price: null,
    vendor: null,
    link_url: null,
    tracking_no: null,
    assignee_id: null,
    due_date: null,
    note: null,
})
// ชื่อรายการ 1–200
assert.equal(valid(item({ title: 'ก'.repeat(200) })).title.length, 200)
assert.match(invalid(item({ title: 'ก'.repeat(201) })), /200/)
assert.equal(valid(item({ title: 'a' })).title, 'a')
assert.match(invalid(item({ title: '' })), /กรุณาใส่ชื่อรายการ/)
assert.match(invalid(item({ title: '   ' })), /กรุณาใส่ชื่อรายการ/)
assert.match(invalid(validateItemInput({})), /กรุณาใส่ชื่อรายการ/)
assert.match(invalid(item({ title: 5 })), /กรุณาใส่ชื่อรายการ/)
// นับเป็นตัวอักษรแบบ Postgres char_length: อีโมจิ 200 ตัว (400 หน่วย UTF-16) ยังผ่าน
assert.ok(valid(item({ title: '🛒'.repeat(200) })))
assert.match(invalid(item({ title: '🛒'.repeat(201) })), /200/)
// จำนวน ≤ 60
assert.equal(valid(item({ quantity: 'x'.repeat(60) })).quantity, 'x'.repeat(60))
assert.match(invalid(item({ quantity: 'x'.repeat(61) })), /จำนวน.*60/)
assert.equal(valid(item({ quantity: '   ' })).quantity, null)
// ร้าน ≤ 120
assert.ok(valid(item({ vendor: 'x'.repeat(120) })))
assert.match(invalid(item({ vendor: 'x'.repeat(121) })), /ร้าน.*120/)
// ลิงก์: ขึ้นต้น http:// หรือ https:// และ ≤ 500
const link500 = 'https://shop.example/' + 'a'.repeat(500 - 'https://shop.example/'.length)
assert.equal(link500.length, 500)
assert.equal(valid(item({ link_url: link500 })).link_url, link500)
assert.match(invalid(item({ link_url: link500 + 'a' })), /500/)
assert.equal(valid(item({ link_url: 'http://a.co' })).link_url, 'http://a.co')
assert.match(invalid(item({ link_url: 'ftp://a.co' })), /http:\/\/ หรือ https:\/\//)
assert.match(invalid(item({ link_url: 'www.shopee.co.th/x' })), /http:\/\/ หรือ https:\/\//)
assert.match(invalid(item({ link_url: 'javascript:alert(1)' })), /http:\/\/ หรือ https:\/\//)
assert.equal(valid(item({ link_url: '' })).link_url, null)
// เลขพัสดุ ≤ 80 · หมายเหตุ ≤ 1000
assert.ok(valid(item({ tracking_no: 'T'.repeat(80) })))
assert.match(invalid(item({ tracking_no: 'T'.repeat(81) })), /พัสดุ.*80/)
assert.ok(valid(item({ note: 'n'.repeat(1000) })))
assert.match(invalid(item({ note: 'n'.repeat(1001) })), /หมายเหตุ.*1,000/)
// ราคา 0–99,999,999
assert.equal(valid(item({ est_price: 0 })).est_price, 0)
assert.equal(valid(item({ est_price: 99_999_999 })).est_price, 99_999_999)
assert.match(invalid(item({ est_price: -1 })), /งบ.*0 ถึง 99,999,999/)
assert.match(invalid(item({ est_price: 100_000_000 })), /งบ.*0 ถึง 99,999,999/)
assert.match(invalid(item({ actual_price: -1 })), /ยอดจ่ายจริง/)
assert.match(invalid(item({ actual_price: 100_000_000 })), /ยอดจ่ายจริง/)
assert.equal(valid(item({ actual_price: '1,250.50' })).actual_price, 1250.5)
assert.match(invalid(item({ est_price: 'สองร้อย' })), /งบต้องเป็นตัวเลข/)
assert.equal(valid(item({ est_price: '' })).est_price, null)
assert.equal(valid(item({ est_price: null })).est_price, null)
// วันที่ต้องมีอยู่จริง
assert.equal(valid(item({ due_date: '2026-02-28' })).due_date, '2026-02-28')
assert.match(invalid(item({ due_date: '2026-02-30' })), /ไม่ถูกต้อง/)
assert.match(invalid(item({ due_date: '30/09/2026' })), /ไม่ถูกต้อง/)
assert.equal(valid(item({ due_date: '' })).due_date, null)
// ประเภท / ผู้รับผิดชอบ
assert.equal(valid(item({ kind: 'order' })).kind, 'order')
assert.match(invalid(item({ kind: 'rent' })), /ประเภท/)
assert.equal(valid(item({ assignee_id: ME.toUpperCase() })).assignee_id, ME)
assert.match(invalid(item({ assignee_id: 'abc' })), /ผู้รับผิดชอบ/)
assert.equal(valid(item({ assignee_id: '' })).assignee_id, null)
// ไม่ใช่วัตถุ
for (const bad of [null, undefined, 'ของ', 5, []]) assert.match(invalid(validateItemInput(bad)), /ไม่ถูกต้อง/)

// patch: ตรวจและคืนเฉพาะช่องที่ส่งมา · ช่องที่ไม่รู้จักถูกทิ้ง
assert.deepEqual(valid(validateItemInput({}, 'patch')), {})
assert.deepEqual(valid(validateItemInput({ vendor: ' ร้านใหม่ ', status: 'done', id: 'x', list_id: 'y' }, 'patch')), { vendor: 'ร้านใหม่' })
assert.deepEqual(valid(validateItemInput({ vendor: null, due_date: null }, 'patch')), { vendor: null, due_date: null })
assert.match(invalid(validateItemInput({ title: '' }, 'patch')), /กรุณาใส่ชื่อรายการ/)
assert.match(invalid(validateItemInput({ est_price: -1 }, 'patch')), /งบ/)
assert.match(invalid(validateItemInput(null, 'patch')), /ไม่ถูกต้อง/)

assert.equal(parseMoney(' 1,234.5 '), 1234.5)
assert.equal(parseMoney(12), 12)
assert.equal(parseMoney('.5'), 0.5)
assert.equal(parseMoney(''), null)
assert.equal(parseMoney(null), null)
assert.ok(Number.isNaN(parseMoney('12a')))
assert.ok(Number.isNaN(parseMoney(Infinity)))
assert.ok(Number.isNaN(parseMoney({})))

// --- ตรวจเช็กลิสต์ ------------------------------------------------------------------
assert.deepEqual(valid(validateListInput({ title: ' ของส่วนกลาง ' })), { title: 'ของส่วนกลาง', note: null, budget: null, due_date: null, owner_id: null })
assert.ok(valid(validateListInput({ title: 'x'.repeat(120) })))
assert.match(invalid(validateListInput({ title: 'x'.repeat(121) })), /ชื่อเช็กลิสต์.*120/)
assert.match(invalid(validateListInput({})), /กรุณาใส่ชื่อเช็กลิสต์/)
assert.equal(valid(validateListInput({ title: 'x', budget: '99,999,999' })).budget, 99_999_999)
assert.match(invalid(validateListInput({ title: 'x', budget: -1 })), /งบ/)
assert.match(invalid(validateListInput({ title: 'x', budget: 100_000_000 })), /งบ/)
assert.match(invalid(validateListInput({ title: 'x', due_date: '2026-02-30' })), /กำหนดวันไม่ถูกต้อง/)
assert.match(invalid(validateListInput({ title: 'x', owner_id: 'someone' })), /ผู้รับผิดชอบเช็กลิสต์/)
assert.ok(valid(validateListInput({ title: 'x', note: 'n'.repeat(1000) })))
assert.match(invalid(validateListInput({ title: 'x', note: 'n'.repeat(1001) })), /หมายเหตุ/)
assert.deepEqual(valid(validateListInput({ owner_id: OWNER }, 'patch')), { owner_id: OWNER })
assert.deepEqual(valid(validateListInput({ crm_lead_id: 'x', created_by: 'y' }, 'patch')), {})

// --- ตรวจชุดสำเร็จรูป ---------------------------------------------------------------
const tplItems = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `ของ ${i + 1}` }))
const tpl = valid(validateTemplateInput({ name: ' ชุดงานแต่ง ', items: [{ title: 'กรอบรูป', kind: 'order', est_price: '1,200', assignee_id: ME, actual_price: 5 }] }))
assert.equal(tpl.name, 'ชุดงานแต่ง')
// เก็บเฉพาะช่องของชุดสำเร็จรูป (ไม่มีผู้รับผิดชอบ/ยอดจ่ายจริง)
assert.deepEqual(tpl.items, [{ title: 'กรอบรูป', kind: 'order', quantity: null, est_price: 1200, vendor: null, link_url: null, note: null }])
assert.ok(valid(validateTemplateInput({ name: 'n'.repeat(80), items: tplItems(1) })))
assert.match(invalid(validateTemplateInput({ name: 'n'.repeat(81), items: tplItems(1) })), /ชื่อชุดสำเร็จรูป.*80/)
assert.match(invalid(validateTemplateInput({ name: '  ', items: tplItems(1) })), /กรุณาใส่ชื่อชุดสำเร็จรูป/)
assert.match(invalid(validateTemplateInput({ name: 'ชุด', items: [] })), /อย่างน้อย 1 รายการ/)
assert.match(invalid(validateTemplateInput({ name: 'ชุด', items: 'ของ' })), /อย่างน้อย 1 รายการ/)
assert.equal(valid(validateTemplateInput({ name: 'ชุด', items: tplItems(50) })).items.length, 50)
assert.match(invalid(validateTemplateInput({ name: 'ชุด', items: tplItems(51) })), /ไม่เกิน 50 รายการ/)
assert.match(invalid(validateTemplateInput({ name: 'ชุด', items: [{ title: 'ok' }, { title: 'x'.repeat(201) }] })), /^รายการที่ 2: .*200/)
assert.match(invalid(validateTemplateInput(null)), /ไม่ถูกต้อง/)

// --- รูปแนบ -----------------------------------------------------------------------
const MB = 1024 * 1024
assert.equal(imageFilesError([{ type: 'image/jpeg', size: MB }], 3), null)
assert.equal(imageFilesError([{ type: 'image/png', size: 5 * MB }, { type: 'image/webp', size: 1 }], 0), null)
assert.match(imageFilesError([{ type: 'image/jpeg', size: MB }], 4)!, /สูงสุด 4 รูป/)
assert.match(imageFilesError([{ type: 'image/jpeg', size: MB }, { type: 'image/jpeg', size: MB }], 3)!, /สูงสุด 4 รูป/)
assert.match(imageFilesError([{ type: 'text/plain', size: 10 }], 0)!, /JPG, PNG หรือ WEBP/)
assert.match(imageFilesError([{ type: 'image/gif', size: 10 }], 0)!, /JPG, PNG หรือ WEBP/)
assert.match(imageFilesError([{ type: 'image/jpeg', size: 5 * MB + 1 }], 0)!, /5MB/)
assert.match(imageFilesError([{ type: 'image/jpeg', size: 0 }], 0)!, /ว่างเปล่า/)
assert.match(imageFilesError([], 0)!, /เลือกรูป/)

// --- id ---------------------------------------------------------------------------
assert.equal(isUuid(ME), true)
assert.equal(isUuid(ME.toUpperCase()), true)
for (const bad of ['', 'abc', `${ME}x`, null, 1, {}]) assert.equal(isUuid(bad), false)

// --- สิทธิ์ลบ -----------------------------------------------------------------------
const target = { createdBy: CREATOR, ownerId: OWNER }
const staff = (userId: string | null, department: string | null = 'สตาฟ'): Viewer => ({ userId, isAdmin: false, department })
assert.equal(canDelete(staff(CREATOR), target), true) // คนสร้าง
assert.equal(canDelete(staff(OWNER), target), true) // ผู้รับผิดชอบเช็กลิสต์
assert.equal(canDelete({ userId: OTHER, isAdmin: true, department: null }, target), true) // แอดมิน
assert.equal(canDelete(staff(OTHER, COORDINATOR_DEPARTMENT), target), true) // ฝ่ายประสานงาน
assert.equal(canDelete(staff(OTHER), target), false) // คนอื่น
assert.equal(canDelete(staff(OTHER, null), { createdBy: CREATOR, ownerId: null }), false)
// ไม่ได้ล็อกอิน ต้องไม่ถูกนับเป็นคนสร้างของที่ created_by ว่าง
assert.equal(canDelete(staff(null, null), { createdBy: null, ownerId: null }), false)

// --- แผงเตือนหน้าแรก --------------------------------------------------------------------
const alertList = mkList({
    id: 'AL',
    title: 'งานด่วน',
    created_by: CREATOR,
    owner_id: OWNER,
    lead: mkLead({ customer_name: 'บริษัท ด่วนมาก', event_location: 'สนามกีฬา', event_date: '2026-10-01' }),
    items: [
        mkItem({ status: 'planning', assignee_id: BUYER }), // ค้าง ด่วน (+2)
        mkItem({ status: 'done', assignee_id: ME }), // เสร็จแล้ว
    ],
})
const seesAlert = (viewer: Viewer) => purchaseAlerts([alertList], viewer, TODAY).length === 1
assert.equal(seesAlert({ userId: OTHER, isAdmin: true, department: null }), true) // แอดมิน
assert.equal(seesAlert(staff(OTHER, COORDINATOR_DEPARTMENT)), true) // ฝ่ายประสานงาน
assert.equal(seesAlert(staff(CREATOR)), true) // คนสร้างเช็กลิสต์
assert.equal(seesAlert(staff(OWNER)), true) // ผู้รับผิดชอบเช็กลิสต์
assert.equal(seesAlert(staff(BUYER)), true) // ผู้รับผิดชอบรายการที่ยังค้าง
assert.equal(seesAlert(staff(ME)), false) // รับผิดชอบเฉพาะรายการที่เสร็จแล้ว
assert.equal(seesAlert(staff(OTHER)), false) // ไม่เกี่ยวข้อง
assert.equal(seesAlert(staff(null, null)), false)

assert.deepEqual(purchaseAlerts([alertList], staff(OWNER), TODAY), [{
    listId: 'AL',
    title: 'บริษัท ด่วนมาก',
    subtitle: 'สนามกีฬา',
    date: '2026-10-01',
    severity: 'urgent',
    countdown: 'อีก 2 วัน',
    outstanding: 1,
    byStatus: { planning: 1, purchasing: 0, awaiting_delivery: 0, done: 1 },
}])

const admin: Viewer = { userId: ME, isAdmin: true, department: null }
// ใบที่ไม่มีรายการด่วน / เสร็จครบ / ไม่มีกำหนด / ว่าง → ไม่ขึ้นแผง
assert.deepEqual(purchaseAlerts([mkList({ due_date: '2026-10-20', items: [mkItem()] })], admin, TODAY), [])
assert.deepEqual(purchaseAlerts([mkList({ due_date: '2026-09-20', items: [mkItem({ status: 'done' })] })], admin, TODAY), [])
assert.deepEqual(purchaseAlerts([mkList({ items: [mkItem()] })], admin, TODAY), [])
assert.deepEqual(purchaseAlerts([mkList({ due_date: '2026-09-20' })], admin, TODAY), [])
// วันที่ = กำหนดของรายการค้างที่เร็วสุด (ใบใกล้ถึงแต่มีรายการที่ต้องได้พรุ่งนี้ → ด่วน)
const early = purchaseAlerts([mkList({
    id: 'EARLY',
    lead: mkLead({ event_date: '2026-10-05' }),
    items: [mkItem(), mkItem({ due_date: '2026-09-30' }), mkItem({ due_date: '2026-09-20', status: 'done' })],
})], admin, TODAY)
assert.deepEqual(early.map(r => [r.date, r.severity, r.countdown, r.outstanding]), [['2026-09-30', 'urgent', 'พรุ่งนี้', 2]])
// เรียง: เลยกำหนด → ด่วน → ใกล้ถึง แล้ววันเร็วสุดก่อน
const sortedAlerts = purchaseAlerts([
    mkList({ id: 'SOON', title: 'ใกล้ถึง', due_date: '2026-10-04', items: [mkItem()] }),
    mkList({ id: 'URGENT-LATE', title: 'ด่วน 2', due_date: '2026-10-02', items: [mkItem()] }),
    mkList({ id: 'OVERDUE', title: 'เลย', due_date: '2026-09-25', items: [mkItem()] }),
    mkList({ id: 'URGENT', title: 'ด่วน 1', due_date: '2026-09-29', items: [mkItem()] }),
], admin, TODAY)
assert.deepEqual(sortedAlerts.map(r => [r.listId, r.severity, r.countdown]), [
    ['OVERDUE', 'overdue', 'เลยมา 4 วัน'],
    ['URGENT', 'urgent', 'วันนี้'],
    ['URGENT-LATE', 'urgent', 'อีก 3 วัน'],
    ['SOON', 'soon', 'อีก 5 วัน'],
])

// --- แถวดิบจากฐานข้อมูล ------------------------------------------------------------------
const raw = toPurchaseItem({
    id: 'i', list_id: 'l', title: 'ของ', kind: 'weird', status: 'lost', quantity: '', est_price: '1200.50', actual_price: null,
    images: null, sort_order: '3', due_date: '2026-10-01', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
})
assert.equal(raw.kind, 'buy')
assert.equal(raw.status, 'planning')
assert.equal(raw.quantity, null)
assert.equal(raw.est_price, 1200.5)
assert.equal(raw.actual_price, null)
assert.deepEqual(raw.images, [])
assert.equal(raw.sort_order, 3)
assert.equal(raw.due_date, '2026-10-01')
assert.deepEqual(toPurchaseItem({ id: 'i', list_id: 'l', title: 't', images: ['u1', 5, 'u2'] }).images, ['u1', 'u2'])
// ใบเบิกที่ผูก: อ่านคอลัมน์ expense_claim_id (ไม่มี/ว่าง = ไม่ผูก) และคอลัมน์อยู่ในชุดที่ select
assert.equal(raw.expense_claim_id, null)
assert.equal(toPurchaseItem({ id: 'i', list_id: 'l', title: 't', expense_claim_id: 'claim-9' }).expense_claim_id, 'claim-9')
assert.equal(toPurchaseItem({ id: 'i', list_id: 'l', title: 't', expense_claim_id: '' }).expense_claim_id, null)
assert.ok(PURCHASE_ITEM_COLUMNS.split(', ').includes('expense_claim_id'))

const rawTemplate = toPurchaseTemplate({
    id: 't', name: 'ชุด', created_by: null, created_at: 'c', updated_at: 'u',
    items: [{ title: ' กรอบ ', kind: 'order', est_price: '300' }, { kind: 'buy' }, 'ของ', null, { title: '  ' }],
})
assert.deepEqual(rawTemplate.items, [{ title: 'กรอบ', kind: 'order', quantity: null, est_price: 300, vendor: null, link_url: null, note: null }])
assert.deepEqual(toPurchaseTemplate({ id: 't', name: 'ชุด', items: null }).items, [])

// --- ใบเบิกที่ผูก (สเปคหัวข้อ "ผูกใบเบิก") -------------------------------------------------------
assert.equal(MAX_ITEMS_PER_LINK, 50)
assert.deepEqual([...LINKABLE_CLAIM_TYPES], ['event', 'other', 'advance'])

// ผูกได้: ทุกประเภท × ทุกสถานะของ Finance — event/other/advance ที่ไม่ใช่ rejected/cancelled (ไม่รวม petty_cash)
let linkableCombos = 0
for (const { value: claimType } of CLAIM_TYPES) {
    for (const { value: claimStatus } of CLAIM_STATUSES) {
        const expected = claimType !== 'petty_cash' && claimStatus !== 'rejected' && claimStatus !== 'cancelled'
        assert.equal(isLinkableClaim({ claim_type: claimType, status: claimStatus }), expected, `${claimType}/${claimStatus}`)
        if (expected) linkableCombos++
    }
}
assert.equal(linkableCombos, 3 * (CLAIM_STATUSES.length - 2))
for (const odd of [
    { claim_type: 'weird', status: 'pending' },
    { claim_type: 'EVENT', status: 'pending' },
    { claim_type: null, status: 'pending' },
    { claim_type: 'event', status: null },
    { claim_type: 'event', status: '' },
]) {
    assert.equal(isLinkableClaim(odd), false, JSON.stringify(odd))
}
assert.equal(isVoidClaimStatus('rejected'), true)
assert.equal(isVoidClaimStatus('cancelled'), true)
for (const s of ['draft', 'pending', 'paid', 'refund_confirmed', '', null, undefined]) assert.equal(isVoidClaimStatus(s), false)

// ใครเห็นชื่อ/ยอด (และผูกใบนั้นได้): แอดมิน หรือผู้เบิก
assert.equal(canSeeClaim({ userId: OTHER, isAdmin: true }, BUYER), true) // แอดมิน
assert.equal(canSeeClaim({ userId: BUYER, isAdmin: false }, BUYER), true) // ผู้เบิก
assert.equal(canSeeClaim({ userId: OTHER, isAdmin: false }, BUYER), false) // คนอื่น
assert.equal(canSeeClaim({ userId: OTHER, isAdmin: false }, null), false) // ไม่รู้ว่าใครเบิก
assert.equal(canSeeClaim({ userId: null, isAdmin: false }, null), false) // ไม่ได้ล็อกอิน ≠ ผู้เบิกของใบที่ submitted_by ว่าง

// ยอดของใบ = claimEffectiveAmount: ทดลองจ่ายที่คืนเงินแล้วใช้ยอดที่ใช้จริง
assert.equal(claimAmountOf({ claim_type: 'advance', status: 'refund_confirmed', amount: 5000, actual_spent_amount: '4200.25' }), 4200.25)
assert.equal(claimAmountOf({ claim_type: 'advance', status: 'paid', amount: '5000', actual_spent_amount: 4200 }), 5000)
assert.equal(claimAmountOf({ claim_type: 'event', status: 'refund_confirmed', amount: 800, actual_spent_amount: 1 }), 800)
assert.equal(claimAmountOf({ claim_type: 'event', status: 'pending', amount: null }), 0)

// toPurchaseClaim: ตัดชื่อ ยอด และยอดรวมของรายการที่ผูก สำหรับคนที่ไม่ใช่แอดมินและไม่ใช่ผู้เบิก
const claimRow = {
    id: 'claim-1', claim_number: 'EXP-202609-007', claim_type: 'event', title: 'ค่าป้ายงานสยาม',
    amount: '1500.50', actual_spent_amount: null, status: 'pending', submitted_by: BUYER,
}
const claimStats = { linked_items: 3, linked_actual: 1500.5 }
const seenByAdmin = toPurchaseClaim(claimRow, { userId: OTHER, isAdmin: true }, claimStats)
assert.deepEqual(seenByAdmin, {
    id: 'claim-1',
    claim_number: 'EXP-202609-007',
    status: 'pending',
    status_label: 'รออนุมัติ',
    status_color: '#f59e0b',
    visible: true,
    title: 'ค่าป้ายงานสยาม',
    amount: 1500.5,
    linked_items: 3,
    linked_actual: 1500.5,
})
assert.deepEqual(toPurchaseClaim(claimRow, { userId: BUYER, isAdmin: false }, claimStats), seenByAdmin) // ผู้เบิกเห็นเท่าแอดมิน
const seenByStaff = toPurchaseClaim(claimRow, { userId: OTHER, isAdmin: false }, claimStats)
assert.deepEqual(seenByStaff, { ...seenByAdmin, visible: false, title: null, amount: null, linked_actual: null })
// เลขที่ สถานะ และจำนวนรายการที่ผูกยังอยู่ · ชื่อและยอดไม่หลุดไปในค่าที่ส่งให้หน้าจอเลย
assert.deepEqual([seenByStaff.claim_number, seenByStaff.status_label, seenByStaff.linked_items], ['EXP-202609-007', 'รออนุมัติ', 3])
assert.ok(!JSON.stringify(seenByStaff).includes('ค่าป้าย') && !JSON.stringify(seenByStaff).includes('1500'))
assert.equal(toPurchaseClaim({ ...claimRow, submitted_by: null }, { userId: null, isAdmin: false }, claimStats).visible, false)
// ยอดรวมของรายการปัดสตางค์ · สถานะที่ไม่รู้จักแสดงค่าดิบ (สีเทา) · สถานะว่าง = "ไม่ทราบสถานะ"
assert.equal(toPurchaseClaim(claimRow, { userId: BUYER, isAdmin: false }, { linked_items: 2, linked_actual: 0.1 + 0.2 }).linked_actual, 0.3)
const oddStatus = toPurchaseClaim({ ...claimRow, status: 'on_hold' }, { userId: OTHER, isAdmin: true }, claimStats)
assert.deepEqual([oddStatus.status, oddStatus.status_label, oddStatus.status_color], ['on_hold', 'on_hold', '#6b7280'])
assert.equal(toPurchaseClaim({ ...claimRow, status: null }, { userId: OTHER, isAdmin: true }, claimStats).status_label, 'ไม่ทราบสถานะ')
assert.equal(toPurchaseClaim({ ...claimRow, status: 'rejected' }, { userId: OTHER, isAdmin: false }, claimStats).status_label, 'ปฏิเสธ')

// ตัวเลือกในหน้าต่างผูกใบเบิก
assert.deepEqual(toPurchaseClaimOption({ ...claimRow, expense_date: '2026-09-20T00:00:00Z' }, 2, 'ต้น'), {
    id: 'claim-1',
    claim_number: 'EXP-202609-007',
    title: 'ค่าป้ายงานสยาม',
    amount: 1500.5,
    status: 'pending',
    status_label: 'รออนุมัติ',
    expense_date: '2026-09-20',
    submitter_name: 'ต้น',
    linked_items: 2,
})
assert.equal(toPurchaseClaimOption({ ...claimRow, status: 'on_hold', expense_date: null }, 0, null).status_label, 'on_hold')

// ยอดไม่ตรง: ต่างเกิน 0.01 บาท — ที่ขอบ 0.01 = ไม่เตือน · 0.02 = เตือน · ใบที่ไม่เห็นยอด = ไม่เตือนเลย
const mismatch = (amount: number | null, linked_actual: number | null, visible = true) => claimMismatch({ visible, amount, linked_actual })
assert.equal(mismatch(100, 100), false)
assert.equal(mismatch(100, 100.01), false)
assert.equal(mismatch(100.01, 100), false)
assert.equal(mismatch(100, 100.02), true)
assert.equal(mismatch(100.02, 100), true)
assert.equal(mismatch(1500.5, 0), true)
assert.equal(mismatch(0.3, 0.1 + 0.2), false) // ทศนิยมลอยตัว
assert.equal(mismatch(100, 500, false), false)
assert.equal(mismatch(null, null, false), false)
assert.equal(claimMismatch(toPurchaseClaim(claimRow, { userId: OTHER, isAdmin: false }, { linked_items: 1, linked_actual: 1 })), false)
assert.equal(claimMismatch(toPurchaseClaim(claimRow, { userId: BUYER, isAdmin: false }, { linked_items: 1, linked_actual: 1 })), true)
assert.equal(moneyDiffers(99_999_999, 99_999_999.01), false)
assert.equal(moneyDiffers(99_999_999, 99_999_998.98), true)

// หัวการ์ด "ผูกใบเบิกแล้ว N/M รายการ"
assert.deepEqual(claimsOf([]), { linked: 0, total: 0 })
assert.deepEqual(
    claimsOf([mkItem({ expense_claim_id: 'claim-1' }), mkItem(), mkItem({ expense_claim_id: 'claim-2' }), mkItem({ status: 'done' })]),
    { linked: 2, total: 4 }
)

// --- หน้าจอ: ค่าชั่วคราว (applyOptimistic) — เปลี่ยนเฉพาะเส้นทางที่แตะ ที่เหลือคง object เดิม -------------
const NOW = '2026-09-29T03:00:00.000Z'
const LATER = '2026-09-29T04:00:00.000Z'
const oa = mkItem({ id: 'oa', list_id: 'OL1', status: 'planning', sort_order: 0 })
const ob = mkItem({ id: 'ob', list_id: 'OL1', status: 'purchasing', sort_order: 1 })
const oc = mkItem({ id: 'oc', list_id: 'OL2', sort_order: 7, created_by: OTHER })
const OL1 = mkList({ id: 'OL1', items: [oa, ob] })
const OL2 = mkList({ id: 'OL2', items: [oc] })
const OL3 = mkList({ id: 'OL3' })
const optBase = [OL1, OL2, OL3]
const snapshotOf = (lists: PurchaseList[]) => JSON.stringify(lists)
const optBefore = snapshotOf(optBase)
const opt = (action: OptimisticAction) => applyOptimistic(optBase, action)

// status: ประทับเวลาแบบเดียวกับ server
const st = opt({ type: 'status', itemId: 'oa', status: 'done', userId: ME, now: NOW })
assert.notEqual(st, optBase)
assert.deepEqual(ids(st), ['OL1', 'OL2', 'OL3'])
assert.notEqual(st[0], OL1)
assert.notEqual(st[0].items, OL1.items)
assert.equal(st[1], OL2) // ใบอื่นคงตัวเดิม
assert.equal(st[2], OL3)
assert.equal(st[0].items[1], ob) // รายการอื่นในใบเดียวกันคงตัวเดิม
assert.deepEqual(
    { status: st[0].items[0].status, at: st[0].items[0].status_changed_at, by: st[0].items[0].status_changed_by, done: st[0].items[0].done_at },
    { status: 'done', at: NOW, by: ME, done: NOW }
)
assert.equal(st[0].items[0].title, oa.title)
// ถอยจากเสร็จสิ้น → ล้าง done_at · ประทับคนเปลี่ยนใหม่
const back = applyOptimistic(st, { type: 'status', itemId: 'oa', status: 'awaiting_delivery', userId: OTHER, now: LATER })
assert.deepEqual(
    { status: back[0].items[0].status, at: back[0].items[0].status_changed_at, by: back[0].items[0].status_changed_by, done: back[0].items[0].done_at },
    { status: 'awaiting_delivery', at: LATER, by: OTHER, done: null }
)
assert.equal(back[1], OL2)
// สถานะเดิม / id ที่ไม่รู้จัก → ตัวเดิมทั้งก้อน
assert.equal(opt({ type: 'status', itemId: 'oa', status: 'planning', userId: ME, now: NOW }), optBase)
assert.equal(opt({ type: 'status', itemId: 'nope', status: 'done', userId: ME, now: NOW }), optBase)

// addItems: ต่อท้ายใบด้วย id ชั่วคราว สถานะวางแผน sort_order ต่อจากตัวสุดท้าย
const added = opt({
    type: 'addItems',
    listId: 'OL2',
    items: [{ tempId: `${TEMP_ID_PREFIX}1`, title: 'เทปกาว', kind: 'order' }, { tempId: `${TEMP_ID_PREFIX}2`, title: 'ถ่าน', kind: 'buy' }],
    userId: ME,
    now: NOW,
})
assert.equal(added[0], OL1)
assert.equal(added[2], OL3)
assert.notEqual(added[1], OL2)
assert.equal(added[1].items[0], oc) // รายการเดิมคงตัวเดิม
assert.deepEqual(
    added[1].items.map(i => [i.id, i.title, i.kind, i.status, i.sort_order, i.list_id, i.created_by, i.assignee_id]),
    [
        ['oc', oc.title, 'buy', 'planning', 7, 'OL2', OTHER, null],
        ['temp-1', 'เทปกาว', 'order', 'planning', 8, 'OL2', ME, null],
        ['temp-2', 'ถ่าน', 'buy', 'planning', 9, 'OL2', ME, null],
    ]
)
assert.deepEqual(added[1].items[1].images, [])
assert.equal(added[1].items[1].expense_claim_id, null) // รายการใหม่ยังไม่ผูกใบเบิก
assert.equal(added[1].items[1].created_at, NOW)
// ใบว่าง: sort_order เริ่มที่ 0
assert.deepEqual(opt({ type: 'addItems', listId: 'OL3', items: [{ tempId: 'temp-x', title: 'ป้าย', kind: 'other' }], userId: null, now: NOW })[2].items.map(i => i.sort_order), [0])
assert.equal(opt({ type: 'addItems', listId: 'nope', items: [{ tempId: 'temp-y', title: 'x', kind: 'buy' }], userId: ME, now: NOW }), optBase)
assert.equal(opt({ type: 'addItems', listId: 'OL2', items: [], userId: ME, now: NOW }), optBase)

// updateItem: แตะเฉพาะช่องที่ส่งมา
const upd = opt({ type: 'updateItem', itemId: 'ob', patch: { vendor: 'ร้านใหม่', est_price: 120, assignee_id: BUYER } })
assert.equal(upd[1], OL2)
assert.equal(upd[2], OL3)
assert.equal(upd[0].items[0], oa)
assert.deepEqual(
    [upd[0].items[1].vendor, upd[0].items[1].est_price, upd[0].items[1].assignee_id, upd[0].items[1].status, upd[0].items[1].title],
    ['ร้านใหม่', 120, BUYER, 'purchasing', ob.title]
)
// ล้างค่าเป็น null ได้ · ช่องที่เป็น undefined ไม่ทับค่าเดิม
const cleared = applyOptimistic(upd, { type: 'updateItem', itemId: 'ob', patch: { vendor: null, note: undefined } })
assert.equal(cleared[0].items[1].vendor, null)
assert.equal(cleared[0].items[1].est_price, 120)
assert.equal(opt({ type: 'updateItem', itemId: 'nope', patch: { vendor: 'x' } }), optBase)
assert.equal(opt({ type: 'updateItem', itemId: 'ob', patch: {} }), optBase)
assert.equal(opt({ type: 'updateItem', itemId: 'ob', patch: { note: undefined } }), optBase)

// deleteItem
const delItem = opt({ type: 'deleteItem', itemId: 'oa' })
assert.deepEqual(delItem[0].items.map(i => i.id), ['ob'])
assert.equal(delItem[0].items[0], ob)
assert.equal(delItem[1], OL2)
assert.equal(delItem[2], OL3)
assert.equal(opt({ type: 'deleteItem', itemId: 'nope' }), optBase)

// updateList: รายการในใบไม่ถูกแตะ (array เดิม)
const updList = opt({ type: 'updateList', listId: 'OL2', patch: { note: 'ซื้อก่อนวันศุกร์', budget: 500, owner_id: OWNER } })
assert.equal(updList[0], OL1)
assert.equal(updList[2], OL3)
assert.notEqual(updList[1], OL2)
assert.equal(updList[1].items, OL2.items)
assert.deepEqual([updList[1].note, updList[1].budget, updList[1].owner_id, updList[1].title], ['ซื้อก่อนวันศุกร์', 500, OWNER, OL2.title])
assert.equal(opt({ type: 'updateList', listId: 'nope', patch: { note: 'x' } }), optBase)
assert.equal(opt({ type: 'updateList', listId: 'OL2', patch: {} }), optBase)

// deleteList
const delList = opt({ type: 'deleteList', listId: 'OL2' })
assert.deepEqual(ids(delList), ['OL1', 'OL3'])
assert.equal(delList[0], OL1)
assert.equal(delList[1], OL3)
assert.equal(opt({ type: 'deleteList', listId: 'nope' }), optBase)

// linkClaim: ผูกหลายรายการข้ามเช็กลิสต์ — แตะเฉพาะรายการที่ใบเบิกเปลี่ยนจริง ที่เหลือคงตัวเดิม
const linkedOpt = opt({ type: 'linkClaim', itemIds: ['ob', 'oc'], claimId: 'claim-1' })
assert.notEqual(linkedOpt, optBase)
assert.deepEqual(ids(linkedOpt), ['OL1', 'OL2', 'OL3'])
assert.notEqual(linkedOpt[0], OL1)
assert.notEqual(linkedOpt[1], OL2)
assert.equal(linkedOpt[2], OL3) // ใบที่ไม่เกี่ยวคงตัวเดิม
assert.equal(linkedOpt[0].items[0], oa) // รายการที่ไม่ได้เลือกคงตัวเดิม
assert.deepEqual([linkedOpt[0].items[1].expense_claim_id, linkedOpt[1].items[0].expense_claim_id], ['claim-1', 'claim-1'])
assert.deepEqual({ ...linkedOpt[0].items[1], expense_claim_id: null }, ob) // ช่องอื่นไม่ถูกแตะ
// แตะใบเดียว = ใบอื่นคงตัวเดิมทั้งใบ
const linkedOne = opt({ type: 'linkClaim', itemIds: ['oa'], claimId: 'claim-1' })
assert.equal(linkedOne[1], OL2)
assert.equal(linkedOne[2], OL3)
assert.equal(linkedOne[0].items[1], ob)
assert.equal(linkedOne[0].items[0].expense_claim_id, 'claim-1')
// ผูกใบเดิมอยู่แล้ว / id ที่ไม่รู้จัก / ไม่มี id → คืนตัวเดิมทั้งก้อน
assert.equal(applyOptimistic(linkedOpt, { type: 'linkClaim', itemIds: ['ob', 'oc'], claimId: 'claim-1' }), linkedOpt)
assert.equal(opt({ type: 'linkClaim', itemIds: ['nope'], claimId: 'claim-1' }), optBase)
assert.equal(opt({ type: 'linkClaim', itemIds: [], claimId: 'claim-1' }), optBase)
// ผูกใบใหม่ = แทนที่ใบเดิม (รายการหนึ่งข้อมีใบเบิกเดียว) · ใบที่ไม่เปลี่ยนคงตัวเดิม
const relinked = applyOptimistic(linkedOpt, { type: 'linkClaim', itemIds: ['ob', 'oc'], claimId: 'claim-2' })
assert.deepEqual([relinked[0].items[1].expense_claim_id, relinked[1].items[0].expense_claim_id], ['claim-2', 'claim-2'])
const relinkedOne = applyOptimistic(linkedOpt, { type: 'linkClaim', itemIds: ['oc'], claimId: 'claim-2' })
assert.equal(relinkedOne[0], linkedOpt[0])
assert.equal(relinkedOne[1].items[0].expense_claim_id, 'claim-2')

// unlinkClaim: ล้างใบเบิกของรายการเดียว · ไม่ได้ผูกอยู่ / id ที่ไม่รู้จัก → คืนตัวเดิม
const unlinkedOpt = applyOptimistic(linkedOpt, { type: 'unlinkClaim', itemId: 'oc' })
assert.equal(unlinkedOpt[1].items[0].expense_claim_id, null)
assert.equal(unlinkedOpt[0], linkedOpt[0])
assert.equal(unlinkedOpt[2], OL3)
assert.equal(applyOptimistic(unlinkedOpt, { type: 'unlinkClaim', itemId: 'oc' }), unlinkedOpt)
assert.equal(opt({ type: 'unlinkClaim', itemId: 'oa' }), optBase)
assert.equal(opt({ type: 'unlinkClaim', itemId: 'nope' }), optBase)

// ไม่แก้ของเดิมเลยสักตัว
assert.equal(snapshotOf(optBase), optBefore, 'applyOptimistic ต้องไม่แก้ข้อมูลเดิม')

// id ชั่วคราว
assert.equal(isTempId(`${TEMP_ID_PREFIX}abc`), true)
assert.equal(isTempId(ME), false)
assert.equal(isTempId(''), false)
assert.equal(isUuid(`${TEMP_ID_PREFIX}abc`), false) // server ปฏิเสธ id ชั่วคราวเสมอ

// --- หน้าจอ: เงิน / ชื่อ / สี / ตัวเลขหัวหน้า -------------------------------------------------------
assert.equal(formatMoney(1250), '1,250')
assert.equal(formatMoney(1250.5), '1,250.50')
assert.equal(formatMoney(0), '0')
assert.equal(formatMoney(99_999_999), '99,999,999')
assert.equal(formatMoney(0.1 + 0.2), '0.30')

assert.equal(personName({ name: 'สมชาย ใจดี', nickname: 'ต้น' }), 'ต้น')
assert.equal(personName({ name: 'สมชาย ใจดี', nickname: '  ' }), 'สมชาย ใจดี')
assert.equal(personName({ name: 'สมชาย ใจดี', nickname: null }), 'สมชาย ใจดี')

assert.deepEqual(URGENCY_LABELS, { overdue: 'เลยกำหนด', urgent: 'ด่วน', soon: 'ใกล้ถึง' })
// สีคนละชุดต่อสถานะ / ความด่วน (ไม่ว่าง ไม่ซ้ำกัน) — ข้อความบอกสถานะเสมอ สีเป็นส่วนเสริม
for (const key of ['pill', 'bar', 'dot'] as const) {
    const tones = PURCHASE_STATUSES.map(s => statusTone(s)[key])
    assert.ok(tones.every(t => t.trim().length > 0), `statusTone.${key} ว่าง`)
    assert.equal(new Set(tones).size, PURCHASE_STATUSES.length, `statusTone.${key} ซ้ำกัน`)
}
const urgencies: (Urgency | null)[] = ['overdue', 'urgent', 'soon', null]
for (const key of ['text', 'badge', 'dot'] as const) {
    const tones = urgencies.map(u => urgencyTone(u)[key])
    assert.ok(tones.every(t => t.trim().length > 0), `urgencyTone.${key} ว่าง`)
    assert.equal(new Set(tones).size, urgencies.length, `urgencyTone.${key} ซ้ำกัน`)
}
assert.match(urgencyTone('overdue').text, /red/)
assert.match(urgencyTone('soon').text, /amber/)

// งบ: ตั้งที่เช็กลิสต์ → เทียบกับงบนั้น · ไม่ตั้ง → เทียบผลรวมงบรายการ (> 0) · ไม่มีงบเลย = ไม่เกิน
const spent = [mkItem({ status: 'done', est_price: 100, actual_price: 150 }), mkItem({ status: 'done', est_price: 100, actual_price: null })]
assert.deepEqual(budgetOf(mkList({ budget: 120, items: spent })), { budget: 120, source: 'list', actual: 150, missingActual: 1, over: true })
assert.deepEqual(budgetOf(mkList({ budget: 150, items: spent })), { budget: 150, source: 'list', actual: 150, missingActual: 1, over: false })
assert.deepEqual(budgetOf(mkList({ budget: 1000, items: spent })).over, false)
assert.deepEqual(budgetOf(mkList({ items: spent })), { budget: 200, source: 'items', actual: 150, missingActual: 1, over: false })
assert.equal(budgetOf(mkList({ items: [mkItem({ est_price: 100, actual_price: 101 })] })).over, true)
assert.deepEqual(budgetOf(mkList({ items: [mkItem({ actual_price: 50 })] })), { budget: null, source: null, actual: 50, missingActual: 0, over: false })
assert.deepEqual(budgetOf(mkList()), { budget: null, source: null, actual: 0, missingActual: 0, over: false })
assert.equal(budgetOf(mkList({ budget: 0, items: [mkItem({ actual_price: 1 })] })).over, true) // ตั้งงบ 0 ไว้ = จ่ายเท่าไรก็เกิน

// ตัวเลขหัวหน้า: รายการค้าง / ด่วน (= เลยกำหนด + อีก 0–3 วัน · ใกล้ถึงไม่นับ · เสร็จแล้วไม่นับ)
assert.deepEqual(
    listsSummary([
        mkList({ items: [mkItem({ due_date: '2026-09-20' }), mkItem({ due_date: '2026-10-01' }), mkItem({ due_date: '2026-10-05' }), mkItem({ status: 'done', due_date: '2026-09-01' })] }),
        mkList({ items: [mkItem()] }),
        mkList(),
    ], TODAY),
    { lists: 3, open: 4, urgent: 2 }
)
assert.deepEqual(listsSummary([], TODAY), { lists: 0, open: 0, urgent: 0 })

console.log('purchasing-logic: ผ่านทั้งหมด')
