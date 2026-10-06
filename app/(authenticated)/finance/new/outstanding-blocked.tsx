'use client'

// หน้าสร้างใบเบิกตอนยังมีรายการค้างเคลียร์ — client เพราะภาษาอยู่ใน useLocale (localStorage)
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/context'
import { OutstandingAlert } from '../outstanding-alert'
import type { OutstandingClaim } from '../outstanding-data'

export default function OutstandingBlocked({ claims }: { claims: OutstandingClaim[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  return (
    <div className="space-y-4">
      <OutstandingAlert claims={claims} isEn={isEn} mode="block" />
      <Link href="/finance" className="inline-block text-sm font-medium text-emerald-700 underline underline-offset-2 hover:no-underline dark:text-emerald-300">
        {isEn ? 'Back to claims' : 'กลับไปหน้าใบเบิก'}
      </Link>
    </div>
  )
}
