# แผนปรับ flow ฝ่ายอุปกรณ์ — ประเภทอุปกรณ์ → แพ็กเกจ → ใบจัดของ → รับ/คืนของ → แดชบอร์ดการใช้งาน

สถานะ: **ร่างแผน 2026-10-07** รอเจ้าของตัดสินคำถามในหัวข้อ 10 · ยังไม่ได้เขียนโค้ด · main = v1.46.0
ที่มา: แนวคิดจากเจ้าของ (ภาพ Package Booth / ประเภทอุปกรณ์ / อุปกรณ์ / กระเป๋า) + สำรวจโค้ดปัจจุบัน 4 ส่วน (สต็อก-กระเป๋า, ชั้นวาง-เช็คอิน, ติดตามงาน-CRM, แดชบอร์ด-แจ้งเตือน-สิทธิ์)

## 0. สรุปสั้น

- **ไม่สร้างระบบใหม่ซ้อนของเดิม** — "กระเป๋า" คือตาราง `kits` ที่มีอยู่แล้ว, "ตำแหน่งบนชั้น" คือ `shelves`, "จอง/ชน" คือ `event_kits` + `kitBookingClashes`, "ทีม" คือ `profiles.department` ผ่าน `job_settings`, "หน้าที่จัดกระเป๋า" ในพูลงานคือ `lead_duty_claims.duty='kits'` — ทั้งหมดใช้ต่อ เปลี่ยนป้ายและต่อยอด
- ของใหม่จริงๆ มี 4 ก้อน: **ประเภทอุปกรณ์** (ตารางแทน free text), **แพ็กเกจ** (ประเภท × จำนวน × ตัวเลือกอุปกรณ์), **ใบจัดของ** (ต่ออีเวนต์ เดินสถานะ เลือกของ → หยิบ → พร้อมรับ → ออกงาน → คืนแล้ว → คืนชั้นแล้ว) และ **จุดรับของ** (QR)
- ปล่อยเป็น 6 เฟส แต่ละเฟสใช้งานได้เองและไม่พังของเดิม (v1.47 → v1.52) · flow กระเป๋าเดิมยังใช้ได้กับอีเวนต์ที่ไม่มีใบจัดของจนกว่าจะถอดในเฟสสุดท้าย
- คำเตือน "อุปกรณ์อาจไม่พอ" ให้ทีมขายเป็น **คำเตือนอย่างเดียว ไม่บล็อก** ตามที่เจ้าของระบุ และตามนโยบายเดิมของระบบ (กระเป๋าชน = เตือน)

## 1. ของที่มีอยู่แล้วและจะใช้ต่อ

| แนวคิดในแผน | ของเดิมในระบบ | ใช้ต่ออย่างไร |
|---|---|---|
| อุปกรณ์ 1 ชิ้น | `items` (1 แถว = 1 ชิ้น, `status` enum, `shelf_id`, `category` text) | เพิ่ม `category_id` — ของเดิมไม่เปลี่ยน |
| ตู้ / แบบประกอบ | ไม่มี — "ตู้" ในโค้ดตอนนี้มีแต่ `crm_leads.unit_count` (จำนวนตู้ที่ขาย) และ `shelf_racks` (ตู้ชั้นวาง) | ตู้แต่ละชนิด = **ประเภทอุปกรณ์หนึ่งประเภท** (เช่น "ตู้ประกอบ") ชุดที่มีจริงเป็นอุปกรณ์ในประเภทนั้น (ตู้ประกอบ ชุด 1, ชุด 2 — ตอนนี้มี 2 ชุด) · แบบประกอบและ "ทีมขายเลือกชิ้นเอง" เป็นคอลัมน์ของประเภท ตั้งได้ในตั้งค่าคลัง ไม่มีตารางใหม่ (หัวข้อ 2, 3.1, 4.1) |
| กระเป๋า | `kits` + `kit_contents` + QR `/kits/<id>/check` (นำออก/รับคืนรายชิ้น) | กระเป๋าคือ "หน่วยอุปกรณ์" หนึ่งหน่วย เพิ่ม `category_id` ให้กระเป๋าเข้าประเภทได้ (เช่น "กระเป๋าอุปกรณ์") |
| จองกระเป๋าให้อีเวนต์ / ชน | `event_kits` (ADR-0003) + `kitBookingClashes` (ดูเวลา เตือนไม่บล็อก) | บรรทัดกระเป๋าในใบจัดของ **เขียน `event_kits` ให้อัตโนมัติ** → เลนกระเป๋าบนไทม์ไลน์, หน้ากระเป๋า "งานที่จอง", QR กระเป๋า ทำงานต่อโดยไม่แก้ · กติกาชนขยายไปใช้กับอุปกรณ์เดี่ยว |
| "จัดครบ" ของกระเป๋า | `packState` ใน `shelves/consumable-logic.ts` + `event_kits.packed_at` | "หยิบกระเป๋า" ในใบจัดของ = นำออกทุกชิ้นที่ใช้ได้ (ใช้ `checkoutItems` เดิม) แล้ว `packed_at` ถูกตั้งเอง |
| ตำแหน่งเก็บ | `shelf_rooms → shelf_racks → shelves` + QR `/shelves/<id>` + ตรวจนับ | ใบจัดของเรียงบรรทัดตาม ห้อง → ตู้ → ระดับชั้น ให้เดินหยิบเป็นเส้นทาง · "คืนชั้น" ติ๊กตามชั้นบ้านเดิม (`shelf_id` ไม่เปลี่ยนตอนออกงาน — เหมือนเดิม) |
| หน้าที่เตรียมงาน "จัดกระเป๋า" | `lead_duty_claims.duty='kits'`, แท็บในพูล, แผนก `pool_duty_kits` | เปลี่ยนป้ายเป็น **"จัดของ"** key เดิม ไม่แก้ schema · ทีมจัดของ = แผนกใหม่ "ทีมจัดของ" ตั้งใน /jobs/settings |
| ความพร้อมข้อ 5 "กระเป๋า" | `isMissingKits(KitReadiness)` ใน `tracking-logic.ts` | เปลี่ยนเป็นอ่านสถานะใบจัดของ ป้าย "จัดของ" · waiver `skip_kits` ("ไม่ต้องจัด") ใช้ต่อ |
| ปิดงาน / คืนของ | `/events/[id]/return` → `processEventReturn` (สถานะรายชิ้น, วัสดุสิ้นเปลืองที่ใช้ไป, รูป ≤15, `event_closures`) | ขั้น "คืนของ" ของทีมหน้างานเรียก core เดิมในโหมด "ยังไม่แตะสถานะอุปกรณ์" (สถานะไปตั้งตอนคืนชั้น) |
| บอร์ดวันงาน | `/jobs` kanban `status_onsite`: awaiting_claim → preparing → loading → onsite → teardown → done (ชุด/ลำดับแก้ได้ใน /jobs/settings), hook เช็คอิน → `onsite` | เพิ่ม hook: **รับของ → `loading` (ขนของ)** แบบเดียวกับ hook เช็คอิน · คืนของ/ปิดงาน → done (มีอยู่แล้ว) |
| แจ้งเตือน | `createNotifications` + กระดิ่ง + แผงเตือนสดบน dashboard (`components/dashboard-alerts`) | กระดิ่ง 3 ชนิดใหม่ · แผง "อุปกรณ์อาจไม่พอ" คำนวณสดแบบ `duty-warnings.ts` |
| สถิติ/ถ้วย | `/reports` (`report-stats.ts` pure + `data.ts`), `ChampionsStrip`, `Top3Grid` เฟรม PNG ใน `public/profile frame/` | เพิ่ม StatKind `packing` (นักจัดของ) และ `restock` (นักคืนของ) · แดชบอร์ดการใช้งานเป็นหน้าใหม่ใต้สต็อก |
| QR | `react-qr-code`, `QrSheetView` (รับพารามิเตอร์แล้ว), เปิดด้วยกล้องมือถือตรงๆ ไม่มี scanner ในแอป | จุดรับของพิมพ์ QR ด้วย `QrSheetView` ค่า = `<origin>/pickup/<id>` |
| รูปถ่าย | bucket `checkin-photos` / `event_closures` / `item-images`, `compressImage` ใน `lib/utils.ts` | bucket ใหม่ `packing-photos` (migration แบบ `20260317_create_checkin_photos_bucket.sql`) |

สิ่งที่ **ไม่มี** ในระบบตอนนี้ (ต้องสร้าง): ตารางประเภทอุปกรณ์ (ตอนนี้ `items.category` เป็น text + `CategorySelector` hardcode 5 ค่า), แพ็กเกจฝั่งอุปกรณ์ (CRM มี `crm_leads.package_name` จาก `crm_settings` category `package` — เป็น "ระบบที่ใช้บริการ" ของฝ่ายขาย ไม่ผูกอุปกรณ์), ใบจัดของ, จุดรับของ/จุดพักของ (grep `staging|pickup|จุดรับ` = 0), เช็กลิสต์รับ-คืนของในเช็คอิน (0), การนับชั่วโมงใช้งานอุปกรณ์ (0)

## 2. ศัพท์ (เติมลง CONTEXT.md หมวดใหม่ "อุปกรณ์ (Equipment)" ตอน ship แต่ละเฟส)

- **ประเภทอุปกรณ์ (Equipment category)**: กลุ่มของอุปกรณ์ที่ใช้แทนกันได้ในแพ็กเกจ เช่น คอมพิวเตอร์, กล้อง, อุปกรณ์ไฟฟ้า, ปริ้นเตอร์, กระเป๋าอุปกรณ์ · ทั้งอุปกรณ์เดี่ยวและกระเป๋าอยู่ในประเภทได้ · _Avoid_: หมวด, category (เดี่ยวๆ ชนกับหมวดค่าใช้จ่าย), ชนิด
- **หน่วยอุปกรณ์ (Equipment unit)**: สิ่งที่หยิบออกจากชั้นเป็นหนึ่งหน่วย = อุปกรณ์เดี่ยว 1 ชิ้น หรือกระเป๋า 1 ใบ (ของข้างในไปทั้งใบ) · อุปกรณ์ที่อยู่ในกระเป๋าไม่ใช่หน่วยของตัวเอง
- **แพ็กเกจ (Package)**: สิ่งที่ขายให้ลูกค้าหนึ่งชุด เช่น selfie studio booth, 360DSLR, Slip Photobooth — กำหนดด้วย **ข้อกำหนด** รายประเภท · _Avoid_: บูธ (ใช้เรียกของจริงหน้างาน), ระบบที่ใช้บริการ (ชื่อช่องเดิมใน CRM — ดูคำถาม Q3)
- **ข้อกำหนด (Requirement)**: บรรทัดหนึ่งของแพ็กเกจ = ประเภท × จำนวนที่ต้องใช้ (ค่าเริ่มต้น 1)
- **ตัวเลือกอุปกรณ์ (Allowed units)**: หน่วยอุปกรณ์ที่ใช้กับข้อกำหนดนั้นได้ (เลือกได้หลายหน่วย) · **ไม่เลือกเลย = ทุกหน่วยในประเภทนั้นใช้ได้**
- **ตู้ (Booth)**: โครงบูธของจริง · ตู้แต่ละ**ชนิด**เป็นประเภทอุปกรณ์หนึ่งประเภท (ตู้ประกอบ, selfie studio booth, ตู้ Slip) และตู้แต่ละ**ชุด**ที่มีจริงเป็นอุปกรณ์เดี่ยว 1 ชิ้นในประเภทนั้น (ตู้ประกอบ ชุด 1, ชุด 2) — เพิ่มชุดที่ 3 = เพิ่มอุปกรณ์อีกชิ้นในประเภท · ประเภทตู้ติ๊ก **ทีมขายเลือกชิ้นเอง** เพราะลูกค้าเลือกหน้าตา ต่างจากประเภทอื่นที่ทีมจัดของเลือก · _Avoid_: บูธ (ใช้เรียกงานหน้างานทั้งชุด), ตู้ชั้นวาง (ศัพท์โมดูลชั้น), model/รุ่น (ถ้าหมายถึงตู้คนละชุด ให้เป็นอุปกรณ์คนละชิ้น)
- **แบบประกอบ (Variant)**: รายการชื่อแบบที่ตู้ชนิดนั้นประกอบได้ ตั้งที่ประเภท เช่น ตู้ประกอบ → ประกอบ 1 / ประกอบ 2 / ประกอบ 3 · เป็น **ป้ายบอก** ทีมจัดของและทีมหน้างานว่างานนี้ประกอบแบบไหน ไม่บังคับเลือก ไม่มีชิ้นส่วนต่างกัน คืนตู้ทั้งชุดเหมือนกันทุกแบบ (เจ้าของยืนยัน 2026-10-07) · ตู้ชุดหนึ่งออกงานได้แบบเดียวต่อครั้ง และเมื่อถูกเลือกไปงานหนึ่งแล้ว งานที่เวลาทับใช้ชุดนั้นไม่ได้ไม่ว่าแบบไหน **โดยอัตโนมัติ** เพราะเป็นของชิ้นเดียวกัน (ไม่มีกฎพิเศษ)
- **ประเภทที่ทีมขายเลือกชิ้นเอง (Sales-picked category)**: ประเภทที่ติ๊กไว้ในตั้งค่าคลัง (ประเภทตู้ทุกชนิด) — ชิ้น (และแบบประกอบถ้ามี) ถูกเลือกตอนเลือกแพ็กเกจ ล็อกไว้ในใบจัดของ (ทีมจัดของเปลี่ยนไม่ได้ ต้องให้ทีมขาย/แอดมินเปลี่ยน) และคำเตือนอุปกรณ์อาจไม่พอของประเภทนี้เป็นแบบ **แน่นอนรายชิ้น** ไม่ใช่ประมาณการ
- **แพ็กเกจของงาน (Job packages)**: แพ็กเกจที่ทีมขายเลือกให้งานหนึ่งงาน (เลือกได้หลายแพ็กเกจ ระบุจำนวนชุด) พร้อมชิ้นของประเภทที่ทีมขายเลือกชิ้นเอง — เป็นต้นทางของใบจัดของ
- **อุปกรณ์อาจไม่พอ (Capacity warning)**: คำเตือนที่คำนวณสดเมื่อเลือกแพ็กเกจให้งาน ว่าประเภทไหนมีหน่วยที่ใช้ได้น้อยกว่าความต้องการรวมของงานที่เวลาทับกัน · เตือนอย่างเดียว ไม่ห้ามขาย เพราะของจริงถูกเลือกโดยทีมจัดของ
- **ใบจัดของ (Packing list)**: รายการหน่วยอุปกรณ์ที่ทีมจัดของเลือกให้อีเวนต์หนึ่ง ตามแพ็กเกจของงาน (เพิ่มของเสริมนอกแพ็กเกจได้) หนึ่งอีเวนต์มีใบเดียว เดินสถานะ **เลือกของ → กำลังหยิบ → พร้อมรับ → ออกงาน → คืนแล้ว → คืนชั้นแล้ว** · _Avoid_: ใบเบิก (ศัพท์การเงิน), checklist, ใบจอง
- **หยิบของ (Pick)**: ติ๊กว่าหยิบหน่วยนั้นลงจากชั้นแล้ว → สถานะอุปกรณ์เป็น "ออกงาน" (`in_use`) ทันที (กระเป๋า = นำออกทุกชิ้นที่ใช้ได้) · หยิบได้เฉพาะหน่วยที่สถานะใช้ได้
- **ยืนยันจัดของ (Confirm packing)**: หยิบครบทุกบรรทัด + ถ่ายรูปชุดที่จัดเสร็จอย่างน้อย 1 รูป + ระบุจุดรับของ → ใบเป็น "พร้อมรับ" และงานผ่านความพร้อมข้อ "จัดของ"
- **จุดรับของ (Pickup spot)**: ตำแหน่งในออฟฟิศที่วางของที่จัดเสร็จ มี QR ของตัวเอง สแกนเพื่อรับของและคืนของ · _Avoid_: ชั้น (ชั้นคือที่เก็บถาวร), จุดพัก, staging
- **รับของ (Hand over)**: ทีมหน้างานสแกน QR จุดรับของ ติ๊กทุกบรรทัดขณะขึ้นรถ แล้วยืนยัน → ใบเป็น "ออกงาน" และใบงานหน้างานขยับเป็น "ขนของ" · _Avoid_: เช็คอินรับของ (เช็คอินเป็นเรื่องค่าสตาฟ ไม่ผูกกัน)
- **คืนของ (Return)**: ทีมหน้างานสแกน QR จุดเดิม ติ๊กทุกบรรทัดพร้อมสภาพ (ใช้ได้/เสียหาย/ซ่อม/หาย) กรอกวัสดุสิ้นเปลืองที่ใช้ไป → ใบเป็น "คืนแล้ว" และอีเวนต์ปิด (ดู Q7)
- **คืนชั้น (Restock)**: ทีมจัดของนำของจากจุดรับของกลับขึ้นชั้นบ้านเดิมทีละบรรทัด → สถานะอุปกรณ์ตั้งตามสภาพที่บันทึกตอนคืน → ใบเป็น "คืนชั้นแล้ว" = จบกระบวนการ
- **ทีมจัดของ (Packing team)**: แผนกใน `profiles.department` ที่ถูกตั้งเป็นผู้รับหน้าที่ "จัดของ" ใน /jobs/settings (ค่าใหม่ "ทีมจัดของ" ใน `lib/departments.ts`)
- **ชั่วโมงใช้งาน (Usage hours)**: ของหน่วยอุปกรณ์ = เวลาตั้งแต่รับของจนคืนของ รวมทุกใบจัดของ (ใบที่ไม่มีเวลาทั้งสองใช้ช่วงเวลาอีเวนต์แทน) · **จำนวนครั้งใช้งาน** = จำนวนใบจัดของที่หน่วยนั้นออกงานจริง (ถึงขั้นรับของ)

## 3. โมเดลข้อมูล (4 migration ใหม่ ใน `supabase/migrations/`)

`types/database.types.ts` ล้าสมัย (ไม่มี event_kits/shelves/job_settings) → ตารางใหม่ใช้ type เขียนมือใน `packages/types.ts`, `packing/types.ts` + `.overrideTypes<T>()` แบบ CRM

### 3.1 `20261010_equipment_categories.sql` (เฟส 1)

```
equipment_categories  id uuid PK · name text UNIQUE NOT NULL · sort_order int default 0 · is_active bool default true
                      sales_pick bool default false   (ทีมขายเลือกชิ้นเอง — ประเภทตู้ทุกชนิด = true)
                      variants text[] default '{}'    (แบบประกอบ เช่น {ประกอบ 1, ประกอบ 2, ประกอบ 3} · ว่าง = ไม่มีแบบ · ใช้ร่วมกันทุกชุดในประเภท)
                      created_at
items.category_id     uuid → equipment_categories ON DELETE SET NULL   (คอลัมน์ items.category text เก็บไว้อ่านอย่างเดียวจนเฟส 6)
kits.category_id      uuid → equipment_categories ON DELETE SET NULL
backfill              INSERT ชื่อประเภทจาก DISTINCT items.category ที่ไม่ว่าง → UPDATE items.category_id ตามชื่อ (รันซ้ำได้)
```

