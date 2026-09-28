# Spec: แก้ในแถวของหน้าสลิปให้ลื่น — `/salary/[slipId]`

สถานะ: `ready-for-agent` · ต่อยอด `docs/specs/salary-slip-daily-ui.md` · คำตัดสินของเจ้าของ 2026-09-28: ทำทั้ง A (ตัวเลขเปลี่ยนทันที) + B (ลดเวลารอที่ server) + C (ตัวบอกสถานะ)

---

## Problem Statement

admin ติ๊กหน้าที่ในแถวของสลิปแล้วต้องรอ 2–6 วินาทีกว่าค่าสตาฟและยอดรวมจะเปลี่ยน ระหว่างรอไม่มีอะไรบอกว่าระบบกำลังทำงาน งานกรอกสลิปทั้งงวด (หลายสิบใบ ใบละหลายแถว) จึงสะดุดทุกครั้งที่แก้

วัดด้วย `scripts/salary-edit-flow.check.ts` (server action จริง + ฐานข้อมูลจำลอง) — เส้นฐานก่อนแก้:

| | ค่า |
|---|---|
| คุยกับฐานข้อมูลต่อการแก้หนึ่งครั้ง | 29 ครั้ง |
| ต่อเนื่องกัน (ตัวกำหนดเวลารอ) | **22 รอบ** |
| ตรวจสิทธิ์ (`select profiles`) ซ้ำ | 5 ครั้ง |
| โหลดสลิปใบเดิมซ้ำ | 3 ครั้ง |
| หลัง action จบ | หน้าถูกวาดใหม่ 2 รอบ (รอบหนึ่งมากับคำตอบเพราะ `revalidatePath` อีกรอบจาก `router.refresh()` ฝั่ง client) |

ป้ายหน้าที่เปลี่ยนทันทีอยู่แล้ว (draft ในช่อง) แต่ช่องเงิน ยอดรวมวัน ยอดสุทธิ และงานค้าง รอ server

## Solution

1. **A — ตัวเลขเปลี่ยนทันที**: เบราว์เซอร์คำนวณสลิปใหม่ด้วย **เครื่องคำนวณตัวเดียวกับ server** (`compute.ts`) ทันทีที่ผู้ใช้ยืนยันการแก้ แล้วแสดงผลเลย server บันทึกและส่งผลจริงมาแทนที่ตามหลัง — ยอดที่บันทึกลงฐานข้อมูลมาจาก server เสมอ
2. **B — ลดเวลารอจริง**: ตัดงานซ้ำใน `editSlipCheckin` / `addSlipCheckin` และเลิกวาดหน้าซ้ำรอบที่สอง
3. **C — ตัวบอกสถานะ**: ระหว่างที่ server ยังไม่ยืนยัน หัวสลิปบอกว่ากำลังบันทึก และแถวที่แก้แสดงว่าตัวเลขยังรอยืนยัน

## กติกา (ล็อก)

