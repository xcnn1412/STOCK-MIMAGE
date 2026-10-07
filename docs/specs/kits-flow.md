# ปรับปรุงขั้นตอนกระเป๋า (v1.37.0)

ที่มา: รีวิวขั้นตอนกระเป๋าทั้งเส้น 2026-10-04 พบ 16 ข้อ · ตัดสินใจกับเจ้าของ 2026-10-04
branch `feature/kits-flow` · ไม่มี migration · route ใหม่ 1 เส้น `/kits/print` (อยู่ใต้ `/kits` เดิม ไม่ต้องเพิ่มใน `MODULE_ROUTES` / nav)

## สถานะ (อัปเดต 2026-10-04)

| ขั้น | สถานะ |
|---|---|
| WP1 กติกา + server | ✅ commit `aba9bb9` (ผ่านรอบเดียว) |
| WP2 จัดกระเป๋า / รับคืน / ปิดงาน | ✅ commit `4c18e0f` (ผ่านรอบเดียว) |
| WP3 หน้ากระเป๋า + QR + release | ✅ ผ่านรอบเดียว |
| ปิดงาน (Critic) | ✅ 6 จอ render ที่ 390/360 ไม่ล้นจอ · `next build` ผ่าน · tag v1.37.0 · merge เข้า main · **ยังไม่ push** |

**ยังไม่ได้ทำ / ข้อจำกัด:** ไม่มีหน้าไหนถูกเปิดด้วยบัญชีจริง (ดูจาก static render + โค้ด) · แท็บรับคืนและไดอะล็อกต่างๆ ไม่อยู่ใน static render จึงตรวจจากโค้ดเท่านั้น · ไฟล์เก่าของ kits/events ยังมี lint error เดิม (ไม่เพิ่ม) · ไม่ต้องรัน SQL บน prod

**อัปเดต 2026-10-07 (v1.49–v1.52):** การจองกระเป๋าและจัดกระเป๋าตรง (KitPicker ในฟอร์มอีเวนต์ + ปุ่มจองในหน้าติดตามงาน) ถูกแทนด้วยใบจัดของ (`docs/specs/equipment-flow.md`) — ใบจัดของเขียน `event_kits` เอง ฟอร์มอีเวนต์/พูลถอดการจองตรงใน v1.52.0 · QR กระเป๋า, หน้าจัดกระเป๋า `/events/[id]/check-kits` (มีใบ = แบนเนอร์ลิงก์ไปใบ) และ `/events/[id]/return` ของอีเวนต์ที่ไม่มีใบยังใช้ตามสเปคนี้

สิ่งที่ WP3 ทำเกินสเปคเล็กน้อย (รับไว้แล้ว): หน้ากระเป๋าโหลด `kit_contents.quantity` จริง (เดิมแสดง 1 เสมอ) · `en` ของ `kits.scanTo` เปลี่ยนเป็น "Scan to take out / return" · หมวด "งานที่จองกระเป๋านี้" อยู่คอลัมน์ขวา เห็นทุกคน

## Problem Statement

ขั้นตอน สร้างกระเป๋า → ใส่ของ → จอง → จัดกระเป๋า/นำออก → รับคืน → ปิดงาน ทำงานได้ แต่มีจุดที่ทำให้งานติด (กระเป๋าที่มีของเสียจัดครบไม่ได้ แก้จำนวนของไม่ได้) จุดที่ทำข้อมูลผิดโดยไม่รู้ตัว (กดรับคืนพลาด ลบกระเป๋าแล้วการจองหาย ป้าย "ออกงาน" ผิด) และจุดที่เสียเวลาบนมือถือ (ปิดงานต้องเลือกสถานะทีละชิ้น หาของในรายการ 300 ชิ้นโดยไม่มีค้นหา)

## คำตัดสินของเจ้าของ (2026-10-04)

