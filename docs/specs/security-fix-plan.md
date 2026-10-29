# แผนแก้ช่องโหว่ความปลอดภัย (จาก `docs/SECURITY_REPORT.md` รอบ 2026-10-29)

เกณฑ์ (AC) ล็อกไว้ตั้งแต่วางแผน ใช้ตรวจทุกรอบ ห้ามเพิ่ม/เปลี่ยนกลางทาง · ทุกรอบปล่อยเป็น release แยก (branch → bump → tag → merge main) · ไม่ push จนกว่าเจ้าของสั่ง

ข้อเท็จจริงจาก production (อ่านอย่างเดียว 2026-10-29): พนักงานที่ใช้งานอยู่ 32 คน — มีโมดูล `jobs` 14, `checkin` 30, `overview` 0, `crm` 9 · แอดมิน 4 คน (1 คนไม่มี `overview`/`crm`) · OAuth client ที่ลงทะเบียน = Claude (`claude.ai/api/mcp/auth_callback`) และ ChatGPT (`chatgpt.com/connector/oauth/<id>`) · `/crm/settings` redirect ไป `/settings?section=crm` (admin เท่านั้นอยู่แล้ว)

## รอบ 1 — hotfix-v1.70.5 (ทำเองทันที) — ✅ ส่งแล้ว 2026-10-29 (merge main, ยังไม่ push)

| ข้อ | ที่แก้ | วิธี |
|---|---|---|
| C1/M16 | `profile/actions.ts::updateMyProfile`, `users/actions.ts::updateUserProfile`, `updateUserRole` | `lib/profile-fields.ts::pickProfileFields()` เก็บเฉพาะ 8 คีย์ (`full_name, nickname, department, national_id, address, bank_name, bank_account_number, account_holder_name`) และเฉพาะค่า string (department เป็น null ได้) · `updateUserRole` รับเฉพาะ `'admin' \| 'staff'` |
| H1 | `supabase/migrations/20261029_drop_packing_photos_policy.sql` (ใหม่) + ตัดบล็อก policy ออกจาก `20261012_packing_lists.sql` | `DROP POLICY IF EXISTS packing_photos_all ON storage.objects;` — โค้ดอัปโหลดใช้ service role อยู่แล้ว |
| H7 | `check-in/actions.ts::checkOut` | เพิ่ม `.is('checked_out_at', null).is('paid_slip_id', null).select('id')` → ไม่มีแถว = `{ error: 'เช็คอินนี้ปิดไปแล้ว' }` |
| L1 | `sales-board/actions.ts::saveMonthTargets` | `requireAuth()` ไม่มี session → `{ error: 'Unauthorized' }` (ยังไม่เช็ก role ตามเจตนาเดิม) |
| M11 | `lib/session.ts`, `proxy.ts` | secret = `SESSION_SECRET` → ถอยไป `SUPABASE_SERVICE_ROLE_KEY` (ค่าลับฝั่ง server) → ไม่มีทั้งคู่ = throw · เลิกใช้ anon key (ค่าสาธารณะ) เป็นกุญแจเซ็น · ถ้า prod ไม่ได้ตั้ง `SESSION_SECRET` ทุกคนต้องล็อกอินใหม่หนึ่งครั้งหลัง deploy |

เกณฑ์รอบ 1 (ตรวจใน `scripts/session-hardening.check.ts`):
- AC1.1 พนักงานเรียก `updateMyProfile({ full_name, role:'admin', allowed_modules, is_approved, pin, active_session_id })` → แถวใน DB เปลี่ยนเฉพาะ `full_name`; payload ที่ส่ง DB มีคีย์เฉพาะใน 8 คีย์
- AC1.2 แอดมินเรียก `updateUserProfile(id, {..., role:'admin'})` → payload ไม่มี `role`; `updateUserRole(id, 'superadmin')` → `{ error }` ไม่เขียน DB
- AC1.3 static: `checkOut` มี `.is('checked_out_at', null)` และ `.is('paid_slip_id', null)`; `saveMonthTargets` เรียก `requireAuth`
- AC1.4 static: `lib/session.ts` และ `proxy.ts` ไม่มี `NEXT_PUBLIC_SUPABASE_ANON_KEY` เป็น fallback ของ secret
- AC1.5 `npx tsc --noEmit --incremental false` = error เดิม 1 จุด (`check-update-view.tsx`) · session-hardening / proxy-session / proxy-action-redirect ผ่าน