| เรื่อง | กติกา |
|---|---|
| แหล่งความจริง | ผลจาก server เท่านั้นที่ถูกเขียนลง `salary_slips` — ผลฝั่ง client เป็นภาพตัวอย่าง ไม่ถูกส่งไปบันทึก |
| สูตร | client และ server เรียก `computeSlip` ตัวเดียวกัน และแปลงแถวเช็คอินเป็น input ด้วยฟังก์ชัน pure ตัวเดียวกัน (รวมกติกา ref-tag `[ref:closure\|jce:UUID]` ใน note) — ห้ามมีสูตรสองชุด |
| ผลต้องตรงกัน | ข้อมูลชุดเดียวกัน ภาพตัวอย่างต้องได้ `lines` / `warnings` / `total` เท่ากับที่ server คำนวณทุกประการ |
| บันทึกไม่สำเร็จ | คืนสลิปและแถวเช็คอินเป็นค่าก่อนแก้ + toast ข้อความ error + ช่องคืนค่าเดิม (พฤติกรรม toast/คืนค่าของช่องเดิมคงไว้) |
| แก้ซ้อนกันเร็วๆ | ผลจาก server ของคำขอที่เก่ากว่าต้องไม่ทับภาพของการแก้ที่ใหม่กว่า — ใช้ผลของคำขอล่าสุดเท่านั้น; ถ้าคำขอใดล้มเหลวขณะมีคำขออื่นค้างอยู่ ให้ `router.refresh()` เพื่อดึงของจริง |
| สิทธิ์ | ตรวจ admin ฝั่ง server **อย่างน้อยหนึ่งครั้งต่อ action ที่ export** ด้วย session ที่ยืนยันกับฐานข้อมูล — การลดงานซ้ำห้ามทำให้ action ใดที่ export ไม่ตรวจสิทธิ์ และห้าม export ฟังก์ชันที่ไม่ตรวจสิทธิ์จากไฟล์ `'use server'` |
| ร่องรอย | activity log เดิมครบทุกตัว: `UPDATE_CHECKIN_DUTIES`, `EDIT_SALARY_CHECKIN`, `COMPUTE_SALARY_SLIP` |
| ข้อมูลที่ส่งให้ client เพิ่ม | เวลาทำงาน + อัตรา OT ของเจ้าของสลิป + อัตราเบิ้ลต่างจังหวัด — **เฉพาะ admin** (เจ้าของสลิปที่ไม่ใช่ admin ไม่ได้รับ และไม่มีการแก้ในแถวอยู่แล้ว) |
| งบรอบฐานข้อมูล | `editSlipCheckin` ใช้ไม่เกิน **10 รอบต่อเนื่อง** ต่อการแก้หนึ่งครั้ง |

## Implementation Decisions

### A — ภาพตัวอย่างฝั่ง client
- `compute.ts` (pure): ย้าย/เพิ่มฟังก์ชันแปลงแถวเช็คอิน → `CheckinInput` (ตัวที่อยู่ใน `salary/actions.ts::toCheckinInput` + `REF_TAG_RE`) มาไว้ที่นี่แล้วให้ server ใช้ตัวเดียวกัน และเพิ่ม
  ```ts
  export interface SlipCalcInputs { work_start: string; work_end: string; ot_rate: number; oop_rate: number }
  export function previewSlip(input: {
    slip: { id: string; kind: RunKind; employment_type: EmploymentType; base_salary: number
            lines: SalaryLine[]; adjustments: SalaryAdjustment[]; period_start: string; period_end: string }
    checkins: PreviewCheckin[]        // แถวเช็คอินของหน้าสลิป (รวม note, paid_slip_id, event_name)
    duties: DutyInput[]
    calc: SlipCalcInputs
  }): { lines: SalaryLine[]; warnings: SalaryWarning[]; total: number }
  ```
  ภายในใช้ `selectCheckinsForRun` + `onsiteFromFor` + `computeSlip` โดยส่ง `previousLines = slip.lines` (ค่าที่แก้มือ/รันเนอร์ที่กรอกแล้วต้องคงอยู่) — `base_salary` ใช้ค่า snapshot ของสลิป
- `getSlipForView` (admin เท่านั้น) คืน `calc: SlipCalcInputs` เพิ่ม โดยดึงขนานกับ query เดิม (ไม่เพิ่มรอบต่อเนื่อง); ไม่มีโปรไฟล์เงินเดือน = `calc: null` → หน้าจอข้ามภาพตัวอย่าง (กลับไปรอ server แบบเดิม)
- หน้าสลิปเก็บ `checkins` เป็น state ที่ sync จาก props (แพตช์ทันทีตอนแก้ → ถูกแทนด้วยของ server เมื่อ props เปลี่ยน) เพื่อให้การจัดกลุ่มรายวันถูกแม้แก้เวลาจนเช็คอินย้ายวัน
- `use-slip-edits.ts::saveCheckin`: แพตช์เช็คอิน → `previewSlip` → `onSlipChange(ภาพตัวอย่าง)` → เรียก server → สำเร็จ = `onSlipChange(res.slip)`; ล้มเหลว = คืนค่าเดิม
- ใช้กับการแก้ทุกชนิดที่ผ่าน `saveCheckin`: หน้าที่, เวลาเข้า/ออก, ตจว., ประเภทเช็คอิน — การแก้อีเวนต์ไม่เปลี่ยนตัวเลข แต่เดินเส้นทางเดียวกันได้
- ponytail: แก้มือทับ (`overrideSlipLine`) / รันเนอร์ / รายการปรับมือ / เพิ่มเช็คอินที่ลืม **ไม่อยู่ในรอบนี้** — เป็น action เบากว่ามาก (ไม่คำนวณทั้งใบ) เพิ่มภาพตัวอย่างเมื่อมีคนบอกว่าหน่วง

