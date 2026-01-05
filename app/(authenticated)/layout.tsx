import { logout } from '@/app/login/actions'
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"
import Link from 'next/link'

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b bg-white dark:bg-zinc-900 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link href="/dashboard">
          <h1 className="text-xl font-bold tracking-tight">Event Stock</h1>
        </Link>
        <div className="flex items-center gap-4">
             <nav className="hidden md:flex gap-4 text-sm font-medium">
                <Link href="/items" className="hover:underline">Inventory</Link>
                <Link href="/kits" className="hover:underline">Kits</Link>
                <Link href="/events" className="hover:underline">Events</Link>
                <Link href="/example-kits" className="hover:underline">Examples</Link>
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