## รอบ 2 — feature/security-round-2 → v1.71.0 (executor คู่ขนาน 5 ตัว ไฟล์ไม่ซ้อนกัน) — ✅ โค้ดครบ 2026-10-29 ทุก AC ผ่าน (รายละเอียดการตัดสินใจของ executor อยู่ใน commit message)

เตรียมก่อน dispatch (planner ทำเอง): `lib/auth.ts::requireModule(keys: string | string[])` — `requireAuth()` แล้ว admin ผ่าน / อื่นอ่าน `profiles.allowed_modules` (cache ต่อ request, null = `['stock']` เหมือน proxy) ต้องมีคีย์ใดคีย์หนึ่ง → คืน `AuthSession | null` · `lib/stock.ts::hasModule` เปลี่ยนเป็นเรียกตัวนี้ · `proxy.ts::MODULE_ROUTES` เพิ่ม `overview: ['/overview']`, `jobs: ['/jobs']`, `checkin: ['/check-in']` และ auto-grant `overview` ให้ admin (เหมือน layout) · เคสใน `proxy-session.check.ts`

| executor | ข้อ | ไฟล์ที่แก้ได้ | วิธี |
|---|---|---|---|
| E1 | H2 H3 M12 | `lib/rich-text-utils.ts`, `components/rich-text-editor.tsx`, `documents/doc-types.ts` (เฉพาะ `sanitizeHtml`), `jobs/actions.ts` (เฉพาะจุดเขียน content ตั๋ว), `kpi/actions.ts` (จุดเขียน reply), `package.json`, `next.config.ts` (`serverExternalPackages`), `lib/rich-text-utils.check.ts` (ใหม่) | ติดตั้ง `isomorphic-dompurify` · allowlist เดียว `lib/sanitize-html.ts`? — ไม่: ใส่ใน `lib/rich-text-utils.ts::sanitizeHtml` แล้วให้ `doc-types.ts::sanitizeHtml` re-export · แท็ก: p br strong em u s mark span a ul ol li h1-h3 blockquote code pre hr img(?) ตามที่ TipTap ของเราผลิตจริง (StarterKit + Color + Highlight + TextStyle + Mention) · attr: class style data-type data-id data-label href(http/https/mailto เท่านั้น) · สาขา plain text ใน `prepareContentForRender` ต้อง `escapeHtml` ก่อนห่อ `<p>` · mention dropdown ใช้ `escapeHtml` ทุกฟิลด์ที่มาจาก DB |
| E2 | H4 M15 | `app/api/oauth/register/route.ts`, `app/api/oauth/token/route.ts`, `lib/oauth.ts`, `app/oauth/authorize/page.tsx`, `consent-view.tsx`, `scripts/oauth-flow.check.ts` | allowlist host ของ redirect ตอน register: ค่าเริ่มต้น `claude.ai, claude.com, chatgpt.com` (+ subdomain) และ loopback, override ด้วย env `OAUTH_REDIRECT_HOSTS` (คั่น comma) · หน้าอนุญาต: หัวข้อไม่ hardcode "Claude" (ใช้ชื่อแอป) แสดง host ของ `redirect_uri` ชัดๆ และคำเตือนสีเหลืองถ้า host ไม่อยู่ใน allowlist · `checkRateLimit` ต่อ IP: register 10/ชม., token 60/นาที (IP จาก `x-forwarded-for` ตัวแรก; ไม่มี = 'unknown') |
| E3 | H5 | `crm/actions.ts`, `scripts/crm-leads-load.check.ts`, `scripts/crm-lead-detail-render.check.ts` (ถ้า mock auth) | อ่านข้อมูล lead ทุกฟังก์ชัน (`getLeads getArchivedLeads getLead getLeadCostSummary getLeadEvents getActivities getLeadInstallments getLeadEventStaff countStaleLeads checkEventDateConflicts`) = `requireModule(['crm','jobs'])` ไม่ผ่านคืน `{ data: [] / null, error: 'Unauthorized' }` ตามรูปเดิม · เขียน (`createLead updateLead updateLeadStatus archiveLead unarchiveLead archiveStaleLeads createActivity createEventFromLead saveAllInstallments uploadPaymentProof deletePaymentProof setJobCostEventPhase`) = `requireModule('crm')` · ตั้งค่า CRUD 4 ตัว = admin · `getCrmSettings`/`getSystemUsers` = `requireAuth` (events/jobs/settings ใช้) · `updateLeadStatus` ปฏิเสธ `newStatus` ที่ไม่อยู่ใน `crm_settings` หมวด `kanban_status` และไม่มี lead ใดใช้อยู่ |
| E4 | H6 M17 | `items/actions.ts`, `items/[id]/actions.ts`, `items/cleanup-items.ts`, `example-kits/actions.ts`, `example-kits/[id]/actions.ts` | `createItem/updateItem/quickUpdateItem` = `requireModule('stock')` · `deleteItem/cleanupOrphanedItems` = `getKitManager()` · `existing_images` เก็บเฉพาะ URL ที่อยู่ใน `image_url` เดิมของ item นั้น · อัปโหลดรูป: MIME ∈ jpeg/png/webp และ ≤ 5MB · example-kits ทุก action = `getKitManager()`, `status`/`type` ตรวจกับรายการที่ UI ใช้ |
| E5 | M1 M2 | `app/api/schema/**`, `app/api/migrations/**`, `checkupdate/page.tsx`, `content-planner/metrics-lib.ts`, `lib/claim-files.ts` (export `readCapped`) | header `x-master-token` เทียบ `MASTER_API_TOKEN` แบบ constant-time; env ไม่ตั้ง = 403 ทุกครั้ง; `/checkupdate` ส่ง header เดียวกันตอน fetch master · metrics: `new URL(url)` ต้อง https และ host ลงท้าย `tiktok.com` / `facebook.com` / `instagram.com` (ตามที่ `fetchMetaMetrics` รองรับ) · `redirect: 'manual'` · `AbortSignal.timeout(10_000)` · body ≤ 2MB ผ่าน `readCapped` |

