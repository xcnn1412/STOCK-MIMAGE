# หน้าติดตามงาน (/jobs/tracking) — ปรับ flow การรับงาน: ประสิทธิภาพ + UX

สถานะ: แผนล็อกแล้ว 2026-09-18 · ใช้กับ loop วางแผน → ลงมือ → ตรวจ (CLAUDE.md) **ทีละเฟส** (3 เฟส บน branch เดียว `feature/jobs-tracking-claim-flow`, commit ต่อเฟสหลัง Critic ผ่าน, tag v1.12.0 ตอนจบเฟส 3)
ต่อยอดจาก `jobs-pool.md`, `jobs-tracking-ui.md`, `jobs-tracking-focus.md`, `dashboard-alerts.md`, `graphic-work-order-manual-open.md` · ศัพท์ตาม `CONTEXT.md`

## Problem

งานหนึ่งงานมีจุดให้ "รับ" 5 จุด (ใบงานกราฟิก, หน้าที่จัดคน/จัดรถ/จัดกระเป๋า, ใบงานหน้างาน) ปุ่มหน้าตาเดียวกันหมด โชว์ให้ทุกคนแม้ไม่ใช่แผนกที่รับได้ กดแล้วค่อยเจอ error รับได้เฉพาะแท็บภาพรวม แท็บฝ่ายว่างเปล่า กระดิ่งพาไปหน้าที่ไม่มีปุ่มรับ ทุกคลิกรอ server 8–10 คิวรีแล้วโหลดหน้าใหม่อีก 14 คิวรีเรียงต่อกัน ไม่มี optimistic update สำหรับปุ่มรับ/คืน และหน้าไม่รับข้อมูลใหม่จากคนอื่นจนกว่าจะ reload

## ข้อตัดสินใจที่ล็อก

| id | ตัดสินใจ |
|---|---|
| D1 | ปุ่มรับของแผนกอื่น: **แสดงจาง** (disabled, ไม่มี onClick) พร้อมข้อความ "รอ<แผนก>รับ" (หลายแผนกคั่นด้วย " / ") ไม่ซ่อน — ยังเห็นว่าใครควรรับ |
| D2 | **รับงานได้ทั้งแท็บภาพรวมและแท็บฝ่าย** — แท็บฝ่าย (กราฟิก / จัดคน / จัดรถ / กระเป๋า / หน้างาน) มีส่วน "รอรับ" อยู่บนสุด ตามด้วย "รับแล้ว" |
| D3 | **server บังคับกติกาเดียวกับ UI**: `assignLeadStaff` ต้องเป็นผู้รับหน้าที่ `staffing` ของงานนั้น, `assignLeadVehicle` → `vehicle`, `bookKitForLead`/`unbookKitForLead` → `kits` (เพิ่มจาก `requireKitManager` เดิม) — ยกเว้น pool manager (admin หรือ ฝ่ายประสานงาน) ทำได้เสมอ · **ไม่แตะ** `setKitPacked`, `updateLeadTracking`, `updateJobDesignStatus` · ฝั่ง UI ต้องสอดคล้อง: ช่องหน้าที่ที่ **คนอื่น** รับไปแล้ว (ไม่ใช่ฉัน และฉันไม่ใช่ manager) แสดงอ่านอย่างเดียว (สรุปสิ่งที่จัดไว้ + "ผู้รับ: X") ไม่มีตัวแก้ไข ทั้งตารางภาพรวม, แท็บฝ่าย และการ์ดมือถือ (เพิ่มหลังตรวจเฟส 2 — เดิมตัวแก้ไขยังโชว์แล้วไปเจอ error ที่ server) |
| D4 | ไม่ใช้ Supabase Realtime รอบนี้ — refresh เมื่อกลับมาที่แท็บเบราว์เซอร์ + ทุก 60 วินาทีขณะหน้าเปิดอยู่ |
| D5 | งานที่ผ่านแล้วเกิน 30 วัน (วันสิ้นสุดหรือวันงาน < วันนี้ − 30) ไม่โหลดโดยปริยาย โหลดเมื่อ `?past=1` |
| D6 | ไม่แตะ schema ไม่มี migration (ทุกอย่างคำนวณ/กรองจากข้อมูลเดิม) |
| D7 | คำบนปุ่มรับตามสิ่งที่รับ: `รับออกแบบ` / `รับจัดคน` / `รับจัดรถ` / `รับจัดกระเป๋า` / `รับเป็นหัวหน้างาน` — ไม่ใช้ "รับงาน" ลอยๆ |

