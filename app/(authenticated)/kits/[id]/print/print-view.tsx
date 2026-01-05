'use client'
import QRCode from 'react-qr-code'
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { ArrowLeft, Printer } from "lucide-react"
import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/language-context'

export default function PrintView({ kit }: { kit: any }) {
  const { t } = useLanguage()
  const [url, setUrl] = useState('')

  useEffect(() => {
    setUrl(`${window.location.origin}/kits/${kit.id}/check`)
  }, [kit.id])

  return (
      <div className="min-h-screen bg-zinc-100 flex flex-col items-center justify-center p-4">
       <div className="print:hidden fixed top-4 left-4 z-10">
          <Link href={`/kits/${kit.id}`}>
             <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4"/> {t.common.back}</Button>
          </Link>
       </div>


       {/* 450px x 450px Fixed Container */}
       <div 
         className="bg-white text-black flex flex-col items-center justify-center text-center shadow-lg print:shadow-none"
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
               <p className="text-sm font-semibold tracking-wider">{t.kits.scanTo}</p>
           </div>
       </div>

       <p className="print:hidden text-zinc-400 mt-4 text-sm">
         {t.kits.preview}
       </p>

       <div className="print:hidden mt-6">
          <Button onClick={() => window.print()} size="lg" className="shadow-md">
            <Printer className="mr-2 h-5 w-5" /> {t.kits.printQR}
          </Button>
       </div>

       <style jsx global>{`
        @media print {
          @page {
            size: 450px 450px;
            margin: 0;
          }
          body {
            visibility: hidden;
            background: white;
          }
          .min-h-screen {
            min-height: 0 !important;
            padding: 0 !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
          }
          /* Hide everything */
          body * {
            visibility: hidden;
          }
          /* Show only the QR Card */
          .bg-white, .bg-white * {
            visibility: visible;
          }
          .bg-white {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0;
            box-shadow: none;
            width: 450px !important;
            height: 450px !important;
          }
        }
       `}</style>
    </div>
  )
}
