# ใบเบิก — งานจัดโครงโค้ดที่เหลือ (ขั้น 2 ส่วนที่เหลือ)

สถานะ: **ยังไม่เริ่ม — เก็บไว้ทำทีหลัง** (บันทึก 2026-10-01)
แผนหลัก: `docs/specs/finance-refactor-plan.md` (หัวข้อ "ขั้น 2 — ฐานโค้ด")

## ทำไมต้องทำ

ผู้ใช้ไม่เห็นความต่าง แต่ขั้น 5 (ฟอร์มสร้างใบเบิกใหม่), ขั้น 6 (หน้าใบเบิกใหม่) และขั้น 7 (หน้ารอง) ต้องแก้ส่วนไฟล์แนบ ใบกำกับภาษี ทดลองจ่าย และเงินสดย่อย ซึ่งยังรวมอยู่ในไฟล์เดียว แยกก่อนแล้วแก้ทีหลังจะเสี่ยงพังน้อยกว่า

## ทำเมื่อไร

- หลัง v1.27.0 บนระบบจริงนิ่งแล้ว 2–3 วัน (ขึ้นระบบ 2026-10-01 พร้อม SQL ขั้น 3 และขั้น 4)
- ก่อนเริ่มขั้น 5, 6 หรือ 7
- ทำบน branch `feature/finance-structure` · ออกเป็น v1.27.x (งานภายใน ขยับเลขท้าย ไม่ลงหน้า "มีอะไรใหม่") · ไม่มี SQL

## สภาพตอนบันทึก

| ไฟล์ใน `app/(authenticated)/finance/` | บรรทัด |
|---|---|
| `actions.ts` | 2,333 (เดิม 3,202 ก่อนขั้น 4) |
| `lifecycle-actions.ts` | 1,201 |
| `claim-db.ts` | 372 |
| `settings-actions.ts` | 389 |
| `list-data.ts`, `archive-data.ts`, `search-data.ts`, `report-data.ts`, `claim-page-data.ts`, `queue-data.ts` | 87–241 |

ฟังก์ชันที่ยังอยู่ใน `actions.ts` (เลขบรรทัด ณ วันบันทึก):

| เรื่อง | ฟังก์ชัน |
|---|---|
| อ่านข้อมูล | `getClaims` (90) · `getPaidMonths` (172) · `getClaim` (209) · `getClaimLogs` (824) · `getJobEventsForSelect` (1074) |
| สร้าง / แก้ไข | `createClaim` (325) · `updateClaim` (556) |
| ไฟล์แนบ | `removeReceiptFile` (777) |
| ใบกำกับภาษี | `uploadTaxInvoice` (859) · `setTaxInvoiceEntries` (1013) |
| ต้นทุน | `recreateCostItemFromClaim` (1152) |
| ทดลองจ่าย | `settleAdvanceClaim` (1188) · `confirmRefundReceived` (1387) |
| เงินสดย่อย | `getOpenPettyCashFund` (1530) · `getPettyCashChildren` (1561) · `getPettyCashLedger` (1570) · `addPettyCashExpense` (1606) · `createPettyCashTopup` (1727) · `getLinkablePettyClaims` (1832) · `linkClaimToPettyCash` (1851) · `unlinkClaimFromPettyCash` (1955) · `closePettyCashMonth` (2018) · `reopenPettyCashMonth` (2179) |
| เข้าแฟ้ม | `markClaimsFiled` (2247) · `unmarkClaimFiled` (2303) |

## งานที่ต้องทำ

### 1. ชุดตรวจพฤติกรรมเดิมก่อนย้าย (ต้องทำก่อนข้ออื่น)

ขยาย `scripts/claim-lifecycle.check.ts` (เทคนิค golden เดียวกับ `scripts/claim-voucher.check.ts`) ให้ครอบคลุมทุกฟังก์ชันในตารางด้านบนที่เขียนข้อมูล — ค่าที่คืน, แถวใบเบิกหลังทำ, ประวัติ, activity, แจ้งเตือน, revalidate, รายการต้นทุน, การอัปโหลด/ลบไฟล์ · ต้องผ่านกับโค้ดปัจจุบันก่อนย้ายอะไร และหลังย้ายต้องได้ golden เดิมทุกไบต์โดยไม่บันทึกใหม่

