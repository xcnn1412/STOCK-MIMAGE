// ชุดเอกสารใบเบิก (lib/claim-bundle.ts) — ประกอบชุดจากข้อมูลสังเคราะห์ แล้วตรวจด้วยการเปิด PDF ผลลัพธ์ด้วย pdf-lib
// Run:  npx tsx scripts/claim-bundle.check.ts      (ต้องรันจาก repo root; ฟอนต์อ่านจาก ./public/fonts)
//
// ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่าย: PDF แนบสร้างด้วย pdf-lib, รูป JPEG/PNG ฝังเป็น base64 ในไฟล์นี้
// (ไล่สี + มุมบนซ้ายดำ "TL" + ลูกศร "UP" — เปิดไฟล์ตัวอย่างแล้วเห็นได้ว่ารูปตั้งตรงไหม), EXIF สร้างเองในโค้ด
// ครอบคลุม AC2–AC8 และ AC23 ของ docs/specs/claim-document-bundle.md · ชื่อคน/บัญชีทั้งหมดสังเคราะห์
// ไฟล์ตัวอย่างให้คนเปิดดู: <tmp>/claim-bundle-check/sample-one.pdf, sample-two.pdf, sample-duplex.pdf
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-bundle: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PDFArray, PDFDocument, PDFName, StandardFonts, degrees, rgb } from 'pdf-lib'
import {
  A4, BundleTooLargeError, buildBundle, jpegOrientation, placeImage, planPages, sniffFileType,
  type Box, type BundleClaimInput, type BundleFileKind, type BundleInputFile, type BundleOptions,
  type PlanClaim, type PlanContent, type PlannedPage, type Placement,
} from '../lib/claim-bundle'
import { renderVoucherPdf } from '../lib/claim-voucher'
import { STRIP_H } from '../components/pdf/bundle-chrome-pdf'

const OUT_DIR = path.join(os.tmpdir(), 'claim-bundle-check')
const EPS = 1e-6
const pass = (label: string) => console.log(`PASS  ${label}`)

// ── ไฟล์สังเคราะห์ ────────────────────────────────────────────────────────────
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

/** JPEG 160×100 (แนวนอน) ไม่มี EXIF — ไล่สีน้ำเงิน→เหลือง มุมบนซ้ายดำ "TL" ลูกศรแดงชี้ขึ้น */
const JPEG = b64(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAA0JCgsKCA0LCwsPDg0QFCEVFBISFCgdHhghMCoyMS8qLi00O0tANDhHOS0uQllCR05QVFVUMz9dY1' +
  'xSYktTVFH/2wBDAQ4PDxQRFCcVFSdRNi42UVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVH/wAARCABk' +
  'AKADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhBy' +
  'JxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKT' +
  'lJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAA' +
  'AAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRom' +
  'JygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExc' +
  'bHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgdMhs7q/aLUNTOnwYJ83yml57DaOa3te8MabotsrP4laW5lhE' +
  '0EP2Nx5inp824gfjXJSf6xvqa7D4if8AH5on/YNh/mavdr1/zEt/l/kY/ijR38PawdP+2NcYjV9+3Z1HTGTVPSnc6nbguxG71rvfHnhLXtY8Rt' +
  'eafY+dAYUUP5qLyBzwWBrgtOjeHWYopBh0k2sPQiog3dX7/qD2udmtSrUS1KtdsjFEi1KtRLUq1jIpEq1ItRrUi1jItEq1KtRLUq1jIpEi1KtR' +
  'LUq1jIpEq1ItRrUi1hItEq1KtRLUq1jIpEi1KtRLUq1jItHz1J/rG+pptWmsbouxEDYJo/s+8/593r6Fwl2OS6KtXNJ/5Clv/v0n9m3v/Pu9Wt' +
  'N0+7j1CCR4HVVbJJ7URjK60E2rHWLUq1EtSrXVIyRItSrUS1KtYyKRKtZ+taj9kt/Kib99IP8AvketWbm5S0t2mk6DoPU+lchcTyXM7zSHLMc1' +
  'y1Z20R6OCw/tJc8tkdD4c1LeBZTN8w/1ZPceldGteco7RuroxVlOQR2Ndxo+oLqFoH4Eq8OvofWsYyurGmMw/K/aR2ZpLUq1EtSrUyOFEq1ItR' +
  'rUi1hItEq1KtRLUq1jIpEi1KtRLUq1jItHky1KtRLUq19xI8lEi1KtRLUq1jIslWpVqJalWsJFIkWpAQBknAFRrWXrV9tX7LEeT98jsPSuepJR' +
  'V2dFGk6s1FFHVb43lxhT+6ThR6+9UaKK85tt3Z9JCCpxUY7IKt6ZfPp94sy8r0dfUVUopDlFSVmek28qTwpLGwZHGQRVha43wzqn2eYWczfupD' +
  '8hP8Lf/Xrslptng1qLpT5WSrUi1gaZq9xdeGptSkSITRrIQqg7flzjvnt61BLrmpvbaL9kjtPtGoKS3mhtikAHjBz6+tQ4O9iP6+46talWue0j' +
  'U9QbWJtK1OO289IhMr2xbbjOMHPeuhWsJqxSZItSrUS1Ktc8i0eTLUq1EtSrX3EjyUSLUq1EtSrWMiyValWolqVawkUiRaqnSLR2LNvLE5J3Va' +
  'WpVrCcU9zaFScPhdikNDsj/C//AH1XNSqEldR0DECu3WuJuP8Aj4k/3j/OuOtFK1j1sBUnNy5ncjrroPD+nyQxuyyZZQT8/tXI16Haf8e0X+4P' +
  '5VlFF42pKCjyuxQHhvTf7sn/AH3W3EmyNU3FsDGWOSaYtSrSkeZKpOfxO5yVvJe6bo93oh0m9lmYyJHLHHujYN0Jbt1qze6K0w8OWNzbNNDErJ' +
  'cbAdq/KOpHTkV1K1ItS521D+vvK2laPp+kq4sbZYd5yxyWJ/EkmtNaiWpVrmk29WUiRalWolqVawkWjyZalWolqVa+4keSiRalWolqVaxkWSrU' +
  'q1EtSrWEikSLUq1EtSrWMikSrXE3H/HxJ/vH+ddstcTcf8fEn+8f51x1+h62W7y+RHXodp/x7Rf7g/lXnleh2n/HtF/uD+VZQNMw2iWVqVaiWp' +
  'VpSPMRKtSLUa1ItYSLRKtSrUS1KtYyKRItSrUS1KtYyLR5MtSrUS1KtfcSPJRItSrUS1KtYyLJVqVaiWpVrCRSJFqVaiWpVrGRSJVrm5dDvnld' +
  'gqYLEj5q6RakWuecVLc6aNeVG/L1OWHh/UD/AAx/9912FupSGND1VQD+VNWpVrHlS2Lq4ida3N0JFqVaiWpVrORkiVakWo1qRawkWiValWolqV' +
  'axkUiRalWolqVaxkWjyZalWiivuJHkokWpVoorGRZKtSrRRWEikSLUq0UVjIpEq1ItFFYyLRKtSrRRWMikSLUq0UVjIpEq1ItFFYSLRKtSrRRW' +
  'MikSLUq0UVjItH//2Q=='
)
/** PNG 120×90 — ไล่สีเขียว→ขาว มุมบนซ้ายดำ "TL" ลูกศรแดงชี้ขึ้น */
const PNG = b64(
  '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'
)

/**
 * ภาพที่กล้อง "เก็บตะแคง/กลับหัว" คู่กับ EXIF ที่สั่งหมุนกลับ (สร้างจากภาพเดียวกับ JPEG ข้างบน)
 * แก้ตาม EXIF ถูกต้อง = ในไฟล์ตัวอย่าง มุม TL อยู่บนซ้ายและลูกศร UP ชี้ขึ้นทุกรูป
 */
