const th = {
  kpi: {
    // ===== Common =====
    common: {
      cancel: 'ยกเลิก',
      save: 'บันทึก',
      saving: 'กำลังบันทึก...',
      delete: 'ลบ',
      edit: 'แก้ไข',
      create: 'สร้าง',
      target: 'เป้าหมาย',
      actual: 'ค่าจริง',
      actualLatest: 'ค่าจริง (รวม)',
      actualShort: 'จริง (รวม)',
      score: 'คะแนน',
      period: 'ช่วงเวลา',
      comment: 'ความคิดเห็น',
      note: 'หมายเหตุ',
      all: 'ทั้งหมด',
      employee: 'พนักงาน',
      department: 'แผนก',
      date: 'วันที่',
      average: 'เฉลี่ย',
      total: 'รวม',
      summary: 'สรุป',
      times: 'ครั้ง',
      difference: 'ผลต่าง',
      items: 'รายการ',
      evaluated: 'ประเมินแล้ว',
      avgScore: 'คะแนนเฉลี่ย',
      noData: 'ไม่มีข้อมูล',
      evaluatedTimes: 'ประเมิน {count} ครั้ง',
      achievedPct: 'ทำได้ {pct}% ของเป้า',
      targetArrowActual: 'เป้า: {target} → จริง: {actual} {unit}',
      weight: 'น้ำหนัก',
      weightPercent: 'น้ำหนัก (%)',
      totalWeight: 'น้ำหนักรวม',
      weightedScore: 'คะแนนถ่วงน้ำหนัก',
      weightWarning: 'น้ำหนักรวมยังไม่ครบ 100%',
      noAssignments: 'ไม่มี KPI ที่มอบหมาย',
      achievement: 'ผลสำเร็จ',
    },

    // ===== Modes =====
    modes: {
      task: 'งาน',
      sales: 'ยอดขาย',
      cost_reduction: 'ลดต้นทุน',
    } as Record<string, string>,

    // ===== Cycles =====
    cycles: {
      weekly: 'รายสัปดาห์ (ทุกวันศุกร์)',
      monthly: 'รายเดือน (ทุกวันที่ 25)',
      yearly: 'รายปี (สิ้นปี)',
    } as Record<string, string>,

    // ===== Statuses =====
    statuses: {
      active: 'กำลังใช้งาน',
      paused: 'หยุดชั่วคราว',
      completed: 'เสร็จสิ้น',
    } as Record<string, string>,



    // ===== Layout =====
    layout: {
      dashboard: 'แดชบอร์ด',
      templates: 'เทมเพลต',
      assignments: 'มอบหมาย',
      evaluate: 'ประเมินผล',
      reports: 'รายงาน',
      download: 'ดาวน์โหลด',
    },

    // ===== Dashboard =====
    dashboard: {
      title: 'KPI Dashboard',
      subtitleAdmin: 'ภาพรวม KPI ทั้งบริษัท',
      subtitleUser: 'ภาพรวม KPI ของฉัน',
      statTemplates: 'แม่แบบ KPI',
      statActiveKpis: 'กำลังใช้งาน',
      statEvaluations: 'ผลประเมิน',
      statAllEvals: 'การประเมินทั้งหมด',
      statAvgScore: 'คะแนนเฉลี่ย',
      chartTargetVsActual: 'เปรียบเทียบเป้าหมาย vs ค่าจริง (รวม)',
      chartTargetVsActualDesc: 'แต่ละ KPI แสดงเป้าหมายเทียบผลรวมค่าจริงทุกรอบ',
      chartTrend: 'แนวโน้ม Achievement % ตามรอบประเมิน',
      chartTrendDesc: 'เปอร์เซ็นต์ที่ทำได้ในแต่ละรอบ',
      gaugeTitle: 'ผลสำเร็จตามเป้าหมาย',
      gaugeDesc: 'ผลรวมค่าจริงของแต่ละ KPI',
      rankingTitle: 'อันดับพนักงาน (ตามคะแนนเฉลี่ย)',
      emptyState: 'ยังไม่มีผลประเมิน KPI',
      emptyHint: 'เริ่มต้นสร้าง Template → Assign → Evaluate',
    },

    // ===== Templates =====
    templates: {
      title: 'KPI Templates',
      subtitle: 'จัดการแม่แบบ KPI — Task / Sales / Cost Reduction',
      createBtn: 'สร้าง Template',
      emptyState: 'ยังไม่มี Template — คลิก "สร้าง Template" เพื่อเริ่มต้น',
      deleteTitle: 'ยืนยันการลบ Template',
      deleteDesc: 'Template นี้จะถูกลบถาวร — Assignment ที่เชื่อมอยู่จะไม่มี template อ้างอิง',
      deleteBtn: 'ลบ Template',
    },

    // ===== Template Form =====
    templateForm: {
      createTitle: 'สร้าง KPI Template ใหม่',
      editTitle: 'แก้ไข Template',
      nameLabel: 'ชื่อ Template',
      namePlaceholder: 'เช่น ยอดขายรายเดือน',
      modeLabel: 'ประเภท KPI',
      descriptionLabel: 'คำอธิบาย',
      descriptionPlaceholder: 'อธิบาย KPI นี้...',
      defaultTarget: 'เป้าหมาย Default',
      unit: 'หน่วย',
      unitPlaceholder: 'เช่น บาท, ชิ้น, %',
      createBtn: 'สร้าง Template',
    },

    // ===== Assignments =====
    assignments: {
      title: 'Assignments',
      subtitle: 'มอบหมาย KPI ให้พนักงาน — ใช้ Template หรือสร้าง Custom KPI',
      assignBtn: 'มอบหมาย KPI',
      emptyState: 'ยังไม่มีการมอบหมาย — คลิก "มอบหมาย KPI" เพื่อเริ่มต้น',
      deleteTitle: 'ยืนยันลบ Assignment',
      deleteDesc: 'Assignment นี้จะถูกลบถาวร รวมถึงผลประเมินที่เชื่อมอยู่',
      deleteBtn: 'ลบ Assignment',
    },

    // ===== Assignment Form =====
    assignmentForm: {
      title: 'มอบหมาย KPI',
      employeeLabel: 'พนักงาน',
      employeePlaceholder: 'เลือกพนักงาน',
      customToggle: 'สร้าง KPI แบบ Custom (ไม่ใช้ Template)',
      templateLabel: 'เลือก Template',
      templatePlaceholder: 'เลือก KPI Template',
      kpiNameLabel: 'ชื่อ KPI',
      kpiNamePlaceholder: 'เช่น ดูแลลูกค้า VIP',
      typeLabel: 'ประเภท',
      targetLabel: 'เป้าหมาย',
      unitLabel: 'หน่วย',
      unitPlaceholder: 'เช่น บาท, ชิ้น, %',
      cycleLabel: 'รอบการประเมิน',
      cyclePlaceholder: 'เลือกรอบ',
      weightLabel: 'น้ำหนัก (%)',
      weightPlaceholder: 'เช่น 50',
      startLabel: 'เริ่มต้น',
      endLabel: 'สิ้นสุด',
      submitBtn: 'มอบหมาย KPI',
    },

    // ===== Evaluate =====
    evaluate: {
      title: 'ประเมินผล KPI',
      subtitle: 'ประเมินผล KPI ที่ได้มอบหมายให้พนักงาน (Admin Only)',
      emptyState: 'ไม่มี KPI ที่ต้องประเมินในขณะนี้',
      viewHistoryTooltip: 'ดูประวัติการประเมิน',
      evaluateBtn: 'ประเมินผล',
      evaluatedCount: 'ประเมินแล้ว {count} ครั้ง',
      historyTitle: 'ประวัติการประเมิน: {name}',
      noHistory: 'ยังไม่มีผลประเมิน',
      evalDialogTitle: 'ประเมินผล: {name}',
      actualLabel: 'ค่าจริง (Actual Value)',
      actualPlaceholder: 'ผลลัพธ์จริงที่ทำได้',
      diffLabel: 'ผลต่าง (Actual − Target)',
      achievementLabel: 'ทำได้คิดเป็น',
      scoreLabel: 'คะแนน (Score: 0-100)',
      dateLabel: 'วันที่ประเมิน',
      periodLabel: 'ช่วงเวลา (Period Label)',
      periodPlaceholder: 'เช่น Week 8, Feb 2026, Q1 2026',
      commentLabel: 'ความคิดเห็น',
      commentPlaceholder: 'หมายเหตุเพิ่มเติม...',
      submitBtn: 'บันทึกผลประเมิน',
      confirmDelete: 'ต้องการลบผลประเมินนี้หรือไม่?',
      deleteTooltip: 'ลบผลประเมิน',
    },

    // ===== Reports =====
    reports: {
      title: 'รายงาน KPI',
      subtitleAdmin: 'ดูผลประเมินทุกคน — Filter ตามพนักงาน/แผนก',
      subtitleUser: 'ผลประเมิน KPI ของฉัน',
      chartTargetVsActual: 'เปรียบเทียบเป้าหมาย vs ค่าจริง (ล่าสุด) — แยกตาม KPI',
      chartTargetVsActualDesc: 'แต่ละ KPI แสดงเป้าหมายเทียบค่าจริงรอบล่าสุด',
      chartTrend: 'แนวโน้ม Achievement % ตามรอบประเมิน',
      chartTrendDesc: 'แสดงเปอร์เซ็นต์ที่ทำได้ในแต่ละรอบ',
      gaugeTitle: 'ผลสำเร็จตามเป้าหมาย — แยกตาม KPI',
      gaugeDesc: 'แสดงค่าล่าสุดของแต่ละ KPI',
      summaryTitle: 'สรุปผลประเมินรายบุคคล',
      kpiCount: 'จำนวน KPI',
      detailTitle: 'รายละเอียดผลประเมิน ({count} รายการ)',
      noEvals: 'ไม่มีผลประเมิน',
      evalDate: 'วันที่ประเมิน',
    },

    // ===== Download =====
    download: {
      title: 'ดาวน์โหลดข้อมูล KPI',
      subtitleAdmin: 'ส่งออกข้อมูล KPI ทั้งบริษัท เป็นไฟล์ Excel / CSV / JSON',
      subtitleUser: 'ส่งออกข้อมูล KPI ของฉัน เป็นไฟล์ Excel / CSV / JSON',
      roleAdmin: 'Admin — ข้อมูลทั้งบริษัท',
      roleStaff: 'Staff — ข้อมูลของฉัน',
      exportAll: 'ส่งออกทั้งหมด',
      exportAllDesc: 'ดาวน์โหลดข้อมูลทุกประเภทพร้อมกัน',
      excelBtn: 'ดาวน์โหลด Excel (.xlsx)',
      csvBtn: 'CSV แยกไฟล์',
      jsonBtn: 'JSON',
      templatesTitle: 'KPI Templates',
      templatesDesc: 'ดาวน์โหลดรายการ Template ทุกรายการ',
      assignmentsTitle: 'KPI Assignments',
      assignmentsDescAdmin: 'ดาวน์โหลดรายการมอบหมาย KPI ทั้งหมด',
      assignmentsDescUser: 'ดาวน์โหลดรายการ KPI ที่มอบหมายให้ฉัน',
      evalsTitle: 'KPI Evaluations',
      evalsDescAdmin: 'ดาวน์โหลดผลประเมินทั้งหมดพร้อมรายละเอียด',
      evalsDescUser: 'ดาวน์โหลดผลประเมินของฉัน',
      previewTitle: 'ข้อมูลที่จะส่งออก',
      myKpi: 'KPI ของฉัน',
      myEvals: 'ผลประเมินของฉัน',
    },
  },
} as const

export default th

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
  ? DeepStringRecord<T[K]>
  : string
}

export type Dictionary = DeepStringRecord<typeof th>