| ข้อ | คำตอบ |
|---|---|
| 1 จัดครบ | ชิ้นที่ใช้ได้ถูกนำออกครบ = จัดครบ งานขึ้น "พร้อม" ได้ + ป้ายเตือนว่าขาดชิ้นไหน (เสีย/ซ่อม/หาย) |
| 9 QR กระเป๋า | ทุกคนที่มีสิทธิ์อีเวนต์หรือสต็อกสแกนใช้ได้ QR เดิมใช้ต่อ ไม่ต้องพิมพ์ใหม่ |
| 13 คำเรียก | **นำออก / รับคืน / จัดกระเป๋า / จัดครบ** — เลิกใช้ เบิกของ / คืนของ / เช็คอิน-เช็คเอาท์ ในเรื่องกระเป๋า · "เบิกใช้" ใช้กับวัสดุสิ้นเปลืองเท่านั้น |
| 16 งานเสริม | ทำแผ่น QR รวม A4 อย่างเดียว · ไม่ต่อ "ตัวอย่างกระเป๋า" กับการสร้างกระเป๋า |

ค่าที่ผู้วางแผนเลือกเอง (เจ้าของยังไม่ได้ยืนยัน — แจ้งไว้แล้ว):
- ลบกระเป๋าที่ยังมีงานจองอยู่ (งานยังไม่ปิด) **ไม่ได้** ต้องยกเลิกการจองก่อน · ของในกระเป๋าไม่ถูกลบ
- ฟอร์มปิดงานเติมสถานะให้ก่อนจากสถานะปัจจุบันของแต่ละชิ้น (ชิ้นที่ยังออกงานอยู่ต้องเลือกเอง)
- ปุ่มรับคืนรายชิ้นแสดงเฉพาะชิ้นที่ออกงานอยู่ · ชิ้นอื่นต้องกด "เปลี่ยนสถานะ" ก่อน · เสียหาย/ซ่อม/หาย ถามยืนยัน
- สแกน QR แล้วเปิดหน้าจัดกระเป๋าของงานที่จองไว้เร็วที่สุดในหน้านั้นเลย (ไม่ redirect ไปหน้าอีเวนต์ — คนที่มีแต่สิทธิ์สต็อกจะเข้าไม่ได้)
- ป้าย "จัดครบ" ของการจองเดิมจะถูกคิดใหม่ตามกติกาใหม่เมื่อมีคนเปิดหน้าจัดกระเป๋าใบนั้น

## Implementation Decisions

### กติกาล้วน — `shelves/consumable-logic.ts`

`packState(items) → { total, out, packed, blocked }` — ดูเฉพาะอุปกรณ์ปกติ (ไม่นับวัสดุสิ้นเปลือง)
- `blocked` = ชิ้นที่สถานะไม่ใช่ `available` / `in_use` (เสีย ซ่อม หาย ฯลฯ) พร้อม `id, name, status`
- `total` = ชิ้นที่นำออกได้ (`available` + `in_use`) · `out` = ชิ้นที่ `in_use`
- `packed` = `total > 0 && out === total` · `isPacked(items)` = `packState(items).packed`

### Server

- `kits/[id]/check/actions.ts`: `syncPacked` ใช้กติกาใหม่ · action ใหม่ `syncKitPacked(eventId, kitId)` (requireAuth → checkBooking → syncPacked → refresh) ให้หน้าจอเรียกเมื่อป้ายเดิมไม่ตรงกติกาใหม่
- `kits/[id]/actions.ts::updateKitItemQuantity`: คืน `{ error } | { warning } | { success }` ไม่ throw · ตรวจผู้ดูแล · `parseQty` · กระเป๋าออกงานอยู่ = error · วัสดุสิ้นเปลืองที่ผลรวมในกระเป๋าทุกใบเกินยอดคงเหลือ = สำเร็จ + warning
- `kits/actions.ts::deleteKit`: มีการจองของงานที่ยังไม่ปิด (`isClosedEvent` = false) → `{ error }` บอกชื่องาน · ลบ `kit_contents` ของใบนั้นก่อนแล้วจึงลบกระเป๋า · ยังกันกรณีของออกงานอยู่เหมือนเดิม
- `proxy.ts`: เส้นทางรูป `/kits/<id>/check` เท่านั้น ผ่านด่านโมดูลได้เมื่อมี `stock` **หรือ** `events` (regex แคบๆ) · `/kits`, `/kits/<id>`, `/kits/<id>/print`, `/kits/print` ยังต้องมี `stock` · เพิ่มประโยคเดียวใน CLAUDE.md หัวข้อ Module gate
- ข้อความ error ที่ผู้ใช้เห็นใน 3 ไฟล์ action ของกระเป๋าเป็นภาษาไทยทั้งหมด
- `lib/dictionary.ts` (th): `checkin.title` นำออก / รับคืน · `checkout` นำออก · `checkin` รับคืน · `checkoutSelected` นำออกรายการที่เลือก · `successCheckout` นำออกแล้ว · `kits.scanTo` สแกนเพื่อนำออก / รับคืน (`t.checkin.*` ใช้ที่ `check-flow.tsx` ที่เดียว)

