'use client'
import QRCode from 'react-qr-code'
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { ArrowLeft, Download } from "lucide-react"
import { useEffect, useState, useRef, useCallback } from 'react'
import { useLanguage } from '@/contexts/language-context'
import { toPng } from 'html-to-image'

export default function PrintView({ kit }: { kit: any }) {
  const { t } = useLanguage()
  const [url, setUrl] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setUrl(`${window.location.origin}/kits/${kit.id}/check`)
  }, [kit.id])

  const handleDownload = useCallback(() => {
    if (cardRef.current === null) {
      return
    }

    toPng(cardRef.current, { cacheBust: true, width: 450, height: 450, backgroundColor: 'white' })
      .then((dataUrl) => {
        const link = document.createElement('a')
        link.download = `${kit.name}-qrcode.png`
        link.href = dataUrl
        link.click()
      })
      .catch((err) => {
        console.error(err)
      })
  }, [kit.name])

  return (
      <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-4">
       <div className="fixed top-4 left-4 z-10">
          <Link href={`/kits/${kit.id}`}>
             <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4"/> {t.common.back}</Button>
          </Link>
       </div>


       {/* 450px x 450px Fixed Container */}
       <div 
         ref={cardRef}
         className="bg-white text-black flex flex-col items-center justify-center text-center shadow-lg"
         style={{ width: '450px', height: '450px', padding: '40px' }}
       >
           <div className="mb-auto mt-2">
               <h1 className="text-3xl font-bold wrap-break-word max-w-[380px] leading-tight">{kit.name}</h1>
           </div>
           
           {url && (
              <div className="my-4">
                 <QRCode value={url} size={200} />
              </div>
           )}

           <div className="mt-auto mb-2">
               <p className="text-sm font-semibold tracking-wider uppercase">SCAN TO CHECKIN / CHECKOUT</p>
           </div>
       </div>

       <p className="text-zinc-400 mt-4 text-sm">
         {t.kits.preview}
       </p>

       <div className="mt-6">
          <Button onClick={handleDownload} size="lg" className="shadow-md">
            <Download className="mr-2 h-5 w-5" /> Download Image
          </Button>
       </div>
    </div>
  )
}