ไม่ใส่ flag "ประเภทกระเป๋า" — ประเภทไหนก็ใส่ได้ทั้งอุปกรณ์เดี่ยวและกระเป๋า (YAGNI; ถ้าอยากให้ฟอร์มกระเป๋าเห็นเฉพาะบางประเภทค่อยเพิ่ม `is_bag`)

### 3.2 `20261011_packages.sql` (เฟส 2)

```
packages              id · name text UNIQUE NOT NULL · description · price numeric (null ได้ — ใช้เติมราคาเสนอใน CRM แทน crm_settings.price เดิม) · sort_order · is_active bool default true · created_by · created_at · updated_at
package_requirements  id · package_id → packages CASCADE · category_id → equipment_categories RESTRICT · quantity int ≥1 default 1 · note · sort_order
                      UNIQUE (package_id, category_id)
package_options       id · requirement_id → package_requirements CASCADE · item_id → items CASCADE (null ได้) · kit_id → kits CASCADE (null ได้)
                      CHECK ((item_id IS NULL) <> (kit_id IS NULL)) · UNIQUE (requirement_id, item_id) · UNIQUE (requirement_id, kit_id)
lead_packages         id · lead_id → crm_leads CASCADE · package_id → packages RESTRICT · quantity int ≥1 default 1 · note · created_by · created_at
                      UNIQUE (lead_id, package_id)
lead_package_units    id · lead_package_id → lead_packages CASCADE · requirement_id → package_requirements CASCADE
                      item_id → items SET NULL / kit_id → kits SET NULL (อย่างใดอย่างหนึ่ง) · variant text (null ได้; ถ้าใส่ต้องเป็นค่าหนึ่งใน variants ของประเภทของชิ้นนั้น) · created_at
                      UNIQUE (lead_package_id, requirement_id, item_id) · UNIQUE (lead_package_id, requirement_id, kit_id)
```

กติกาในโค้ด: ตัวเลือกห้ามเป็นอุปกรณ์ที่อยู่ใน `kit_contents` (ของในกระเป๋าไปกับกระเป๋า) · ลบแพ็กเกจที่มี `lead_packages` ของงานที่ยังไม่ปิด = ห้าม (ปิดใช้งานแทน) · `lead_package_units` มีได้เฉพาะข้อกำหนดที่ประเภทติ๊ก `sales_pick` และจำนวนแถว ≤ `quantity × lead_packages.quantity` · ชิ้นเดียวกันซ้ำในงานเดียวไม่ได้ (unique ข้างบน) จึงเลือก "ประกอบ 1" และ "ประกอบ 2" ของตู้ชุดเดียวกันให้งานเดียวกันไม่ได้โดยปริยาย

### 3.3 `20261012_packing_lists.sql` (เฟส 3–4)

```
pickup_spots          id · name text NOT NULL · code text UNIQUE NOT NULL · note · is_active bool default true · sort_order · created_at
packing_lists         id · event_id → events CASCADE UNIQUE · lead_id → crm_leads SET NULL
                      status text CHECK IN ('selecting','picking','ready','out','returned','done') default 'selecting'
                      packed_at/packed_by (ยืนยันจัดของ) · photo_urls jsonb default '[]' · spot_id → pickup_spots SET NULL
                      handed_over_at/handed_over_by · returned_at/returned_by · return_note · return_photo_urls jsonb
                      restocked_at/restocked_by · created_by · created_at · updated_at
packing_list_items    id · list_id → packing_lists CASCADE · package_id → packages SET NULL · category_id → equipment_categories SET NULL
                      (ทั้งคู่ null = ของเสริมนอกแพ็กเกจ)
                      item_id → items SET NULL · kit_id → kits SET NULL · CHECK (อย่างใดอย่างหนึ่ง)
                      variant text (แบบประกอบที่ต้องประกอบ — คัดลอกจาก lead_package_units) · locked bool default false (ทีมขายเลือกชิ้นเอง ทีมจัดของเปลี่ยนไม่ได้)
                      picked_at/picked_by · handed_over_at · returned_at · return_condition text CHECK IN ('available','damaged','maintenance','lost') · return_note
                      restocked_at/restocked_by · created_at
                      UNIQUE (list_id, item_id) · UNIQUE (list_id, kit_id) · index (item_id), (kit_id), (list_id)
bucket packing-photos public · 5MB · jpeg/png/webp · path {listId}/{uuid}.jpg
```

สถานะใบเก็บเป็นคอลัมน์ (ไม่คำนวณจาก timestamp) เพื่อให้คิวงาน/แดชบอร์ดกรองได้ตรงๆ · timestamp รายบรรทัดเป็นหลักฐาน

### 3.4 `20261013_notifications_packing.sql` (เฟส 3)

เพิ่ม `reference_type` `packing_list` ใน CHECK ของ `notifications` (migration ล่าสุดที่แก้ CHECK นี้คือ `20260828_notifications_allow_salary_slip.sql`) — หรือเลี่ยงด้วยการอ้าง `crm_lead` แล้ว deep-link ไปแท็บจัดของ (ไม่ต้องมี migration — ดูเฟส 3)

## 4. ขั้นตอนการทำงานใหม่ทั้งเส้น

### 4.1 ตั้งค่าครั้งเดียว (แอดมิน / ผู้ดูแลอุปกรณ์)

1. `/stock/settings` แท็บ **ประเภทอุปกรณ์**: เพิ่ม/เปลี่ยนชื่อ/เรียง/ปิดใช้ · ลบได้เมื่อไม่มีอุปกรณ์หรือข้อกำหนดอ้างถึง · ต่อประเภทมีช่อง "ทีมขายเลือกชิ้นเอง" และ "แบบประกอบ" (รายการชื่อ เพิ่ม/ลบ/เรียงได้) · แถวประเภทแสดงจำนวนชิ้นในประเภทและปุ่ม "เพิ่มอุปกรณ์ในประเภทนี้" → `/items/new?category=<id>` · **ตู้ประกอบ** ตั้งเป็นประเภท "ตู้ประกอบ" ติ๊กทีมขายเลือกชิ้นเอง แบบประกอบ = ประกอบ 1/2/3 แล้วเพิ่มอุปกรณ์ "ตู้ประกอบ ชุด 1" และ "ชุด 2" (ชุดที่ 3 ในอนาคต = เพิ่มอุปกรณ์อีกชิ้น ไม่ต้องตั้งค่าอื่น)
2. `/items/[id]` และ `/items/new`: ช่องประเภทเป็น dropdown จากตาราง (แทน `CategorySelector` hardcode) · `/items` กรองตามประเภทได้ · `/kits/[id]`: เลือกประเภทของกระเป๋า
3. `/packages`: สร้างแพ็กเกจ → เพิ่มข้อกำหนด (ประเภท, จำนวน) → ต่อข้อกำหนดเลือกตัวเลือกอุปกรณ์ (รายการหน่วยในประเภทนั้น ติ๊กได้หลายหน่วย ค้นหาได้) · ปุ่ม "คัดลอกแพ็กเกจ" ไว้ทำ model 2/3 จาก model 1
4. `/stock/settings` แท็บ **จุดรับของ**: ตั้งชื่อ/รหัส (เช่น "จุดรับของ A") · ปุ่ม "พิมพ์ QR ทั้งหมด" (A4 ด้วย `QrSheetView`)
5. `/jobs/settings` แท็บทีมของพูลงาน: หน้าที่ "จัดของ" (เดิม "จัดกระเป๋า") และ "แผนกที่ดูแลอุปกรณ์" (เดิม `pool_kit_departments`) ตั้งเป็น "ทีมจัดของ" · `/users` เลือกแผนก "ทีมจัดของ" ให้คนในทีม

### 4.2 ทีมขายเลือกแพ็กเกจให้งาน

- ที่ไหน: คอลัมน์/ช่องใหม่ **"แพ็กเกจ"** ในตารางภาพรวม `/jobs/tracking` **และ** การ์ดข้อมูลอีเวนต์ในหน้า lead `/crm/[id]` (component เดียวกัน `PackagePicker`) — เลือกได้ตั้งแต่ยังเป็นใบเสนอราคา ไม่ต้องรอตอบรับ
- ใคร: แอดมิน, ฝ่ายประสานงาน, ผู้สร้างการ์ด (ทีมขาย) — กติกาเดียวกับการแก้การ์ด CRM
- เลือกแพ็กเกจ (หลายรายการ + จำนวนชุด) → action `setLeadPackages(leadId, [{packageId, quantity}])` → บันทึก `lead_packages` → คืน `{ warnings: CapacityWarning[] }` → แสดงกล่องเหลือง/แดงใต้ช่องทันที (หัวข้อ 5) · log `SET_LEAD_PACKAGES`
- ถ้างานตอบรับแล้ว (มีใบงานหน้างาน) → แจ้งเตือนกระดิ่ง `packing_requested` ถึงทีมจัดของ · ถ้ายังไม่ตอบรับ → ไม่แจ้ง (แจ้งตอน `isFirstWon` พร้อมใบงานหน้างานแทน — เสริมใน `autoCreateJobsFromAcceptedLead` ซึ่งเป็นตัวที่ถูกเรียกจริง ไม่ใช่ `createJobsFromLead` ที่ไม่มี UI เรียกแล้ว)
- ราคาเสนอ: เลือกแพ็กเกจแล้วเติม `quoted_price` = Σ ราคาแพ็กเกจ × จำนวนชุด เฉพาะเมื่อช่องยังว่าง (พฤติกรรมเดิมของ `crm_settings.price`)
- **ตู้ (ประเภทที่ทีมขายเลือกชิ้นเอง)**: ถ้าแพ็กเกจมีข้อกำหนดประเภทที่ติ๊ก `sales_pick` ช่องเลือกชิ้นจะโผล่ใต้แพ็กเกจทันที — รายการ = ชุดในประเภทนั้น (ตู้ประกอบ ชุด 1 / ชุด 2) พร้อมป้ายความว่างรายชิ้น (หัวข้อ 5.2) ระบบเสนอชุดที่ว่างก่อน มีชุดเดียวที่ว่างเลือกให้เลย · ถ้าประเภทมีแบบประกอบ มี dropdown แบบ (ประกอบ 1 / 2 / 3) **ไม่บังคับ** ใส่หรือแก้ทีหลังได้จนก่อนรับของ เป็นแค่ป้ายบอกทีมจัดของ/หน้างาน ไม่มีผลต่อของที่หยิบ · เปลี่ยนชุด/แบบได้เฉพาะคนที่เลือกแพ็กเกจได้ (ทีมขาย/แอดมิน/ฝ่ายประสานงาน) และเฉพาะก่อนรับของ · เลือกชุดที่งานอื่นเวลาทับเลือกไปแล้ว = ป้ายแดง "ชน" ทันที ยืนยันได้แต่ไม่แนะนำ (นโยบายเตือนไม่บล็อก) · ชุดเดียวกันซ้ำในงานเดียวเลือกไม่ได้ (เป็นชิ้นเดียวกัน) · งานที่ขาย 2 ชุดเลือก 2 ชิ้น
- ตารางภาพรวมแสดงชิปแพ็กเกจ + ป้าย "อุปกรณ์อาจไม่พอ: คอมพิวเตอร์" เมื่อมีคำเตือน

### 4.3 ทีมจัดของ: เลือกของ → ใบจัดของ → หยิบ → ยืนยัน

1. **รับหน้าที่** "จัดของ" ในแท็บจัดของของพูล (กลไก `claimLeadDuty` เดิม key `kits`) — ไม่บังคับ: คนในทีมจัดของทำแทนกันได้ ระบบบันทึกคนทำจริงในใบ
2. **เปิดใบจัดของ**: ปุ่มในแท็บจัดของ / หน้า `/packing` (คิวงานของทีม: งานที่มีแพ็กเกจแล้วแต่ยังไม่มีใบ, ใบที่กำลังทำ, ใบที่รอคืนชั้น) → `createPackingList(leadId, eventId?)` — งานยังไม่มีอีเวนต์ให้สร้างให้ด้วย `resolveLeadEvent` เดิม (phase `main` ตัวเดียวกับที่จัดคน/จัดรถ/จองกระเป๋าใช้) · งานที่มีหลายอีเวนต์ = เลือกอีเวนต์ก่อน (ใบละอีเวนต์) · ใบเกิดมาในสถานะ **เลือกของ** พร้อมโครงจาก `lead_packages × package_requirements` (แพ็กเกจ A: คอมพิวเตอร์ 1, กล้อง 1, กระเป๋าอุปกรณ์ 1 …)
3. **เลือกของ** `/packing/[id]`: ต่อข้อกำหนดแสดงตัวเลือกอุปกรณ์ (ตาม `package_options` หรือทุกหน่วยในประเภทถ้าไม่ได้ระบุ) พร้อมป้ายความว่าง (หัวข้อ 5.2) · เลือกครบตามจำนวน · เพิ่ม "ของเสริม" นอกแพ็กเกจได้ (ทุกหน่วยในคลัง) · บรรทัดกระเป๋าเขียน `event_kits` ให้เอง (unbook เมื่อลบบรรทัด) · **บรรทัดของประเภทที่ทีมขายเลือกชิ้นเอง (ตู้)** ถูกเติมจาก `lead_package_units` ตั้งแต่เปิดใบ พร้อมแบบประกอบ และล็อก (`locked`) — ทีมจัดของเปลี่ยนไม่ได้ ถ้าชิ้นนั้นใช้ไม่ได้ (เสีย/ออกงานอยู่) ใบขึ้นป้ายแดง "ตู้ที่ขายไว้ใช้ไม่ได้ แจ้งทีมขายเปลี่ยน" และแจ้งเตือนผู้เลือกแพ็กเกจ · บรรทัดตู้แสดงแบบประกอบ (ถ้าใส่) เป็นป้ายเฉยๆ หยิบ/รับ/คืนเหมือนอุปกรณ์เดี่ยวทั่วไป คืนตู้ทั้งชุด
4. **สร้างใบจัดของ** (ปุ่ม) → ตรวจครบทุกข้อกำหนด → สถานะ **กำลังหยิบ** · หน้าใบเรียงบรรทัดเป็นเส้นทางเดิน **ห้อง → ตู้ → ระดับชั้น** (บรรทัดไม่มีชั้น = กลุ่ม "ยังไม่มีชั้น" ท้ายสุด) · `/packing/[id]/print` = A4 เรียงแบบเดียวกัน มีช่องติ๊ก + QR กลับมาหน้าใบ (ใช้กระดาษหรือมือถือก็ได้)
5. **หยิบของ** ติ๊กทีละบรรทัดบนมือถือ (ปุ่มสูง ≥44px) → `pickLine(lineId)`: อุปกรณ์เดี่ยวต้อง `available` → `in_use` + `event_logs` checkout · กระเป๋า → `checkoutItems` ทุกชิ้นที่ใช้ได้ → `syncPacked` (ป้ายขาดชิ้นที่เสีย/ซ่อม/หายขึ้นเหมือนเดิม) · หน่วยที่ไม่ใช้ได้ตอนนี้ (ออกงานอยู่กับใบอื่น/เสีย) หยิบไม่ได้ → ปุ่ม "เปลี่ยนของ" เลือกหน่วยอื่นในตัวเลือกแทน · ยกเลิกหยิบได้ก่อนยืนยัน (คืนสถานะ)
6. **ยืนยันจัดของ**: ครบทุกบรรทัด → ถ่ายรูปชุดที่จัดเสร็จ ≥1 รูป (ถ่ายได้หลายรูป บีบด้วย `compressImage`) → เลือกจุดรับของ → สถานะ **พร้อมรับ** · `packed_at/by` · log `CONFIRM_PACKING` · แจ้งเตือน `packing_ready` ถึงหัวหน้างาน (`jobs.claimed_by` ใบงานหน้างาน) + คนใน `event_staff` ของอีเวนต์ · งานผ่านความพร้อมข้อ "จัดของ"
7. แก้ไขหลังพร้อมรับ: ได้เฉพาะก่อนรับของ (ถอยเป็นกำลังหยิบ แล้วทำข้อ 5–6 ใหม่)

### 4.4 ทีมหน้างาน: รับของ → ออกงาน → คืนของ

1. **รับของ**: มาถึงออฟฟิศ สแกน QR จุดรับของ → `/pickup/[spotId]` แสดงใบที่ "พร้อมรับ" ณ จุดนี้ (เรียงวันงานใกล้สุด; ใบของอีเวนต์ที่ตัวเองอยู่ใน `event_staff` ขึ้นก่อน) → เปิดใบ → เช็กลิสต์ติ๊กทุกบรรทัดขณะขึ้นรถ (ติ๊กทีละบรรทัดหรือ "ครบทุกชิ้น") → ยืนยัน → `handOverPackingList(listId)`: สถานะ **ออกงาน**, `handed_over_at/by`, ทุกบรรทัด `handed_over_at` · log `HAND_OVER_PACKING` · **hook บอร์ดวันงาน**: ใบงานหน้างานของ lead ที่ยังอยู่ก่อน `loading` → เลื่อนเป็น `loading` (ขนของ) อ่านลำดับจาก `job_settings` แบบ `autoAdvanceOnsiteJobs` ห้ามล้มการรับของ
2. **ออกงาน**: ไม่มีอะไรใหม่ — เช็คอินหน้างานเดิมเลื่อนใบงานเป็น "ออกหน้างาน" · QR กระเป๋ายังใช้ นำออก/รับคืนรายชิ้นหน้างานได้เหมือนเดิม
3. **คืนของ**: กลับถึงออฟฟิศ วางของที่จุดเดิม สแกน QR จุด → ใบที่ "ออกงาน" ของจุดนี้ → เช็กลิสต์คืน: ต่อบรรทัดเลือกสภาพ (ค่าเริ่มต้น "ใช้ได้", ปุ่ม "ใช้ได้ทั้งหมด") · บรรทัดกระเป๋ามีช่อง "วัสดุสิ้นเปลืองใช้ไปกี่ชิ้น" ต่อรายการ (กติกา `planReturnUse` เดิม) และกดดูรายชิ้นในกระเป๋าได้ถ้ามีชิ้นเสีย · รูปตอนคืน (ไม่บังคับ) · ยืนยัน → `returnPackingList(listId, conditions, consumableUse, photos)`: สถานะ **คืนแล้ว**, บรรทัด `returned_at` + `return_condition` · **ปิดอีเวนต์** ผ่าน core ของ `processEventReturn` ในโหมดไม่แตะ `items.status` (ตัดยอดวัสดุสิ้นเปลือง + `event_closures` snapshot + `events.status='completed'` + ใบงานหน้างาน done + `recomputeKitPointers` ตามเดิม) — เงื่อนไขสิทธิ์ปิดงานดู Q7 · แจ้งเตือน `packing_returned` ถึงทีมจัดของ

### 4.5 ทีมจัดของ: คืนชั้น

- `/packing` กลุ่ม "รอคืนชั้น" → เปิดใบ → รายการเรียงตามชั้นบ้านของแต่ละหน่วย → ติ๊กทีละบรรทัด `restockLine(lineId)`: อุปกรณ์เดี่ยว `items.status = return_condition` · กระเป๋า: ทุกชิ้นที่ `in_use` → ตามสภาพรายชิ้น (ถ้าไม่ได้ระบุ = `available`) · `restocked_at/by`
- ครบทุกบรรทัด → ใบเป็น **คืนชั้นแล้ว** `restocked_at/by` · log `RESTOCK_PACKING` · จบกระบวนการ · ของที่สภาพ เสียหาย/ซ่อม/หาย ขึ้นในแดชบอร์ดสต็อก "มีปัญหา" เหมือนเดิม