### หน้าจอ

- **หน้าจัดกระเป๋า** (`check-flow.tsx`): หัวแสดง `นำออกแล้ว x/y` · มีชิ้น blocked → กล่องเหลือง `ขาด N ชิ้น` + ชื่อและสถานะ · เปิดหน้าแล้ว `packState(...).packed !== initialPacked` → เรียก `syncKitPacked` หนึ่งครั้ง · แท็บรับคืน: 4 ปุ่มเฉพาะชิ้น `in_use` ชิ้นอื่นแสดงป้ายสถานะ + `เปลี่ยนสถานะ` · เสียหาย/ซ่อมบำรุง/หาย = `confirm()` ระบุชื่อชิ้น
- **หน้า QR** (`kits/[id]/check/page.tsx`): หัวเรื่องไทย · ไม่มีงานจอง → ข้อความ `ยังไม่ได้จองให้งานไหน` + ลิงก์ ไม่ render CheckFlow · ลิงก์ย้อนกลับไป `/kits/<id>` เฉพาะคนมีสิทธิ์สต็อก (`getStockUser`) ไม่งั้นไป `/events`
- **กระเป๋าของงาน** (`events/[id]/check-kits`): แต่ละใบแสดง `จัดครบแล้ว ✓` / `นำออกแล้ว x/y` / `ยังไม่จัด` + `ขาด N ชิ้น`
- **ปิดงาน** (`return-checklist.tsx`): เติมสถานะจากสถานะปัจจุบันถ้าเป็น ใช้ได้/เสียหาย/ซ่อมบำรุง/หาย · ปุ่ม `ใช้ได้ทั้งหมด` ต่อกระเป๋า (ตั้งเฉพาะชิ้นที่ยังไม่มีสถานะ) · แถวซ้อนแนวตั้งบนจอแคบ · toast แทน `alert()` · ข้อความไทย · ช่อง "ใช้ไป" เกินจำนวนประจำกระเป๋า → เตือนสีเหลือง ไม่บล็อก
- **การ์ดอีเวนต์** (`events-view.tsx`): ปุ่ม `กระเป๋า` `แก้ไข` และปุ่มปิดงานมีข้อความ `ปิดงาน`
- **รายการกระเป๋า** (`kits/page.tsx`, `kits-view.tsx`, `delete-kit-button.tsx`): ช่องค้นหาชื่อ · ชั้นหรือ `ยังไม่มีชั้น` · ป้ายสถานะจาก `kitShelfState` (`ออกงาน` / `จองไว้` / `อยู่ในคลัง`) · `มีปัญหา N` · ยืนยันลบเป็นไทยระบุชื่อและจำนวนของ
- **รายละเอียดกระเป๋า** (`kits/[id]/page.tsx`, `kit-details-view.tsx`, `add-item-form.tsx`, `edit-quantity.tsx`): ป้ายหัวจาก `kitShelfState` (เลิก "in use @") · ชั้นหรือ `ยังไม่มีชั้น` · ป้ายสถานะรายชิ้น · หมวด "งานที่จองกระเป๋านี้" (ชื่องาน วันที่ จัดครบ/ยังไม่จัด ลิงก์ไปหน้าจัดกระเป๋า) · แก้จำนวนได้ทั้งมือถือและจอคอม (ดินสอเห็นตลอด) · ลบของถามยืนยัน · ช่องค้นหาในตัวเลือกเพิ่มของ เพิ่มต่อเนื่องได้
- **แดชบอร์ดสต็อก** (`stock/dashboard`): ตัวเลขกระเป๋า = ใบที่ออกงานจริง · รายการระบุ `ออกงาน` หรือ `จองไว้`
- **QR**: `print-view.tsx` ข้อความไทย · หน้าใหม่ `/kits/print` ใช้ `QrSheetView` ตัวเดิมแบบรับพารามิเตอร์ (ไม่ก๊อปปี้) ค่า QR = `<origin>/kits/<id>/check` · ปุ่ม `พิมพ์ QR ทั้งหมด` ที่หน้ารายการกระเป๋า

