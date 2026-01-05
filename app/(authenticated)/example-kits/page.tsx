import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Plus, LayoutTemplate, Trash } from "lucide-react"
import { deleteTemplateAction } from './delete-action'
import { DeleteTemplateButton } from './delete-template-button'

export const revalidate = 0

export default async function ExampleKitsPage() {
  const { data: templates } = await supabase
    .from('kit_templates')
    .select('*, kit_template_contents(*)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Example Kits</h2>
        <Link href="/example-kits/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Create Template
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {templates?.map((t) => (
          <Card key={t.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5 text-purple-500" />
                {t.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <p className="text-sm text-zinc-500">{t.description || "No description"}</p>
              
              <div className="space-y-2">
                   <h4 className="text-sm font-semibold">Standard Items:</h4>
                   <ul className="list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300">
                        {t.kit_template_contents?.length === 0 && <li className="text-zinc-400 italic">No items listed</li>}
                        {t.kit_template_contents?.map((c: any) => (
                            <li key={c.id}>{c.item_name}</li>
                        ))}
                   </ul>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t p-4 bg-zinc-50 dark:bg-zinc-900 rounded-b-xl gap-2">
               <DeleteTemplateButton id={t.id} />
            </CardFooter>
          </Card>
        ))}
        {(!templates || templates.length === 0) && (
            <div className="col-span-full text-center text-zinc-500 py-12 border rounded-lg border-dashed">
                No templates found. Create one.
            </div>
        )}
      </div>
    </div>
  )
}