## เฟส 1 — เร็วขึ้นทันที (ไม่เปลี่ยนหน้าตา)

1. **Snapshot 3 ระลอก** ([data.ts](../../app/(authenticated)/jobs/tracking/data.ts) `getTrackingSnapshot`): ระลอก A `Promise.all`: crm_leads, kits, job_settings (สถานะ + แผนกทุกหมวดในคิวรีเดียว `.in('category', [...])`), crm_settings staff_role, profiles approved, `getSessionLight` · ระลอก B (ต้อง leadIds): events, jobs, lead_duty_claims · ระลอก C (ต้อง eventIds/dates): event_staff, event_kits ของงาน + event_kits วันเดียวกัน, event_vehicles — ผลลัพธ์ทุกฟิลด์เท่าเดิม (ลำดับ rows/people/roles/kits เท่าเดิม)
2. **ตัดงานที่ผ่านแล้ว** (D5): `getTrackingSnapshot({ includePast?: boolean })` — ค่าเริ่มต้นกรองที่ server (`.or('event_date.is.null,event_end_date.gte.<cutoff>,and(event_end_date.is.null,event_date.gte.<cutoff>)')` หรือเทียบเท่า) · `page.tsx` อ่าน `searchParams.past === '1'` → `includePast: true` · ปุ่ม "แสดงงานที่ผ่านแล้ว" ใน view: ถ้ายังไม่มี `?past=1` ให้ `setParams({ past: '1' })` (โหลดเพิ่ม) แล้วค่อยเปิด `showPast`; ปิด = `showPast=false` + `past=null` · dashboard/alert panels เรียกแบบไม่รวม past (พฤติกรรมแผงเตือนย้อนหลัง 14 วันต้องไม่เปลี่ยน — cutoff 30 วัน ครอบ 14 วันอยู่แล้ว)
3. **ลดรอบใน action** ([actions.ts](../../app/(authenticated)/jobs/actions.ts) `claimPoolJob`, `releasePoolJob`, `skipPoolJob`, `reassignPoolJob`, `assignPoolJob`, `claimLeadDuty`, `releaseLeadDuty`): (a) `getPoolActor` ไม่คิวรี profiles ซ้ำ — ขยาย `requireAuth()` ใน [lib/auth.ts](../../lib/auth.ts) ให้ select `department, full_name, nickname` มาด้วยและคืนใน `AuthSession` (ฟิลด์ optional ไม่กระทบผู้เรียกเดิม) (b) อ่าน settings ที่ต้องใช้พร้อมกัน (`Promise.all`) หรือรวมเป็นคิวรีเดียว (c) หลัง update สำเร็จ: `logPoolJobActivity` + `logActivity` + แจ้งเตือน รัน `Promise.all` (ยัง await ก่อน return) · เป้าหมาย ≤ 4 ระลอกเรียงกันต่อ action (auth → อ่าน job/settings → เขียน → log/notify)
4. **Optimistic รับ/คืน**: ใน `TrackingView` เพิ่ม overlay state `claimDraft` (jobId → `{ status, claimed_by }` หรือ `'awaiting'`) และ `dutyDraft` (dutyKey → `DutyClaim | null`) ทับ props `jobs`/`dutyClaims` แบบเดียวกับ `designDraft` — `ClaimChip`/`ReleaseChip`/`DutyGate`/`PoolCardActions` เรียก callback จาก view (`onClaimJob`, `onReleaseJob`, `onClaimDuty`, `onReleaseDuty`) ที่ set draft ทันที เรียก action แล้วย้อนกลับ + toast เมื่อ error · draft ของรายการที่ props ตามทันแล้ว (ค่าตรงกัน) ถูกล้าง
5. **rows sync + refresh** (D4): `rows` ต้องรับ `leads` ใหม่จาก props เมื่อ server revalidate (pattern "adjust state during render" ด้วย prev-props state — ห้ามใช้ setState ใน useEffect ให้ eslint `react-hooks/set-state-in-effect` ฟ้อง) โดยไม่ทับ optimistic edit ที่ยังรออยู่ (ยอมรับ: edit ที่ยังไม่บันทึกอาจถูกทับเมื่อ server ตอบก่อน — staffQueue serialize อยู่แล้ว) · `router.refresh()` เมื่อ `visibilitychange` กลับเป็น visible และ `setInterval` 60 วินาทีเฉพาะขณะ visible (cleanup ตอน unmount)
6. **Check script** ใหม่ `scripts/tracking-snapshot-check.ts` (รันด้วย tsx, ใช้ .env.local เหมือน script อื่น, อ่านอย่างเดียว): เรียก `getTrackingSnapshot()` พิมพ์เวลา (ms) และจำนวน rows/jobs/dutyClaims/people; ใช้เปรียบเทียบก่อน/หลัง (บันทึกตัวเลขทั้งสองในรายงาน)

