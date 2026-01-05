import { logout } from '@/app/login/actions'
import { Button } from "@/components/ui/button"
import { LogOut, Users } from "lucide-react"
import Link from 'next/link'
import { cookies } from 'next/headers'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b bg-white dark:bg-zinc-900 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link href="/dashboard">
          <h1 className="text-xl font-bold tracking-tight">Event Stock</h1>
        </Link>
        <div className="flex items-center gap-4">
             <nav className="hidden md:flex gap-4 text-sm font-medium items-center">
                <Link href="/items" className="hover:underline">Inventory</Link>
                <Link href="/kits" className="hover:underline">Kits</Link>
                <Link href="/events" className="hover:underline">Events</Link>
                <Link href="/example-kits" className="hover:underline">Examples</Link>
                {role === 'admin' && (
                    <Link href="/users" className="hover:underline flex items-center gap-1 text-blue-600 font-bold">
                        <Users className="h-4 w-4" /> Users
                    </Link>
                )}
             </nav>
            <form action={logout}>
            <Button variant="ghost" size="icon" title="Logout">
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Logout</span>
            </Button>
            </form>
        </div>
      </header>
      <main className="p-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  )
}
