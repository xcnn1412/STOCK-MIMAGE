'use client'

// ป้าย QR ติดชั้น — แบบเดียวกับป้ายกระเป๋า (kits/[id]/print) QR พาไป /shelves/<id>
import QRCode from 'react-qr-code'
import Link from 'next/link'
import { useCallback, useRef } from 'react'
import { toPng } from 'html-to-image'
import { ArrowLeft, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PrintView({ shelf, origin }: { shelf: { id: string; zone: string; code: string; name: string | null }; origin: string }) {
  const url = `${origin}/shelves/${shelf.id}`
  const cardRef = useRef<HTMLDivElement>(null)

  const handleDownload = useCallback(() => {
    if (!cardRef.current) return
    toPng(cardRef.current, { cacheBust: true, width: 450, height: 450, backgroundColor: 'white' })
      .then(dataUrl => {
        const link = document.createElement('a')
        link.download = `shelf-${shelf.code}-qrcode.png`
        link.href = dataUrl
        link.click()
      })
      .catch(err => console.error(err))
  }, [shelf.code])

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-4">
      <div className="fixed top-20 left-4 z-10">
        <Link href={`/shelves/${shelf.id}`}>
          <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> กลับ</Button>
        </Link>
      </div>

      <div
        ref={cardRef}
        className="bg-white text-black flex flex-col items-center justify-center text-center shadow-lg"
        style={{ width: '450px', height: '450px', padding: '40px' }}
      >
        <div className="mb-auto mt-2">
          <p className="text-sm font-semibold tracking-wider">ZONE {shelf.zone}</p>
          <h1 className="text-4xl font-bold leading-tight">{shelf.code}</h1>
          {shelf.name && <p className="text-base max-w-[380px] truncate">{shelf.name}</p>}
        </div>

        {url && (
          <div className="my-4">
            <QRCode value={url} size={190} />
          </div>
        )}

        <div className="mt-auto mb-2">
          <p className="text-sm font-semibold tracking-wider uppercase">Scan to see what&apos;s on this shelf</p>
        </div>
      </div>

      <p className="text-zinc-400 mt-4 text-sm">ตัวอย่างป้าย 450 × 450 px</p>

      <div className="mt-6">
        <Button onClick={handleDownload} size="lg" className="shadow-md">
          <Download className="mr-2 h-5 w-5" /> ดาวน์โหลดรูป
        </Button>
      </div>
    </div>
  )
}