เกณฑ์รอบ 2:
- AC2.1 `lib/rich-text-utils.check.ts`: `<img src=x onerror=alert(1)>` / `<svg onload=…>` / `<iframe srcdoc=…>` / `<a href="javascript:…">` / `<a href="java&#115;cript:…">` → ผลไม่มี `onerror|onload|<iframe|<svg|javascript:` · mention span `<span class="mention" data-type="mention" data-id="…">@ชื่อ</span>` คงเดิม · plain text `<script>x</script>` → `&lt;script&gt;` · `documents/doc-types.ts::sanitizeHtml` ให้ผลเดียวกับ `lib/rich-text-utils.ts::sanitizeHtml`
- AC2.2 `components/rich-text-editor.tsx` ไม่มี `${user.` ใน template string ที่ไม่ผ่าน `escapeHtml`
- AC2.3 oauth-flow.check: register ด้วย `https://evil.example/cb` → 400 `invalid_redirect_uri`; `https://claude.ai/api/mcp/auth_callback`, `https://chatgpt.com/connector/oauth/x`, `http://127.0.0.1:5173/cb` → 201 · consent page HTML มี host ของ redirect · register ครั้งที่ 11 จาก IP เดียวใน 1 ชม. → 429
- AC2.4 crm: ผู้ใช้ที่มีแค่ `finance` เรียก `getLeads()` → `{ data: [], error }` ไม่ query `crm_leads`; `updateLeadStatus` → `{ error }` ไม่เขียน · ผู้ใช้ `jobs` อ่าน `getLead` ได้แต่ `updateLead` ไม่ได้ · ผู้ใช้ `crm` ทำได้ทั้งคู่ · admin ทำได้ทั้งหมด · `updateLeadStatus(id, 'hacked')` → `{ error }` (static scan: ทุก `export async function` ใน `crm/actions.ts` มี `requireModule` หรือ `requireAuth` ภายใน 6 บรรทัดแรกของ body)
- AC2.5 proxy-session.check: ผู้ใช้ที่ไม่มี `jobs` เปิด `/jobs`, `/jobs/my-job` → `/dashboard`; ไม่มี `checkin` เปิด `/check-in` → `/dashboard`; พนักงานเปิด `/overview` → `/dashboard`; admin ที่ไม่มี `overview` ใน allowed_modules เปิด `/overview` → ผ่าน
- AC2.6 items: static scan ทุก export ใน `items/**/actions.ts`, `items/cleanup-items.ts`, `example-kits/**/actions.ts` มี `requireModule(` หรือ `getKitManager(`; `updateItem` ไม่รับ `existing_images` ที่ไม่อยู่ใน `image_url` เดิม (unit test ของ helper)
- AC2.7 `GET /api/schema/fingerprint` ไม่มี header → 403; header ถูก → 200 (ทดสอบด้วย route handler ตรง) · `fetchMetricsForUrl('tiktok', 'https://169.254.169.254/x')` และ `http://www.tiktok.com/x` → `{ error }` โดยไม่เรียก `fetch` (mock `globalThis.fetch` ให้ fail)
- AC2.8 tsc baseline 1 error · eslint ของโฟลเดอร์ `kits`, `events`, `crm` = 0 ปัญหา และไฟล์ที่แตะไม่มี error เพิ่ม · ชุดตรวจทุกตัวที่ import ไฟล์ที่แตะผ่าน (`grep -l` ใน `scripts/`)

