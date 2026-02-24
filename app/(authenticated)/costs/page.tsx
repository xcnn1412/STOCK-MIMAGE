import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign } from "lucide-react"

export default function CostsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Costs</h2>
        <p className="text-muted-foreground">ระบบคิดต้นทุนอีเวนต์</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            ระบบคิดต้นทุนอีเวนต์กำลังพัฒนา — จะเปิดให้ใช้งานเร็วๆ นี้
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
