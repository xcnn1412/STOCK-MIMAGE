# รายงานตรวจสอบความปลอดภัย — รอบ 2026-10-29 (v1.70.4)

> **สถานะการแก้ (2026-10-29):** แก้ครบ 4 รอบแล้ว — v1.70.5 (รอบ 1) · v1.71.0 (รอบ 2) · v1.72.0 (รอบ 3) · v1.72.1 (รอบ 4) · รายละเอียดและข้อยกเว้นอยู่ใน `docs/specs/security-fix-plan.md` · ค้างฝั่ง production: ตั้ง env (`SESSION_SECRET`, `CRON_SECRET`, `MASTER_API_TOKEN`, `APP_ORIGIN` ไม่บังคับ), รัน migration `20261029` + `20261030` ทันที และ `20261031` หลัง deploy, อัปเกรด `xlsx` (M13) ด้วย `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`

> ฉบับนี้แทนรายงานเดิม (ก่อน v1.24.2) ทั้งฉบับ ข้อ 1–3 ของรายงานเดิม (server action ไม่ตรวจ session, คุกกี้ไม่เซ็น, RLS) แก้ไปแล้วตั้งแต่ v1.24.2 และ migration `20260930_lock_public_access.sql`

## ขอบเขตและวิธีตรวจ

- ตรวจโค้ดทั้งระบบ 8 มิติแบบคู่ขนาน (auth/session/proxy · API routes · MCP/OAuth · server actions ฝั่งเงิน · ฝั่ง jobs/CRM/events/check-in · ฝั่ง stock/documents · XSS/injection/headers · Supabase client/RLS/storage) แล้วผู้ประสานงานอ่านโค้ดยืนยันซ้ำทุกข้อระดับ Critical/High และข้อ Medium ส่วนใหญ่
- **ทดสอบสดกับฐานข้อมูล production ด้วย anon key** (key สาธารณะ) แบบอ่านอย่างเดียว: ตาราง 71 ตารางที่พบใน migration ปฏิเสธทั้งหมด (`42501`), REST `profiles` ตอบ 401, ไม่มีฟังก์ชัน `exec_sql`, anon เรียก `get_schema_summary` ไม่ได้, anon อัปเดต `profiles` ไม่ได้ → **ล็อกดาวน์ RLS มีผลจริง**
- storage: bucket 12 ใบ **public 11 ใบ** (private เฉพาะ `doc-files`) และ anon **list รายชื่อไฟล์ใน `packing-photos` ได้** (bucket อื่น list ไม่ได้)
- ไม่ได้ทดสอบ: ค่า env บน Railway (`SESSION_SECRET`, `CRON_SECRET`), การ forward server action ข้ามหน้าใน Next 16 (อ้างอิงโค้ด `action-handler.js::selectWorkerForForwarding`), การเขียนลง storage ด้วย anon (ไม่ทดสอบเพราะเป็นการเขียนบน prod)

สถานะการยืนยัน: **[ยืนยัน]** = อ่านโค้ดหรือทดสอบสดด้วยตัวเอง · **[ผู้ตรวจย่อย]** = จากรายงานผู้ตรวจย่อย ยังไม่อ่านซ้ำทุกบรรทัด · **[น่าจะใช่]** = ต้องทดสอบเพิ่ม

## สรุปผู้บริหาร

| ระดับ | จำนวน | ต้องทำ |
|---|---|---|
| Critical | 1 | แก้ทันที — ผู้ใช้ทุกคนตั้งตัวเองเป็น admin ได้ |
| High | 7 | แก้ในรอบเดียวกัน (XSS 2, storage policy เปิด, OAuth phishing, CRM/items ไม่เช็กโมดูล, check-out ซ้ำ) |
| Medium | 17 | แผนถัดไป 1–2 สัปดาห์ |
| Low / Info | ~25 | ทยอยแก้ |

จุดแข็งที่ยืนยันแล้ว: token HMAC เทียบแบบ constant-time + หมดอายุ 7 วัน, single-session, คุกกี้ httpOnly/secure/lax, PIN bcrypt cost 12, admin จาก DB เท่านั้น, RLS ปิดทุกตาราง, service key ไม่หลุดฝั่ง client, ไม่มีโค้ดฝั่ง browser คุย Supabase ตรง, OAuth PKCE S256 + code ใช้ครั้งเดียว + token เก็บเป็น sha256, MCP tools อ่านอย่างเดียวและเช็ก `allowed_modules` ทุกครั้ง, `.or()` ทุกจุดกรองอักขระแล้ว (ไม่มี filter injection), ไม่มี secret ใน repo

---

## Critical