## เฟส 2 — รับงานให้ถูกคน ถูกที่

1. **ส่งสิทธิ์ลง view**: snapshot เพิ่ม `poolDepartments: Record<'graphic' | 'onsite' | PrepDuty, string[]>` (graphic/หน้าที่ = `dutyDepartments` เดิม + `pool_team_onsite`) และส่ง `myDepartment`, `poolDepartments` ให้ `TrackingView` → `PoolTabs`/`DutyTab`/`DutyGate`/`ClaimChip`
2. **ปุ่มตาม D1/D7**: ใน [tracking-logic.ts](../../app/(authenticated)/jobs/tracking/tracking-logic.ts) เพิ่ม pure: `CLAIM_LABELS: Record<'graphic'|'onsite'|PrepDuty, string>` และ `claimGate(kind, myDepartment, isAdmin, poolDepartments) → { allowed: boolean; waitingFor: string }` (`waitingFor` = "รอ<แผนก / แผนก>รับ"; รายการว่าง = "รอแอดมินรับ") + assert ใน `tracking-logic.check.ts` · `ClaimButton` รับ `kind`, `allowed`, `waitingFor`, `emphasis` — `allowed=false` = ป้ายจาง (ไม่มี onClick) · `emphasis` (เรืองแสง/pulse) เฉพาะรายการที่ "ใกล้วันงานที่สุด" ของแต่ละคอลัมน์/หน้าที่ในชุดที่มองเห็น ปุ่มอื่นเป็น gradient นิ่ง (pure helper `emphasizedClaims(...)` หรือคำนวณใน view ก็ได้แต่ต้องมี assert ถ้าอยู่ใน logic)
3. **แท็บฝ่ายรับได้** (D2): `PoolTabs` และ `DutyTab` แสดง 2 ส่วน: "รอรับ (N)" บนสุด (ใบงาน `awaiting_claim` / งานที่หน้าที่นั้นยังไม่มีผู้รับ พร้อม `ClaimChip`/`DutyGate`) แล้ว "รับแล้ว (M)" · ตัวเลขบนแท็บ = "รอรับ N · รับแล้ว M" (N > 0 สีเหลืองอำพัน) · ลบข้อความ "กดรับงานได้จากแท็บภาพรวม" ทุกที่ · ชิป "ใบงานของฉัน" และค้นหา/เรียง ใช้กับทั้งสองส่วน
4. **กระดิ่งพามาถูกที่**: [lib/notifications.ts](../../lib/notifications.ts) เพิ่ม `NotificationType`: `job_pool_claimed`, `job_pool_released`, `job_pool_skipped`, `job_pool_assigned`, `duty_claimed`, `duty_released` (ใช้แทน `job_status_changed`/`job_assigned` เฉพาะที่ยิงจาก action ของพูล; `job_pool_new` คงเดิม) · [notification-bell.tsx](../../components/notification-bell.tsx) `getNotificationUrl`: type ที่ขึ้นต้น `job_pool_` → `/jobs/tracking?job=<reference_id>` · `duty_*` → `/jobs/tracking?lead=<reference_id>&tab=<duty>` (duty ใส่ไว้ใน body/metadata ไม่ได้ → ใช้ `reference_type: 'crm_lead'` + `tab` จาก type ไม่ได้เช่นกัน; ทางง่าย: ให้ action ยิง `referenceId = leadId` และ bell ส่งไป `?lead=` ที่ภาพรวม ซึ่งไฮไลต์งานอยู่แล้ว) · `TrackingView` รองรับ `?job=<jobId>`: หา lead จาก `jobs`, เลือกแท็บตาม `job_type` (graphic → `tab=graphic`; onsite → `tab=onsite` ถ้า admin ไม่งั้นภาพรวม) และไฮไลต์การ์ด/แถว · ตรวจว่า `notifications.type` ไม่มี CHECK แล้ว (migration 20260831 ดรอปไว้) — ถ้าตารางยังมี CHECK ของ `reference_type` ห้ามเพิ่ม reference_type ใหม่ (ใช้ `job`/`crm_lead` เดิม)
5. **D3 ฝั่ง server**: helper `requireDutyHolder(supabase, actor, leadId, duty)` ใน actions.ts — pool manager ผ่าน; ไม่งั้นต้องมีแถว `lead_duty_claims (lead_id, duty, claimed_by = actor)` ไม่มี → `{ error: 'ต้องกดรับหน้าที่<label>ของงานนี้ก่อน (หรือให้แอดมิน/ฝ่ายประสานงานจัดแทน)' }` · ใช้ใน `assignLeadStaff`, `assignLeadVehicle`, `bookKitForLead`, `unbookKitForLead` · ไทม์ไลน์ quick-assign (`onQuickAssign`/`onQuickRemove`) และหน้าต่างจัดคน/เลือกรถที่เปิดจากไทม์ไลน์: view รู้ `claimByDuty` อยู่แล้ว → ถ้าไม่ใช่ผู้รับ/manager ให้ปิดการคลิกพร้อม tooltip "ต้องรับหน้าที่จัดคนก่อน" (server ยังตอบ error ซ้ำอีกชั้น)

