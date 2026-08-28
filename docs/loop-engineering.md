# Loop Engineering — วงจรการทำงานมาตรฐานของโปรเจค OMICHAT

> ทุก task ที่เข้ามา ต้องวิ่งผ่าน loop นี้เสมอ ไม่มีข้อยกเว้น
> เอกสารนี้ร้อย workflow ทั้งหมดเข้าด้วยกัน: [Project-workflow.md](Project-workflow.md) (แผน/สถานะ) + [agent-workflow.md](agent-workflow.md) (Plan → Execute → Verify)

## ภาพรวม Loop

```
รับ task
   │
   ▼
[1] READ CONTEXT ── อ่าน docs/ ทั้งหมด (โหลดอัตโนมัติผ่าน CLAUDE.md แล้ว)
   │                ตรวจว่า task อยู่ Sprint ไหน / กระทบส่วนไหนของแผน
   ▼
[2] GATE ────────── งานเล็ก (ไฟล์เดียว/config/คำถาม) → ทำเลย ข้ามไป [6]
   │                งานใหญ่ (หลายไฟล์/feature) → เข้า loop เต็ม
   ▼
[3] PLAN ────────── สร้างแผน + acceptance criteria (3–7 ข้อ, วัดได้ด้วยคำสั่ง) → lock
   │                จุดคลุมเครือ → ตัดสินใจเอง บันทึกเป็น assumption
   ▼
[4] EXECUTE ─────── ลงมือตามแผน (dispatch executor ตาม agent-workflow.md)
   │                รอบ 2+: แก้เฉพาะจุดที่ตก ห้ามรื้อส่วนที่ผ่านแล้ว
   ▼
[5] VERIFY ──────── รันของจริง: build / typecheck / test / lint
   │                ├─ ผ่าน → ไป [6]
   │                └─ ไม่ผ่าน → กลับ [4] (สูงสุด 5 รอบ / score นิ่ง 2 รอบ → หยุด)
   ▼
[6] WRAP-UP ─────── อัปเดตสถานะใน docs/Project-workflow.md (ติ๊ก checkbox + วันที่)
                    commit + push (ถ้า user ตั้ง flow ไว้)
                    รายงานครั้งเดียว: ผล / criteria ผ่าน-ตก / assumptions / สิ่งที่เหลือ
```

## กติกาต่อขั้น

### [1] READ CONTEXT
- `docs/Project-workflow.md` และ `docs/agent-workflow.md` ถูก import เข้า context ทุก session ผ่าน `@docs/...` ใน CLAUDE.md อยู่แล้ว — ห้ามทำงานโดยไม่รู้ว่า task นี้อยู่ตรงไหนของ sprint plan
- ถ้า task ขัดกับแผนใน Project-workflow.md → ทำตาม task ของ user แต่บันทึกความขัดแย้งไว้รายงานตอน wrap-up

### [2] GATE
- เล็ก = แก้ไฟล์เดียว, เปลี่ยน config, ตอบคำถาม, ย้าย/rename ไฟล์
- ใหญ่ = feature ใหม่, แตะหลายไฟล์, มี acceptance ที่ต้อง verify ด้วยการรัน

### [3] PLAN
- Acceptance criteria ต้องวัดได้ด้วยคำสั่ง: ✅ `pnpm build` ผ่าน, ✅ `pnpm exec tsc --noEmit` ไม่มี error — ❌ "โค้ดสะอาด"
- Lock ตั้งแต่รอบแรก ห้ามเพิ่ม/เปลี่ยนเกณฑ์กลางทาง
- ห้ามถาม user กลาง loop — ยกเว้นกรณีเดียว: ทำลายข้อมูล / เสียเงิน / irreversible

### [4] EXECUTE
- รอบแรกส่งแผนเต็ม + path ไฟล์ (ให้ executor อ่านไฟล์เอง ไม่ paste โค้ด)
- รอบ 2+ ส่งเฉพาะ failures — ประหยัด token, กัน regenerate ทั้งชิ้น

### [5] VERIFY
- ตัดสินด้วยการรันจริงเท่านั้น ไม่เชื่อรายงานของ executor
- เทียบกับ criteria ที่ lock ไว้ — ข้อที่ผ่านแล้ว (passed_ids) ไม่ตรวจซ้ำ
- เงื่อนไขออกจาก loop: pass ทุกข้อ | score ≥ 0.85 | score นิ่ง 2 รอบ | ครบ 5 รอบ