### C1 · ผู้ใช้ทุกคนตั้งตัวเองเป็น admin ได้ (mass assignment) **[ยืนยัน]**
- ที่: `app/(authenticated)/profile/actions.ts:16-36` `updateMyProfile`
- หลักฐาน: `supabase.from('profiles').update(data as Record<string, unknown>).eq('id', userId)` — `data` มาจาก client ทั้งก้อน type ของ TypeScript ไม่มีผลตอน runtime
- ผล: ยิง server action จากหน้า /profile (ทุกคนเข้าได้) ด้วย `{ role: 'admin', allowed_modules: [...], is_approved: true }` → ได้สิทธิ์ admin ทุกโมดูล รวมถึงแก้ `pin`, `active_session_id` ของตัวเอง
- แก้: whitelist key 8 ตัว (`full_name, nickname, department, national_id, address, bank_name, bank_account_number, account_holder_name`) ก่อน `.update()` · ทำแบบเดียวกันใน `users/actions.ts:167` `updateUserProfile` และจำกัด `updateUserRole` ให้ `role ∈ {'admin','staff'}` · เพิ่มเคสใน `scripts/session-hardening.check.ts`

## High

### H1 · bucket `packing-photos` เปิดให้ทุกคน (รวม anon) อ่าน/เขียน/ลบ **[ยืนยัน list สด]**
- ที่: `supabase/migrations/20261012_packing_lists.sql:96-122` `CREATE POLICY packing_photos_all ON storage.objects FOR ALL USING (bucket_id='packing-photos') WITH CHECK (...)` — ไม่ระบุ role = ใช้กับ `public` ซึ่งรวม anon
- ผล: ใครก็ตามที่มี anon key (อยู่ใน bundle) list/อัปโหลด/เขียนทับ/ลบรูปหลักฐานการจัดของและคืนของได้ และใช้ bucket เป็นที่ฝากไฟล์ฟรี (ทดสอบแล้ว: anon list ได้ ไม่ได้ทดสอบเขียน)
- แก้: `DROP POLICY IF EXISTS packing_photos_all ON storage.objects;` และลบบล็อกนั้นออกจาก migration — โค้ดอัปโหลดใช้ service role อยู่แล้ว (`packing/actions.ts:523,721`) ไม่ต้องมี policy

### H2 · Stored XSS ในตั๋วงานและการตอบ KPI **[ยืนยัน]**
- ที่: `lib/rich-text-utils.ts:31-57` ใช้โดย `jobs/tickets/[id]/ticket-detail.tsx:431,577`, `kpi/reports/feedback-timeline.tsx:280` · เขียนดิบที่ `jobs/actions.ts:1987,2072`, `kpi/actions.ts:576`
- หลักฐาน: `sanitizeHtml` ลบเฉพาะ `on*="..."` ที่มีเครื่องหมายคำพูด (`<img src=x onerror=alert(1)>` ผ่าน, `<svg onload>`, `<iframe srcdoc>` ผ่าน) และสาขา plain text ห่อ `<p>${line}</p>` โดยไม่ escape เลย
- ผล: พนักงานโพสต์ตอบตั๋ว → script รันในเบราว์เซอร์ admin → เรียก server action ในนาม admin (อนุมัติผู้ใช้ เปลี่ยน role) คุกกี้ httpOnly ป้องกันแค่การขโมยคุกกี้
- แก้: ติดตั้ง `isomorphic-dompurify` กำหนด allowlist แท็กของ TipTap (p, br, strong, em, span[style,class,data-*], mark, a[href http(s)]) sanitize ตอนเขียนใน 3 action และตอน render · สาขา plain text ต้อง `escapeHtml` ก่อนห่อ

### H3 · XSS ผ่านกล่อง @mention (ชื่อผู้ใช้ลง innerHTML) **[ยืนยัน]**
- ที่: `components/rich-text-editor.tsx:231-245` `${user.full_name}` / `${user.department}` ใส่ใน `this.container.innerHTML`
- ผล: ผู้ใช้ตั้ง `full_name = <img src=x onerror=...>` ได้เองตอนสมัคร/ที่ /profile → รันในเครื่องทุกคนที่พิมพ์ `@` ในตัวแก้ไข
- แก้: สร้าง dropdown ด้วย `createElement`/`textContent` หรือ `escapeHtml` ทุกฟิลด์

### H4 · OAuth: ใครก็ลงทะเบียน client ได้ + หน้าขออนุญาตไม่บอกว่าจะส่ง code ไปโดเมนไหน **[ยืนยัน]**
- ที่: `app/api/oauth/register/route.ts` (ไม่มี auth, ไม่มี rate limit, รับ https redirect ใดก็ได้) · `app/oauth/authorize/consent-view.tsx:48-50` หัวข้อ hardcode "อนุญาตให้ Claude เข้าถึงข้อมูล" และแสดงแค่ `clientName` ที่ผู้ลงทะเบียนตั้งเอง ไม่แสดง `redirect_uri`
- ผล: ผู้โจมตีลงทะเบียน `client_name:"Claude"` + `redirect_uris:["https://evil/cb"]` ส่งลิงก์ authorize (ใส่ PKCE ของตัวเอง) ให้พนักงาน/admin กด "อนุญาต" ครั้งเดียว → ได้ MCP read access ทุกโมดูลของเหยื่อ (admin = ใบเบิกทุกคน เช็คอินทั้งทีม CRM ทั้งหมด ยอดขาย)
- แก้: allowlist host ของ redirect ตอนลงทะเบียน (`claude.ai`, `claude.com`, loopback) · แสดง host ของ redirect เด่นๆ บนหน้าขออนุญาต พร้อมคำเตือนถ้าไม่ใช่โดเมนที่รู้จัก · เลิก hardcode "Claude" · rate limit `register`/`token`