## เฟส 3 — มุมมอง "ของฉัน" + ลดความรก

1. **แถบ "ของฉัน"** บนสุดของแท็บภาพรวม (ซ่อนเมื่อว่างทั้งสองกลุ่ม, พับได้, จำสถานะพับใน localStorage): กลุ่ม (a) "งานที่ฉันรับไว้" = หน้าที่ที่ฉันเป็นผู้รับ + ใบงานที่ฉันเป็น `claimed_by`/`assigned_to` ที่ยังไม่จบ เรียงวันงานใกล้สุดก่อน แสดง วันงาน · ลูกค้า · สิ่งที่ยังขาดของหน้าที่นั้น · ปุ่ม "ไปที่งาน" (`?lead=` + เลื่อนจอ) กลุ่ม (b) "รอทีมฉันรับ" = ใบงาน/หน้าที่ที่ยังไม่มีผู้รับและ `claimGate.allowed` สำหรับฉัน พร้อมปุ่มรับ inline (optimistic เหมือนที่อื่น) · pure `myQueue({ leads, jobs, dutyClaims, currentUserId, myDepartment, isAdmin, poolDepartments, today })` ใน tracking-logic + assert
2. **รับแล้วเปิดเครื่องมือทันที**: หลัง `claimLeadDuty` สำเร็จ (optimistic) `DutyGate` ส่ง `autoOpen` ให้ลูก: `StaffEditor` เปิด Dialog, `KitSummary` เปิดกล่องจอง, `VehicleCell` focus/เปิด Select · ทำครั้งเดียวต่อการรับ (ไม่เปิดซ้ำตอน re-render)
3. **มือถือ**: การ์ดในภาพรวมแสดงตัวแก้ไขเต็มเฉพาะหน้าที่ที่ฉันเป็นผู้รับหรือรับได้ (`claimGate.allowed`) หน้าที่อื่นยุบเป็นบรรทัดสรุปเดียว "จัดรถ · Triton · ผู้รับ: บี" แตะเพื่อขยาย (state ต่อการ์ด)
4. **ยุบตัวควบคุมชั้นบน**: แท็บหลักเหลือ 2: `ภาพรวม` | `พูลงาน` — เมื่ออยู่พูลงาน มีชิปย่อย กราฟิก / จัดคน / จัดรถ / กระเป๋า / หน้างาน (admin) ที่ map กับ `?tab=` เดิม (URL เดิมทุกค่ายังใช้ได้: `?tab=graphic` = พูลงาน+ชิปกราฟิก) · ตัวเลข "รอรับ N" รวมทุกฝ่ายบนแท็บพูลงาน · ปุ่มตาราง/ไทม์ไลน์อยู่ในภาพรวมเท่านั้น (เหมือนเดิม) · ลิงก์เดิมจาก dashboard/กระดิ่ง/CRM ไม่พัง
5. **ปิดงาน**: whats-new entry (tag `ปรับปรุง`, module `งาน`, ภาษาผู้ใช้, สรุปทั้ง 3 เฟส) · `package.json` → `1.12.0` · อัปเดต `CONTEXT.md` เฉพาะถ้าศัพท์เปลี่ยน (ไม่ควรเปลี่ยน) · `docs/specs/jobs-pool.md` ไม่แก้ (spec นี้ต่อยอด)

