import { getClaims } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import FinanceDownloadView from './finance-download-view'
import type { ExpenseClaim } from '../../costs/types'

export const revalidate = 0

export const metadata = {
  title: 'ดาวน์โหลดรายงาน — Finance',
  description: 'ส่งออกข้อมูลใบเบิก .xlsx / .pdf สำหรับสำนักงานบัญชี',
}

export default async function DownloadPage() {
  const [{ data }, categories] = await Promise.all([
    getClaims(),
    getFinanceCategories(),
  ])

  return (
    <FinanceDownloadView
      claims={(data || []) as unknown as ExpenseClaim[]}
      categories={categories}
    />
  )
}
