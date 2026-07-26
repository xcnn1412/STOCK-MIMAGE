// ============================================================================
// Content Planner — ค่าคงที่ทั้งหมดของโมดูล (ใช้ร่วมกันทั้งฝั่ง server action และ view)
// 1 แถว = 1 โพสต์ ของแพลตฟอร์ม Facebook / Instagram / TikTok
// ============================================================================

export type PlatformKey = 'facebook' | 'instagram' | 'tiktok'
export type StatusKey = 'idea' | 'draft' | 'design' | 'ready' | 'scheduled' | 'published' | 'hold'

export interface Option<T extends string = string> {
  value: T
  th: string
}

// ---------------------------------------------------------------------------
// แพลตฟอร์ม — prefix ใช้สร้างรหัสโพสต์อัตโนมัติ (FB-001 / IG-001 / TT-001)
// ---------------------------------------------------------------------------
export const PLATFORMS: { value: PlatformKey; th: string; prefix: string }[] = [
  { value: 'facebook', th: 'Facebook', prefix: 'FB' },
  { value: 'instagram', th: 'Instagram', prefix: 'IG' },
  { value: 'tiktok', th: 'TikTok', prefix: 'TT' },
]

// เพจ/แบรนด์ที่ทีมดูแล — ใช้เป็นตัวเลือกในฟอร์ม (เพิ่ม/ลดได้ที่นี่ที่เดียว)
export const PAGES = [
  'imageautomat',
  'm-image',
  'princephotobooth',
  'rubkiancode',
  'ทิงนองนอย',
] as const

export const PLATFORM_PREFIX: Record<PlatformKey, string> = {
  facebook: 'FB',
  instagram: 'IG',
  tiktok: 'TT',
}

// ---------------------------------------------------------------------------
// สถานะ — เรียงตามลำดับการทำงานจริง ไอเดีย → โพสต์แล้ว (พัก = แขวนไว้)
// ---------------------------------------------------------------------------
export const STATUSES: Option<StatusKey>[] = [
  { value: 'idea', th: 'ไอเดีย' },
  { value: 'draft', th: 'ร่าง' },
  { value: 'design', th: 'ออกแบบ' },
  { value: 'ready', th: 'พร้อมโพสต์' },
  { value: 'scheduled', th: 'ตั้งเวลา' },
  { value: 'published', th: 'โพสต์แล้ว' },
  { value: 'hold', th: 'พัก' },
]

/** คลาสสีต่อสถานะ — เขียนเต็มสตริงเพราะ Tailwind ต้องเห็น class ตรงๆ ตอน build */
export const STATUS_STYLES: Record<StatusKey, { badge: string; chip: string; dot: string }> = {
  idea: {
    badge: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    chip: 'bg-zinc-500 text-white border-zinc-500 dark:bg-zinc-600 dark:border-zinc-600',
    dot: 'bg-zinc-400 dark:bg-zinc-500',
  },
  draft: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    chip: 'bg-amber-500 text-white border-amber-500 dark:bg-amber-600 dark:border-amber-600',
    dot: 'bg-amber-400 dark:bg-amber-500',
  },
  design: {
    badge: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900',
    chip: 'bg-violet-500 text-white border-violet-500 dark:bg-violet-600 dark:border-violet-600',
    dot: 'bg-violet-400 dark:bg-violet-500',
  },
  ready: {
    badge: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
    chip: 'bg-sky-500 text-white border-sky-500 dark:bg-sky-600 dark:border-sky-600',
    dot: 'bg-sky-400 dark:bg-sky-500',
  },
  scheduled: {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900',
    chip: 'bg-indigo-500 text-white border-indigo-500 dark:bg-indigo-600 dark:border-indigo-600',
    dot: 'bg-indigo-400 dark:bg-indigo-500',
  },
  published: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    chip: 'bg-emerald-500 text-white border-emerald-500 dark:bg-emerald-600 dark:border-emerald-600',
    dot: 'bg-emerald-400 dark:bg-emerald-500',
  },
  hold: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    chip: 'bg-rose-500 text-white border-rose-500 dark:bg-rose-600 dark:border-rose-600',
    dot: 'bg-rose-400 dark:bg-rose-500',
  },
}

