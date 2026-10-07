# แผน refactor UI "การ์ด CRM" (การ์ดลูกค้า / อีเวนต์ / การเงิน) — 2026-10-08

สถานะ: **เสร็จ v1.53.0 (2026-10-08)** — Executor (Opus) 1 รอบ · Critic ผ่าน AC1–AC10 ครบ (`{"pass": true, "score": 1.0}`) · branch `feature/crm-card-unify` · เจ้าของตอบ Q1–Q4 = ใช้ค่าเริ่มต้นทั้งหมด · ยังไม่ได้เปิดดูในเบราว์เซอร์

สิ่งที่เบี่ยงจากแผน (ยอมรับ): การ์ด 3 ใบแตะเพิ่ม 1–2 บรรทัดต่อไฟล์ (`badge` passthrough) · แท็กในหน้า CRM ย้ายเป็น state `tags` ของ `lead-detail` (กดยกเลิกแก้การ์ดไม่รีเซ็ตแท็กแล้ว ซึ่งแท็กบันทึกทันทีที่กดอยู่แล้ว) · ผลพลอยได้: `jobs/actions.ts` หาย 2 error เดิม (`any` ใน `getCrmLeadForJob`) · ค้างนอกขอบเขต: `job-detail.tsx` ยังใช้ `confirm()` เปล่าสำหรับลบ/เก็บใบงาน (ของเดิม)

ผลเฟส 0 (2026-10-08): baseline A/B/C.html อยู่ที่ scratchpad `crm-card/before` · `getCrmLeadForJob` มีผู้เรียกเดียวคือ `jobs/[id]/page.tsx` → ลบได้ · `updateLead` revalidate แค่ `/crm` และ `/crm/<id>` → หน้าใบงานส่ง `onSaved={router.refresh}` (คงพฤติกรรมเดิม) · lint `crm/` = 1 error / 25 warning · `job-detail.tsx` = 3 / 17 · tsc = 1 error เดิม · ชุดตรวจ render มีชุด A–E อยู่แล้ว (E = CustomerCard แก้ไข) ชุดใหม่ของหน้าใบงานใช้ชื่อ **F**

## 0. ขอบเขตและสมมติฐาน

"การ์ด CRM" ในแผนนี้ = การ์ดข้อมูลของ lead ที่พับได้และแก้ไขในที่ (ลูกค้า · อีเวนต์ · การเงิน) พร้อมโครงหัวการ์ด/ช่องกรอก/แถวแสดงผล ซึ่งตอนนี้มี **2 สำเนา**:

| ที่ | ไฟล์ | สถานะ |
|---|---|---|
| ต้นฉบับ `/crm/[id]` | `crm/[id]/shared.tsx` (โครง) + `crm/[id]/components/{customer,event,financial}-card.tsx` (เนื้อหา) + state/handler ใน `crm/[id]/lead-detail.tsx` | มีชุดตรวจ `scripts/crm-lead-detail-render.check.ts` เทียบ HTML ได้ทุกไบต์ |
| สำเนา `/jobs/[id]` | `jobs/[id]/job-detail.tsx` บรรทัด 93–191 (`CrmCard`, `InfoRow`, `CrmEditField`, `CrmEditSelect`) + 291–392 (ฟอร์ม/บันทึก/ยกเลิก) + 719–1120 (การ์ด 4 ใบ: ทีมงาน, ลูกค้า, อีเวนต์, การเงิน) | ไม่มีชุดตรวจ · lint 3 error / 17 warning (เดิม) |

ไม่รวม: การ์ดบนบอร์ด kanban (`crm/components/kanban-board.tsx::KanbanCard`) และการ์ดสรุปต้นทุน/อีเวนต์ที่ผูก (`cost-summary-card`, `linked-events-card`) — คนละชิ้น คนละปัญหา

## 1. สิ่งที่พบ (อ่านโค้ดจริง 2026-10-08)

