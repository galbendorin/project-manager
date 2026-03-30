import { getCurrentDate, getFinishDate, parseDateValue, toISODateString } from './helpers.js'

export const AI_REPORT_TRIGGER_PROMPT = 'Generate report from attached file.'

export const AI_REPORT_SECTION_NAMES = [
  'Overall Status Narrative',
  'Key Deliverables This Period',
  'Key Deliverables Next Period',
  'Main Risks and Issues',
  'Additional Notes'
]
const NEXT_PERIOD_DAYS = 7

const COMPLETED_STATUSES = new Set(['done', 'completed', 'closed'])
const CLOSED_STATUSES = new Set(['done', 'completed', 'closed', 'resolved', 'cancelled'])
const RESOLVED_SIGNAL_STATUSES = new Set(['done', 'completed', 'closed', 'resolved', 'cancelled', 'validated', 'approved', 'implemented'])
const CHANGE_COMPLETED_STATUSES = new Set(['done', 'completed', 'closed', 'resolved', 'cancelled', 'implemented', 'approved', 'approved with conditions'])
const DECISION_FINAL_STATUSES = new Set(['done', 'completed', 'closed', 'resolved', 'cancelled', 'approved', 'approved with conditions', 'rejected', 'deferred'])

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

const isResolvedSignalStatus = (status) => RESOLVED_SIGNAL_STATUSES.has(normalizeStatus(status))

const isChangeCompletedStatus = (status) => CHANGE_COMPLETED_STATUSES.has(normalizeStatus(status))

const isDecisionFinalStatus = (status) => DECISION_FINAL_STATUSES.has(normalizeStatus(status))

const resolveDate = (...values) => {
  for (const value of values) {
    const normalized = normalizeIsoDate(value)
    if (normalized) return normalized
  }
  return ''
}

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

