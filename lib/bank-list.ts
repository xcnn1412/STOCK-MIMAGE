// รายชื่อธนาคาร — เรียงลำดับ ก-ฮ แล้วตามด้วย A-Z

export interface BankOption {
  /** ค่าที่เก็บลง DB */
  value: string
  /** ชื่อแสดงใน dropdown */
  label: string
  /** ชื่อย่อสำหรับค้นหา */
  abbr: string
}

export const THAI_BANKS: BankOption[] = [
  { value: 'กรุงเทพ', label: 'ธนาคารกรุงเทพ', abbr: 'BBL' },
  { value: 'กรุงไทย', label: 'ธนาคารกรุงไทย', abbr: 'KTB' },
  { value: 'กรุงศรีอยุธยา', label: 'ธนาคารกรุงศรีอยุธยา', abbr: 'BAY' },
  { value: 'กสิกรไทย', label: 'ธนาคารกสิกรไทย', abbr: 'KBank' },
  { value: 'เกียรตินาคินภัทร', label: 'ธนาคารเกียรตินาคินภัทร', abbr: 'KKP' },
  { value: 'ซีไอเอ็มบี ไทย', label: 'ธนาคารซีไอเอ็มบี ไทย', abbr: 'CIMBT' },
  { value: 'ซูมิโตโม มิตซุย ทรัสต์ (ไทย)', label: 'ธนาคารซูมิโตโม มิตซุย ทรัสต์ (ไทย)', abbr: 'SMTB' },
  { value: 'ทหารไทยธนชาต', label: 'ธนาคารทหารไทยธนชาต', abbr: 'ttb' },
  { value: 'ทิสโก้', label: 'ธนาคารทิสโก้', abbr: 'TISCO' },
  { value: 'ไทยเครดิต', label: 'ธนาคารไทยเครดิต', abbr: 'Thai Credit' },
  { value: 'ไทยพาณิชย์', label: 'ธนาคารไทยพาณิชย์', abbr: 'SCB' },
  { value: 'พัฒนาวิสาหกิจฯ', label: 'ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย', abbr: 'SME D Bank' },
  { value: 'เพื่อการเกษตรฯ', label: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)', abbr: 'BAAC' },
  { value: 'เพื่อการส่งออกฯ', label: 'ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย', abbr: 'EXIM Bank' },
  { value: 'ยูโอบี', label: 'ธนาคารยูโอบี', abbr: 'UOB' },
  { value: 'แลนด์ แอนด์ เฮ้าส์', label: 'ธนาคารแลนด์ แอนด์ เฮ้าส์', abbr: 'LH Bank' },
  { value: 'แห่งประเทศจีน (ไทย)', label: 'ธนาคารแห่งประเทศจีน (ไทย)', abbr: 'BOC' },
  { value: 'ออมสิน', label: 'ธนาคารออมสิน', abbr: 'GSB' },
  { value: 'อาคารสงเคราะห์', label: 'ธนาคารอาคารสงเคราะห์ (ธอส.)', abbr: 'GH Bank' },
  { value: 'อิสลามแห่งประเทศไทย', label: 'ธนาคารอิสลามแห่งประเทศไทย', abbr: 'ibank' },
  { value: 'ไอซีบีซี (ไทย)', label: 'ธนาคารไอซีบีซี (ไทย)', abbr: 'ICBCT' },
  { value: 'เอเอ็นแซด (ไทย)', label: 'ธนาคารเอเอ็นแซด (ไทย)', abbr: 'ANZ' },
  { value: 'บสย.', label: 'บรรษัทประกันสินเชื่ออุตสาหกรรมขนาดย่อม (บสย.)', abbr: 'บสย.' },
]

export const INTERNATIONAL_BANKS: BankOption[] = [
  { value: 'BNP Paribas', label: 'BNP Paribas (บีเอ็นพี พารีบาส์)', abbr: 'BNP' },
  { value: 'Citibank', label: 'Citibank (ซิตี้แบงก์)', abbr: 'Citi' },
  { value: 'Deutsche Bank', label: 'Deutsche Bank (ดอยซ์แบงก์)', abbr: 'Deutsche' },
  { value: 'HSBC', label: 'HSBC (เอชเอสบีซี)', abbr: 'HSBC' },
  { value: 'JPMorgan Chase', label: 'JPMorgan Chase (เจพีมอร์แกน เชส)', abbr: 'JPM' },
  { value: 'Mizuho Bank', label: 'Mizuho Bank (มิซูโฮ)', abbr: 'Mizuho' },
  { value: 'SMBC', label: 'Sumitomo Mitsui Banking Corporation (SMBC)', abbr: 'SMBC' },
  { value: 'Standard Chartered', label: 'Standard Chartered (แสตนดาร์ดชาร์เตอร์ด)', abbr: 'StanChart' },
]

/** รวมทั้งหมด — ก-ฮ ก่อน, แล้ว A-Z */
export const ALL_BANKS: BankOption[] = [...THAI_BANKS, ...INTERNATIONAL_BANKS]