### B — ลดงานซ้ำที่ server
- แยก "แกน" ที่ไม่ตรวจสิทธิ์ออกจาก action ที่ export: action ที่ export ตรวจ admin ครั้งเดียวแล้วเรียกแกน (`computeSlips` / `recomputeSlip` / `getSalarySettings` / `listDuties` ยังเป็น action ที่ export และยังตรวจสิทธิ์เองเมื่อถูกเรียกตรงจาก client)
- แกนที่ต้องใช้ข้ามไฟล์ให้อยู่ในโมดูลที่ **ไม่ใช่** `'use server'` (เช่น `salary/queries.ts`) — ห้าม export ฟังก์ชันไม่ตรวจสิทธิ์จากไฟล์ `'use server'`
- `editSlipCheckin`: โหลดสลิปครั้งเดียว · query ที่ไม่ขึ้นต่อกันยิงขนาน (`Promise.all`) · ไม่โหลดรายการเช็คอิน/หน้าที่/อีเวนต์ของหน้าเพจเพื่อทิ้ง (action คืนเฉพาะ `SlipDetail`) · เขียน log ขนานกับขั้นถัดไปได้ แต่ต้อง `await` ให้เสร็จก่อน action คืนค่า
- `addSlipCheckin` ใช้แกนเดียวกัน
- การเขียน `staff_checkins` ยังผ่าน `adminEditCheckin` / `adminCheckIn` / `adminUpdateCheckinEvent` ของโมดูลเช็คอิน (validation + log + ref-tag อยู่ที่นั่น) — ไม่แก้พฤติกรรมของ action เหล่านั้น
- client: เลิก `router.refresh()` หลังบันทึก **สำเร็จ** ใน `use-slip-edits.ts` (action เรียก `revalidatePath` อยู่แล้ว Next ส่งหน้าใหม่มากับคำตอบ) — คง `router.refresh()` ไว้ในกรณีล้มเหลว

### C — ตัวบอกสถานะ
- หัวสลิป (`slip-header.tsx`): ระหว่างมีคำขอค้าง แสดงไอคอนหมุน + "กำลังบันทึก…" ด้วย `role="status"` / `aria-live="polite"`; ปุ่ม "ปิดงวด" กดไม่ได้ระหว่างนั้น (กันปิดงวดด้วยตัวเลขที่ยังไม่ยืนยัน)
- แถววันที่กำลังรอ (ตารางเดสก์ท็อป + การ์ดมือถือ): ช่องเงินของวันนั้นจางลงและมี `aria-busy="true"` จนกว่าจะยืนยัน
- ไม่ใช้สีอย่างเดียวบอกสถานะ (มีข้อความ/ไอคอนคู่เสมอ) · เคารพ `prefers-reduced-motion` (ใช้ `motion-safe:` กับแอนิเมชัน)

## Testing Decisions

- `scripts/salary-edit-flow.check.ts` (มีแล้ว — ห้ามลดความเข้มของ assertion เดิม):
  - ตั้งค่าเริ่มต้นของ `MAX_SEQUENTIAL_ROUNDS` เป็น `10`
  - เพิ่ม: เรียก `previewSlip` ด้วยข้อมูลชุดเดียวกับที่ server เห็นหลังแก้ แล้ว `deepEqual` กับ `lines` / `warnings` / `total` ของสลิปที่ server คืน
  - เพิ่ม: กรณีแก้เวลาออก และกรณีติ๊ก ตจว. — ผลภาพตัวอย่างต้องเท่ากับ server เช่นกัน
- `scripts/salary-check.ts` เดิมต้องผ่านครบ (เครื่องคำนวณไม่เปลี่ยนพฤติกรรม)
- UI: `npx tsc --noEmit` + eslint + smoke render โดย Critic

## Acceptance Criteria (lock)

