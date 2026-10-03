'use client'

// แผ่นพิมพ์ QR ของทั้งห้อง — จัดป้ายลง A4 แนวตั้ง ตั้งขนาด QR ได้ (มม.)
// ทุกขนาดในแผ่นคิดเป็นหน่วย --u: ตอนพิมพ์ --u = 1mm (ขนาดจริง) · ตัวอย่างบนจอ --u ย่อตามความกว้างจอ
// ตอนพิมพ์: แผ่นจริงอยู่ใน portal ใต้ <body> แล้วซ่อนทุกอย่างที่เหลือ — ไม่ขึ้นกับโครง layout ของแอป

import { useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import QRCode from 'react-qr-code'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { A4, QR_SIZE, paginate, qrSheetLayout, type QrSheetLayout } from '../../../room-logic'

export interface QrLabel {
  id: string
  code: string
}

const PRESETS = [25, 40, 60, 90]

const PRINT_CSS = `
.qr-print-root { display: none; }
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(.qr-print-root) { display: none !important; }
  .qr-print-root { display: block !important; }
  .qr-print-root .qr-sheet { break-after: page; box-shadow: none !important; }
  .qr-print-root .qr-sheet:last-child { break-after: auto; }
}
`

/** n หน่วยของแผ่น (มม. ตอนพิมพ์) */
const u = (n: number) => `calc(var(--u) * ${n})`
const unit = (value: string) => ({ ['--u' as string]: value }) as CSSProperties

function Sheet({ labels, layout, roomName, origin }: { labels: QrLabel[]; layout: QrSheetLayout; roomName: string; origin: string }) {
  return (
    <div
      className="qr-sheet"
      style={{
        // สูง 296 (ไม่ใช่ 297) กันเศษปัดทำให้เกิดหน้าว่างต่อท้าย — ตารางป้ายคิดจาก 297 และชิดบนอยู่แล้ว
        width: u(A4.w),
        height: u(A4.h - 1),
        padding: u(layout.margin),
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: '#fff',
        color: '#000',
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.cols}, ${u(layout.labelW)})`,
        gridAutoRows: u(layout.labelH),
        gap: u(layout.gap),
        justifyContent: 'center',
        alignContent: 'start',
      }}
    >
      {labels.map(l => (
        <div
          key={l.id}
          style={{
            boxSizing: 'border-box',
            padding: u(layout.pad),
            border: `${u(0.2)} dashed #a1a1aa`, // เส้นประสำหรับตัด
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          <QRCode value={`${origin}/shelves/${l.id}`} size={256} style={{ width: u(layout.qr), height: u(layout.qr), flexShrink: 0 }} />
          <div
            style={{
              height: u(layout.textH),
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1.1,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: u(layout.textH * 0.5), fontWeight: 700, maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {l.code}
            </div>
            <div style={{ fontSize: u(layout.textH * 0.26), maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#52525b' }}>
              {roomName}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function QrSheetView({ roomId, roomName, labels, origin }: { roomId: string; roomName: string; labels: QrLabel[]; origin: string }) {
  // ช่องกรอกเก็บเป็นข้อความ (พิมพ์ค้างครึ่งทางได้) — ขนาดที่ใช้จริงผ่าน qrSheetLayout ซึ่งบีบเข้าช่วงให้
  const [size, setSize] = useState(String(QR_SIZE.default))
  const layout = qrSheetLayout(Number(size))
  const pages = paginate(labels, layout.perPage)
  // portal ใช้ได้เฉพาะในเบราว์เซอร์ (ไม่มีตอน SSR)
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false)

  return (
    <div className="space-y-4 pb-20">
      <style>{PRINT_CSS}</style>

      <div className="flex items-center gap-3">
        <Link href={`/shelves/rooms/${roomId}`} className="shrink-0">
          <Button variant="ghost" size="icon" aria-label="กลับ"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight md:text-2xl">พิมพ์ QR ทั้งห้อง</h1>
          <p className="truncate text-xs text-muted-foreground md:text-sm">{roomName} · {labels.length} ระดับชั้น</p>
        </div>
        <Button onClick={() => window.print()} disabled={labels.length === 0}>
          <Printer className="mr-2 h-4 w-4" /> พิมพ์
        </Button>
      </div>

      <Card className="gap-3 p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <label htmlFor="qr-size" className="text-sm font-medium">ขนาด QR</label>
          <input
            type="range"
            min={QR_SIZE.min}
            max={QR_SIZE.max}
            value={layout.qr}
            onChange={e => setSize(e.target.value)}
            className="min-w-40 flex-1 accent-violet-600"
            aria-label="ขนาด QR (มม.)"
          />
          <div className="flex items-center gap-1.5">
            <Input
              id="qr-size"
              type="number"
              inputMode="numeric"
              min={QR_SIZE.min}
              max={QR_SIZE.max}
              value={size}
              onChange={e => setSize(e.target.value)}
              onBlur={() => setSize(String(layout.qr))}
              className="h-9 w-20"
            />
            <span className="text-sm text-muted-foreground">มม.</span>
          </div>
          <div className="flex gap-1">
            {PRESETS.map(p => (
              <Button key={p} type="button" size="sm" variant={layout.qr === p ? 'default' : 'outline'} className="h-8 px-2.5" onClick={() => setSize(String(p))}>
                {p}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A4 แนวตั้ง · QR {layout.qr} มม. ({(layout.qr / 10).toFixed(1)} ซม.) · {layout.cols} × {layout.rows} = {layout.perPage} ป้ายต่อหน้า · รวม {pages.length} หน้า
          <span className="hidden sm:inline"> · ในหน้าต่างพิมพ์ให้เลือกกระดาษ A4 และมาตราส่วน 100% ขนาด QR จึงจะตรงตามที่ตั้ง</span>
        </p>
      </Card>

      {labels.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-12 text-center text-sm text-muted-foreground">
          ห้องนี้ยังไม่มีระดับชั้น — เพิ่มชั้นวางในห้องก่อน
        </div>
      ) : (
        // ตัวอย่าง: กว้างสุดเท่ากระดาษจริง จอแคบกว่านั้นย่อทั้งแผ่นตามความกว้าง
        <div className="mx-auto w-full max-w-[210mm]" style={{ containerType: 'inline-size' }}>
          <div className="space-y-4" style={unit(`min(1mm, calc(100cqw / ${A4.w}))`)}>
            {pages.map((page, i) => (
              <div key={i} className="overflow-hidden rounded-sm shadow-md ring-1 ring-zinc-200">
                <Sheet labels={page} layout={layout} roomName={roomName} origin={origin} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* แผ่นจริงสำหรับพิมพ์ — ซ่อนบนจอ, ตอนพิมพ์เหลือแค่ส่วนนี้ */}
      {isClient &&
        createPortal(
          <div className="qr-print-root" style={unit('1mm')}>
            {pages.map((page, i) => (
              <Sheet key={i} labels={page} layout={layout} roomName={roomName} origin={origin} />
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}
