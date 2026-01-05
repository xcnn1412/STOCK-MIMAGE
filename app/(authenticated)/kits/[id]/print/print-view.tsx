'use client'
import QRCode from 'react-qr-code'
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { ArrowLeft, Printer } from "lucide-react"
import { useEffect, useState } from 'react'

export default function PrintView({ kit }: { kit: any }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    setUrl(`${window.location.origin}/kits/${kit.id}/check`)
  }, [kit.id])

  return (
      <div className="min-h-screen bg-white p-8 flex flex-col items-center justify-center">
       <div className="print:hidden absolute top-4 left-4">
          <Link href={`/kits/${kit.id}`}>
             <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4"/> Back</Button>
          </Link>
       </div>
       <div className="print:hidden absolute top-4 right-4">
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
       </div>

       <div className="border-4 border-black p-12 rounded-3xl flex flex-col items-center gap-8 text-center max-w-lg w-full">
           <h1 className="text-5xl font-black uppercase tracking-tighter">{kit.name}</h1>
           {url && (
             <div className="bg-white p-4">
                <QRCode value={url} size={256} />
             </div>
           )}
           <div className="space-y-2">
            <p className="text-sm font-bold uppercase text-zinc-400">Scan to Check-In/Out</p>
            <p className="text-xs font-mono text-zinc-300">{kit.id}</p>
           </div>
       </div>
    </div>
  )
}