### H5 · CRM: อ่านข้อมูลลูกค้าทั้งหมดโดยไม่ตรวจตัวตน และเขียนได้แค่ล็อกอิน ไม่เช็กโมดูล **[ยืนยัน]**
- ที่: `crm/actions.ts` — `getLeads` (L176), `getLead` (L285), `getLeadInstallments`, `getLeadCostSummary` ไม่เรียก session เลย · `updateLead` (L637), `updateLeadStatus` (L760: `.update({ status: newStatus })` ไม่ตรวจค่า), `createCrmSetting/updateCrmSetting/deleteCrmSetting` (L67-150) มีแค่ `if (!userId)`
- ช่องทาง: `/jobs*` ไม่อยู่ใน `MODULE_ROUTES` และ `jobs/[id]/page.tsx`, `job-detail.tsx` import `crm/actions` → ผู้ใช้ที่อนุมัติแล้วทุกคน (ไม่ต้องมีโมดูล crm) POST action ไปที่ `/jobs/<id>` ได้ (ผู้ตรวจย่อยไล่ `action-handler.js::selectWorkerForForwarding` ของ Next 16 แล้ว; คนไม่ล็อกอินยังถูก session gate กัน)
- ผล: ดึงชื่อ เบอร์ LINE ราคา งวดชำระ ต้นทุนของ lead ทั้งหมด · เปลี่ยนงานเป็น won (สร้างใบงานอัตโนมัติ กระทบค่าคอม/รายได้) · แก้ราคา · ลบงวดชำระ · แก้สถานะ kanban/แพ็กเกจ
- แก้: helper กลาง `requireModule('crm')` (อ่าน `allowed_modules` จาก DB, admin ผ่าน) เรียกในทุก export ของ crm ทั้งอ่านและเขียน · `updateLeadStatus` ตรวจ `newStatus` กับ `crm_settings` หมวด kanban · CRUD ตั้งค่า = admin · เพิ่ม `/jobs`, `/check-in`, `/overview` เข้า `MODULE_ROUTES` ใน `proxy.ts` และ `nav-config.ts`

### H6 · items: สร้าง/แก้/ลบอุปกรณ์ได้ทุกคนที่ล็อกอิน (ไม่เช็กโมดูล stock) **[ยืนยัน]**
- ที่: `items/[id]/actions.ts:15,190` `updateItem`, `deleteItem` · `items/actions.ts:17,147` `createItem`, `quickUpdateItem` · `items/cleanup-items.ts:45` — มีแค่ `requireAuth()` (เฉพาะสาขาวัสดุสิ้นเปลืองเรียก `getKitManager()`)
- ผล: ผู้ใช้ที่มีแค่ finance/crm ลบอุปกรณ์ (พร้อม `kit_contents` และรูปใน storage) แก้ราคา/สถานะ หรือ reset สถานะทั้งคลัง
- ต่อเนื่อง (Medium): `existing_images` รับ URL จาก client → ใส่ URL รูปของ item อื่นแล้วลบ item ตัวเอง = ลบรูปของคนอื่น (`items/[id]/actions.ts:33-37,216-223`) · อัปโหลดรูปไม่ตรวจ MIME/ขนาด (`contentType: image.type`)
- แก้: `getKitManager()` หรือ `hasModule('stock')` ทุกฟังก์ชัน · `deleteItem`/`cleanupOrphanedItems` = kit manager/admin · ตอน update เก็บเฉพาะ URL ที่อยู่ใน `currentItem.image_url` เดิม · allowlist MIME (jpeg/png/webp) + จำกัดขนาด

### H7 · check-out ซ้ำกับเช็คอินที่ปิดไปแล้ว → OT พอง **[ยืนยัน]**
- ที่: `check-in/actions.ts:452-480` `checkOut` → `.update({ checked_out_at: now }).eq('id').eq('user_id')` ไม่มี `.is('checked_out_at', null)` และไม่ตรวจ `paid_slip_id`
- ผล: พนักงานยิง `checkOut` ใส่เช็คอินออฟฟิศเก่าของตัวเองหลายวันหลัง → เวลาออกเลื่อนเป็นตอนนี้ → `salary/compute.ts` คิด OT ต่อเนื่องข้ามวัน (OT ออฟฟิศไม่มีตัวล็อก `paid_slip_id`)
- แก้: เพิ่ม `.is('checked_out_at', null).is('paid_slip_id', null)` แล้วคืน error เมื่อไม่มีแถวถูกแก้ · เพิ่ม `logActivity`

## Medium

### M1 · schema และไฟล์ migration ทั้งหมดดาวน์โหลดได้โดยไม่ล็อกอิน **[ยืนยัน]**
- `app/api/schema/full/route.ts`, `schema/fingerprint`, `api/migrations/list`, `api/migrations/[filename]` ไม่มี auth (proxy ไม่คุม `/api`) — path traversal กันแล้ว (`basename` + `.sql`)
- ผล: เห็นทุกตาราง/คอลัมน์/ฟังก์ชัน/RLS policy/โครง OAuth → ช่วยการโจมตีขั้นต่อไป
- แก้: shared secret header (`MASTER_API_TOKEN`) เทียบ constant-time แบบ fail-closed ทั้งฝั่ง route และฝั่ง `/checkupdate` ที่เรียก (page.tsx:44-45)

