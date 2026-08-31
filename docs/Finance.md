# Finance Module — Expense Claims

ระบบเบิกเงิน (Expense Claims) สำหรับพนักงานและผู้ดูแลระบบ

---

## Pages & Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/finance` | `ClaimsListView` | รายการใบเบิกทั้งหมด (filtered by role) |
| `/finance/new` | New claim form | สร้างใบเบิกใหม่ |
| `/finance/[id]` | `ClaimDetailView` | รายละเอียดใบเบิก + workflow actions |
| `/finance/payouts` | Payouts page | ใบเบิกที่รออนุมัติจ่าย (Admin only) |
| `/finance/archive` | Archive page | ประวัติใบเบิกที่จ่ายแล้ว (Admin only) |
| `/finance/settings` | Settings | จัดการหมวดหมู่ค่าใช้จ่าย (Admin only) |

---

## Role-Based Access Control

### Staff (non-admin)
- เห็นเฉพาะใบเบิกของตัวเอง (`submitted_by = userId`)
- สร้างใบเบิกใหม่ได้
- ยื่นใบเบิก (draft → pending) ได้
- ยกเลิกใบเบิก (draft/pending → cancelled) ของตัวเองได้
- แก้ไขใบเบิกของตัวเองได้เฉพาะ draft / pending

### Admin
- เห็นใบเบิกทั้งหมด
- อนุมัติ / ปฏิเสธ / จ่ายเงินได้
- Override สถานะได้ทุก transition (รวม terminal states)
- ลบใบเบิกได้ทุกรายการ

---

## Status Lifecycle (State Machine)

```
draft ──► pending ──► approved ──► waiting_tax_invoice ──► pending_month_end ──► paid
  │           │           │                │                                       ▲
  │           ▼           ├──── (skip) ────┼──────────────── pending_month_end ───┘
  └──► cancelled          └──── (skip) ────┴──────────────── paid
           ▲
           │ (owner only, from draft/pending)
```

> **"Skip" Tax Invoice:** Admin can bypass `waiting_tax_invoice` at the `approved` stage by clicking "Defer to Month End" or "Mark as Paid" directly.

### Status Definitions

| Status | Label (TH) | Color | Description |
|--------|-----------|-------|-------------|
| `draft` | แบบร่าง | Gray | สร้างแล้ว ยังไม่ยื่น |
| `pending` | รออนุมัติ | Amber | ยื่นแล้ว รอ Admin ตรวจ |
| `approved` | อนุมัติแล้ว | Green | Admin อนุมัติ รอจ่าย |
| `waiting_tax_invoice` | รอใบกำกับภาษี | Sky Blue | รอผู้เบิกอัพโหลดใบกำกับภาษี |
| `pending_month_end` | รอจ่ายสิ้นเดือน | Purple | เลื่อนจ่ายไปสิ้นเดือน |
| `paid` | ชำระเงินแล้ว | Teal | จ่ายเงินแล้ว (terminal) |
| `rejected` | ปฏิเสธ | Red | Admin ปฏิเสธ (terminal) |
| `cancelled` | ยกเลิกแล้ว | Slate | ผู้ยื่นยกเลิก (terminal) |
| `awaiting_payment` | รอชำระเงิน (เก่า) | Blue | Legacy — ข้อมูลเก่าเท่านั้น |

### Allowed Transitions

| From | Admin can → | Owner (staff) can → |
|------|------------|---------------------|
| `draft` | pending, cancelled | pending, cancelled |
| `pending` | approved, rejected | cancelled |
| `approved` | **waiting_tax_invoice**, pending_month_end, paid | — |
| `waiting_tax_invoice` | pending_month_end, paid | — (upload only) |
| `pending_month_end` | paid | — |
| `paid` | — (admin override only) | — |
| `rejected` | — (admin override only) | — |
| `cancelled` | — (admin override only) | — |

---

## Server Actions (`actions.ts`)

### Read