const STORED_FOR_EXIF: Record<3 | 6 | 8, Uint8Array> = {
  // 160×100 หมุน 180°
  3: b64(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAA0JCgsKCA0LCwsPDg0QFCEVFBISFCgdHhghMCoyMS8qLi00O0tANDhHOS0uQllCR05QVFVUMz9dY1' +
    'xSYktTVFH/2wBDAQ4PDxQRFCcVFSdRNi42UVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVH/wAARCABk' +
    'AKADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhBy' +
    'JxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKT' +
    'lJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAA' +
    'AAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRom' +
    'JygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExc' +
    'bHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDuGqJqlaomrwYnUyNqiapWqJq2iQyJqjapGqNq2iSyJqiapWqJ' +
    'q3iQyNqiapJCFBJ6AZP5VnNq2n/8/cf51qgUZS2RYao2qD+07FiALlMkgCp2rePkTKMo/ERNUTVK1RNW0TJkbVE1StUTVtElkTVE1StUTVvEkj' +
    'aomqVqiatokM9ZaomqVqiavh4nrMjaomqVqiatokMiao2qRqjatoksiaomqVqiat4kMrXf/HtN7of5V57xjpXoV3/x7S/7h/lXnnanM9PL9pEl' +
    'v/x8R/7w/nXbNXEwf8fEf+8P512zVrQ6mWY7xImqJqlaomrsieUyNqiapWqJq2iSyJqiapWqJq3iSRtUTVK1RNW0SGestUTVK1RNXw8T1mRtUT' +
    'VK1RMOP8mtkQyJqjaqseq20s99EdyfYsea7AbcEZ455rOj8UWUssQa2vIYZm2pPLDiNiemDmumMGSazVE1St9aiNXEh+ZWu/8Aj2l/3D/KvPO1' +
    'eh3f/HtN7If5V552qpM9PL9pWJYP+PiP/eH867Vq4q3/ANfH/vD+ddq1a0OpnmO8bkTVE1SsDUTV2RseSyNqiapWqJq2iSyJqiapWqJq3iSRtU' +
    'TVK1RNW0SGestUTVK1RNXw8T1mRtXMa/qVzHrMFhHfw6bE0Xmm5lRWDHONvzcZrp2qnd2dtdqFureKcKSQJEDY+ldNJpO7M2cRbOxs/FDNeJes' +
    'Y1zOoAD/ACtzxx+R7Vb1zjwLaY+X5Ifz4rpU0+xhjkjis7dI5Bh0WJQGHuMc9e9JLa28kAgeCJoRgCMoNox046fpXT7RXEJKm+Nk3FdwxleDXE' +
    'X13q1ldvby3cmV6H+8OxruWrH17TBqFqSgAni5Q+o7ihG+HqRhP3tjk21bUGBDXchByCM1SpSCpIYYI4IPakpHsxjFL3Rykggg4I6VZ/tK9/5+' +
    'HqpT442lkWNBlmOAKabWwpRi/i6Glp8t9eXGzz38tTljW21Ms7VbO2EajnqT6mntXoUouK1PAxNRTm+XYjaomqVqiaumJxsiaomqVqiat4kkbV' +
    'E1StUTVtEhnrLVE1StUTV8PE9ZkbVE1StUTVtEhkTVG1SNUbVtElkTVE1StUTVvEhnK+JtM2sb6FRtPEgHY+tc8RXo0qK6FHUFSMEH0rh9V086' +
    'fdlMExMcofb0olHqj1cHiOZcj3KPvXQ6LYeTH9plXEjj5R6CqOi6f9rn851zDGefc+ldM1a0oXd2Z47EWXs4/MiaomqVqiau2J47I2qJqlaomr' +
    'aJLMy41a0gmaJy+5Tg4WoDrNmf4n/75rF1XjU7j/fqnWTrSTdi1BWOjOsWZ7v/AN81GdVtTwC35VgZpyffX601iZh7NH0I1RNUrVE1fMRO5kbV' +
    'E1StUTVtEhkTVG1SNUbVtElkTVE1StUTVvEhkbVR1GyjvrYwycHqrf3TV5qiatlqrCUnF3RWhgjtoEhiXCqMfWhqkao2raJMm27siaomqVqiat' +
    'ombI2qJqlaomraJLOO1BUfWJVkfYhkwzYzgeuK6PTPCGh6tdi0sPFXnTlSwT+z3XgdeSwFczqv/ISn/wB810nwx58XKcceRJ/KuOejZstjI8Pa' +
    'F/bc17H9p8j7LbPcZ2bt23HHUY69ayE/1i/UV6F4B0DVI47++e1xb3lhJHC+9fmJIxxnI6dxXF6lpV9o9+LXUIfJmwG271bj6gkU7asD3Zqiai' +
    'ivn4nWyNqiaiitokMiao2ooraJLImqJqKK3iQyNqiaiitoksiao2ooraJLImqJqKK2iQyNqiaiitoks5TUoEbULgktnd61VMChSct0z19qKK5n' +
    'u/U2QqQIWHJ6ZpqxDKnJ/wD1UUULd+oPf5H/2Q=='
  ),
  // 100×160 หมุนทวนเข็ม 90° (EXIF 6 สั่งหมุนตามเข็ม 90°)
  6: b64(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAA0JCgsKCA0LCwsPDg0QFCEVFBISFCgdHhghMCoyMS8qLi00O0tANDhHOS0uQllCR05QVFVUMz9dY1' +
    'xSYktTVFH/2wBDAQ4PDxQRFCcVFSdRNi42UVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVH/wAARCACg' +
    'AGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhBy' +
    'JxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKT' +
    'lJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAA' +
    'AAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRom' +
    'JygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExc' +
    'bHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDuN1G6ot1G6vB5TquS7qN1RbqN1HKFyXdRuqLdRuo5QuS7qN1R' +
    'bqN1HKFyXdRuqLdRuo5QuS7qN1RbqN1HKFyXdRUW6ijlC5Huo3VFuo3VtykXJd1G6ot1G6jlC5Luo3VFurE1TVNRXVU03S4IHn8gzu07HG3djA' +
    'x3q40+YGzoN1G6s3RtSGqaVBehCnmg5U9iCQf1Wru6pcbOzC5Luo3VFuo3UuULku6jdUW6jdRyhcl3UVFuoo5QuRbqN1R7qN1bcpNyTdRuqPdR' +
    'uo5QuSbq5rXooU1lLv8At1NOn+ziPaVDFk3E55Pr7dq6HdWJrOo6Ja3ax6lAkkxjDKTDv+XJ74PfdWlNO+gf13KWh2nktBbWXihJoYm3/Z0Rfm' +
    'XOSOpPNdZuri3n03UdR00aLZFZY7lXkkjh2BUH3gT712G6nUV9w/rsSbqN1R7qN1ZcoXJN1G6o91G6jlC5JuoqPdRRyhci3Ubqi3Ubq35SLku6' +
    'jdUW6jdRyhcl3UbqrzTxwRtJLIERRkk1y2q+IZbndDZkxRdC/wDE3+FJo2o0Z1HaJ16SI+7YwO0lTjsRTt1YXhc/8Sdf99q2N1HKRUjyTcexLu' +
    'o3VFuo3U+Ui5Luo3VFuo3UcoXJd1FRbqKOULke6jdUW6jdW3KTcl3VR1LVrfT0+c7pSPlQdT9aytU18Juhsjluhk7D6VzruzuzuxdmOST1NZyk' +
    'lsehh8I5e9PRFi/1G51CTdM3yj7qDoKqUUVmetGKirI67w5NHHpKq8qKd7cFhWr9qg/57R/99CvPeKSqUjhqYJTk5c256H9qg/57R/8AfQo+1Q' +
    'f89o/++hXnlFPnI/s9fzHoqzxucJKjH0DCn7q4zw4cauuP7jV126rjqrnDiKXsZ8t7ku6iot1FVymFyLdRuqPdRurblJuZ+p6RDd7pYsRTfo31' +
    'rmriCW3lMcyFGHrXa7qgureG7j8uZcjse4+lZzpX1R3YfGSp+7PVHG80davahps1mSw+eLsw7fWqNczTTsz2ITjUXNF3Q9YncZVGI9QKPIm/55' +
    'P/AN8muk0A401f941pbq2jRur3OCpjnCbjy7HE+RN/zyb/AL5NHkTf88m/75Ndtuo3U/YeZn/aL/l/E5vQI3TVFLRsBtPJWuo3VHuo3VpGHKrH' +
    'FXre2lzWsSbqKj3UVXKY3It1G6ot1G6tuUi5Luo3VFuo3UcoXJCQQQeQax7/AEgNmW14PUp2P0rU3UbqmVNSVmbUq06TvFlXRQUsNrAhgxyDV/' +
    'dUW6jdTjCysTUnzzcu5Luo3VFuo3U+UzuS7qN1RbqN1HKFyXdRUW6ijlC5Huo3VFuo3Vtyk3Jd1G6ot1G6jlC5Luo3VFuo3UcoXJd1G6ot1G6j' +
    'lC5Luo3VFuo3UcoXJd1G6ot1G6jlC5LuoqLdRRyhc419TvRIwFy+ATSxX2ozSCOKaZ3PRV5Jq5ovhvUPEL3P2ARHyCN29wv3s4x+Vdh4P8F6zp' +
    'HiezvrxYBBDv3FZQTyjAcfU1xubva7NrLqcB/ad9/z8yfnVnTtQu5L+FJLh2VmwQe9ZVW9L/5CMH+9Vxk+ZaiaVjsN1G6ot1G6vQ5TAl3Ubqi3' +
    'UbqOUCXdRuqLdRuo5QJd1G6ot1G6jlAl3UVFuoo5QIPC2iQ6xo+uo7QRXEZg8qedsLHlm3c+4GKd/wAIJcf9B/R//Ak/4VgQajdWunX+nxKPIv' +
    'SnmZXn5GyuD9aobH/un8q87VdWdF35DKtab/yEIf8Aeqvsf+6fyqxYKwvYSVIG6iC95A9jqN1G6ot1G6vX5TkuS7qN1RbqN1HKFyXdRuqLdRuo' +
    '5QuS7qN1RbqN1HKFyXdRUW6ijlC5/9k='
  ),
  // 100×160 หมุนตามเข็ม 90° (EXIF 8 สั่งหมุนทวนเข็ม 90°)
  8: b64(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAA0JCgsKCA0LCwsPDg0QFCEVFBISFCgdHhghMCoyMS8qLi00O0tANDhHOS0uQllCR05QVFVUMz9dY1' +
    'xSYktTVFH/2wBDAQ4PDxQRFCcVFSdRNi42UVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVH/wAARCACg' +
    'AGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhBy' +
    'JxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKT' +
    'lJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAA' +
    'AAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRom' +
    'JygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExc' +
    'bHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDnttG2pdtG2va5jjsRbaNtS7aNtHMFiLbRtqXbRto5gsRbaNtS' +
    '7aNtHMFjM1cYsiRn7wrC3v8A3j+ddDrQxp5/3hXOGvOxL986Kew7e/8AeP51e0fT7vWNTi0+1YedLu27mwOFJP6A1Z8Pa7Jon2jy9Ps7vztuft' +
    'Me/bjPTnjOf0FdX4c8bpJrlul9pul2Vud26eOEqy/Kcc57nA/GsFfsXY4WJjtOWPX60U63YiM8jr3FFO77MLPyOq20bal20ba9HmOci20bal20' +
    'baOYCLbRtqXbRto5gIttG2pdtG2jmAytcGNOb/eFczXW6zbyT2BSJC7bgcCue/sy+P8Ay7SflXHWTcr2NYNWOm8F6jcaT4Y8SX9oVE8X2XYWXI' +
    '5dgePoTTf+FjeIRjL22P8AriK55bDUUjaNYZlR8blB4OOmaZ/Zl7/z7SflWHI30LuhLcAochevfFFWrfT7xYyDbPnNFVZ9n+IXOr20bal20ba6' +
    'uYxsRbaNtS7aNtHMFiLbRtqXbRto5gsRbaNtS7aNtHMFiLbRtqXbRto5gsRbaNtS7aNtHMFiLbRUu2ijmCxJto21Lto21jzFWIttG2pdtG2jmC' +
    'xFto21LtoC80c2g7EW2jbWJNfTWepzbMtHu5Q1sWl3DeJujbnup6iojVUnY6amGnBc1tB+2jbUu32o21fMctiLbRtqXbRto5gsRbaKl20UcwWJ' +
    'dtG2pNtVNVyumXBBIO3qDisebqaxjzS5SfbRtrifPmx/rX/76NHnzf8APVv++jWPt/I9H+zn/Mdtto21xXnzf89X/wC+jQJ5f+er/wDfRo9v5B' +
    '/Zz25ibVP+QlP/AL1V45HicPGxVh3FIWJOSSSe5NNrBu7uenGNo8u50Wnauk2Irnakh6N2NbAWuG+taem6vLabUmzLD6dx9K2hVa0Z52IwKfvU' +
    '/uOm20baLeaK5iEsLh1Pp2qTbW/MeW4tOzI9tFSbaKOYViXbVLWF/wCJTc/7laW2kKBhggEehANYXNIvlkmec8YFJXof2WD/AJ4Rj/gIo+ywf8' +
    '8Y/wDvkVnyHp/2gv5TzyivQ/ssH/PGP/vkUfZYP+eEZ/4CKHEP7QW/KeeUVd1hQurXKgAAP0AFUwCzBQCSegHeoPRjJOPMAFXtO0y41BhsUrED' +
    'zIen4Vp6V4dZsTXwIXqIh1P1rpUjVECIoVQOAOlVGPVnBiMYo6Q3KVjYQ2MPlwryfvMerVZ21Lto21te2x5Mm5O7IttFS7aKOYViTbRtqXbRtr' +
    'HmKsRbaNtS7aNtHMFiLbRjmpdtG2lzBbocNe2Vxe69dRW8ZY7+T0C/U10OlaJb6eocgSzkcuRgD6CtZIkTdsULuO449adtoudVTETnHl6EW2jb' +
    'Uu2jbT5jlsRbaNtS7aNtHMFiLbRUu2ijmCxLto21Jto21hzF2I9tG2pNtG2jmCxHtrE8WSPFpsCiZ4YZblI55EOCqHOTnt2rf21R1d5YrPEWnf' +
    'b97bWh3ADbgnPP0/WqhLUDn/7G8Kk5+2xnP/T1z/OuktIoo7SFICDCsahCDnK44578YrkHuLYPdK3hCINaKGmAkX5AQT6egJ/Cuw010m0y0ljj' +
    'EUbwoyoOigqCB+A4rSpewEu2jbUm2jbWPMFiPbRtqTbRto5gsR7aKk20UcwWJdtG2pdtG2seYqxFto21Lto20cwWIttAWpdtG2i4WOY1TQ9Skv' +
    'L2SwuIVi1CJY7gTA5XC7flx3xW3ZWq2llBaqxYQxrGGIxnAAzVzbRtq3VbVmK2pFto21Lto21HMOxFto21Lto20cwWIttFS7aKOYLEm2jbUu2j' +
    'bWPMXYi20bal20baOYLEW2jbUu2jbRzBYi20bal20baOYLEW2jbUu2jbRzBYi20bal20baOYLEW2ipdtFHMFj//Z'
  ),
}