### M2 · SSRF จาก URL โพสต์ใน content planner **[ยืนยัน]**
- `content-planner/metrics-lib.ts:72-76,186` — `isTikTok = platform==='tiktok' || /tiktok\.com/i.test(url)` แล้ว `fetch(url, { redirect:'follow' })` อ่าน body ไม่จำกัด ไม่มี timeout · `post_url` ผู้ใช้โมดูล content กรอกเอง · cron รันอัตโนมัติ 50 โพสต์
- แก้: `new URL(url)` ต้อง `https:` และ hostname ลงท้าย `.tiktok.com` · `redirect:'manual'` · `AbortSignal.timeout` · cap body (ทำแบบ `lib/claim-files.ts::readCapped`)

### M3 · bucket public เก็บไฟล์ส่วนตัว/การเงิน **[ยืนยันสด]**
- public: `login_selfies`, `checkin-photos` (selfie เช็คอิน + ใบลา/ใบรับรองแพทย์ `check-in/leave-actions.ts:53`), `receipts` (ใบเสร็จ สลิปโอน path `claims/<เลขใบเบิกเรียงลำดับ>/<ms>_<i>`), `crm-payment-proofs` (สลิปลูกค้า), `ticket-attachments`, `purchase-attachments`, `event_closures`, `item-images`, `doc-assets`, `custom-emojis`, `packing-photos` · ใช้ `getPublicUrl` ทุกจุด ไม่มี `createSignedUrl` เลย
- ผล: ใครได้ลิงก์ (แชร์ต่อ/log/ประวัติเบราว์เซอร์) เปิดได้ตลอดไปแม้ถูกบล็อก · list ไม่ได้ยกเว้น packing-photos (H1)
- แก้: ตั้ง `checkin-photos`, `receipts`, `crm-payment-proofs`, `login_selfies` เป็น private แล้วเสิร์ฟผ่าน signed URL อายุสั้นหรือ route ที่ตรวจสิทธิ์ (แบบ `doc-files` + `/api/pdf/document/[id]`)

### M4 · costs: แก้/สร้าง/ลิงก์ข้อมูลต้นทุนได้ทุกคน + mass assignment **[ยืนยัน]**
- `costs/actions.ts:518-538` `updateJobEvent`: `getSession()` แล้ว `.update(data)` ทั้งก้อน (ตั้ง `linked_lead_id`, `source_event_id`, `imported_by` ได้) · `createCostItem` (L588, รับยอดติดลบ), `createJobEventManual` (L703), `linkCostEventToCRM` (L773 เขียน `crm_leads.event_id`), `unlinkCostEventFromCRM`, `syncRevenueFromCRM`, `bulkSyncRevenueFromCRM`, `searchCRMLeadsForLink` (คืนราคา CRM) — แค่ล็อกอิน
- แก้: admin หรือโมดูล `costs` + whitelist key + ปฏิเสธยอดติดลบ/NaN

### M5 · finance: เคลียร์ทดลองจ่ายเองโดยไม่คืนเงิน · ใส่ URL ใบกำกับภาษีใดก็ได้ **[ผู้ตรวจย่อย]**
- `finance/actions.ts:1224-1330` `settleAdvanceClaim`: เจ้าของ settle ซ้ำได้โดยแจ้งใช้เต็มจำนวน ไม่ต้องมีใบเสร็จ → `refund_amount=0` → หลุดบล็อก "รอคืนเงิน" (กติกา v1.43.0) โดย admin ไม่ได้ยืนยัน · รายการรับยอดติดลบ
- `finance/actions.ts:1039-1072` `setTaxInvoiceEntries`: เจ้าของแก้ได้ทุกสถานะ (รวม paid/closed) และใส่ URL ใดก็ได้ → ชี้ไปไฟล์ `/receipts/...` ของคนอื่น แล้วพอ admin `deleteClaim` → `removeStorageByUrls` ลบไฟล์ของเหยื่อ
- ย่อย (Low): `updateClaim` ไม่ตรวจตัวเลข (ติดลบ/NaN/vat_mode นอกรายการ) ต่างจาก `createClaim` · `uploadTaxInvoice` พิมพ์เลขอย่างเดียวก็เลื่อนเป็น approved · `uploadReceiptFiles` ไม่ตรวจ MIME/ขนาด (`ext` มาจากชื่อไฟล์)
- แก้: บล็อก non-admin settle ซ้ำเมื่อ `advance_settled_at` มีค่า/`refund_amount>0` · ต้องมีใบเสร็จเมื่อใช้ ≥ เงินทดลอง · `setTaxInvoiceEntries` non-admin เฉพาะสถานะก่อนจ่าย และรับเฉพาะ URL ที่อยู่ในรายการเดิมหรือที่อัปโหลดผ่าน server · `deleteClaim` ลบเฉพาะ path ใต้ `claims/<เลขใบเบิกนั้น>`

