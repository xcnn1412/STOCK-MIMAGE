# ล้าง lint error ในไฟล์กระเป๋า/อีเวนต์ (v1.37.1)

งานภายใน ไม่มีผลที่ผู้ใช้เห็น · วางแผน 2026-10-04 · สถานะ: **เสร็จ 2026-10-04 — ทั้ง 2 แพ็กเกจผ่านรอบเดียว** · 53 → 0 errors · HTML ของ 6 component เท่า baseline ทุกตัวอักษร (print-view ต่างเฉพาะ QR ตามแผน) · Opus ลบ `eslint-disable` เก่า 4 บรรทัดใน `events/actions.ts` เพิ่มด้วย (รับไว้) · ใช้ `.overrideTypes<T, { merge: false }>()` (runtime no-op) กับ join ที่ supabase-js เดาเป็น array · `.single<T>()` เมื่อ client ไม่มี Database type
branch `hotfix-v1.37.1` · ไม่มี migration · **ไม่ลง What's New** (งาน internal ตาม CLAUDE.md)

## ขอบเขต

`npx eslint "app/(authenticated)/kits" "app/(authenticated)/events"` วันนี้ = **53 errors ใน 14 ไฟล์** (repo ทั้งหมด 373 — นอกขอบเขต)

| กฎ | จำนวน | ไฟล์ |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 38 | events: `[id]/edit/page.tsx` 5 · `[id]/edit/edit-event-form.tsx` 1 · `[id]/return/page.tsx` 2 · `actions.ts` 5 · `event-closures/actions.ts` 1 · `event-closures/event-closures-view.tsx` 1 · `events-log-sheet.tsx` 11 · `new/create-event-form.tsx` 1 · `new/page.tsx` 2 — kits: `[id]/actions.ts` 3 · `[id]/check/check-flow.tsx` 3 · `[id]/page.tsx` 3 |
| `react-hooks/static-components` | 12 | `edit-event-form.tsx` 6 · `create-event-form.tsx` 6 — ทั้งหมดคือ `const Label = (...: any) => <label>` ที่ประกาศซ้อนใน component |
| `react-hooks/set-state-in-effect` | 2 | `kits/[id]/check/check-flow.tsx` L26 · `kits/[id]/print/print-view.tsx` L17 |
| `react/no-unescaped-entities` | 1 | `kits/[id]/edit-kit-dialog.tsx` L59 (ประโยคอังกฤษ "you're") |

## กติกาการแก้ (ล็อก)

- **เปลี่ยนเฉพาะชนิดข้อมูลและโครงที่กฎบังคับ — พฤติกรรมตอนรันต้องเหมือนเดิมทุกจุด** ไม่แก้ตรรกะ ไม่แก้ข้อความ ไม่จัดรูปแบบไฟล์ใหม่ ไม่แก้ warning
- `any` → ชนิดจริง: แถวจากฐานข้อมูลใช้ชนิดจาก `@/types` (`Kit`, `Item`, `KitContent`, `Event`, `Profile` ฯลฯ) หรือชนิด inline แคบๆ ตามคอลัมน์ที่ select จริง (เช่น `{ user_id: string; role: string; profiles: { full_name: string | null } | null }`) · `details` ของ activity log = `Record<string, unknown>` แล้ว narrow ตรงจุดใช้ · `staffRoles` = ชนิดเดียวใช้ร่วมกันทั้ง `new/page.tsx`, `[id]/edit/page.tsx`, สองฟอร์ม (ประกาศไว้ที่ `events/event-form-types.ts` ใหม่ หรือที่ฟอร์มใดฟอร์มหนึ่งแล้ว export) · ห้ามใช้ `as unknown as X` เพื่อปิดปากกฎในที่ที่ชนิดจริงเขียนได้ตรงๆ · ห้าม `// eslint-disable`
- `static-components`: ย้าย `Label` ออกไปประกาศระดับโมดูล (บนสุดของไฟล์) พร้อม props type `{ children: React.ReactNode; htmlFor?: string; className?: string }` · class และ markup เดิมทุกตัวอักษร · ไฟล์ละตัว ไม่ต้องรวมเป็นไฟล์กลาง
- `set-state-in-effect`
  - `check-flow.tsx` L26 (`useEffect(() => setPackedSaved(initialPacked), [initialPacked])`): ใช้รูปแบบ "adjust state when a prop changes" ของ React — เก็บ `prevInitialPacked` ใน state แล้วตั้งค่าตอน render เมื่อไม่เท่ากัน ลบ effect นี้ทิ้ง · effect `syncedRef` ของ v1.37.0 คงเดิม
  - `print-view.tsx` L17 (`setUrl(window.location.origin + …)` ใน effect): ลบ state/effect แล้วรับ `origin` เป็น prop จาก `kits/[id]/print/page.tsx` ซึ่งคำนวณจาก `headers()` (`x-forwarded-host` / `host` / `x-forwarded-proto`) **เหมือน `kits/print/page.tsx` ทุกบรรทัด** (ย้ายโค้ด 4 บรรทัดนั้นเป็น helper `requestOrigin()` ใน `lib/request-origin.ts` แล้วใช้ทั้ง 3 หน้า QR: kit print, kits sheet, room sheet) · QR จึง render ตั้งแต่ server
- `no-unescaped-entities`: แทนประโยคอังกฤษด้วย `t.kits.editHint` — เพิ่มคีย์ใน `lib/dictionary.ts` ทั้ง `th` ("แก้ชื่อหรือรายละเอียดของกระเป๋า แล้วกดบันทึก") และ `en` ("Edit the kit name or details, then save")

