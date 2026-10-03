# วัสดุสิ้นเปลืองบนชั้นเก็บของ (v1.36.0)

ต่อยอด "ชั้นเก็บของ" (v1.30–1.34) · ตัดสินใจกับเจ้าของ 2026-10-03 · สถานะ: **แผนล็อกแล้ว ยังไม่เริ่มทำ**
branch `feature/consumables` · migration `supabase/migrations/20261007_consumables.sql` · ไม่มี route ใหม่ (ไม่แตะ `MODULE_ROUTES` / nav)

## Problem Statement

ของที่ใช้แล้วหมดไป (เทป ถุงพร็อบ กระดาษ ถ่าน) ตอนนี้ลงเป็นอุปกรณ์ปกติ มีช่อง "จำนวน" แต่ไม่มีอะไรลดหรือเพิ่มตัวเลขนั้น จึงไม่รู้ว่าเหลือเท่าไร ใครเบิกไป ใช้กับงานไหน และควรซื้อเพิ่มเมื่อไร

## Solution

อุปกรณ์ติ๊กเป็น **วัสดุสิ้นเปลือง** ได้ตั้งแต่ฟอร์มนำเข้าเดิม (`/items/new`) แล้ววางบนชั้นด้วยขั้นตอนเดิม (หน้าชั้น → เพิ่มอุปกรณ์) หน้าชั้นมีหมวดใหม่แสดงยอดคงเหลือ พร้อมปุ่ม **เบิกใช้ / เติม / ตัดทิ้ง / ปรับยอด** ทุกครั้งที่ยอดเปลี่ยนถูกบันทึกเป็นประวัติ ของชิ้นเดียวกันใส่ได้หลายกระเป๋าพร้อมกันโดยระบุจำนวนต่อใบ ตอนปิดงานกรอก "ใช้ไปกี่ชิ้น" แล้วระบบตัดยอดให้ ของใกล้หมดขึ้นเตือนบนแดชบอร์ดสต็อก

## คำตัดสินของเจ้าของ (2026-10-03)

| เรื่อง | คำตอบ |
|---|---|
| ที่เก็บ | กองกลางบนชั้น + แบ่งใส่ได้หลายกระเป๋า (ระบุจำนวนต่อใบ) |
| ตัดตอนออกงาน | กรอก "ใช้ไปกี่ชิ้น" ตอนคืนกระเป๋า/ปิดงาน → ตัดอัตโนมัติ ผูกกับงาน |
| สิทธิ์ | เติม / ตัดทิ้ง / ปรับยอด = admin + แผนกดูแลกระเป๋า (`getKitManager`) · เบิกใช้ = ทุกคนที่มีสิทธิ์โมดูล stock |
| เตือนใกล้หมด | ตั้งจำนวนขั้นต่ำต่อรายการ + การ์ดเตือนบน `/stock/dashboard` |

ค่าที่ผู้วางแผนเลือกเอง (เจ้าของยังไม่ได้ยืนยัน — แจ้งไว้แล้ว):
- ใส่กระเป๋าเกินของที่เหลือบนชั้น = **เตือน ไม่บล็อก** (แนวเดียวกับกระเป๋าชน)
- "ใกล้หมด" เทียบกับ **เหลือบนชั้น** ไม่ใช่ยอดรวม
- กระเป๋าที่มีแต่วัสดุสิ้นเปลืองล้วน = ไม่มีสถานะ "จัดครบ" (เหมือนกระเป๋าว่างในปัจจุบัน)
- กรอกจำนวนที่ใช้ได้ที่หน้าปิดงานที่เดียว (แท็บรับคืนรายชิ้นไม่มีช่องนี้ กันตัดซ้ำ)

## ศัพท์และโมเดล

