"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ThaiDatePickerProps {
  name?: string
  defaultValue?: Date
  className?: string
}

export function ThaiDatePicker({ name = "date", defaultValue, className }: ThaiDatePickerProps) {
  const [date, setDate] = React.useState<Date>(defaultValue || new Date())
  
  // Generate arrays
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const months = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ]
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 10 }, (_, i) => currentYear + i) // Only future years for events? Let's do -1 to +5
  // Actually usually events are current or future. Let's do current - 1 to current + 5
  const yearOptions = Array.from({ length: 10 }, (_, i) => (currentYear - 1) + i)

  const handleDayChange = (v: string) => {
    const newDate = new Date(date)
    newDate.setDate(parseInt(v))
    setDate(newDate)
  }

  const handleMonthChange = (v: string) => {
    const newDate = new Date(date)
    newDate.setMonth(parseInt(v))
    setDate(newDate)
  }

  const handleYearChange = (v: string) => {
    const newDate = new Date(date)
    newDate.setFullYear(parseInt(v))
    setDate(newDate)
  }

  // Effect to ensure valid days in month (e.g. Feb 30)
  React.useEffect(() => {
     // Simple check if day is valid for month
     const d = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
     if (date.getDate() > d) {
         const newDate = new Date(date)
         newDate.setDate(d)
         setDate(newDate)
     }
  }, [date.getMonth(), date.getFullYear()])

  const formattedDate = date.toISOString() // or format as YYYY-MM-DD

  return (
    <div className={`flex gap-2 ${className}`}>
      <input type="hidden" name={name} value={formattedDate} />
      
      {/* Day */}
      <Select value={date.getDate().toString()} onValueChange={handleDayChange}>
        <SelectTrigger className="w-[80px]">
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent>
          {days.map((d) => (
            <SelectItem key={d} value={d.toString()}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Month */}
      <Select value={date.getMonth().toString()} onValueChange={handleMonthChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Month" />
        </SelectTrigger>
        <SelectContent>
          {months.map((m, i) => (
            <SelectItem key={i} value={i.toString()}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Year (Thai B.E.) */}
      <Select value={date.getFullYear().toString()} onValueChange={handleYearChange}>
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {yearOptions.map((y) => (
            <SelectItem key={y} value={y.toString()}>
              {y + 543}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
