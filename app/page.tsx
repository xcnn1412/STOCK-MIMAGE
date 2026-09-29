import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'

export default async function Home() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session_token')?.value

  // Signed token only — proxy.ts does the full DB check on /dashboard
  if (token && verifySessionToken(token)) {
    redirect('/dashboard')
  }

  redirect('/login')
}
