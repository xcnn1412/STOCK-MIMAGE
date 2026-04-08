import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getMyJobSettings } from '../actions'
import MyJobSettingsView from './my-job-settings-view'

export default async function MyJobSettingsPage() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    if (!userId) redirect('/login')

    const { data: settings } = await getMyJobSettings()

    const jobTypes = settings.filter(s => s.category === 'job_type')

    return (
        <Suspense>
            <MyJobSettingsView settings={settings} jobTypes={jobTypes} />
        </Suspense>
    )
}