## รอบ 3 — v1.72.0 (หลังรอบ 2 merge) — ✅ โค้ดครบ 2026-10-29 ยกเว้น M13 (xlsx — ติดตั้ง tarball จาก cdn.sheetjs.com ต้องให้เจ้าของรันเอง: `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) · migration ใหม่ `20261030_increment_failed_login.sql` (รันได้ทันที โค้ดมี fallback) และ `20261031_private_buckets.sql` (รันหลัง deploy เท่านั้น)

| ข้อ | สรุปวิธี |
|---|---|
| M3 | route `app/api/file/[bucket]/[...path]/route.ts`: `requireAuth` → `createSignedUrl(path, 300)` → 302 · helper `lib/file-url.ts::appFileUrl(storedUrl)` แปลง public URL → `/api/file/<bucket>/<path>` · เปลี่ยนจุด render ของ `checkin-photos`, `receipts`, `crm-payment-proofs`, `login_selfies` ให้ผ่าน helper · migration ตั้ง bucket 4 ใบเป็น private (รันหลัง deploy โค้ด) · bucket อื่นคงเดิม |
| M4 | `costs/actions.ts`: `requireModule('costs')` ทุก export · `updateJobEvent` whitelist คีย์ที่ฟอร์มส่ง · ปฏิเสธยอดติดลบ/NaN |
| M5 | `finance/actions.ts`: `settleAdvanceClaim` non-admin ห้ามเมื่อ `advance_settled_at` มีค่าหรือ `refund_amount > 0`; ใช้ ≥ ทดลองจ่ายต้องมีใบเสร็จ · `setTaxInvoiceEntries` non-admin เฉพาะก่อนจ่าย และ URL ต้องอยู่ใน `claims/<claim_no>/` · `deleteClaim` ลบเฉพาะ path ใต้ `claims/<claim_no>/` · `uploadReceiptFiles` MIME allowlist (jpeg/png/webp/pdf) + ≤ 15MB |
| M6 | `documents/actions.ts`: `saveDraft` ตัด `file/file_name/file_size/file_pages` จาก payload; ทุก path ต้องขึ้นต้น `documents/<id>/` · `doc-types.ts` เพิ่ม `'issue'` ใน `OWNER_ACTIONS` · `listDocuments`/`getDocument`/PDF route: ประเภท SC/JA/IA/EL non-admin เห็นเฉพาะที่ตัวเองสร้างหรือเป็นเจ้าของ · `requireModule('documents')` ใน actions และ `/api/pdf/document/[id]` |
| M7 | `kit-check-core.ts::checkinKitItem` ต้อง `target.status === 'in_use'` เว้น `allowClosedEvent` · 3 action = `requireModule(['stock','events'])` |
| M8 | `check-in/actions.ts`: `updateMyCheckinEvent` ต้องเป็น `event_staff` (admin ยกเว้น) และ `paid_slip_id` ว่าง · `checkIn` ตรวจ `check_type ∈ office/onsite/remote` · `adminDeleteCheckin`/`adminEditCheckin` ปฏิเสธแถวที่จ่ายแล้ว · `getTodayCheckins/getStaffList/getActiveDuties` = `requireAuth` และ non-admin ไม่ได้ lat/lng/photo ของคนอื่น |
| M9 | `jobs/actions.ts`: ตั้งค่า job_settings = admin + `.eq('category', …)` · `createTicket` รับเฉพาะ URL ใต้ prefix ของผู้เรียก · `deleteTicket` = ผู้สร้าง/admin · `kpi/actions.ts` reply ตรวจ assignee/evaluator/admin, `getEvaluationReplies` ตรวจตัวตน |
| M10 | `app/login/actions.ts`: ตัวนับ fail แบบ atomic (rpc หรือ update … returning) · ข้อความเดียว "เบอร์หรือ PIN ไม่ถูกต้อง" · เช็ก blocked/approved ก่อนเทียบ PIN · limiter key = เบอร์โทร + IP |
| M13 | `xlsx` → `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (หรือ `exceljs` ถ้าติดตั้งไม่ได้) |
| M14 | `next.config.ts` เพิ่ม `Content-Security-Policy-Report-Only` (default-src 'self'; img-src 'self' data: blob: https://*.supabase.co; frame-ancestors 'none'; object-src 'none') · ลบ `X-XSS-Protection` |
| M15 | ล้าง `oauth_clients` ที่ไม่มี token ภายใน 1 วัน และ `oauth_codes` หมดอายุ — ทำใน `token` route แบบ best-effort |

เกณฑ์รอบ 3: ทุกข้อมีเคสใน check script ที่เกี่ยว (finance-access / packing-flow / claim-* / layout-requests …) หรือ static scan ใหม่ · tsc/eslint ตามกติกาเดิม · M3 ต้องมีเคส: ไม่ล็อกอิน → 401, ล็อกอิน → 302 ไป signed URL, path ไม่อยู่ใน bucket ที่อนุญาต → 404

## รอบ 4 — v1.72.1 (Low + logActivity)

L1–L20 ตามรายงาน: CSV escape (`= + - @` + double quote), `safe-next` ตัด control char, `users/page.tsx` select เฉพาะคอลัมน์ที่ใช้ (ไม่มี `pin`, `active_session_id`), cron secret ทาง header + constant-time, `Cache-Control: no-store` ใน `pdf/payment-voucher`, error response ไม่ส่ง `err.message`, `requireAuth` เช็ก `is_blocked`, `getAppliedMigrations` = admin, ลบ `lib/supabase.ts` singleton และ `scripts/revert-rls.ts`, `logActivity` ให้ mutation ที่ขาด (เพิ่ม `ActionType`) · `.well-known` ใช้ env คงที่ · personal token revoke เมื่อ block/reset PIN

## สิ่งที่เจ้าของระบบต้องทำบน production (นอกโค้ด)

1. ตั้ง `SESSION_SECRET` (สุ่มยาว ≥ 32 ไบต์) และ `CRON_SECRET`, `MASTER_API_TOKEN` (ถ้าใช้ /checkupdate) บน Railway — ไม่ตั้ง `SESSION_SECRET` ก็ยังใช้ได้ (ถอยไป service key) แต่ควรตั้ง
2. รัน `supabase/migrations/20261029_drop_packing_photos_policy.sql` ทันที
3. หลังรอบ 3 deploy: รัน migration ตั้ง bucket 4 ใบเป็น private
4. SQL ตรวจซ้ำตามรายงาน + ปิด "Allow new users to sign up" ใน Supabase Auth