/** แทรก APP1 (EXIF) ที่มีแค่ tag Orientation หลัง SOI — แบบที่กล้องมือถือใส่มา */
function withExif(jpeg: Uint8Array, orientation: number, littleEndian = false): Uint8Array {
  const tiff = new Uint8Array(26)
  const dv = new DataView(tiff.buffer)
  const le = littleEndian
  tiff.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0) // II / MM
  dv.setUint16(2, 42, le)
  dv.setUint32(4, 8, le) // IFD0 อยู่ถัดจาก header
  dv.setUint16(8, 1, le) // 1 entry
  dv.setUint16(10, 0x0112, le) // Orientation
  dv.setUint16(12, 3, le) // SHORT
  dv.setUint32(14, 1, le)
  dv.setUint16(18, orientation, le)
  dv.setUint32(22, 0, le) // ไม่มี IFD ถัดไป
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff] // "Exif\0\0"
  const len = payload.length + 2
  return Uint8Array.from([...jpeg.slice(0, 2), 0xff, 0xe1, len >> 8, len & 0xff, ...payload, ...jpeg.slice(2)])
}

/** PDF ทดสอบ (สร้างด้วย pdf-lib) — กรอบดำ มุมบนซ้ายดำ และป้ายชื่อหน้า (ASCII) */
async function makePdf(sizes: [number, number][], label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  sizes.forEach(([w, h], i) => {
    const p = doc.addPage([w, h])
    p.drawRectangle({ x: 4, y: 4, width: w - 8, height: h - 8, borderColor: rgb(0, 0, 0), borderWidth: 2, color: rgb(0.93, 0.95, 1) })
    p.drawRectangle({ x: 4, y: h - 44, width: 40, height: 40, color: rgb(0, 0, 0) })
    const size = Math.min(14, w / 18)
    p.drawText(`${label} ${i + 1}/${sizes.length}`, { x: 50, y: h - 30, size, font })
    p.drawText(`${Math.round(w)} x ${Math.round(h)} pt`, { x: 50, y: h - 30 - size * 1.4, size, font })
  })
  return doc.save()
}

