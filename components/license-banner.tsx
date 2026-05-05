import { AlertTriangle } from 'lucide-react'
import { getLicenseStatus } from '@/lib/license'

const WARN_THRESHOLD_DAYS = 30
const CRITICAL_THRESHOLD_DAYS = 7

/**
 * Shown inside the authenticated layout when the license is within
 * WARN_THRESHOLD_DAYS of expiring. Switches to a red palette inside
 * CRITICAL_THRESHOLD_DAYS. When the license is already expired, middleware
 * has redirected the user out — this banner is purely the heads-up.
 */
export default function LicenseBanner() {
  const status = getLicenseStatus()

  if (!status.configured || status.expired) return null
  if (status.daysLeft === null || status.daysLeft > WARN_THRESHOLD_DAYS) return null

  const critical = status.daysLeft <= CRITICAL_THRESHOLD_DAYS
  const formatted = status.expiresAt
    ? status.expiresAt.toLocaleDateString('th-TH', { dateStyle: 'long' })
    : ''

  const palette = critical
    ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100'
    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'

  return (
    <div className={`mb-4 rounded-lg border px-4 py-3 flex items-start gap-3 ${palette}`}>
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed">
        <div className="font-semibold">License ใกล้หมดอายุ</div>
        <div className="opacity-90">
          เหลืออีก {status.daysLeft} วัน (หมดอายุ {formatted}) — กรุณาติดต่อผู้ดูแลระบบเพื่อต่ออายุการใช้งาน
        </div>
      </div>
    </div>
  )
}
