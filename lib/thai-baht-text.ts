/**
 * Convert a number to Thai Baht text
 * e.g. 1500.50 → "หนึ่งพันห้าร้อยบาทห้าสิบสตางค์"
 * e.g. 1500    → "หนึ่งพันห้าร้อยบาทถ้วน"
 */

const THAI_DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const THAI_POSITIONS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

function convertChunk(n: number): string {
  if (n === 0) return ''

  const str = String(n)
  const len = str.length
  let result = ''

  for (let i = 0; i < len; i++) {
    const digit = parseInt(str[i])
    const position = len - i - 1

    if (digit === 0) continue

    if (position === 0 && digit === 1 && len > 1) {
      result += 'เอ็ด'
    } else if (position === 1 && digit === 1) {
      result += 'สิบ'
    } else if (position === 1 && digit === 2) {
      result += 'ยี่สิบ'
    } else {
      result += THAI_DIGITS[digit] + THAI_POSITIONS[position]
    }
  }

  return result
}

export function numberToThaiBahtText(amount: number): string {
  if (amount === 0) return 'ศูนย์บาทถ้วน'
  if (isNaN(amount)) return ''

  const isNegative = amount < 0
  amount = Math.abs(amount)

  // Split into integer and decimal parts
  const [intPart, decPart] = amount.toFixed(2).split('.')
  const intNum = parseInt(intPart)
  const decNum = parseInt(decPart)

  let result = ''

  if (isNegative) result += 'ลบ'

  // Handle integer part — split into chunks of 6 digits for millions
  if (intNum === 0) {
    result += 'ศูนย์'
  } else {
    const millions = Math.floor(intNum / 1000000)
    const remainder = intNum % 1000000

    if (millions > 0) {
      // Recursively handle millions
      if (millions > 999999) {
        result += numberToThaiBahtText(millions).replace('บาทถ้วน', '').replace('บาท', '') + 'ล้าน'
      } else {
        result += convertChunk(millions) + 'ล้าน'
      }
    }

    if (remainder > 0) {
      result += convertChunk(remainder)
    }
  }

  result += 'บาท'

  if (decNum === 0) {
    result += 'ถ้วน'
  } else {
    result += convertChunk(decNum) + 'สตางค์'
  }

  return result
}