/** PDF ที่มี /Encrypt ใน trailer — pdf-lib เปิดไม่ได้ (EncryptedPDFError) */
async function makeEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([A4.w, A4.h])
  doc.context.trailerInfo.Encrypt = doc.context.register(
    doc.context.obj({ Filter: 'Standard', V: 1, R: 2, P: -4 })
  )
  return doc.save({ useObjectStreams: false })
}

/** PDF หน้าเดียวที่ไม่มี /Contents เลย (หน้าว่างที่ถูกต้องตามสเปก — pdf-lib ฝังตรงๆ ไม่ได้) */
async function makeBlankPagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([A4.w, A4.h])
  return doc.save()
}

/** PDF ที่ content stream บอกว่า FlateDecode แต่ข้างในเป็นขยะ — เปิดไฟล์ได้ แต่ถอดเนื้อหาหน้าไม่ได้ */
async function makeBadStreamPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([A4.w, A4.h])
  const junk = doc.context.stream(pseudoRandom(256, 7), { Filter: 'FlateDecode' })
  page.node.set(PDFName.of('Contents'), doc.context.register(junk))
  return doc.save()
}

/** PDF หน้า A4 แนวตั้งที่ตั้ง /Rotate 90 — viewer แสดงเป็นแนวนอน ชุดเอกสารต้องวางตามที่ viewer แสดง */
async function makeRotatedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await makePdf([[A4.w, A4.h]], 'Rotate 90'))
  doc.getPage(0).setRotation(degrees(90))
  return doc.save()
}

/** ไบต์สุ่มแบบกำหนดเมล็ด (ผลซ้ำได้ทุกครั้ง) ขึ้นต้น 0x00 ให้ไม่ชนหัวไฟล์ใด */
function pseudoRandom(n: number, seed = 20260929): Uint8Array {
  const out = new Uint8Array(n)
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    out[i] = x >>> 24
  }
  out[0] = 0x00
  return out
}

const WEBP = Uint8Array.from([
  ...Buffer.from('RIFF'), 0x24, 0x00, 0x00, 0x00, ...Buffer.from('WEBPVP8 '), 0x18, 0x00, 0x00, 0x00,
  ...new Array(24).fill(0),
])

// ── ตัวช่วยตรวจ ──────────────────────────────────────────────────────────────
/** สี่เหลี่ยมบนกระดาษของภาพหลังหมุนแบบเดียวกับ pdf-lib (หมุน degrees(-rotateDegrees) รอบจุดยึด) */
function drawnRect(p: Placement) {
  const a = (-p.rotateDegrees * Math.PI) / 180
  const pts = [[0, 0], [p.width, 0], [0, p.height], [p.width, p.height]].map(([u, v]) => [
    p.x + u * Math.cos(a) - v * Math.sin(a),
    p.y + u * Math.sin(a) + v * Math.cos(a),
  ])
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1])
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) }
}
/** มุมบนซ้ายของภาพต้นฉบับ (แถว 0 คอลัมน์ 0) ไปอยู่มุมไหนบนกระดาษ */
function whereIsStoredTopLeft(p: Placement): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
  const a = (-p.rotateDegrees * Math.PI) / 180
  const x = p.x - p.height * Math.sin(a)
  const y = p.y + p.height * Math.cos(a)
  const r = drawnRect(p)
  const near = (m: number, n: number) => Math.abs(m - n) < 1e-6
  const v = near(y, r.top) ? 'top' : 'bottom'
  const h = near(x, r.left) ? 'left' : 'right'
  return `${v}-${h}` as const
}
function assertInside(p: Placement, box: Box, label: string) {
  const r = drawnRect(p)
  assert.ok(r.left >= box.x - EPS && r.right <= box.x + box.width + EPS, `${label}: เกินกรอบแนวนอน`)
  assert.ok(r.bottom >= box.y - EPS && r.top <= box.y + box.height + EPS, `${label}: เกินกรอบแนวตั้ง`)
  assert.ok(Math.abs(r.right - r.left - p.shownWidth) < EPS, `${label}: shownWidth ไม่ตรงกับที่วาดจริง`)
  assert.ok(Math.abs(r.top - r.bottom - p.shownHeight) < EPS, `${label}: shownHeight ไม่ตรงกับที่วาดจริง`)
}
const isA4 = (w: number, h: number) => Math.abs(w - A4.w) <= 0.5 && Math.abs(h - A4.h) <= 0.5

const file = (kind: BundleFileKind, index: number, total: number, bytes: Uint8Array | null, extra: Partial<BundleInputFile> = {}): BundleInputFile =>
  ({ kind, index, total, bytes, ...extra })

const IMG: PlanContent = { type: 'image', width: 160, height: 100, orientation: 1 }
const PDF2: PlanContent = { type: 'pdf', pages: [{ width: A4.w, height: A4.h, rotation: 0 }, { width: A4.w, height: A4.h, rotation: 0 }] }
const FAIL: PlanContent = { type: 'failed', reason: 'unsupported' }
const pf = (kind: BundleFileKind, index: number, total: number, content: PlanContent, note?: string) =>
  ({ kind, index, total, content, ...(note ? { note } : {}) })

/** ป้าย [ชนิด, ลำดับ] ของทุกหน้าที่ไม่ใช่ใบเบิก (หน้าคู่ = ทั้งสองไฟล์) */
function sequence(plan: PlannedPage[], claims: PlanClaim[]): string[] {
  return plan.flatMap(p => {
    const c = claims[p.claim]
    if (p.type === 'voucher') return [`voucher ${p.voucherPage + 1}`]
    if (p.type === 'blank') return ['blank']
    if (p.type === 'image') return [p.slots.map(s => `${c.files[s.file].kind} ${c.files[s.file].index}`).join(' + ')]
    if (p.type === 'pdf') return [`${c.files[p.file].kind} ${c.files[p.file].index} p${p.filePage + 1}`]
    return [`notice ${c.files[p.file].kind} ${c.files[p.file].index}`]
  })
}

