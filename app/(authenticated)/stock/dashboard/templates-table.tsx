'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Pencil, LayoutTemplate, CheckSquare, Filter } from "lucide-react"
import { useLanguage } from "@/contexts/language-context"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function TemplatesTable({ templates }: { templates: any[] }) {
    const { t } = useLanguage()
    const [typeFilter, setTypeFilter] = useState<string>('all')

    const filteredTemplates = templates.filter(template => {
        if (typeFilter === 'all') return true
        if (typeFilter === 'checklist') return template.type === 'checklist'
        if (typeFilter === 'example') return template.type !== 'checklist' // Assumes default or 'example'
        return true
    })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">{t.dashboard.templates}</h2>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2">
                            <Filter className="h-3.5 w-3.5" />
                            {typeFilter === 'all' ? t.items.status.all : 
                             typeFilter === 'checklist' ? t.examples.checklist : 
                             t.examples.example}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuCheckboxItem checked={typeFilter === 'all'} onCheckedChange={() => setTypeFilter('all')}>
                            {t.items?.status?.all || 'All'}
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={typeFilter === 'example'} onCheckedChange={() => setTypeFilter('example')}>
                            {/* Fallback text if trans key missing */}
                            {t.examples?.example || 'Example Kit'}
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem checked={typeFilter === 'checklist'} onCheckedChange={() => setTypeFilter('checklist')}>
                            {t.examples?.checklist || 'Checklist'}
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                            <tr>
                                <th className="py-3 px-4 font-medium text-zinc-500">Name</th>
                                <th className="py-3 px-4 font-medium text-zinc-500">Type</th>
                                <th className="py-3 px-4 font-medium text-zinc-500">Items</th>
                                <th className="py-3 px-4 font-medium text-zinc-500 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {filteredTemplates.map((template) => (
                                <tr key={template.id} className="group hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                                    <td className="py-3 px-4 font-medium">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                                                template.type === 'checklist' 
                                                ? 'bg-blue-100 text-blue-600' 
                                                : 'bg-purple-100 text-purple-600'
                                            }`}>
                                                {template.type === 'checklist' ? <CheckSquare className="w-4 h-4" /> : <LayoutTemplate className="w-4 h-4" />}
                                            </div>
                                            <div>
                                                <div className="font-medium text-zinc-900 dark:text-zinc-100">{template.name}</div>
                                                <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">{template.description}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4">
                                        {template.type === 'checklist' ? (
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">check-list</Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">template</Badge>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-zinc-500">
                                        {template.kit_template_contents?.[0]?.count || 0} items
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <Link href={`/example-kits/${template.id}`}>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-900">
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                            {filteredTemplates.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="py-8 text-center text-zinc-500">
                                        No templates found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}
