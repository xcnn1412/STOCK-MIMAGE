// วัดเวลาและนับผลลัพธ์ของ getTrackingSnapshot (อ่านอย่างเดียว ไม่เขียนอะไรเลย)
// ใช้เทียบก่อน/หลังปรับคิวรี — Run: npx tsx scripts/tracking-snapshot-check.ts
import { config } from 'dotenv'
config({ path: '.env.local' })

import { getTrackingSnapshot, type TrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'

// getSessionLight() ใช้ cookies() ซึ่งเรียกนอก request ไม่ได้ — ส่ง session เปล่าเข้าไปแทน
const SESSION = { userId: undefined, role: undefined }

const counts = (s: TrackingSnapshot) =>
    `rows=${s.rows.length} poolJobs=${s.poolJobs.length} dutyClaims=${s.dutyClaims.length}` +
    ` people=${s.people.length} kits=${s.kits.length} kitBookings=${s.kitBookings.length}` +
    ` leadEvents=${s.leadEvents.length} roles=${s.roles.length}`

async function measure(label: string, includePast: boolean) {
    const started = Date.now()
    const snapshot = await getTrackingSnapshot({ includePast, session: SESSION })
    console.log(`${label}: ${Date.now() - started} ms · ${counts(snapshot)}`)
}

async function main() {
    // รอบอุ่นเครื่องไม่นับ — คิวรีแรกรวมเวลาต่อ connection เข้าไปด้วย
    await getTrackingSnapshot({ session: SESSION })
    for (let i = 1; i <= 3; i++) await measure(`default (ไม่รวมงานเก่า) รอบ ${i}`, false)
    await measure('includePast (ทุกงาน)      ', true)
    console.log('tracking-snapshot-check: ok')
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