### [6] WRAP-UP (ห้ามข้ามเด็ดขาด)
- อัปเดต `docs/Project-workflow.md`: ติ๊ก `[x]` + วันที่ + หมายเหตุสั้น ๆ ว่าทำอะไร/เหลืออะไร
- เอกสารใหม่ทุกไฟล์ต้องอยู่ใน `docs/` และเพิ่มบรรทัด `@docs/ชื่อไฟล์.md` ใน CLAUDE.md ถ้าต้องการให้โหลดทุก session
- รายงาน user ครั้งเดียว ไม่รายงานระหว่างทาง

## External Credentials — สิ่งที่ user ต้องทำเอง (Loop ห้าม block รอ)

สิ่งที่ AI ทำแทนไม่ได้ เพราะต้องสมัคร/สร้างบน console ภายนอก:

| # | บริการ | user ต้องทำ | ได้ค่าอะไรมา |
|---|---|---|---|
| 1 | **LINE Developers Console** | สร้าง Messaging API channel ทดสอบ 2 ตัว | `LINE_TEST_CHANNEL_ID`, `LINE_TEST_CHANNEL_SECRET`, `LINE_TEST_CHANNEL_ACCESS_TOKEN` |
| 2 | **Google Cloud Console** | สร้าง OAuth Client (สำหรับ Better Auth Google login) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| 3 | **Railway** | สร้าง project + service: Postgres, Redis, Centrifugo | `DATABASE_URL`, `REDIS_URL`, `CENTRIFUGO_HTTP_URL`, `NEXT_PUBLIC_CENTRIFUGO_WS_URL` |
| 4 | **Cloudflare R2** | สร้าง bucket + API token | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` |
| 5 | **Anthropic Console** | สร้าง API key (Sprint 4 — AI layer) | `ANTHROPIC_API_KEY` |
| 6 | **Sentry** | สร้าง project | `SENTRY_DSN` |
| 7 | **Stripe/Omise** | สมัคร + สร้าง key (Sprint 6 — billing) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

ค่าที่ generate เองได้ (ไม่ต้องรอ user): `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `CENTRIFUGO_API_KEY`, `CENTRIFUGO_TOKEN_HMAC_SECRET`

**env แยกต่อ app (ไม่มี `.env` ที่ root):**

| ไฟล์ | ใครโหลด | เก็บอะไร |
|---|---|---|
| `apps/web/.env` | Next.js (frontend + Better Auth route) | `NEXT_PUBLIC_*`, `DATABASE_URL`, `BETTER_AUTH_*`, `GOOGLE_CLIENT_*` |
| `apps/api/.env` | NestJS API + BullMQ worker + Prisma CLI | ที่เหลือทั้งหมด (Redis, Centrifugo server key, R2, `TOKEN_ENCRYPTION_KEY`, LINE, Anthropic, Sentry, Stripe) |

เหตุผล: web ไม่ควรถือ secret ของ backend ที่ไม่ได้ใช้ (blast radius) + บน Railway แต่ละ service ตั้ง env แยกอยู่แล้ว — `make env` สร้างทั้งสองไฟล์จาก `.env.example` ของแต่ละ app

**กติกาใน loop:**
- ทุก credential อ่านจาก **env variable เท่านั้น** — ห้าม hardcode, ห้ามใส่ค่าจริงลงโค้ด/commit
- ตัวแปรใหม่ทุกตัว → เพิ่มลง `.env.example` **ของ app ที่ใช้** (เว้นค่าว่าง + comment บอกว่าไปเอาจากไหน) ทันทีที่โค้ดอ้างถึง — ห้ามใส่ทั้งสองไฟล์ถ้าใช้แค่ฝั่งเดียว
- **ห้ามหยุด loop รอ credential** — เขียนโค้ดให้เสร็จ, verify ส่วนที่ verify ได้โดยไม่ต้องใช้ค่าจริง (build/typecheck/unit test), ส่วนที่ต้องต่อ service จริงให้ระบุใน wrap-up ว่า "รอ user เติม .env แล้วทดสอบ"
- ตอน wrap-up รายงานรายการ env ที่ user ต้องเติม **ครั้งเดียว** ระบุด้วยว่าไฟล์ไหน (`apps/web/.env` หรือ `apps/api/.env`) — user เติมครบแล้วรันทดสอบรอบเดียวจบ

## กฎทองของ Loop

1. **เข้า loop ทุก task** — ต่างกันแค่งานเล็กวิ่งทางลัด [1]→[2]→[6]
2. **Verify ด้วยการรันจริง** ไม่ใช่การอ่านโค้ดหรือเชื่อรายงาน
3. **จบใน prompt เดียว** — ตัดสินใจแทน user, บันทึก assumption, รายงานตอนจบครั้งเดียว
4. **สถานะต้องตรงความจริงเสมอ** — Project-workflow.md คือ single source of truth ของความคืบหน้า ทำเสร็จแล้วไม่อัปเดต = งานยังไม่เสร็จ
