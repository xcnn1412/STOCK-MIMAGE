import CrmNav from './crm-nav'

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Nav stays within parent max-w constraints */}
      <CrmNav />
      {/* Children break out of max-w-7xl via their own styling */}
      <div className="mt-6">
        {children}
      </div>
    </>
  )
}