## ไม่ทำในรอบนี้

ต่อ "ตัวอย่างกระเป๋า" กับการสร้างกระเป๋า · แก้ข้อความใน /howto · เลือกเพิ่มของหลายชิ้นในคลิกเดียว · ตัวกรองอื่นในรายการกระเป๋านอกจากค้นหา · กรณีปิดงาน A ขณะกระเป๋าใบเดียวกันออกกับงาน B (ผลจากกติกา "ชนแค่เตือน") · บังคับฝั่ง server ว่ารับคืนได้เฉพาะชิ้นที่ออกงาน

## Agent loop (ตาม CLAUDE.md)

Planner/Critic = Fable (session หลัก) · Executor = Agent tool `model: opus` agent ใหม่ต่อแพ็กเกจ · รอบแก้ใช้ SendMessage ถึง agent ตัวเดิม ส่งเฉพาะ `failures` · ทำทีละแพ็กเกจบน working tree เดียว · Critic ตรวจด้วยคำสั่งก่อนอ่านโค้ด แล้ว commit ก่อนเริ่มแพ็กเกจถัดไป

บทเรียนจากรอบวัสดุสิ้นเปลืองที่ใส่ไว้ในเกณฑ์แล้ว: เกณฑ์ lint เขียนเป็น "ไม่เพิ่ม error" (ไฟล์เก่าของ kits/events มี error เดิม 22 จุด) · Critic ดูหน้าจอจริงที่ความกว้างมือถือด้วย static render + ตัวจำลอง provider ก่อนปิดงาน · `next build` หนึ่งครั้งตอนจบ (dev server ต้องปิด)

กติกา Executor ทุกแพ็กเกจ: ไม่รัน `next build` · ไม่เปิด dev server · ไม่ commit · ไม่แตะไฟล์นอกรายการโดยไม่บอก · ไม่แก้ `.claude/settings.local.json` · พฤติกรรมของวัสดุสิ้นเปลือง (v1.36.0) ต้องเหมือนเดิม · จบงานรายงาน: ไฟล์ที่แตะ + ท้ายผลลัพธ์ของคำสั่งตรวจ

