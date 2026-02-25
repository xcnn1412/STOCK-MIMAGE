# 📋 CRM System — Implementation Plan

## ImageAutomat Photobooth CRM

---

## 🎯 เป้าหมาย

ระบบ CRM สำหรับติดตามลูกค้าตั้งแต่ติดต่อเข้ามาจนถึงเปิดอีเวนต์
**ใช้งานง่าย — มีเพียง 2 หน้าหลัก + 1 dialog**

---

## 📊 Flow ระบบ (จากภาพ)

```
กรอกข้อมูลลูกค้า → จองอีเวนต์ → ติดตามลูกค้า
                                      ├── ตอบรับบริการ → เปิดอีเวนต์ ✅
                                      └── ไม่ตอบรับ → ติดตาม/ทวงถาม → ยกเลิก ❌
```

### Status Flow:

```
new → contacted → quoted → followed_up → confirmed → event_created
                                  ↓
                              cancelled
```

| Status        | TH           | สี         | คำอธิบาย                              |
| ------------- | ------------ | ---------- | ------------------------------------- |
| `new`         | ลูกค้าใหม่   | 🔵 Blue    | ลูกค้าติดต่อเข้ามาแต่ยังไม่ได้ตอบกลับ |
| `contacted`   | ติดต่อแล้ว   | 🟡 Amber   | ติดต่อกลับลูกค้าแล้ว                  |
| `quoted`      | เสนอราคาแล้ว | 🟣 Purple  | ส่งใบเสนอราคาแล้ว รอตอบกลับ           |
| `followed_up` | ติดตามแล้ว   | 🟠 Orange  | ติดตาม/ทวงถามแล้ว รอตอบกลับ           |
| `confirmed`   | ยืนยันงาน    | 🟢 Emerald | ลูกค้าตอบรับบริการ — พร้อมเปิดอีเวนต์ |
| `cancelled`   | ยกเลิก       | 🔴 Red     | ลูกค้าไม่ตอบรับ/ยกเลิก                |

---

## 🗄️ Database Schema

### ตาราง `crm_leads` (ข้อมูลลูกค้า)

| Column            | Type                      | คำอธิบาย                                                               |
| ----------------- | ------------------------- | ---------------------------------------------------------------------- |
| `id`              | uuid PK                   |                                                                        |
| `created_at`      | timestamptz               | วันที่กรอกข้อมูล                                                       |
| `created_by`      | uuid FK → profiles        | ผู้ที่กรอก                                                             |
| `status`          | text                      | สถานะ (new/contacted/quoted/followed_up/confirmed/cancelled)           |
| **ข้อมูลลูกค้า**  |                           |                                                                        |
| `customer_name`   | text                      | ชื่อลูกค้า / ชื่อที่ระบุในใบเสนอราคา                                   |
| `customer_line`   | text                      | ชื่อไลน์ลูกค้า                                                         |
| `customer_phone`  | text                      | เบอร์โทร (optional)                                                    |
| `customer_type`   | text                      | ประเภทลูกค้า (individual/corporate/wedding/school/government)          |
| `lead_source`     | text                      | ลูกค้ามาจากช่องทางไหน (LINE/Facebook/Instagram/Website/Referral/Other) |
| **ข้อมูลงาน**     |                           |                                                                        |
| `event_date`      | date                      | วันที่อีเวนต์                                                          |
| `event_end_date`  | date                      | วันที่สิ้นสุดงาน (nullable)                                            |
| `event_location`  | text                      | สถานที่จัดงาน                                                          |
| `event_details`   | text                      | รายละเอียดงาน                                                          |
| **ข้อมูลการเงิน** |                           |                                                                        |
| `package_name`    | text                      | แพ็คเกจที่ขาย                                                          |
| `quoted_price`    | numeric                   | ราคาที่เสนอ (ใบเสนอราคา)                                               |
| `confirmed_price` | numeric                   | ยอดยืนยัน                                                              |
| `quotation_ref`   | text                      | เลขอ้างอิงใบเสนอราคา (Peak.com)                                        |
| **อื่นๆ**         |                           |                                                                        |
| `notes`           | text                      | หมายเหตุ                                                               |
| `assigned_to`     | text                      | พนักงานขาย / ผู้ดูแล                                                   |
| `event_id`        | uuid FK → job_cost_events | เชื่อมไปอีเวนต์ (เมื่อเปิดอีเวนต์แล้ว)                                 |
| `updated_at`      | timestamptz               | อัปเดตล่าสุด                                                           |