1. **โครงการ์ดซ้ำทุกบรรทัด** — `CrmCard` ในหน้าใบงานคือ `CollapsibleCardHeader` + `Card` ของ CRM ที่คัดลอกมา ต่างกันแค่ (ก) มี badge "CRM" ในหัวการ์ด (ข) state พับ/กางอยู่ในตัวการ์ดและ **พับเป็นค่าเริ่มต้น** (CRM กางเป็นค่าเริ่มต้น) · `InfoRow`/`CrmEditField`/`CrmEditSelect` เหมือน `shared.tsx` ทุกตัว
2. **ฟอร์มและการบันทึกซ้ำ** — `crmForm` 18 ฟิลด์ถูกเขียนซ้ำ 2 รอบ (ตอนตั้งต้นและตอนยกเลิก) ส่วน CRM ใช้ `buildLeadForm()` ที่เดียว · หน้าใบงานบันทึกแล้ว `router.refresh()` ส่วน CRM พึ่ง `revalidatePath` จาก action
3. **เนื้อหาการ์ดเดินคนละทางแล้ว (drift)** — หน้าใบงานขาด:
   - ลูกค้า: ประเภทงาน (`work_type`), จำนวนตู้ (`unit_count`), และ **PackagePicker** (เฟส 6 ของอุปกรณ์เปลี่ยนเป็นข้อความ + ลิงก์ไปหน้าติดตามงานแทน เพราะ dropdown เดิมว่างหลัง migration)
   - อีเวนต์: เวลาเริ่ม/จบ (`event_time`, `event_end_time`) และตำแหน่งที่ต้องการ (`required_roles`)
   - การเงิน: แก้งวดชำระไม่ได้ อัปโหลดสลิปไม่ได้ · สูตรภาษีและกล่อง "ยอดค้างชำระ" ถูกคัดลอกทั้งก้อน (CRM มี `calcTax`, `TaxSummary`, `OutstandingBalance` แยกแล้ว)
   - ข้อความ: หน้าใบงานใช้ `locale === 'th' ? … : …` ทุกจุด ส่วน CRM ใช้ `t.crm.detail`
4. **บั๊กจริง: การ์ด "ทีมงาน & หน้าที่" ในหน้าใบงานบันทึกไม่ได้** — เพิ่ม/ลบพนักงานแล้วส่ง `staff_assignments` ไป `updateLead` ซึ่ง **ไม่อ่านฟิลด์นี้แล้ว** (ทีมงานอยู่ที่ `event_staff` ต่ออีเวนต์ตั้งแต่ CRM refactor) → UI เปลี่ยนชั่วคราว แล้วหายหลัง `router.refresh()` · หน้า CRM ใช้ `StaffCard` อ่านอย่างเดียวจัดกลุ่มตามอีเวนต์ + ลิงก์ไปแก้ที่อีเวนต์
5. **โหลดข้อมูลซ้ำ** — `jobs/actions.ts::getCrmLeadForJob` query `crm_leads`, `crm_lead_installments`, `crm_settings` เองอีกชุด ทั้งที่ `crm/actions.ts` มี `getLead`, `getLeadInstallments`, `getCrmSettings`, `getLeadEventStaff` และ `packages/capacity-data.ts::loadPickerContext` อยู่แล้ว (หน้า `crm/[id]/page.tsx` ใช้ชุดนี้)

## 2. เป้าหมาย

- การ์ด CRM มี **ที่เดียว** และหน้าใบงานใช้ตัวเดียวกับหน้า CRM → ฟีเจอร์ที่เพิ่มในการ์ด (แพ็กเกจ, เวลา, งวด, สลิป) โผล่ทั้งสองหน้าโดยอัตโนมัติ
- HTML ของ `/crm/[id]` **ไม่เปลี่ยนแม้แต่ไบต์เดียว** (ชุดตรวจ A/B/C/D เทียบก่อน/หลัง)
- `job-detail.tsx` เล็กลงราว 450 บรรทัด และหน้าใบงานได้ความสามารถที่หายไปกลับมา (ข้อ 3) + แก้บั๊กข้อ 4

## 3. แนวทาง (เล็กที่สุดที่ได้ผล)

ไม่สร้าง design system ใหม่ ไม่ย้ายไป `components/` — แค่ "ยกก้อนที่มีอยู่ขึ้นมาหนึ่งชั้น":