// ---------------------------------------------------------------------------
// เสาหลักคอนเทนต์ (Content Pillar)
// ---------------------------------------------------------------------------
export const PILLARS: Option[] = [
  { value: 'educate', th: 'ให้ความรู้' },
  { value: 'entertain', th: 'ความบันเทิง' },
  { value: 'promotion', th: 'โปรโมชัน' },
  { value: 'behind_the_scenes', th: 'เบื้องหลัง' },
  { value: 'review', th: 'รีวิว/UGC' },
  { value: 'product', th: 'โปรดักต์' },
  { value: 'inspire', th: 'แรงบันดาลใจ' },
]

// ---------------------------------------------------------------------------
// เป้าหมายของโพสต์ (Objective)
// ---------------------------------------------------------------------------
export const OBJECTIVES: Option[] = [
  { value: 'awareness', th: 'การรับรู้' },
  { value: 'engagement', th: 'มีส่วนร่วม' },
  { value: 'traffic', th: 'ทราฟฟิก' },
  { value: 'sales', th: 'ยอดขาย' },
  { value: 'community', th: 'คอมมูนิตี้' },
]

// ---------------------------------------------------------------------------
// รูปแบบโพสต์ — ต่างกันตามแพลตฟอร์ม
// ---------------------------------------------------------------------------
export const FORMATS: Record<PlatformKey, Option[]> = {
  facebook: [
    { value: 'reel', th: 'Reel' },
    { value: 'photo', th: 'โพสต์รูปภาพ' },
    { value: 'album', th: 'อัลบั้มรูป' },
    { value: 'video', th: 'วิดีโอ' },
    { value: 'story', th: 'สตอรี่' },
    { value: 'link', th: 'ลิงก์' },
  ],
  tiktok: [
    { value: 'video', th: 'วิดีโอ' },
    { value: 'album', th: 'อัลบั้มรูป' },
    { value: 'story', th: 'สตอรี่' },
  ],
  instagram: [
    { value: 'reel', th: 'Reel' },
    { value: 'single', th: 'โพสต์รูปเดี่ยว' },
    { value: 'carousel', th: 'อัลบั้มรูป (Carousel)' },
    { value: 'story', th: 'สตอรี่' },
  ],
}

// ---------------------------------------------------------------------------
// Helpers — แปลง value → ป้ายภาษาไทย (คืน value เดิมถ้าไม่รู้จัก)
// ---------------------------------------------------------------------------
export function labelOf(options: Option[], value: string | null | undefined): string {
  if (!value) return ''
  return options.find(o => o.value === value)?.th || value
}

export function statusLabel(value: string | null | undefined): string {
  if (!value) return ''
  return STATUSES.find(s => s.value === value)?.th || value
}

export function statusStyle(value: string | null | undefined) {
  return STATUS_STYLES[(value as StatusKey)] || STATUS_STYLES.idea
}

export function formatLabel(platform: string, value: string | null | undefined): string {
  if (!value) return ''
  const list = FORMATS[platform as PlatformKey] || []
  return list.find(f => f.value === value)?.th || value
}

// ---------------------------------------------------------------------------
// รูปทรงข้อมูลของ 1 โพสต์
// ---------------------------------------------------------------------------
export interface ContentPost {
  id: string
  platform: PlatformKey
  post_code: string
  post_date: string | null
  post_time: string | null
  format: string | null
  status: StatusKey
  pillar: string | null
  objective: string | null
  topic: string | null
  hook: string | null
  caption: string | null
  cta: string | null
  link: string | null
  hashtags: string | null
  music: string | null
  asset_link: string | null
  owner: string | null
  page: string | null
  post_url: string | null
  example_images: string[] | null
  example_video_url: string | null
  example_post_url: string | null
  reach: number | null
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}
