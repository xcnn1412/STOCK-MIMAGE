import type { Dictionary } from './th'

const en: Dictionary = {
  kpi: {
    // ===== Common =====
    common: {
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving...',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      target: 'Target',
      actual: 'Actual',
      actualLatest: 'Actual (Total)',
      actualShort: 'Actual (Total)',
      score: 'Score',
      period: 'Period',
      comment: 'Comment',
      note: 'Note',
      all: 'All',
      employee: 'Employee',
      department: 'Department',
      date: 'Date',
      average: 'Avg',
      total: 'Total',
      summary: 'Summary',
      times: 'times',
      difference: 'Diff',
      items: 'items',
      evaluated: 'Evaluated',
      avgScore: 'Avg Score',
      noData: 'No data',
      evaluatedTimes: '{count} evaluations',
      achievedPct: '{pct}% of target achieved',
      targetArrowActual: 'Target: {target} → Actual: {actual} {unit}',
      weight: 'Weight',
      weightPercent: 'Weight (%)',
      totalWeight: 'Total Weight',
      weightedScore: 'Weighted Score',
      weightWarning: 'Total weight is not 100%',
      noAssignments: 'No KPI assignments',
      achievement: 'Achievement',
    },

    // ===== Modes =====
    modes: {
      task: 'Task',
      sales: 'Sales',
      cost_reduction: 'Cost Reduction',
    },

    // ===== Cycles =====
    cycles: {
      weekly: 'Weekly (every Friday)',
      monthly: 'Monthly (25th)',
      yearly: 'Yearly (year-end)',
    },

    // ===== Statuses =====
    statuses: {
      active: 'Active',
      paused: 'Paused',
      completed: 'Completed',
    },



    // ===== Layout =====
    layout: {
      dashboard: 'Dashboard',
      templates: 'Templates',
      assignments: 'Assignments',
      evaluate: 'Evaluate',
      reports: 'Reports',
      download: 'Download',
    },

    // ===== Dashboard =====
    dashboard: {
      title: 'KPI Dashboard',
      subtitleAdmin: 'Company-wide KPI overview',
      subtitleUser: 'My KPI overview',
      statTemplates: 'KPI Templates',
      statActiveKpis: 'Active',
      statEvaluations: 'Evaluations',
      statAllEvals: 'Total evaluations',
      statAvgScore: 'Average Score',
      chartTargetVsActual: 'Target vs Actual (Total)',
      chartTargetVsActualDesc: 'Each KPI shows target compared to cumulative actual value',
      chartTrend: 'Achievement % Trend by Period',
      chartTrendDesc: 'Percentage achieved per evaluation cycle',
      gaugeTitle: 'Goal Achievement',
      gaugeDesc: 'Cumulative actual per KPI',
      rankingTitle: 'Employee Ranking (by Avg Score)',
      emptyState: 'No KPI evaluations yet',
      emptyHint: 'Start by creating Template → Assign → Evaluate',
    },

    // ===== Templates =====
    templates: {
      title: 'KPI Templates',
      subtitle: 'Manage KPI templates — Task / Sales / Cost Reduction',
      createBtn: 'Create Template',
      emptyState: 'No templates yet — click "Create Template" to get started',
      deleteTitle: 'Confirm Delete Template',
      deleteDesc: 'This template will be permanently deleted — linked assignments will lose their template reference',
      deleteBtn: 'Delete Template',
    },

    // ===== Template Form =====
    templateForm: {
      createTitle: 'Create New KPI Template',
      editTitle: 'Edit Template',
      nameLabel: 'Template Name',
      namePlaceholder: 'e.g. Monthly Sales',
      modeLabel: 'KPI Type',
      descriptionLabel: 'Description',
      descriptionPlaceholder: 'Describe this KPI...',
      defaultTarget: 'Default Target',
      unit: 'Unit',
      unitPlaceholder: 'e.g. ฿, pcs, %',
      createBtn: 'Create Template',
    },

    // ===== Assignments =====
    assignments: {
      title: 'Assignments',
      subtitle: 'Assign KPIs to employees — use templates or create custom KPIs',
      assignBtn: 'Assign KPI',
      emptyState: 'No assignments yet — click "Assign KPI" to get started',
      deleteTitle: 'Confirm Delete Assignment',
      deleteDesc: 'This assignment will be permanently deleted along with all linked evaluations',
      deleteBtn: 'Delete Assignment',
    },

    // ===== Assignment Form =====
    assignmentForm: {
      title: 'Assign KPI',
      employeeLabel: 'Employee',
      employeePlaceholder: 'Select employee',
      customToggle: 'Create custom KPI (no template)',
      templateLabel: 'Select Template',
      templatePlaceholder: 'Choose KPI Template',
      kpiNameLabel: 'KPI Name',
      kpiNamePlaceholder: 'e.g. VIP Customer Care',
      typeLabel: 'Type',
      targetLabel: 'Target',
      unitLabel: 'Unit',
      unitPlaceholder: 'e.g. ฿, pcs, %',
      cycleLabel: 'Evaluation Cycle',
      cyclePlaceholder: 'Select cycle',
      weightLabel: 'Weight (%)',
      weightPlaceholder: 'e.g. 50',
      startLabel: 'Start Date',
      endLabel: 'End Date',
      submitBtn: 'Assign KPI',
    },

    // ===== Evaluate =====
    evaluate: {
      title: 'Evaluate KPI',
      subtitle: 'Evaluate employee KPI performance (Admin Only)',
      emptyState: 'No KPIs to evaluate at this time',
      viewHistoryTooltip: 'View evaluation history',
      evaluateBtn: 'Evaluate',
      evaluatedCount: '{count} evaluations done',
      historyTitle: 'Evaluation History: {name}',
      noHistory: 'No evaluations yet',
      evalDialogTitle: 'Evaluate: {name}',
      actualLabel: 'Actual Value',
      actualPlaceholder: 'Actual result achieved',
      diffLabel: 'Difference (Actual − Target)',
      achievementLabel: 'Achievement',
      scoreLabel: 'Score (0-100)',
      dateLabel: 'Evaluation Date',
      periodLabel: 'Period Label',
      periodPlaceholder: 'e.g. Week 8, Feb 2026, Q1 2026',
      commentLabel: 'Comment',
      commentPlaceholder: 'Additional notes...',
      submitBtn: 'Save Evaluation',
      confirmDelete: 'Are you sure you want to delete this evaluation?',
      deleteTooltip: 'Delete evaluation',
    },

    // ===== Reports =====
    reports: {
      title: 'KPI Reports',
      subtitleAdmin: 'View all evaluations — filter by employee/department',
      subtitleUser: 'My KPI evaluation results',
      chartTargetVsActual: 'Target vs Actual (Latest) — By KPI',
      chartTargetVsActualDesc: 'Each KPI shows target compared to latest actual value',
      chartTrend: 'Achievement % Trend by Period',
      chartTrendDesc: 'Percentage achieved per evaluation cycle',
      gaugeTitle: 'Goal Achievement — By KPI',
      gaugeDesc: 'Latest value per KPI',
      summaryTitle: 'Individual Evaluation Summary',
      kpiCount: 'KPI Count',
      detailTitle: 'Evaluation Details ({count} items)',
      noEvals: 'No evaluations',
      evalDate: 'Evaluation Date',
    },

    // ===== Download =====
    download: {
      title: 'Download KPI Data',
      subtitleAdmin: 'Export company-wide KPI data as Excel / CSV / JSON',
      subtitleUser: 'Export my KPI data as Excel / CSV / JSON',
      roleAdmin: 'Admin — Company-wide Data',
      roleStaff: 'Staff — My Data Only',
      exportAll: 'Export All',
      exportAllDesc: 'Download all data types at once',
      excelBtn: 'Download Excel (.xlsx)',
      csvBtn: 'CSV (Separate Files)',
      jsonBtn: 'JSON',
      templatesTitle: 'KPI Templates',
      templatesDesc: 'Download all KPI templates',
      assignmentsTitle: 'KPI Assignments',
      assignmentsDescAdmin: 'Download all KPI assignments',
      assignmentsDescUser: 'Download my KPI assignments',
      evalsTitle: 'KPI Evaluations',
      evalsDescAdmin: 'Download all evaluations with details',
      evalsDescUser: 'Download my evaluations',
      previewTitle: 'Data to Export',
      myKpi: 'My KPIs',
      myEvals: 'My Evaluations',
    },
  },
}

export default en