## เกณฑ์ตรวจรับ (ล็อก — Critic ตรวจเฉพาะของเฟสที่ส่ง + ของเฟสก่อนหน้าต้องไม่ถดถอย)

**เฟส 1**
| id | เกณฑ์ |
|---|---|
| AC1.1 | `getTrackingSnapshot` มี `await` ที่เรียงต่อกันไม่เกิน 3 จุด (ที่เหลืออยู่ใน `Promise.all`) และ `scripts/tracking-snapshot-check.ts` รันผ่าน พิมพ์เวลา ก่อน/หลัง ในรายงาน |
| AC1.2 | ผลลัพธ์ snapshot เท่าเดิม: `tracking-logic.check.ts`, `duty-warnings.check.ts` ผ่าน; ฟิลด์/ลำดับของ `rows`, `people`, `roles`, `kits`, `jobStatusLabels` ไม่เปลี่ยน (ยืนยันจาก diff ว่า mapping เดิมทุกตัวคงอยู่) |
| AC1.3 | D5: ค่าเริ่มต้นไม่โหลดงานที่จบก่อนวันนี้−30; `?past=1` โหลดทั้งหมด; ปุ่ม "แสดงงานที่ผ่านแล้ว" ทำงานทั้งสองทาง; dashboard ยังแสดงคำเตือนย้อนหลัง 14 วันได้ |
| AC1.4 | `claimPoolJob` และ `claimLeadDuty` มีคิวรีเรียงต่อกัน ≤ 4 ระลอก (นับ `await` นอก `Promise.all` ในเส้นทางสำเร็จ) และ `requireAuth` คืน department/name โดยผู้เรียกเดิมทั้งหมดยัง type-check ผ่าน |
| AC1.5 | กดรับ/คืน (ใบงานและหน้าที่ทั้ง 5 จุด) ช่องเปลี่ยนทันทีก่อน server ตอบ; เมื่อ action ตอบ `{ error }` ช่องย้อนกลับและมี toast |
| AC1.6 | เมื่อ props `leads` เปลี่ยน (server revalidate) `rows` สะท้อนค่าใหม่; มี refresh เมื่อ visibilitychange และทุก 60 วิ; eslint ไม่มี error `set-state-in-effect` |
| AC1.7 | `npx tsc --noEmit` ไม่มี error ใหม่ (error เดิมมีเฉพาะ `checkupdate/check-update-view.tsx`, `finance/[id]/claim-detail-view.tsx`); eslint ไฟล์ที่แก้/สร้าง 0 error ใหม่ |

