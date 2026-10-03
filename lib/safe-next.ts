/** หน้าที่จะพากลับหลัง login (?next=) — รับเฉพาะ path ภายในเว็บ กัน open redirect ไปเว็บอื่น */
export function safeNext(value: unknown): string {
  const next = typeof value === 'string' ? value : ''
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/login')) return '/dashboard'
  return next
}
