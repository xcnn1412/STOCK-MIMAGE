'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import JsBarcode from 'jsbarcode'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface BarcodeItem { id: string; name: string; code: string | null; serial_number: string | null }

/** ขนาดสติกเกอร์ (มม.) — เล็กสำหรับของชิ้นเล็ก · ใหญ่อ่านชื่อได้ไกล */
const SIZES = {
  s: { label: 'เล็ก 40×20 มม.', w: 40, h: 20, bar: 28, font: 7 },
  m: { label: 'กลาง 50×25 มม.', w: 50, h: 25, bar: 36, font: 8 },
  l: { label: 'ใหญ่ 70×35 มม.', w: 70, h: 35, bar: 52, font: 10 },
} as const
type SizeKey = keyof typeof SIZES

function Barcode({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    // Code 128 อ่านได้ด้วยเครื่องสแกน 1D ทั่วไป · ไม่พิมพ์ตัวเลขใต้แท่งจาก lib (พิมพ์เองด้วยฟอนต์ของหน้า)
    JsBarcode(ref.current, value, { format: 'CODE128', displayValue: false, height, width: 1.4, margin: 0 })
  }, [value, height])
  return <svg ref={ref} className="max-w-full" />
}

export default function BarcodePrintView({ items }: { items: BarcodeItem[] }) {
  const [size, setSize] = useState<SizeKey>('m')
  const [copies, setCopies] = useState(1)
  const sz = SIZES[size]
  const printable = items.filter(i => i.code)

  return (
    <div className="min-h-screen bg-zinc-100 p-4">
      {/* พิมพ์เฉพาะแผ่นสติกเกอร์ ซ่อน sidebar/ปุ่ม */}
      <style>{`
        @page { margin: 6mm; }
        @media print {
          body * { visibility: hidden; }
          #barcode-sheet, #barcode-sheet * { visibility: visible; }
          #barcode-sheet { position: absolute; left: 0; top: 0; margin: 0; box-shadow: none; }
        }
      `}</style>

      <div className="mx-auto max-w-5xl space-y-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/items"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> กลับ</Button></Link>
          <Select value={size} onValueChange={v => setSize(v as SizeKey)}>
            <SelectTrigger className="w-44" aria-label="ขนาดสติกเกอร์"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SIZES) as SizeKey[]).map(k => <SelectItem key={k} value={k}>{SIZES[k].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            ชิ้นละ
            <input
              type="number" min={1} max={20} value={copies}
              onChange={e => setCopies(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              className="h-9 w-16 rounded-md border px-2"
              aria-label="จำนวนสติกเกอร์ต่อชิ้น"
            />
            ดวง
          </label>
          <Button onClick={() => window.print()} disabled={printable.length === 0} className="ml-auto">
            <Printer className="mr-2 h-4 w-4" /> พิมพ์ {printable.length * copies} ดวง
          </Button>
        </div>
        {items.length !== printable.length && (
          <p className="text-sm text-amber-700">อุปกรณ์ {items.length - printable.length} ชิ้นยังไม่มีรหัส — รันคำสั่งเพิ่มรหัสในฐานข้อมูลก่อน</p>
        )}
        {items.length === 0 && <p className="text-sm text-zinc-500">ไม่มีอุปกรณ์ที่เลือก — กลับไปหน้าคลังอุปกรณ์แล้วกดปุ่มบาร์โค้ด</p>}
      </div>

      <div id="barcode-sheet" className="mx-auto mt-4 flex max-w-5xl flex-wrap gap-[2mm] bg-white p-[4mm] shadow print:mt-0">
        {printable.flatMap(item => Array.from({ length: copies }, (_, n) => (
          <div
            key={`${item.id}-${n}`}
            className="flex flex-col items-center justify-between overflow-hidden border border-dashed border-zinc-300 text-center text-black break-inside-avoid print:border-0"
            style={{ width: `${sz.w}mm`, height: `${sz.h}mm`, padding: '1mm' }}
          >
            <div className="w-full truncate font-medium leading-tight" style={{ fontSize: `${sz.font}pt` }} title={item.name}>{item.name}</div>
            <Barcode value={item.code!} height={sz.bar} />
            <div className="font-mono leading-none tracking-wider" style={{ fontSize: `${sz.font}pt` }}>{item.code}</div>
          </div>
        )))}
      </div>
    </div>
  )
}