async function pdfInfo(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return {
    doc,
    count: doc.getPageCount(),
    sizes: doc.getPages().map(p => p.getSize()),
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const A4x2 = await makePdf([[A4.w, A4.h], [A4.w, A4.h]], 'PDF A4')
  const LETTER_LANDSCAPE = await makePdf([[792, 612]], 'PDF Letter landscape')
  const THERMAL = await makePdf([[226, 1200]], 'Thermal')
  const TRUNCATED = A4x2.slice(0, Math.floor(A4x2.length * 0.6))
  const ENCRYPTED = await makeEncryptedPdf()
  const BLANK_PAGE = await makeBlankPagePdf()
  const BAD_STREAM = await makeBadStreamPdf()
  const ROTATED = await makeRotatedPdf()
  const RANDOM = pseudoRandom(4096)
  const JUNK_PREFIX_PDF = Uint8Array.from([...Buffer.from('garbage-before-header\n'), ...A4x2])

  // ── ชนิดไฟล์จากหัวไฟล์ (AC6: ดูเนื้อไฟล์ ไม่ดูนามสกุล) ─────────────────────────────
  assert.equal(sniffFileType(JPEG), 'jpeg')
  assert.equal(sniffFileType(withExif(JPEG, 6)), 'jpeg')
  assert.equal(sniffFileType(PNG), 'png')
  assert.equal(sniffFileType(A4x2), 'pdf')
  assert.equal(sniffFileType(JUNK_PREFIX_PDF), 'pdf')
  assert.equal(sniffFileType(TRUNCATED), 'pdf')
  assert.equal(sniffFileType(WEBP), 'unsupported')
  assert.equal(sniffFileType(RANDOM), 'unsupported')
  assert.equal(sniffFileType(new Uint8Array(0)), 'unsupported')
  pass('sniffFileType — JPEG / JPEG+EXIF / PNG / PDF / PDF มีขยะนำหน้า ถูกชนิด · WebP / ไบต์สุ่ม / ไฟล์ว่าง = unsupported')

  // ── EXIF orientation ─────────────────────────────────────────────────────────
  assert.equal(jpegOrientation(JPEG), 1, 'ไม่มี EXIF → 1')
  for (let o = 1; o <= 8; o++) {
    assert.equal(jpegOrientation(withExif(JPEG, o)), o, `EXIF big-endian ${o}`)
    assert.equal(jpegOrientation(withExif(JPEG, o, true)), o, `EXIF little-endian ${o}`)
  }
  assert.equal(jpegOrientation(withExif(JPEG, 9)), 1, 'ค่านอกช่วง → 1')
  assert.equal(jpegOrientation(PNG), 1)
  assert.equal(jpegOrientation(RANDOM), 1)
  assert.equal(jpegOrientation(withExif(JPEG, 6).slice(0, 20)), 1, 'EXIF ขาดกลางทาง → 1 ไม่ throw')
  pass('jpegOrientation — ไม่มี EXIF = 1 · EXIF 1–8 ทั้ง MM/II อ่านถูก · ค่าเพี้ยน/ไฟล์ขาด/ไม่ใช่ JPEG = 1')

  // ── AC23: วางรูปตั้งตรงตาม EXIF ────────────────────────────────────────────────
  const onePlan = planPages([{ claimNumber: 'EXP-T', voucherPages: 0, files: [pf('receipt', 1, 1, IMG)] }], { layout: 'one', duplex: false })
  const FULL_BOX = (onePlan[0] as Extract<PlannedPage, { type: 'image' }>).slots[0].box
  const expected: Record<number, { rot: number; corner: string }> = {
    1: { rot: 0, corner: 'top-left' }, 2: { rot: 0, corner: 'top-left' },
    3: { rot: 180, corner: 'bottom-right' }, 4: { rot: 180, corner: 'bottom-right' },
    5: { rot: 270, corner: 'bottom-left' }, 6: { rot: 90, corner: 'top-right' },
    7: { rot: 90, corner: 'top-right' }, 8: { rot: 270, corner: 'bottom-left' },
  }
  const smallBox: Box = { x: 100, y: 200, width: 90, height: 120 }
  for (let o = 1; o <= 8; o++) {
    for (const [box, name] of [[FULL_BOX, 'กรอบเต็มหน้า'], [smallBox, 'กรอบเล็ก 90×120']] as [Box, string][]) {
      const p = placeImage({ width: 160, height: 100, orientation: o }, box)
      const label = `orientation ${o} ${name}`
      assert.equal(p.rotateDegrees, expected[o].rot, `${label}: มุมหมุน`)
      assertInside(p, box, label)
      const turned = expected[o].rot % 180 !== 0
      // รูป 160×100 ที่ถ่ายแนวตั้ง (EXIF 5–8) ต้องออกมาเป็นแนวตั้งบนกระดาษ
      if (turned) assert.ok(p.shownHeight > p.shownWidth, `${label}: ต้องเป็นแนวตั้ง`)
      else assert.ok(p.shownWidth > p.shownHeight, `${label}: ต้องเป็นแนวนอน`)
      assert.ok(Math.abs(p.shownWidth / p.shownHeight - (turned ? 100 / 160 : 160 / 100)) < 1e-9, `${label}: สัดส่วน`)
      // มุมบนซ้ายของภาพที่เก็บ (แถว 0 คอลัมน์ 0) ต้องไปอยู่ตามความหมายของ EXIF
      assert.equal(whereIsStoredTopLeft(p), expected[o].corner, `${label}: มุมบนซ้ายของภาพต้นฉบับ`)
    }
  }
  // ไฟล์จริง: ภาพที่เก็บตะแคง/กลับหัว + EXIF → jpegOrientation อ่านได้ → placeImage วางออกมาเป็นแนวนอน 160×100 ตั้งตรง
  for (const o of [3, 6, 8] as const) {
    const bytes = withExif(STORED_FOR_EXIF[o], o)
    const stored = o === 3 ? { width: 160, height: 100 } : { width: 100, height: 160 }
    assert.equal(jpegOrientation(bytes), o)
    const p = placeImage({ ...stored, orientation: jpegOrientation(bytes) }, FULL_BOX)
    assert.equal(p.rotateDegrees, expected[o].rot)
    assertInside(p, FULL_BOX, `ไฟล์ EXIF ${o}`)
    assert.ok(Math.abs(p.shownWidth / p.shownHeight - 160 / 100) < 1e-9, `ไฟล์ EXIF ${o}: หลังแก้ต้องเป็นแนวนอน 16:10 เหมือนภาพจริง`)
  }
  // ไม่ขยายเกิน 2 เท่า · รูปใหญ่ย่อให้พอดี
  const tiny = placeImage({ width: 160, height: 100, orientation: 1 }, FULL_BOX)
  assert.ok(Math.abs(tiny.shownWidth - 320) < EPS && Math.abs(tiny.shownHeight - 200) < EPS, 'รูป 160×100 ต้องขยายไม่เกิน 320×200')
  const big = placeImage({ width: 4000, height: 3000, orientation: 6 }, FULL_BOX)
  assertInside(big, FULL_BOX, 'รูป 4000×3000 EXIF 6')
  assert.ok(Math.abs(big.shownWidth - FULL_BOX.width) < EPS || Math.abs(big.shownHeight - FULL_BOX.height) < EPS, 'รูปใหญ่ต้องเต็มกรอบด้านใดด้านหนึ่ง')
  pass('AC23 placeImage — EXIF 3/6/8 หมุน 180/90/270 · 2/4/5/7 ใช้มุมของแบบไม่กลับด้าน · มุมบนซ้ายของภาพต้นฉบับไปอยู่ถูกมุม · ขนาดหลังหมุนอยู่ในกรอบ · ไม่ขยายเกิน 2 เท่า')

  // ── AC4: ลำดับชนิด + ข้อความแถบ ──────────────────────────────────────────────
  const orderClaim: PlanClaim = {
    claimNumber: 'EXP-202609-301', voucherPages: 2, files: [
      pf('tax_invoice', 1, 2, IMG, 'INV-2026-0001'),
      pf('receipt', 1, 2, IMG),
      pf('refund_slip', 1, 1, PDF2),
      pf('settlement', 1, 1, IMG),
      pf('receipt', 2, 2, FAIL),
      pf('tax_invoice', 2, 2, IMG),
    ],
  }
  const orderPlan = planPages([orderClaim], { layout: 'one', duplex: false })
  assert.deepEqual(sequence(orderPlan, [orderClaim]), [
    'voucher 1', 'voucher 2', 'receipt 1', 'notice receipt 2', 'settlement 1',
    'tax_invoice 1', 'tax_invoice 2', 'refund_slip 1 p1', 'refund_slip 1 p2',
  ])
  const texts = orderPlan.flatMap(p => (p.type === 'image' ? p.slots.map(s => s.strip.text) : p.type === 'pdf' || p.type === 'notice' ? [p.strip.text] : []))
  assert.deepEqual(texts, [
    'EXP-202609-301 · ใบเสร็จ/เอกสารแนบ 1/2 · หน้า 3/9',
    'EXP-202609-301 · ใบเสร็จ/เอกสารแนบ 2/2 · หน้า 4/9',
    'EXP-202609-301 · ใบเสร็จเคลียร์เงินทดลองจ่าย 1/1 · หน้า 5/9',
    'EXP-202609-301 · ใบกำกับภาษี 1/2 · หน้า 6/9 · เลขที่ INV-2026-0001',
    'EXP-202609-301 · ใบกำกับภาษี 2/2 · หน้า 7/9',
    'EXP-202609-301 · สลิปคืนเงิน 1/1 · หน้า 8/9',
    'EXP-202609-301 · สลิปคืนเงิน 1/1 · หน้า 9/9',
  ])
  orderPlan.forEach((p, i) => {
    assert.ok(p.type !== 'blank')
    assert.equal(p.n, i + 1)
    assert.equal(p.N, 9)
  })
  pass('AC4 ลำดับในชุด ใบเบิก → receipt → settlement → tax_invoice → refund_slip และในชนิดเดียวกันตามลำดับเดิม · แถบ "<เลขที่> · <ชนิด> i/n · หน้า n/N" (+ เลขที่ใบกำกับ) นับจากหน้าแรกของใบเบิก')

  // ── แถบไม่ทับเนื้อหา ──────────────────────────────────────────────────────────
  for (const layout of ['one', 'two'] as const) {
    const plan = planPages([orderClaim, { claimNumber: 'EXP-X', voucherPages: 1, files: [pf('receipt', 1, 3, IMG), pf('receipt', 2, 3, IMG), pf('receipt', 3, 3, IMG)] }], { layout, duplex: false })
    for (const p of plan) {
      const slots = p.type === 'image' ? p.slots : p.type === 'pdf' ? [{ strip: p.strip, box: p.box, place: p.place }] : []
      for (const s of slots) {
        const stripBottom = A4.h - s.strip.top - STRIP_H
        assert.ok(s.box.y + s.box.height <= stripBottom + EPS, `${layout}: กรอบเนื้อหาต้องอยู่ใต้แถบ`)
        assertInside(s.place, s.box, `${layout}: เนื้อหาต้องอยู่ในกรอบ`)
      }
      if (p.type === 'image' && layout === 'two') {
        // สองช่องไม่ทับกัน: ช่องบนอยู่ครึ่งบนทั้งหมด ช่องล่างอยู่ครึ่งล่างทั้งหมด
        assert.ok(p.slots[0].box.y >= A4.h / 2 && p.slots[0].strip.top === 0)
        if (p.slots[1]) assert.ok(p.slots[1].box.y + p.slots[1].box.height + STRIP_H <= A4.h / 2 + EPS && p.slots[1].strip.top === A4.h / 2)
      }
    }
  }
  pass('แถบหัวกระดาษไม่ทับเนื้อหา — กรอบเนื้อหาเริ่มใต้แถบทุกหน้า ทั้ง layout one / two · รูปคู่อยู่ครึ่งบน/ครึ่งล่างของตัวเอง')

  // ── AC3 (แผน): สองรูปต่อหน้า ────────────────────────────────────────────────────
  const imgs = (n: number, kind: BundleFileKind = 'receipt') => Array.from({ length: n }, (_, i) => pf(kind, i + 1, n, IMG))
  const two: BundleOptions = { layout: 'two', duplex: false }
  const runOf5 = planPages([{ claimNumber: 'A', voucherPages: 1, files: imgs(5) }], two)
  assert.deepEqual(sequence(runOf5, [{ claimNumber: 'A', voucherPages: 1, files: imgs(5) }]), [
    'voucher 1', 'receipt 1 + receipt 2', 'receipt 3 + receipt 4', 'receipt 5',
  ])
  const single = runOf5[3] as Extract<PlannedPage, { type: 'image' }>
  assert.equal(single.slots.length, 1)
  assert.ok(single.slots[0].strip.top === 0 && single.slots[0].box.y > A4.h / 2, 'รูปเดี่ยวที่เหลือต้องอยู่ครึ่งบน')
  for (let n = 1; n <= 7; n++) {
    const c = { claimNumber: 'A', voucherPages: 0, files: imgs(n) }
    assert.equal(planPages([c], two).length, Math.ceil(n / 2), `${n} รูปติดกัน → ceil(${n}/2) หน้า`)
    assert.equal(planPages([c], { layout: 'one', duplex: false }).length, n)
  }
  const mixed: PlanClaim = {
    claimNumber: 'B', voucherPages: 1,
    files: [...imgs(2), pf('receipt', 3, 3, PDF2), ...imgs(3, 'settlement')],
  }
  assert.deepEqual(sequence(planPages([mixed], two), [mixed]), [
    'voucher 1', 'receipt 1 + receipt 2', 'receipt 3 p1', 'receipt 3 p2', 'settlement 1 + settlement 2', 'settlement 3',
  ])
  const broken: PlanClaim = { claimNumber: 'C', voucherPages: 0, files: [pf('receipt', 1, 3, IMG), pf('receipt', 2, 3, FAIL), pf('receipt', 3, 3, IMG)] }
  assert.deepEqual(sequence(planPages([broken], two), [broken]), ['receipt 1', 'notice receipt 2', 'receipt 3'])
  const claimD: PlanClaim = { claimNumber: 'D', voucherPages: 1, files: imgs(3) }
  const claimE: PlanClaim = { claimNumber: 'E', voucherPages: 1, files: imgs(1) }
  const de = planPages([claimD, claimE], two)
  assert.deepEqual(sequence(de, [claimD, claimE]), ['voucher 1', 'receipt 1 + receipt 2', 'receipt 3', 'voucher 1', 'receipt 1'])
  assert.deepEqual(de.map(p => p.claim), [0, 0, 0, 1, 1], 'รูปของใบเบิกต่างใบไม่อยู่หน้าเดียวกัน')
  pass('AC3 (แผน) layout two — n รูปติดกันใช้ ceil(n/2) หน้า (n = 1..7) · รูปเดี่ยวที่เหลืออยู่ครึ่งบน · PDF หน้าละหน้า · PDF/ไฟล์รวมไม่ได้คั่นแล้วไม่จับคู่ · ใบเบิกต่างใบไม่ใช้หน้าร่วมกัน')

  // ── AC7 (แผน): ไฟล์ที่รวมไม่ได้ได้หน้าแจ้งอย่างละ 1 หน้า ────────────────────────────
  const reasons = ['fetch', 'foreign-host', 'too-large', 'unsupported', 'broken'] as const
  const failClaim: PlanClaim = {
    claimNumber: 'F', voucherPages: 1,
    files: reasons.map((reason, i) => pf('receipt', i + 1, reasons.length, { type: 'failed', reason })),
  }
  const failPlan = planPages([failClaim], { layout: 'one', duplex: false })
  const notices = failPlan.filter((p): p is Extract<PlannedPage, { type: 'notice' }> => p.type === 'notice')
  assert.deepEqual(notices.map(p => [p.file, p.reason]), reasons.map((r, i) => [i, r]))
  pass('AC7 (แผน) ไฟล์ที่รวมไม่ได้ 5 สาเหตุ → หน้าแจ้งไฟล์ละ 1 หน้า พร้อมสาเหตุเดิม')

  // ── หน้า PDF ที่มี /Rotate: วางตามที่ viewer แสดง ──────────────────────────────────
  for (const [rotation, want] of [[0, 0], [90, 90], [180, 180], [270, 270], [-90, 270], [450, 90]] as const) {
    const c: PlanClaim = { claimNumber: 'R', voucherPages: 0, files: [pf('receipt', 1, 1, { type: 'pdf', pages: [{ width: A4.w, height: A4.h, rotation }] })] }
    const p = planPages([c], { layout: 'one', duplex: false })[0] as Extract<PlannedPage, { type: 'pdf' }>
    assert.equal(p.place.rotateDegrees, want, `/Rotate ${rotation}`)
    assertInside(p.place, p.box, `/Rotate ${rotation}`)
    if (want % 180) assert.ok(p.place.shownWidth > p.place.shownHeight, `/Rotate ${rotation}: หน้าแนวตั้งที่หมุน 90 ต้องออกมาแนวนอน`)
  }
  pass('หน้า PDF ที่ตั้ง /Rotate 90/180/270 (รวม -90, 450) วางหมุนตามที่ viewer แสดง อยู่ในกรอบ')

  // ── AC8 (แผน): พิมพ์สองหน้า ──────────────────────────────────────────────────────
  const three: PlanClaim = { claimNumber: 'G', voucherPages: 1, files: imgs(2) }
  const next: PlanClaim = { claimNumber: 'H', voucherPages: 1, files: [] }
  const firstPageOf = (plan: PlannedPage[], ci: number) => plan.findIndex(p => p.claim === ci) + 1
  const dPlan = planPages([three, next], { layout: 'one', duplex: true })
  assert.equal(firstPageOf(dPlan, 1), 5)
  assert.equal(dPlan[3].type, 'blank')
  assert.equal(firstPageOf(planPages([three, next], { layout: 'one', duplex: false }), 1), 4)
  assert.equal(planPages([three], { layout: 'one', duplex: true }).length, 3, 'ใบเดียว: ไม่เติมหน้าว่าง')
  assert.equal(planPages([next, three], { layout: 'one', duplex: true }).length, 1 + 1 + 3, 'ไม่เติมหน้าว่างหลังใบสุดท้าย')
  const even: PlanClaim = { claimNumber: 'I', voucherPages: 2, files: imgs(2) }
  assert.equal(planPages([even, next], { layout: 'one', duplex: true }).length, 4 + 1, 'ชุดหน้าคู่ไม่ต้องเติม')
  assert.ok(dPlan.every(p => p.type === 'blank' || p.N === (p.claim === 0 ? 3 : 1)), 'หน้าว่างไม่นับใน N')
  pass('AC8 (แผน) duplex: ใบแรก 3 หน้า → ใบที่สองเริ่มหน้า 5 (ไม่ duplex: หน้า 4) · ใบเดียว / หลังใบสุดท้าย / ชุดหน้าคู่ ไม่เติมหน้าว่าง · หน้าว่างไม่นับใน N')

  // ── ประกอบ PDF จริง ────────────────────────────────────────────────────────────
  const voucher = await renderVoucherPdf({
    claimNumber: 'EXP-202609-201', date: '15 กันยายน 2569', payeeName: 'พนักงาน ทดสอบหนึ่ง',
    paymentMethod: 'transfer', bankName: 'ธนาคารทดสอบ', accountName: 'พนักงาน ทดสอบหนึ่ง', accountNumber: '000-0-00000-0',
    items: [{ no: 1, description: 'ค่าเช่าอุปกรณ์งานทดสอบ', amount: 1500 }],
    totalAmount: 1500, netAmount: 1500, receiverName: 'พนักงาน ทดสอบหนึ่ง', approverName: 'แอดมิน ทดสอบ',
  })
  const voucherInfo = await pdfInfo(voucher)
  const vp = voucherInfo.count
  assert.equal(vp, 1, 'หน้าใบเบิกปกติต้องมี 1 หน้า (ใช้สร้างเคส AC8)')

  // ใบเบิกที่มีไฟล์ครบทุกแบบ — ส่งเข้าแบบคละชนิดเพื่อพิสูจน์ว่าตัวประกอบเรียงเอง
  const X_FILES: BundleInputFile[] = [
    file('tax_invoice', 1, 6, LETTER_LANDSCAPE, { note: 'INV-2026-0001' }),
    file('receipt', 1, 8, JPEG), // เปรียบได้กับไฟล์ชื่อ slip.png ที่เนื้อเป็น JPEG (AC6)
    file('receipt', 2, 8, PNG),
    file('refund_slip', 1, 2, null, { failReason: 'too-large' }),
    file('receipt', 3, 8, withExif(STORED_FOR_EXIF[6], 6)),
    file('receipt', 4, 8, A4x2),
    file('settlement', 1, 2, withExif(STORED_FOR_EXIF[3], 3)),
    file('receipt', 5, 8, WEBP),
    file('receipt', 6, 8, RANDOM),
    file('tax_invoice', 2, 6, THERMAL),
    file('receipt', 7, 8, TRUNCATED),
    file('receipt', 8, 8, ENCRYPTED),
    file('settlement', 2, 2, null, { failReason: 'fetch' }),
    file('tax_invoice', 3, 6, null, { failReason: 'foreign-host' }),
    file('tax_invoice', 4, 6, BLANK_PAGE),
    file('tax_invoice', 5, 6, ROTATED, { note: 'INV-2026-0005' }),
    file('tax_invoice', 6, 6, BAD_STREAM),
    file('refund_slip', 2, 2, withExif(STORED_FOR_EXIF[8], 8, true)),
  ]
  const claimX: BundleClaimInput = { claimNumber: 'EXP-202609-201', voucher, files: X_FILES }
  const images = 5 // receipt 1,2,3 · settlement 1 · refund_slip 2
  // receipt 4 (A4×2) · tax_invoice 1 (Letter) · 2 (thermal) · 4 (หน้าว่างไม่มี /Contents) · 5 (/Rotate 90)
  const pdfPages = 2 + 1 + 1 + 1 + 1
  const failedExpected = [
    { kind: 'receipt', index: 5, reason: 'unsupported' },
    { kind: 'receipt', index: 6, reason: 'unsupported' },
    { kind: 'receipt', index: 7, reason: 'broken' },
    { kind: 'receipt', index: 8, reason: 'broken' },
    { kind: 'settlement', index: 2, reason: 'fetch' },
    { kind: 'tax_invoice', index: 3, reason: 'foreign-host' },
    { kind: 'tax_invoice', index: 6, reason: 'broken' }, // content stream เสีย — ต้องไม่ทำให้ทั้งชุด save ไม่ได้
    { kind: 'refund_slip', index: 1, reason: 'too-large' },
  ]

  // AC2 + AC5 + AC6 + AC7 — layout one
  const one = await buildBundle([claimX], { layout: 'one', duplex: false })
  fs.writeFileSync(path.join(OUT_DIR, 'sample-one.pdf'), one.pdf)
  const oneInfo = await pdfInfo(one.pdf)
  const expectOne = vp + images + pdfPages + failedExpected.length
  assert.equal(oneInfo.count, expectOne, `AC2: ${vp} + ${images} + ${pdfPages} + ${failedExpected.length}`)
  assert.equal(one.report.pages, oneInfo.count)
  assert.deepEqual(one.report.claims, [{ claimNumber: 'EXP-202609-201', pages: expectOne, included: 10, failed: failedExpected }])
  oneInfo.sizes.forEach((s, i) => {
    if (i < vp) assert.deepEqual(s, voucherInfo.sizes[i], 'หน้าใบเบิกต้องขนาดเดิม ไม่ย่อ')
    else assert.ok(isA4(s.width, s.height), `AC5: หน้า ${i + 1} ต้องเป็น A4 (ได้ ${s.width}×${s.height})`)
  })
  // หน้าใบเบิกคัดลอกตามเดิม: ไม่มี content stream เพิ่ม (ถ้ามีแถบจะกลายเป็น array ของหลาย stream)
  const srcContents = voucherInfo.doc.getPage(0).node.Contents()
  const outContents = oneInfo.doc.getPage(0).node.Contents()
  assert.equal(outContents instanceof PDFArray, srcContents instanceof PDFArray, 'หน้าใบเบิกต้องไม่มีอะไรวาดเพิ่ม')
  pass(`AC2 layout one: ${oneInfo.count} หน้า = ใบเบิก ${vp} + รูป ${images} + หน้า PDF แนบ ${pdfPages} + ไฟล์ที่รวมไม่ได้ ${failedExpected.length} · report.pages ตรง`)
  pass(`AC5 ทุกหน้าที่ไม่ใช่ใบเบิก (${oneInfo.count - vp} หน้า) เป็น A4 595.28×841.89 · หน้าใบเบิกขนาดเดิม ไม่มีแถบ`)
  pass('AC6 JPEG ที่นามสกุลหลอก (เนื้อเป็น JPEG) รวมเป็นรูปได้ ไม่อยู่ใน report.failed')
  pass('AC7 WebP / ไบต์สุ่ม → unsupported · PDF ขาด / PDF ล็อกรหัส / content stream เสีย → broken · ดึงไม่ได้ → fetch · เว็บอื่น → foreign-host · เกิน 15MB → too-large — อย่างละ 1 หน้าแจ้ง + 1 รายการใน report.failed · PDF หน้าว่าง (ไม่มี /Contents) และ /Rotate 90 รวมได้')

  // AC3 — layout two ของใบเดียวกัน
  const twoRes = await buildBundle([claimX], { layout: 'two', duplex: false })
  const twoInfo = await pdfInfo(twoRes.pdf)
  // ลำดับในชุด: r1 r2 r3 (รูป) · r4 PDF 2 หน้า · r5–r8 แจ้ง · s1 (รูป) · s2 แจ้ง · t1 t2 PDF · t3 แจ้ง · t4 t5 PDF · t6 แจ้ง
  //            · rf1 แจ้ง · rf2 (รูป)
  // → รูปติดกัน 3 รูป = 2 หน้า, รูปเดี่ยว s1 = 1, rf2 = 1
  const expectTwo = vp + (Math.ceil(3 / 2) + 1 + 1) + pdfPages + failedExpected.length
  assert.equal(twoInfo.count, expectTwo)
  assert.equal(twoRes.report.pages, twoInfo.count)
  assert.ok(twoInfo.sizes.slice(vp).every(s => isA4(s.width, s.height)), 'AC5 (layout two): หน้าที่ไม่ใช่ใบเบิกเป็น A4')
  // สองใบเบิกใน layout two: รูปเดี่ยวท้ายใบแรกไม่ถูกจับคู่กับรูปแรกของใบที่สอง
  const claimY: BundleClaimInput = {
    claimNumber: 'EXP-202609-202', voucher,
    files: [file('receipt', 1, 3, PNG), file('receipt', 2, 3, withExif(STORED_FOR_EXIF[6], 6)), file('receipt', 3, 3, JPEG)],
  }
  const claimZ: BundleClaimInput = { claimNumber: 'EXP-202609-203', voucher, files: [file('receipt', 1, 1, withExif(STORED_FOR_EXIF[8], 8))] }
  const yz = await buildBundle([claimY, claimZ], { layout: 'two', duplex: false })
  const yzInfo = await pdfInfo(yz.pdf)
  assert.equal(yzInfo.count, (vp + 2) + (vp + 1), 'Y: 3 รูป = 2 หน้า · Z: 1 รูป = 1 หน้า (ไม่รวมหน้ากับ Y)')
  assert.deepEqual(yz.report.claims.map(c => c.pages), [vp + 2, vp + 1])
  const sample2 = await buildBundle([claimX, claimY, claimZ], { layout: 'two', duplex: false })
  fs.writeFileSync(path.join(OUT_DIR, 'sample-two.pdf'), sample2.pdf)
  pass(`AC3 layout two: ${twoInfo.count} หน้า (รูป 3 ติดกัน = 2 หน้า, PDF แนบยังหน้าละหน้า) · สองใบเบิก: ใบละชุด รูปไม่ข้ามใบ`)

  // AC8 — duplex ในไฟล์จริง: ใบที่สองใช้หน้าใบเบิกขนาด Letter เพื่อระบุตำแหน่งในไฟล์ผลลัพธ์ได้
  const letterVoucher = await makePdf([[612, 792]], 'VOUCHER (Letter)')
  const first3: BundleClaimInput = { claimNumber: 'EXP-202609-211', voucher, files: [file('receipt', 1, 2, JPEG), file('receipt', 2, 2, withExif(STORED_FOR_EXIF[6], 6))] }
  const second: BundleClaimInput = { claimNumber: 'EXP-202609-212', voucher: letterVoucher, files: [file('receipt', 1, 1, PNG)] }
  const dup = await buildBundle([first3, second], { layout: 'one', duplex: true })
  fs.writeFileSync(path.join(OUT_DIR, 'sample-duplex.pdf'), dup.pdf)
  const dupInfo = await pdfInfo(dup.pdf)
  assert.equal(dup.report.claims[0].pages, 3)
  assert.equal(dupInfo.count, 3 + 1 + 2)
  assert.deepEqual(dupInfo.sizes[4], { width: 612, height: 792 }, 'duplex: หน้าแรกของใบที่สองต้องเป็นหน้า 5')
  assert.ok(isA4(dupInfo.sizes[3].width, dupInfo.sizes[3].height) && dupInfo.doc.getPage(3).node.Contents() === undefined, 'หน้า 4 ต้องเป็น A4 ว่าง')
  assert.equal(dup.report.pages, dupInfo.count)
  const noDup = await buildBundle([first3, second], { layout: 'one', duplex: false })
  const noDupInfo = await pdfInfo(noDup.pdf)
  assert.equal(noDupInfo.count, 3 + 2)
  assert.deepEqual(noDupInfo.sizes[3], { width: 612, height: 792 }, 'ไม่ duplex: หน้าแรกของใบที่สองต้องเป็นหน้า 4')
  pass('AC8 duplex (ไฟล์จริง): ใบแรก 3 หน้า → หน้า 4 เป็น A4 ว่าง ใบที่สองเริ่มหน้า 5 · ไม่ duplex เริ่มหน้า 4')

  // เพดานหน้า: โยน BundleTooLargeError ก่อนประกอบ
  await assert.rejects(
    buildBundle([claimX], { layout: 'one', duplex: false }, { maxPages: expectOne - 1 }),
    (e: unknown) => e instanceof BundleTooLargeError && e.pages === expectOne && e.limit === expectOne - 1
  )
  const atLimit = await buildBundle([claimX], { layout: 'one', duplex: false }, { maxPages: expectOne })
  assert.equal(atLimit.report.pages, expectOne)
  pass(`เพดานหน้า: ${expectOne} หน้า กับเพดาน ${expectOne - 1} → BundleTooLargeError · เพดาน ${expectOne} พอดี → ผ่าน`)

  console.log(`\nไฟล์ตัวอย่างให้เปิดดู: ${OUT_DIR}`)
  for (const f of ['sample-one.pdf', 'sample-two.pdf', 'sample-duplex.pdf']) {
    console.log(`  ${f}  ${(fs.statSync(path.join(OUT_DIR, f)).size / 1024).toFixed(1)} KB`)
  }
  console.log('\nclaim-bundle: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
