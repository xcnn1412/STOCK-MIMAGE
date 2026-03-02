'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, X, ChevronRight } from 'lucide-react'

interface ProfileCheckerProps {
  missingFields: string[]
}

const FIELD_LABELS: Record<string, string> = {
  full_name: 'ชื่อ-นามสกุล',
  nickname: 'ชื่อเล่น',
  national_id: 'เลขบัตรประชาชน',
  address: 'ที่อยู่',
  bank_name: 'ธนาคาร',
  bank_account_number: 'เลขบัญชี',
  account_holder_name: 'ชื่อบัญชี',
}

export default function ProfileCompletionChecker({ missingFields }: ProfileCheckerProps) {
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState(false)

  // Auto-dismiss on profile page
  const isOnProfile = pathname === '/profile'

  // Reset dismissed state when missingFields changes
  useEffect(() => {
    setDismissed(false)
  }, [missingFields.length])

  if (missingFields.length === 0 || dismissed || isOnProfile) return null

  return (
    <div className="bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-4 animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            ข้อมูลโปรไฟล์ยังไม่ครบ
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            กรุณาเข้าไปกรอกข้อมูลที่ขาดหายไป: {missingFields.map(f => FIELD_LABELS[f] || f).join(', ')}
          </p>
          <Link
            href="/profile"
            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors group"
          >
            ไปหน้าโปรไฟล์
            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded-lg text-amber-400 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
          title="ปิดแจ้งเตือน"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
