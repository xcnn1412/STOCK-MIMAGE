'use client'

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import UsersTable from './users-table'
import { useLanguage } from '@/contexts/language-context'
import type { Profile } from '@/types'

export default function UsersView({ users }: { users: any[] }) {
    const { t } = useLanguage()

    return (
        <div className="space-y-4 md:space-y-6">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t.users.title}</h2>
                <p className="text-sm md:text-base text-zinc-500">Approve new registrations and manage staff roles.</p>
            </div>

            <Card>
                <CardHeader className="px-4 py-4 md:px-6 md:py-6">
                    <CardTitle>{t.users.title}</CardTitle>
                    <CardDescription>
                        A list of all users registered in the system.
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                    <UsersTable users={users || []} />
                </CardContent>
            </Card>
        </div>
    )
}
