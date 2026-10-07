'use client'

// ใบจัดของแบบพิมพ์ A4 — หัวงาน + QR (ลิงก์กลับหน้าใบ) + รายการเรียงตามเส้นทางหยิบ (ห้อง › ตู้ › ชั้น) มีช่อง ☐ ต่อบรรทัด
// ตอนพิมพ์: แผ่นจริงอยู่ใน portal ใต้ <body> แล้วซ่อนทุกอย่างที่เหลือ (แบบ qr-sheet-view) — ไม่ขึ้นกับโครง layout ของแอป
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import QRCode from 'react-qr-code'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { eventWhen } from '../../format'
import { PACKING_STATUS_LABELS } from '../../packing-logic'
import type { PackingListDetail } from '../../types'
import { lineTags, routeOf } from '../pick-step'

const PRINT_CSS = `
.packing-print-root { display: none; }
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(.packing-print-root) { display: none !important; }
  .packing-print-root { display: block !important; }
  .packing-print-root tr { break-inside: avoid; }
}
`

/** แผ่นใบจัดของ (ใช้ทั้งตัวอย่างบนจอและแผ่นพิมพ์จริง) */
export function PackingSheet({ detail, qrUrl }: { detail: PackingListDetail; qrUrl: string }) {
  const { list, event, lead } = detail
  const groups = routeOf(detail.lines)
  return (
    <div style={{ color: '#000', background: '#fff', fontSize: 12, lineHeight: 1.35 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>ใบจัดของ</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{lead?.customer_name || event.name}</div>
          {lead?.customer_name && <div>{event.name}</div>}
          <div>{eventWhen(event.event_date, event.event_time, event.event_end_time)}</div>
          {(event.location || lead?.event_location) && <div>สถานที่: {event.location || lead?.event_location}</div>}
          {detail.leadPackages.length > 0 && <div>แพ็กเกจ: {detail.leadPackages.map(p => (p.quantity > 1 ? `${p.packageName} ×${p.quantity}` : p.packageName)).join(', ')}</div>}
          <div style={{ color: '#52525b' }}>
            สถานะ: {PACKING_STATUS_LABELS[list.status]} · {detail.lines.length} รายการ{detail.spot ? ` · จุดรับของ: ${detail.spot.name}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <QRCode value={qrUrl} size={256} style={{ width: 96, height: 96 }} />
          <div style={{ fontSize: 9, color: '#52525b', marginTop: 2 }}>สแกนเพื่อเปิดใบบนมือถือ</div>
        </div>
      </div>

      {groups.length === 0 && <div style={{ padding: '16px 0', textAlign: 'center', color: '#52525b' }}>ใบนี้ยังไม่มีของ</div>}
      {groups.map(g => (
        <div key={g.key} style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, borderBottom: '1px solid #a1a1aa', paddingBottom: 2 }}>{g.label}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {g.lines.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px dashed #d4d4d8' }}>
                  <td style={{ width: 22, padding: '4px 0', fontSize: 16, verticalAlign: 'top' }}>{l.picked_at ? '☑' : '☐'}</td>
                  <td style={{ padding: '4px 4px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 600 }}>
                      {l.unitName}
                      {l.variant ? ` (${l.variant})` : ''}
                    </div>
                    <div style={{ color: '#52525b', fontSize: 10 }}>
                      {l.serial ? `S/N ${l.serial} · ` : ''}
                      {lineTags(l)}
                      {l.locked ? ' · ทีมขายเลือก' : ''}
                    </div>
                    {l.kind === 'kit' && l.kitItems && l.kitItems.length > 0 && (
                      <div style={{ color: '#52525b', fontSize: 10 }}>ในกระเป๋า: {l.kitItems.filter(i => !i.is_consumable).map(i => i.name).join(', ')}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ marginTop: 18, display: 'flex', gap: 24, fontSize: 12 }}>
        <div>ผู้จัด ..................................................</div>
        <div>วันที่ ..............................</div>
      </div>
    </div>
  )
}

export default function PackingPrintView({ detail, qrUrl }: { detail: PackingListDetail; qrUrl: string }) {
  // portal ใช้ได้เฉพาะในเบราว์เซอร์ (ไม่มีตอน SSR)
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false)
  return (
    <div className="space-y-4 pb-20">
      <style>{PRINT_CSS}</style>
      <div className="flex items-center gap-3">
        <Link href={`/packing/${detail.list.id}`} className="shrink-0">
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="กลับหน้าใบจัดของ">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight md:text-2xl">พิมพ์ใบจัดของ</h1>
          <p className="truncate text-xs text-muted-foreground md:text-sm">A4 แนวตั้ง · เรียงตามเส้นทางหยิบ ห้อง › ตู้ › ชั้น</p>
        </div>
        <Button className="min-h-11" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> พิมพ์
        </Button>
      </div>

      {/* ตัวอย่างบนจอ — กว้างสุดเท่ากระดาษจริง */}
      <div className="mx-auto w-full max-w-[210mm] overflow-hidden rounded-sm bg-white p-4 shadow-md ring-1 ring-zinc-200 sm:p-8">
        <PackingSheet detail={detail} qrUrl={qrUrl} />
      </div>

      {isClient &&
        createPortal(
          <div className="packing-print-root">
            <PackingSheet detail={detail} qrUrl={qrUrl} />
          </div>,
          document.body,
        )}
    </div>
  )
}