```
crm/[id]/lead-cards.tsx  (ใหม่ 'use client' ≤ 250 บรรทัด)
  LeadCards({ lead, settings, installments, packagePicker?, badge?, defaultCollapsed?, onSaved? })
    = state ฟอร์ม (buildLeadForm) + งวด + สลิป + editingCard/collapsed
    + handleSaveCard / handleCancelCardEdit / handlePackagesSaved / handleUploadProof / handleDeleteProof
    + render <CustomerCard/> <EventCard/> <FinancialCard/>  (ย้ายจาก lead-detail.tsx ทั้งก้อน ไม่แก้ตัวการ์ด)
```

- `lead-detail.tsx` เรียก `<LeadCards …/>` แทนบล็อกเดิม (ยังเป็นเจ้าของ header / status / tags / staff / timeline) — เหลือ ≤ 330 บรรทัด
- `shared.tsx::CollapsibleCardHeader` เพิ่ม prop `badge?: ReactNode` (ไม่ส่ง = ไม่ render อะไรเพิ่ม → HTML หน้า CRM เท่าเดิม) ให้หน้าใบงานส่ง badge "CRM" ได้เหมือนเดิม
- `LeadCards` รับ `defaultCollapsed` เพื่อให้หน้าใบงานพับเป็นค่าเริ่มต้นเหมือนเดิม (CRM ไม่ส่ง = กาง)
- หน้าใบงาน: `jobs/[id]/page.tsx` โหลดด้วย loader ของ CRM (`getLead`, `getLeadInstallments`, `getCrmSettings`, `getLeadEventStaff`, `loadPickerContext`, `canEditLeadPackages` + `requireAuth`) แล้วส่ง `<LeadCards badge="CRM" defaultCollapsed …/>` และ `<StaffCard/>` ของ CRM แทนการ์ดทีมงานที่บันทึกไม่ได้ · ลบ `CrmCard`/`InfoRow`/`CrmEditField`/`CrmEditSelect`/`crmForm`/`handleSaveCrmCard`/`handleCancelCrmEdit`/`CrmCardEditActions`/state ทีมงาน ออกจาก `job-detail.tsx` · `getCrmLeadForJob` ลบถ้าไม่มีผู้เรียกอื่น (ตรวจด้วย grep ในเฟส 0)
- หลังบันทึกจากหน้าใบงาน: ถ้า `updateLead` revalidate แล้วหน้า `/jobs/[id]` รีเฟรชเอง (ตรวจเฟส 0) ไม่ต้องทำอะไร · ถ้าไม่ ให้ `LeadCards` รับ `onSaved` แล้วหน้าใบงานส่ง `router.refresh` — ห้ามใส่ `router.refresh()` ในตัว `LeadCards`
- ข้อความทั้งหมดได้ `t.crm.detail` ฟรีจากการ์ดเดิม (หน้าใบงานเลิกใช้ ternary ในส่วนนี้)

ponytail: ไม่แตะ `KanbanCard` · ไม่แตะ `cost-summary-card`/`linked-events-card` · ไม่เปลี่ยนรูปแบบ props ของ 3 การ์ด (`EditableCardProps`) · ไม่ย้ายไป `components/` จนกว่าจะมีหน้าที่สามใช้

## 4. ลำดับงาน (ทำบน branch เดียว 2 commit, bump เลขเดียว)

### เฟส 0 — ตรึง baseline (ไม่แก้โค้ด)
1. `npx tsx scripts/crm-lead-detail-render.check.ts <dir>/before` → เก็บ A/B/C/D.html
2. บันทึก lint: `crm/` (1 error / 43 warning เดิม), `jobs/[id]/job-detail.tsx` (3 / 17) · `npx tsc --noEmit --incremental false` = 1 error เดิม (`check-update-view.tsx`)
3. grep ผู้เรียก `getCrmLeadForJob` และ `staff_assignments` นอก `job-detail.tsx`
4. อ่าน `crm/actions.ts::updateLead` ดูรายการ `revalidatePath` → ตัดสินใจเรื่อง `onSaved` (ข้อ 3)