| Function | Access | Description |
|----------|--------|-------------|
| `getClaims(filters?)` | Any authenticated user | Admin เห็นทุกใบ; Staff เห็นเฉพาะของตัวเอง |
| `getClaim(id)` | Any authenticated user | Admin เห็นทุกใบ; Staff เห็นเฉพาะของตัวเอง |
| `getClaimLogs(claimId)` | Any authenticated user | ดึง audit log ของใบเบิก |

### Create / Edit

| Function | Access | Description |
|----------|--------|-------------|
| `createClaim(formData)` | Any authenticated user | สร้างใบเบิกใหม่ สถานะ `draft` |
| `updateClaim(id, data)` | Owner (draft/pending) or Admin | แก้ไขข้อมูลใบเบิก + อัพโหลดใบเสร็จเพิ่ม |

### Workflow Transitions

| Function | Access | Transition |
|----------|--------|-----------|
| `submitClaim(id)` | Owner only | `draft → pending` (ต้องมีใบเสร็จอย่างน้อย 1 ไฟล์) |
| `cancelClaim(id)` | Owner only | `draft/pending → cancelled` |
| `approveClaim(id)` | Admin only | `pending → approved` |
| `approveAsPendingMonthEnd(id)` | Admin only | `pending → pending_month_end` |
| `markAsWaitingTaxInvoice(id)` | Admin only | `approved → waiting_tax_invoice` |
| `uploadTaxInvoice(id, formData)` | Owner or Admin (when `waiting_tax_invoice`) | Uploads tax invoice files |
| `markAsPendingMonthEnd(id)` | Admin only | `approved/waiting_tax_invoice → pending_month_end` |
| `markAsPaid(id)` | Admin only | `approved/waiting_tax_invoice/pending_month_end → paid` |
| `rejectClaim(id, reason)` | **Admin only** | `pending → rejected` |
| `adminOverrideStatus(id, status, reason)` | **Admin only** | Any → Any (bypass state machine) |

### Delete

| Function | Access | Description |
|----------|--------|-------------|
| `deleteClaim(id)` | **Admin only** | ลบใบเบิก; ถ้า approved → ลบ job_cost_item ที่เชื่อมอยู่ด้วย |

---

## Claim Number Format

```
EXP-YYYYMM-NNN

ตัวอย่าง: EXP-202604-001
```

- `YYYYMM` = ปี/เดือนที่สร้าง
- `NNN` = ลำดับที่ในเดือนนั้น (เริ่มจาก 001)

---

## Claim Types

| Type | Label (TH) | Description |
|------|-----------|-------------|
| `event`   | เบิกงานอีเวนต์   | เชื่อมกับ Job Event ใน `/costs` |
| `other`   | เบิกค่าอื่นๆ     | ค่าใช้จ่ายทั่วไป ไม่เชื่อมกับอีเวนต์ |
| `advance` | เบิกทดลองจ่าย   | เบิกเงินล่วงหน้า แล้วอัพเดทค่าใช้จ่ายจริง + สลิปการจ่าย/เงินคืนย้อนหลัง (ดู `settleAdvanceClaim`) |

---

## Tax Calculation

| VAT Mode | Description |
|----------|-------------|
| `none` | ไม่มี VAT |
| `included` | ราคารวม VAT 7% แล้ว (ถอน VAT ออก) |
| `excluded` | ราคายังไม่รวม VAT (บวก 7% เข้า) |

สูตรคำนวณ Net Payable:
```
Net Payable = (Total with VAT) - Withholding Tax
```

---

## Database Migration Required

Before deploying the `waiting_tax_invoice` feature, run this migration on the Supabase DB:

```sql
ALTER TABLE expense_claims ADD COLUMN IF NOT EXISTS tax_invoice_urls text[] DEFAULT '{}';
```

---

## Receipt Upload

- อัพโหลดไปยัง Supabase Storage bucket `receipts`
- Path: `claims/{claim_number}/{timestamp}_{index}.{ext}`
- Public URL เก็บใน `receipt_urls[]` ใน record
- **ต้องมีอย่างน้อย 1 ไฟล์ก่อนยื่น (`submitClaim`)**

