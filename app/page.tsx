import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export default async function Home() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('session_user_id')

  if (sessionId) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
