import { getMyProfile } from './actions'
import ProfileView from './profile-view'

export const revalidate = 0

export const metadata = {
  title: 'โปรไฟล์ของฉัน — Office Hub',
  description: 'จัดการข้อมูลส่วนตัว ที่อยู่ และบัญชีธนาคาร',
}

export default async function ProfilePage() {
  const profile = await getMyProfile()

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-500">ไม่สามารถโหลดข้อมูลโปรไฟล์ได้</p>
      </div>
    )
  }

  return <ProfileView profile={profile} />
}