**เฟส 2**
| id | เกณฑ์ |
|---|---|
| AC2.1 | ปุ่มรับทุกจุดใช้คำตาม D7 และ `claimGate` ใน tracking-logic มี assert ครบ (allowed/ไม่ allowed/admin/รายการว่าง) |
| AC2.2 | D1: ผู้ใช้นอกแผนกเห็นป้ายจาง "รอ<แผนก>รับ" ไม่มี onClick; server ยังปฏิเสธถ้าเรียกตรง |
| AC2.3 | เรืองแสง/pulse มีเฉพาะปุ่มที่ใกล้วันงานสุดต่อคอลัมน์/หน้าที่ ปุ่มอื่นนิ่ง |
| AC2.4 | แท็บฝ่ายทุกแท็บมีส่วน "รอรับ" (กดรับได้) ก่อน "รับแล้ว"; ป้ายแท็บ "รอรับ N · รับแล้ว M"; ไม่มีข้อความให้ไปกดที่ภาพรวม |
| AC2.5 | กระดิ่งจาก action ของพูลทุกตัว (ใหม่/รับ/คืน/ข้าม/มอบหมาย/หน้าที่) เปิดมาที่ `/jobs/tracking` โดยการ์ด/แถวของงานถูกไฮไลต์และเลื่อนจอไปหา; `?job=<id>` ทำงาน |
| AC2.6 | D3: ผู้ใช้ที่ไม่ใช่ผู้รับหน้าที่และไม่ใช่ manager เรียก `assignLeadStaff`/`assignLeadVehicle`/`bookKitForLead`/`unbookKitForLead` ได้ `{ error }` ภาษาไทย; ผู้รับหน้าที่และ manager ทำได้; ไทม์ไลน์ปิดการคลิกพร้อม tooltip สำหรับคนที่ทำไม่ได้ |
| AC2.7 | เหมือน AC1.7 |

**เฟส 3**
| id | เกณฑ์ |
|---|---|
| AC3.1 | แถบ "ของฉัน" แสดง 2 กลุ่มตามนิยาม, ซ่อนเมื่อว่าง, พับได้และจำสถานะ; `myQueue` มี assert (มีของฉัน/ไม่มี/แผนกไม่ตรง/admin/งานจบไม่แสดง/เรียงวัน) |
| AC3.2 | รับหน้าที่จัดคนแล้ว Dialog จัดคนเปิดเอง, รับกระเป๋าแล้วกล่องจองเปิดเอง, รับจัดรถแล้ว Select ได้ focus — ครั้งเดียวต่อการรับ |
| AC3.3 | มือถือ: การ์ดยุบหน้าที่ที่ฉันไม่เกี่ยวเป็นบรรทัดสรุป แตะขยายได้; หน้าที่ของฉันแสดงเต็ม · ทุกจอ (D3): หน้าที่ที่คนอื่นรับไปแล้วและฉันไม่ใช่ manager = อ่านอย่างเดียว (ไม่มี StaffEditor/VehicleCell/ปุ่มจอง) แต่ยังเห็นสรุปและชื่อผู้รับ |
| AC3.4 | แท็บหลัก 2 อัน + ชิปย่อยในพูลงาน; `?tab=` ค่าเดิมทุกค่า, `?lead=`, `?job=`, `?view=timeline&date&mode&dept&focus` ยังทำงานเหมือนเดิม |
| AC3.5 | whats-new entry บนสุด (ปรับปรุง · งาน), `package.json` = `1.12.0`, spec นี้อยู่ใน repo |
| AC3.6 | เหมือน AC1.7 + `tracking-logic.check.ts` และ `duty-warnings.check.ts` ผ่าน |

pass_threshold: 0.85 ต่อเฟส

## สิ่งที่ห้ามแตะ / ข้อจำกัด

- กันกดชน: conditional update ใน `claimPoolJob` และ UNIQUE ใน `lead_duty_claims` คงเดิม
- `tracking-logic.ts` ยังเป็น pure (ไม่มี React/I-O) — logic ใหม่ทุกตัวต้องมี assert ใน `tracking-logic.check.ts`
- ไม่เพิ่ม dependency ใหม่ ไม่มี migration
- ห้ามเปลี่ยนความหมายของ `?tab=`/`?lead=` เดิม (dashboard, CRM, กระดิ่งลิงก์มา)
- `setKitPacked`, `updateLeadTracking`, `updateJobDesignStatus` สิทธิ์เท่าเดิม

## Out of Scope

- Supabase Realtime · ลาก-วางบนไทม์ไลน์ · เปลี่ยน flow เปิดใบงานกราฟิกจาก CRM · รายงานสถิติการรับงาน · แก้บอร์ดวันงาน (/jobs)