- **ยอดคงเหลือ** = `items.quantity` = ทั้งหมดที่มี (บนชั้น + ในกระเป๋า) — ตัวเลขจริงตัวเดียวของระบบ
- **จำนวนประจำกระเป๋า** = `kit_contents.quantity` ของวัสดุสิ้นเปลืองในกระเป๋าใบนั้น
- **เหลือบนชั้น** = `max(0, ยอดคงเหลือ − ผลรวมจำนวนประจำกระเป๋า)` · **ขาด** = `max(0, ผลรวมประจำกระเป๋า − ยอดคงเหลือ)`
- ระบบถือว่ากระเป๋าที่กลับจากงานถูกเติมจนครบจำนวนประจำกระเป๋าจากชั้น (ตัดยอดรวม → เหลือบนชั้นลดเอง) ไม่มีบัญชีแยกรายตำแหน่ง
- ระดับสต็อก: `out` ยอด = 0 · `low` ขาด > 0 หรือ (ตั้งขั้นต่ำ และ เหลือบนชั้น ≤ ขั้นต่ำ) · `ok` ที่เหลือ
- ความเคลื่อนไหว (`stock_movements.reason`): `restock` เติม (+) · `use` เบิกใช้ (−) · `discard` ตัดทิ้ง (−, ต้องมีหมายเหตุ) · `adjust` ปรับยอด/ยอดตั้งต้น (±)
- วัสดุสิ้นเปลือง **ไม่เคยมีสถานะ `in_use`** และ RPC ไม่แตะ `items.status` — "ของหมด" คิดจากยอดล้วนๆ

## ข้อเท็จจริงจาก prod (อ่านเมื่อ 2026-10-03)

- `items.status` เป็น enum `item_status` และ **ไม่มีค่า `out_of_stock`** — ตัวเลือก "ของหมด" ในฟอร์มอุปกรณ์วันนี้บันทึกไม่ได้ (22P02) → migration นี้เพิ่มค่าให้ · SQL ที่เทียบสถานะต้อง cast `status::text`
- อุปกรณ์ 343 ชิ้น · จำนวน > 1 มี 6 ชิ้น (เช่น เทปผ้า 10, ตัวหนีบฉาก 8, ถุงพร็อบ 6) · ไม่มีชิ้นไหนอยู่เกิน 1 กระเป๋า · ไม่มีจำนวน ≤ 0 → ไม่ต้อง backfill ผู้ดูแลติ๊กแปลงเองทีละรายการ
- ไม่มี unique constraint บน `kit_contents.item_id` — กติกา "อยู่ได้ใบเดียว" อยู่ในโค้ด (`addItemToKit`)
- supabase-js `select(..., { head: true })` คืน error เปล่าและ false positive — probe ต้องใช้ GET

## Implementation Decisions

### ฐานข้อมูล (`20261007_consumables.sql`, idempotent, RLS เปิดไม่มี policy)

- `items`: `is_consumable boolean not null default false`, `unit text`, `min_quantity int` (null = ไม่เตือน, ≥ 0)
- `stock_movements`: `id, item_id → items ON DELETE CASCADE, delta int, balance_after int ≥ 0, reason, note, event_id → events SET NULL, kit_id → kits SET NULL, created_by → profiles SET NULL, created_at` · CHECK ทิศทาง: restock > 0 · use/discard < 0 · adjust ≠ 0 · index `(item_id, created_at desc)`
- unique partial index `(event_id, kit_id, item_id) WHERE reason = 'use' AND event_id IS NOT NULL AND kit_id IS NOT NULL` — งานหนึ่งตัดของชิ้นหนึ่งในกระเป๋าใบหนึ่งได้ครั้งเดียว
- `adjust_item_stock(p_item, p_delta, p_reason, p_note, p_event, p_kit, p_user) returns int` — UPDATE เดียวมีเงื่อนไข `is_consumable AND quantity + p_delta >= 0` แล้วแทรก movement ใน transaction เดียว · ไม่ผ่าน → `RAISE EXCEPTION 'NOT_CONSUMABLE'` / `'INSUFFICIENT_STOCK'` · REVOKE EXECUTE จาก PUBLIC/anon/authenticated (ครอบด้วยการเช็กว่ามี role — container ทดสอบไม่มี)
- `ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'out_of_stock'` (ครอบด้วยการเช็กว่ามี type)

