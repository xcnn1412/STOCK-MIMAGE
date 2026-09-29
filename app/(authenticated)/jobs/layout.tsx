import { requireAuth } from '@/lib/auth'
import JobsNav from './jobs-nav'

export default async function JobsLayout({ children }: { children: React.ReactNode }) {
    const role = (await requireAuth())?.role
    return (
        <>
            {/* Nav stays within parent max-w constraints */}
            <JobsNav role={role} />
            {/* Children break out of max-w-7xl via their own styling */}
            <div className="mt-6">
                {children}
            </div>
        </>
    )
}