### 4.6 สถานะใบจัดของและผลข้างเคียง

| สถานะ | ไทย | เข้าเมื่อ | ใคร | ผลต่อระบบอื่น |
|---|---|---|---|---|
| selecting | เลือกของ | เปิดใบ | ทีมจัดของ | บรรทัดกระเป๋า ↔ `event_kits` |
| picking | กำลังหยิบ | สร้างใบจัดของ (ครบข้อกำหนด) | ทีมจัดของ | — |
| ready | พร้อมรับ | หยิบครบ + รูป + จุดรับของ | ทีมจัดของ | ความพร้อม "จัดของ" ผ่าน · แจ้งหัวหน้างาน |
| out | ออกงาน | รับของที่จุด | ทีมหน้างาน | ใบงานหน้างาน → ขนของ |
| returned | คืนแล้ว | คืนของที่จุด | ทีมหน้างาน | อีเวนต์ปิด · ใบงาน → done · แจ้งทีมจัดของ |
| done | คืนชั้นแล้ว | คืนชั้นครบ | ทีมจัดของ | สถานะอุปกรณ์กลับตามสภาพ |

- ยกเลิกใบ: ได้เฉพาะ เลือกของ/กำลังหยิบ (คืนสถานะหน่วยที่หยิบแล้ว, ลบ `event_kits` ที่ใบนี้สร้าง) · ใบที่พร้อมรับขึ้นไปยกเลิกไม่ได้ ต้องถอยก่อน
- ความพร้อมข้อ "จัดของ": ขาด เมื่ออีเวนต์ที่ยังไม่ปิดของงานใบใดใบหนึ่ง ไม่มีใบจัดของ หรือใบยังไม่ถึง พร้อมรับ · ใบงานหน้างานถูกข้าม / ตั้ง "ไม่ต้องจัด" = ไม่นับ (เหมือนกระเป๋าเดิม)
- สถานะอุปกรณ์ตลอดเส้น: ใช้ได้ → (หยิบ) ออกงาน `in_use` → (คืนชั้น) ตามสภาพ — ช่วงที่ของอยู่ที่จุดรับของยังเป็น `in_use` ตั้งใจ: ตรวจนับชั้นจะไม่คาดหวังว่าเจอ (`auditTargets` ไม่นับ `in_use`) และแดชบอร์ดนับเป็น "ออกงาน" จนกว่าจะขึ้นชั้น
- อีเวนต์ที่ **ไม่มีใบจัดของ**: ทุกอย่างเดิม (จอง `event_kits` ตรง, `/events/[id]/check-kits`, `/events/[id]/return`) จนกว่าจะถอดในเฟส 6

## 5. กติกา "อุปกรณ์อาจไม่พอ" (pure logic `packages/package-logic.ts` + `.check.ts`)

### 5.1 เตือนทีมขายตอนเลือกแพ็กเกจ

ต่อข้อกำหนด (ประเภท C, ต้องใช้ n ชิ้น × จำนวนชุด) ของงาน L ที่มีวันงาน (ไม่มีวันงาน = ไม่เตือน):

```
ช่วงเวลา(งาน)  = kitWindow เดิม (วัน + เวลาเริ่ม/สิ้นสุด) · ไม่มีเวลา = ทับกันทั้งวัน (ตามกติกา 'unknown' ของกระเป๋า)
capacity(C)    = จำนวนหน่วยในตัวเลือกของข้อกำหนด (ไม่ระบุ = ทุกหน่วยในประเภท C) ที่สถานะไม่ใช่ เสียหาย/ซ่อม/หาย/กำลังซื้อ/หมด
demand(C)      = Σ ของงานอื่นที่ช่วงเวลาทับกับ L และยังไม่ปิด:
                   มีใบจัดของที่เลือกของแล้ว → นับบรรทัดประเภท C ที่หน่วยอยู่ในตัวเลือกเดียวกัน (แน่นอน)
                   ยังไม่มีใบ            → นับความต้องการจาก lead_packages × package_requirements ของประเภท C (ประมาณการ)
ระดับ           = capacity − demand ≥ n·ชุด → ไม่เตือน
                  ไม่พอเพราะส่วน "แน่นอน" อย่างเดียว → แดง "ไม่พอ"
                  ไม่พอเมื่อรวมประมาณการ → เหลือง "อาจไม่พอ"
```

- **ประเภทที่ทีมขายเลือกชิ้นเอง (ตู้)** ไม่ใช้ประมาณการ: เทียบรายชิ้นตรงๆ — ชิ้นเดียวกันอยู่ใน `lead_package_units` หรือบรรทัดใบจัดของของงานอื่นที่ช่วงเวลาทับ = แดง "ตู้ประกอบ ชุด 1 ถูกขายให้งาน X (ประกอบ 2) วันเดียวกัน" ทันทีตอนเลือก · แบบประกอบไม่มีผลต่อการชน (ตู้ชุดเดียวกัน = ชนทุกแบบ)
- `ponytail:` ประเภทอื่นประเมินระดับประเภท ไม่จำลองว่าหน่วยไหนไปงานไหน — พอสำหรับคำเตือน (เจ้าของระบุว่าของจริงอยู่ที่ทีมจัดของ) · อัปเกรดเป็นการจับคู่รายหน่วยถ้าเตือนพลาดบ่อย
- โหลดข้อมูล: lead_packages + ใบจัดของของงานที่ `event_date` อยู่ใน [วันงาน−1, วันงาน+1] เท่านั้น (เล็ก ไม่ชน 1,000 แถว) · ไม่ใช้ `.or()`
- แสดง 3 ที่: ใต้ช่องเลือกทันที · ป้ายบนแถวงานในตารางภาพรวม/การ์ด CRM · แผงสดบน `/dashboard` + `/jobs/tracking` "แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ" (งานในช่วง วันนี้ → +30 วัน) เห็นโดย ผู้สร้างการ์ด + แอดมิน + ฝ่ายประสานงาน + ทีมจัดของ — คำนวณสดแบบ `duty-warnings.ts` ไม่มี cron ไม่มีกระดิ่ง (นโยบายเดียวกับ dashboard-alerts)

### 5.2 ป้ายความว่างให้ทีมจัดของตอนเลือกหน่วย

ขยาย `kitBookingClashes` ให้รับ `resourceId` ทั่วไป (ตอนนี้ key เป็น `kitId` อย่างเดียว) แล้วเทียบกับบรรทัดใบจัดของอื่นที่ยังไม่ done + `event_kits` ของงานที่ยังไม่ปิด:

| ป้าย | เงื่อนไข | เลือกได้? |
|---|---|---|
| ว่าง | ไม่มีใบอื่นวันเดียวกัน | ได้ |
| ต่อคิว | ใบอื่นวันเดียวกัน เวลาไม่ทับ | ได้ (เหลือง) |
| ชน / เช็คเวลาไม่ได้ | เวลาทับ หรือฝั่งใดไม่มีเวลา | ได้ แต่ถามยืนยัน (แดง) — นโยบายเตือนไม่บล็อกเดิม |
| ไม่พร้อม | สถานะ เสีย/ซ่อม/หาย/กำลังซื้อ/หมด | ไม่ได้ |
| ออกงานอยู่ | `in_use` กับใบอื่น (ยังไม่คืนชั้น) | เลือกได้ (วางแผนล่วงหน้า) แต่ **หยิบไม่ได้** จนกว่าจะคืนชั้น |

## 6. แดชบอร์ดการใช้งาน + ถ้วยใหม่ (เฟส 5)

หน้าใหม่ `/stock/usage` (โมดูลสต็อก ทุกคนที่มีสิทธิ์สต็อก) · server โหลดแถวเบาๆ (`readAllRows` เพราะบรรทัดใบจัดของโตเกิน 1,000 ได้) · client สลับชิป ภาพรวม / เดือนนี้ / 3 เดือน / ปีนี้ แบบ `/reports` · ตรรกะนับใน `packing/usage-logic.ts` + `.check.ts`

| ส่วน | ตัวเลข | นับจาก |
|---|---|---|
| หน่วยที่ใช้บ่อย | จำนวนครั้ง · ชั่วโมงรวม · ครั้งล่าสุด (ตาราง top 20 + ค้นหา) | `packing_list_items` ที่ `handed_over_at` ไม่ว่าง · ชั่วโมง = `returned_at − handed_over_at` (fallback ช่วงอีเวนต์) |
| ตามประเภท | จำนวนหน่วยทั้งหมด · ครั้งใช้ · ชั่วโมง · หน่วยที่ไม่เคยใช้ในช่วง | join `equipment_categories` |
| ตามแพ็กเกจ | ขายกี่ชุด (lead_packages ของงานตอบรับแล้ว วันงาน ≤ วันนี้) · ออกงานจริงกี่ใบ | `lead_packages`, `packing_lists` |
| ตู้และแบบประกอบ | ตู้แต่ละชุดออกงานกี่ครั้ง · แยกตามแบบประกอบ (ประกอบ 1 / 2 / 3 ใช้บ่อยแค่ไหน) | `packing_list_items.variant` |
| ตอนนี้ | กำลังออกงาน (out) · รอคืนชั้น (returned) · พร้อมรับ (ready) พร้อมลิงก์ใบ | `packing_lists.status` |
| คน | จัดของ (ใบที่ `packed_by`) · คืนชั้น (`restocked_by`) · รับของ/คืนของ (`handed_over_by`/`returned_by`) | `packing_lists` |

ถ้วย: เพิ่ม `StatKind` **`packing` "นักจัดของ"** (วันที่ = `packed_at`) และ **`restock` "นักคืนของ"** (วันที่ = `restocked_at`) ใน `reports/report-stats.ts` + `data.ts` (2 query ใหม่ ใช้ `readAllRows`) → `ChampionsStrip` บน `/dashboard` และ `Top3Grid` บน `/reports` ได้เฟรมเพิ่ม 2 ใบ (ต้องมี PNG ใน `public/profile frame/` — Q9) · สายเดิม `kits` "จัดกระเป๋า" (นับคนกดรับหน้าที่) เปลี่ยนป้ายเป็น "รับหน้าที่จัดของ" หรือถอดออก (Q9)

กราฟ: ตารางก่อน · กราฟแท่งชั่วโมงต่อเดือน 1 รูปด้วย Recharts ที่มีอยู่ ค่อยเพิ่มเมื่อเจ้าของบอกว่าอยากดูอะไร

## 7. สิทธิ์ เมนู proxy แจ้งเตือน

- **MODULE_ROUTES (`proxy.ts`) + NAV_GROUPS (`lib/nav-config.ts`) ต้องแก้คู่กัน**: โมดูล `stock` เพิ่ม `/packages`, `/packing`, `/stock/settings`, `/stock/usage` (ตอนนี้ stock มีแค่ `/stock/dashboard` ไม่ใช่ prefix `/stock`) · ข้อยกเว้นแคบ `/pickup/<uuid>` ผ่านด้วย `stock` **หรือ** `events` (regex แบบ `/kits/<id>/check`) + ต่อเช็กสคริปต์ proxy
- เมนู "คลังอุปกรณ์": แดชบอร์ด · อุปกรณ์ · กระเป๋า · **แพ็กเกจ** · **ใบจัดของ** · ชั้นเก็บของ · **การใช้งาน** · เช็คลิสต์ · **ตั้งค่าคลัง** (ป้ายใน `lib/dictionary.ts`)
- สิทธิ์ฝั่ง server (ทุก action ตรวจเอง ไม่พึ่ง proxy):

| การกระทำ | ใคร |
|---|---|
| ประเภท / แพ็กเกจ / จุดรับของ | admin + ผู้ดูแลอุปกรณ์ (`getKitManager` = `pool_kit_departments`) |
| เลือกแพ็กเกจให้งาน | admin + ฝ่ายประสานงาน + ผู้สร้างการ์ด CRM |
| เปิด/เลือกของ/หยิบ/ยืนยัน/คืนชั้น/ยกเลิกใบ | admin + แผนกใน `pool_duty_kits` (ทีมจัดของ) |
| รับของ / คืนของ ที่จุด | ทุกคนที่ล็อกอินและมีสิทธิ์ events หรือ stock · บันทึกชื่อผู้ทำ · อีเวนต์ต้องยังไม่ปิด |
| ปิดอีเวนต์ตอนคืนของ | ตาม Q7 |

- แจ้งเตือนกระดิ่ง (type ใหม่ใน `lib/notifications.ts` + หมวด `stock` ใน `notification-category.ts` + URL ใน 3 ที่ที่ซ้ำกันอยู่: bell/toast/page): `packing_requested` (→ ทีมจัดของ), `packing_ready` (→ หัวหน้างาน + event_staff), `packing_returned` (→ ทีมจัดของ) · deep-link `/packing/[id]`
- `ActionType` ใหม่ใน `lib/logger.ts` ทุก mutation: `CREATE_EQUIPMENT_CATEGORY/UPDATE_/DELETE_`, `CREATE_PACKAGE/UPDATE_/DELETE_`, `SET_LEAD_PACKAGES`, `CREATE_PICKUP_SPOT/UPDATE_/DELETE_`, `CREATE_PACKING_LIST`, `UPDATE_PACKING_LINES`, `PICK_PACKING_LINE`, `UNPICK_PACKING_LINE`, `CONFIRM_PACKING`, `REOPEN_PACKING`, `HAND_OVER_PACKING`, `RETURN_PACKING`, `RESTOCK_PACKING`, `CANCEL_PACKING_LIST`, `AUTO_LOADING_POOL_JOB`

## 8. การอยู่ร่วมกับ flow เดิม / ทางย้าย

- **กระเป๋า**: โครง `kits/kit_contents` ไม่เปลี่ยน · QR กระเป๋าใช้ต่อ · บรรทัดกระเป๋าในใบจัดของสร้าง `event_kits` → เลนไทม์ไลน์/หน้ากระเป๋า/ชน ถูกต้องโดยไม่แก้ · การจอง `event_kits` ตรงจาก `KitPicker` (ฟอร์มอีเวนต์) และปุ่มจองในพูล ยังอยู่ในเฟส 1–5 แต่จะแสดงเป็น "จองเพิ่มนอกใบจัดของ" ในใบ (อ่านรวมเป็นบรรทัดอัตโนมัติ) · ถอดในเฟส 6
- **ความพร้อม/แท็บ/เลน**: key `kits` ในโค้ดคงไว้ทั้งหมด (`MissingItem 'kits'`, `WAIVER_KEYS.skip_kits`, `lead_duty_claims.duty='kits'`, `pool_duty_kits`) เปลี่ยนเฉพาะป้าย "กระเป๋า/จัดกระเป๋า" → "จัดของ" และ predicate `isMissingKits` อ่านใบจัดของ (อีเวนต์ไม่มีใบแต่มี `event_kits` ที่จัดครบ = ยังผ่านแบบเดิม ในเฟส 3–5)
- **ปิดงาน**: `/events/[id]/return` ตรวจก่อน: อีเวนต์มีใบจัดของ → พาไปขั้นคืนของของใบ (หรือหน้ายืนยันปิดที่เติมค่าจากใบแล้ว ตาม Q7) · ไม่มีใบ → หน้าเดิม
- **โค้ดเก่าที่อ่านตัวชี้ `kits.event_id`** ต้องรู้จักใบจัดของ: `items/cleanup-items.ts::cleanupOrphanedItems` (ห้ามรีเซ็ตหน่วยที่อยู่ในใบที่ยังไม่ done) · `items/[id]/actions.ts::updateItem` (ห้ามตั้ง in_use ด้วยมือ — คงเดิม) · `stock/dashboard` ตัวเลขออกงาน (รวมอุปกรณ์เดี่ยวที่ออกตามใบ)
- **CRM `package_name` / `crm_settings` category `package`**: เฟส 2 ย้ายแถว `crm_settings` หมวด package (ชื่อ + ราคา) เข้า `packages` ด้วย migration (รันซ้ำได้) · dropdown "ระบบที่ใช้บริการ" อ่านจาก `packages` ที่เปิดใช้ (ค่าเก่าที่ไม่ตรงยังแสดงเป็นข้อความ) · ยังเขียน `package_name` = ชื่อแพ็กเกจที่เลือกคั่นด้วย " + " เพราะมีผู้อ่านฟิลด์นี้หลายที่ที่ไม่แตะในรอบนี้: ตาราง "ระบบที่ใช้บริการ" ใน sales-board (`sales-data.ts`), CRM dashboard, overview, จัดกลุ่มต้นทุน (`crm-cost-grouping.ts`), ชื่อใบงาน (`jobs/actions.ts`), ชื่ออีเวนต์ตอน prefill (`events/new`), การ์ด CRM ในหน้าใบงาน — ตาม Q3
- **เอกสาร**: `CONTEXT.md` หมวด "อุปกรณ์" + แก้คำนิยาม "ชน" ของกระเป๋าที่ยังเขียนแบบเก่า (วันเดียวกัน = ชน) ให้ตรงโค้ด v1.29.0 · `docs/howto` หน้าจัดของ (เฟส 4) · CLAUDE.md หนึ่งย่อหน้า

## 9. แผนปล่อยงานเป็นเฟส

ทุกเฟส: branch `feature/equipment-p<N>` จาก main (fetch ดู version บน main ก่อน bump — เคยมี session คู่ขนาน) · bump MINOR · What's New entry (วันที่จาก `date`) · `npx tsc --noEmit --incremental false` = baseline 1 จุด · eslint kits/events/crm = 0 · ไฟล์ที่แตะไม่เพิ่ม error · รันชุดตรวจทุกตัวที่ import ไฟล์ที่แก้ · migration รันบน prod **ก่อน deploy** (เรียงตามชื่อไฟล์ ต่อจากที่ค้าง: `20261007_consumables`, `20261007_crm_status_seed_and_credit`, `20261009_room_door`) · ไม่ `next build` ขณะ dev รัน · agent loop ตาม CLAUDE.md (Planner/Critic = session หลัก, Executor = opus) — ตัวอย่างชุด AC ที่ใช้ได้เลยอยู่ใน `docs/specs/kits-flow.md`

### เฟส 1 — ประเภทอุปกรณ์ (v1.47.0, migration 3.1) · ขนาด S

- หน้า: `/stock/settings` (ใหม่ แท็บประเภท) · `/items/new`, `/items/[id]` dropdown ประเภท · `/items` ตัวกรองประเภท · `/kits/[id]` ประเภทของกระเป๋า
- ไฟล์หลัก: `stock/settings/{page,settings-view,actions}.tsx`, `stock/categories.ts` (โหลด/ type), แก้ `items/new/page.tsx` (ถอด `CategorySelector`), `items/[id]/edit-item-form.tsx`, `items/items-table.tsx`, `kits/[id]/edit-kit-dialog.tsx`, `lib/mcp-tools.ts::search_items` (ค้นด้วยชื่อประเภท), proxy + nav + dictionary
- AC ย่อ: สร้าง/แก้/ปิดใช้ประเภทได้ พร้อมช่อง "ทีมขายเลือกชิ้นเอง" และรายการแบบประกอบ (เพิ่ม/ลบ/เรียง, ชื่อซ้ำในประเภทเดียวกันไม่ได้) · แถวประเภทแสดงจำนวนชิ้นและลิงก์เพิ่มอุปกรณ์ที่เติมประเภทให้ · ลบประเภทที่มีของอ้างถึงไม่ได้ (error ไทย) · อุปกรณ์เดิมทุกชิ้นที่มี `category` ได้ `category_id` หลัง backfill (นับเท่ากัน) · ฟอร์มอุปกรณ์/กระเป๋าบันทึก `category_id` · `items.category` text ยังถูกเขียนเป็นชื่อประเภทคู่กัน (โค้ด/MCP เดิมไม่พัง) · ชุดตรวจเดิมของ stock ผ่าน
- What's New: "ตั้งประเภทอุปกรณ์ได้เองในคลัง และจัดกระเป๋าเข้าประเภท"