### ตาราง `crm_activities` (บันทึกการติดตาม)

| Column          | Type                | คำอธิบาย                                            |
| --------------- | ------------------- | --------------------------------------------------- |
| `id`            | uuid PK             |                                                     |
| `lead_id`       | uuid FK → crm_leads |                                                     |
| `created_at`    | timestamptz         | วัน/เวลาที่บันทึก                                   |
| `created_by`    | uuid FK → profiles  | ผู้บันทึก                                           |
| `activity_type` | text                | ประเภท (call/line/email/meeting/note/status_change) |
| `description`   | text                | รายละเอียด                                          |
| `old_status`    | text                | สถานะเดิม (สำหรับ status_change)                    |
| `new_status`    | text                | สถานะใหม่ (สำหรับ status_change)                    |

---

## 📱 หน้าจอ (เพียง 2 หน้า + 1 dialog)

### หน้า 1: `/crm` — CRM Dashboard (หน้าหลัก)

```
┌─────────────────────────────────────────────────────────┐
│  📋 CRM ติดตามลูกค้า                    [+ เพิ่มลูกค้า] │
│                                                         │
│  🔍 ค้นหา...        [สถานะ ▼]  [ช่องทาง ▼]  [เดือน ▼]  │
│                                                         │
│  ── สถานะสรุป ──────────────────────────────────────── │
│  🔵 ใหม่: 5  🟡 ติดต่อ: 3  🟣 เสนอราคา: 8             │
│  🟠 ติดตาม: 2  🟢 ยืนยัน: 12  🔴 ยกเลิก: 4            │
│                                                         │
│  ── รายการลูกค้า ──────────────────────────────────── │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🟣 K.สมชาย (LINE: somchai99)                   │    │
│  │ 📅 28 ก.พ. 2569 · 📍 สมาคมธรรมศาสตร์          │    │
│  │ 📦 Premium Package · ฿25,000                    │    │
│  │ ช่องทาง: LINE · ผู้ดูแล: Manow                  │    │
│  │ อัปเดตล่าสุด: 2 วันที่แล้ว                       │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 🔵 บริษัท ABC (LINE: abc_corp)                  │    │
│  │ 📅 15 มี.ค. 2569 · 📍 Central World            │    │
│  │ รอเสนอราคา                                      │    │
│  │ ช่องทาง: Facebook · ผู้ดูแล: Jessica             │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- ฟิลเตอร์ตามสถานะ, ช่องทาง, เดือน
- ค้นหาตามชื่อ/LINE
- สรุปจำนวนตามสถานะ (status pills)
- คลิกเข้าหน้ารายละเอียด

### หน้า 2: `/crm/[id]` — รายละเอียดลูกค้า

```
┌─────────────────────────────────────────────────────────┐
│  ← กลับ                                                │
│                                                         │
│  ── ข้อมูลลูกค้า ─────────────── [สถานะ: 🟣 เสนอราคา] │
│  ┌──────────────────┬──────────────────────────────┐    │
│  │ ชื่อลูกค้า       │ K.สมชาย                      │    │
│  │ ชื่อไลน์         │ somchai99                    │    │
│  │ ประเภทลูกค้า     │ 🏢 บริษัท                    │    │
│  │ ช่องทาง          │ LINE                         │    │
│  │ ผู้ดูแล           │ Manow                        │    │
│  └──────────────────┴──────────────────────────────┘    │
│                                                         │
│  ── ข้อมูลงาน ──────────────────────────────────────── │
│  ┌──────────────────┬──────────────────────────────┐    │
│  │ วันที่อีเวนต์     │ 28 ก.พ. 2569                │    │
│  │ สถานที่           │ สมาคมธรรมศาสตร์              │    │
│  │ แพ็คเกจ          │ Premium Package              │    │
│  │ ราคาเสนอ         │ ฿25,000                      │    │
│  │ ยอดยืนยัน        │ ฿23,000                      │    │
│  │ อ้างอิง Peak     │ QT-2569-0045                 │    │
│  └──────────────────┴──────────────────────────────┘    │
│                                                         │
│  ── เปลี่ยนสถานะ ──────────────────────────────────── │
│  [ติดต่อแล้ว] [เสนอราคา] [ยืนยัน ✅] [ยกเลิก ❌]       │
│                                                         │
│  ── บันทึกการติดตาม (Timeline) ──────────────────────── │
│  ┌─────────────────────────────────────────────────┐    │
│  │ + เพิ่มบันทึก                                    │    │
│  │ [📞 โทร] [💬 LINE] [📧 Email] [📝 หมายเหตุ]     │    │
│  │ [                                            ]   │    │
│  │ [บันทึก]                                         │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  📝 25 ก.พ. 14:30 — Manow (💬 LINE)                   │
│     "ส่งใบเสนอราคาแล้ว รอลูกค้าตอบกลับ"               │
│                                                         │
│  📝 24 ก.พ. 10:00 — Jessica (📞 โทร)                   │
│     "ลูกค้าสนใจ ขอรายละเอียดเพิ่มเติม"                 │
│                                                         │
│  🔄 24 ก.พ. 09:45 — สถานะเปลี่ยน: ใหม่ → ติดต่อแล้ว    │
│                                                         │
│  ── Actions ──────────────────────────────────────────  │
│  [🎉 เปิดอีเวนต์] ← เมื่อ status = confirmed          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- ดูข้อมูลลูกค้า + งานทั้งหมด
- เปลี่ยนสถานะได้ทันที (status buttons)
- บันทึกการติดตาม (Timeline)
- ปุ่ม "เปิดอีเวนต์" เมื่อยืนยันงาน → สร้าง Event ใน Costs module อัตโนมัติ