### Server

- `lib/stock.ts` (ไม่ใช่ 'use server'): `moveStock(db, { itemId, delta, reason, note?, eventId?, kitId?, userId })` → `{ balance } | { error }` แปล exception เป็นข้อความไทย (23505 = "บันทึกการใช้ของงานนี้ไปแล้ว") · `getStockUser()` = `requireAuth` + (admin หรือ `profiles.allowed_modules ?? ['stock']` มี `stock` — ค่า default เดียวกับ `proxy.ts`)
- `app/(authenticated)/shelves/stock-actions.ts` ('use server', คืน `{ error }` ไม่ throw): `restockItem` `discardStock` `adjustStock(itemId, newTotal, note?)` = ผู้ดูแล · `drawStock` `loadStockHistory` (30 แถวล่าสุด) = `getStockUser` · ชื่อ action ห้ามขึ้นต้นด้วย `use` (ชน lint ของ hooks)
- `lib/logger.ts`: `RESTOCK_ITEM` `DRAW_STOCK` `DISCARD_STOCK` `ADJUST_STOCK`
- ยอดของวัสดุสิ้นเปลืองเปลี่ยนผ่าน `moveStock` เท่านั้น: `createItem` แทรก quantity 0 แล้ว `moveStock(+N, 'restock', 'ยอดตั้งต้น')` · `updateItem` ไม่ส่ง `quantity`/`status` เมื่อเป็นวัสดุสิ้นเปลือง
- ทุกอย่างเกี่ยวกับวัสดุสิ้นเปลืองยกเว้น "เบิกใช้" = ผู้ดูแลเท่านั้น (สร้างแบบติ๊ก, แปลง, แก้หน่วย/ขั้นต่ำ) · อุปกรณ์ปกติสร้าง/แก้ได้เหมือนเดิมทุกคน
- แปลง ปกติ → สิ้นเปลือง: ปฏิเสธเมื่อ `in_use` · ตั้ง quantity 0 แล้ว `moveStock(+Q, 'adjust', 'ยอดตั้งต้น')` · สิ้นเปลือง → ปกติ: ปฏิเสธเมื่อยังอยู่ในกระเป๋าใดก็ตาม

### กติกาล้วน — `shelves/consumable-logic.ts` (+ `consumable-logic.check.ts` แบบ `shelf-logic.check.ts`)

`onShelf` `shortage` `stockLevel` `parseQty` (จำนวนเต็ม 1–100000) `totalFromShelfCount(counted, inKits)` `isPacked(items)` (ไม่นับวัสดุสิ้นเปลือง; ไม่มีอุปกรณ์ปกติเลย = false) `planReturnUse(kitContents, input, alreadyCut)` → `{ error } | { cuts }` (ตรวจคู่กระเป๋า-ของ, จำนวนเต็ม ≥ 0, คู่ซ้ำ, ข้ามคู่ที่ตัดแล้วและ used = 0) · `auditTargets` ใน `shelf-logic.ts` รับ `onShelf?` — วัสดุสิ้นเปลืองที่เหลือบนชั้น 0 ไป `skipped`

### หน้าจอ

