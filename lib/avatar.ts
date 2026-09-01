// ตรรกะกลางของรูปโปรไฟล์ (profiles.avatar_url) — ใช้ทั้ง /profile (แก้ของตัวเอง)
// และ /users (แอดมินแก้แทน) เก็บใน bucket doc-assets path avatars/{userId}
// ไฟล์นี้เป็น server-only helper ไม่ใช่ server action — ผู้เรียกต้องเช็คสิทธิ์เองก่อน
import { createServiceClient, removeStorageByUrls } from '@/lib/supabase-server'

const AVATAR_BUCKET = 'doc-assets'
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** อัปโหลดรูปโปรไฟล์ของ userId — upsert ทับ path เดิม + cache-buster (CDN จะได้ไม่คืนรูปเก่า) */
export async function saveAvatar(userId: string, file: unknown): Promise<{ error?: string; url?: string }> {
    if (!(file instanceof File) || file.size === 0) return { error: 'ไม่พบไฟล์' }
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : null
    if (!ext) return { error: 'รองรับเฉพาะไฟล์ PNG หรือ JPG' }
    if (file.size > AVATAR_MAX_BYTES) return { error: 'ไฟล์ต้องไม่เกิน 2MB' }

    const supabase = createServiceClient()
    const path = `avatars/${userId}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: true })
    if (upErr) return { error: upErr.message }

    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)
    const url = `${pub.publicUrl}?v=${Date.now()}`

    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
    if (error) {
        console.error('saveAvatar:', error)
        return { error: 'บันทึกรูปโปรไฟล์ไม่สำเร็จ' }
    }
    return { url }
}

/** ลบรูปโปรไฟล์ของ userId — ล้างทั้งคอลัมน์และไฟล์ใน storage */
export async function clearAvatar(userId: string): Promise<{ error?: string; success?: boolean }> {
    const supabase = createServiceClient()
    const { data: current } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', userId)
        .single()

    const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
    if (error) {
        console.error('clearAvatar:', error)
        return { error: 'ลบรูปโปรไฟล์ไม่สำเร็จ' }
    }

    // ตัด ?v=... ออกก่อน เพราะ removeStorageByUrls แปลง URL เป็น path ตรงๆ
    const storedUrl = current?.avatar_url?.split('?')[0]
    await removeStorageByUrls(supabase, AVATAR_BUCKET, [storedUrl])
    return { success: true }
}
