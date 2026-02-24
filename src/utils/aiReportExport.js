import { getCurrentDate, getFinishDate, parseDateValue, toISODateString } from './helpers.js'

export const AI_REPORT_TRIGGER_PROMPT = 'Generate report from attached file.'

export const AI_REPORT_SECTION_NAMES = [
  'Overall Status Narrative',
  'Key Deliverables This Period',
  'Key Deliverables Next Period',
  'Main Risks and Issues',
  'Additional Notes'
]

const COMPLETED_STATUSES = new Set(['done', 'completed', 'closed'])
const CLOSED_STATUSES = new Set(['done', 'completed', 'closed', 'resolved', 'cancelled'])

const normalizeIsoDate = (value, fallback = '') => {
  const parsed = parseDateValue(value)
  if (!parsed) return fallback
  return toISODateString(parsed)
}

const ensureDateRange = (dateFrom, dateTo) => {
  const today = getCurrentDate()
  let from = normalizeIsoDate(dateFrom, today) || today
  let to = normalizeIsoDate(dateTo, from) || from
  if (to < from) {
    const swap = from
    from = to
    to = swap
  }
  return { from, to }
}

const addDays = (dateIso, days) => {
  const parsed = parseDateValue(dateIso)
  if (!parsed) return ''
  const next = new Date(parsed)
  next.setDate(next.getDate() + days)
  return toISODateString(next)
}

const getInclusiveDayCount = (startIso, endIso) => {
  const start = parseDateValue(startIso)
  const end = parseDateValue(endIso)
  if (!start || !end) return 1
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000)
  return Math.max(1, diff + 1)
}

const isDateInRange = (value, fromIso, toIso) => {
  const date = normalizeIsoDate(value)
  if (!date) return false
  return date >= fromIso && date <= toIso
}

const normalizeText = (value) => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const normalizeStatus = (value) => normalizeText(value).toLowerCase()

const isDoneStatus = (status) => COMPLETED_STATUSES.has(normalizeStatus(status))

const isClosedStatus = (status) => CLOSED_STATUSES.has(normalizeStatus(status))

const severityWeight = (severity) => {
  const key = normalizeText(severity).toLowerCase()
  if (key === 'high') return 0
  if (key === 'medium') return 1
  return 2
}

const sortByDateThenRef = (rows, dateKey, referenceKey = 'Reference') => {
  return [...rows].sort((a, b) => {
    const da = normalizeIsoDate(a[dateKey])
    const db = normalizeIsoDate(b[dateKey])
    if (da !== db) return db.localeCompare(da)
    const ra = normalizeText(a[referenceKey])
    const rb = normalizeText(b[referenceKey])
    return ra.localeCompare(rb)
  })
}

const sanitizeFileNamePart = (value) => {
  const cleaned = normalizeText(value)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'project'
}

const normalizeRiskSeverity = (value) => {
  const level = normalizeStatus(value)
  if (level.includes('high') || level.includes('red')) return 'High'
  if (level.includes('medium') || level.includes('amber')) return 'Medium'
  return 'Low'
}

const formatProjectReference = (projectId) => projectId ? `Project:${projectId}` : 'Project:Other'