### M6 · documents: path ไฟล์แนบมาจาก client · ออกเลขเอกสารของคนอื่นได้ · ทุกคนเห็นเอกสารที่ออกเลขแล้วรวมหนังสือรับรองเงินเดือน **[ยืนยันบางส่วน]**
- `documents/actions.ts:360,393,498,523,604` + `/api/pdf/document/[id]:57-60`: `meta.file` ผ่าน `sanitizeMeta` ทั้งก้อน → ตั้งเป็น path ของเอกสารอื่น (เห็น path ได้จาก `getDocument`/`listDocuments`) แล้ว `?raw=1` ดาวน์โหลด / `duplicateDocument` ก๊อป / `deleteDraft` ลบต้นฉบับใน bucket private `doc-files` [ผู้ตรวจย่อย]
- `documents/doc-types.ts:520,527`: `issue` ไม่ `adminOnly` และไม่อยู่ใน `OWNER_ACTIONS` → ใครก็ออกเลขร่างของคนอื่น (ประเภทไม่ต้องอนุมัติ: DN, MM, JA, IA) [ยืนยัน]
- `documents/actions.ts:60`: non-admin เห็นทุกใบที่ `doc_no` ไม่ว่าง รวม SC (เลขบัตร ที่อยู่ ฐานเงินเดือน) และไม่มี action ใดเช็กโมดูล `documents` [ยืนยัน] · `searchParties` (L798-808) คืนข้อมูลติดต่อจากทุกเอกสารรวมร่างคนอื่น
- `app/api/pdf/document/[id]` ไม่เช็กโมดูล documents (เช็กแค่ admin/ออกเลขแล้ว/ผู้สร้าง)
- แก้: `saveDraft` ห้ามรับ `file/file_name/file_size/file_pages` จาก payload และทุกจุดที่ใช้ path ต้องขึ้นต้น `documents/<id>/` · เพิ่ม `'issue'` ใน `OWNER_ACTIONS` · เอกสารประเภท employee/applicant (SC, JA, IA, EL) non-admin เห็นเฉพาะของตัวเอง · `hasModule('documents')` ใน actions และ route PDF

### M7 · QR กระเป๋า: ตั้งสถานะอุปกรณ์ที่ไม่ได้ถูกหยิบ และไม่เช็กโมดูล **[ยืนยัน]**
- `kits/[id]/check/kit-check-core.ts:111-124` `checkinKitItem` → `.update({ status })` โดยไม่ตรวจ `target.status === 'in_use'`; action ทั้ง 3 ใน `kits/[id]/check/actions.ts` ไม่เช็ก `stock`/`events`
- ผล: ผู้ใช้ที่ล็อกอินคนใดก็ตั้งของที่ `available` ในกระเป๋าที่จองกับอีเวนต์เปิดอยู่เป็น lost/damaged/maintenance ได้ และ `checkoutItems` เปลี่ยนเป็น `in_use` ได้
- แก้: require `target.status==='in_use'` เว้นแต่ `allowClosedEvent` · gate ด้วย `hasModule('events') ?? hasModule('stock')`

### M8 · check-in: ย้ายเช็คอินไปอีเวนต์ใดก็ได้ แก้แถวที่จ่ายแล้ว อ่าน GPS/รูปของทุกคน **[ยืนยันบางส่วน]**
- `check-in/actions.ts:1123,1193,208`: `updateMyCheckinEvent` ไม่ตรวจ `event_staff` และ `paid_slip_id`; `checkIn` รับ `event_id`/`check_type` ใดก็ได้ (กรองแค่ฝั่งหน้าจอ) · ผล: วัน/เวลาคิดสลิปเปลี่ยนผ่าน `applyEventSchedule` (ตอนนี้กติกานี้ทำงานแล้วใน v1.70.4) และแก้แถวที่ปิดงวดแล้ว
- `check-in/actions.ts:590,621`: `adminDeleteCheckin` ลบแถว `paid_slip_id` ไม่ว่างได้และไม่มี `logActivity`; `adminEditCheckin` แก้ duties/เวลาของแถวที่จ่ายแล้ว
- `getTodayCheckins` (L756) ไม่ตรวจตัวตนเลย select `*` รวม lat/lng + photo_url ของทุกคน [ยืนยัน]; `getStaffList`, `getActiveDuties` (อัตราค่าจ้าง) เช่นกัน
- แก้: ต้องเป็นสมาชิก `event_staff` (admin ยกเว้น) · ปฏิเสธเมื่อ `paid_slip_id` ไม่ว่าง (ให้ reopen งวดก่อน) · ตรวจ `check_type ∈ office/onsite/remote` · `requireAuth()` ในฟังก์ชันอ่าน และตัด lat/lng/รูปเมื่อไม่ใช่ admin · `logActivity('DELETE_CHECKIN')`

