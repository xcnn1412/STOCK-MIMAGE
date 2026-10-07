// Runnable self-check for capacity-warnings.ts (no test runner in this repo).
// Run: npx tsx components/dashboard-alerts/capacity-warnings.check.ts
import assert from 'node:assert/strict'
import { CAPACITY_PANEL_AHEAD_DAYS, buildCapacityRows, canSeeCapacity, capacityHref, type CapacityRowsInput, type CapacityViewer } from './capacity-warnings'
import type { CapacityWarning } from '@/app/(authenticated)/packages/types'

const TODAY = new Date(2026, 9, 7) // 2026-10-07

const warn = (level: 'red' | 'yellow', categoryName = 'คอมพิวเตอร์'): CapacityWarning => ({
    categoryId: 'c1', categoryName, packageName: 'Selfie', level, need: 2, capacity: 1, demandSure: 0, demandPlanned: 0, message: `${categoryName} ไม่พอ`, leadIds: [],
})

const admin: CapacityViewer = { userId: 'u9', department: null, isAdmin: true, canManagePool: true }
const coordinator: CapacityViewer = { userId: 'u8', department: 'ฝ่ายประสานงาน', isAdmin: false, canManagePool: true }
const seller: CapacityViewer = { userId: 'u1', department: 'ฝ่ายขาย', isAdmin: false, canManagePool: false }
const packer: CapacityViewer = { userId: 'u2', department: 'ทีมจัดของ', isAdmin: false, canManagePool: false }
const stranger: CapacityViewer = { userId: 'u3', department: 'กราฟิก', isAdmin: false, canManagePool: false }

// ---- canSeeCapacity ----
assert.equal(canSeeCapacity(admin, 'u1', []), true)
assert.equal(canSeeCapacity(coordinator, 'u1', []), true)
assert.equal(canSeeCapacity(seller, 'u1', []), true) // ผู้สร้างการ์ด
assert.equal(canSeeCapacity(seller, 'u5', []), false) // การ์ดคนอื่น
assert.equal(canSeeCapacity(packer, 'u5', ['ทีมจัดของ']), true) // แผนกที่ดูแลอุปกรณ์
assert.equal(canSeeCapacity(stranger, 'u5', ['ทีมจัดของ']), false)
assert.equal(canSeeCapacity({ ...stranger, userId: null }, null, []), false)

assert.equal(capacityHref('L1'), '/jobs/tracking?lead=L1')

// ---- buildCapacityRows ----
const lead = (id: string, event_date: string | null, customer_name: string | null = `ลูกค้า ${id}`) => ({ id, customer_name, event_name: 'ไบเทค', event_date })
const base = (over: Partial<CapacityRowsInput> = {}): CapacityRowsInput => ({
    leads: [
        lead('L1', '2026-10-20'),
        lead('L2', '2026-10-08'),
        lead('L3', '2026-10-06'), // เมื่อวาน → ไม่เข้า
        lead('L4', '2026-11-07'), // +31 วัน → ไม่เข้า
        lead('L5', '2026-11-06'), // +30 วันพอดี → เข้า
        lead('L6', null), // ไม่มีวันงาน
        lead('L7', '2026-10-07'), // วันนี้ แต่ไม่มีคำเตือน
        lead('L8', '2026-10-07', null), // วันนี้ ไม่มีชื่อลูกค้า → ใช้ชื่ออีเวนต์
    ],
    warningsByLead: {
        L1: [warn('yellow')],
        L2: [warn('yellow'), warn('red', 'ตู้ประกอบ')],
        L3: [warn('red')],
        L4: [warn('red')],
        L5: [warn('yellow')],
        L6: [warn('red')],
        L7: [],
        L8: [warn('yellow')],
    },
    leadCreatedBy: { L1: 'u1', L2: 'u5', L5: 'u1', L8: 'u5' },
    kitDepartments: ['ทีมจัดของ'],
    viewer: admin,
    today: TODAY,
    ...over,
})

{
    const rows = buildCapacityRows(base())
    assert.deepEqual(rows.map(r => r.leadId), ['L8', 'L2', 'L1', 'L5']) // เรียงวันงานใกล้สุดก่อน
    assert.equal(rows[0].customerName, 'ไบเทค')
    assert.equal(rows[0].subtitle, '')
    assert.equal(rows[0].countdown, 'วันนี้')
    assert.equal(rows[1].level, 'red') // มีแดงอย่างน้อยข้อเดียว
    assert.equal(rows[1].countdown, 'พรุ่งนี้')
    assert.equal(rows[2].level, 'yellow')
    assert.equal(rows[2].subtitle, 'ไบเทค')
    assert.equal(rows[3].daysLeft, CAPACITY_PANEL_AHEAD_DAYS)
    assert.equal(rows[1].href, '/jobs/tracking?lead=L2')
}

// ผู้สร้างการ์ดเห็นเฉพาะงานของตัวเอง · ทีมจัดของเห็นทุกงาน · คนอื่นไม่เห็นเลย
assert.deepEqual(buildCapacityRows(base({ viewer: seller })).map(r => r.leadId), ['L1', 'L5'])
assert.equal(buildCapacityRows(base({ viewer: packer })).length, 4)
assert.equal(buildCapacityRows(base({ viewer: stranger })).length, 0)
assert.equal(buildCapacityRows(base({ viewer: coordinator })).length, 4)

// งานที่ archive / กดเสร็จสิ้นแล้ว → ไม่เข้าแผง
assert.deepEqual(buildCapacityRows(base({ excludedLeadIds: ['L2', 'L8'] })).map(r => r.leadId), ['L1', 'L5'])

// ไม่มีคำเตือนเลย → []
assert.deepEqual(buildCapacityRows(base({ warningsByLead: {} })), [])

console.log('capacity-warnings.check: ผ่านทั้งหมด')