| id | เกณฑ์ | วิธีตรวจ |
|---|---|---|
| AC1 | `npx tsc --noEmit` ได้ 13 error เท่า baseline ไม่มีในไฟล์ที่แก้/สร้าง | รันคำสั่ง |
| AC2 | `npx tsx scripts/salary-check.ts` ผ่านครบเหมือนก่อนแก้ | รันคำสั่ง |
| AC3 | `npx tsx scripts/salary-edit-flow.check.ts` ผ่าน โดยงบเริ่มต้น 10 รอบ และ assertion เดิมอยู่ครบ (ยอดสุทธิ 17,799 · ค่าที่แก้มือ 999 คงอยู่ · log 2 ชนิด · หน้าที่ไม่มีอยู่ถูกปฏิเสธ · ไม่ใช่ admin ถูกปฏิเสธ) | รันคำสั่ง + diff |
| AC4 | สคริปต์เดียวกันยืนยันว่า `previewSlip` ได้ผลเท่ากับ server ใน 3 กรณี (หน้าที่ / เวลาออก / ตจว.) | รันคำสั่ง + อ่านโค้ด |
| AC5 | การแปลงเช็คอิน → `CheckinInput` และ `REF_TAG_RE` มีที่เดียวใน `compute.ts` และ server ใช้ตัวนั้น (ไม่มีสำเนาใน `actions.ts`) | grep |
| AC6 | ทุกฟังก์ชันที่ export จากไฟล์ `'use server'` ของโมดูลเงินเดือนยังตรวจสิทธิ์ (`requireAdmin` / `getSession`) ก่อนอ่านหรือเขียนข้อมูล; แกนที่ไม่ตรวจสิทธิ์อยู่ในไฟล์ที่ไม่ใช่ `'use server'` หรือไม่ถูก export | อ่านโค้ด + grep |
| AC7 | `getSlipForView` คืน `calc` เฉพาะเมื่อผู้เรียกเป็น admin; เจ้าของสลิปได้ `calc: null` | อ่านโค้ด |
| AC8 | `use-slip-edits.ts::saveCheckin` แสดงภาพตัวอย่างก่อนเรียก server, แทนด้วยผล server เมื่อสำเร็จ, คืนค่าเดิมเมื่อล้มเหลว, ไม่ให้คำตอบเก่าทับการแก้ใหม่, และไม่เรียก `router.refresh()` ในกรณีสำเร็จ | อ่านโค้ด |
| AC9 | หัวสลิปมีสถานะ "กำลังบันทึก…" (`role="status"`) และปุ่มปิดงวดถูกปิดระหว่างรอ; แถว/การ์ดของวันที่รอมี `aria-busy` | อ่านโค้ด + smoke render |
| AC10 | activity log ครบ 3 ชนิดหลังแก้หนึ่งครั้ง และ `adminEditCheckin` / `adminCheckIn` / `adminUpdateCheckinEvent` ไม่ถูกแก้พฤติกรรม | สคริปต์ + git diff |
| AC11 | eslint บนไฟล์ที่แก้/สร้าง: ไม่มี error ใหม่เทียบกับก่อนแก้ | รันคำสั่ง |
| AC12 | `UPDATES[0]` เป็น entry ใหม่ภาษาผู้ใช้; `package.json` = `1.19.0` | อ่าน |

`pass_threshold`: 0.85

## Out of Scope

- ภาพตัวอย่างสำหรับแก้มือทับ / รันเนอร์ / รายการปรับมือ / เพิ่มเช็คอินที่ลืม
- เปลี่ยนจังหวะบันทึกของช่องหน้าที่ (ยังบันทึกเมื่อปิดหน้าต่างเลือก)
- ลดงานของ `proxy.ts` และ layout ต่อคำขอ
- แก้ `adminEditCheckin` ให้เบาลง

## Further Notes

- **สิ่งที่ user ต้องทำเอง**: ทดสอบในเบราว์เซอร์จริงก่อน deploy — แก้หน้าที่/เวลา/ตจว. แล้วดูว่า (1) ตัวเลขเปลี่ยนทันที (2) ไม่ขยับอีกครั้งตอน server ตอบ (3) แถวเช็คอินในตารางยังตรงกับของจริงหลังบันทึก (ยืนยันว่าการเลิก `router.refresh()` ไม่ทำให้ข้อมูลค้าง)
- ไม่มี migration