#### เฟส 1 — แผนและเกณฑ์ที่ล็อก (2026-10-07, เจ้าของสั่ง "ใช้ค่าเริ่มต้น เริ่มเฟส 1")

branch `feature/equipment-p1` · baseline: `tsc --incremental false` = 1 error · eslint ไฟล์ที่แตะ = 0 error (warning เดิม: edit-item-form 4, items/actions 1, items-table 4) · Executor = Agent `model: opus` ทำบน working tree นี้ · Critic ตรวจด้วยคำสั่งก่อนอ่านโค้ด

**ผล (2026-10-07): ผ่านรอบเดียว** `{"pass": true, "score": 0.98, "passed_ids": ["P1-1"…"P1-14"], "failures": []}` — tsc 1 error เดิม · ชุดตรวจ 5 ตัว + `scripts/stock-settings-render.check.ts` (ใหม่ โดย Critic) ผ่าน · eslint ไฟล์ที่แตะ 0 error/warning เท่า baseline · merge เข้า main เป็น v1.47.0 (ยังไม่ push)
หมายเหตุ P1-12: `eslint kits events crm` = 44 problems (1 error ใน `crm/components/kanban-board.tsx` + 43 warning) **ทั้งหมดอยู่ในไฟล์ที่เฟสนี้ไม่ได้แตะ** (crm/events ไม่มี diff เทียบ main · ปัญหาใน kits อยู่ที่ `kits/actions.ts`, `kits/[id]/item-image-preview.tsx` ซึ่งไม่อยู่ใน diff) = baseline บน main ขยับไปก่อนแล้ว (น่าจะจากกฎ react-hooks รุ่นใหม่ "Cannot call impure function during render") — ไม่ใช่งานของเฟสนี้ ควรเก็บกวาดแยก
ยังไม่ได้ลอง: หน้าตั้งค่าคลังกับฟอร์มในเบราว์เซอร์จริง · migration ยังไม่ได้รันบน postgres ชั่วคราว (Docker ไม่ได้เปิด) ตรวจด้วยการอ่าน · **prod ต้องรัน `20261010_equipment_categories.sql` ก่อน deploy** ไม่งั้นหน้า /kits และ /kits/[id] โหลดไม่ได้ (select join `equipment_categories`)