### M9 · jobs: ตั้งค่างานลบได้โดยไม่ตรวจอะไรเลย · ลบตั๋วและไฟล์แนบของคนอื่น · KPI reply IDOR **[ยืนยันบางส่วน]**
- `jobs/actions.ts:196` `deleteJobType`: ไม่มี session ไม่จำกัด `category='job_type'` → ลบสถานะ/ทีมพูล/แผนกใดก็ได้ใน `job_settings` [ยืนยัน]; `createJobSetting/updateJobSetting/deleteJobSetting` (L74-145) แค่ `userId`
- `jobs/actions.ts:1971,2142`: `createTicket` รับ `attachments` JSON จาก client; `deleteTicket` ไม่ตรวจเจ้าของ/admin แล้ว `removeStorageByUrls` ทุก URL → ใส่ URL ไฟล์คนอื่น (content planner, my-job) แล้วลบตั๋ว = ไฟล์หาย (เลี่ยงตัวตรวจของ `deleteTicketAttachment`)
- `kpi/actions.ts:542,557`: `getEvaluationReplies` ไม่ตรวจตัวตน; `createEvaluationReply` ไม่ตรวจว่าเป็น assignee/ผู้ประเมิน/admin และ `notify_users` ส่งหาใครก็ได้
- Low ในกลุ่มเดียวกัน: `deleteJob`, CRUD เทมเพลตเช็กลิสต์, `deleteCustomEmoji/toggleCustomEmoji` แค่ล็อกอิน · `my-job` คอมเมนต์อ่าน/เขียนบนงานของคนอื่นได้ (L714,729) · `my-job` อัปโหลดเช็กนามสกุลแต่ `contentType: file.type` · content planner ลบโพสต์ได้ทุกโพสต์ (L569) · `notify_users` สแปมแจ้งเตือนได้ (`crm:937`, `jobs:535`) · `events` ไม่ตรวจค่า `role` ใน `staff_assignments`
- แก้: ตั้งค่างาน = admin + `.eq('category',...)` · ตั๋ว: รับเฉพาะ URL ใต้ `u-<userId>` ของผู้เรียก และ `deleteTicket` = ผู้สร้าง/admin · KPI reply ตรวจ assignee/evaluator/admin

### M10 · ล็อกอิน: กัน brute-force ได้ไม่ดี + เดาเบอร์โทรได้ **[ผู้ตรวจย่อย]**
- `app/login/actions.ts:52-53,88-103`: key ของ rate limiter = `x-forwarded-for` ตัวแรก (client ส่งเองได้ถ้า Railway ไม่ strip — ต้องทดสอบ) · limiter ใน memory ต่อ instance หายตอน restart · ตัวนับ `failed_login_attempts` อ่าน-แล้ว-เขียน (ยิงพร้อมกัน N ครั้ง นับเพิ่ม ~1) · PIN 6 หลัก (10^6) bcrypt ≈250ms · ข้อความ "Phone number not found" vs PIN ผิด = enumerate เบอร์ได้ · ตรวจ PIN ก่อนเช็ก blocked/approved (บัญชีถูกบล็อกยังเป็น PIN oracle) · `changePin` ไม่จำกัดครั้งและไม่ rotate session
- แก้: นับใน SQL แบบ atomic (`set failed_login_attempts = failed_login_attempts + 1 returning`) · key limiter ด้วยเบอร์โทรอย่างเดียว + IP จาก hop ที่เชื่อถือได้ · ข้อความเดียว "เบอร์หรือ PIN ไม่ถูกต้อง" · เช็ก blocked/approved ก่อนเทียบ PIN

### M11 · `SESSION_SECRET` ถอยไปใช้ anon key (ค่าสาธารณะ) เมื่อไม่ตั้ง **[ยืนยันโค้ด; prod ยังไม่ตรวจ]**
- `lib/session.ts:3`, `proxy.ts:127` · `.env.local` ของเครื่องนี้ไม่มี `SESSION_SECRET` · บน Railway ยังไม่ได้ตรวจ
- ถ้า prod ไม่ตั้ง: ปลอม token ของ user ใดก็ได้ เหลือแค่ต้องรู้ `active_session_id` (UUID สุ่ม — แต่ถูกส่งไปหน้า /users และ /security ของ admin ดูข้อ L4)
- แก้: throw ตอน start เมื่อ `NODE_ENV==='production'` และไม่มี `SESSION_SECRET` · ยืนยันค่าบน Railway วันนี้

### M12 · sanitizer ของ rich text เอกสารเลี่ยงได้ **[ผู้ตรวจย่อย]**
- `documents/doc-types.ts:473-478` regex ต้องมีช่องว่างก่อน `on`, จับ `javascript:` ตรงตัวเท่านั้น → `<img src="x"/onerror=...>`, `href="java&#115;cript:..."`, `<svg>`, `<form>` ผ่าน · ใช้ตอน save (`actions.ts:360`) และ render (`document-view.tsx:672`)
- แก้: DOMPurify allowlist เดียวกับ H2

### M13 · `xlsx 0.18.5` มี CVE (prototype pollution CVE-2023-30533, ReDoS CVE-2024-22363) **[ยืนยัน version]**
- ใช้ parse ไฟล์ที่ผู้ใช้อัปโหลดใน `content-planner/actions.ts:299` · npm ไม่มีเวอร์ชันแก้ (SheetJS ย้ายไป CDN)
- แก้: ติดตั้งจาก `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` หรือเปลี่ยนเป็น `exceljs`

