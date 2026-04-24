'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/i18n/context'
import {
  BookOpen, Banknote, FileText, CheckCircle2, Clock, Receipt, Wallet, RefreshCw,
  XCircle, Ban, Send, ShieldAlert, Upload, Bell, Layout, User, UserCog,
  CircleDollarSign, ListChecks, ArrowRight, ExternalLink, Edit3, Lock,
  GitBranch, ChevronDown,
} from 'lucide-react'

export default function HowtoView() {
  const { locale } = useLocale()
  const isEn = locale === 'en'

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/20 dark:via-zinc-900 dark:to-teal-950/20 p-6 md:p-8">
        <div className="relative flex items-start gap-4">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'How-to Guide' : 'คู่มือใช้งาน'}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1.5">
              {isEn
                ? 'Step-by-step guides for each feature in Office Hub.'
                : 'คู่มือการใช้งานฟีเจอร์ต่างๆ ในระบบ Office Hub แบบ step-by-step'}
            </p>
          </div>
        </div>
      </div>

      {/* ── TOC ────────────────────────────────────────────────────── */}
      <nav aria-label="Table of contents" className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          {isEn ? 'On this page' : 'หัวข้อ'}
        </p>
        <ul className="flex flex-wrap gap-2">
          {[
            { id: 'finance-flowcharts', th: 'แผนผังขั้นตอน',              en: 'Flowcharts' },
            { id: 'finance-types',      th: 'ประเภทใบเบิก',             en: 'Claim types' },
            { id: 'finance-normal',     th: 'Flow ปกติ',                en: 'Normal flow' },
            { id: 'finance-advance',    th: 'Flow เบิกทดลองจ่าย',        en: 'Advance flow' },
            { id: 'finance-status',     th: 'สถานะทั้งหมด',              en: 'All statuses' },
            { id: 'finance-permissions', th: 'สิทธิ์การใช้งาน',          en: 'Permissions' },
            { id: 'finance-notifications', th: 'การแจ้งเตือน',           en: 'Notifications' },
            { id: 'finance-menu',       th: 'เมนูทั้งหมด',                en: 'Menu shortcuts' },
          ].map(i => (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 rounded-lg transition-colors"
              >
                {isEn ? i.en : i.th}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Section: Finance datasheet ─────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-teal-100 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'Expense Claims — Complete Guide' : 'ใบเบิกเงิน — คู่มือครบทั้งระบบ'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isEn
                ? 'What users and admins need to do for each claim type.'
                : 'สรุปขั้นตอนที่ user และ admin ต้องทำในการเบิกแต่ละประเภท'}
            </p>
          </div>
        </div>

        {/* ── Flowcharts ──────────────────────────────────────────── */}
        <div id="finance-flowcharts" className="scroll-mt-6 space-y-6">
          <SectionHeader
            icon={<GitBranch className="h-4 w-4" />}
            title={isEn ? 'Step-by-step flowcharts' : 'แผนผังขั้นตอน'}
          />

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 text-[10px] p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="font-semibold text-zinc-500 uppercase tracking-wider">{isEn ? 'Legend' : 'สัญลักษณ์'}:</span>
            <LegendDot variant="start"   label={isEn ? 'Start' : 'เริ่ม'} />
            <LegendDot variant="user"    label={isEn ? 'User' : 'User'} />
            <LegendDot variant="admin"   label={isEn ? 'Admin' : 'Admin'} />
            <LegendDot variant="decision" label={isEn ? 'Decision' : 'ทางเลือก'} />
            <LegendDot variant="success" label={isEn ? 'Terminal' : 'จบ'} />
            <LegendDot variant="error"   label={isEn ? 'Rejected' : 'ปฏิเสธ'} />
          </div>

          {/* ═════ Flowchart 1: USER — Normal flow ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow A — User: Event / Other claim' : 'Flow A — User: เบิกงานอีเวนต์ / ค่าอื่นๆ'}
            subtitle={isEn ? 'How a regular employee files a normal claim' : 'พนักงานทั่วไปยื่นใบเบิกปกติ'}
            color="sky"
          >
            <FlowNode variant="start" emoji="🎬" title={isEn ? 'Need to claim expense' : 'ต้องการเบิกค่าใช้จ่าย'} />
            <FlowArrow />
            <FlowNode variant="user"  emoji="📝" title={isEn ? 'Create new claim' : 'สร้างใบเบิกใหม่'} subtitle="/finance/new" tag="status: draft" />
            <FlowArrow />
            <FlowNode variant="user"  emoji="✏️" title={isEn ? 'Fill in details' : 'กรอกข้อมูล'} subtitle={isEn ? 'type, category, amount, VAT/WHT, attach receipt, bank info' : 'ประเภท / หมวดหมู่ / ยอด / VAT / WHT / แนบใบเสร็จ / เลขบัญชี'} />
            <FlowArrow />
            <FlowNode variant="user"  emoji="📤" title={isEn ? 'Submit for approval' : 'กดส่งอนุมัติ'} tag="draft → pending" />
            <FlowArrow label={isEn ? 'can cancel anytime → cancelled' : 'ยกเลิกได้ตลอด → cancelled'} />
            <FlowNode variant="decision" emoji="⏳" title={isEn ? 'Admin reviews — 4 outcomes' : 'Admin ตรวจ — 4 ทางเลือก'} />

            {/* 4-way branch */}
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <FlowLane label={isEn ? '✓ Approved' : '✓ อนุมัติ'} color="emerald">
                <FlowNode variant="success" compact emoji="✅" title={isEn ? 'approved' : 'อนุมัติแล้ว'} tag="approved" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Admin pays out' : 'Admin จ่ายเงิน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '🧾 Tax invoice' : '🧾 ขอใบกำกับ'} color="sky">
                <FlowNode variant="decision" compact emoji="🧾" title="waiting_tax_invoice" />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="📤" title={isEn ? 'User uploads' : 'user อัพโหลด'} />
                <FlowArrow label="auto" />
                <FlowNode variant="success" compact emoji="✅" title="approved" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Pay' : 'จ่ายเงิน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '📅 Month-end' : '📅 สิ้นเดือน'} color="violet">
                <FlowNode variant="decision" compact emoji="📅" title="pending_month_end" />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="💵" title={isEn ? 'Batch pay at month-end' : 'จ่ายรอบสิ้นเดือน'} tag="→ paid" />
              </FlowLane>

              <FlowLane label={isEn ? '✗ Rejected' : '✗ ปฏิเสธ'} color="red">
                <FlowNode variant="error" compact emoji="❌" title={isEn ? 'With reason' : 'มีเหตุผล'} tag="rejected" />
                <FlowArrow />
                <FlowNode variant="terminal" compact emoji="🔄" title={isEn ? 'Create new claim' : 'สร้างใบใหม่'} />
              </FlowLane>
            </div>

            <FlowArrow />
            <FlowNode variant="success" emoji="🏁" title={isEn ? 'Done — claim closed' : 'จบเคส — ใบเบิกปิดแล้ว'} tag="paid (terminal)" />
          </FlowchartBox>

          {/* ═════ Flowchart 2: USER — Advance flow ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow B — User: Advance payment' : 'Flow B — User: เบิกทดลองจ่าย'}
            subtitle={isEn ? 'Get money upfront, settle actual spend + refund later' : 'ขอเงินล่วงหน้า แล้วเคลียร์ค่าใช้จ่ายจริง + คืนเงินทีหลัง'}
            color="amber"
          >
            <FlowNode variant="start" emoji="💰" title={isEn ? 'Need advance money' : 'ต้องการเงินล่วงหน้า'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📝" title={isEn ? 'Create claim — type: advance' : 'สร้างใบเบิก — ประเภท: เบิกทดลองจ่าย'} subtitle="/finance/new" />
            <FlowArrow />
            <FlowNode variant="user" emoji="💵" title={isEn ? 'Enter advance amount (no receipt needed yet)' : 'ใส่ยอดที่ขอเบิก (ยังไม่ต้องแนบใบเสร็จ)'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📤" title={isEn ? 'Submit → wait for admin approval + payout' : 'ส่งอนุมัติ → รอ admin อนุมัติ + จ่ายเงิน'} tag="→ paid" />
            <FlowArrow label={isEn ? 'now you have the money' : 'ได้รับเงินแล้ว'} />
            <FlowNode variant="decision" emoji="🛒" title={isEn ? 'Go spend — collect receipts' : 'ไปใช้เงินจริง — เก็บใบเสร็จ'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="📂" title={isEn ? 'Re-open claim → "Update actual spend" box' : 'เปิดใบเดิม → กล่อง "อัพเดทค่าใช้จ่ายจริง"'} />
            <FlowArrow />
            <FlowNode variant="user" emoji="➕" title={isEn ? 'Add line items + attach receipts' : 'เพิ่มรายการ + แนบใบเสร็จ'} subtitle={isEn ? 'System auto-calculates refund amount' : 'ระบบคำนวณเงินคืนให้อัตโนมัติ'} />
            <FlowArrow />
            <FlowNode variant="decision" emoji="💭" title={isEn ? 'Refund > 0?' : 'มีเงินคืน > 0 ไหม?'} />

            {/* Branch: refund or not */}
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <FlowLane label={isEn ? 'Yes — refund needed' : 'ใช่ — ต้องคืนเงิน'} color="cyan">
                <FlowNode variant="user" compact emoji="🏦" title={isEn ? 'Transfer refund to company' : 'โอนเงินคืนบริษัท'} />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="📎" title={isEn ? 'Attach refund slip' : 'แนบสลิปการโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="user" compact emoji="💾" title={isEn ? 'Click "Save update"' : 'กด "บันทึกการอัพเดท"'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="👀" title={isEn ? 'Admin checks refund slip' : 'Admin ตรวจสลิปโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Admin confirms received' : 'Admin ยืนยันรับเงิน'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="💸" title={isEn ? 'refund_confirmed (done)' : 'คืนเงินบริษัทแล้ว (จบ)'} tag="refund_confirmed" />
              </FlowLane>

              <FlowLane label={isEn ? 'No — used all' : 'ไม่ใช่ — ใช้หมดพอดี'} color="zinc">
                <FlowNode variant="user" compact emoji="💾" title={isEn ? 'Click "Save update"' : 'กด "บันทึกการอัพเดท"'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="🏁" title={isEn ? 'Stays "paid" — done' : 'อยู่ paid ตามเดิม — จบ'} tag="paid (terminal)" />
              </FlowLane>
            </div>
          </FlowchartBox>

          {/* ═════ Flowchart 3: ADMIN ═════ */}
          <FlowchartBox
            title={isEn ? 'Flow C — Admin: Review & finalize' : 'Flow C — Admin: ตรวจและปิดเคส'}
            subtitle={isEn ? 'How admin handles every incoming claim' : 'วิธี admin จัดการใบเบิกที่เข้ามา'}
            color="purple"
          >
            <FlowNode variant="start" emoji="🔔" title={isEn ? 'New claim notification (pending)' : 'แจ้งเตือน: ใบเบิกใหม่ (pending)'} />
            <FlowArrow />
            <FlowNode variant="admin" emoji="📖" title={isEn ? 'Open claim detail' : 'เปิดดูใบเบิก'} subtitle="/finance/{id}" />
            <FlowArrow />
            <FlowNode variant="admin" emoji="🔍" title={isEn ? 'Review: receipt, amount, category, claimant' : 'ตรวจ: ใบเสร็จ / ยอด / หมวดหมู่ / ผู้เบิก'} />
            <FlowArrow />
            <FlowNode variant="decision" emoji="⚖️" title={isEn ? 'Decision — 4 options' : 'ตัดสิน — 4 ทางเลือก'} />

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <FlowLane label={isEn ? 'A. Approve' : 'A. อนุมัติ'} color="emerald">
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Click "Approve"' : 'กด "อนุมัติ"'} tag="→ approved" />
              </FlowLane>

              <FlowLane label={isEn ? 'B. Request invoice' : 'B. ขอใบกำกับ'} color="sky">
                <FlowNode variant="admin" compact emoji="🧾" title={isEn ? 'Wait for tax invoice' : 'ขอใบกำกับภาษี'} tag="→ waiting_tax_invoice" />
                <FlowArrow label={isEn ? 'user uploads → auto' : 'user upload → auto'} />
                <FlowNode variant="success" compact emoji="✅" title="approved" />
              </FlowLane>

              <FlowLane label={isEn ? 'C. Month-end' : 'C. สิ้นเดือน'} color="violet">
                <FlowNode variant="admin" compact emoji="📅" title={isEn ? 'Queue for month-end' : 'เข้าคิวสิ้นเดือน'} tag="→ pending_month_end" />
              </FlowLane>

              <FlowLane label={isEn ? 'D. Reject' : 'D. ปฏิเสธ'} color="red">
                <FlowNode variant="error" compact emoji="❌" title={isEn ? 'Reject with reason' : 'ปฏิเสธ + ใส่เหตุผล'} tag="→ rejected (end)" />
              </FlowLane>
            </div>

            <FlowArrow label={isEn ? 'paths A / B / C continue below' : 'ทางเลือก A / B / C ต่อด้านล่าง'} />
            <FlowNode variant="admin" emoji="💵" title={isEn ? 'Pay out → click "Paid"' : 'จ่ายเงิน → กด "ชำระแล้ว"'} tag="→ paid" />
            <FlowArrow />
            <FlowNode variant="decision" emoji="🤔" title={isEn ? 'Claim type?' : 'ประเภทใบเบิก?'} />

            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              <FlowLane label={isEn ? 'Normal (event/other)' : 'ปกติ (event/other)'} color="emerald">
                <FlowNode variant="success" compact emoji="🏁" title={isEn ? 'Done — paid (terminal)' : 'จบ — paid (terminal)'} />
              </FlowLane>

              <FlowLane label={isEn ? 'Advance — wait for settle' : 'Advance — รอ user settle'} color="cyan">
                <FlowNode variant="admin" compact emoji="⏳" title={isEn ? 'Wait for user to settle actual spend' : 'รอ user อัพเดทค่าใช้จ่ายจริง'} />
                <FlowArrow />
                <FlowNode variant="admin" compact emoji="📋" title={isEn ? 'Review line items + refund slip' : 'ตรวจรายการ + สลิปโอนคืน'} />
                <FlowArrow />
                <FlowNode variant="decision" compact emoji="💭" title={isEn ? 'Refund?' : 'มีเงินคืน?'} />
                <FlowArrow label={isEn ? 'yes, slip verified' : 'ใช่ ตรงกับสลิป'} />
                <FlowNode variant="admin" compact emoji="✅" title={isEn ? 'Click "Confirm received"' : 'กด "ยืนยันรับเงิน"'} />
                <FlowArrow />
                <FlowNode variant="success" compact emoji="💸" title="refund_confirmed" tag="terminal" />
              </FlowLane>
            </div>
          </FlowchartBox>

          {/* Tips */}
          <div className="flex items-start gap-2.5 p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
            <span className="text-lg leading-none">💡</span>
            <div className="text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">{isEn ? 'Tips' : 'เคล็ดลับ'}</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800 dark:text-amber-300">
                <li>{isEn ? 'Admin can "Override status" anytime with a reason — useful for corrections.' : 'Admin กด "Override status" เปลี่ยน status ได้ทุกช่อง (ต้องใส่เหตุผล) — ใช้แก้ไขกรณีพิเศษ'}</li>
                <li>{isEn ? 'Advance claims: save update multiple times — each save is logged.' : 'เบิกทดลองจ่าย: กดบันทึกได้หลายครั้ง — ทุกครั้งถูกบันทึกใน log'}</li>
                <li>{isEn ? 'After refund_confirmed, editing is locked — need admin override to unlock.' : 'หลัง refund_confirmed แก้ไขไม่ได้ — ต้อง admin override ก่อน'}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── 3 claim types ───────────────────────────────────────── */}
        <div id="finance-types" className="scroll-mt-6">
          <SectionHeader
            icon={<ListChecks className="h-4 w-4" />}
            title={isEn ? 'Claim types (3 kinds)' : 'ประเภทใบเบิก (3 แบบ)'}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TypeCard
              emoji="📅"
              title={isEn ? 'Event Claim' : 'เบิกงานอีเวนต์'}
              subtitle="event"
              desc={isEn ? 'Expenses linked to a client job/event.' : 'เบิกค่าใช้จ่ายที่เกิดจากงานลูกค้า (ผูกกับ job event)'}
              receipt={isEn ? 'Required' : 'ต้องแนบใบเสร็จ'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="📝"
              title={isEn ? 'Other Claim' : 'เบิกค่าอื่นๆ'}
              subtitle="other"
              desc={isEn ? 'General expenses not tied to a specific job.' : 'เบิกค่าใช้จ่ายทั่วไป ไม่ผูกกับ job'}
              receipt={isEn ? 'Required' : 'ต้องแนบใบเสร็จ'}
              receiptColor="amber"
            />
            <TypeCard
              emoji="💰"
              title={isEn ? 'Advance Payment' : 'เบิกทดลองจ่าย'}
              subtitle="advance"
              desc={isEn ? 'Get money upfront, settle actual spend later.' : 'ขอเงินล่วงหน้าก่อนไปทำงาน แล้วเคลียร์ทีหลัง'}
              receipt={isEn ? 'Not required yet' : 'ไม่ต้องแนบใบเสร็จ (ยังไม่มี)'}
              receiptColor="emerald"
            />
          </div>
        </div>

        {/* ── Normal flow (event / other) ─────────────────────────── */}
        <div id="finance-normal" className="scroll-mt-6">
          <SectionHeader
            icon={<Send className="h-4 w-4" />}
            title={isEn ? 'Normal flow — Event / Other' : 'Flow ปกติ — งานอีเวนต์ / ค่าอื่นๆ'}
            color="emerald"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* User column */}
            <RoleCard
              role="user"
              title={isEn ? 'User (Claimant)' : 'User (ผู้เบิก)'}
              steps={isEn ? [
                { n: 1, label: 'Create claim at /finance/new', tag: 'draft' },
                { n: 2, label: 'Fill in category, amount, VAT/WHT, attach receipt, bank info', tag: null },
                { n: 3, label: 'Click "Submit for approval"', tag: 'draft → pending' },
                { n: 4, label: 'While waiting, can still cancel', tag: 'pending → cancelled' },
                { n: 5, label: 'If admin requests tax invoice → upload it', tag: 'waiting_tax_invoice → approved (auto)' },
                { n: 6, label: 'If rejected → see reason, create new claim (old one is locked)', tag: null },
              ] : [
                { n: 1, label: 'สร้างใบเบิกที่ /finance/new', tag: 'draft' },
                { n: 2, label: 'กรอก: หัวข้อ, หมวดหมู่, ยอด, VAT/WHT, แนบใบเสร็จ, เลขบัญชี', tag: null },
                { n: 3, label: 'กด "ส่งอนุมัติ"', tag: 'draft → pending' },
                { n: 4, label: 'ระหว่างรอ — ยกเลิกได้', tag: 'pending → cancelled' },
                { n: 5, label: 'ถ้า admin ขอใบกำกับภาษี → upload', tag: 'waiting_tax_invoice → approved (auto)' },
                { n: 6, label: 'ถ้าถูกปฏิเสธ → ดูเหตุผล + สร้างใบใหม่ (แก้ใบเก่าไม่ได้)', tag: null },
              ]}
            />

            {/* Admin column */}
            <RoleCard
              role="admin"
              title={isEn ? 'Admin' : 'Admin'}
              steps={isEn ? [
                { n: 1, label: 'Review pending claims in queue', tag: null },
                { n: 2, label: 'Approve directly', tag: 'pending → approved' },
                { n: 3, label: 'Or: request tax invoice first', tag: 'pending → waiting_tax_invoice' },
                { n: 4, label: 'Or: queue for month-end payout', tag: 'pending → pending_month_end' },
                { n: 5, label: 'Or: reject (with reason)', tag: 'pending → rejected' },
                { n: 6, label: 'After payout → mark "Paid"', tag: '→ paid (terminal)' },
                { n: 7, label: 'Override any status with reason (admin-only)', tag: 'any → any' },
              ] : [
                { n: 1, label: 'รับใบเบิกในคิว "รออนุมัติ"', tag: null },
                { n: 2, label: 'อนุมัติเลย', tag: 'pending → approved' },
                { n: 3, label: 'หรือ: ขอใบกำกับภาษีก่อน', tag: 'pending → waiting_tax_invoice' },
                { n: 4, label: 'หรือ: เข้าคิวจ่ายสิ้นเดือน', tag: 'pending → pending_month_end' },
                { n: 5, label: 'หรือ: ปฏิเสธ (ใส่เหตุผล)', tag: 'pending → rejected' },
                { n: 6, label: 'หลังจ่ายเงินออก → กด "ชำระแล้ว"', tag: '→ paid (terminal)' },
                { n: 7, label: 'Override สถานะได้ทุกช่อง (พร้อมเหตุผล)', tag: 'any → any' },
              ]}
            />
          </div>
        </div>

        {/* ── Advance flow ───────────────────────────────────────── */}
        <div id="finance-advance" className="scroll-mt-6">
          <SectionHeader
            icon={<Wallet className="h-4 w-4" />}
            title={isEn ? 'Advance flow — 2 phases' : 'Flow เบิกทดลองจ่าย — 2 ช่วง'}
            color="amber"
          />

          {/* Phase 1 */}
          <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500 text-white text-xs font-bold">1</span>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {isEn ? 'Phase 1 — Get the advance' : 'ช่วง 1 — เบิกเงินล่วงหน้า'}
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniCard
                role="user"
                lines={isEn ? [
                  '1. Create claim, select type "Advance"',
                  '2. Enter advance amount requested',
                  '3. Submit — NO receipt needed yet',
                ] : [
                  '1. สร้างใบเบิก เลือกประเภท "เบิกทดลองจ่าย"',
                  '2. ใส่ยอดที่ขอเบิกล่วงหน้า',
                  '3. ส่งอนุมัติ — ไม่ต้องแนบใบเสร็จ',
                ]}
              />
              <MiniCard
                role="admin"
                lines={isEn ? [
                  '1. Review + approve',
                  '2. Transfer advance to user',
                  '3. Mark "Paid" (status: paid)',
                ] : [
                  '1. ตรวจ + อนุมัติ',
                  '2. โอนเงินล่วงหน้าให้ user',
                  '3. กด "ชำระแล้ว" (status: paid)',
                ]}
              />
            </div>
          </div>

          {/* Phase 2 */}
          <div className="rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/40 dark:bg-cyan-950/10 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-cyan-600 text-white text-xs font-bold">2</span>
              <h4 className="text-sm font-bold text-cyan-900 dark:text-cyan-200">
                {isEn ? 'Phase 2 — Settle actual spend + refund' : 'ช่วง 2 — เคลียร์ค่าใช้จ่ายจริง + คืนเงิน'}
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <MiniCard
                role="user"
                lines={isEn ? [
                  '1. Open claim → "Update actual spend" box',
                  '2. Add line items (fuel, meals, etc.) — quick-add presets available',
                  '3. Attach receipts',
                  '4. System auto-calculates refund',
                  '5. If refund > 0 → transfer back + attach refund slip',
                  '6. Click "Save update" (can save multiple times — each saves to log)',
                  `7. ${isEn ? 'After save, items are locked — click ✏️ edit to modify' : 'หลังบันทึก — ข้อมูลถูกล็อก ต้องกด ✏️ แก้ไขก่อน'}`,
                ] : [
                  '1. เปิดใบเบิกเดิม → กล่อง "อัพเดทค่าใช้จ่ายจริง"',
                  '2. เพิ่มรายการทีละรายการ (ค่าน้ำมัน, อาหาร, ฯลฯ) — มี quick-add preset',
                  '3. แนบสลิป/ใบเสร็จ',
                  '4. ระบบคำนวณเงินคืนอัตโนมัติ',
                  '5. ถ้ามีเงินคืน → โอนคืนบริษัท + แนบสลิปโอนคืน',
                  '6. กด "บันทึกการอัพเดท" (บันทึกได้หลายครั้ง — log เก็บทุกครั้ง)',
                  '7. หลังบันทึก — รายการถูกล็อก ต้องกดไอคอน ✏️ ก่อนแก้ไข',
                ]}
              />
              <MiniCard
                role="admin"
                lines={isEn ? [
                  '1. Review line items + receipts + refund slip',
                  '2. Verify refund was actually received in company account',
                  '3. If refund > 0 → click "Confirm Received"',
                  '4. Status → refund_confirmed (TERMINAL, permanently locked)',
                  '5. If no refund (used all) → stays "paid" as usual',
                ] : [
                  '1. ตรวจรายการ + ใบเสร็จ + สลิปโอนคืน',
                  '2. เช็คว่าได้รับเงินคืนในบัญชีบริษัทจริง',
                  '3. ถ้า refund > 0 → กดปุ่ม "ยืนยันรับเงิน"',
                  '4. Status → refund_confirmed (TERMINAL, ล็อกถาวร)',
                  '5. ถ้าไม่มีเงินคืน (ใช้หมด) → อยู่ paid ต่อไปตามปกติ',
                ]}
              />
            </div>
          </div>
        </div>

        {/* ── Status reference ────────────────────────────────────── */}
        <div id="finance-status" className="scroll-mt-6">
          <SectionHeader
            icon={<Layout className="h-4 w-4" />}
            title={isEn ? 'All statuses' : 'สถานะทั้งหมด'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Status' : 'สถานะ'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Meaning' : 'ความหมาย'}</th>
                  <th className="px-3 py-2.5 text-left font-semibold hidden sm:table-cell">{isEn ? 'Terminal?' : 'ปลายทาง?'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <StatusRow emoji="📝" color="#6b7280" label={isEn ? 'draft' : 'แบบร่าง'} code="draft" meaning={isEn ? 'Not yet submitted' : 'ยังไม่ส่ง'} />
                <StatusRow emoji="⏳" color="#f59e0b" label={isEn ? 'pending' : 'รออนุมัติ'} code="pending" meaning={isEn ? 'Awaiting admin review' : 'รอ admin ตรวจ'} />
                <StatusRow emoji="✅" color="#22c55e" label={isEn ? 'approved' : 'อนุมัติแล้ว'} code="approved" meaning={isEn ? 'Approved, awaiting payout' : 'อนุมัติแล้ว รอจ่าย'} />
                <StatusRow emoji="🧾" color="#0ea5e9" label={isEn ? 'waiting_tax_invoice' : 'รอใบกำกับภาษี'} code="waiting_tax_invoice" meaning={isEn ? 'Waiting for tax invoice upload' : 'รอ user แนบใบกำกับภาษี'} />
                <StatusRow emoji="📅" color="#8b5cf6" label={isEn ? 'pending_month_end' : 'รอจ่ายสิ้นเดือน'} code="pending_month_end" meaning={isEn ? 'Queued for month-end payout' : 'รวมจ่ายสิ้นเดือน'} />
                <StatusRow emoji="💵" color="#14b8a6" label={isEn ? 'paid' : 'ชำระเงินแล้ว'} code="paid" meaning={isEn ? 'Payout complete' : 'จ่ายเงินออกแล้ว'} terminal />
                <StatusRow emoji="💸" color="#0891b2" label={isEn ? 'refund_confirmed' : 'คืนเงินบริษัทแล้ว'} code="refund_confirmed" meaning={isEn ? 'Refund confirmed (advance only)' : 'ยืนยันรับเงินคืน (advance only)'} terminal />
                <StatusRow emoji="❌" color="#ef4444" label={isEn ? 'rejected' : 'ปฏิเสธ'} code="rejected" meaning={isEn ? 'Rejected with reason' : 'ปฏิเสธ (มีเหตุผล)'} terminal />
                <StatusRow emoji="🚫" color="#94a3b8" label={isEn ? 'cancelled' : 'ยกเลิก'} code="cancelled" meaning={isEn ? 'Cancelled by user' : 'user ยกเลิก'} terminal />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Permissions ─────────────────────────────────────────── */}
        <div id="finance-permissions" className="scroll-mt-6">
          <SectionHeader
            icon={<ShieldAlert className="h-4 w-4" />}
            title={isEn ? 'Permissions' : 'สิทธิ์การใช้งาน'}
          />
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">{isEn ? 'Action' : 'การกระทำ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Owner' : 'เจ้าของ'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Other user' : 'user อื่น'}</th>
                  <th className="px-3 py-2.5 text-center font-semibold">{isEn ? 'Admin' : 'Admin'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 text-sm">
                <PermissionRow label={isEn ? 'Create claim' : 'สร้างใบเบิก'}      owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Edit claim' : 'แก้ใบเบิก'}           owner="partial" other="no" admin="yes" ownerNote={isEn ? 'only draft/pending' : 'เฉพาะ draft/pending'} adminNote={isEn ? 'anytime' : 'แก้ได้ตลอด'} />
                <PermissionRow label={isEn ? 'Submit for approval' : 'ส่งอนุมัติ'}   owner="yes" other="—"   admin="—" />
                <PermissionRow label={isEn ? 'Cancel' : 'ยกเลิก'}                   owner="partial" other="no" admin="—" ownerNote={isEn ? 'only draft/pending' : 'เฉพาะ draft/pending'} />
                <PermissionRow label={isEn ? 'Approve / reject' : 'อนุมัติ/ปฏิเสธ'}  owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Mark as paid' : 'กดชำระเงิน'}        owner="no"  other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Override status' : 'Override status'} owner="no"  other="no" admin="yes" adminNote={isEn ? 'with reason' : 'ต้องใส่เหตุผล'} />
                <PermissionRow label={isEn ? 'Settle advance' : 'อัพเดทค่าใช้จ่ายจริง (advance)'} owner="yes" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'Confirm refund received' : 'ยืนยันรับเงินคืน (advance)'} owner="no" other="no" admin="yes" />
                <PermissionRow label={isEn ? 'View other users\' claims' : 'ดูใบเบิกคนอื่น'} owner="—" other="no" admin="yes" />
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Notifications ──────────────────────────────────────── */}
        <div id="finance-notifications" className="scroll-mt-6">
          <SectionHeader
            icon={<Bell className="h-4 w-4" />}
            title={isEn ? 'Notifications the system sends' : 'การแจ้งเตือนที่ระบบส่ง'}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <NotifRow emoji="✅" code="expense_approved" labelTh="ใบเบิกถูกอนุมัติ" labelEn="Claim approved" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="❌" code="expense_rejected" labelTh="ใบเบิกถูกปฏิเสธ" labelEn="Claim rejected" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="🧾" code="expense_waiting_tax_invoice" labelTh="ต้องแนบใบกำกับภาษี" labelEn="Tax invoice required" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
            <NotifRow emoji="📤" code="expense_tax_invoice_uploaded" labelTh="แนบใบกำกับภาษีแล้ว" labelEn="Tax invoice uploaded" toTh="Admin" toEn="Admin" isEn={isEn} />
            <NotifRow emoji="💸" code="expense_refund_confirmed" labelTh="ยืนยันรับเงินคืนแล้ว" labelEn="Refund confirmed" toTh="เจ้าของใบเบิก" toEn="Claimant" isEn={isEn} />
          </div>
        </div>

        {/* ── Menu shortcuts ─────────────────────────────────────── */}
        <div id="finance-menu" className="scroll-mt-6">
          <SectionHeader
            icon={<ExternalLink className="h-4 w-4" />}
            title={isEn ? 'Menu shortcuts' : 'เมนูทั้งหมด'}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <MenuLink href="/finance"           labelEn="All claims + stats"    labelTh="รายการใบเบิก + สถิติ" />
            <MenuLink href="/finance/new"        labelEn="Create new claim"     labelTh="สร้างใบเบิกใหม่" />
            <MenuLink href="/finance/payouts"    labelEn="Payout queue (admin)" labelTh="คิวรอจ่ายเงิน (admin)" />
            <MenuLink href="/finance/archive"    labelEn="Archive (closed)"     labelTh="คลังใบเบิกปิดเคส" />
            <MenuLink href="/finance/overview"   labelEn="Monthly stats"        labelTh="สถิติรายเดือน" />
            <MenuLink href="/finance/download"   labelEn="Export Excel/CSV"     labelTh="Export Excel/CSV" />
            <MenuLink href="/finance/settings"   labelEn="Category settings (admin)" labelTh="ตั้งค่าหมวดหมู่ (admin)" />
          </div>
        </div>

      </section>

      {/* ── Footer note ────────────────────────────────────────────── */}
      <p className="text-xs text-zinc-400 text-center pt-4">
        {isEn
          ? 'More guides for other modules coming soon.'
          : 'คู่มือโมดูลอื่นกำลังจะตามมา'}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  color = 'zinc',
}: {
  icon: React.ReactNode
  title: string
  color?: 'zinc' | 'emerald' | 'amber'
}) {
  const colorMap = {
    zinc:    'text-zinc-500',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber:   'text-amber-600 dark:text-amber-400',
  } as const
  return (
    <h3 className={`flex items-center gap-2 text-sm font-semibold mb-3 ${colorMap[color]}`}>
      {icon}
      {title}
    </h3>
  )
}