### Dialog: เพิ่มลูกค้าใหม่

```
┌───────────────────────────────────────────┐
│  เพิ่มลูกค้าใหม่                      ✕  │
│                                           │
│  ── ข้อมูลลูกค้า ──                       │
│  ชื่อลูกค้า *      [                   ]  │
│  ชื่อไลน์          [                   ]  │
│  เบอร์โทร          [                   ]  │
│  ประเภทลูกค้า      [บุคคลทั่วไป     ▼]  │
│  ช่องทาง           [LINE            ▼]  │
│                                           │
│  ── ข้อมูลงาน ──                          │
│  วันที่อีเวนต์ *    [📅              ]  │
│  วันสิ้นสุด         [📅              ]  │
│  สถานที่            [                   ]  │
│  แพ็คเกจ           [                   ]  │
│  ราคาเสนอ          [          0      ]  │
│                                           │
│  ── อื่นๆ ──                              │
│  ผู้ดูแล            [เลือกพนักงาน  ▼]  │
│  อ้างอิง Peak      [                   ]  │
│  หมายเหตุ          [                   ]  │
│                                           │
│             [ยกเลิก]  [เพิ่มลูกค้า]       │
└───────────────────────────────────────────┘
```

---

## 🔗 Integration กับระบบอื่น

### 1. CRM → Events (เมื่อยืนยันงาน)

เมื่อกด "เปิดอีเวนต์" จะ:

- สร้าง `job_cost_events` อัตโนมัติจากข้อมูล CRM
- อัปเดต `crm_leads.event_id` เชื่อมไปยัง event ที่สร้าง
- Revenue = `confirmed_price`
- Event details ก็อปจาก CRM lead

### 2. CRM → Activity Log