### เฟส 1 — แยก `LeadCards` ออกจาก `lead-detail.tsx` (HTML ต้องเท่าเดิม)
5. สร้าง `crm/[id]/lead-cards.tsx` ย้าย state/handler/JSX ของ 3 การ์ด (บรรทัด 56–61, 70–73, 80–88, 119–168, 337–390, 423–449 ของ `lead-detail.tsx`) — ย้ายอย่างเดียว ไม่เปลี่ยน class/ลำดับ element
6. `lead-detail.tsx` ใช้ `<LeadCards/>`; `displayName` ของ header ที่เดิมอ่าน `form.customer_name` ตอนกำลังแก้ → `LeadCards` รับ `onCustomerNameDraft?: (name) => void` หรือย้าย `LeadHeader` เข้าไปด้วย (เลือกทางที่ HTML ไม่เปลี่ยน; แนะนำ callback)
7. เพิ่ม `badge?` ใน `CollapsibleCardHeader` (ไม่ส่ง = ไม่ render)
8. รันชุดตรวจ → `cmp` A/B/C ก่อน/หลังต้องเท่ากันทุกไบต์ (D/E ตรวจด้วย assert ในสคริปต์) · เพิ่มชุด **F** ใน `scripts/crm-lead-detail-render.check.ts`: render `LeadCards` แบบหน้าใบงาน (`badge` = Badge "CRM", `defaultCollapsed`) ต้องมีคำว่า `CRM` 3 ครั้งและไม่มีเนื้อหาการ์ด (พับอยู่) · render แบบกางต้องมีแพ็กเกจ/เวลาเริ่ม/ตำแหน่งที่ต้องการ/งวด

### เฟส 2 — หน้าใบงานใช้ของจริง
9. `jobs/[id]/page.tsx`: โหลดด้วย loader ของ CRM + picker + สิทธิ์ (เหมือน `crm/[id]/page.tsx` บรรทัด 26–47) · ส่ง `leadCards` props ให้ `JobDetail`
10. `job-detail.tsx`: แทนบล็อก 719–1120 ด้วย `<StaffCard/>` + `<LeadCards badge="CRM" defaultCollapsed …/>` · ลบโครง/ฟอร์ม/handler สำเนาทั้งหมด (ข้อ 1–2) · ลบ import ที่ไม่ใช้แล้ว
11. `jobs/actions.ts`: ลบ `getCrmLeadForJob` ถ้าไม่มีผู้เรียกอื่น (ไม่มี = ลบ)
12. What's New บนสุด (`ปรับปรุง` · โมดูล "ใบงาน"): "การ์ด CRM ในหน้าใบงานเหมือนหน้า CRM แล้ว: เลือกแพ็กเกจ แก้เวลา/ตำแหน่งที่ต้องการ แก้งวดและแนบสลิปได้จากหน้าใบงาน · ทีมงานแสดงตามอีเวนต์ (แก้ที่อีเวนต์)" · bump 1.53.0

## 5. เกณฑ์รับงาน (lock)

