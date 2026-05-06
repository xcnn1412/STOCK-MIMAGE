import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ Costs — Office Hub',
  description: 'บัญชีกำไร/ขาดทุนต่อ event — revenue + ต้นทุนรายหมวด · จับคู่ CRM · ผูกใบเบิก Finance',
}

export default function HowtoCostsPage() {
  return <HowtoView view="costs" />
}
