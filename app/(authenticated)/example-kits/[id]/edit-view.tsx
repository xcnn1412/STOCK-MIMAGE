'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardContent, CardTitle, CardFooter } from "@/components/ui/card"
import { ArrowLeft, Plus, Trash, CheckCircle2, Clock, Circle, X, Save } from "lucide-react"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateTemplateStatus, addTemplateItem, removeTemplateItem, updateTemplateDetails } from './actions'
import { useLanguage } from '@/contexts/language-context'

export default function EditTemplateView({ template, contents }: { template: any, contents: any[] }) {
    const { t } = useLanguage()
    const router = useRouter()
    const [newItemName, setNewItemName] = useState('')
    const [newItemQty, setNewItemQty] = useState(1)
    const [isSaving, setIsSaving] = useState(false)

    const handleAddItem = async () => {
        if (!newItemName.trim()) return
        await addTemplateItem(template.id, newItemName, newItemQty)
        setNewItemName('')
        setNewItemQty(1)
    }

    const isChecklist = template.type === 'checklist'

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/example-kits">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h2 className="text-3xl font-bold tracking-tight">{t.examples.editTitle}</h2>
            </div>

            {/* Template Details Form */}
            <Card>
                <CardHeader>
                    <CardTitle>{t.common.details}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form action={async (formData) => {
                        setIsSaving(true)
                        await updateTemplateDetails(template.id, formData)
                        router.push('/example-kits')
                        setIsSaving(false)
                    }} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t.examples.fields.name}</label>
                            <Input name="name" defaultValue={template.name} required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t.examples.fields.description}</label>
                            <Textarea name="description" defaultValue={template.description} />
                        </div>
                        <div className="flex justify-end">
                            <Button type="submit" size="sm" disabled={isSaving}>
                                {isSaving ? t.common.saving : t.common.save}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Items List */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t.examples.fields.items}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        {contents.map((item) => (
                            <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border">
                                <div className="flex-1 flex items-center gap-2">
                                    <span className="font-bold text-zinc-500 min-w-[30px]">{item.quantity}x</span>
                                    <span className="font-medium">{item.item_name}</span>
                                </div>
                                
                                {isChecklist && (
                                    <div className="flex items-center gap-1">
                                        <Button 
                                            size="sm" 
                                            variant={item.status === 'ready' ? 'default' : 'outline'}
                                            className={item.status === 'ready' ? 'bg-green-600 hover:bg-green-700' : 'text-zinc-500'}
                                            onClick={() => updateTemplateStatus(item.id, 'ready')}
                                        >
                                            <CheckCircle2 className="h-3 w-3 mr-1" /> {t.examples.status.ready}
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant={item.status === 'in-progress' ? 'default' : 'outline'}
                                            className={item.status === 'in-progress' ? 'bg-amber-500 hover:bg-amber-600' : 'text-zinc-500'}
                                            onClick={() => updateTemplateStatus(item.id, 'in-progress')}
                                        >
                                            <Clock className="h-3 w-3 mr-1" /> {t.examples.status.inProgress}
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant={!item.status || item.status === 'none' ? 'secondary' : 'ghost'}
                                            className="text-zinc-500"
                                            onClick={() => updateTemplateStatus(item.id, 'none')}
                                        >
                                            {t.examples.status.none}
                                        </Button>
                                    </div>
                                )}

                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="text-red-500 hover:bg-red-50 h-8 w-8"
                                    onClick={() => removeTemplateItem(item.id, template.id)}
                                >
                                    <Trash className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                         {contents.length === 0 && (
                            <div className="text-center py-8 text-zinc-500 italic">{t.common.noData}</div>
                        )}
                    </div>

                    {/* Add Item Row */}
                    <div className="flex items-center gap-2 pt-4 border-t">
                        <Input 
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder={t.items.fields.name}
                            className="flex-1"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                        />
                        <Input 
                            type="number"
                            value={newItemQty}
                            onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                            className="w-20"
                            min={1}
                        />
                        <Button onClick={handleAddItem}>
                            <Plus className="h-4 w-4 mr-2" /> {t.items.addItem}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
