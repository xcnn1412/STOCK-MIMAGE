'use client'

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Plus, Briefcase, QrCode } from "lucide-react"
import { DeleteKitButton } from './delete-kit-button'
import { useLanguage } from '@/contexts/language-context'
import type { Kit } from '@/types'

export default function KitsView({ kits }: { kits: Kit[] }) {
  const { t } = useLanguage()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t.kits.title}</h2>
        <Link href="/kits/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> {t.kits.createKit}
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {kits?.map((kit) => (
          <Card key={kit.id} className="flex flex-col hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-zinc-500" />
                {kit.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-zinc-500 mb-4 line-clamp-2">{kit.description || "No description"}</p>
              <div className="text-sm">
                <span className="font-medium">{kit.kit_contents?.length || 0}</span> {t.kits.itemCount}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-4 gap-2">
               <Link href={`/kits/${kit.id}`} className="flex-1">
                <Button variant="outline" className="w-full">{t.kits.manage}</Button>
               </Link>
               <Link href={`/kits/${kit.id}/print`}>
                 <Button variant="ghost" size="icon" title={t.kits.printQR}>
                    <QrCode className="h-4 w-4" />
                 </Button>
               </Link>
               <DeleteKitButton id={kit.id} />
            </CardFooter>
          </Card>
        ))}
         {(!kits || kits.length === 0) && (
              <div className="col-span-full text-center text-zinc-500 py-12 border rounded-lg border-dashed">
                  {t.kits.noItems}
              </div>
         )}
      </div>
    </div>
  )
}