### 2. แยก `actions.ts` ตามเรื่อง

| ไฟล์ใหม่ (`'use server'`) | ฟังก์ชัน |
|---|---|
| `claim-edit-actions.ts` | `createClaim`, `updateClaim`, `removeReceiptFile` |
| `tax-invoice-actions.ts` | `uploadTaxInvoice`, `setTaxInvoiceEntries` |
| `advance-actions.ts` | `settleAdvanceClaim`, `confirmRefundReceived` |
| `petty-cash-actions.ts` | ฟังก์ชันเงินสดย่อยทั้ง 10 ตัว |
| `filing-actions.ts` | `markClaimsFiled`, `unmarkClaimFiled` |
| `actions.ts` (เหลือ) | ฟังก์ชันอ่านข้อมูล + `recreateCostItemFromClaim` |

- ตัวช่วยที่ใช้ร่วมกัน (อัปโหลดไฟล์ทั้งชุด, ลบไฟล์ของคำขอที่ล้ม, ตรวจตัวเลข) ย้ายไป `claim-db.ts` หรือไฟล์ server-only ใหม่ — ไฟล์ `'use server'` ส่งออกได้เฉพาะฟังก์ชัน async และทุกตัวคือ endpoint ที่ใครก็เรียกได้ ต้องตรวจตัวตนก่อนเสมอ
- แก้ import ของหน้าจอทุกไฟล์ให้ชี้ไฟล์ใหม่ (ไม่ re-export จาก `actions.ts`)
- เป้า: `actions.ts` ไม่เกิน 500 บรรทัด · ไฟล์ใหม่แต่ละไฟล์ไม่เกิน 600 บรรทัด

### 3. การกระทำหนึ่งอย่าง ทางเดียว

- การจ่าย: `markAsPaid`, การจ่ายหลายใบ (`bulkClaimAction`) และ `adminOverrideStatus` ไปเป็น paid — ตรวจว่าใช้แกนเดียวกันทั้งหมด (ล็อกเอกสาร, รายการต้นทุน, แจ้งเตือน, ประวัติ)
- `settleAdvanceClaim` / `confirmRefundReceived` ใช้ตารางการเปลี่ยนสถานะกลาง (`claim-transitions.ts`) แทนรายการสถานะที่เขียนในตัวฟังก์ชัน
- `deleteClaim` ใน `lifecycle-actions.ts` ไม่มีหน้าจอไหนเรียกแล้ว (เปลี่ยนเป็นซ่อนใน v1.26.0) แต่ยังเป็น endpoint ที่แอดมินเรียกได้ — **ถามเจ้าของก่อน** ดูข้อ "เรื่องที่ต้องถามเจ้าของ" แล้วจึงลบหรือเก็บ

### 4. ข้อตกลงกับโมดูลอื่น (เขียนเป็นชุดตรวจก่อนย้ายไฟล์)

| ของส่วนใบเบิก | ใครใช้ |
|---|---|
| รูปแบบ `job_cost_items.notes` = `<เลขที่ใบเบิก>::<id ใบเบิก>` | ถูกอ่านอีก 4 ที่ในโมดูล Costs / ภาพรวม |
| `new/event-select-combobox.tsx` | หน้าเช็คอิน 3 หน้า |
| `settings/finance-settings-view.tsx` | หน้า `/settings` |
| `total_amount` ของใบเบิก | โมดูลภาพรวม |

### 5. ชนิดข้อมูลจากฐานข้อมูล

เจ้าของรันคำสั่งสร้างชนิดข้อมูล (ต้องมีโทเค็น Supabase ที่ใช้ได้):

```
npx supabase gen types typescript --project-id fvltuvcavuclcxbkialw --schema public > types/database.types.ts
```

