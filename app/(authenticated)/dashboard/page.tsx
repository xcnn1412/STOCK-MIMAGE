import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Package, Briefcase, CalendarCheck, LayoutTemplate } from "lucide-react"

export default function DashboardPage() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Link href="/items">
        <Card className="hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              Inventory
            </CardTitle>
            <CardDescription>Manage all equipment items</CardDescription>
          </CardHeader>
        </Card>
      </Link>
      
      <Link href="/kits">
        <Card className="hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-amber-500" />
              Kits
            </CardTitle>
            <CardDescription>Manage kits and bag contents</CardDescription>
          </CardHeader>
        </Card>
      </Link>

       <Link href="/events">
        <Card className="hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-green-500" />
              Events & Check-in
            </CardTitle>
            <CardDescription>Select active event and scan kits</CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Link href="/example-kits">
        <Card className="hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-purple-500" />
              Example Kits
            </CardTitle>
            <CardDescription>View kit templates and standards</CardDescription>
          </CardHeader>
        </Card>
      </Link>
    </div>
  )
}
