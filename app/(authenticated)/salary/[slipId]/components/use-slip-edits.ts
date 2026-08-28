'use client'

// ============================================================================
// ตัวห่อ action + การแตกข้อมูลของมุมมองรายวัน
// ใช้ร่วมกันทั้งตารางเดสก์ท็อปและการ์ดมือถือ — spec: docs/specs/salary-slip-daily-ui.md
//
// useSlipEdits: ทุกตัวคืน SaveResult ({} = สำเร็จ) ให้ช่องใน inline-cells ใช้ตรงๆ
// และส่งสลิปที่คำนวณใหม่แล้วกลับผ่าน onSlipChange — ไม่มีปุ่ม "คำนวณใหม่" ให้กดเอง
// การแก้ "เช็คอิน" ต้อง router.refresh() ด้วย เพราะ action คืนมาแค่สลิป
// ส่วนแถวเช็คอิน/อีเวนต์มาจาก server component ของหน้าเพจ — และต้อง refresh
// แม้ตอน error ด้วย เพราะการแก้อาจสำเร็จแล้วแต่ขั้น "คำนวณใหม่" ล้ม
//
// useDayView: แตกสลิป+เช็คอินเป็นแถวรายวัน + ตารางชื่อหน้าที่ + คีย์รันเนอร์
// (ตารางกับการ์ดเคยคำนวณชุดนี้ซ้ำกันคนละที่)
// ============================================================================

import { useRouter } from 'next/navigation'
import {
  clearSlipLineOverride, editSlipCheckin, overrideSlipLine, setRunnerAmounts,
  type SlipCheckinPatch, type SlipCheckinRow, type SlipDetail,
} from '../../actions'
import { groupSlipByDay, isMissingAmount, type DayRow } from '../../compute'
import type { SalaryDutyRow } from '../../settings/actions'
import type { SaveResult } from './inline-cells'

export interface SlipEdits {
  saveCheckin: (checkinId: string, patch: SlipCheckinPatch) => Promise<SaveResult>
  saveOverride: (key: string, amount: number, note: string) => Promise<SaveResult>
  clearOverride: (key: string) => Promise<SaveResult>
  /** null = ล้างยอดรันเนอร์กลับเป็น "ยังไม่กรอก" */
  saveRunner: (key: string, amount: number | null) => Promise<SaveResult>
  /** "ใช้ยอดนี้กับวันที่ยังว่าง" — ตัวเรียกส่งคีย์ของบรรทัดที่ยังว่างมาให้ */
  applyRunnerToEmpty: (keys: string[], amount: number) => Promise<SaveResult>
}

export function useSlipEdits(
  slipId: string,
  onSlipChange: (slip: SlipDetail) => void
): SlipEdits {
  const router = useRouter()

  async function saveCheckin(checkinId: string, patch: SlipCheckinPatch): Promise<SaveResult> {
    const res = await editSlipCheckin(slipId, checkinId, patch)
    // ล้มเหลวก็ต้อง refresh — เช็คอินอาจถูกแก้ไปแล้วแต่คำนวณใหม่ไม่ผ่าน
    // ถ้าไม่ดึงของจริงมา หน้าจอจะเด้งกลับเป็นค่าเก่าที่ไม่ตรงกับฐานข้อมูล
    router.refresh()
    if ('error' in res) return { error: res.error }
    onSlipChange(res.slip)
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

  return { saveCheckin, saveOverride, clearOverride, saveRunner, applyRunnerToEmpty }
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
