# MCP รอบ 2: ใบเบิก · เช็คอิน · ยอดขาย · CRM (v1.39.0)

ต่อยอด `docs/specs/mcp-server.md` (v1.38.0) — เพิ่ม tool อ่านอย่างเดียวอีก 8 ตัวใน 4 โมดูล · ตัดสินใจกับเจ้าของ 2026-10-04 · สถานะ: **แผนล็อกแล้ว ยังไม่เริ่มทำ**
branch `feature/mcp-tools-2` · ไม่มี migration · ไม่มี route ใหม่ (ใช้ `/api/mcp` เดิม)

## คำตัดสินของเจ้าของ (2026-10-04)

| โมดูล | ใครเห็นอะไร (ตามแอป) | ข้อมูลที่ตัดออก |
|---|---|---|
| ใบเบิก (`finance`) | พนักงานเห็นใบของตัวเอง · admin เห็นทุกใบ | เลขบัญชีธนาคาร · รูป/ไฟล์ใบเสร็จ-ใบกำกับ-สลิป |
| เช็คอิน (`checkin`) | ของตัวเอง · admin ทุกคน | รูปถ่าย · พิกัด GPS (latitude/longitude) |
| ยอดขาย (`salesboard`) | คนที่มีสิทธิ์ Sales Board (admin เสมอ) · ยอดรวม + เป้า + รายคนขาย + ค่าคอมแอดมินงวด 25→25 | — |
| CRM (`crm`) | ทุกคนที่มีสิทธิ์ CRM เห็นทุกลีด (เหมือนหน้า CRM) | LINE ไม่ส่ง · เบอร์โทรแสดงเฉพาะ 4 ตัวท้าย (`***-***-1234`) |

ค่าที่ผู้วางแผนเลือกเอง (ยังไม่ได้ยืนยัน): `notes` ของลีดไม่ส่ง (มักมีข้อมูลติดต่อ) แต่ `event_details` ส่ง · ใบเบิกไม่ส่ง `reject_reason` ของคนอื่นให้ non-admin (เห็นแต่ของตัวเองอยู่แล้ว) · ค่าคอมใช้งวดเดียวกับหน้า `/sales-board/commission` (25 → 25)

## Tools ใหม่ (8 ตัว) — ต่อท้าย `MCP_TOOLS` ใน `lib/mcp-tools.ts`