- **ฟอร์มอุปกรณ์** (`items/new/page.tsx`, `items/[id]/edit-item-form.tsx`): ช่องติ๊ก "วัสดุสิ้นเปลือง" → แสดง หน่วยนับ / จำนวนตั้งต้น (เฉพาะตอนสร้าง) / จำนวนขั้นต่ำ ซ่อน สถานะ + Serial · ฟอร์มแก้ไขแสดงจำนวนแบบอ่านอย่างเดียว · label ผ่าน `t.items.fields` (เพิ่มคีย์ใน `lib/dictionary.ts`)
- **รายการอุปกรณ์** (`items/items-table.tsx`): ป้าย "สิ้นเปลือง", จำนวน + หน่วย, ป้าย ใกล้หมด/ของหมด, ตัวกรองเฉพาะวัสดุสิ้นเปลือง, คอลัมน์ชั้นใช้ชั้นของตัวเอง
- **หน้าชั้น** (`shelves/[id]/page.tsx` + ไฟล์ใหม่ `consumables-section.tsx`): หมวด "วัสดุสิ้นเปลือง" แยกจาก "อุปกรณ์แยกชิ้น" · แถว = ชื่อ, เหลือบนชั้น (ตัวใหญ่) + หน่วย, "ทั้งหมด N · ในกระเป๋า M", ป้ายระดับ · ปุ่ม เบิกใช้ (ทุกคน) / เติม · ตัดทิ้ง · ปรับยอด · ประวัติ (ผู้ดูแล; ประวัติเห็นทุกคน) · ไดอะล็อกเดียว 4 โหมด: `<input type="number" inputMode="numeric">`, แสดงยอด ก่อน → หลัง, ปรับยอดกรอก "นับได้บนชั้น" · การ์ดสรุปเพิ่มใบที่ 4 · ข้อความไทยตรงๆ ตามไฟล์ข้างเคียง
- `moveToShelf` + `itemCandidates`: วัสดุสิ้นเปลืองวางบนชั้นได้แม้อยู่ในกระเป๋า (อุปกรณ์ปกติกติกาเดิม)
- **แดชบอร์ดสต็อก**: `loadShelfHealth` เพิ่ม `lowStock` (ระดับ out/low) · `shelf-alerts.tsx` เพิ่มแถว + ลิงก์ไปชั้น · `looseItemsWithoutShelf` นับวัสดุสิ้นเปลืองที่ไม่มีชั้นแม้อยู่ในกระเป๋า
- **กระเป๋า** (`kits/[id]/page.tsx`, `add-item-form.tsx`, `kit-details-view.tsx`, `actions.ts`): วัสดุสิ้นเปลืองเลือกได้แม้อยู่ใบอื่น (ยกเว้นใบนี้) · มีช่องจำนวน · `addItemToKit` ข้ามกติกาใบเดียว ไม่ล้าง `shelf_id` ซ้ำในใบเดิม = error เกินที่เหลือบนชั้น = สำเร็จ + `warning` · แสดง "× N หน่วย"
- **นำออก** (`kits/[id]/check/actions.ts`, `check-flow.tsx`): `checkoutItems` / `checkinItem` ปฏิเสธ id ของวัสดุสิ้นเปลือง · `syncPacked` ใช้ `isPacked` · หน้าจอแสดงเป็นกลุ่มแยก "วัสดุสิ้นเปลืองประจำกระเป๋า" ไม่มี checkbox/ปุ่มสถานะ
- **ปิดงาน** (`events/[id]/return/*`, `events/actions.ts::processEventReturn`): พารามิเตอร์ที่ 4 `consumableUse: { kitId, itemId, used }[] = []` · ลำดับ: ตรวจด้วย `planReturnUse` → ตัดทีละคู่ด้วย `moveStock('use', eventId, kitId)` → ล้ม = คืน error อีเวนต์ยังไม่ปิด → จึงบันทึก closure/สถานะ/ปิดงานตามเดิม · `itemStatuses` ของวัสดุสิ้นเปลือง = error · `kits_snapshot` ใส่ `isConsumable`, `used` · หน้าจอ: ช่อง "ใช้ไป" ค่าเริ่ม 0 + ปุ่ม "ใช้หมด" · ปุ่มยืนยันนับเฉพาะอุปกรณ์ปกติ · `event-closures-view.tsx` แสดง "ใช้ไป N"

## ไม่ทำในรอบนี้

