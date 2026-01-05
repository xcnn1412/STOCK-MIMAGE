'use client'

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Plus, LayoutTemplate } from "lucide-react"
import { DeleteTemplateButton } from './delete-template-button'
import { useLanguage } from '@/contexts/language-context'

export default function ExampleKitsView({ templates }: { templates: any[] }) {
  const { t } = useLanguage()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t.examples.title}</h2>
        <Link href="/example-kits/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> {t.examples.createTemplate}
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {templates?.map((t_item) => (
          <Card key={t_item.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5 text-purple-500" />
                {t_item.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <p className="text-sm text-zinc-500">{t_item.description || "No description"}</p>
              
              <div className="space-y-2">
                   <h4 className="text-sm font-semibold">{t.examples.standardItems}:</h4>
                   <ul className="list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300">
                        {t_item.kit_template_contents?.length === 0 && <li className="text-zinc-400 italic">No items listed</li>}
                        {t_item.kit_template_contents?.map((c: any) => (
                            <li key={c.id} className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100 min-w-[24px]">{c.quantity}x</span>
                                <span>{c.item_name}</span>
                                {t_item.type === 'checklist' && c.status && c.status !== 'none' && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider ${
                                        c.status === 'ready' ? 'bg-green-100 text-green-700' :
                                        c.status === 'in-progress' ? 'bg-amber-100 text-amber-700' : 
                                        'bg-zinc-100 text-zinc-500'
                                    }`}>
                                        {c.status}
                                    </span>
                                )}
                            </li>
                        ))}
                   </ul>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t p-4 bg-zinc-50 dark:bg-zinc-900 rounded-b-xl gap-2">
               <div className="flex gap-2">
                   {t_item.type === 'checklist' && (
                       <div className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded border border-blue-100">
                           {t.examples.checklist}
                       </div>
                   )}
               </div>
               <div className="flex gap-2">
                    <Link href={`/example-kits/${t_item.id}`}>
                        <Button variant="outline" size="sm">{t.common.edit}</Button>
                    </Link>
                    <DeleteTemplateButton id={t_item.id} />
               </div>
            </CardFooter>
          </Card>
        ))}
        {(!templates || templates.length === 0) && (
            <div className="col-span-full text-center text-zinc-500 py-12 border rounded-lg border-dashed">
                {t.common.noData}
            </div>
        )}
      </div>
    </div>
  )
}
