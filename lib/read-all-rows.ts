/** เพดานแถวต่อคำขอของ PostgREST (db-max-rows ของ Supabase) */
export const PAGE_ROWS = 1000

type ReadError = { code?: string; message: string }

/**
 * อ่านทุกแถวทีละหน้า (PostgREST ตัดผลที่ 1,000 แถวต่อคำขอโดยไม่แจ้ง) จนได้หน้าที่ไม่เต็ม · พังหน้าไหนคืน error ทั้งชุด ไม่คืนครึ่งๆ
 * build(from, to) ต้องสร้างคำขอใหม่ทุกหน้าและเรียงแบบคงที่ (เช่น created_at + id)
 */
export async function readAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: ReadError | null }>,
): Promise<{ rows: T[]; error: ReadError | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await build(from, from + PAGE_ROWS - 1)
    if (error) return { rows: [], error }
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < PAGE_ROWS) return { rows, error: null }
  }
}
