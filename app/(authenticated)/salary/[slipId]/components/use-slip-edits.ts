'use client'

// ============================================================================
// ตัวห่อ action + การแตกข้อมูลของมุมมองรายวัน
// ใช้ร่วมกันทั้งตารางเดสก์ท็อปและการ์ดมือถือ — spec: docs/specs/salary-slip-daily-ui.md
//
// useSlipEdits: ทุกตัวคืน SaveResult ({} = สำเร็จ) ให้ช่องใน inline-cells ใช้ตรงๆ
// และส่งสลิปที่คำนวณใหม่แล้วกลับผ่าน onSlipChange — ไม่มีปุ่ม "คำนวณใหม่" ให้กดเอง
// เรียกครั้งเดียวที่ slip-view แล้วส่งต่อให้ตาราง/การ์ด (สถานะ "กำลังบันทึก" จึงมีชุดเดียว)
//
// การแก้ "เช็คอิน" (spec: docs/specs/salary-slip-smooth-edit.md §A):
//   แพตช์แถวเช็คอินทันที → previewSlip (เครื่องคำนวณตัวเดียวกับ server) → แสดงเลย
//   → server บันทึก+คำนวณจริง → สำเร็จ = แทนด้วยสลิปจาก server
//   (action เรียก revalidatePath อยู่แล้ว Next ส่งแถวเช็คอินใหม่มากับคำตอบ ไม่ต้อง refresh)
//   → ล้มเหลว = คืนค่าก่อนแก้ + router.refresh() เพราะเช็คอินอาจถูกแก้ไปแล้วแต่คำนวณใหม่ล้ม
//
// useDayView: แตกสลิป+เช็คอินเป็นแถวรายวัน + ตารางชื่อหน้าที่ + คีย์รันเนอร์
// (ตารางกับการ์ดเคยคำนวณชุดนี้ซ้ำกันคนละที่)
// ============================================================================

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  clearSlipLineOverride, editSlipCheckin, overrideSlipLine, setRunnerAmounts,
  type SlipCheckinPatch, type SlipCheckinRow, type SlipDetail, type SlipEditResult,
  type SlipEventOption,
} from '../../actions'
import {
  bangkokDate, groupSlipByDay, isMissingAmount, previewSlip, type DayRow, type SlipCalcInputs,
} from '../../compute'
import type { SalaryDutyRow } from '../../settings/actions'
import { applyCheckinPatch } from './day-view-utils'
import type { SaveResult } from './inline-cells'

export interface SlipEdits {
  saveCheckin: (checkinId: string, patch: SlipCheckinPatch) => Promise<SaveResult>
  saveOverride: (key: string, amount: number, note: string) => Promise<SaveResult>
  clearOverride: (key: string) => Promise<SaveResult>
  /** null = ล้างยอดรันเนอร์กลับเป็น "ยังไม่กรอก" */
  saveRunner: (key: string, amount: number | null) => Promise<SaveResult>
  /** "ใช้ยอดนี้กับวันที่ยังว่าง" — ตัวเรียกส่งคีย์ของบรรทัดที่ยังว่างมาให้ */
  applyRunnerToEmpty: (keys: string[], amount: number) => Promise<SaveResult>
  /** มีการแก้เช็คอินที่ server ยังไม่ยืนยัน */
  saving: boolean
  /** วันไทยที่ตัวเลขยังเป็นภาพตัวอย่าง รอ server ยืนยัน */
  pendingDates: Set<string>
}

interface UseSlipEditsInput {
  slip: SlipDetail
  checkins: SlipCheckinRow[]
  duties: SalaryDutyRow[]
  events: SlipEventOption[]
  /** null = ไม่มีข้อมูลพอทำภาพตัวอย่าง → รอตัวเลขจาก server แบบเดิม */
  calc: SlipCalcInputs | null
  onSlipChange: (slip: SlipDetail) => void
  onCheckinsChange: (checkins: SlipCheckinRow[]) => void
}