### M14 · ไม่มี Content-Security-Policy **[ยืนยัน]**
- `next.config.ts` มี nosniff/HSTS/X-Frame-Options แต่ไม่มี CSP → ไม่มีชั้นกัน H2/H3/M12 · `X-XSS-Protection: 1; mode=block` ล้าสมัย
- แก้: เริ่ม `Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'nonce-…'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob: https://*.supabase.co` แล้วค่อยบังคับ

### M15 · OAuth `register`/`token` ไม่มี rate limit และไม่เคยล้าง client/code หมดอายุ **[ผู้ตรวจย่อย]**
- แก้: `checkRateLimit` ต่อ IP · job ลบ client ที่ไม่เคยได้ token และ code ที่เลย `expires_at`

### M16 · ตั้งค่าใน `users/actions.ts` ใช้ mass assignment แบบเดียวกับ C1 (admin เท่านั้น) **[ยืนยัน]**
- `updateUserProfile` (L167) และ `updateUserRole` (L81 รับ string ใดก็ได้) · แก้พร้อม C1

### M17 · example-kits สร้าง/แก้/ลบได้ทุกคน และ `status`/`type` เป็น string อิสระ **[ผู้ตรวจย่อย]**
- `example-kits/actions.ts:11,83`, `example-kits/[id]/actions.ts:11,44,77,109` · แก้: `getKitManager()` + whitelist

## Low

- **L1** `sales-board/actions.ts:23` `saveMonthTargets` ไม่เรียก `requireAuth` เลย [ยืนยัน] — ใครก็ทับเป้าขายทั้งบริษัท (น่าจะเรียกได้แม้ไม่ล็อกอินผ่าน `/login` — ต้องทดสอบ) · ไม่มี log
- **L2** CSV formula injection ใน `costs/download`, `crm/download`, `kpi/download`, `overview/export` (ไม่ escape `= + - @`; costs ไม่ double `"`)
- **L3** `lib/safe-next.ts:4` open redirect ด้วย `/%09/evil.com` (เบราว์เซอร์ตัด tab ออก) [น่าจะใช่] · `items/[id]/actions.ts:181` `redirect(returnTo)` ไม่ตรวจ
- **L4** `users/page.tsx:18` `select('*')` ส่ง `pin` (bcrypt ของ PIN 6 หลัก แคร็กออฟไลน์ง่าย), `active_session_id`, `failed_login_attempts` ของทุกคนไป client ของ admin · `stock/dashboard/page.tsx:26` ส่งแถวตัวเอง · `/security` แสดง `active_session_id`
- **L5** `cron/fetch-metrics` รับ secret ทาง query string (ติด log) และเทียบ `===` ไม่ constant-time (fail-closed ถูกแล้ว)
- **L6** `/api/*` ข้าม license gate (`requireAuth` ไม่เรียก `getLicenseStatus`)
- **L7** `pdf/payment-voucher` ไม่ตั้ง `Cache-Control: no-store` (route อื่นตั้ง) และไม่ตรวจ `id` เป็น UUID / ไม่ `asciiName()` ใน Content-Disposition
- **L8** error response ส่ง `err.message` ภายในออกไป (`pdf/document/[id]:129`, `preview:166`, `payment-voucher:62`, `salary:64`, schema routes, `ai-analyze:276`)
- **L9** `ai-analyze` ไม่จำกัดขนาด input/จำนวน events, `maxOutputTokens 65536`, `request.json()` ไม่ try/catch (admin เท่านั้น)
- **L10** `lib/auth.ts:48-57` `requireAuth` ไม่เช็ก `is_blocked` (พึ่ง block ล้าง `active_session_id`; บล็อกตรงใน SQL ยังใช้ `/api/*` ได้)
- **L11** `checkupdate/actions.ts:22` `getAppliedMigrations` ไม่มี auth
- **L12** `lib/stock.ts:61` `hasModule` ถือว่า `allowed_modules` NULL = มี `stock`
- **L13** `lib/supabase.ts` client ฝั่ง browser ไม่มีใคร import แล้ว — ลบทิ้งกันคนหยิบกลับมาใช้
- **L14** `scripts/revert-rls.ts` เรียก `exec_sql` และสร้าง policy `USING (true)` — ฟังก์ชันไม่มีบน prod แล้ว (ตรวจสดแล้ว) แต่ควรลบสคริปต์
- **L15** personal token: cap 5 มี race (นับแล้วค่อย insert) · token MCP/personal ไม่ผูก `active_session_id` (logout/ถูกเตะไม่ตัด token อายุสูงสุด 365 วัน) — ควรบอกผู้ใช้ที่ /connected-apps และ revoke ทั้งหมดเมื่อ admin บล็อก/รีเซ็ต PIN
- **L16** `lib/request-origin.ts` สร้าง issuer/endpoint ของ `.well-known` จาก `x-forwarded-host` — ใช้ค่า env คงที่แทน
- **L17** `.well-known` ประกาศ `client_secret_post` ที่ไม่ได้ implement
- **L18** `document PDF` / `canViewClaimDocs`: ผู้ใช้ทุกคนดู voucher/bundle ของใบเบิกที่เกี่ยวเงินสดย่อยได้ (ตั้งใจ — ยืนยันว่ารับได้ที่เห็นเลขบัญชีของคนอื่น)
- **L19** mutation ที่ไม่มี `logActivity`: `checkIn`, `checkOut`, `undoCheckout`, `quickCheckoutStale`, `adminCheckIn`, `adminDeleteCheckin`, `updateMyCheckinEvent`, `createJobType/updateJobType/deleteJobType`, `uploadClosureImage`, `markAsRead`, `updateClaim`, `removeReceiptFile`, `uploadTaxInvoice`, `setTaxInvoiceEntries`, `recreateCostItemFromClaim`, `saveMonthTargets`, `cleanupOrphanedItems`, `uploadPackingPhoto/uploadReturnPhoto`, `markMigrationApplied/unmarkMigrationApplied`
- **L20** `serverActions.bodySizeLimit: '10mb'` ใช้กับทุก action ของทุกคน — พิจารณา rate limit

