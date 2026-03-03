import JobsNav from './jobs-nav'

export default function JobsLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            {/* Nav stays within parent max-w constraints */}
            <JobsNav />
            {/* Children break out of max-w-7xl via their own styling */}
            <div className="mt-6">
                {children}
            </div>
        </>
    )
}
