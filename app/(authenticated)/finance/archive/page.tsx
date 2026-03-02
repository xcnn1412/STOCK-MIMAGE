import { getClaims } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import ArchiveList from './archive-list'
import type { ExpenseClaim } from '../../costs/types'

export const revalidate = 0

export const metadata = {
  title: 'คลังเก็บ — Finance',
  description: 'คลังเก็บใบเบิกที่ชำระเงินแล้ว',
}

export default async function ArchivePage() {
  const [{ data }, categories] = await Promise.all([
    getClaims({ status: 'paid' }),
    getFinanceCategories(),
  ])

  return (
    <ArchiveList
      claims={(data || []) as unknown as ExpenseClaim[]}
      categories={categories}
    />
  )
}