| tool | module | admin เท่านั้น | คืนอะไร (อ่านอย่างเดียว) |
|---|---|---|---|
| `my_claims` | finance | — | ใบเบิกของผู้ใช้เอง (ค่าเริ่มต้น = ใบที่ยังไม่จบ กติกาเดียวกับ `getStaffOpenClaims`; `status`/`month` กรองได้; `include_closed`): เลขใบ ชื่อ ประเภท หมวด ยอด สถานะ(ไทย) วันค่าใช้จ่าย วันส่ง/อนุมัติ/จ่าย งานที่ผูก เหตุผลที่ส่งกลับ ยอดใช้จริง/ยอดคืน (เงินทดลองจ่าย) เอกสารครบไหม |
| `all_claims` | finance | ✅ | ทุกใบ (ไม่รวมที่ซ่อน) กรอง `status`/`month`/`submitter`/`category` · คอลัมน์เดียวกับ `my_claims` + ชื่อผู้ส่ง · มี `summary` รวมยอดตามสถานะ |
| `my_checkins` | checkin | — | เช็คอินของตัวเองในช่วงวันที่ (ค่าเริ่มต้นเดือนนี้): วัน เวลาเข้า-ออก ชั่วโมง ประเภท (ออฟฟิศ/นอกสถานที่/หน้างาน) งาน หน้าที่ จังหวัด/อำเภอ ต่างจังหวัด หมายเหตุ |
| `team_checkins` | checkin | ✅ | ทุกคนในช่วงวันที่ (ค่าเริ่มต้นวันนี้) กรอง `user`/`event` · คอลัมน์เดียวกัน + ชื่อคน · `summary` บอกจำนวนคนที่เช็คอินและยังไม่เช็คเอาท์ |
| `sales_summary` | salesboard | — | เดือนที่เลือก (ค่าเริ่มต้นเดือนนี้): ยอดขาย ดีลที่ปิดได้ เก็บเงินแล้ว เงินเข้าเดือนนี้ รายจ่าย เทียบเป้า (`sales_board_targets`) · แยกตามประเภทงาน (ขาย/อีเวนต์/GP) · รายคนขาย (`assigned_sales`: ยอด+จำนวนดีล) · กรวยขาย — **กติกาเดียวกับหน้า Sales Board** (อิงเดือนที่สร้างลีด, ดีลที่ปิดได้อิง `closed_at`) |
| `commission_summary` | salesboard | — | งวดค่าคอมแอดมิน (ค่าเริ่มต้น `defaultPeriodMonth`): เป้า/ยอดจริง ตู้ และ อีเวนต์, รายการต่อลีด (ลูกค้า วันล็อคคิว จำนวนตู้/วันงาน), `warnings` ที่ต้องตรวจสอบ — ผ่าน `buildCommission` ตัวเดียวกับหน้า `/sales-board/commission` |
| `search_leads` | crm | — | ลีดตามคำค้น/สถานะ/ช่วงวันงาน/คนขาย (ค่าเริ่มต้น 50): ลูกค้า สถานะ(ไทยจาก crm_settings) ประเภทงาน วันงาน สถานที่ แพ็กเกจ ราคาเสนอ/ยืนยัน มัดจำ คนขาย ลูกค้าเก่า? เบอร์ 4 ตัวท้าย วันที่สร้าง |
| `lead_detail` | crm | — | ลีดหนึ่งราย (id หรือชื่อ): ข้อมูลข้างบน + `event_details` + งวดชำระ (ยอด/จ่ายแล้ว/กำหนด) + อีเวนต์ที่ผูก + ทีมที่จัด + ประวัติเปลี่ยนสถานะ 10 รายการล่าสุด · ชื่อซ้ำหลายราย → คืนรายการให้เลือก |

ทุก tool: `MAX_ROWS` 100 · เพดาน 64 KB · `summary` ไทย 1 บรรทัด · ไม่มีคำสั่งเขียน · **คีย์ต้องห้ามในผลลัพธ์**: `customer_line`, `latitude`, `longitude`, `photo_url`, `checkout_photo_url`, `bank_*`, `*_urls`, `pin`, `notes` (ลีด), `customer_phone` แบบเต็ม

## การเปลี่ยนแปลงในโครง

- `McpTool` เพิ่ม `adminOnly?: boolean` · `toolsFor(modules, role)` คืนเฉพาะ tool ที่ `modules` มีและ (ไม่ `adminOnly` หรือ role = admin) · `app/api/mcp/route.ts` ส่ง `identity.role` เข้า `toolsFor`
- `lib/oauth.ts::MCP_MODULES` = `['stock','events','jobs','finance','checkin','salesboard','crm']` · `modulesFor` เดิมใช้ได้ (admin ได้ทุกตัว; `salesboard` ของคนอื่นต้องอยู่ใน `allowed_modules` — ตรงกับ proxy)
- หน้ายินยอม `app/oauth/authorize/page.tsx::MODULE_LABEL` เพิ่ม 4 ป้าย: ใบเบิก / เช็คอิน / ยอดขาย / CRM
- ค่าคอม: ย้ายส่วนโหลดข้อมูลของ `sales-board/commission/page.tsx` ออกเป็น `sales-board/commission-data.ts::loadCommissionData(month)` ให้ทั้งหน้าเดิมและ tool ใช้ (หน้าเดิม render เหมือนเดิม — ตรวจด้วย HTML baseline)
- ยอดขาย: tool ใช้ฟังก์ชันล้วนชุดเดียวกับหน้า Sales Board จาก `overview/pl/pl-lib` (`isRevLead`, `leadAmount`, `claimEffective`, `claimDate`) และ `closed_at` จาก `crm_activities` แบบเดียวกับ `sales-board/page.tsx` (ย้าย `fetchAll` + การคิด `closed_at` ออกเป็น `sales-board/sales-data.ts::loadSalesBoardData()` ให้หน้าเดิมและ tool ใช้ร่วม) — ส่วนการรวมยอดต่อเดือนที่อยู่ใน `sales-board-view.tsx` (useMemo `cur`/`values`) **ไม่ย้าย** ในรอบนี้; tool เขียนสูตรตามคำอธิบาย `INFO` ในไฟล์นั้นและมีเทสต์ยืนยันค่ากับ fixture ที่คำนวณมือ
- `docs/mcp-setup.md` ตารางโมดูล + ตัวอย่างคำถาม · What's New · `package.json` 1.39.0

