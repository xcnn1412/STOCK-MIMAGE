import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Target } from "lucide-react"

export default function KPIPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">KPI</h2>
        <p className="text-muted-foreground">ระบบประเมิน KPI</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Coming Soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            ระบบประเมิน KPI กำลังพัฒนา — จะเปิดให้ใช้งานเร็วๆ นี้
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
