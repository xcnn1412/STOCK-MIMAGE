import Sidebar from '@/components/sidebar'
import KpiLocaleWrapper from '@/components/kpi-locale-wrapper'
import SessionTimeout from '@/components/session-timeout'
import ProfileCompletionChecker from '@/components/profile-completion-checker'
import NotificationBell from '@/components/notification-bell'
import NotificationToastContainer from '@/components/notification-toast'
import LicenseBanner from '@/components/license-banner'
import { getLicenseStatus } from '@/lib/license'
import { getSessionLight } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { getOutstandingClaims } from './finance/outstanding-data'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * ตัวเลขบนเมนู "รออนุมัติ" ของเอกสาร — เฉพาะ admin
 * ponytail: นับสดด้วย head-count ตรงนี้ (ไม่เรียก server action ที่ต้อง requireAuth +
 * query profiles ซ้ำ) และ try/catch ไว้เผื่อ instance ที่ยังไม่ได้รัน migration (ไม่มีตาราง = ไม่มี badge)
 */
async function pendingDocumentCount(supabase: ServiceClient): Promise<number> {
  try {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval')
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // รอบที่ 1: ตรวจ session (บทบาทมาจากฐานข้อมูล)
  const { userId, role: sessionRole } = await getSessionLight()

  // Fetch role, modules, and profile completeness from DB (single query)
  let role: string | undefined
  let allowedModules = ['stock']
  let missingFields: string[] = []
  let pendingDocuments = 0
  let outstandingCount = 0

  if (userId) {
    const supabase = createServiceClient()
    // รอบที่ 2: โปรไฟล์ + ตัวเลข "รออนุมัติ" ของ admin พร้อมกัน (scripts/layout-requests.check.ts ตรวจว่า ≤ 2 รอบ)
    // ponytail: ใบค้างเคลียร์อ่านพร้อมโปรไฟล์ (ยังไม่รู้ allowed_modules) แล้วค่อยตัดสินว่าโชว์ badge ไหมด้านล่าง — ไม่เพิ่มรอบ
    const [{ data: profile }, docCount, outstanding] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, allowed_modules, full_name, nickname, national_id, address, bank_name, bank_account_number, account_holder_name')
        .eq('id', userId)
        .single(),
      sessionRole === 'admin' ? pendingDocumentCount(supabase) : Promise.resolve(0),
      getOutstandingClaims(userId, sessionRole === 'admin'),
    ])
    pendingDocuments = docCount
    outstandingCount = outstanding.length

    const p = profile as Record<string, unknown> | null
    role = p?.role as string | undefined
    const modules = p?.allowed_modules
    if (modules && Array.isArray(modules)) {
      allowedModules = modules as string[]
    }

    // Check profile completeness
    if (p) {
      const checks: [string, boolean][] = [
        ['full_name', !!p.full_name],
        ['nickname', !!p.nickname],
        ['national_id', !!p.national_id && String(p.national_id).length === 13],
        ['address', !!p.address && String(p.address).length > 10],
        ['bank_name', !!p.bank_name],
        ['bank_account_number', !!p.bank_account_number],
        ['account_holder_name', !!p.account_holder_name],
      ]
      missingFields = checks.filter(([, ok]) => !ok).map(([k]) => k)
    }
  }

  // Admin always gets admin + overview + content module access
  if (role === 'admin') {
    if (!allowedModules.includes('admin')) {
      allowedModules = [...allowedModules, 'admin']
    }
    if (!allowedModules.includes('overview')) {
      allowedModules = [...allowedModules, 'overview']
    }
    if (!allowedModules.includes('content')) {
      allowedModules = [...allowedModules, 'content']
    }
    // admin ต้องเข้าโมดูลเอกสารได้เสมอ — หน้ารออนุมัติ/ตั้งค่า/รายงานเป็นของ admin เท่านั้น
    if (!allowedModules.includes('documents')) {
      allowedModules = [...allowedModules, 'documents']
    }
    // admin ต้องเข้าโมดูลเงินเดือนได้เสมอ — หน้างวดคำนวณ/ตั้งค่าเป็นของ admin เท่านั้น
    if (!allowedModules.includes('salary')) {
      allowedModules = [...allowedModules, 'salary']
    }
  }

  // ตัวเลขบนเมนู "รออนุมัติ" — เฉพาะ admin
  const badges: Record<string, number> = {}
  if (role === 'admin' && pendingDocuments > 0) badges['/documents/approvals'] = pendingDocuments
  // ใบเบิกค้างเคลียร์: แอดมิน = ทั้งระบบ · คนอื่น = ของตัวเอง — เฉพาะคนที่เห็นเมนูใบเบิก
  if ((role === 'admin' || allowedModules.includes('finance')) && outstandingCount > 0) badges['/finance'] = outstandingCount

  const license = getLicenseStatus()
  const licenseExpiresAt = license.expiresAt ? license.expiresAt.toISOString() : null

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 w-full flex" suppressHydrationWarning>
      <Sidebar role={role} allowedModules={allowedModules} licenseExpiresAt={licenseExpiresAt} badges={badges} />
      <SessionTimeout />
      {/* Notification Bell — ตัวเดียวของทั้งหน้า: จอใหญ่มุมขวาบน · มือถือวางทับช่องว่าง w-9 ที่ sidebar เว้นไว้ในแถบบน
          (ข้างปุ่มภาษา: ขอบขวา px-4 + ปุ่มเมนู w-10 + gap + ปุ่มภาษา w-12 + gap = 7rem) · ลิ้นชักเมนูมือถือ (z-60/70) ทับกระดิ่ง */}
      <div className="fixed z-55 top-2.5 right-28 md:top-3 md:right-4">
        <NotificationBell />
      </div>
      {/* Toast Pop-up — desktop only */}
      <NotificationToastContainer />
      <div className="flex-1 flex flex-col min-h-screen min-w-0 pt-14 md:pt-0">
        <main className="flex-1 p-4 md:p-6 w-full">
          <LicenseBanner />
          <ProfileCompletionChecker missingFields={missingFields} />
          <KpiLocaleWrapper>
            {children}
          </KpiLocaleWrapper>
        </main>
      </div>
    </div>
  )
}