```json
{
  "plan": [
    "WP1 ฐานข้อมูล + กติกา: supabase/migrations/20261010_equipment_categories.sql (ตาม 3.1 รวม sales_pick/variants, backfill, idempotent) · app/(authenticated)/stock/categories.ts (type EquipmentCategory + loadCategories) · stock/settings/category-logic.ts + .check.ts · lib/logger.ts ActionType 4 ตัว · types/database.types.ts app type Item/Kit เพิ่ม category_id · proxy.ts + scripts/proxy-session.check.ts · lib/nav-config.ts + lib/dictionary.ts",
    "WP2 หน้าตั้งค่าคลัง: stock/settings/{page,settings-view,category-dialog,actions}.tsx — รายการ/เพิ่ม/แก้/ปิดใช้/ลบ/เรียง ประเภท พร้อมช่องทีมขายเลือกชิ้นเอง + แบบประกอบ + จำนวนชิ้น + ลิงก์เพิ่มอุปกรณ์",
    "WP3 ฟอร์มอุปกรณ์/กระเป๋า: items/new (server page + new-item-form.tsx client, ?category=) · items/[id] (page + edit-item-form) · items/actions.ts + items/[id]/actions.ts เขียน category_id + category text · items-table.tsx ตัวกรองประเภท · kits/[id] (page, edit-kit-dialog, actions.updateKitDetails, kit-details-view) + kits/page.tsx + kits-view.tsx แสดงประเภท",
    "WP4 release: package.json 1.47.0 · whats-new/updates.ts · รันชุดตรวจทั้งหมด · รายงาน"
  ],
  "acceptance_criteria": [
    { "id": "P1-1", "blocking": true, "check": "ไฟล์ supabase/migrations/20261010_equipment_categories.sql มีอยู่และ idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / INSERT … ON CONFLICT (name) DO NOTHING / UPDATE … WHERE category_id IS NULL) · ตาราง equipment_categories มีคอลัมน์ id uuid PK default gen_random_uuid(), name text NOT NULL UNIQUE, sort_order int NOT NULL default 0, is_active bool NOT NULL default true, sales_pick bool NOT NULL default false, variants text[] NOT NULL default '{}', created_at timestamptz NOT NULL default now() · ALTER TABLE items/kits ADD COLUMN category_id uuid REFERENCES equipment_categories(id) ON DELETE SET NULL + index ทั้งสอง · ENABLE ROW LEVEL SECURITY ไม่มี policy · backfill: INSERT ชื่อจาก SELECT DISTINCT btrim(category) FROM items WHERE category ไม่ว่าง แล้ว UPDATE items.category_id จับคู่ btrim(category) = name เฉพาะแถวที่ category_id IS NULL · มี COMMENT ภาษาไทยบนตารางและคอลัมน์ sales_pick/variants" },
    { "id": "P1-2", "check": "stock/settings/category-logic.ts (pure, ไม่ import next/supabase) export parseCategoryForm(input: {name, sales_pick, variants}) → {name, sales_pick, variants} | {error}: ชื่อ trim ว่าง = error ไทย, ยาวเกิน 60 = error ไทย, variants รับ string แยกด้วยขึ้นบรรทัด/จุลภาค trim ตัดว่าง ตัดซ้ำ (เก็บลำดับแรก) ไม่เกิน 20 รายการ; export canDeleteCategory({items, kits}) → {ok: true} | {error} ที่ข้อความระบุจำนวนชิ้น/ใบ; export sortCategories(list) เรียง sort_order แล้ว name ด้วย localeCompare('th'); category-logic.check.ts assert ทุกข้อข้างต้น (อย่างน้อย 8 assertion) และ `npx tsx \"app/(authenticated)/stock/settings/category-logic.check.ts\"` exit 0" },
    { "id": "P1-3", "blocking": true, "check": "stock/settings/actions.ts export createCategory, updateCategory, deleteCategory, reorderCategories ('use server') — ทุกตัวเรียก getKitManager() ก่อน ไม่ผ่านคืน { error } ภาษาไทย ไม่ throw · create/update ใช้ parseCategoryForm · ชื่อซ้ำ (23505 หรือตรวจก่อน) คืน error ไทย · deleteCategory นับ items และ kits ที่ category_id = id ก่อน (head/count) มี > 0 คืน error ผ่าน canDeleteCategory และไม่ลบ · สำเร็จ logActivity ด้วย CREATE_EQUIPMENT_CATEGORY / UPDATE_EQUIPMENT_CATEGORY / DELETE_EQUIPMENT_CATEGORY / REORDER_EQUIPMENT_CATEGORIES และ revalidatePath('/stock/settings'), ('/items'), ('/items/new') · ไม่ใช้ .or()" },
    { "id": "P1-4", "check": "stock/settings/page.tsx เป็น server component: getKitManager() เป็น null → redirect('/stock/dashboard') · โหลดประเภททุกแถว (รวม is_active=false) + จำนวนอุปกรณ์และกระเป๋าต่อประเภท โดยอ่าน items ผ่าน lib/read-all-rows.ts::readAllRows (เรียง created_at,id) ไม่มี query ต่อประเภท (ไม่มี N+1) · stock/categories.ts export type EquipmentCategory {id,name,sort_order,is_active,sales_pick,variants} และ loadCategories(db, opts?: {includeInactive?: boolean}) ใช้ .overrideTypes หรือ cast ที่ขอบเขต query เดียว" },
    { "id": "P1-5", "check": "settings-view.tsx: แต่ละประเภทแสดง ชื่อ, ป้าย 'ทีมขายเลือกชิ้นเอง' เมื่อ sales_pick, ชิป/รายการแบบประกอบ, จำนวน 'อุปกรณ์ N · กระเป๋า N', ประเภทที่ปิดใช้แสดงจางพร้อมป้าย 'ปิดใช้', ปุ่มเลื่อนขึ้น/ลง, ปุ่มแก้ไข, ปุ่มลบ, ลิงก์ 'เพิ่มอุปกรณ์' ไป /items/new?category=<id> · เพิ่ม/แก้ผ่าน Dialog (category-dialog.tsx ใช้ Dialog ของ shadcn) ช่อง: ชื่อ, สวิตช์/checkbox ทีมขายเลือกชิ้นเอง, textarea แบบประกอบ (1 บรรทัดต่อแบบ), checkbox เปิดใช้ · ลบถามยืนยันด้วย useConfirm จาก finance/use-confirm.tsx ระบุชื่อประเภท · ผลลัพธ์ error/สำเร็จแสดงด้วย toast (sonner) · grep ไม่เจอ window.confirm / alert( / confirm( ในโฟลเดอร์ stock/settings · ข้อความ UI ภาษาไทยทั้งหมด · ไม่ล้นจอที่ 390px (ใช้ flex-wrap / grid ไม่มี min-width คงที่เกิน 360)" },
    { "id": "P1-6", "blocking": true, "check": "items/new/page.tsx เป็น server component โหลด loadCategories (เฉพาะเปิดใช้) และอ่าน searchParams.category แล้ว render client component items/new/new-item-form.tsx (ย้ายเนื้อหาฟอร์มเดิมมา พฤติกรรมอื่นเหมือนเดิม) · ช่องประเภทเป็น Select ที่มีตัวเลือก 'ไม่ระบุ' + ชื่อประเภท ส่งค่าเป็น field ชื่อ category_id (ค่าว่าง = ไม่ระบุ) ค่าเริ่มต้น = ?category= ถ้าตรงกับประเภทที่มี · ไม่มี CategorySelector / รายการประเภท hardcode / 'Add New Category' เหลืออยู่ · items/actions.ts::createItem อ่าน category_id → ถ้ามี ตรวจว่ามีในตาราง แล้ว insert ทั้ง category_id และ category = ชื่อประเภท; ไม่มี → ทั้งคู่ null · ไม่รับ field category text จากฟอร์มอีก" },
    { "id": "P1-7", "check": "items/[id]/page.tsx โหลด loadCategories (เปิดใช้ + ประเภทปัจจุบันของชิ้นนั้นแม้ปิดใช้) ส่งให้ edit-item-form.tsx ซึ่งเปลี่ยนช่องประเภทจาก Input เป็น Select ('ไม่ระบุ' + ประเภท) defaultValue = item.category_id · items/[id]/actions.ts::updateItem อ่าน category_id แล้วเขียน category_id + category text (ชื่อ) หรือ null ทั้งคู่ · พฤติกรรมวัสดุสิ้นเปลือง/รูป/สถานะเดิมไม่เปลี่ยน" },
    { "id": "P1-8", "check": "items-table.tsx มีตัวกรองประเภท (Select 'ทุกประเภท' + ค่าที่พบใน item.category ของแถวที่โหลด เรียง th) ทำงานร่วมกับตัวกรองข้อความและสถานะเดิม (AND) · ไม่ต้องแก้ items/page.tsx เว้นแต่จำเป็น" },
    { "id": "P1-9", "check": "kits/[id]/edit-kit-dialog.tsx เพิ่ม Select ประเภท ('ไม่ระบุ' + ประเภท) และเรียก updateKitDetails(kitId, name, description, categoryId | null) · kits/[id]/actions.ts::updateKitDetails รับพารามิเตอร์ที่ 4, ตรวจว่า id มีในตารางเมื่อไม่ null, update kits.category_id, log UPDATE_KIT รวมค่าเก่า/ใหม่ · kits/[id]/page.tsx select เพิ่ม category_id, equipment_categories(name) และโหลด loadCategories ส่งให้ view · kit-details-view.tsx แสดง pill ชื่อประเภทถัดจาก pill ชั้น (ไม่มีประเภท = ไม่แสดง) · kits/page.tsx + kits-view.tsx: การ์ดแสดงชื่อประเภทเป็นข้อความเล็กใต้ชื่อเมื่อมี" },
    { "id": "P1-10", "blocking": true, "check": "proxy.ts MODULE_ROUTES.stock มี '/stock/settings' · lib/nav-config.ts กลุ่ม stock เพิ่ม { href: '/stock/settings', icon: Settings, labelKey: 'stockSettings' } เป็นรายการสุดท้าย · lib/dictionary.ts nav.stockSettings = 'Stock settings' (en) / 'ตั้งค่าคลัง' (th) · scripts/proxy-session.check.ts เพิ่ม assert: STOCK_ONLY เข้า /stock/settings ได้ ('next'), EVENTS_ONLY และ NEITHER ถูก redirect ไป /dashboard · `npx tsx scripts/proxy-session.check.ts` exit 0" },
    { "id": "P1-11", "check": "lib/logger.ts ActionType เพิ่ม 'CREATE_EQUIPMENT_CATEGORY' | 'UPDATE_EQUIPMENT_CATEGORY' | 'DELETE_EQUIPMENT_CATEGORY' | 'REORDER_EQUIPMENT_CATEGORIES' (ใส่ใต้คอมเมนต์ // ประเภทอุปกรณ์) · types/database.types.ts app type Item และ Kit เพิ่ม `category_id?: string | null` พร้อมคอมเมนต์ migration แบบเดียวกับ shelf_id" },
    { "id": "P1-12", "blocking": true, "check": "`npx tsc --noEmit --incremental false` = 1 error เดิม (check-update-view.tsx) เท่านั้น · eslint: ทุกไฟล์ที่แตะ error = 0 และ warning ไม่เกิน baseline (edit-item-form 4, items/actions 1, items-table 4, ไฟล์อื่น 0); โฟลเดอร์ kits, events, crm = 0 problems (นับจากบรรทัดสรุป ✖ หรือ -f json) · ชุดตรวจ exit 0: stock/settings/category-logic.check.ts, scripts/proxy-session.check.ts, scripts/session-hardening.check.ts, shelves/consumable-logic.check.ts, shelves/shelf-logic.check.ts" },
    { "id": "P1-13", "check": "package.json version = 1.47.0 · UPDATES[0] ใน whats-new/updates.ts: date = ผล `date +%F` (2026-10-07), tag 'ใหม่', module 'คลังอุปกรณ์', title + points ภาษาไทยมุมมองผู้ใช้ ครอบคลุม: ตั้งประเภทได้เองที่ตั้งค่าคลัง, ช่องทีมขายเลือกชิ้นเอง + แบบประกอบ (อธิบายว่าไว้ใช้กับแพ็กเกจที่จะมาเฟสถัดไป), ฟอร์มอุปกรณ์/กระเป๋าเลือกประเภทจากรายการ, กรองรายการอุปกรณ์ตามประเภท · ไม่มีศัพท์เทคนิค" },
    { "id": "P1-14", "check": "ไม่มีไฟล์ใหม่นอกรายการ WP1–WP4 โดยไม่แจ้ง · .claude/settings.local.json ไม่ถูกแก้ · ไม่รัน next build / ไม่เปิด dev server / ไม่ commit · ข้อความ error ที่ผู้ใช้เห็นในไฟล์ใหม่เป็นภาษาไทย · โค้ดอ่านใหม่ไม่ใช้ .or() · ไม่มี window.confirm/alert ในไฟล์ที่แตะ" }
  ],
  "pass_threshold": 0.9
}
```

### เฟส 2 — แพ็กเกจ + ทีมขายเลือก + คำเตือนอุปกรณ์อาจไม่พอ (v1.48.0, migration 3.2) · ขนาด M

- หน้า: `/packages`, `/packages/new`, `/packages/[id]` · `PackagePicker` ใน `/jobs/tracking` ภาพรวม + `/crm/[id]` การ์ดอีเวนต์ · แผงเตือนใน dashboard-alerts
- ไฟล์หลัก: `packages/{page,packages-view,actions,types,package-logic,package-logic.check}.ts(x)`, `packages/[id]/{page,package-editor}.tsx`, `jobs/tracking/{tracking-view,pool-tabs}` ช่องแพ็กเกจในตารางภาพรวม, `jobs/tracking/data.ts` (โหลด `lead_packages` เข้า snapshot), `crm/[id]/components/*` + `crm/[id]/lead-detail.tsx` (render-check ก่อน/หลังต้องเท่ากันทุกไบต์ในส่วนที่ไม่ตั้งใจแก้; `lead-detail.tsx` ต้อง ≤ 500 บรรทัดตามกติกา CRM), `crm/settings` (รายการแพ็กเกจอ่านจาก `packages`), `jobs/actions.ts::autoCreateJobsFromAcceptedLead` แจ้งทีมจัดของ, `components/dashboard-alerts/capacity-panel.tsx` + `capacity-warnings.ts` (+check)
- AC ย่อ: แพ็กเกจมีข้อกำหนดหลายประเภท จำนวน ≥1 ตัวเลือกหลายหน่วย/ไม่ระบุ · ตัวเลือกไม่แสดงอุปกรณ์ที่อยู่ในกระเป๋า · คัดลอกแพ็กเกจได้ · งานเลือกหลายแพ็กเกจ+จำนวนชุด ทั้งสองหน้าเห็นตรงกัน · ประเภท `sales_pick` บังคับเลือกชิ้น แบบประกอบไม่บังคับ (ถ้าใส่ต้องเป็นค่าใน variants ของประเภท) · ตู้ชุดเดียวกันถูกเลือกให้สองงานเวลาทับ → ป้ายแดงทั้งสองงาน (เทสต์ใน package-logic.check: แบบต่างกันก็ชน) · ชุดเดียวกันซ้ำในงานเดียว = error ไทย · `package-logic.check.ts` ครอบ: capacity หักสถานะไม่พร้อม, demand แน่นอน vs ประมาณการ, ช่วงเวลาทับ/ไม่ทับ/ไม่มีเวลา, ระดับเหลือง/แดง, ไม่เตือนเมื่อไม่มีวันงาน · คำเตือนขึ้นใต้ช่องทันทีและบนแถวงาน · แผงบน dashboard ว่าง = ไม่ render · ไม่ใช้ `.or()` · ชุดตรวจ CRM ทั้งหมดผ่าน · crm/ lint 0
- What's New: "ตั้งแพ็กเกจได้ว่าใช้ประเภทอุปกรณ์อะไรบ้าง ทีมขายเลือกแพ็กเกจให้งานแล้วระบบเตือนทันทีถ้าของอาจไม่พอ"

#### เฟส 2 — แผนและเกณฑ์ที่ล็อก (2026-10-07) · branch `feature/equipment-p2` · 2 รอบ Executor

ข้อเท็จจริงที่พบก่อนวางแผน: `crm_leads.package_name` เก็บ **คีย์** ของ `crm_settings` (เช่น `premium_video`) ไม่ใช่ชื่อ — ผู้อ่านทุกจุด (kanban, crm-dashboard, archive, download, customer-card, dashboard-view, sales-board `packageLabels`, MCP `crmLabels.pkg`) map คีย์→ป้ายผ่าน crm_settings แล้ว **fallback เป็นค่าดิบ** → งานเก่าไม่ต้องแปลง; งานที่เลือกแพ็กเกจใหม่เขียน `package_name` = ชื่อแพ็กเกจ (คั่น " + ") ซึ่งทุกจุดแสดงได้ผ่าน fallback · crm_settings หมวด package คงไว้เพื่อแสดงชื่อของงานเก่า (แท็บใน /crm/settings ขึ้นแบนเนอร์ชี้ไป /packages) · กระดิ่ง `packing_requested` **เลื่อนไปเฟส 3** (ยังไม่มีหน้าให้ทีมจัดของทำอะไร)

**รอบ A = WP1 ฐานข้อมูล + กติกา, WP2 หน้าแพ็กเกจ** · **รอบ B = WP3 ทีมขายเลือก + คำเตือน, WP4 release (v1.48.0)**

```json
{
  "plan": [
    "WP1: supabase/migrations/20261011_packages.sql (ตาม 3.2 + seed จาก crm_settings หมวด package ยกเว้น value 'custom') · packages/types.ts · packages/package-logic.ts + .check.ts · tracking-logic.ts export kitWindow + resourceClashes (kitBookingClashes เป็น wrapper) · lib/logger.ts · proxy.ts + scripts/proxy-session.check.ts · lib/nav-config.ts + lib/dictionary.ts",
    "WP2: packages/{page,packages-view,actions,queries}.ts(x) · packages/new/page.tsx · packages/[id]/{page,package-editor}.tsx (+ options-picker.tsx) — ตั้งข้อกำหนดและตัวเลือกอุปกรณ์",
    "WP3: packages/lead-packages.ts (loader + setLeadPackages ใน packages/actions.ts) · packages/package-picker.tsx · packages/capacity-data.ts · components/dashboard-alerts/{capacity-warnings.ts,.check.ts,capacity-panel.tsx} + alert-panels.tsx · jobs/tracking/{data,tracking-view}.tsx คอลัมน์แพ็กเกจ + การ์ดมือถือ · crm: add-lead-dialog, [id]/components/customer-card.tsx, [id]/lead-detail.tsx, [id]/page.tsx, actions.ts (createLead), settings/settings-view.tsx แบนเนอร์ · scripts/crm-lead-detail-render.check.ts ปรับความคาดหวัง",
    "WP4: package.json 1.48.0 · whats-new · รันชุดตรวจทั้งหมด · รายงาน"
  ],
  "acceptance_criteria": [
    { "id": "P2-1", "wp": 1, "blocking": true, "check": "migration 20261011_packages.sql idempotent: packages(id, name UNIQUE NOT NULL, description, price numeric CHECK ≥0 null ได้, sort_order int default 0, is_active bool default true, created_by → profiles SET NULL, created_at, updated_at) · package_requirements(id, package_id → packages CASCADE, category_id → equipment_categories RESTRICT, quantity int CHECK ≥1 default 1, note, sort_order, UNIQUE(package_id, category_id)) · package_options(id, requirement_id → package_requirements CASCADE, item_id → items CASCADE null, kit_id → kits CASCADE null, CHECK ((item_id IS NULL) <> (kit_id IS NULL)), UNIQUE(requirement_id,item_id), UNIQUE(requirement_id,kit_id)) · lead_packages(id, lead_id → crm_leads CASCADE, package_id → packages RESTRICT, quantity int CHECK ≥1 default 1, note, created_by, created_at, UNIQUE(lead_id, package_id)) · lead_package_units(id, lead_package_id → lead_packages CASCADE, requirement_id → package_requirements CASCADE, item_id/kit_id อย่างใดอย่างหนึ่ง, variant text, created_at, UNIQUE(lead_package_id, requirement_id, item_id), UNIQUE(lead_package_id, requirement_id, kit_id)) · index บน lead_packages(lead_id), lead_package_units(item_id), (kit_id) · ENABLE RLS ทุกตาราง ไม่มี policy · seed: INSERT packages(name, price, sort_order) SELECT label_th, price, sort_order FROM crm_settings WHERE category='package' AND is_active AND value <> 'custom' ON CONFLICT (name) DO NOTHING · ไม่แตะ crm_leads · COMMENT ไทยบนทุกตาราง" },
    { "id": "P2-2", "wp": 1, "blocking": true, "check": "packages/package-logic.ts (pure) export: parsePackageForm({name, description, price, is_active}) → {name, description, price: number|null, is_active} | {error} (ชื่อ trim 1–80, price ว่าง = null, ติดลบ = error ไทย) · parseRequirementRows(rows) → ตรวจ quantity integer 1–50, category ซ้ำ = error ไทย · allowedUnits(requirement: {optionUnitIds: string[] | null}, unitsInCategory) → optionUnitIds null/ว่าง = ทุกหน่วยในประเภท ไม่งั้นเฉพาะที่อยู่ในรายการ · capacityWarnings(input) ตามหัวข้อ 5.1: คืน CapacityWarning[] {categoryId, categoryName, packageName, level: 'red'|'yellow', need, capacity, demandSure, demandPlanned, message(ไทย)} — capacity นับหน่วยสถานะไม่ใช่ damaged/maintenance/lost/purchasing/out_of_stock; demandSure = หน่วยที่ถูกเลือกแน่นอน (lead_package_units ของงานอื่นที่ช่วงเวลาทับ และอยู่ในชุดตัวเลือกเดียวกัน) · demandPlanned = ความต้องการรายประเภทของงานอื่นที่ช่วงเวลาทับซึ่งยังไม่เลือกหน่วย · red เมื่อ capacity − demandSure < need · yellow เมื่อ capacity − demandSure − demandPlanned < need · งานไม่มีวันงาน = [] · ประเภท sales_pick: หน่วยเดียวกันถูกเลือกโดยงานอื่นที่ทับ = red ข้อความระบุชื่องานและหน่วย · ช่วงเวลาทับใช้ resourceClashes/kitWindow จาก tracking-logic (ไม่มีเวลา = ทับทั้งวัน) · package-logic.check.ts ≥ 12 assertion ครอบทุกข้อ + กรณี 'จบตรงเวลาเริ่มพอดี = ไม่ทับ' · exit 0" },
    { "id": "P2-3", "wp": 1, "check": "tracking-logic.ts: export kitWindow · เพิ่ม export interface ResourceBooking { resourceId, eventId, eventDate, eventTime?, eventEndTime? } และ export function resourceClashes(bookings, candidate) → { eventId, status: 'conflict'|'queued'|'unknown' }[] กติกาเดิมทุกข้อ · kitBookingClashes เป็น wrapper (map kitId ↔ resourceId) ไม่เปลี่ยนผลลัพธ์ · tracking-logic.check.ts เดิมผ่าน + เพิ่ม assert resourceClashes 2 กรณี" },
    { "id": "P2-4", "wp": 1, "check": "lib/logger.ts เพิ่ม // แพ็กเกจ: CREATE_PACKAGE, UPDATE_PACKAGE, DELETE_PACKAGE, DUPLICATE_PACKAGE, UPDATE_PACKAGE_REQUIREMENTS, REORDER_PACKAGES, SET_LEAD_PACKAGES · proxy MODULE_ROUTES.stock เพิ่ม '/packages' · nav กลุ่ม stock เพิ่ม { href: '/packages', icon: Boxes, labelKey: 'packages' } ถัดจาก /kits · dictionary nav.packages = 'Packages' / 'แพ็กเกจ' · proxy-session.check เพิ่ม assert /packages: stock ผ่าน, events-only และ none → /dashboard · exit 0" },
    { "id": "P2-5", "wp": 2, "blocking": true, "check": "packages/actions.ts ('use server') export createPackage, updatePackage, deletePackage, duplicatePackage, setPackageRequirements(packageId, rows: {categoryId, quantity, note?, optionItemIds: string[], optionKitIds: string[]}[]), reorderPackages — ทุกตัว getKitManager() ก่อน ไม่ผ่านคืน { error } ไทย · deletePackage: มี lead_packages อ้างถึง → error ไทย แนะนำปิดใช้ · duplicatePackage คัดลอก package + requirements + options ชื่อ '<ชื่อ> (สำเนา)' ไม่ซ้ำ (ต่อท้ายเลขถ้าซ้ำ) · setPackageRequirements แทนที่ทั้งชุด: ลบ requirement ที่หายไป (options cascade), upsert ที่เหลือ, options แทนที่ทั้งชุดต่อ requirement · ตัวเลือกห้ามเป็นอุปกรณ์ที่อยู่ใน kit_contents (ตรวจฝั่ง server คืน error ไทย) · ชื่อซ้ำ 23505 → error ไทย · ทุก mutation logActivity + revalidatePath('/packages'), ('/packages/[id]') · ไม่ใช้ .or()" },
    { "id": "P2-6", "wp": 2, "check": "packages/queries.ts export loadPackages(db, {includeInactive?}) (เรียง sort_order, name th), loadPackageDetail(db, id) → package + requirements (เรียง sort_order) + options + ชื่อประเภท, loadCategoryUnits(db) → Record<categoryId, {id, kind:'item'|'kit', name, serial?, status, inKit: boolean}[]> โดยอ่าน items/kits/kit_contents ผ่าน readAllRows (เรียง created_at,id) อ่านครั้งเดียวต่อตาราง · ทุก query ใช้ .overrideTypes หรือ cast ขอบเขตเดียว" },
    { "id": "P2-7", "wp": 2, "check": "/packages (page + packages-view): การ์ดต่อแพ็กเกจ ชื่อ, ราคา (ถ้ามี), ป้าย 'ปิดใช้', สรุปข้อกำหนด 'คอมพิวเตอร์ ×1 · กล้อง ×2' (ไม่มี = 'ยังไม่ตั้งอุปกรณ์'), ปุ่ม แก้ไข/คัดลอก/ลบ (ลบ useConfirm) และ เลื่อนขึ้น/ลง · ปุ่ม 'เพิ่มแพ็กเกจ' → /packages/new (ฟอร์ม ชื่อ/รายละเอียด/ราคา/เปิดใช้ → สร้างแล้ว redirect ไป /packages/<id>) · ไม่มี window.confirm/alert · ข้อความไทย · getKitManager null → หน้า /packages ดูได้แต่ไม่มีปุ่มแก้ (อ่านอย่างเดียว) หน้า new/[id] redirect('/packages')" },
    { "id": "P2-8", "wp": 2, "blocking": true, "check": "/packages/[id] (package-editor.tsx): แก้ชื่อ/รายละเอียด/ราคา/เปิดใช้ (บันทึกผ่าน updatePackage) · ตารางข้อกำหนด: เพิ่มแถวด้วย Select ประเภท (เฉพาะเปิดใช้ ไม่ซ้ำกับที่มี) + จำนวน (input number 1–50) + ปุ่มลบแถว · ต่อแถว ปุ่ม 'ตัวเลือก: ทุกชิ้นในประเภท (N ชิ้น)' หรือ 'เลือกแล้ว n ชิ้น' เปิด options-picker.tsx (Dialog: ค้นหาชื่อ/serial, checkbox ต่อหน่วย แสดงชนิด อุปกรณ์/กระเป๋า และสถานะ, ปุ่ม 'ใช้ทุกชิ้นในประเภท' = ล้างรายการ) หน่วยที่ inKit ไม่แสดงให้เลือก · ประเภทที่ sales_pick แสดงป้าย 'ทีมขายเลือกชิ้นเอง' บนแถว · ปุ่ม 'บันทึกข้อกำหนด' เรียก setPackageRequirements ครั้งเดียวทั้งชุด แสดง toast · render ที่ 390px ไม่มี min-width คงที่ (ตารางห่อ overflow-x-auto หรือเป็นการ์ดบนจอแคบ)" },
    { "id": "P2-9", "wp": 3, "blocking": true, "check": "packages/actions.ts::setLeadPackages(leadId, picks: {packageId, quantity, units: {requirementId, itemId?|kitId?, variant?}[]}[]) → { warnings: CapacityWarning[] } | { error } · สิทธิ์: admin หรือแผนก 'ฝ่ายประสานงาน' หรือ crm_leads.created_by === userId ไม่งั้น error ไทย · ตรวจ: package เปิดใช้, quantity 1–20, units เฉพาะ requirement ที่ประเภท sales_pick, จำนวน units ≤ quantity×requirement.quantity, หน่วยอยู่ในตัวเลือก (allowedUnits), variant ∈ variants ของประเภท, หน่วยซ้ำในงานเดียว = error ไทย · เขียน lead_packages + lead_package_units แทนที่ทั้งชุด (ลบที่หายไป) · sync crm_leads.package_name = ชื่อแพ็กเกจเรียงตามลำดับเลือกคั่น ' + ' (ไม่มี = null) · quoted_price: เฉพาะเมื่อค่าปัจจุบัน 0/null → Σ price×quantity (ข้ามแพ็กเกจที่ price null) · logActivity SET_LEAD_PACKAGES {leadId, picks} · revalidatePath('/jobs/tracking'), ('/crm/[id]' ด้วย path จริง), ('/dashboard') · คืน warnings จาก capacityWarnings กับข้อมูลที่โหลดผ่าน packages/capacity-data.ts" },
    { "id": "P2-10", "wp": 3, "check": "packages/capacity-data.ts export loadCapacityInputs(db, { leadIds | dateRange }) → รวม lead_packages + units ของงานที่ event_date อยู่ใน [วันงาน−1, วันงาน+1] ของงานเป้าหมาย (หรือ dateRange ที่ส่ง) · packages+requirements+options · units ต่อประเภท (จาก loadCategoryUnits) · อ่านด้วย readAllRows ที่อาจเกิน 1,000 · ไม่ใช้ .or() (อ่านแยกชุด รวมด้วย id) · packages/lead-packages.ts export loadLeadPackages(db, leadIds) → Record<leadId, LeadPackageRow[]> (package name/price/qty/units พร้อมชื่อหน่วยและ variant)" },
    { "id": "P2-11", "wp": 3, "blocking": true, "check": "packages/package-picker.tsx ('use client' props: leadId, value: LeadPackageRow[], packages (เปิดใช้ + ที่เลือกไว้แม้ปิดใช้), categoryUnits สำหรับประเภท sales_pick, canEdit, onSaved?) — แสดงชิปแพ็กเกจที่เลือก (ชื่อ ×จำนวน, หน่วยที่เลือก + แบบประกอบ) · โหมดแก้: เพิ่มแพ็กเกจจาก Select, ปรับจำนวน, ลบ, ต่อข้อกำหนด sales_pick เลือกหน่วย (Select หน่วยในประเภท/ตัวเลือก พร้อมป้ายความว่าง ว่าง/ต่อคิว/ชน/ไม่พร้อม จากข้อมูลที่ action คืนหรือ prop) + Select แบบประกอบ (ไม่บังคับ) · กดบันทึก → setLeadPackages → warnings แสดงกล่องเหลือง/แดงใต้ตัวเลือกทันที (คงอยู่จนบันทึกใหม่) · canEdit=false = แสดงชิปอย่างเดียว · ไม่มี window.confirm/alert · 390px ไม่ล้น" },
    { "id": "P2-12", "wp": 3, "blocking": true, "check": "/jobs/tracking: data.ts โหลด loadLeadPackages สำหรับ rows + packages เปิดใช้ + categoryUnits ของประเภท sales_pick + capacityWarnings ต่องาน (คำนวณฝั่ง server ครั้งเดียวสำหรับงานที่ event_date ใน [วันนี้, +30 วัน]) ใส่ใน TrackingSnapshot: leadPackages, packagesForPicker, salesPickUnits, capacityWarnings: Record<leadId, CapacityWarning[]>, canEditPackages: Record<leadId, boolean> · tracking-view ตารางภาพรวมเพิ่มคอลัมน์ 'แพ็กเกจ' (w-52) ถัดจาก 'งาน' ใส่ PackagePicker (แถวงานหลายอีเวนต์ใช้ rowSpan) + ป้ายแดง/เหลือง 'อุปกรณ์อาจไม่พอ: <ประเภท>' ใต้ชิป · การ์ดมือถือมีบล็อก 'แพ็กเกจ' เดียวกัน · colSpan ของแถวว่างปรับเป็น 10 · min-w ของตารางเพิ่มเป็น 1700 · ไม่กระทบตรรกะความพร้อม/แท็บอื่น · tracking-logic.check, board-logic.check, duty-warnings.check ผ่าน" },
    { "id": "P2-13", "wp": 3, "check": "components/dashboard-alerts/capacity-warnings.ts (pure) + .check.ts: buildCapacityRows({ leads, warningsByLead, viewer, dutyDepartments, today }) → แถว {leadId, customerName, eventDate, daysLeft, warnings} เฉพาะงานที่ event_date ใน [วันนี้, +30] และผู้ดูเห็น (แอดมิน / ฝ่ายประสานงาน / ผู้สร้างการ์ด / แผนกใน pool_duty_kits) เรียงวันงานใกล้สุดก่อน · capacity-panel.tsx แผง 'แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ' ว่าง = คืน null · alert-panels.tsx (buildAlertData + AlertPanels) รวมแผงนี้ทั้ง /dashboard และ /jobs/tracking · กดแถว → /jobs/tracking?lead=<id>" },
    { "id": "P2-14", "wp": 3, "blocking": true, "check": "CRM: add-lead-dialog.tsx Select แพ็กเกจอ่านจาก packages เปิดใช้ (prop ใหม่ packages โหลดใน crm/page.tsx หรือที่ dialog ถูกใช้) ส่ง hidden package_id + package_name=ชื่อ และเติมราคาเสนอจาก packages.price · crm/actions.ts::createLead อ่าน package_id → insert lead_packages (quantity 1) หลังสร้าง lead · customer-card.tsx: โหมดดูแสดงชิปจาก leadPackages (ไม่มี = package_name เดิมผ่าน fallback crm_settings เหมือนเดิม) โหมดแก้แทน EditSelect แพ็กเกจด้วย PackagePicker (บันทึกแยกจากการ์ดด้วย setLeadPackages) · lead-detail.tsx ไม่เกิน 500 บรรทัด ถอด handlePackageChange/packages จาก crm_settings · crm/[id]/page.tsx โหลด loadLeadPackages + packages + salesPickUnits · crm/settings/settings-view.tsx แท็บแพ็กเกจมีแบนเนอร์ 'แพ็กเกจใหม่ตั้งที่ คลังอุปกรณ์ → แพ็กเกจ (ลิงก์ /packages) รายการนี้ใช้แสดงชื่อของงานเก่าเท่านั้น' · scripts/crm-lead-detail-render.check.ts ปรับให้ผ่านโดยเพิ่ม props ใหม่ (ชุด A มี leadPackages 1 รายการ) · scripts/crm-leads-load.check.ts และชุดตรวจ crm อื่นผ่าน (เติม SCHEMA lead_packages/lead_package_units/packages ตามต้องการ) · crm/ lint 0 problems" },
    { "id": "P2-15", "wp": 4, "blocking": true, "check": "`npx tsc --noEmit --incremental false` = 1 error เดิม · eslint ไฟล์ที่แตะ error 0 และ warning ไม่เกิน baseline ของไฟล์นั้น · โฟลเดอร์ crm = 0 problems (ยกเว้น kanban-board.tsx error เดิม 1 จุดถ้ายังอยู่) · ชุดตรวจ exit 0: package-logic.check, capacity-warnings.check, tracking-logic.check, board-logic.check, duty-warnings.check, proxy-session.check, session-hardening.check, crm-lead-detail-render.check, crm-leads-load.check, category-logic.check, stock-settings-render.check" },
    { "id": "P2-16", "wp": 4, "check": "package.json 1.48.0 · UPDATES[0] date `date +%F`, tag 'ใหม่', module 'คลังอุปกรณ์', title+points ไทยมุมมองผู้ใช้ ครอบ: หน้าแพ็กเกจ (ประเภท × จำนวน × เลือกอุปกรณ์ที่ใช้ได้), ทีมขายเลือกแพ็กเกจ+ตู้ให้งานจากหน้าติดตามงานหรือการ์ดลูกค้า, คำเตือนอุปกรณ์อาจไม่พอ 3 จุด, แพ็กเกจเดิมใน CRM ย้ายมาอยู่ที่เดียว · spec หัวข้อนี้อัปเดตผล · ไม่มี .or() ในโค้ดอ่านใหม่ · ไม่แตะ .claude/settings.local.json · ไม่ next build / ไม่ commit" }
  ],
  "pass_threshold": 0.9
}
```

**ผลรอบ A (e2c71ae):** WP1 + WP2 (P2-1…P2-8) commit แล้ว

**ผล Critic เฟส 2 (2026-10-07): ผ่านทั้งสองรอบ รอบละครั้ง** `{"pass": true, "score": 0.97, "passed_ids": ["P2-1"…"P2-16"], "failures": []}` — tsc 1 error เดิม · ชุดตรวจ 14 ตัวผ่าน (รวม `scripts/packages-render.check.ts`, `scripts/package-picker-render.check.ts` ที่ Critic เพิ่ม) · eslint ไฟล์ที่แตะ 0 error, warning เท่า baseline (crm/actions 1, add-lead-dialog 11, crm-dashboard 3 เท่าเดิม) · merge เข้า main เป็น v1.48.0 (ยังไม่ push)
ส่วนที่ยอมรับต่างจากเกณฑ์: CHECK ของ `lead_package_units` เป็น `(item_id IS NULL OR kit_id IS NULL)` ไม่ใช่ `<>` เพราะ FK เป็น ON DELETE SET NULL (ใช้ `<>` แล้วลบอุปกรณ์/กระเป๋าที่ถูกเลือกไว้ไม่ได้) · แบบประกอบไม่บังคับ (ตาม Q17)
ยังไม่ได้ลอง: ทุกหน้าในเบราว์เซอร์จริง · migration บน postgres ชั่วคราว (Docker ไม่ได้เปิด) · **prod ต้องรัน `20261011_packages.sql` ก่อน deploy** (loadPickerContext มี try/catch ถ้ายังไม่รันหน้าจะไม่ล้ม แต่หน้า /packages จะว่าง) · ของเจ้าของที่ควรลองจริง: (1) ตั้งแพ็กเกจ "ตู้ประกอบ" ที่มีข้อกำหนดประเภท "ตู้ประกอบ" (2) เลือกให้งาน 2 งานวันเดียวกันด้วยตู้ชุดเดียวกัน → ต้องขึ้นแดง (3) กล่องเพิ่มลูกค้าเลือกแพ็กเกจแล้วราคาเสนอเติมให้ (4) ดูแผงใหม่บนหน้าแรก (5) ตารางติดตามงานกว้าง 1,700px เลื่อนซ้ายขวา และการ์ดมือถือ

**ผลรอบ B (รายละเอียดจาก Executor):** WP3 + WP4 (P2-9…P2-16)
- ไฟล์ใหม่: `packages/lead-packages.ts` (loadLeadPackageRows, loadLeadPackages, loadPickerPackages) · `packages/capacity-data.ts` (loadCapacityInputs, warningsForLeads, capacityWarningsForLeads, loadPickerContext — พัง/ยังไม่ migrate = ข้อมูลว่าง หน้าไม่ล้ม) · `packages/package-picker.tsx` · `components/dashboard-alerts/{capacity-warnings.ts,.check.ts,capacity-panel.tsx}`
- กติกา pure เพิ่มใน `package-logic.ts`: canEditLeadPackages, checkLeadPicks, leadPackageName, quotedPriceFor, unitAvailability (ป้าย ว่าง/ต่อคิว/ชน/ไม่พร้อม ใช้ resourceClashes), capacitySummary — ครอบใน package-logic.check
- `setLeadPackages` คืน `{ success, warnings, quotedPrice, packageName }` — หน้า lead ใช้ quotedPrice/packageName ปรับฟอร์มการ์ดการเงิน · การ์ดการเงินเลิกส่ง `package_name` ให้ updateLead (กันค่าเก่าในฟอร์มทับชื่อที่เพิ่ง sync)
- ป้ายความว่างในตารางภาพรวมโหลดชิ้นที่งานอื่นเลือกตั้งแต่วันนี้ถึงวันงานไกลสุดในตาราง (ไม่เกิน 365 วัน) · คำเตือนต่องานคิดเฉพาะ [วันนี้, +30]
- งานที่เลือก "จำนวนชุด" แล้วตู้ยังไม่ครบ = ป้ายเหลือง "ยังไม่เลือก ตู้ประกอบ n" (ไม่บล็อกการบันทึก — กล่องเพิ่มลูกค้าบันทึกแพ็กเกจโดยยังไม่เลือกตู้)
- กระดิ่ง `packing_requested` เลื่อนไปเฟส 3 ตามแผน

### เฟส 3 — ใบจัดของ + จุดรับของ + ความพร้อม "จัดของ" (v1.49.0, migration 3.3 + 3.4) · ขนาด L (แตกเป็น 3 WP)

- WP1 กติกา + server: `packing/packing-logic.ts` (+check: โครงบรรทัดจากแพ็กเกจ, สถานะ/transition ที่ถูกต้อง, เส้นทางหยิบเรียงตามชั้น, ป้ายความว่างจาก clash ทั่วไป, `isMissingPacking`), `packing/actions.ts` (create/setLines/pick/unpick/confirm/reopen/cancel + bridge `event_kits`), `packing/queries.ts`, `scripts/packing-flow.check.ts` (ฐานข้อมูลจำลอง: เปิดใบ → เลือก → หยิบ → ยืนยัน; กรณีหยิบของที่ in_use ต้องถูกปฏิเสธ; ยกเลิกใบคืนสถานะ), ขยาย `kitBookingClashes` → `resourceClashes`, `tracking-logic.ts` ป้าย + `isMissingKits` + `tracking-logic.check.ts`, logger, notifications
- WP2 หน้าทีมจัดของ: `/packing` (คิว), `/packing/[id]` (เลือกของ / หยิบ / ยืนยัน + รูป + จุด), `/packing/[id]/print`, แท็บ "จัดของ" ในพูล (ปุ่มเปิดใบ, สถานะใบ), `/stock/settings` แท็บจุดรับของ + พิมพ์ QR, bucket + อัปโหลดรูป
- WP3 release: proxy (`/pickup` ยังไม่เปิดในเฟสนี้ก็ได้) + nav + dictionary + What's New + CONTEXT.md
- AC ย่อ (เพิ่มจากข้างบน): หน้าหยิบของ render ที่ 360/390px ไม่ล้นจอ · ยืนยันจัดของโดยไม่มีรูป = error ไทย · กระเป๋าในใบปรากฏใน `event_kits` และหายเมื่อลบบรรทัด · งานที่ใบถึงพร้อมรับ ไม่ขึ้น "ขาด: จัดของ" · อีเวนต์เก่าที่มีแต่ `event_kits` จัดครบยังผ่านความพร้อม · `cleanupOrphanedItems` ไม่รีเซ็ตของในใบที่ยังไม่ done
- What's New: "ทีมจัดของมีใบจัดของ: เลือกของตามแพ็กเกจ เดินหยิบตามชั้น ถ่ายรูปยืนยัน แล้ววางที่จุดรับของ"

#### เฟส 3 — แผนและเกณฑ์ที่ล็อก (2026-10-07) · branch `feature/equipment-p3` · 2 รอบ Executor

ขอบเขตเฟสนี้: ใบจัดของตั้งแต่ **เปิดใบ → เลือกของ → กำลังหยิบ → พร้อมรับ** (+ ถอยกลับ/ยกเลิก) · จุดรับของ (ตั้งค่า + QR + หน้า `/pickup/[id]` แบบอ่านอย่างเดียว) · ความพร้อมข้อ "จัดของ" · ป้าย "กระเป๋า/จัดกระเป๋า" → "จัดของ" ทั่วหน้าติดตามงาน · กระดิ่ง `packing_requested` + `packing_ready` · รับของ/คืนของ/คืนชั้น = เฟส 4
การตัดสินใจที่ล็อก: ใบจัดของ 1 ใบต่ออีเวนต์ (งานไม่มีอีเวนต์ = `resolveLeadEvent` สร้างให้ ต้อง export) · สถานะอุปกรณ์เป็น `in_use` ตั้งแต่หยิบ (Q8) · บรรทัดกระเป๋า = upsert `event_kits` ตอนเพิ่มบรรทัด และลบแถว `event_kits` ตอนลบบรรทัด/ยกเลิกใบ (`ponytail:` ใบจัดของเป็นเจ้าของการจองของอีเวนต์นั้น) · หยิบกระเป๋า = นำออกทุกชิ้นที่ `available` ในกระเป๋า + `event_logs` checkout + `syncPacked` (ใช้กติกาเดียวกับ `kits/[id]/check/actions.ts` — แยก helper ออกมาใช้ร่วม ไม่ก๊อป) · หยิบอุปกรณ์เดี่ยว = `available` → `in_use` + `event_logs` checkout (kit_id null) · ยกเลิกหยิบ = ย้อนกลับ (เฉพาะก่อนพร้อมรับ) · ยกเลิกใบ (เลือกของ/กำลังหยิบ) = ยกเลิกหยิบทุกบรรทัด + ลบ `event_kits` ที่ใบนี้สร้าง + ลบใบ · ถอยจากพร้อมรับเป็นกำลังหยิบได้เฉพาะก่อนรับของ (เคลียร์ `packed_at`) · ความพร้อม: อีเวนต์ที่ยังไม่ปิดของงาน ทุกใบต้อง "มีใบจัดของที่สถานะ ≥ พร้อมรับ" หรือ (ไม่มีใบ) "มีการจองกระเป๋าและจัดครบทุกใบ" แบบเดิม · ทีมจัดของ = admin หรือแผนกใน `pool_duty_kits` (ค่าเริ่มต้น `POOL_TEAM_DEFAULTS.pool_duty_kits`) · เพิ่ม "ทีมจัดของ" ใน `lib/departments.ts` · กระดิ่ง `packing_requested` (reference `crm_lead` → `/jobs/tracking?tab=kits&lead=<id>`) ยิงจาก `setLeadPackages` เมื่องานตอบรับแล้ว (`isWonStatus`) และจาก `autoCreateJobsFromAcceptedLead` เมื่องานมี `lead_packages` · `packing_ready` (reference `packing_list` → `/packing/<id>`) ยิงถึงหัวหน้างาน (`jobs.claimed_by` ของใบงานหน้างาน) + ทุกคนใน `event_staff` ของอีเวนต์ · migration 3.4 เพิ่ม `packing_list` ใน CHECK ของ notifications

**รอบ A = WP1 ฐานข้อมูล + กติกา + server** · **รอบ B = WP2 หน้าจอ + WP3 release (v1.49.0)**

```json
{
  "plan": [
    "WP1: supabase/migrations/20261012_packing_lists.sql (3.3: pickup_spots, packing_lists, packing_list_items, bucket packing-photos) + 20261013_notifications_packing.sql (3.4) · lib/departments.ts · packing/{types,packing-logic,packing-logic.check,queries,permissions,actions}.ts · kits/[id]/check/kit-check-core.ts (แยก checkBooking/kitItems/syncPacked/นำออก/รับคืน ให้ใช้ร่วม) · jobs/actions.ts export resolveLeadEvent · tracking-logic.ts (KitReadiness + packingLists, ป้าย) + check · jobs/tracking/data.ts snapshot.packingLists · dashboard-alerts/duty-warnings.ts input + alert-panels label · lib/logger.ts · lib/notifications.ts + components/notification-category.ts + URL 3 ที่ · proxy.ts (/packing stock, /pickup/<id> stock|events) + scripts/proxy-session.check.ts · lib/nav-config.ts + lib/dictionary.ts · items/cleanup-items.ts guard · scripts/packing-flow.check.ts",
    "WP2: packing/{page,packing-queue-view}.tsx · packing/[id]/{page,packing-list-view,select-step,pick-step,confirm-step}.tsx · packing/[id]/print/{page,print-view}.tsx · stock/settings แท็บจุดรับของ (pickup-spots-section.tsx + actions) + stock/settings/pickup-print/page.tsx · pickup/[id]/{page,pickup-view}.tsx (อ่านอย่างเดียว) · jobs/tracking/pool-tabs.tsx KitSummary + duty-tabs ป้าย/ปุ่มใบจัดของ · tracking-view/page ส่ง packingLists",
    "WP3: package.json 1.49.0 · whats-new · CONTEXT.md หมวด อุปกรณ์ (ศัพท์หัวข้อ 2 ที่ใช้แล้ว) · รันชุดตรวจทั้งหมด · รายงาน"
  ],
  "acceptance_criteria": [
    { "id": "P3-1", "wp": 1, "blocking": true, "check": "20261012_packing_lists.sql idempotent: pickup_spots(id, name NOT NULL, code UNIQUE NOT NULL, note, is_active default true, sort_order, created_at) · packing_lists(id, event_id → events CASCADE UNIQUE, lead_id → crm_leads SET NULL, status text CHECK IN ('selecting','picking','ready','out','returned','done') default 'selecting', packed_at, packed_by → profiles SET NULL, photo_urls jsonb default '[]', spot_id → pickup_spots SET NULL, staged_at, handed_over_at, handed_over_by, returned_at, returned_by, return_note, return_photo_urls jsonb default '[]', restocked_at, restocked_by, created_by, created_at, updated_at) · packing_list_items(id, list_id → packing_lists CASCADE, package_id → packages SET NULL, category_id → equipment_categories SET NULL, item_id → items SET NULL, kit_id → kits SET NULL, CHECK (item_id IS NULL OR kit_id IS NULL), variant, locked bool default false, picked_at, picked_by, handed_over_at, returned_at, return_condition CHECK IN ('available','damaged','maintenance','lost') null ได้, return_note, restocked_at, restocked_by, created_at, UNIQUE(list_id, item_id), UNIQUE(list_id, kit_id)) · index packing_lists(lead_id), (status), packing_list_items(list_id), (item_id), (kit_id) · RLS ทุกตาราง · bucket packing-photos public 5MB jpeg/png/webp + policy แบบ 20260317_create_checkin_photos_bucket.sql · COMMENT ไทย · 20261013_notifications_packing.sql: drop CHECK เดิมแบบ 20260828 แล้วเพิ่ม 'packing_list' ต่อท้ายรายการเดิมทั้งหมด (idempotent)" },
    { "id": "P3-2", "wp": 1, "blocking": true, "check": "packing/packing-logic.ts (pure) export: PACKING_STATUSES ตามลำดับ + PACKING_STATUS_LABELS ไทย (เลือกของ/กำลังหยิบ/พร้อมรับ/ออกงาน/คืนแล้ว/คืนชั้นแล้ว) · canTransition(from, to): selecting→picking, picking→ready, ready→picking (ถอย), picking→selecting (ถอย) เท่านั้นในเฟสนี้ · scaffoldLines(leadPackages, packages) → โครงบรรทัดต่อข้อกำหนด: {packageId, categoryId, requirementId, slots: quantity×จำนวนชุด, lockedUnits จาก lead_package_units (locked:true พร้อม variant)} · canStartPicking(lines, scaffold) → ทุกข้อกำหนดมีหน่วยครบจำนวน (ของเสริมไม่นับ) ไม่งั้น {error} ระบุประเภทที่ขาด · canPickLine(line, unitStatus / kitItemStatuses) → อุปกรณ์เดี่ยวต้อง available · กระเป๋าต้องมีชิ้น available ≥1 และไม่มีชิ้น in_use ที่ออกกับใบอื่น · canConfirmReady(list, lines) → ทุกบรรทัด picked_at + photo_urls ≥1 + spot_id ไม่งั้น {error} ไทยแยกกรณี · pickRoute(lines, shelfOf) → กลุ่มเรียง ห้อง → รหัสตู้ → ระดับ (numeric) → ชื่อ, บรรทัดไม่มีชั้น = กลุ่ม 'ยังไม่มีชั้น' ท้ายสุด, อุปกรณ์ในกระเป๋าใช้ชั้นของกระเป๋า · lineAvailability(unit, event, otherLineBookings) ใช้ resourceClashes (ว่าง/ต่อคิว/ชน/ไม่พร้อม/ออกงานอยู่) · packing-logic.check.ts ≥ 20 assertion ครอบทุกฟังก์ชัน exit 0" },
    { "id": "P3-3", "wp": 1, "blocking": true, "check": "tracking-logic.ts: KitReadiness เพิ่ม `packingLists: { eventId: string; status: string }[]` (default []) และ `openEventIds: string[]` · isMissingKits: onsiteSkipped = ไม่ขาด · ถ้ามี packingLists: ขาดเมื่อมีอีเวนต์เปิดใดไม่มีใบ หรือใบสถานะ ∉ {ready,out,returned,done} (อีเวนต์ที่ไม่มีใบแต่ bookings ของอีเวนต์นั้น packed ครบ = ผ่าน) · ไม่มีทั้งใบและการจอง = ขาด (เดิม) · kitReadinessByLead รับพารามิเตอร์ที่ 5 `packingLists?: { leadId, eventId, status }[]` และใช้ lead.events เป็น openEventIds · ป้าย: MISSING_LABELS.kits 'จัดของ', WAIVER_LABELS/‘ไม่ต้องจัดกระเป๋า’ → 'ไม่ต้องจัดของ', DUTY_LABELS_TH.kits 'จัดของ', CLAIM_LABELS.kits 'รับจัดของ' · tracking-view POOL_CHIPS kits label 'จัดของ' · alert-panels MISSING_BAR_LABELS.kits 'จัดของ' · jobs/settings/settings-view.tsx ป้าย 'หน้าที่: จัดของ' + hint 'แผนกที่ดูแลอุปกรณ์/จัดของ' · tracking-logic.check.ts ปรับ fixture + เพิ่ม assert isMissingKits 4 กรณี (ใบ ready ผ่าน, ใบ picking ขาด, อีเวนต์ไม่มีใบแต่จองครบผ่าน, อีเวนต์เปิด 2 ใบมีใบเดียวขาด) · duty-warnings.ts DutyWarningInput เพิ่ม packingLists? ส่งต่อให้ kitReadinessByLead · duty-warnings.check, board-logic.check ผ่าน" },
    { "id": "P3-4", "wp": 1, "blocking": true, "check": "packing/permissions.ts export getPackingTeam() → { userId, isAdmin, department } | null = admin หรือ canActOnPool(department, false, แผนกจาก job_settings 'pool_duty_kits' หรือ POOL_TEAM_DEFAULTS) · packing/actions.ts ('use server') export createPackingList(leadId, eventId?) → { id } | { error } (งานต้อง isWonStatus และมี lead_packages ≥1; อีเวนต์ผ่าน resolveLeadEvent (export จาก jobs/actions.ts) pickExisting; มีใบของอีเวนต์นี้แล้ว = คืน id เดิม; สร้างบรรทัด locked จาก lead_package_units) · setPackingLines(listId, lines: {packageId?, categoryId?, requirementId?, itemId?|kitId?, variant?}[]) เฉพาะสถานะ selecting (แทนที่ทั้งชุดยกเว้นบรรทัด locked ซึ่งเปลี่ยนไม่ได้; หน่วยซ้ำ = error; หน่วยต้องอยู่ใน allowedUnits ของข้อกำหนด (ของเสริมไม่ตรวจ); อุปกรณ์ใน kit_contents เป็นบรรทัดเดี่ยวไม่ได้) และ sync event_kits: upsert สำหรับบรรทัดกระเป๋า, ลบสำหรับบรรทัดกระเป๋าที่หายไป, recomputeKitPointers · startPicking(listId) → canStartPicking → status picking · backToSelecting(listId) เฉพาะ picking และยังไม่มีบรรทัดที่หยิบ · pickLine(lineId) / unpickLine(lineId) ตามกติกาที่ล็อก (ใช้ kit-check-core; อุปกรณ์เดี่ยวเขียน event_logs ด้วย kit_id null) เฉพาะสถานะ picking · uploadPackingPhoto(formData {listId, file}) → bucket packing-photos path `<listId>/<ts>_<name>` ตรวจ image/* ≤5MB · confirmPacking(listId, { photoUrls: string[], spotId }) → canConfirmReady → status ready + packed_at/by + spot_id + staged_at + photo_urls → กระดิ่ง packing_ready · reopenPacking(listId) เฉพาะ ready → picking (เคลียร์ packed_at/staged_at ไม่ลบรูป) · cancelPackingList(listId) เฉพาะ selecting/picking → unpick ทุกบรรทัด + ลบ event_kits ของกระเป๋าในใบ + ลบใบ · ทุก action: getPackingTeam() ก่อน (null → error ไทย), อีเวนต์ปิดแล้ว = error, logActivity (ActionType ใหม่ CREATE_PACKING_LIST, UPDATE_PACKING_LINES, START_PICKING, PICK_PACKING_LINE, UNPICK_PACKING_LINE, CONFIRM_PACKING, REOPEN_PACKING, CANCEL_PACKING_LIST, CREATE_PICKUP_SPOT, UPDATE_PICKUP_SPOT, DELETE_PICKUP_SPOT), revalidatePath('/packing'), (`/packing/${id}`), ('/jobs/tracking'), (`/kits/${kitId}/check`) · ไม่ใช้ .or() · ไม่ throw" },
    { "id": "P3-5", "wp": 1, "check": "kits/[id]/check/kit-check-core.ts (ไม่ใช่ 'use server') export checkBooking, kitItems, syncPacked, checkoutKitItems(db, {eventId, kitId, itemIds, userId}), checkinKitItem(...) ที่ย้ายมาจาก actions.ts โดย actions.ts เดิมเรียกใช้และพฤติกรรม/ข้อความเดิมทุกอย่าง (consumable-logic.check, shelf-logic.check ผ่าน) · pickup spots: stock/settings/actions.ts เพิ่ม createPickupSpot/updatePickupSpot/deletePickupSpot (getKitManager; code ซ้ำ 23505 → ไทย; ลบไม่ได้ถ้ามี packing_lists.spot_id อ้าง → ไทย) · items/cleanup-items.ts: ไม่รีเซ็ตอุปกรณ์ที่อยู่ใน packing_list_items ของใบที่ status ∉ {done} (อ่าน item_id ของใบเหล่านั้นด้วย readAllRows)" },
    { "id": "P3-6", "wp": 1, "blocking": true, "check": "scripts/packing-flow.check.ts (ฐานข้อมูลจำลองแบบ purchasing-flow: SCHEMA ต่อตาราง, 1,000 แถว, .or() throw) รัน action จริง: (a) createPackingList ของงานไม่มีแพ็กเกจ = error · (b) สร้างใบ → บรรทัด locked จากตู้ที่ทีมขายเลือก มี variant · (c) setPackingLines ใส่อุปกรณ์เดี่ยว + กระเป๋า → event_kits มีแถว · ใส่อุปกรณ์ที่อยู่ในกระเป๋า = error · ใส่หน่วยนอกตัวเลือก = error · (d) startPicking ตอนข้อกำหนดยังไม่ครบ = error; ครบ = picking · (e) pickLine อุปกรณ์เดี่ยว → items.status in_use + event_logs 1 แถว kit_id null · pickLine กระเป๋า → ทุกชิ้น available ใน kit เป็น in_use + event_kits.packed_at ไม่ว่าง · pickLine ชิ้นที่ in_use อยู่ = error · (f) confirmPacking ไม่มีรูป = error, ไม่มีจุด = error, ยังหยิบไม่ครบ = error; ครบ = ready + notifications packing_ready ถึง claimed_by + event_staff (ไม่รวมผู้ทำ) · (g) kitReadinessByLead + isMissingKits กับใบ ready = ไม่ขาด, ใบ picking = ขาด · (h) reopenPacking → picking, packed_at null · (i) unpickLine คืนสถานะ · cancelPackingList → items available, event_kits ไม่มีแถว, ใบหาย · (j) ผู้ใช้แผนกอื่น (ไม่ใช่ทีมจัดของ/แอดมิน) เรียกทุก action = error · (k) cleanupOrphanedItems ไม่รีเซ็ตของในใบ picking · บรรทัดสุดท้าย 'packing-flow: ผ่านทั้งหมด'" },
    { "id": "P3-7", "wp": 1, "check": "lib/notifications.ts NotificationType เพิ่ม packing_requested, packing_ready · ReferenceType เพิ่ม 'packing_list' · notification-category.ts: หมวด 'stock' ป้าย 'คลังอุปกรณ์' prefix ['packing_'] + TYPE_CONFIG/ไอคอน · URL ใน notification-bell.tsx, notification-toast.tsx, notifications/page.tsx: packing_requested → /jobs/tracking?tab=kits&lead=<reference_id>, reference_type packing_list → /packing/<reference_id> · setLeadPackages ยิง packing_requested ถึงสมาชิกแผนก pool_duty_kits เมื่อ lead เป็น won (ไม่ยิงซ้ำถ้าใบจัดของของงานมีอยู่แล้ว) · autoCreateJobsFromAcceptedLead ยิงเมื่อ lead มี lead_packages" },
    { "id": "P3-8", "wp": 1, "check": "proxy MODULE_ROUTES.stock เพิ่ม '/packing' · ข้อยกเว้นแคบ `^/pickup/[^/]+$` ผ่านเมื่อมี stock หรือ events (ไม่ต้องอยู่ใน MODULE_ROUTES — ถ้าไม่มีทั้งสอง redirect /dashboard) · proxy-session.check เพิ่ม: /packing stock ผ่าน · events-only → /dashboard · /pickup/<id> stock ผ่าน, events ผ่าน, none → /dashboard · nav กลุ่ม stock เพิ่ม { href: '/packing', icon: ClipboardList, labelKey: 'packing' } ถัดจาก /packages · dictionary nav.packing 'Packing lists' / 'ใบจัดของ' · lib/departments.ts เพิ่ม 'ทีมจัดของ' ต่อท้าย · jobs/tracking/data.ts โหลด packing_lists (id, event_id, lead_id, status) ของ leadIds ใส่ snapshot.packingLists และส่งเข้า kitReadinessByLead ทุกจุดที่เรียก (tracking-view, duty-warnings ผ่าน buildAlertData, mcp-tools job_readiness ถ้ามี)" },
    { "id": "P3-9", "wp": 2, "blocking": true, "check": "/packing (page + packing-queue-view): เฉพาะ getPackingTeam (null → redirect /stock/dashboard) · 3 กลุ่ม: 'รอเปิดใบ' (งาน won ไม่ archive มี lead_packages อีเวนต์เปิดที่ยังไม่มีใบ วันงาน ≥ วันนี้−1 เรียงวันใกล้ก่อน พร้อมปุ่ม 'เปิดใบจัดของ' → createPackingList → ไป /packing/<id>) · 'กำลังทำ' (selecting/picking) · 'พร้อมรับ' (ready) แต่ละการ์ด: ลูกค้า วันงาน เวลา สถานที่ ชิปแพ็กเกจ สถานะใบ จำนวนหยิบแล้ว x/y จุดรับของ · ว่าง = ข้อความไทย · 390px ไม่ล้น" },
    { "id": "P3-10", "wp": 2, "blocking": true, "check": "/packing/[id] (page + packing-list-view + select-step/pick-step/confirm-step): หัว = ลูกค้า วันงาน เวลา สถานที่ แพ็กเกจ สถานะ (stepper 3 ขั้นของเฟสนี้) · selecting: ต่อแพ็กเกจ → ต่อข้อกำหนด: ช่องเลือกหน่วยตามจำนวน (Select จาก allowedUnits พร้อมป้าย ว่าง/ต่อคิว/ชน/ไม่พร้อม/ออกงานอยู่ จาก lineAvailability; ชน = เลือกได้แต่ useConfirm) บรรทัด locked แสดงชื่อ + แบบประกอบ แก้ไม่ได้ · ส่วน 'ของเสริม' เพิ่มหน่วยใดก็ได้ (ค้นหาชื่อ) · ปุ่ม 'บันทึกรายการ' (setPackingLines) + 'สร้างใบจัดของ' (startPicking → error ระบุที่ขาด) + 'ยกเลิกใบ' (useConfirm) · picking: รายการเรียงตาม pickRoute หัวกลุ่ม 'ห้อง › ตู้ › ชั้น' แต่ละบรรทัด ชื่อ/serial/ชนิด ปุ่ม 'หยิบแล้ว' (≥44px) / 'ยกเลิกหยิบ' · ชิ้นที่หยิบไม่ได้แสดงเหตุผล + ปุ่ม 'เปลี่ยนของ' (กลับไปแก้บรรทัดนั้นใน dialog เลือกหน่วยอื่นในตัวเลือก) · แถบล่าง 'หยิบแล้ว x/y' · ปุ่ม 'พิมพ์ใบจัดของ' → /packing/<id>/print · ส่วนยืนยัน: อัปโหลดรูป ≥1 (compressImage จาก lib/utils แล้ว uploadPackingPhoto) แสดงรูปที่อัปแล้ว ลบได้ก่อนยืนยัน, Select จุดรับของ (เปิดใช้), ปุ่ม 'ยืนยันจัดของ' disabled จนกว่าจะครบ → confirmPacking · ready: สรุปบรรทัด + รูป + จุด + ปุ่ม 'แก้ไข (ถอยเป็นกำลังหยิบ)' (useConfirm) · ไม่มี window.confirm/alert · 390px ไม่ล้น · ข้อความไทย" },
    { "id": "P3-11", "wp": 2, "check": "/packing/[id]/print: หน้า A4 (print CSS แบบ qr-sheet-view) หัวงาน + QR ค่า <origin>/packing/<id> (react-qr-code, origin จาก lib/request-origin) + รายการเรียงตาม pickRoute มีช่อง ☐ ต่อบรรทัดและชื่อชั้น · ปุ่มพิมพ์ · stock/settings: แท็บ/หัวข้อ 'จุดรับของ' (pickup-spots-section.tsx) เพิ่ม/แก้/ปิดใช้/ลบ (useConfirm) ชื่อ+รหัส+หมายเหตุ · ปุ่ม 'พิมพ์ QR จุดรับของ' → /stock/settings/pickup-print ใช้ QrSheetView ค่า QR = <origin>/pickup/<id> caption 'สแกนเพื่อรับของ / คืนของ' · /pickup/[id] (อ่านอย่างเดียวในเฟสนี้): ชื่อจุด + รายการใบจัดของที่ spot_id = จุดนี้ และ status ∈ {ready, out} (ลูกค้า วันงาน สถานะ ลิงก์ /packing/<id> เฉพาะคนที่มี stock) + ข้อความ 'ปุ่มรับของ/คืนของมาในรุ่นถัดไป' · ไม่พบจุด = notFound" },
    { "id": "P3-12", "wp": 2, "blocking": true, "check": "หน้าติดตามงาน: snapshot.packingLists ส่งเข้า TrackingView → KitSummary (pool-tabs.tsx) และแท็บจัดของ (duty-tabs.tsx): ถ้าอีเวนต์มีใบจัดของ → ชิปสถานะใบ (ป้ายไทย + 'หยิบแล้ว x/y' เมื่อ picking) + ลิงก์ 'เปิดใบ' ไป /packing/<id> และซ่อนปุ่มจอง/ยกเลิกจองกระเป๋าของอีเวนต์นั้น (การจองเป็นของใบแล้ว) · ถ้าไม่มีใบแต่งานมี lead_packages และผู้ดูเป็นทีมจัดของ → ปุ่ม 'เปิดใบจัดของ' (createPackingList แล้ว router.push) · ไม่มี lead_packages → UI จองกระเป๋าเดิมทุกอย่าง · ReadinessCell/สิ่งที่ยังขาดแสดง 'จัดของ' · snapshot.canPack: boolean (getPackingTeam) · tracking-logic.check/duty-warnings.check ผ่าน · ไทม์ไลน์เลนกระเป๋าไม่เปลี่ยน" },
    { "id": "P3-13", "wp": 3, "blocking": true, "check": "`npx tsc --noEmit --incremental false` = 1 error เดิม · eslint ไฟล์ที่แตะ error 0 warning ไม่เกิน baseline · kits/events/crm ไม่เพิ่มปัญหา · ชุดตรวจ exit 0: packing-logic.check, scripts/packing-flow.check, tracking-logic.check, board-logic.check, duty-warnings.check, capacity-warnings.check, package-logic.check, consumable-logic.check, shelf-logic.check, category-logic.check, proxy-session.check, session-hardening.check, crm-lead-detail-render.check, crm-leads-load.check, stock-settings-render.check, packages-render.check, package-picker-render.check" },
    { "id": "P3-14", "wp": 3, "check": "package.json 1.49.0 · UPDATES[0] date `date +%F`, tag 'ใหม่', module 'คลังอุปกรณ์', ไทย ครอบ: ใบจัดของ (เปิดจากหน้าติดตามงานหรือเมนูใบจัดของ, เลือกของตามแพ็กเกจ, เดินหยิบตามชั้น, ถ่ายรูปยืนยัน, วางที่จุดรับของ), จุดรับของ + QR, ความพร้อม 'จัดของ' แทน 'กระเป๋า', แจ้งเตือนทีมจัดของ/หัวหน้างาน · CONTEXT.md เพิ่มหมวด '### อุปกรณ์ (Equipment)' ก่อนหมวด ติดตามงาน ด้วยศัพท์จากหัวข้อ 2 ที่ใช้แล้ว (ประเภทอุปกรณ์, หน่วยอุปกรณ์, แพ็กเกจ, ข้อกำหนด, ตัวเลือกอุปกรณ์, ตู้, แบบประกอบ, ประเภทที่ทีมขายเลือกชิ้นเอง, แพ็กเกจของงาน, อุปกรณ์อาจไม่พอ, ใบจัดของ, หยิบของ, ยืนยันจัดของ, จุดรับของ, ทีมจัดของ) และแก้ 'จัดกระเป๋า (Packing)' ให้บอกว่าถูกแทนด้วยใบจัดของสำหรับงานที่มีแพ็กเกจ · ไม่แตะ .claude/settings.local.json · ไม่ next build / ไม่ commit · ไม่มี .or() ในโค้ดอ่านใหม่" }
  ],
  "pass_threshold": 0.9
}
```

**ผล Critic เฟส 3 (2026-10-07): ผ่านทั้งสองรอบ รอบละครั้ง** `{"pass": true, "score": 0.97, "passed_ids": ["P3-1"…"P3-14"], "failures": []}` — tsc 1 error เดิม · ชุดตรวจ 19 ตัวผ่าน (รวม `scripts/packing-flow.check.ts` 11 กรณี + replacePackingLine และ `scripts/packing-render.check.ts` 180 ข้อ) · eslint ไฟล์ที่แตะ 0/0 · kits/events/crm = 44 เดิม · merge เข้า main เป็น v1.49.0 (ยังไม่ push)
ส่วนที่ยอมรับต่างจากเกณฑ์: เพิ่ม action `replacePackingLine` และ ActionType `BACK_TO_SELECTING_PACKING` นอกรายการ (จำเป็นต่อปุ่ม "เปลี่ยนของ"/ถอยขั้น) · `KitReadiness.packingLists/openEventIds` เป็น optional · ทีมจัดของเติมช่องตู้ที่ทีมขายยังเลือกไม่ครบได้ (บรรทัด locked ยังเปลี่ยนไม่ได้)
ยังไม่ได้ลอง: ทุกหน้าในเบราว์เซอร์จริง — โดยเฉพาะ sticky bar ล่างของหน้าใบบนมือถือ, Select ของ Radix ที่ข้อความยาว, กล้องมือถือผ่าน input file · migration บน postgres ชั่วคราว · **prod ต้องรัน `20261012_packing_lists.sql` แล้ว `20261013_notifications_packing.sql` ก่อน deploy** · ค้างไปเฟส 4: capacity-data ยังไม่อ่านบรรทัดใบจัดของเป็น `packedUnits` (คำเตือนอุปกรณ์อาจไม่พอยังนับจาก lead_packages)

**ผลรอบ B (รายละเอียดจาก Executor):** WP2 + WP3 (P3-9…P3-14)
- หน้าใหม่: `packing/{page,packing-queue-view}.tsx` (คิว 3 กลุ่ม) · `packing/[id]/{page,packing-list-view,select-step,pick-step,confirm-step,unit-select}.tsx` (stepper 3 ขั้น, สรุปพร้อมรับอยู่ใน packing-list-view) · `packing/[id]/print/{page,print-view}.tsx` (A4 + QR ผ่าน portal แบบ qr-sheet-view) · `stock/settings/pickup-spots-section.tsx` (หัวข้อต่อท้ายตั้งค่าคลัง — SettingsView รับ `spots?` ไม่ส่ง = หน้าเดิม) · `stock/settings/pickup-print/page.tsx` · `pickup/[id]/{page,pickup-view}.tsx` (อ่านอย่างเดียว ลิงก์เปิดใบเฉพาะแอดมิน/คนที่มีโมดูล stock) · ตัวช่วยร่วม `packing/{format.ts,status-chip.tsx}`
- เพิ่มฝั่ง server (หน้าจอต้องใช้): `replacePackingLine(lineId, {itemId|kitId})` ใน `packing/actions.ts` — ปุ่ม "เปลี่ยนของ" ขั้นกำลังหยิบ (setPackingLines ใช้ได้เฉพาะเลือกของ) ตรวจด้วย checkPackingLines ชุดเดิม · บรรทัด locked/หยิบแล้ว = error · sync event_kits · log `UPDATE_PACKING_LINES` (ไม่เพิ่ม ActionType) · `loadExtraUnits(db)` ใน `packing/queries.ts` สำหรับของเสริม (อุปกรณ์ที่ไม่อยู่ในกระเป๋า ไม่ใช่วัสดุสิ้นเปลือง + กระเป๋าทุกใบ) · `scripts/packing-flow.check.ts` เพิ่มกรณี replacePackingLine
- พูล: `KitSummary` รับ `packing?: KitPackingInfo {lists, packageLeadIds, canPack}` ส่งผ่าน PoolTabs/DutyTab/ตารางภาพรวม/การ์ดมือถือ · อีเวนต์ที่มีใบ = ชิปสถานะ (+ หยิบแล้ว x/y) + ลิงก์ "เปิดใบ" (เฉพาะทีมจัดของ — คนนอกทีมเข้า /packing ไม่ได้) และไม่นับ/ไม่แสดงการจองกระเป๋าของอีเวนต์นั้น · กล่องจองของอีเวนต์ที่มีใบซ่อนปุ่มจอง/ยกเลิกจอง · ป้ายช่อง "กระเป๋า" → "จัดของ" · TrackingView รับ `canPack`
- ตัดสินใจเอง: เลือกหน่วยที่ "ชน" ถามยืนยันด้วย useConfirm (warning) · "ออกงานอยู่" เลือกได้ในขั้นเลือกของแต่กล่องเปลี่ยนของต้องหยิบได้ตอนนี้ · รูปอัปโหลดทันทีแต่บันทึกลงใบตอนยืนยัน (ลบรูปก่อนยืนยัน = เอาออกจากรายการ ไฟล์ค้างใน bucket) · จุดรับของมีจุดเดียว = เลือกให้เอง · CONTEXT.md แก้นิยาม "จองกระเป๋า" ให้ตรงกติกาเวลา v1.29 และป้าย "กระเป๋า" ในความพร้อม/สิ่งที่ยังขาด → "จัดของ"
- ชุดตรวจใหม่ `scripts/packing-render.check.ts` (คิว, หน้าใบ 3 สถานะ + กรณีตู้เสีย/ไม่มีแพ็กเกจ/อีเวนต์ปิด, แผ่นพิมพ์, /pickup, จุดรับของ, KitSummary 5 กรณี, min-width ≤ 360, ไม่มี window.confirm/alert/.or(), compressImage)
- ยังไม่ได้ลอง: ทุกหน้าในเบราว์เซอร์จริง (โดยเฉพาะ Select ของ Radix บนมือถือ, sticky bar ล่าง, กล้องมือถือผ่าน input file) · prod ต้องรัน `20261012_packing_lists.sql` + `20261013_notifications_packing.sql` ก่อน deploy

### เฟส 4 — รับของ / คืนของ / คืนชั้น + ปิดงาน + hook บอร์ด (v1.50.0, ไม่มี migration ใหม่) · ขนาด M–L

- หน้า: `/pickup/[spotId]` (รายการใบที่จุด → รับของ / คืนของ), `/packing/[id]` ส่วนคืนชั้น, `/events/[id]/return` redirect เมื่อมีใบ
- ไฟล์หลัก: `pickup/[id]/{page,pickup-view,handover-checklist,return-checklist}.tsx`, `packing/actions.ts` (handOver/return/restockLine), `events/actions.ts` แยก core ของ `processEventReturn` ให้รับโหมด `keepItemStatuses` (พฤติกรรมเดิมเมื่อไม่ส่ง), hook `loading` ใน `jobs/board-logic.ts` + check, `scripts/packing-flow.check.ts` ต่อให้ครบเส้น (รับของ → ใบงาน loading → คืนของ → อีเวนต์ completed + ใบงาน done + วัสดุสิ้นเปลืองถูกตัดครั้งเดียว → คืนชั้น → สถานะตามสภาพ), proxy ข้อยกเว้น `/pickup` + เช็กสคริปต์
- AC ย่อ: รับของได้เฉพาะใบ ready ที่จุดนั้น · รับของแล้วใบงานหน้างานเป็น ขนของ (ถ้าอยู่ก่อนหน้า) และการรับไม่ล้มถ้า hook ล้ม · คืนของต้องระบุสภาพครบทุกบรรทัด ค่าเริ่มต้นใช้ได้ · วัสดุสิ้นเปลืองใช้ `planReturnUse` และ unique index เดิมกันตัดซ้ำ · คืนชั้นแล้วสถานะอุปกรณ์ = สภาพ กระเป๋ารายชิ้นตามที่ระบุ · อีเวนต์ไม่มีใบจัดของ ปิดงานแบบเดิมได้ทุกอย่าง (พฤติกรรม v1.37/v1.36 เหมือนเดิม) · หน้าจุดรับของบนมือถือ 360px
- What's New: "ทีมหน้างานสแกน QR จุดรับของเพื่อรับของขึ้นรถและคืนของ ทีมจัดของติ๊กคืนชั้น ปิดงานอัตโนมัติ"

### เฟส 5 — แดชบอร์ดการใช้งาน + ถ้วยนักจัดของ/นักคืนของ (v1.51.0, ไม่มี migration) · ขนาด M

- หน้า: `/stock/usage` · `/reports` + `/dashboard` เฟรมใหม่ 2 ใบ
- ไฟล์หลัก: `stock/usage/{page,usage-view}.tsx`, `packing/usage-logic.ts` + check (ชั่วโมงจาก timestamp, fallback ช่วงอีเวนต์, ตัดช่วงตามชิป, นับครั้งเฉพาะที่ handed_over), `reports/{report-stats,data,top3-grid,champions-strip}` (+ แก้ `data.ts` ให้ใช้ `readAllRows` ทุก query — ตอนนี้ไม่แบ่งหน้า ยอดแชมป์จะผิดเงียบๆ เมื่อเกิน 1,000 แถว), PNG เฟรม 2 ไฟล์
- AC ย่อ: ตัวเลขทุกช่องมาจาก usage-logic ที่มี check · ชั่วโมงปัดทศนิยม 1 ตำแหน่ง · หน่วยที่ไม่เคยใช้ในช่วงแสดงในส่วน "ไม่ได้ใช้" · ถ้วยใหม่ขึ้นเมื่อมีข้อมูล ไม่มี = "ยังไม่มีแชมป์" · report-stats.check ผ่าน
- What's New: "แดชบอร์ดการใช้งานอุปกรณ์: ชิ้นไหนใช้บ่อย กี่ชั่วโมง แพ็กเกจไหนขายดี พร้อมถ้วยนักจัดของและนักคืนของ"

### เฟส 6 — เก็บกวาด (v1.52.0) · ขนาด S–M · ทำเมื่องานที่เปิดอยู่ใช้ใบจัดของหมดแล้ว

- ถอด `KitPicker` จากฟอร์มอีเวนต์ + ปุ่มจองกระเป๋าตรงในพูล (เหลือผ่านใบจัดของ) · `/events/[id]/check-kits` → ลิงก์ไปใบ · ถอด `items.category` text (migration drop) · `crm_settings` category `package` เลิกใช้ · อัปเดต `/howto`, `docs/specs/kits-flow.md` สถานะ, CONTEXT.md นิยามชน · ล้าง `event_closures.kits_snapshot` ให้รวมอุปกรณ์เดี่ยว (ถ้าหน้าประวัติปิดงานต้องการ)

## 10. คำถามที่เจ้าของต้องตัดสิน (ไม่ตอบ = ใช้ค่าที่ขีดเส้นใต้)

| # | คำถาม | ตัวเลือก / ค่าที่จะใช้ |
|---|---|---|
| Q1 | ~~"ตู้ประกอบ model 1/2/3" คืออะไร~~ **ตอบแล้ว 2026-10-07**: ตู้เป็นตัวเลือกที่ทีมขายเลือกเองเหมือนแพ็กเกจ · ตู้ประกอบแยกประกอบได้เป็น ประกอบ 1/2/3 เลือกแบบหนึ่งแล้วแบบอื่นใช้ไม่ได้ | โมเดล: ประเภท "ตู้ประกอบ" (`sales_pick` = true, `variants` = {ประกอบ 1,2,3}) · ชุดที่มีจริงเป็นอุปกรณ์ในประเภทนั้น · ทีมขายเลือกชุด (+แบบ ไม่บังคับ) ตอนเลือกแพ็กเกจ · ข้อจำกัดเกิดเองจากการเป็นชิ้นเดียวกัน (หัวข้อ 2, 3.1, 4.1, 4.2) |
| Q16 | ~~ตู้ประกอบมีกี่ชุด~~ **ตอบแล้ว**: ตอนนี้ 2 ชุด และอยากเพิ่ม/แก้ได้เองในตั้งค่า | ตั้งค่าคลัง → ประเภท "ตู้ประกอบ" → เพิ่มอุปกรณ์ "ชุด 1", "ชุด 2" · ชุดใหม่ = เพิ่มอุปกรณ์อีกชิ้น · แบบประกอบแก้ที่ประเภทที่เดียว มีผลทุกชุด |
| Q17 | ~~แต่ละแบบประกอบใช้ชิ้นส่วนต่างกันไหม~~ **ตอบแล้ว**: ไม่ต้อง เลือกแค่ตู้ประกอบแล้วคืนตู้เฉยๆ | แบบประกอบเป็นป้ายบอกอย่างเดียว ไม่มีชิ้นส่วนต่อแบบ ไม่บังคับเลือก |
| Q2 | งานหนึ่งเลือกได้หลายแพ็กเกจ + จำนวนชุด ใช่ไหม (เช่น selfie 2 ชุด + 360 1 ชุด) | <u>ใช่</u> · ถ้าไม่ ก็ตัด `quantity` กับ multi-select |
| Q3 | ช่อง "ระบบที่ใช้บริการ" ใน CRM (`package_name` จาก `crm_settings`) กับ "แพ็กเกจ" ใหม่ คือสิ่งเดียวกันไหม | <u>ใช่ — รวมเป็นรายการเดียว: dropdown CRM อ่านจาก `packages`, ค่าเก่าแสดงเป็นข้อความ</u> · ถ้าไม่ใช่ ให้มี 2 ช่องแยก (ฝ่ายขายตั้งชื่อขาย ≠ ชุดอุปกรณ์) |
| Q4 | "ทีมขาย" คือใครในระบบ (ไม่มีแผนกนี้ มีแต่ผู้สร้างการ์ด) | <u>ผู้สร้างการ์ด + แอดมิน + ฝ่ายประสานงาน</u> เลือกแพ็กเกจได้ · หรือเพิ่มแผนก "ฝ่ายขาย" ใน `lib/departments.ts` |
| Q5 | "ทีมจัดของ" เป็นแผนกใหม่ หรือใช้ "ทีมออกหน้างาน" เดิม | <u>แผนกใหม่ "ทีมจัดของ"</u> ตั้งคนใน /users แล้วตั้งหน้าที่ใน /jobs/settings · ค่าเริ่มต้นของระบบไม่เปลี่ยน (ถ้ายังไม่ตั้ง หน้าที่จัดของยังเป็นของทีมออกหน้างาน) |
| Q6 | เลือกหน่วยที่ "ชน" กับใบอื่นเวลาทับ: เตือนแล้วให้เลือกได้ (นโยบายเดิม) หรือห้าม | <u>เตือน+ยืนยัน ไม่ห้าม</u> · ของจริงกันอยู่แล้วตอนหยิบ (หยิบได้เฉพาะสถานะใช้ได้) |
| Q7 | คืนของโดยทีมหน้างาน = ปิดอีเวนต์เลยไหม ทั้งที่ตั้ง "ผู้ปิดงาน" ไว้ (v1.28) | <u>ปิดเลยถ้าผู้คืนมีสิทธิ์ปิดงาน · ถ้าไม่มี ใบค้าง "คืนแล้ว รอปิดงาน" และผู้มีสิทธิ์กดปิดจากหน้าปิดงานเดิมโดยค่าถูกเติมให้ ไม่ต้องติ๊กซ้ำ</u> · หรือ (ข) คืนของปิดเสมอ ไม่สนสิทธิ์ · หรือ (ค) ปิดตอนคืนชั้นแล้ว |
| Q8 | สถานะอุปกรณ์เป็น "ออกงาน" ตั้งแต่หยิบ (อาจเป็นวันก่อนงาน) หรือตั้งแต่รับของ | <u>ตั้งแต่หยิบ</u> — ของไม่อยู่บนชั้นแล้วจริง ตรวจนับถูก และตรงกับกระเป๋าเดิม |
| Q9 | ถ้วยใหม่ 2 ใบ (นักจัดของ / นักคืนของ): ใช้ PNG เฟรมแบบไหน (เจ้าของส่งไฟล์ หรือให้ใช้ `event.png` ที่ว่างอยู่ชั่วคราว) และถ้วย "จัดกระเป๋า" เดิมจะเก็บ (เปลี่ยนป้าย "รับหน้าที่จัดของ") หรือถอด | <u>ใช้เฟรมเดิมชั่วคราว · เก็บถ้วยเดิมเปลี่ยนป้าย</u> |
| Q10 | ชั่วโมงใช้งานนับจากเวลารับ→คืนจริง หรือจากช่วงเวลาอีเวนต์ | <u>รับ→คืนจริง, ไม่มีให้ใช้ช่วงอีเวนต์</u> |
| Q11 | จุดรับของมีกี่จุด ชื่ออะไร ต้องขึ้นบนผังห้อง 3D ไหม | <u>ตั้งเองในตั้งค่าคลัง · ไม่ขึ้น 3D รอบนี้</u> |
| Q12 | รูปยืนยันจัดของ: ขั้นต่ำ 1 รูป · รูปตอนคืนของไม่บังคับ | <u>ตามนี้</u> |
| Q13 | ใครสแกนจุดรับของได้ | <u>ทุกคนที่มีสิทธิ์ events หรือ stock (เหมือน QR กระเป๋า)</u> · หรือจำกัดเฉพาะคนใน event_staff ของอีเวนต์ |
| Q14 | วัสดุสิ้นเปลืองเดี่ยว (ไม่อยู่ในกระเป๋า) ต้องอยู่ในใบจัดของไหม | <u>ไม่ — ใช้ "เบิกใช้" ที่หน้าชั้นเหมือนเดิม</u> ใบจัดของมีแต่หน่วยนับชิ้น + กระเป๋า |
| Q15 | จะถอด flow จองกระเป๋าตรง (KitPicker/ปุ่มจองในพูล) เมื่อไร | <u>เฟส 6 หลังงานเปิดอยู่ใช้ใบจัดของครบ</u> |

## 11. ความเสี่ยง / ข้อควรระวังจากโค้ดปัจจุบัน

- `types/database.types.ts` ไม่มี event_kits/shelves/job_settings/crm_* — ตารางใหม่ต้องใช้ type เขียนมือ + `.overrideTypes<T>()` และเติม SCHEMA ในฐานข้อมูลจำลองของทุกสคริปต์ที่เกี่ยว (ชุดตรวจล้มถ้าลืม — เคยพลาดกับ `events.event_time`)
- PostgREST ตัด 1,000 แถว: บรรทัดใบจัดของและสถิติต้องผ่าน `readAllRows` (เรียง `created_at` + `id`) · `reports/data.ts` ปัจจุบันยังไม่แบ่งหน้า (แก้ในเฟส 5)
- โค้ดอ่านใหม่ห้าม `.or()` — อ่านแยกชุดแล้วรวมด้วย id
- `MODULE_ROUTES` ของ stock ไม่ใช่ prefix `/stock` — ทุก route ใหม่ต้องเพิ่มเอง มิฉะนั้นผู้ใช้ที่ไม่มีสิทธิ์สต็อกเข้าได้ · `/jobs*` ไม่ถูกกั้นระดับ route อยู่แล้ว (ทราบ) — action ฝั่ง server ต้องตรวจสิทธิ์เองทุกตัว
- `kits.event_id` เป็นตัวชี้คำนวณ (v1.29.0) และยังมีโค้ดเก่าอ่านมัน (`updateItem`, `cleanupOrphanedItems`, dashboard) — ทุกครั้งที่ใบจัดของแตะ `event_kits` ต้อง `recomputeKitPointers`
- `processEventReturn` ยาวและแตะหลายตาราง — แยก core ด้วยพารามิเตอร์เดียว (`keepItemStatuses`) ไม่รื้อ และ `scripts/claim-*.check.ts`/ชุดตรวจอีเวนต์ต้องผ่านเหมือนเดิม
- `event_closures.kits_snapshot` มีแต่กระเป๋า และตารางนี้ **ไม่มี `event_id`/`crm_lead_id`** (snapshot ล้วน ผูกด้วยชื่อ+วัน) — หน้า `/events/event-closures` จะไม่เห็นอุปกรณ์เดี่ยวจนกว่าจะขยาย snapshot (เฟส 6 หรือทำในเฟส 4 ถ้าเจ้าของต้องการ) · ประวัติที่เชื่อถือได้ของใบจัดของคือตารางใบจัดของเอง ไม่ใช่ closure
- `getTrackingSnapshot` (`jobs/tracking/data.ts`) เป็นแหล่งเดียวของความพร้อมที่ใช้ร่วมกันโดย หน้าติดตามงาน, แผงเตือนบน dashboard, และ MCP `job_readiness` — ข้อมูลใบจัดของต้องเข้าไปใน snapshot นี้ที่เดียว (ไม่คำนวณแยกต่อหน้า) และ `scripts/tracking-snapshot-check.ts` แตะฐานข้อมูลจริง (อ่าน header ก่อนรัน)
- ใบงานหน้างานมี 1 ใบต่อ lead แต่ใบจัดของมี 1 ใบต่ออีเวนต์ (grain เดียวกับ `event_kits`/`event_vehicles`) — ความพร้อม "จัดของ" ของงานจึงต้องรวมทุกอีเวนต์ที่ยังไม่ปิดของ lead เหมือนที่ `isMissingKits` รวมทุกการจอง
- หน้าหยิบ/รับ/คืน ใช้บนมือถือหน้างาน — ตรวจด้วย static render ที่ 360/390px ตาม recipe ใน `docs/specs/kits-flow.md` และไม่มีหน้าไหนเคยถูกเปิดด้วยบัญชีจริงใน session ที่ผ่านมา: หลังแต่ละเฟสต้องมีรายการ "เจ้าของลองกดจริง"
- ชื่อ branch ห้าม `hotfix/...` · `.claude/settings.local.json` ห้ามเข้า commit · version บน main อาจถูก session อื่น bump ไปก่อน

## 12. ตั้งใจไม่ทำรอบนี้

- scanner QR ในแอป (ใช้กล้องมือถือเปิด URL ตามเดิม) · LINE/push notification · จุดรับของบนผัง 3D · utilization % ต่อประเภท (ชั่วโมงว่าง/ชั่วโมงใช้) · จองอุปกรณ์เดี่ยวล่วงหน้าโดยไม่ผ่านใบจัดของ · ราคา/ต้นทุนต่อแพ็กเกจ · ใบจัดของสำหรับงานที่ไม่ผูก CRM (ใบงานลอย) — ทำได้ทีหลังโดยให้ `lead_id` ว่างและเลือกแพ็กเกจที่ใบ · การจำลองจับคู่รายหน่วยในคำเตือนอุปกรณ์อาจไม่พอ