export const buildAiReportExportData = ({
  project,
  tasks = [],
  registers = {},
  tracker = [],
  statusReport = {},
  todos = [],
  dateFrom,
  dateTo,
  timezone,
  generatedAtUtc
}) => {
  const { from: windowStart, to: windowEnd } = ensureDateRange(dateFrom, dateTo)
  const windowDays = getInclusiveDayCount(windowStart, windowEnd)
  const nextPeriodStart = addDays(windowEnd, 1)
  const nextPeriodEnd = addDays(nextPeriodStart, Math.max(0, windowDays - 1))
  const reportGeneratedAtUtc = generatedAtUtc || new Date().toISOString()
  const reportTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const projectId = project?.id || null
  const projectName = normalizeText(project?.name) || 'Current Project'

  const projectTodos = (todos || []).filter((todo) => (todo?.projectId || null) === projectId)

  const completedTodoRows = projectTodos
    .filter((todo) => isDoneStatus(todo?.status))
    .filter((todo) => isDateInRange(todo?.completedAt || todo?.updatedAt, windowStart, windowEnd))
    .map((todo) => ({
      Reference: todo?._id || '',
      Source: 'Manual ToDo',
      Title: normalizeText(todo?.title) || 'Untitled ToDo',
      Owner: normalizeText(todo?.owner) || 'Unassigned',
      'Completed Date': normalizeIsoDate(todo?.completedAt || todo?.updatedAt),
      'Due Date': normalizeIsoDate(todo?.dueDate),
      Status: todo?.status || 'Done',
      Evidence: 'manual_todos.completed_at'
    }))

  const completedActionRows = (registers?.actions || [])
    .filter((action) => isDoneStatus(action?.status))
    .filter((action) => isDateInRange(action?.updatedAt || action?.completed, windowStart, windowEnd))
    .map((action, idx) => ({
      Reference: action?._id || `action_${idx + 1}`,
      Source: 'Action Log',
      Title: normalizeText(action?.description) || 'Completed action',
      Owner: normalizeText(action?.owner || action?.actionassignedto) || 'Unassigned',
      'Completed Date': normalizeIsoDate(action?.updatedAt || action?.completed),
      'Due Date': normalizeIsoDate(action?.target),
      Status: normalizeText(action?.status) || 'Completed',
      Evidence: 'registers.actions.status/updatedAt'
    }))

  const completedTaskRows = (tasks || [])
    .filter((task) => Number(task?.pct) === 100)
    .filter((task) => isDateInRange(task?.updatedAt, windowStart, windowEnd))
    .map((task) => ({
      Reference: task?.id !== undefined && task?.id !== null ? `task_${task.id}` : '',
      Source: 'Project Plan',
      Title: normalizeText(task?.name) || 'Completed task',
      Owner: normalizeText(task?.owner) || 'Unassigned',
      'Completed Date': normalizeIsoDate(task?.updatedAt),
      'Due Date': normalizeIsoDate(getFinishDate(task?.start, task?.dur)),
      Status: 'Completed',
      Evidence: 'tasks.pct=100 + tasks.updatedAt'
    }))

  const thisPeriodCompletedRows = sortByDateThenRef([
    ...completedTodoRows,
    ...completedActionRows,
    ...completedTaskRows
  ], 'Completed Date')

  const nextPeriodTodoRows = projectTodos
    .filter((todo) => !isDoneStatus(todo?.status))
    .filter((todo) => isDateInRange(todo?.dueDate, nextPeriodStart, nextPeriodEnd))
    .map((todo) => ({
      Reference: todo?._id || '',
      Source: 'Manual ToDo',
      Title: normalizeText(todo?.title) || 'Untitled ToDo',
      Owner: normalizeText(todo?.owner) || 'Unassigned',
      'Due Date': normalizeIsoDate(todo?.dueDate),
      Status: normalizeText(todo?.status) || 'Open',
      Notes: `Project-linked (${formatProjectReference(todo?.projectId)})`
    }))

  const nextPeriodActionRows = (registers?.actions || [])
    .filter((action) => !isDoneStatus(action?.status))
    .filter((action) => isDateInRange(action?.target, nextPeriodStart, nextPeriodEnd))
    .map((action, idx) => ({
      Reference: action?._id || `action_${idx + 1}`,
      Source: 'Action Log',
      Title: normalizeText(action?.description) || 'Planned action',
      Owner: normalizeText(action?.owner || action?.actionassignedto) || 'Unassigned',
      'Due Date': normalizeIsoDate(action?.target),
      Status: normalizeText(action?.status) || 'Open',
      Notes: 'Action with target date in next period'
    }))

  const nextPeriodTaskRows = (tasks || [])
    .filter((task) => Number(task?.pct) < 100)
    .map((task) => ({
      task,
      finishDate: normalizeIsoDate(getFinishDate(task?.start, task?.dur))
    }))
    .filter(({ finishDate }) => isDateInRange(finishDate, nextPeriodStart, nextPeriodEnd))
    .map(({ task, finishDate }) => ({
      Reference: task?.id !== undefined && task?.id !== null ? `task_${task.id}` : '',
      Source: 'Project Plan',
      Title: normalizeText(task?.name) || 'Upcoming task',
      Owner: normalizeText(task?.owner) || 'Unassigned',
      'Due Date': finishDate,
      Status: `${Number(task?.pct) || 0}%`,
      Notes: 'Planned finish date in next period'
    }))

  const keyDeliverablesNextPeriodRows = sortByDateThenRef([
    ...nextPeriodTodoRows,
    ...nextPeriodActionRows,
    ...nextPeriodTaskRows
  ], 'Due Date')

  const overdueTodoRows = projectTodos
    .filter((todo) => !isDoneStatus(todo?.status))
    .filter((todo) => normalizeIsoDate(todo?.dueDate) && normalizeIsoDate(todo?.dueDate) < windowEnd)
    .map((todo) => ({
      'Signal Type': 'Overdue ToDo',
      Severity: 'High',
      Source: 'Manual ToDo',
      Reference: todo?._id || '',
      Summary: normalizeText(todo?.title) || 'Overdue ToDo',
      Status: normalizeText(todo?.status) || 'Open',
      'Due Date': normalizeIsoDate(todo?.dueDate)
    }))

  const openRiskRows = (registers?.risks || [])
    .filter((risk) => normalizeStatus(risk?.level) !== 'closed')
    .map((risk, idx) => ({
      'Signal Type': 'Open Risk',
      Severity: normalizeRiskSeverity(risk?.level),
      Source: 'Risk Log',
      Reference: risk?._id || (risk?.number ? `R${risk.number}` : `risk_${idx + 1}`),
      Summary: normalizeText(risk?.riskdetails || risk?.description) || 'Open risk item',
      Status: normalizeText(risk?.level) || 'Open',
      'Due Date': normalizeIsoDate(risk?.target)
    }))

  const openIssueRows = (registers?.issues || [])
    .filter((issue) => !isClosedStatus(issue?.status))
    .map((issue, idx) => ({
      'Signal Type': 'Open Issue',
      Severity: 'Medium',
      Source: 'Issue Log',
      Reference: issue?._id || (issue?.number ? `I${issue.number}` : `issue_${idx + 1}`),
      Summary: normalizeText(issue?.description) || 'Open issue item',
      Status: normalizeText(issue?.status) || 'Open',
      'Due Date': normalizeIsoDate(issue?.target || issue?.completed)
    }))

  const trackerRiskRows = (tracker || [])
    .filter((item) => {
      const rag = normalizeStatus(item?.rag)
      const status = normalizeStatus(item?.status)
      return rag === 'red' || status === 'on hold'
    })
    .map((item, idx) => ({
      'Signal Type': 'Tracker Risk Signal',
      Severity: normalizeStatus(item?.rag) === 'red' ? 'High' : 'Medium',
      Source: 'Master Tracker',
      Reference: item?._id || `tracker_${idx + 1}`,
      Summary: normalizeText(item?.taskName || item?.notes) || 'Tracker item at risk',
      Status: normalizeText(item?.status) || 'Open',
      'Due Date': normalizeIsoDate(item?.target)
    }))

  const mainRisksAndIssuesRows = [
    ...overdueTodoRows,
    ...openRiskRows,
    ...openIssueRows,
    ...trackerRiskRows
  ].sort((a, b) => {
    const severityDelta = severityWeight(a.Severity) - severityWeight(b.Severity)
    if (severityDelta !== 0) return severityDelta
    const dueA = normalizeIsoDate(a['Due Date'])
    const dueB = normalizeIsoDate(b['Due Date'])
    if (dueA !== dueB) return dueA.localeCompare(dueB)
    return normalizeText(a.Reference).localeCompare(normalizeText(b.Reference))
  })

  const additionalNotesRows = [
    { Section: 'Overall Status Narrative', Value: normalizeText(statusReport?.overallNarrative) },
    { Section: 'Key Deliverables This Period', Value: normalizeText(statusReport?.deliverablesThisPeriod) },
    { Section: 'Key Deliverables Next Period', Value: normalizeText(statusReport?.deliverablesNextPeriod) },
    { Section: 'Main Risks and Issues', Value: normalizeText(`${normalizeText(statusReport?.mainRisks)}\n${normalizeText(statusReport?.mainIssues)}`).trim() },
    { Section: 'Additional Notes', Value: normalizeText(statusReport?.additionalNotes) }
  ]

  const outputTemplateRows = [
    AI_REPORT_SECTION_NAMES.reduce((acc, section) => {
      acc[section] = ''
      return acc
    }, {})
  ]

  const instructionsRows = [
    ['AI REPORT INPUT FILE'],
    ['Upload this single file to your company-approved LLM workspace.'],
    [`If a prompt is required, use exactly: ${AI_REPORT_TRIGGER_PROMPT}`],
    ['Use attached data only. Do not invent facts.'],
    [`Return exactly these sections: ${AI_REPORT_SECTION_NAMES.join(' | ')}`],
    ['Deliverables This Period must be backed by 02_THIS_PERIOD_COMPLETED.'],
    ['Deliverables Next Period must be backed by 03_NEXT_PERIOD_OPEN.'],
    ['Main Risks and Issues must be backed by 04_RISK_SIGNALS.']
  ]

  const metadataRows = [
    { Field: 'project_id', Value: projectId || 'none' },
    { Field: 'project_name', Value: projectName },
    { Field: 'report_generated_at_utc', Value: reportGeneratedAtUtc },
    { Field: 'timezone_used', Value: reportTimezone },
    { Field: 'window_start', Value: windowStart },
    { Field: 'window_end', Value: windowEnd },
    { Field: 'window_days', Value: String(windowDays) },
    { Field: 'next_period_start', Value: nextPeriodStart },
    { Field: 'next_period_end', Value: nextPeriodEnd },
    { Field: 'completed_items_count', Value: String(thisPeriodCompletedRows.length) },
    { Field: 'next_period_items_count', Value: String(keyDeliverablesNextPeriodRows.length) },
    { Field: 'risk_signals_count', Value: String(mainRisksAndIssuesRows.length) }
  ]

  const withFallback = (rows, fallbackRow) => (rows.length > 0 ? rows : [fallbackRow])

  return {
    fileNameBase: `${sanitizeFileNamePart(projectName)}_project_report_input`,
    instructionsRows,
    metadataRows,
    thisPeriodCompletedRows: withFallback(thisPeriodCompletedRows, {
      Reference: '',
      Source: 'System',
      Title: 'No completed items found in selected period',
      Owner: '',
      'Completed Date': '',
      'Due Date': '',
      Status: '',
      Evidence: ''
    }),
    keyDeliverablesNextPeriodRows: withFallback(keyDeliverablesNextPeriodRows, {
      Reference: '',
      Source: 'System',
      Title: 'No due items found for next period',
      Owner: '',
      'Due Date': '',
      Status: '',
      Notes: ''
    }),
    mainRisksAndIssuesRows: withFallback(mainRisksAndIssuesRows, {
      'Signal Type': 'System',
      Severity: 'Low',
      Source: 'System',
      Reference: '',
      Summary: 'No major risks identified from current data',
      Status: '',
      'Due Date': ''
    }),
    additionalNotesRows,
    outputTemplateRows,
    windowStart,
    windowEnd,
    nextPeriodStart,
    nextPeriodEnd
  }
}
