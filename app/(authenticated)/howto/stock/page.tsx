import HowtoView from '../howto-view'

export const revalidate = 0

export const metadata = {
  title: 'คู่มือ Stock — Office Hub',
  description: 'คลังอุปกรณ์ — items · kits · templates · QR · stock dashboard · activity log',
}

export default function HowtoStockPage() {
  return <HowtoView view="stock" />
}
