import { ClipboardList, Construction } from 'lucide-react'

export const revalidate = 0

export default function CheckoutPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
      <div className="flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg">
        <ClipboardList className="h-10 w-10" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          ระบบเบิกอุปกรณ์
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
          ระบบเบิก-คืนอุปกรณ์กำลังอยู่ในระหว่างพัฒนา จะเปิดให้ใช้งานเร็วๆ นี้
        </p>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 text-sm font-medium">
        <Construction className="h-4 w-4" />
        <span>Coming Soon</span>
      </div>
    </div>
  )
}