const normalizeImpactSeverity = (value) => {
  const level = normalizeStatus(value)
  if (level.includes('critical') || level.includes('high') || level.includes('major') || level.includes('severe')) return 'High'
  if (level.includes('medium') || level.includes('amber') || level.includes('moderate')) return 'Medium'
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
  userNotes = '',
  dateFrom,
  dateTo,
  timezone,
  generatedAtUtc
}) => {
  const { from: windowStart, to: windowEnd } = ensureDateRange(dateFrom, dateTo)
  const windowDays = getInclusiveDayCount(windowStart, windowEnd)
  const nextPeriodStart = addDays(windowEnd, 1)
  const nextPeriodEnd = addDays(nextPeriodStart, NEXT_PERIOD_DAYS - 1)
  const reportGeneratedAtUtc = generatedAtUtc || new Date().toISOString()
  const reportTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const projectId = project?.id || null
  const projectName = normalizeText(project?.name) || 'Current Project'

  const projectTodos = (todos || []).filter((todo) => (todo?.projectId || null) === projectId)
  const raciRegister = Array.isArray(registers?._raci) ? registers._raci[0] : null

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

  const completedChangeRows = (registers?.changes || [])
    .filter((change) => isChangeCompletedStatus(change?.status) || Boolean(resolveDate(change?.complete)))
    .filter((change) => isDateInRange(resolveDate(change?.complete, change?.updated, change?.updatedAt, change?.target), windowStart, windowEnd))
    .map((change, idx) => ({
      Reference: change?._id || (change?.number ? `C${change.number}` : `change_${idx + 1}`),
      Source: 'Change Control',
      Title: normalizeText(change?.description) || 'Completed change',
      Owner: normalizeText(change?.assignedto || change?.owner) || 'Unassigned',
      'Completed Date': resolveDate(change?.complete, change?.updated, change?.updatedAt, change?.target),
      'Due Date': normalizeIsoDate(change?.target),
      Status: normalizeText(change?.status) || 'Completed',
      Evidence: 'registers.changes.complete/updated/status'
    }))

  const decidedDecisionRows = (registers?.decisions || [])
    .filter((decision) => isDecisionFinalStatus(decision?.status))
    .filter((decision) => isDateInRange(resolveDate(decision?.datedecided, decision?.updatedAt), windowStart, windowEnd))
    .map((decision, idx) => ({
      Reference: decision?._id || (decision?.number ? `D${decision.number}` : `decision_${idx + 1}`),
      Source: 'Decision Log',
      Title: normalizeText(decision?.decision) || 'Decision taken',
      Owner: normalizeText(decision?.decidedby) || 'Decision owner',
      'Completed Date': resolveDate(decision?.datedecided, decision?.updatedAt),
      'Due Date': '',
      Status: normalizeText(decision?.status) || 'Approved',
      Evidence: 'registers.decisions.datedecided/status'
    }))

  const thisPeriodCompletedRows = sortByDateThenRef([
    ...completedTodoRows,
    ...completedActionRows,
    ...completedTaskRows,
    ...completedChangeRows,
    ...decidedDecisionRows
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

  const nextPeriodChangeRows = (registers?.changes || [])
    .filter((change) => !isChangeCompletedStatus(change?.status))
    .filter((change) => isDateInRange(change?.target, nextPeriodStart, nextPeriodEnd))
    .map((change, idx) => ({
      Reference: change?._id || (change?.number ? `C${change.number}` : `change_${idx + 1}`),
      Source: 'Change Control',
      Title: normalizeText(change?.description) || 'Upcoming change',
      Owner: normalizeText(change?.assignedto || change?.owner) || 'Unassigned',
      'Due Date': normalizeIsoDate(change?.target),
      Status: normalizeText(change?.status) || 'Open',
      Notes: normalizeText(change?.impactstatus) || 'Open change with target date in next period'
    }))

  const keyDeliverablesNextPeriodRows = sortByDateThenRef([
    ...nextPeriodTodoRows,
    ...nextPeriodActionRows,
    ...nextPeriodTaskRows,
    ...nextPeriodChangeRows
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

  const openAssumptionRows = (registers?.assumptions || [])
    .filter((item) => !isResolvedSignalStatus(item?.status))
    .map((item, idx) => ({
      'Signal Type': 'Open Assumption/Dependency',
      Severity: normalizeImpactSeverity(item?.impact),
      Source: 'Assumptions & Dependencies',
      Reference: item?._id || (item?.number ? `A${item.number}` : `assumption_${idx + 1}`),
      Summary: normalizeText(item?.description) || 'Open assumption or dependency',
      Status: normalizeText(item?.status) || 'Open',
      'Due Date': resolveDate(item?.target, item?.dateraised),
      Notes: normalizeText(item?.validationnotes)
    }))

  const openChangeRows = (registers?.changes || [])
    .filter((change) => !isChangeCompletedStatus(change?.status))
    .map((change, idx) => ({
      'Signal Type': 'Open Change',
      Severity: normalizeImpactSeverity(change?.impactstatus),
      Source: 'Change Control',
      Reference: change?._id || (change?.number ? `C${change.number}` : `change_${idx + 1}`),
      Summary: normalizeText(change?.description) || 'Open change item',
      Status: normalizeText(change?.status) || 'Open',
      'Due Date': normalizeIsoDate(change?.target),
      Notes: normalizeText(change?.impactstatus)
    }))

  const pendingDecisionRows = (registers?.decisions || [])
    .filter((decision) => !isDecisionFinalStatus(decision?.status))
    .map((decision, idx) => ({
      'Signal Type': 'Pending Decision',
      Severity: normalizeImpactSeverity(decision?.impact),
      Source: 'Decision Log',
      Reference: decision?._id || (decision?.number ? `D${decision.number}` : `decision_${idx + 1}`),
      Summary: normalizeText(decision?.decision) || 'Pending decision',
      Status: normalizeText(decision?.status) || 'Open',
      'Due Date': resolveDate(decision?.datedecided, decision?.dateraised),
      Notes: normalizeText(decision?.rationale || decision?.impact)
    }))

  const openLessonRows = (registers?.lessons || [])
    .filter((lesson) => !isResolvedSignalStatus(lesson?.status))
    .map((lesson, idx) => ({
      'Signal Type': 'Open Lesson Follow-up',
      Severity: normalizeImpactSeverity(lesson?.category),
      Source: 'Lessons Learned',
      Reference: lesson?._id || (lesson?.number ? `L${lesson.number}` : `lesson_${idx + 1}`),
      Summary: normalizeText(lesson?.description) || 'Open lesson item',
      Status: normalizeText(lesson?.status) || 'Open',
      'Due Date': resolveDate(lesson?.date, lesson?.updatedAt),
      Notes: normalizeText(lesson?.recommendation)
    }))

  const controlSignalRows = [
    ...openAssumptionRows,
    ...openChangeRows,
    ...pendingDecisionRows,
    ...openLessonRows
  ].sort((a, b) => {
    const severityDelta = severityWeight(a.Severity) - severityWeight(b.Severity)
    if (severityDelta !== 0) return severityDelta
    const dueA = normalizeIsoDate(a['Due Date'])
    const dueB = normalizeIsoDate(b['Due Date'])
    if (dueA !== dueB) return dueA.localeCompare(dueB)
    return normalizeText(a.Reference).localeCompare(normalizeText(b.Reference))
  })

  const mainRisksAndIssuesRows = [
    ...overdueTodoRows,
    ...openRiskRows,
    ...openIssueRows,
    ...trackerRiskRows,
    ...controlSignalRows
  ].sort((a, b) => {
    const severityDelta = severityWeight(a.Severity) - severityWeight(b.Severity)
    if (severityDelta !== 0) return severityDelta
    const dueA = normalizeIsoDate(a['Due Date'])
    const dueB = normalizeIsoDate(b['Due Date'])
    if (dueA !== dueB) return dueA.localeCompare(dueB)
    return normalizeText(a.Reference).localeCompare(normalizeText(b.Reference))
  })

  const governanceContextRows = sortByDateThenRef([
    ...(registers?.decisions || [])
      .filter((decision) => isDateInRange(resolveDate(decision?.datedecided, decision?.updatedAt), windowStart, windowEnd))
      .map((decision, idx) => ({
        'Event Type': isDecisionFinalStatus(decision?.status) ? 'Decision Taken' : 'Decision Updated',
        Source: 'Decision Log',
        Reference: decision?._id || (decision?.number ? `D${decision.number}` : `decision_${idx + 1}`),
        Summary: normalizeText(decision?.decision) || 'Decision item',
        Owner: normalizeText(decision?.decidedby) || 'Decision owner',
        'Event Date': resolveDate(decision?.datedecided, decision?.updatedAt),
        Status: normalizeText(decision?.status) || 'Open',
        Notes: normalizeText(decision?.rationale || decision?.impact)
      })),
    ...(registers?.minutes || [])
      .filter((minute) => isDateInRange(resolveDate(minute?.dateraised, minute?.updatedAt), windowStart, windowEnd))
      .map((minute, idx) => ({
        'Event Type': 'Meeting Record',
        Source: 'Meeting Log',
        Reference: minute?._id || (minute?.number ? `M${minute.number}` : `meeting_${idx + 1}`),
        Summary: normalizeText(minute?.minutedescription) || 'Meeting note',
        Owner: '',
        'Event Date': resolveDate(minute?.dateraised, minute?.updatedAt),
        Status: normalizeText(minute?.status) || 'Open',
        Notes: ''
      })),
    ...(registers?.lessons || [])
      .filter((lesson) => isDateInRange(resolveDate(lesson?.date, lesson?.updatedAt), windowStart, windowEnd))
      .map((lesson, idx) => ({
        'Event Type': 'Lesson Captured',
        Source: 'Lessons Learned',
        Reference: lesson?._id || (lesson?.number ? `L${lesson.number}` : `lesson_${idx + 1}`),
        Summary: normalizeText(lesson?.description) || 'Lesson captured',
        Owner: normalizeText(lesson?.owner) || 'Owner not set',
        'Event Date': resolveDate(lesson?.date, lesson?.updatedAt),
        Status: normalizeText(lesson?.status) || 'Open',
        Notes: normalizeText(lesson?.recommendation)
      }))
  ], 'Event Date')

  const raciActivityCount = Array.isArray(raciRegister?.assignments?._customTasks) ? raciRegister.assignments._customTasks.length : 0
  const raciAssignmentCount = raciRegister?.assignments
    ? Object.keys(raciRegister.assignments).filter((key) => key !== '_customTasks').length
    : 0

  const projectContextRows = sortByDateThenRef([
    ...(registers?.stakeholders || [])
      .filter((item) => isDateInRange(resolveDate(item?.updatedAt, item?.createdAt), windowStart, windowEnd))
      .map((item, idx) => ({
        'Context Type': 'Stakeholder Update',
        Source: 'Stakeholder Register',
        Reference: item?._id || (item?.number ? `S${item.number}` : `stakeholder_${idx + 1}`),
        Summary: normalizeText([item?.name, item?.role, item?.organisation].filter(Boolean).join(' — ')) || 'Stakeholder updated',
        Owner: normalizeText(item?.name) || '',
        'Context Date': resolveDate(item?.updatedAt, item?.createdAt),
        Status: normalizeText(item?.escalationlevel) || 'Updated',
        Notes: normalizeText(item?.email || item?.phone || item?.mobile)
      })),
    ...(registers?.commsplan || [])
      .filter((item) => isDateInRange(resolveDate(item?.updatedAt, item?.createdAt), windowStart, windowEnd))
      .map((item, idx) => ({
        'Context Type': 'Communication Plan Update',
        Source: 'Communication Plan',
        Reference: item?._id || (item?.number ? `CP${item.number}` : `comms_${idx + 1}`),
        Summary: normalizeText([item?.audience, item?.meetingtype].filter(Boolean).join(' — ')) || 'Communication plan item updated',
        Owner: normalizeText(item?.owner) || 'Owner not set',
        'Context Date': resolveDate(item?.updatedAt, item?.createdAt),
        Status: normalizeText(item?.frequency) || 'Updated',
        Notes: normalizeText(item?.informationrequired || item?.method)
      })),
    ...(registers?.costs || [])
      .filter((item) => isDateInRange(resolveDate(item?.date, item?.dateraised, item?.updatedAt, item?.createdAt), windowStart, windowEnd))
      .map((item, idx) => ({
        'Context Type': 'Cost / Project Control',
        Source: 'Cost Register',
        Reference: item?._id || (item?.number ? `CR${item.number}` : `cost_${idx + 1}`),
        Summary: normalizeText(item?.costdescription || item?.sitename) || 'Cost register item',
        Owner: normalizeText(item?.acceptedby || item?.tobechargedto) || '',
        'Context Date': resolveDate(item?.date, item?.dateraised, item?.updatedAt, item?.createdAt),
        Status: normalizeText(item?.billing) || 'Updated',
        Notes: normalizeText(item?.cost ? `Cost: ${item.cost}` : '')
      })),
    ...(raciRegister && isDateInRange(resolveDate(raciRegister?.updatedAt), windowStart, windowEnd) ? [{
      'Context Type': 'RACI Update',
      Source: 'RACI',
      Reference: 'raci_matrix',
      Summary: `RACI updated with ${raciActivityCount} activities and ${Array.isArray(raciRegister?.roles) ? raciRegister.roles.length : 0} roles`,
      Owner: '',
      'Context Date': resolveDate(raciRegister?.updatedAt),
      Status: raciAssignmentCount > 0 ? 'Assignments updated' : 'Structure updated',
      Notes: raciAssignmentCount > 0 ? `${raciAssignmentCount} assignment cells populated` : ''
    }] : [])
  ], 'Context Date')

  const additionalNotesRows = [
    { Section: 'Overall Status Narrative', Value: normalizeText(statusReport?.overallNarrative) },
    { Section: 'Key Deliverables This Period', Value: normalizeText(statusReport?.deliverablesThisPeriod) },
    { Section: 'Key Deliverables Next Period', Value: normalizeText(statusReport?.deliverablesNextPeriod) },
    { Section: 'Main Risks and Issues', Value: normalizeText(`${normalizeText(statusReport?.mainRisks)}\n${normalizeText(statusReport?.mainIssues)}`).trim() },
    { Section: 'Additional Notes', Value: normalizeText(statusReport?.additionalNotes) },
    { Section: 'User Export Notes', Value: normalizeText(userNotes) }
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
    ['Main Risks and Issues must be backed by 04_RISK_SIGNALS and 06_CONTROL_SIGNALS.'],
    ['Overall Status Narrative and Additional Notes may use 05_GOVERNANCE_CONTEXT, 07_PROJECT_CONTEXT, and 08_ADDITIONAL_NOTES.']
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
    { Field: 'next_period_days', Value: String(NEXT_PERIOD_DAYS) },
    { Field: 'completed_items_count', Value: String(thisPeriodCompletedRows.length) },
    { Field: 'next_period_items_count', Value: String(keyDeliverablesNextPeriodRows.length) },
    { Field: 'risk_signals_count', Value: String(mainRisksAndIssuesRows.length) },
    { Field: 'governance_context_count', Value: String(governanceContextRows.length) },
    { Field: 'control_signal_count', Value: String(controlSignalRows.length) },
    { Field: 'project_context_count', Value: String(projectContextRows.length) }
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
    governanceContextRows: withFallback(governanceContextRows, {
      'Event Type': 'System',
      Source: 'System',
      Reference: '',
      Summary: 'No governance events found in selected period',
      Owner: '',
      'Event Date': '',
      Status: '',
      Notes: ''
    }),
    controlSignalRows: withFallback(controlSignalRows, {
      'Signal Type': 'System',
      Severity: 'Low',
      Source: 'System',
      Reference: '',
      Summary: 'No additional control signals found',
      Status: '',
      'Due Date': '',
      Notes: ''
    }),
    projectContextRows: withFallback(projectContextRows, {
      'Context Type': 'System',
      Source: 'System',
      Reference: '',
      Summary: 'No project context updates found in selected period',
      Owner: '',
      'Context Date': '',
      Status: '',
      Notes: ''
    }),
    additionalNotesRows,
    outputTemplateRows,
    windowStart,
    windowEnd,
    nextPeriodStart,
    nextPeriodEnd
  }
}