สีกล่อง 3D ตามระดับสต็อก · ต้นทุนวัสดุเข้า Costs · ผูกกับเช็กลิสต์จัดซื้อ · ล็อต/วันหมดอายุ · บัญชีแยกรายตำแหน่ง · ช่อง "ใช้ไป" ในแท็บรับคืนรายชิ้น · สถานะจัดครบของกระเป๋าที่มีแต่วัสดุสิ้นเปลือง · อัปเดต /howto · ข้อความอังกฤษในหน้าชั้น · ทางลัดสร้างของใหม่จากหน้าชั้น

## Agent loop (ตาม CLAUDE.md)

Planner/Critic = Fable (session หลัก) · Executor = Agent tool `model: opus` · แบ่ง 3 แพ็กเกจ **ทำทีละแพ็กเกจตามลำดับ** บน working tree เดียว (ไม่ขนาน: ประหยัด token เท่ากัน แต่ไม่เสี่ยง `tsc` เห็นงานครึ่งๆ ของอีกตัว)

วิธีประหยัดรอบ:
1. Executor รับ brief สั้น: "อ่าน `docs/specs/consumables.md` ทำ WPn ให้ผ่าน AC ที่ระบุ" + กติกา — ไม่พิมพ์สเปคซ้ำ
2. รอบ 2+ ใช้ **SendMessage ถึง agent ตัวเดิม** ส่งเฉพาะ `failures` (agent ยังมี context — ไม่ต้อง brief ใหม่)
3. Critic ตรวจด้วยคำสั่งก่อนอ่านโค้ด: เช็กสคริปต์ → `tsc` → `eslint` ไฟล์ที่แตะ → อ่านเฉพาะ guard/wiring ที่ AC ระบุ → static render (`renderToStaticMarkup`) สำหรับ AC หน้าจอ
4. AC ที่ผ่านแล้ว lock ไม่ตรวจซ้ำ ยกเว้น AC19 (รันทุกแพ็กเกจ)
5. จบแพ็กเกจ: Critic commit บน `feature/consumables` แล้วจึงเริ่มแพ็กเกจถัดไป
6. Early exit: ผ่านครบ / score ≥ 0.9 **และ** AC ที่ `blocking` ผ่านครบ / score นิ่ง 2 รอบ / ครบ 5 รอบ

กติกา Executor ทุกแพ็กเกจ: ไม่รัน `next build` (dev server อาจเปิดอยู่) · ไม่ commit · ไม่แตะไฟล์นอกรายการของแพ็กเกจโดยไม่บอก · ไม่แก้ `.claude/settings.local.json` · จบงานรายงาน: ไฟล์ที่แตะ + ท้ายผลลัพธ์ของคำสั่งตรวจ

