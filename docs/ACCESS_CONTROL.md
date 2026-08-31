# 🔐 Access Control — User vs Admin

> อัปเดตล่าสุด: 26 ก.พ. 2569  
> ใช้สำหรับ dev ทุกคนเพื่อทำความเข้าใจว่า role ไหนเข้าหน้าไหนได้บ้าง

---

## ภาพรวมระบบสิทธิ์

ระบบมี 2 ชั้นการตรวจสอบ:

1. **Module Access** (`proxy.ts`) — ตรวจว่า user มี module นั้นใน `allowed_modules` หรือไม่
2. **Page-level Guard** (แต่ละ `page.tsx`) — ตรวจ `session_role` เฉพาะหน้า admin only

---

## Module Route Mapping (`proxy.ts`)

| Module Key | Routes                                                 | หมายเหตุ                             |
| ---------- | ------------------------------------------------------ | ------------------------------------ |
| `events`   | `/events`, `/events/*`                                 | รวม event-closures                   |
| `stock`    | `/stock/dashboard`, `/items`, `/kits`, `/example-kits` |                                      |
| `kpi`      | `/kpi`, `/kpi/*`                                       |                                      |
| `costs`    | `/costs`, `/costs/*`                                   |                                      |
| `admin`    | `/logs`, `/users`                                      | admin role เท่านั้น                  |
| —          | `/crm`, `/crm/*`                                       | ไม่ถูก guard ใน proxy (ทุกคนเข้าได้) |
| —          | `/checkout`                                            | ไม่ถูก guard ใน proxy (mockup)       |
| —          | `/dashboard`                                           | หน้าหลัก ทุกคนเข้าได้                |

---

## 👤 User (Staff) — เข้าได้

| หน้า            | Path                     | หมายเหตุ                              |
| --------------- | ------------------------ | ------------------------------------- |
| Dashboard       | `/dashboard`             | ✅                                    |
| **CRM**         |                          |                                       |
| Kanban Board    | `/crm`                   | ✅                                    |
| Lead Detail     | `/crm/[id]`              | ✅                                    |
| CRM Dashboard   | `/crm/dashboard`         | ✅                                    |
| Payments        | `/crm/payments`          | ✅                                    |
| Archive         | `/crm/archive`           | ✅                                    |
| **Events**      |                          |                                       |
| Events List     | `/events`                | ✅ ต้องมี `events` ใน allowed_modules |
| Event Detail    | `/events/[id]/*`         | ✅                                    |
| Create Event    | `/events/new`            | ✅                                    |
| Event Closures  | `/events/event-closures` | ✅                                    |
| **Stock**       |                          |                                       |
| Stock Dashboard | `/stock/dashboard`       | ✅ ต้องมี `stock` ใน allowed_modules  |
| Items           | `/items`                 | ✅                                    |
| Kits            | `/kits`                  | ✅                                    |
| Example Kits    | `/example-kits`          | ✅                                    |
| **Checkout**    | `/checkout`              | ✅ (mockup)                           |
| **Costs**       | `/costs`, `/costs/*`     | ✅ ต้องมี `costs` ใน allowed_modules  |
| **KPI**         |                          |                                       |
| KPI Dashboard   | `/kpi/dashboard`         | ✅ ต้องมี `kpi` ใน allowed_modules    |
| KPI Reports     | `/kpi/reports`           | ✅                                    |
| KPI Download    | `/kpi/download`          | ✅                                    |

---

## 👤 User (Staff) — เข้า ❌ ไม่ได้

| หน้า            | Path               | การป้องกัน                                      |
| --------------- | ------------------ | ----------------------------------------------- |
| CRM Download    | `/crm/download`    | `page.tsx` → redirect `/crm`                    |
| CRM Settings    | `/crm/settings`    | `page.tsx` → redirect `/crm`                    |
| KPI Templates   | `/kpi/templates`   | `page.tsx` → redirect `/kpi/dashboard`          |
| KPI Assignments | `/kpi/assignments` | `page.tsx` → redirect `/kpi/dashboard`          |
| KPI Evaluate    | `/kpi/evaluate`    | `page.tsx` → redirect `/kpi/dashboard`          |
| User Management | `/users`           | `proxy.ts` + `page.tsx` → redirect `/dashboard` |
| Activity Logs   | `/logs`            | `proxy.ts` + `page.tsx` → redirect `/dashboard` |

---

## 🛡️ Admin — เข้าได้ทุกหน้า

Admin มีสิทธิ์เข้าทุกหน้าที่ User เข้าได้ **รวมถึง**:

| หน้า            | Path               |
| --------------- | ------------------ |
| CRM Download    | `/crm/download`    |
| CRM Settings    | `/crm/settings`    |
| KPI Templates   | `/kpi/templates`   |
| KPI Assignments | `/kpi/assignments` |
| KPI Evaluate    | `/kpi/evaluate`    |
| User Management | `/users`           |
| Activity Logs   | `/logs`            |

---

## 📁 Nav Visibility

ใน UI เมนูจะ **ซ่อน** ตามสิทธิ์:

| Component     | ซ่อนอะไร                | เงื่อนไข                            |
| ------------- | ----------------------- | ----------------------------------- |
| `navbar.tsx`  | Module ทั้ง group       | `allowed_modules` ไม่มี module นั้น |
| `navbar.tsx`  | Admin group             | `role !== 'admin'`                  |
| `crm-nav.tsx` | Download, Settings tabs | `role !== 'admin'`                  |

---

## 🔗 Data Flow สำคัญ

```
CRM (ตอบรับ) → Events (สร้างอีเวนต์) → Stock (ดึง kits จาก events)
                                        → Costs (import จาก events)
```

- CRM กดเปิดอีเวนต์ → สร้างใน table `events` + auto-fill ข้อมูล
- Costs → import จาก `events` เข้า `job_cost_events`
- Stock → ดึง kits ที่ assign ให้ event
