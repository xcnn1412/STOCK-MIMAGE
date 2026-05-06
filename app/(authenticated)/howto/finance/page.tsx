import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ Finance — Office Hub',
  description: 'ระบบเบิกค่าใช้จ่าย ใบกำกับภาษี และรายงานตรวจสอบก่อนส่งบัญชี',
}

export default function HowtoFinancePage() {
  return <HowtoView view="finance" />
}