```json
{
  "plan": [
    "WP0 (Critic): แตก branch feature/consumables · วัด baseline `npx tsc --noEmit --incremental false` (จดจำนวน error)",
    "WP1 ฐาน: migration + scripts/consumables-sql.check.sh (postgres:17) · types/database.types.ts + types/index.ts · lib/stock.ts · lib/logger.ts · shelves/consumable-logic.ts + .check.ts · shelves/stock-actions.ts · items/actions.ts + items/[id]/actions.ts (กติกาสร้าง/แปลง ฝั่ง server)",
    "WP2 นำเข้า + ชั้น + แดชบอร์ด: ฟอร์มอุปกรณ์ 2 ไฟล์ + dictionary · items-table · shelves/[id]/page.tsx + consumables-section.tsx + shelf-view.tsx · shelves/actions.ts (moveToShelf, submitShelfAudit) · shelf-logic.ts + .check.ts · queries.ts (loadShelfHealth) · stock/dashboard/shelf-alerts.tsx",
    "WP3 กระเป๋า + ออกงาน + release: kits/[id]/{page,actions,add-item-form,kit-details-view} · kits/[id]/check/{actions,check-flow} · events/[id]/return/{page,return-checklist} · events/actions.ts::processEventReturn · events/event-closures/event-closures-view.tsx · package.json 1.36.0 · whats-new/updates.ts",
    "ปิดงาน (Critic): tag v1.36.0 · merge --no-ff เข้า main · ไม่ push · บอกเจ้าของให้รัน migration บน prod ก่อน deploy + รายการที่ต้องลองกดจริง"
  ],
  "acceptance_criteria": [
    { "id": "AC1", "wp": 1, "blocking": true, "check": "`bash scripts/consumables-sql.check.sh` รัน migration 2 รอบติดบน postgres:17 ไม่มี error; หลังรัน: items มี is_consumable/unit/min_quantity, มีตาราง stock_movements (relrowsecurity = true, ไม่มี policy), มี unique partial index ตามสเปค, enum item_status มีค่า out_of_stock" },
    { "id": "AC2", "wp": 1, "blocking": true, "check": "สคริปต์เดียวกัน assert adjust_item_stock: (a) +N เพิ่ม quantity และ movement.balance_after = ยอดใหม่ (b) ตัดเกินยอด → exception, quantity เดิม, ไม่มี movement เพิ่ม (c) item ที่ is_consumable = false → exception (d) reason กับเครื่องหมาย delta ไม่ตรงกัน → ล้ม (e) 'use' ซ้ำ (event, kit, item) เดิม → ล้มและ quantity ไม่เปลี่ยน (f) items.status ไม่ถูกแก้ (g) role anon ไม่มีสิทธิ์ EXECUTE; บรรทัดสุดท้ายของผลลัพธ์ = `consumables-sql: ผ่านทั้งหมด`" },
    { "id": "AC3", "wp": 1, "check": "`npx tsx \"app/(authenticated)/shelves/consumable-logic.check.ts\"` exit 0 และมี assertion ของ: onShelf/shortage; stockLevel ครบ out/low/ok รวม min = null และกรณีขาด; parseQty ปฏิเสธ 0, ลบ, ทศนิยม, ข้อความ; totalFromShelfCount; isPacked (มีแต่วัสดุสิ้นเปลือง = false, วัสดุสิ้นเปลืองไม่ถูกนับ); planReturnUse (คู่นอกกระเป๋าที่จอง, จำนวนไม่ใช่จำนวนเต็ม ≥ 0, คู่ซ้ำ → error; ข้ามคู่ที่ตัดแล้วและ used = 0)" },
    { "id": "AC4", "wp": 1, "blocking": true, "check": "stock-actions.ts: restockItem/discardStock/adjustStock เรียก getKitManager ก่อนแตะข้อมูล; drawStock/loadStockHistory เรียก getStockUser (admin ผ่าน, allowed_modules null = ['stock']); ทุก action คืน { error } ไม่ throw; discardStock ไม่มีหมายเหตุ → error; action ที่เปลี่ยนยอดเรียก logActivity ด้วย RESTOCK_ITEM / DRAW_STOCK / DISCARD_STOCK / ADJUST_STOCK ซึ่งอยู่ใน union ActionType" },
    { "id": "AC5", "wp": 1, "blocking": true, "check": "ไม่มีโค้ดใดเขียน items.quantity ของวัสดุสิ้นเปลืองนอก rpc adjust_item_stock: createItem (ติ๊ก) แทรก quantity 0 แล้วเรียก moveStock; updateItem ไม่ส่ง quantity/status เมื่อ item เป็นวัสดุสิ้นเปลือง; ผู้ไม่ใช่ผู้ดูแลส่ง is_consumable → { error }; ปกติ → สิ้นเปลือง ถูกปฏิเสธเมื่อ in_use; สิ้นเปลือง → ปกติ ถูกปฏิเสธเมื่ออยู่ในกระเป๋า; payload insert/update ของอุปกรณ์ปกติมีคีย์เดิมครบ" },
    { "id": "AC6", "wp": 2, "check": "ฟอร์มสร้างและแก้ไขอุปกรณ์มี input name=is_consumable, unit, min_quantity; เมื่อติ๊ก ช่องสถานะและ serial ไม่ถูก render; ฟอร์มแก้ไขของวัสดุสิ้นเปลืองไม่มี input name=quantity ที่แก้ได้; label มาจาก t.items.fields (คีย์ใหม่มีทั้ง th และ en ใน lib/dictionary.ts)" },
    { "id": "AC7", "wp": 2, "check": "static render ของ consumables-section: (ก) canManage = false มีปุ่ม 'เบิกใช้' และ 'ประวัติ' ไม่มี 'เติม' / 'ตัดทิ้ง' / 'ปรับยอด' (ข) canManage = true มีครบ; แต่ละแถวมีข้อความ เหลือบนชั้น, ทั้งหมด, ในกระเป๋า, หน่วย และป้าย 'ใกล้หมด' / 'ของหมด' ตาม stockLevel" },
    { "id": "AC8", "wp": 2, "check": "ไดอะล็อกสต็อกใช้ input type=number inputMode=numeric; ปุ่มยืนยัน disabled เมื่อ parseQty ไม่ผ่านหรือเบิก/ตัดเกินยอดคงเหลือ; แสดงยอดก่อนและหลัง; โหมดปรับยอดส่ง newTotal = totalFromShelfCount(นับได้, ในกระเป๋า); ประวัติแสดง วันที่ · ชื่อคน · ±จำนวน · เหตุผล · ชื่องาน (ถ้ามี)" },
    { "id": "AC9", "wp": 2, "check": "หน้าชั้น: วัสดุสิ้นเปลืองไม่ปรากฏในหมวด 'อุปกรณ์แยกชิ้น'; moveToShelf ไม่ปฏิเสธวัสดุสิ้นเปลืองที่อยู่ในกระเป๋า และยังปฏิเสธอุปกรณ์ปกติที่อยู่ในกระเป๋า; itemCandidates รวมวัสดุสิ้นเปลืองที่อยู่ในกระเป๋า" },
    { "id": "AC10", "wp": 2, "check": "ตรวจนับ: วัสดุสิ้นเปลืองที่เหลือบนชั้น 0 อยู่ใน skipped ทั้งในหน้าจอและใน submitShelfAudit (คิดจากฐานข้อมูล); `npx tsx \"app/(authenticated)/shelves/shelf-logic.check.ts\"` exit 0 และมี assertion ใหม่ของกรณีนี้" },
    { "id": "AC11", "wp": 2, "check": "loadShelfHealth คืน lowStock เฉพาะรายการระดับ out/low พร้อม id, name, onShelf, unit, shelfId, shelfCode; shelf-alerts แสดงจำนวน + ลิงก์ /shelves/<id> และไม่ render แถวนี้เมื่อ lowStock ว่าง; looseItemsWithoutShelf นับวัสดุสิ้นเปลืองที่ shelf_id ว่างแม้อยู่ในกระเป๋า" },
    { "id": "AC12", "wp": 2, "check": "items-table: วัสดุสิ้นเปลืองมีป้าย 'สิ้นเปลือง', จำนวนแสดงพร้อมหน่วย, มีตัวกรองเฉพาะวัสดุสิ้นเปลือง, คอลัมน์ชั้นใช้ shelves.code ของ item เอง" },
    { "id": "AC13", "wp": 3, "check": "addItemToKit: วัสดุสิ้นเปลืองใส่กระเป๋าใบที่ 2 ได้ด้วยจำนวนเต็ม ≥ 1; ซ้ำในใบเดิม → { error }; ไม่ update shelf_id เป็น null; จำนวน > เหลือบนชั้น → สำเร็จพร้อม warning; อุปกรณ์ปกติ: ยังปฏิเสธเมื่ออยู่ใบอื่น และยังล้าง shelf_id" },
    { "id": "AC14", "wp": 3, "check": "หน้ากระเป๋า: availableItems รวมวัสดุสิ้นเปลืองที่อยู่ใบอื่น ไม่รวมที่อยู่ในใบนี้; เลือกวัสดุสิ้นเปลืองแล้วมีช่องจำนวนและส่งค่าไป addItemToKit; รายการในกระเป๋าแสดงจำนวน + หน่วย + ป้าย" },
    { "id": "AC15", "wp": 3, "blocking": true, "check": "checkoutItems และ checkinItem คืน { error } เมื่อมี id ของวัสดุสิ้นเปลือง และไม่ update items.status ของมัน; syncPacked คำนวณด้วย isPacked; CheckFlow render วัสดุสิ้นเปลืองเป็นกลุ่มแยกไม่มี Checkbox และไม่มีปุ่มสถานะ; selectAll ไม่รวมวัสดุสิ้นเปลือง" },
    { "id": "AC16", "wp": 3, "blocking": true, "check": "processEventReturn: เรียกแบบ 3 อาร์กิวเมนต์เดิมยัง compile และทำงาน; consumableUse ผ่าน planReturnUse; ตัดยอดด้วย moveStock(reason 'use', eventId, kitId) ทุกคู่ **ก่อน** insert event_closures / update สถานะ / ปิดอีเวนต์; moveStock ล้ม → return { error } โดยยังไม่ปิดอีเวนต์; คู่ที่มี movement 'use' ของงานนี้อยู่แล้วถูกข้าม; itemStatuses ที่เป็นวัสดุสิ้นเปลือง → { error }" },
    { "id": "AC17", "wp": 3, "check": "หน้า /events/[id]/return: วัสดุสิ้นเปลืองแต่ละชิ้นต่อกระเป๋ามี input จำนวน 'ใช้ไป' ค่าเริ่ม 0 + ปุ่ม 'ใช้หมด' (= จำนวนประจำกระเป๋า) และไม่มี Select สถานะ; isComplete นับเฉพาะอุปกรณ์ปกติ; กระเป๋าที่มีแต่วัสดุสิ้นเปลืองไม่ตกไปหน้า 'ไม่มีอุปกรณ์'; kits_snapshot มี isConsumable + used; event-closures-view แสดง 'ใช้ไป N' แทนป้ายสถานะ" },
    { "id": "AC18", "wp": 3, "check": "package.json version = 1.36.0; UPDATES[0] ใน whats-new/updates.ts เป็นรายการใหม่ tag 'ใหม่' date = ผลของคำสั่ง `date +%F` วันที่ ship ข้อความไทยไม่มีศัพท์เทคนิค; proxy.ts และ lib/nav-config.ts ไม่มี diff; .claude/settings.local.json ไม่อยู่ใน commit ใด" },
    { "id": "AC19", "wp": "ทุกแพ็กเกจ", "blocking": true, "check": "`npx tsc --noEmit --incremental false`: จำนวน error ≤ baseline ของ WP0 และไม่มี error ในไฟล์ที่แพ็กเกจแตะ; `npx eslint <ไฟล์ที่แตะ>` ไม่มี error; `shelf-logic.check.ts`, `room-logic.check.ts`, `consumable-logic.check.ts` exit 0" }
  ],
  "pass_threshold": 0.9
}
```

## หลัง merge — ของเจ้าของ

1. รัน `supabase/migrations/20261007_consumables.sql` บน prod **ก่อน** deploy (หน้า /items และหน้าชั้น select คอลัมน์ใหม่)
2. ลองจริงบนมือถือ: สร้างวัสดุสิ้นเปลือง → วางบนชั้น → สแกน QR ชั้นด้วยบัญชีที่ไม่ใช่ผู้ดูแลแล้วเบิกใช้ → เติม/ตัดทิ้ง/ปรับยอดด้วยผู้ดูแล → ใส่ 2 กระเป๋า → นำออก → ปิดงานกรอก "ใช้ไป" → ดูการ์ดเตือนบนแดชบอร์ดสต็อก
