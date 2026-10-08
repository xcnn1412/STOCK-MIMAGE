import { supabaseServer as supabase } from '@/lib/supabase-server'
import BarcodePrintView, { type BarcodeItem } from './print-view'

/**
 * พิมพ์บาร์โค้ดแท่ง (Code 128) จากรหัสอุปกรณ์ items.code — /items/print?ids=a,b,c
 * ponytail: รับ id ผ่าน query ได้ไม่เกิน 200 ชิ้นต่อครั้ง (พอสำหรับพิมพ์ทีละหน้าหรือทีละประเภท)
 */
export default async function ItemsPrintPage(props: { searchParams: Promise<{ ids?: string }> }) {
  const { ids = '' } = await props.searchParams
  const wanted = [...new Set(ids.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 200)
  const { data } = wanted.length
    ? await supabase.from('items').select('id, name, code, serial_number').in('id', wanted).order('name')
    : { data: [] }
  return <BarcodePrintView items={(data || []) as BarcodeItem[]} />
}