## Info

- MCP tools: อ่านอย่างเดียวทั้งหมด เช็ก `allowed_modules` จาก DB ทุกคำขอ admin-only tools กรองสองชั้น rate limit 60/นาที/token · ข้อความอิสระ (note, ชื่อลูกค้า) ส่งกลับโมเดลโดยไม่มี framing "untrusted"
- `?items=` ของ `/finance/new` อ่าน purchase item ใดก็ได้ด้วย UUID (ไม่ scope เจ้าของ) — ต้องเดา UUID
- `resource` (RFC 8707) และ `scope` ไม่ถูกตรวจตอน exchange/verify — ไม่มีผลตอนมี scope เดียว
- check-in: ไม่ตรวจว่า selfie เป็นรูปจริง (path `<userId>/<checkinId>.webp` ทับคนอื่นไม่ได้) · lat/lng เชื่อ client
- addPettyCashExpense: staff สร้างใบเบิกสถานะ paid กับกองทุนเปิดได้โดยไม่ต้องมีใบเสร็จ — ตั้งใจ (admin audit ตอนปิดเดือน)
- `proxy.ts` ไม่คุม `/overview*`, `/jobs*`, `/check-in*` (ทราบอยู่แล้ว) — H5 คือผลลัพธ์จริงของช่องนี้

---

## สิ่งที่เจ้าของระบบต้องทำบน production (นอกเหนือจากโค้ด)

1. ตรวจว่า Railway ตั้ง `SESSION_SECRET` (ค่าสุ่มยาว) และ `CRON_SECRET` แล้ว — ถ้าเพิ่งตั้ง ทุกคนต้องล็อกอินใหม่
2. รันทันที: `DROP POLICY IF EXISTS packing_photos_all ON storage.objects;`
3. ตั้ง bucket `checkin-photos`, `receipts`, `crm-payment-proofs`, `login_selfies` เป็น private หลังโค้ดเปลี่ยนไปใช้ signed URL (M3)
4. SQL ตรวจซ้ำ (คาดว่าได้ 0 แถว ยกเว้นข้อ 2 ก่อน drop):
   ```sql
   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity;
   select schemaname, tablename, policyname, roles, cmd from pg_policies where schemaname in ('public','storage');
   select table_name, grantee, privilege_type from information_schema.role_table_grants
    where table_schema='public' and grantee in ('anon','authenticated');
   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));
   select id, public from storage.buckets order by id;
   ```
5. Supabase Dashboard → Authentication → ปิด "Allow new users to sign up" (ระบบไม่ใช้ Supabase Auth)

## ลำดับการแก้ที่แนะนำ

| รอบ | ข้อ | ขนาดงาน |
|---|---|---|
| 1 (วันนี้) | C1 + M16 whitelist profile/users · H1 drop policy · H7 check-out guard · L1 requireAuth · M11 fail-closed | เล็กมาก (ไม่กี่บรรทัดต่อข้อ) |
| 2 (สัปดาห์นี้) | H2 + H3 + M12 DOMPurify ชุดเดียว · H4 OAuth allowlist + หน้าขออนุญาต · H5 `requireModule` + `MODULE_ROUTES` เพิ่ม jobs/check-in/overview · H6 items gate · M1 token ให้ schema/migrations · M2 SSRF allowlist | กลาง |
| 3 | M3 signed URL · M4 costs · M5 finance · M6 documents · M7 kit QR · M8/M9 check-in/jobs/KPI · M10 login counter · M13 xlsx · M14 CSP report-only · M15/M17 | กลาง–ใหญ่ |
| 4 | Low ทั้งหมด + logActivity ที่ขาด | เล็ก ทยอย |

ทุกข้อที่แก้ต้องมีชุดตรวจ (`*.check.ts`) ครอบ: เพิ่มเคส mass-assignment ใน `scripts/session-hardening.check.ts`, เคส checkOut ซ้ำใน flow ของ check-in, และ static scan ว่าทุก export ใน `crm/actions.ts`, `items/**/actions.ts`, `costs/actions.ts` เรียก helper ตรวจโมดูล
