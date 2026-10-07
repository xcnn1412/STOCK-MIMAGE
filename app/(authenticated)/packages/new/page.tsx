import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Boxes } from 'lucide-react'
import { getKitManager } from '@/lib/kit-bookings'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NewPackageForm } from '../[id]/package-editor'

/** เพิ่มแพ็กเกจ — สร้างแล้วไปหน้าแก้ข้อกำหนด · admin และแผนกที่ดูแลอุปกรณ์เท่านั้น */
export default async function NewPackagePage() {
  if (!(await getKitManager())) redirect('/packages')
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/packages">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-1 h-4 w-4" /> แพ็กเกจทั้งหมด
        </Button>
      </Link>
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
        <Boxes className="h-6 w-6 text-zinc-500" /> เพิ่มแพ็กเกจ
      </h2>
      <Card className="p-4">
        <NewPackageForm />
      </Card>
    </div>
  )
}