## ไม่ทำในรอบนี้

lint error ในโมดูลอื่น (320 จุด) · warnings ทั้งหมด (272 รวม `<img>` และ unused vars) · ปรับโครงฟอร์มอีเวนต์ · เพิ่มเทสต์ให้ฟอร์มอีเวนต์

## Agent loop (ตาม CLAUDE.md)

Planner/Critic = Fable · Executor = Agent `model: opus` · 2 แพ็กเกจ ทำทีละแพ็กเกจ · รอบแก้ส่งเฉพาะ `failures`

**การตรวจ "พฤติกรรมเหมือนเดิม" (Critic ทำเองที่ WP0 และหลังแต่ละแพ็กเกจ):** static render ด้วย `renderToStaticMarkup` + stub provider (สูตรใน memory `kits-flow-plan`) ของ 6 component ด้วย props ตัวอย่างชุดเดิม → เก็บ HTML baseline ที่ WP0 → หลังแก้ต้อง **เท่ากันทุกตัวอักษร** ยกเว้น `print-view` ที่ยอมให้ต่างเฉพาะส่วน QR (เดิม render ว่างฝั่ง server): `edit-event-form`, `create-event-form`, `events-log-sheet` (ป้อน log ครบทุก action_type), `event-closures-view`, `check-flow`, `edit-kit-dialog`

กติกา Executor: ไม่รัน `next build` · ไม่เปิด dev server · ไม่ commit · ไม่แตะไฟล์นอกรายการ · ไม่แก้ `.claude/settings.local.json`

```json
{
  "plan": [
    "WP0 (Critic): แตก hotfix-v1.37.1 · baseline tsc = 1 error · เก็บ HTML baseline ของ 6 component",
    "WP1 อีเวนต์ (41 errors): 9 ไฟล์ใต้ app/(authenticated)/events + ไฟล์ชนิด staffRoles",
    "WP2 กระเป๋า (12 errors) + release: 5 ไฟล์ใต้ app/(authenticated)/kits · lib/request-origin.ts (ใหม่) + 3 หน้า QR · lib/dictionary.ts · package.json 1.37.1",
    "ปิดงาน (Critic): เทียบ HTML baseline · next build · tag v1.37.1 · merge --no-ff · ไม่ push"
  ],
  "acceptance_criteria": [
    { "id": "L1", "wp": 1, "blocking": true, "check": "`npx eslint \"app/(authenticated)/events\"` = 0 errors (warnings ไม่นับ)" },
    { "id": "L2", "wp": 2, "blocking": true, "check": "`npx eslint \"app/(authenticated)/kits\" lib/request-origin.ts lib/dictionary.ts` = 0 errors" },
    { "id": "L3", "wp": "ทุกแพ็กเกจ", "blocking": true, "check": "grep ในไฟล์ที่แตะไม่เจอ `: any`, `as any`, `any[]`, `<any>`, `eslint-disable` (ยกเว้น eslint-disable ที่มีอยู่ก่อนใน check-flow.tsx บรรทัด syncedRef); `as unknown as` ไม่เพิ่มจากจำนวนที่ HEAD" },
    { "id": "L4", "wp": 1, "blocking": true, "check": "`Label` ใน edit-event-form.tsx และ create-event-form.tsx ประกาศระดับโมดูล มี props type ชัด markup/class เดิมทุกตัวอักษร; static render ของสองฟอร์มเท่ากับ baseline ทุกตัวอักษร" },
    { "id": "L5", "wp": 1, "check": "static render ของ events-log-sheet (ทุก action_type) และ event-closures-view เท่ากับ baseline ทุกตัวอักษร" },
    { "id": "L6", "wp": 2, "blocking": true, "check": "check-flow.tsx ไม่มี useEffect ที่เรียก setPackedSaved จาก initialPacked; ใช้รูปแบบ prev-prop-in-state; static render เท่ากับ baseline; effect syncedRef ยังอยู่" },
    { "id": "L7", "wp": 2, "check": "print-view.tsx ไม่มี useState/useEffect สำหรับ url; รับ origin prop; kits/[id]/print/page.tsx, kits/print/page.tsx, shelves/rooms/[roomId]/print/page.tsx ใช้ requestOrigin() จาก lib/request-origin.ts ตัวเดียว (ไม่มีโค้ด headers() ซ้ำ 3 ที่); static render ของ print-view ต่างจาก baseline เฉพาะส่วน QR" },
    { "id": "L8", "wp": 2, "check": "edit-kit-dialog.tsx ใช้ t.kits.editHint; dictionary มีคีย์ทั้ง th และ en; ไม่มี `you're`" },
    { "id": "L9", "wp": "ทุกแพ็กเกจ", "blocking": true, "check": "`npx tsc --noEmit --incremental false` เหลือเฉพาะ baseline 1 error; consumable-logic / shelf-logic / room-logic / proxy-session check exit 0; `git diff --stat` ไม่มีไฟล์นอกรายการของแพ็กเกจ" },
    { "id": "L10", "wp": 2, "check": "package.json = 1.37.1; whats-new/updates.ts ไม่มี diff; ไม่มีไฟล์ใหม่ใน supabase/migrations; proxy.ts / nav-config.ts ไม่มี diff" }
  ],
  "pass_threshold": 0.9
}
```
