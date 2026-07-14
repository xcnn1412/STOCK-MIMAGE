import { getPettyCashLedger } from '../actions'
import PettyCashLedger from './petty-cash-ledger'

export const revalidate = 0

export const metadata = {
  title: 'เงินสดย่อย — Finance',
  description: 'วงเงินสดย่อยรายเดือน (ตั้งต้น / เติมเงิน / รายจ่าย / คงเหลือ / คืนบริษัท)',
}

export default async function PettyCashPage() {
  const { funds } = await getPettyCashLedger()
  return <PettyCashLedger funds={funds as any} />
}