---

## Admin Override Feature

Admin สามารถบังคับเปลี่ยนสถานะได้ทุก transition รวมถึงจาก terminal states (`paid`, `rejected`, `cancelled`) โดย:

1. **ต้องระบุเหตุผลทุกครั้ง** (required reason field)
2. **Sensitive transitions** จะแสดง warning สีส้มเพิ่มเติม:
   - Override จาก terminal states (paid, rejected, cancelled)
   - Override ย้อนกลับจาก approved/pending_month_end → pending/draft/rejected/cancelled
3. บันทึก log ด้วย `action: 'admin_override'`
4. แจ้งเตือน (notification) ไปยังผู้ยื่นใบเบิก

---

## Audit Log (`expense_claim_logs`)

ทุก action บันทึกลงตาราง `expense_claim_logs`:

| Action | Trigger |
|--------|---------|
| `submit` | `submitClaim` |
| `cancel` | `cancelClaim` |
| `approve` | `approveClaim` |
| `approve_month_end` | `approveAsPendingMonthEnd` |
| `defer_month_end` | `markAsPendingMonthEnd` |
| `mark_paid` | `markAsPaid` |
| `reject` | `rejectClaim` |
| `update` | `updateClaim` (เมื่อมีการเปลี่ยนแปลงจริง) |
| `upload_receipt` | `updateClaim` (อัพโหลดไฟล์อย่างเดียว) |
| `waiting_tax_invoice` | `markAsWaitingTaxInvoice` |
| `upload_tax_invoice` | `uploadTaxInvoice` |
| `admin_override` | `adminOverrideStatus` |

---

## Integration with Job Costing (`/costs`)

เมื่ออนุมัติใบเบิกที่มี `job_event_id` (ประเภท `event`):
- สร้าง `job_cost_items` record อัตโนมัติ
- `description`: `[เบิกเงิน] {claim.title}`
- `notes`: `{claim_number}::{claim_id}` (ใช้ลบ cost item เมื่อลบใบเบิก)

เมื่อลบใบเบิกที่ approved:
- ลบ `job_cost_items` ที่มี `notes LIKE '%{claim_number}%'` อัตโนมัติ

---

## Security

- **Service Key**: ใช้ `createServiceClient` (bypass Supabase RLS)
- **Role guard ที่ Server Action level** — ไม่พึ่งพา UI gates อย่างเดียว
- Non-admin filter: `query.eq('submitted_by', userId)` ใน `getClaims` และ `getClaim`
- Actions ที่ Admin only: `approveClaim`, `rejectClaim`, `markAsPaid`, `markAsPendingMonthEnd`, `approveAsPendingMonthEnd`, `deleteClaim`, `adminOverrideStatus`
- `rejectClaim`: ตรวจ `role !== 'admin'` ก่อนทุกครั้ง
- `cancelClaim`: ตรวจ `submitted_by === userId` — เฉพาะเจ้าของใบเบิกเท่านั้น

---

## Key Files

| File | Description |
|------|-------------|
| [app/(authenticated)/finance/page.tsx](app/(authenticated)/finance/page.tsx) | Server page — load claims + categories |
| [app/(authenticated)/finance/actions.ts](app/(authenticated)/finance/actions.ts) | All server actions |
| [app/(authenticated)/finance/claims-list-view.tsx](app/(authenticated)/finance/claims-list-view.tsx) | List UI (Client component) |
| [app/(authenticated)/finance/[id]/page.tsx](app/(authenticated)/finance/[id]/page.tsx) | Detail server page |
| [app/(authenticated)/finance/[id]/claim-detail-view.tsx](app/(authenticated)/finance/[id]/claim-detail-view.tsx) | Detail UI + workflow buttons |
| [app/(authenticated)/costs/types.ts](app/(authenticated)/costs/types.ts) | Types, constants, helper functions |
