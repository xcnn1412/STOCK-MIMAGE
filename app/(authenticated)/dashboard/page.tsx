import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Package, Briefcase, CalendarCheck, LayoutTemplate, MapPin, User, Clock } from "lucide-react"
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const selfiePath = cookieStore.get('session_selfie_path')?.value

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  // Fetch the latest login log to get the location/selfie if cookie is missing or to confirm
  const { data: latestLog } = await supabase
    .from('login_logs')
    .select('*')
    .eq('user_id', userId)
    .order('login_at', { ascending: false })
    .limit(1)
    .single()

  const log = latestLog || {}
  const selfieUrl = selfiePath 
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/login_selfies/${selfiePath}`
    : null

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row gap-6 items-start bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        {selfieUrl ? (
          <div className="relative w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden border-2 border-zinc-100 shadow-sm">
            <img 
              src={selfieUrl} 
              alt="Login Selfie" 
              className="w-full h-full object-cover transform scale-x-[-1]" 
            />
          </div>
        ) : (
          <div className="w-32 h-32 flex-shrink-0 bg-zinc-100 rounded-lg flex items-center justify-center">
            <User className="w-12 h-12 text-zinc-400" />
          </div>
        )}
        
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Welcome, {profile?.full_name || 'Staff'}</h1>
            <p className="text-zinc-500">Inventory Management System</p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-zinc-600 bg-zinc-50 px-3 py-1.5 rounded-full border border-zinc-100">
              <Clock className="h-4 w-4" />
              <span>Login at: {log.login_at ? new Date(log.login_at).toLocaleString() : 'Just now'}</span>
            </div>
            
            {log.latitude && log.longitude && (
              <a 
                href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors"
              >
                <MapPin className="h-4 w-4" />
                <span>Location: {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}</span>
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/items">
          <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer h-full border-zinc-200">
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
          <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer h-full border-zinc-200">
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
          <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer h-full border-zinc-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-green-500" />
                Events
              </CardTitle>
              <CardDescription>Event check-in / check-out</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/example-kits">
          <Card className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer h-full border-zinc-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutTemplate className="h-5 w-5 text-purple-500" />
                Templates
              </CardTitle>
              <CardDescription>Standard kit templates</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}