export function useSlipEdits({
  slip, checkins, duties, events, calc, onSlipChange, onCheckinsChange,
}: UseSlipEditsInput): SlipEdits {
  const router = useRouter()
  const slipId = slip.id
  // เลขคำขอล่าสุด — คำตอบของคำขอที่เก่ากว่าห้ามทับภาพของการแก้ที่ใหม่กว่า
  const latestRequest = useRef(0)
  const [pending, setPending] = useState<{ id: number; dates: string[] }[]>([])

  async function saveCheckin(checkinId: string, patch: SlipCheckinPatch): Promise<SaveResult> {
    const id = ++latestRequest.current
    const before = { slip, checkins }

    const target = checkins.find(c => c.id === checkinId)
    const patched = target ? applyCheckinPatch(target, patch, events) : null
    // แก้เวลาเข้าจนย้ายวัน = ทั้งวันเดิมและวันใหม่รอยืนยัน
    const dates = [target, patched].flatMap(c => (c ? [bangkokDate(c.checked_in_at)] : []))
    setPending(prev => [...prev, { id, dates }])

    if (patched) {
      const nextCheckins = checkins.map(c => (c.id === checkinId ? patched : c))
      onCheckinsChange(nextCheckins)
      if (calc) onSlipChange({ ...slip, ...previewSlip({ slip, checkins: nextCheckins, duties, calc }) })
    }

    let res: SlipEditResult
    try {
      res = await editSlipCheckin(slipId, checkinId, patch)
    } catch {
      res = { error: 'บันทึกไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองใหม่' }
    }
    const isLatest = id === latestRequest.current
    setPending(prev => prev.filter(p => p.id !== id))

    if ('error' in res) {
      // คืนค่าก่อนแก้เฉพาะเมื่อไม่มีการแก้ที่ใหม่กว่า (ไม่งั้นจะลบภาพของการแก้นั้นทิ้ง)
      if (isLatest) {
        onSlipChange(before.slip)
        onCheckinsChange(before.checkins)
      }
      // ล้มเหลวต้อง refresh เสมอ — เช็คอินอาจถูกแก้ไปแล้วแต่คำนวณใหม่ไม่ผ่าน
      // หรือยังมีคำขออื่นค้างอยู่ ถ้าไม่ดึงของจริงมา หน้าจอจะไม่ตรงกับฐานข้อมูล
      router.refresh()
      return { error: res.error }
    }
    if (isLatest) onSlipChange(res.slip)
    return {}
  }

  async function saveOverride(key: string, amount: number, note: string): Promise<SaveResult> {
    const res = await overrideSlipLine(slipId, key, amount, note)
    if (res.error) return { error: res.error }
    if (res.slip) onSlipChange(res.slip)
    return {}
  }

  async function clearOverride(key: string): Promise<SaveResult> {
    const res = await clearSlipLineOverride(slipId, key)
    if (res.error) return { error: res.error }
    if (res.slip) onSlipChange(res.slip)
    return {}
  }

  async function saveRunner(key: string, amount: number | null): Promise<SaveResult> {
    if (amount === null) return clearOverride(key)
    const res = await setRunnerAmounts(slipId, [{ key, amount }])
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
    return {}
  }

  async function applyRunnerToEmpty(keys: string[], amount: number): Promise<SaveResult> {
    if (keys.length === 0) return {}
    const res = await setRunnerAmounts(slipId, keys.map(key => ({ key, amount })))
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
    return {}
  }

  return {
    saveCheckin, saveOverride, clearOverride, saveRunner, applyRunnerToEmpty,
    saving: pending.length > 0,
    pendingDates: new Set(pending.flatMap(p => p.dates)),
  }
}

/** ข้อมูลที่มุมมองรายวันทุกหน้าตาต้องใช้ — แตกจากสลิปชุดเดียว */
export interface DayView {
  days: DayRow<SlipCheckinRow>[]
  /** รหัสหน้าที่ → ชื่อไทย (แปลรหัสในบรรทัดค่าสตาฟ/รันเนอร์) */
  dutyName: Map<string, string>
  /** คีย์บรรทัดรันเนอร์ที่ยังไม่กรอกยอด — เป้าหมายของ "ใช้ยอดนี้กับวันที่ยังว่าง" */
  emptyRunnerKeys: string[]
  /** ช่องรันเนอร์ช่องเดียวในใบที่ได้ปุ่ม "ใช้ยอดนี้กับวันที่ยังว่าง" (null = ไม่มี) */
  applyRunnerKey: string | null
}

export function useDayView(
  slip: SlipDetail,
  checkins: SlipCheckinRow[],
  duties: SalaryDutyRow[],
  editable: boolean
): DayView {
  const days = groupSlipByDay(slip.lines, checkins, slip.warnings)
  const dutyName = new Map(duties.map(d => [d.code, d.name_th]))

  const runnerLines = days.flatMap(d => d.runnerLines)
  const emptyRunnerKeys = runnerLines.filter(isMissingAmount).map(l => l.key)
  const firstFilledRunner = runnerLines.find(l => !isMissingAmount(l))
  const applyRunnerKey =
    editable && firstFilledRunner && emptyRunnerKeys.length > 0 ? firstFilledRunner.key : null

  return { days, dutyName, emptyRunnerKeys, applyRunnerKey }
}