```json
{
  "plan": ["เฟส 0 baseline", "เฟส 1 แยก LeadCards + badge prop + ชุด E", "เฟส 2 job page ใช้ LeadCards/StaffCard + ลบสำเนา + What's New + bump"],
  "acceptance_criteria": [
    {"id": "AC1", "check": "npx tsx scripts/crm-lead-detail-render.check.ts <dir> ผ่าน และ cmp A/B/C/D.html ก่อน/หลัง เท่ากันทุกไบต์"},
    {"id": "AC2", "check": "grep -c 'function CrmCard\\|function InfoRow\\|function CrmEditField\\|function CrmEditSelect\\|crmForm\\|handleSaveCrmCard\\|staff_assignments' app/(authenticated)/jobs/[id]/job-detail.tsx = 0"},
    {"id": "AC3", "check": "wc -l: job-detail.tsx ≤ 1,050 · lead-detail.tsx ≤ 330 · lead-cards.tsx ≤ 250"},
    {"id": "AC4", "check": "ชุด F ใน crm-lead-detail-render.check.ts: render LeadCards แบบหน้าใบงาน (badge CRM + defaultCollapsed) มีข้อความ 'CRM' ครบ 3 หัวการ์ด และไม่มีเนื้อหาการ์ด (ชื่อลูกค้า/ราคา) ถูก render; render แบบกาง (ไม่ส่ง defaultCollapsed) มีป้ายแพ็กเกจ เวลาเริ่ม ตำแหน่งที่ต้องการ และงวดชำระ ตามคีย์ t.crm.detail"},
    {"id": "AC5", "check": "jobs/[id]/page.tsx import getLead/getLeadInstallments/getCrmSettings/getLeadEventStaff จาก crm/actions และ loadPickerContext + canEditLeadPackages จาก packages/* · ไม่ import getCrmLeadForJob · grep getCrmLeadForJob ทั้ง repo = 0 (หรือมีผู้เรียกอื่นและระบุไว้)"},
    {"id": "AC6", "check": "job-detail.tsx render <StaffCard> ของ crm/[id]/components และไม่มี Select เลือกพนักงาน/หน้าที่ในส่วน CRM อีก"},
    {"id": "AC7", "check": "grep 'router.refresh' app/(authenticated)/crm/[id]/lead-cards.tsx = 0 · grep 'window.confirm\\|window.alert' ในไฟล์ที่แตะ = 0"},
    {"id": "AC8", "check": "npx tsc --noEmit --incremental false = 1 error เดิมเท่านั้น · eslint crm/ ไม่เพิ่ม (≤ 1 error / ≤ 25 warning) · eslint job-detail.tsx ≤ 3 error / ≤ 17 warning"},
    {"id": "AC9", "check": "ชุดตรวจที่ import crm/[id] หรือ packages ผ่านทั้งหมด: crm-lead-detail-render, crm-leads-load, package-picker-render, packages-render"},
    {"id": "AC10", "check": "package.json = 1.53.0 · whats-new/updates.ts UPDATES[0].date = วันที่ ship จริง (รัน date ก่อน), tag 'ปรับปรุง', ไม่มีศัพท์เทคนิค"}
  ],
  "pass_threshold": 0.9
}
```

## 6. คำถามถึงเจ้าของ (ค่าเริ่มต้นถ้าไม่ตอบ)

| # | คำถาม | ค่าเริ่มต้น |
|---|---|---|
| Q1 | การ์ดทีมงานในหน้าใบงาน เปลี่ยนเป็นอ่านอย่างเดียวตามอีเวนต์ (เหมือนหน้า CRM) ได้ไหม | **ได้** — ตอนนี้บันทึกไม่ได้อยู่แล้ว (ข้อ 1.4) |
| Q2 | เก็บ badge "CRM" บนหัวการ์ดในหน้าใบงาน | **เก็บ** |
| Q3 | หน้าใบงานให้การ์ดพับเป็นค่าเริ่มต้นเหมือนเดิม | **พับ** |
| Q4 | หน้าใบงานเลือกแพ็กเกจได้ (สิทธิ์เดียวกับหน้า CRM: แอดมิน / ฝ่ายประสานงาน / ผู้สร้างการ์ด) | **ได้** |

## 7. ความเสี่ยง

- `job-detail.tsx` ใช้ React Compiler (`reactCompiler: true`) และ `useTransition`; `LeadCards` ใช้ `saving` state ของตัวเอง — ไม่ผสมกัน
- `revalidatePath` ของ `updateLead` อาจไม่ครอบ `/jobs/[id]` → ตรวจเฟส 0 ก่อนตัดสินใจเรื่อง `onSaved` (ห้ามเดา)
- หน้า CRM ส่ง `displayName` ให้ header ตอนกำลังแก้ชื่อ — ถ้าย้าย state ฟอร์มออกต้องส่ง draft กลับ (ข้อ 4.6) มิฉะนั้นชุด D/ชื่อหัวจะต่าง
- ชุดตรวจ `crm-lead-detail-render.check.ts` ดัก `../actions` ด้วย `Module._load` — `lead-cards.tsx` ต้อง import actions ด้วย path เดิม (`'../actions'` จากโฟลเดอร์ `crm/[id]`) ให้ตัวดักจับได้
- lint ของ `job-detail.tsx` 3 error เดิมอาจอยู่ในโค้ดที่ลบ → จำนวนลดได้ แต่ห้ามเพิ่ม
