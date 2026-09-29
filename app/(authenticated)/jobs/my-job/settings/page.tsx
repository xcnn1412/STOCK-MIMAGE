import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getMyJobSettings } from '../actions'
import MyJobSettingsView from './my-job-settings-view'
import { Skeleton } from '@/components/ui/skeleton'

export default async function MyJobSettingsPage() {
    const session = await requireAuth()
    const userId = session?.userId
    if (!userId) redirect('/login')

    const { data: settings } = await getMyJobSettings()

    const jobTypes = settings.filter(s => s.category === 'job_type')

    return (
        <Suspense fallback={
          <div className="space-y-4">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        }>
            <MyJobSettingsView settings={settings} jobTypes={jobTypes} />
        </Suspense>
    )
}