```json
{
  "plan": [
    "WP0 (Critic): แตก branch feature/kits-flow · ยืนยัน baseline `npx tsc --noEmit --incremental false` = 1 error (checkupdate/check-update-view.tsx)",
    "WP1 กติกา + server: shelves/consumable-logic.ts + .check.ts (packState) · kits/[id]/check/actions.ts (syncPacked, syncKitPacked) · kits/[id]/actions.ts (updateKitItemQuantity, ข้อความไทย) · kits/actions.ts (deleteKit) · proxy.ts + เช็กสคริปต์ proxy · lib/dictionary.ts (คำเรียก) · CLAUDE.md หนึ่งประโยค",
    "WP2 จัดกระเป๋า / รับคืน / ปิดงาน: kits/[id]/check/{check-flow,page} · events/[id]/check-kits/{page,check-kits-view} · events/[id]/return/{page,return-checklist} · events/events-view.tsx",
    "WP3 หน้ากระเป๋า + QR + release: kits/{page,kits-view,delete-kit-button} · kits/[id]/{page,kit-details-view,add-item-form,edit-quantity} · stock/dashboard/{page,dashboard-view} · kits/[id]/print/print-view · kits/print/page.tsx (ใหม่) + shelves/rooms/[roomId]/print/qr-sheet-view.tsx (รับพารามิเตอร์) · package.json 1.37.0 · whats-new/updates.ts",
    "ปิดงาน (Critic): ดูหน้าจอ 4 จอที่ความกว้างมือถือ · `next build` · tag v1.37.0 · merge --no-ff เข้า main · ไม่ push · แจ้งรายการที่เจ้าของต้องลองกดจริง"
  ],
  "acceptance_criteria": [
    { "id": "K1", "wp": 1, "blocking": true, "check": "consumable-logic.ts มี packState(items) คืน { total, out, packed, blocked } ตามนิยามในสเปค และ isPacked(items) === packState(items).packed; consumable-logic.check.ts มี assertion: (a) ชิ้นที่ใช้ได้ออกครบ + เสียหาย 1 ชิ้น → packed true, blocked ยาว 1 (b) ยังมีชิ้น available ค้าง → false (c) มีแต่ชิ้น blocked → false (d) มีแต่วัสดุสิ้นเปลือง → false (e) วัสดุสิ้นเปลืองไม่ถูกนับใน total; `npx tsx \"app/(authenticated)/shelves/consumable-logic.check.ts\"` exit 0" },
    { "id": "K2", "wp": 1, "check": "kits/[id]/check/actions.ts export syncKitPacked(eventId, kitId): เรียก requireAuth และ checkBooking ก่อน syncPacked, คืน { error } หรือ { packed }, ไม่ throw; syncPacked คำนวณด้วย isPacked/packState" },
    { "id": "K3", "wp": 1, "blocking": true, "check": "updateKitItemQuantity ไม่มี `throw` เหลืออยู่และคืน { error } เมื่อ: ไม่ใช่ผู้ดูแล / จำนวนไม่ผ่าน parseQty / กระเป๋ามีของออกงาน (itemsOutInKit); วัสดุสิ้นเปลืองที่ผลรวม kit_contents.quantity ทุกใบ > items.quantity → บันทึกสำเร็จและคืน warning" },
    { "id": "K4", "wp": 1, "blocking": true, "check": "deleteKit: กระเป๋าที่มี event_kits ของอีเวนต์ที่ isClosedEvent = false → คืน { error } ที่มีชื่ออีเวนต์ และไม่ลบอะไร; ไม่มีการจองค้าง → ลบ kit_contents ของใบนั้นก่อน แล้วลบ kits; ยังคืน error เมื่อของออกงานอยู่; logActivity DELETE_KIT ยังอยู่" },
    { "id": "K5", "wp": 1, "blocking": true, "check": "proxy.ts: GET /kits/<id>/check ผ่านเมื่อ allowed_modules มี stock หรือ events; ผู้ใช้ที่มีแต่ events ถูก redirect ไป /dashboard ที่ /kits, /kits/<id>, /kits/<id>/print, /kits/print; ผู้ใช้ที่ไม่มีทั้งสองถูก redirect ที่ /kits/<id>/check; มีเช็กสคริปต์ (ต่อใน scripts/proxy-session.check.ts หรือไฟล์ใหม่ scripts/proxy-kit-qr.check.ts) ที่ assert 4 กรณีนี้และ exit 0; MODULE_ROUTES ไม่เปลี่ยน" },
    { "id": "K6", "wp": 1, "check": "lib/dictionary.ts ส่วน th: ค่าใน checkin และ kits.scanTo ไม่มีคำว่า เบิก / คืนของ / เช็คอิน / เช็คเอาท์ และเป็นค่าตามสเปค; ใน kits/actions.ts, kits/[id]/actions.ts, kits/[id]/check/actions.ts grep ไม่เจอ 'Item is already in', 'Failed to', 'Unauthorized', 'Unknown Kit' ที่เป็นข้อความคืนผู้ใช้ (ค่าที่ใช้ใน logActivity ไม่นับ)" },
    { "id": "K7", "wp": 2, "check": "CheckFlow: มีข้อความ `นำออกแล้ว` ตามด้วย x/y จาก packState; เมื่อ blocked.length > 0 แสดงกล่องที่มี `ขาด` + จำนวน + ชื่อชิ้นและสถานะภาษาไทย; มี effect ที่เรียก syncKitPacked ครั้งเดียวเมื่อ packState(...).packed !== initialPacked และมี event ที่เลือก" },
    { "id": "K8", "wp": 2, "blocking": true, "check": "แท็บรับคืน: ปุ่มสถานะ 4 ปุ่ม render เฉพาะชิ้นที่ status === 'in_use' หรือชิ้นที่ผู้ใช้กด `เปลี่ยนสถานะ`; ชิ้นอื่นแสดงป้ายสถานะ; เลือก damaged / maintenance / lost เรียก confirm() ที่มีชื่อชิ้นก่อน checkinItem และยกเลิก = ไม่เรียก action; เลือก available ไม่ถาม" },
    { "id": "K9", "wp": 2, "check": "kits/[id]/check/page.tsx: ไม่มีข้อความ ` Check` ต่อท้ายชื่อ; ไม่มีการจองที่ยังไม่ปิด → render ข้อความที่มี `ยังไม่ได้จองให้งานไหน` + ลิงก์ และไม่ render <CheckFlow>; ลิงก์ย้อนกลับเป็น /kits/<id> เฉพาะเมื่อ getStockUser() ไม่ null ไม่งั้น /events" },
    { "id": "K10", "wp": 2, "check": "events/[id]/check-kits: page โหลดสถานะของอุปกรณ์ในแต่ละกระเป๋า; view แสดงต่อใบหนึ่งใน `จัดครบแล้ว ✓` / `นำออกแล้ว x/y` (เมื่อ 0 < x < y) / `ยังไม่จัด` และ `ขาด N ชิ้น` เมื่อ blocked > 0 โดยคำนวณจาก packState" },
    { "id": "K11", "wp": 2, "check": "return-checklist: state statuses เริ่มต้นมีค่าของอุปกรณ์ปกติที่ status ปัจจุบัน ∈ {available, damaged, maintenance, lost}; มีปุ่ม `ใช้ได้ทั้งหมด` ต่อกระเป๋าที่ตั้ง available เฉพาะชิ้นที่ยังไม่มีสถานะ; แถวใช้ flex-col ต่ำกว่า sm; ไม่มี alert( เหลือ; ไม่มีข้อความ 'No Serial' / 'Uploading'; ช่องใช้ไปที่ค่า > kitQuantity แสดงข้อความที่มี `มากกว่าจำนวนประจำกระเป๋า` และไม่ทำให้ปุ่มยืนยัน disabled; พฤติกรรมวัสดุสิ้นเปลืองอื่นของ v1.36.0 คงเดิม" },
    { "id": "K12", "wp": 2, "check": "events-view.tsx: ไม่มีข้อความ JSX `Kits` และ `Edit` แบบ hard-code; ปุ่มปิดงานมีข้อความ `ปิดงาน` ที่มองเห็น (ไม่ใช่ sr-only อย่างเดียว) และยังสูงอย่างน้อย 44px" },
    { "id": "K13", "wp": 3, "check": "/kits: มี input ค้นหาที่กรองการ์ดตามชื่อ; การ์ดแสดงรหัสชั้นหรือ `ยังไม่มีชั้น`, ป้ายสถานะจาก kitShelfState (`ออกงาน` / `จองไว้` / `อยู่ในคลัง`), `มีปัญหา N` เมื่อ countProblems > 0; ไม่มี 'No description'; confirm ลบเป็นภาษาไทยมีชื่อกระเป๋าและจำนวนของ; error จาก deleteKit แสดงด้วย toast" },
    { "id": "K14", "wp": 3, "check": "รายละเอียดกระเป๋า: ไม่มีข้อความ 'in use @'; ป้ายหัวมาจาก kitShelfState (`ออกงาน @ <งาน>` เฉพาะเมื่อมีชิ้น in_use, `จองไว้ <งาน>` เมื่อจองอย่างเดียว); แสดงชั้นหรือ `ยังไม่มีชั้น`; แถวอุปกรณ์ปกติมีป้ายสถานะ; มีหมวดรายการการจองที่ยังไม่ปิด (ชื่องาน วันที่ จัดครบ/ยังไม่จัด) พร้อมลิงก์ /events/<eventId>/check-kits/<kitId>" },
    { "id": "K15", "wp": 3, "blocking": true, "check": "kit-details-view ใช้ EditQuantity ทั้งรายการมือถือและตารางจอคอมเมื่อ canManage; ปุ่มดินสอไม่มี class opacity-0 / group-hover; EditQuantity แสดง toast จาก error/warning ที่ action คืน และไม่ปิดโหมดแก้เมื่อ error; ปุ่มลบของเรียก confirm() ที่มีชื่อของก่อน removeItemFromKit" },
    { "id": "K16", "wp": 3, "check": "add-item-form: มีช่องค้นหาที่กรองรายการตามชื่อ/serial; เพิ่มอุปกรณ์ปกติแล้วช่องค้นหาและรายการยังพร้อมเพิ่มชิ้นถัดไปโดยไม่ต้องเปิดใหม่; รายการที่ไม่มี serial ไม่แสดง `()`; ช่องจำนวนของวัสดุสิ้นเปลืองและ toast.warning ยังทำงาน" },
    { "id": "K17", "wp": 3, "check": "แดชบอร์ดสต็อก: ตัวเลขกระเป๋านับเฉพาะใบที่มีอุปกรณ์ปกติสถานะ in_use; รายการแสดงป้าย `ออกงาน` หรือ `จองไว้` ต่อใบจาก kitShelfState; ใบที่จองอย่างเดียวไม่ถูกนับเป็นออกงาน" },
    { "id": "K18", "wp": 3, "check": "print-view.tsx ไม่มี 'SCAN TO' / 'Download Image' (เป็นข้อความไทยตามคำเรียกใหม่); มี app/(authenticated)/kits/print/page.tsx ที่ render QrSheetView โดยค่า QR = <origin>/kits/<id>/check; ไม่มี component แผ่น QR ตัวที่สอง (qr-sheet-view.tsx ถูกแก้ให้รับพารามิเตอร์); หน้า QR ของห้องยังได้ค่า <origin>/shelves/<id> เหมือนเดิม; หน้า /kits มีลิงก์ `พิมพ์ QR ทั้งหมด`; room-logic.check.ts exit 0" },
    { "id": "K19", "wp": "ทุกแพ็กเกจ", "blocking": true, "check": "`npx tsc --noEmit --incremental false` เหลือเฉพาะ error baseline 1 จุด; จำนวน eslint error ของแต่ละไฟล์ที่แตะ ≤ จำนวนของไฟล์นั้นที่ commit เริ่มแพ็กเกจ; consumable-logic.check, shelf-logic.check, room-logic.check และเช็กสคริปต์ proxy exit 0" },
    { "id": "K20", "wp": 3, "check": "package.json version = 1.37.0; UPDATES[0] เป็นรายการใหม่ tag 'ปรับปรุง' module 'สต็อก' date = ผล `date +%F` ข้อความไทยไม่มีศัพท์เทคนิค; ไม่มีไฟล์ใหม่ใน supabase/migrations; lib/nav-config.ts ไม่มี diff; .claude/settings.local.json ไม่อยู่ใน commit" }
  ],
  "pass_threshold": 0.9
}
```

## หลัง merge — ของเจ้าของ

ไม่ต้องรัน SQL · ลองจริงบนมือถือ: (1) สแกน QR กระเป๋าด้วยบัญชีที่มีแต่สิทธิ์อีเวนต์ (2) จัดกระเป๋าที่มีของเสีย 1 ชิ้นให้ขึ้นจัดครบพร้อมป้ายขาด (3) กดรับคืนเป็น "หาย" แล้วยกเลิก (4) ปิดงานด้วยปุ่ม "ใช้ได้ทั้งหมด" (5) แก้จำนวนของในกระเป๋า (6) ลบกระเป๋าที่มีงานจอง (ต้องไม่ให้ลบ) (7) พิมพ์แผ่น QR รวม
