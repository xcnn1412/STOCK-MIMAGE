import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ Overview — Office Hub',
  description: 'แดชบอร์ดผู้บริหาร KPI · Top events · สรุปรายเดือน + AI ภาษาไทย',
}

export default function HowtoOverviewPage() {
  return <HowtoView view="overview" />
}