- ทุกการเปลี่ยนสถานะ → บันทึก `crm_activities`
- ทุก action → บันทึก `logActivity` (system log)

---

## 📁 File Structure

```
app/(authenticated)/crm/
├── layout.tsx              # CRM layout
├── page.tsx                # Server component — fetch leads
├── crm-dashboard-view.tsx  # Client component — Dashboard + List
├── [id]/
│   ├── page.tsx            # Server component — fetch lead + activities
│   └── crm-detail-view.tsx # Client component — Detail + Timeline
├── components/
│   ├── lead-card.tsx       # Card สำหรับแสดง lead ในรายการ
│   ├── lead-form-dialog.tsx # Dialog เพิ่ม/แก้ไขลูกค้า
│   ├── status-badge.tsx    # Badge สถานะ
│   ├── activity-timeline.tsx # Timeline การติดตาม
│   └── status-summary.tsx  # สรุปจำนวนตามสถานะ
└── actions.ts              # Server actions (CRUD + status change)
```

---

## 🗂️ Dropdown Options

### ประเภทลูกค้า (customer_type)

| value        | TH                   | EN         |
| ------------ | -------------------- | ---------- |
| `individual` | บุคคลทั่วไป          | Individual |
| `corporate`  | บริษัท/องค์กร        | Corporate  |
| `wedding`    | งานแต่งงาน           | Wedding    |
| `school`     | โรงเรียน/มหาวิทยาลัย | School     |
| `government` | หน่วยงานราชการ       | Government |
| `other`      | อื่นๆ                | Other      |

### ช่องทาง (lead_source)

| value       | TH           | EN        |
| ----------- | ------------ | --------- |
| `line`      | LINE         | LINE      |
| `facebook`  | Facebook     | Facebook  |
| `instagram` | Instagram    | Instagram |
| `website`   | เว็บไซต์     | Website   |
| `referral`  | แนะนำ/บอกต่อ | Referral  |
| `phone`     | โทรศัพท์     | Phone     |
| `walk_in`   | Walk-in      | Walk-in   |
| `other`     | อื่นๆ        | Other     |

### แพ็คเกจ (package_name) — from database/

| value      | ชื่อ              |
| ---------- | ----------------- |
| `basic`    | Basic Package     |
| `standard` | Standard Package  |
| `premium`  | Premium Package   |
| `custom`   | Custom (กำหนดเอง) |

---

## 📋 ขั้นตอนการพัฒนา

### Phase 1: Database + Schema (15 นาที)

- [ ] สร้าง migration: `crm_leads` + `crm_activities` tables
- [ ] เพิ่ม types ใน `database.types.ts`
- [ ] เพิ่ม ActionType สำหรับ CRM ใน `lib/logger.ts`

### Phase 2: Server Actions (20 นาที)

- [ ] `createLead()` — เพิ่มลูกค้าใหม่
- [ ] `updateLead()` — แก้ไขข้อมูลลูกค้า
- [ ] `updateLeadStatus()` — เปลี่ยนสถานะ + บันทึก activity
- [ ] `deleteLead()` — ลบ lead
- [ ] `createActivity()` — เพิ่มบันทึกการติดตาม
- [ ] `createEventFromLead()` — เปิดอีเวนต์จาก CRM

### Phase 3: CRM Dashboard (30 นาที)

- [ ] Layout + Navigation tab
- [ ] Status summary pills
- [ ] Lead list with filters
- [ ] Lead card component
- [ ] Add lead dialog

### Phase 4: CRM Detail View (30 นาที)

- [ ] Customer info display
- [ ] Event info display
- [ ] Status change buttons
- [ ] Activity timeline
- [ ] Add activity form
- [ ] "เปิดอีเวนต์" button

### Phase 5: Polish + Integration (15 นาที)

- [ ] i18n (EN/TH)
- [ ] Responsive design
- [ ] Log activity for all actions
- [ ] Add CRM to navbar/layout

---

## ⏱ ประมาณเวลา: ~2 ชั่วโมง