## ไม่ทำในรอบนี้

tool เขียนข้อมูล · เงินเดือน · เอกสาร · KPI · ต้นทุน (Costs) · การย้ายสูตรรายเดือนของ Sales Board ออกจาก view · การลาใน check-in (`leave_requests`)

## Agent loop (ตาม CLAUDE.md)

Planner/Critic = Fable · Executor = Agent `model: opus` ใหม่ต่อแพ็กเกจ · ทำทีละแพ็กเกจ · รอบแก้ส่งเฉพาะ `failures` · Critic: รันเช็กสคริปต์ทั้งหมด, deep-scan คีย์ต้องห้าม, HTML baseline ของหน้า commission และ sales board (เพราะย้ายตัวโหลดข้อมูล), tsc baseline 1 error, `next build` ตอนจบ

กติกา Executor: ไม่ `next build` · ไม่เปิด dev server · ไม่ commit · ไม่แตะ prod · ห้าม `any`/`eslint-disable` ในไฟล์ใหม่ · ไม่แก้ `proxy.ts`, migrations, `app/api/oauth/*`

```json
{
  "plan": [
    "WP0 (Critic): แตก feature/mcp-tools-2 · baseline tsc · เก็บ HTML baseline ของ sales-board-view และ commission-view ด้วย props ตัวอย่าง",
    "WP1 ใบเบิก + เช็คอิน: lib/mcp-tools.ts (+4 tools, adminOnly, toolsFor(modules, role)) · app/api/mcp/route.ts (ส่ง role) · lib/oauth.ts MCP_MODULES · lib/mcp-tools.check.ts + scripts/mcp-fake-db.ts ขยาย fixture · scripts/mcp-e2e.check.ts (เคส finance non-admin / admin)",
    "WP2 ยอดขาย + CRM: sales-board/sales-data.ts + commission-data.ts (ย้ายตัวโหลด) · หน้า sales-board และ commission ใช้ตัวโหลดใหม่ · +4 tools · เทสต์ fixture ของ sales_summary / commission_summary / search_leads (mask) / lead_detail",
    "WP3 release: หน้ายินยอม MODULE_LABEL · docs/mcp-setup.md · whats-new · package.json 1.39.0",
    "ปิดงาน (Critic): เช็กทั้งหมด + HTML baseline + build · tag v1.39.0 · merge --no-ff · ไม่ push"
  ],
  "acceptance_criteria": [
    { "id": "T1", "wp": 1, "blocking": true, "check": "toolsFor(modules, role): tool ที่ adminOnly ไม่ปรากฏใน tools/list ของ non-admin แม้มีโมดูล และ tools/call คืน isError ไทย; admin เห็นครบ 17; route ส่ง identity.role; e2e มีเคส finance-only non-admin เห็น my_claims ไม่เห็น all_claims" },
    { "id": "T2", "wp": 1, "blocking": true, "check": "my_claims ของ non-admin query มี .eq('submitted_by', userId) เสมอ (ตรวจด้วย fake db ว่าไม่คืนใบของคนอื่นแม้ส่ง args แปลก); all_claims ไม่รวมใบที่ซ่อน (deleted_at) ; สถานะเป็นไทย; ไม่มีคีย์ *_urls / bank ในผลลัพธ์ (deep scan)" },
    { "id": "T3", "wp": 1, "blocking": true, "check": "my_checkins มี .eq('user_id', userId) เสมอ; team_checkins ลงทะเบียนเฉพาะ admin; ผลลัพธ์ไม่มี latitude/longitude/photo_url/checkout_photo_url (deep scan); ประเภทเป็นไทย; ชั่วโมงคำนวณจาก checked_in_at/checked_out_at (ยังไม่ออก = null)" },
    { "id": "T4", "wp": 2, "blocking": true, "check": "sales-board/page.tsx และ commission/page.tsx ใช้ loadSalesBoardData / loadCommissionData; `git diff` ของ sales-board-view.tsx และ commission-view.tsx ว่าง; เทสต์ด้วย fake db: loadSalesBoardData() คืน leads(+closed_at)/claims/installments/jobEvents/costItems/targetStore/packageLabels และ loadCommissionData() คืน leads(won เท่านั้น)/lockDates/targetStore/statusLabels/unitCountAvailable/finance(admin) เท่ากับที่คำนวณจาก fixture เดียวกันด้วยกติกาเดิม (closed_at = status_change → accepted/success ครั้งแรก เวลาไทย; unit_count ไม่มี → fallback); static render ของ CommissionView ด้วย props ตัวอย่างชุดเดิม **เท่ากับ baseline ทุกตัวอักษร** (SalesBoardView render ฝั่ง server เป็นโครงรอโหลด จึงใช้ diff ว่างแทน)" },
    { "id": "T5", "wp": 2, "check": "sales_summary: fixture 6 ลีด (เดือนนี้/เดือนก่อน, won/ไม่ won, มูลค่า 0, คนขาย 2 คน, work_type 3 แบบ) ให้ค่า ยอดขาย/ดีลที่ปิดได้/เก็บเงินแล้ว/เงินเข้า/รายจ่าย ตรงกับที่คำนวณมือใน check และตรงกับกติกาใน INFO ของ sales-board-view; รายคนขายรวมเท่ายอดรวม; เป้าอ่านจาก sales_board_targets" },
    { "id": "T6", "wp": 2, "check": "commission_summary เรียก buildCommission + mergeTargets + commissionPeriod ตัวเดียวกับหน้า commission; fixture เดียวกันให้ booths/events/warnings เท่ากับที่ buildCommission คืนตรงๆ" },
    { "id": "T7", "wp": 2, "blocking": true, "check": "search_leads / lead_detail: ไม่มีคีย์ customer_line, notes, customer_phone ในผลลัพธ์; มี phone_last4 รูปแบบ ***-***-1234 (เบอร์สั้นกว่า 4 หลัก → null); สถานะเป็นไทยจาก crm_settings (ไม่มี = ค่าเดิม); lead_detail ชื่อซ้ำ → คืน candidates ไม่ error; งวดชำระมียอด/จ่ายแล้ว/กำหนด" },
    { "id": "T8", "wp": 3, "check": "หน้ายินยอมแสดงป้ายโมดูลใหม่ 4 ตัว (ไทย) และยังซ่อนปุ่มอนุญาตเมื่อไม่มีโมดูลใดเลย; docs/mcp-setup.md ตารางโมดูลครบ 7 + ตัวอย่างคำถามของโมดูลใหม่; UPDATES[0] tag 'ปรับปรุง' module 'สต็อก' date = `date +%F` ไทย; package.json 1.39.0" },
    { "id": "T9", "wp": "ทุกแพ็กเกจ", "blocking": true, "check": "lib/mcp-tools.ts ยังไม่มี .insert( .update( .delete( .upsert( .rpc(; grep ไฟล์ที่แตะไม่เจอ any/eslint-disable (ยกเว้นที่มีอยู่ก่อนใน sales-board/page.tsx, commission/page.tsx — จำนวนต้องไม่เพิ่ม); tsc baseline 1 error; mcp-tools / mcp-e2e / oauth-flow / proxy-session check exit 0; proxy.ts, migrations, app/api/oauth ไม่มี diff" }
  ],
  "pass_threshold": 0.9
}
```

## หลัง merge — ของเจ้าของ

ไม่ต้องรัน SQL · ถ้า v1.38.0 ยังไม่ได้ deploy ให้รวมไปด้วยกัน (migration 20261008 ยังต้องรันก่อน) · ลองถาม: "ใบเบิกของฉันค้างอยู่กี่ใบ" · "เดือนนี้ขายได้เท่าไรเทียบเป้า" · "ลูกค้าชื่อ … สถานะอะไร งานวันไหน" · admin: "วันนี้ใครเช็คอินบ้าง" · "ค่าคอมงวดนี้ได้กี่ตู้"
