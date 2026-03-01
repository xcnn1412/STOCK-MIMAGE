import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifySessionToken } from '@/lib/session'

export default async function Home() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session_token')?.value

  // Fallback: also check legacy cookie for backward compatibility
  const legacySessionId = cookieStore.get('session_user_id')?.value

  if (token) {
    const verified = verifySessionToken(token)
    if (verified) {
      redirect('/dashboard')
    }
  }

  // Backward compatibility: if legacy cookie exists but no signed token
  if (legacySessionId) {
    redirect('/dashboard')
  }

  redirect('/login')
}