แล้วให้ `ExpenseClaim` ใน `costs/types.ts` มาจากชนิดที่สร้าง (ตอนนี้เขียนมือ — เพิ่มคอลัมน์แล้วลืมแก้ระบบไม่เตือน)

## เรื่องที่ต้องถามเจ้าของ

1. **ใบเงินสดย่อยลบไม่ได้แล้ว** — ตั้งแต่ v1.26.0 การลบเปลี่ยนเป็นซ่อน และตามที่ตัดสินไว้ ใบเงินสดย่อยซ่อนไม่ได้ ผลคือรายจ่ายจากกล่องหรือใบเติมเงินที่บันทึกผิด ตอนนี้ไม่มีทางเอาออกจากหน้าจอเลย (เดิมแอดมินลบได้) — ต้องการให้ซ่อนได้ หรือให้มีปุ่มลบเฉพาะใบเงินสดย่อย หรือให้ยกเลิกแทน
2. เก็บ `deleteClaim` ไว้สำหรับข้อ 1 หรือลบทิ้ง

## งานเล็กที่พบระหว่างทาง (ทำพร้อมกันได้)

- `scripts/cleanup-storage.mjs` อ่านรายการไฟล์ด้วย `sb.schema('storage')` ซึ่งตอนนี้ตอบ "Invalid schema: storage" — ต้องเปลี่ยนไปใช้ Storage list API ก่อนใช้ครั้งถัดไป (สคริปต์นับสลิปคืนเงินและรูปย่อถูกแล้วตั้งแต่ v1.27.0)
- `docs/notification.md` ยังอธิบายการดึงแจ้งเตือนแบบเก่า (สองกระดิ่ง ทุก 30/15 วินาที) — ตอนนี้กระดิ่งเดียว ดึงทุก 30 วินาที (`components/notification-poll.ts`)
- `npx tsc --noEmit` ปกติใช้หน่วยความจำเกิน — ตอนนี้ต้องใช้ `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --incremental false` · หาสาเหตุ (น่าจะเป็นชนิดของ query builder ที่ซับซ้อนใน `claim-db.ts`)
- ใบเสร็จ 12 ไฟล์เป็น `.dng` (ไฟล์ดิบจากกล้อง) เบราว์เซอร์แสดงไม่ได้และทำรูปย่อไม่ได้ — พิจารณาแปลงเป็น JPEG ตอนอัปโหลด หรือปฏิเสธชนิดไฟล์นี้
- build log มีข้อความ `[purchasing] แผงเตือนหน้าแรกโหลดไม่สำเร็จ: Dynamic server usage` จาก `getPurchaseAlerts` (จับ error ของ Next ไว้เอง) — ไม่กระทบการใช้งาน แต่ทำให้ log รก

## เกณฑ์ตรวจเบื้องต้น (ให้ผู้วางแผนใช้ตั้งต้น)

- golden ของ `scripts/claim-lifecycle.check.ts` ที่ขยายแล้ว ผ่านกับโค้ดก่อนย้าย และไม่เปลี่ยนแม้แต่ไบต์เดียวหลังย้าย
- `actions.ts` ไม่เกิน 500 บรรทัด · ไฟล์ใหม่ไม่เกิน 600 บรรทัด · ทุกไฟล์ `'use server'` ส่งออกเฉพาะ async function และทุกฟังก์ชันตรวจตัวตนก่อนอ่าน/เขียน
- ชุดตรวจเดิมทั้งหมดผ่านโดยไม่แก้ assertion · `tsc` เหลือ error เดิมตัวเดียว (`checkupdate/check-update-view.tsx`) · eslint ไม่แย่ลงรายไฟล์ · `next build` ผ่าน
- ชุดตรวจข้อตกลงกับโมดูลอื่น (ข้อ 4) มีและผ่าน
- `finance-speed-baseline` ยังผ่าน (ขนาดข้อมูลและยอดเงินเท่าเดิม)