function TypeCard({
  emoji, title, subtitle, desc, receipt, receiptColor,
}: {
  emoji: string; title: string; subtitle: string; desc: string; receipt: string; receiptColor: 'amber' | 'emerald'
}) {
  const colorMap = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
  }
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{emoji}</span>
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{title}</p>
          <code className="text-[10px] text-zinc-400 font-mono">{subtitle}</code>
        </div>
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3 leading-relaxed">{desc}</p>
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border ${colorMap[receiptColor]}`}>
        <Receipt className="h-3 w-3" />
        {receipt}
      </span>
    </div>
  )
}

function RoleCard({
  role, title, steps,
}: {
  role: 'user' | 'admin'
  title: string
  steps: { n: number; label: string; tag: string | null }[]
}) {
  const isAdmin = role === 'admin'
  const accent = isAdmin
    ? 'border-purple-200 bg-purple-50/40 dark:border-purple-900 dark:bg-purple-950/10'
    : 'border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/10'
  const iconColor = isAdmin ? 'text-purple-600 dark:text-purple-400' : 'text-sky-600 dark:text-sky-400'
  const badgeColor = isAdmin ? 'bg-purple-600' : 'bg-sky-600'
  const Icon = isAdmin ? UserCog : User

  return (
    <div className={`rounded-xl border ${accent} p-4`}>
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-200/60 dark:border-zinc-700/60">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{title}</h4>
      </div>
      <ol className="space-y-2.5">
        {steps.map(s => (
          <li key={s.n} className="flex items-start gap-2.5 text-xs">
            <span className={`flex items-center justify-center h-5 w-5 rounded-full ${badgeColor} text-white font-bold text-[10px] shrink-0 mt-0.5`}>
              {s.n}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{s.label}</p>
              {s.tag && (
                <code className="inline-block mt-1 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded">
                  {s.tag}
                </code>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function MiniCard({ role, lines }: { role: 'user' | 'admin'; lines: string[] }) {
  const isAdmin = role === 'admin'
  const Icon = isAdmin ? UserCog : User
  const iconColor = isAdmin ? 'text-purple-500' : 'text-sky-500'
  return (
    <div className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          {isAdmin ? 'Admin' : 'User'}
        </p>
      </div>
      <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

function StatusRow({
  emoji, color, label, code, meaning, terminal = false,
}: { emoji: string; color: string; label: string; code: string; meaning: string; terminal?: boolean }) {
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2 align-top">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-base">{emoji}</span>
          <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full text-white" style={{ backgroundColor: color }}>
            {label}
          </span>
        </span>
        <code className="block mt-1 text-[10px] font-mono text-zinc-400">{code}</code>
      </td>
      <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 align-top">{meaning}</td>
      <td className="px-3 py-2 align-top hidden sm:table-cell">
        {terminal && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400">
            <Lock className="h-2.5 w-2.5" />
            Terminal
          </span>
        )}
      </td>
    </tr>
  )
}

function PermissionRow({
  label, owner, other, admin, ownerNote, adminNote,
}: {
  label: string
  owner: 'yes' | 'no' | 'partial' | '—'
  other: 'yes' | 'no' | '—'
  admin: 'yes' | 'no' | '—'
  ownerNote?: string
  adminNote?: string
}) {
  const badge = (v: string) => {
    if (v === 'yes') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-[11px]">✓</span>
    if (v === 'no') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400 text-[11px]">✗</span>
    if (v === 'partial') return <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 text-[11px]">△</span>
    return <span className="text-zinc-300 text-xs">—</span>
  }
  return (
    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{label}</td>
      <td className="px-3 py-2 text-center">
        {badge(owner)}
        {ownerNote && <p className="text-[10px] text-zinc-400 mt-0.5">{ownerNote}</p>}
      </td>
      <td className="px-3 py-2 text-center">{badge(other)}</td>
      <td className="px-3 py-2 text-center">
        {badge(admin)}
        {adminNote && <p className="text-[10px] text-zinc-400 mt-0.5">{adminNote}</p>}
      </td>
    </tr>
  )
}

function NotifRow({
  emoji, code, labelTh, labelEn, toTh, toEn, isEn,
}: { emoji: string; code: string; labelTh: string; labelEn: string; toTh: string; toEn: string; isEn: boolean }) {
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <span className="text-lg leading-none mt-0.5">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{isEn ? labelEn : labelTh}</p>
        <code className="text-[10px] font-mono text-zinc-400">{code}</code>
        <p className="text-[10px] text-zinc-500 mt-0.5">
          <ArrowRight className="inline h-2.5 w-2.5" /> {isEn ? toEn : toTh}
        </p>
      </div>
    </div>
  )
}

function MenuLink({ href, labelTh, labelEn }: { href: string; labelTh: string; labelEn: string }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-emerald-300 dark:hover:border-emerald-800 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10 transition-colors group"
    >
      <div className="min-w-0">
        <code className="text-[10px] font-mono text-zinc-400">{href}</code>
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
          {isEn ? labelEn : labelTh}
        </p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-zinc-400 group-hover:text-emerald-500 shrink-0 transition-colors" />
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Flowchart primitives
// ─────────────────────────────────────────────────────────────────────

type FlowVariant = 'start' | 'user' | 'admin' | 'decision' | 'success' | 'error' | 'terminal'

const flowVariantStyles: Record<FlowVariant, string> = {
  start:    'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200',
  user:     'bg-sky-50 dark:bg-sky-950/20 border-sky-300 dark:border-sky-800 text-sky-900 dark:text-sky-200',
  admin:    'bg-purple-50 dark:bg-purple-950/20 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200',
  decision: 'bg-amber-50 dark:bg-amber-950/20 border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200 border-dashed',
  success:  'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200',
  error:    'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-300',
  terminal: 'bg-zinc-100 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300',
}

function FlowchartBox({
  title, subtitle, color, children,
}: {
  title: string
  subtitle?: string
  color: 'sky' | 'amber' | 'purple'
  children: React.ReactNode
}) {
  const headerMap = {
    sky:    'bg-sky-600 text-white',
    amber:  'bg-amber-500 text-white',
    purple: 'bg-purple-600 text-white',
  }
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className={`px-4 py-2.5 ${headerMap[color]}`}>
        <p className="text-sm font-bold">{title}</p>
        {subtitle && <p className="text-[11px] opacity-90 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4 md:p-6 flex flex-col items-center">
        {children}
      </div>
    </div>
  )
}

function FlowNode({
  variant, emoji, title, subtitle, tag, compact = false,
}: {
  variant: FlowVariant
  emoji?: string
  title: string
  subtitle?: string
  tag?: string
  compact?: boolean
}) {
  return (
    <div
      className={`
        ${compact ? 'w-full max-w-55' : 'min-w-60 max-w-90'}
        px-3 py-2.5 rounded-lg border-2 shadow-sm
        flex items-start gap-2
        ${flowVariantStyles[variant]}
      `}
    >
      {emoji && <span className="text-base leading-none mt-0.5 shrink-0">{emoji}</span>}
      <div className="min-w-0 flex-1">
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold leading-snug`}>{title}</p>
        {subtitle && (
          <p className={`${compact ? 'text-[9px]' : 'text-[10px]'} opacity-75 mt-0.5 leading-snug`}>{subtitle}</p>
        )}
        {tag && (
          <code className="inline-block mt-1 px-1.5 py-0.5 text-[9px] font-mono bg-white/60 dark:bg-black/30 rounded">
            {tag}
          </code>
        )}
      </div>
    </div>
  )
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center my-1.5">
      <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-600" />
      <ChevronDown className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 -mt-0.5" />
      {label && (
        <span className="mt-0.5 text-[10px] italic text-zinc-500 dark:text-zinc-400 text-center max-w-60">
          {label}
        </span>
      )}
    </div>
  )
}

function FlowLane({
  label, color, children,
}: {
  label: string
  color: 'emerald' | 'sky' | 'violet' | 'red' | 'cyan' | 'zinc'
  children: React.ReactNode
}) {
  const colorMap = {
    emerald: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/10',
    sky:     'border-sky-300 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/10',
    violet:  'border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/10',
    red:     'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/10',
    cyan:    'border-cyan-300 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/10',
    zinc:    'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40',
  }
  const pillMap = {
    emerald: 'bg-emerald-600',
    sky:     'bg-sky-600',
    violet:  'bg-violet-600',
    red:     'bg-red-600',
    cyan:    'bg-cyan-600',
    zinc:    'bg-zinc-600',
  }
  return (
    <div className={`relative rounded-lg border-2 border-dashed ${colorMap[color]} p-3 pt-5 flex flex-col items-center`}>
      <span className={`absolute -top-2.5 left-3 px-2 py-0.5 text-[10px] font-semibold text-white rounded-full ${pillMap[color]}`}>
        {label}
      </span>
      {children}
    </div>
  )
}

function LegendDot({ variant, label }: { variant: FlowVariant; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${flowVariantStyles[variant]}`} />
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
    </span>
  )
}
