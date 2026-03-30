import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAiReportExportData, AI_REPORT_SECTION_NAMES } from './aiReportExport.js'

test('buildAiReportExportData includes project-scoped completed todos and required sections', () => {
  const exportData = buildAiReportExportData({
    project: { id: 'project_1', name: 'Alpha Launch' },
    tasks: [
      { id: 11, name: 'Task Completed', pct: 100, start: '2026-02-05', dur: 2, updatedAt: '2026-02-10T10:00:00.000Z' },
      { id: 12, name: 'Task Pending', pct: 40, start: '2026-02-17', dur: 2, updatedAt: '2026-02-09T10:00:00.000Z' }
    ],
    registers: {
      actions: [
        { _id: 'action_done', description: 'Close checklist', status: 'Completed', updatedAt: '2026-02-12T10:00:00.000Z', owner: 'PM' },
        { _id: 'action_next', description: 'Approve deployment plan', status: 'Open', target: '2026-02-20', owner: 'PM' }
      ],
      changes: [
        { _id: 'change_done', number: 3, description: 'Firewall rule rollout', status: 'Implemented', complete: '2026-02-13', assignedto: 'Network Lead', target: '2026-02-14', impactstatus: 'High impact approved change' },
        { _id: 'change_next', number: 4, description: 'DNS switch-over', status: 'Open', target: '2026-02-16', assignedto: 'Infra Lead', impactstatus: 'Medium impact' }
      ],
      assumptions: [
        { _id: 'assumption_1', number: 5, description: 'Carrier will confirm handover', status: 'Open', impact: 'High service risk', validationnotes: 'No confirmation yet' }
      ],
      decisions: [
        { _id: 'decision_1', number: 6, decision: 'Use phased go-live', status: 'Approved', datedecided: '2026-02-11', decidedby: 'SteerCo', rationale: 'Lower deployment risk' },
        { _id: 'decision_2', number: 7, decision: 'Choose final cutover weekend', status: 'Pending', dateraised: '2026-02-12', impact: 'Needed for vendor booking' }
      ],
      minutes: [
        { _id: 'minute_1', number: 8, dateraised: '2026-02-10', minutedescription: 'SteerCo agreed to maintain weekly checkpoints.', status: 'Logged' }
      ],
      stakeholders: [
        { _id: 'stakeholder_1', number: 9, name: 'Jane Doe', role: 'Sponsor', organisation: 'ClientCo', escalationlevel: 'High', updatedAt: '2026-02-10T10:00:00.000Z' }
      ],
      commsplan: [
        { _id: 'comms_1', number: 10, audience: 'SteerCo', meetingtype: 'Weekly status', frequency: 'Weekly', owner: 'PM', informationrequired: 'RAG, top blockers', updatedAt: '2026-02-10T11:00:00.000Z' }
      ],
      costs: [
        { _id: 'cost_1', number: 11, costdescription: 'Weekend cutover cover', cost: '2500', billing: 'Pending approval', dateraised: '2026-02-09', acceptedby: 'Finance Lead' }
      ],
      risks: [
        { _id: 'risk_1', number: 1, level: 'High', riskdetails: 'Vendor delay on hardware' }
      ],
      issues: [
        { _id: 'issue_1', number: 2, status: 'Open', description: 'Missing access for QA', target: '2026-02-19' }
      ],
      lessons: [
        { _id: 'lesson_1', number: 12, date: '2026-02-08', description: 'Pilot handover checklist was incomplete.', recommendation: 'Add CAB pre-check', owner: 'PMO', status: 'Open' }
      ],
      _raci: [
        {
          updatedAt: '2026-02-12T12:00:00.000Z',
          roles: ['PM', 'Tech Lead'],
          assignments: {
            _customTasks: ['Pilot cutover', 'Handover'],
            'custom-0::PM': 'A',
            'custom-0::Tech Lead': 'R'
          }
        }
      ]
    },
    tracker: [
      { _id: 'tracker_1', taskName: 'Carrier readiness', rag: 'Red', status: 'In Progress' }
    ],
    statusReport: {
      overallNarrative: 'Narrative',
      deliverablesThisPeriod: 'This period',
      deliverablesNextPeriod: 'Next period',
      mainRisks: 'Risk notes',
      mainIssues: 'Issue notes',
      additionalNotes: 'Additional notes'
    },
    todos: [
      { _id: 'todo_done_in', projectId: 'project_1', title: 'Validate release notes', status: 'Done', owner: 'QA', dueDate: '2026-02-08', completedAt: '2026-02-09T09:00:00.000Z', updatedAt: '2026-02-09T09:00:00.000Z' },
      { _id: 'todo_done_out', projectId: 'project_1', title: 'Old completed todo', status: 'Done', owner: 'QA', dueDate: '2026-01-20', completedAt: '2026-01-20T09:00:00.000Z', updatedAt: '2026-01-20T09:00:00.000Z' },
      { _id: 'todo_done_other_proj', projectId: 'project_2', title: 'Other project done', status: 'Done', owner: 'QA', dueDate: '2026-02-08', completedAt: '2026-02-10T09:00:00.000Z', updatedAt: '2026-02-10T09:00:00.000Z' },
      { _id: 'todo_next', projectId: 'project_1', title: 'Prep handover', status: 'Open', owner: 'PM', dueDate: '2026-02-18', updatedAt: '2026-02-11T09:00:00.000Z' },
      { _id: 'todo_overdue', projectId: 'project_1', title: 'Missed dependency call', status: 'Open', owner: 'Ops', dueDate: '2026-02-04', updatedAt: '2026-02-11T09:00:00.000Z' }
    ],
    userNotes: 'Please emphasize UAT completion risk and vendor follow-up.',
    dateFrom: '2026-02-01',
    dateTo: '2026-02-14',
    timezone: 'America/New_York',
    generatedAtUtc: '2026-02-24T12:00:00.000Z'
  })

  const completedRefs = exportData.thisPeriodCompletedRows.map((row) => row.Reference)
  assert.ok(completedRefs.includes('todo_done_in'))
  assert.ok(!completedRefs.includes('todo_done_out'))
  assert.ok(!completedRefs.includes('todo_done_other_proj'))
  assert.ok(completedRefs.includes('change_done'))
  assert.ok(completedRefs.includes('decision_1'))

  const nextRefs = exportData.keyDeliverablesNextPeriodRows.map((row) => row.Reference)
  assert.ok(nextRefs.includes('todo_next'))
  assert.ok(nextRefs.includes('action_next'))
  assert.ok(nextRefs.includes('change_next'))

  const signalTypes = exportData.mainRisksAndIssuesRows.map((row) => row['Signal Type'])
  assert.ok(signalTypes.includes('Overdue ToDo'))
  assert.ok(signalTypes.includes('Open Risk'))
  assert.ok(signalTypes.includes('Open Issue'))
  assert.ok(signalTypes.includes('Tracker Risk Signal'))
  assert.ok(signalTypes.includes('Open Change'))
  assert.ok(signalTypes.includes('Open Assumption/Dependency'))
  assert.ok(signalTypes.includes('Pending Decision'))
  assert.ok(signalTypes.includes('Open Lesson Follow-up'))

  const governanceTypes = exportData.governanceContextRows.map((row) => row['Event Type'])
  assert.ok(governanceTypes.includes('Decision Taken'))
  assert.ok(governanceTypes.includes('Meeting Record'))
  assert.ok(governanceTypes.includes('Lesson Captured'))

  const projectContextTypes = exportData.projectContextRows.map((row) => row['Context Type'])
  assert.ok(projectContextTypes.includes('Stakeholder Update'))
  assert.ok(projectContextTypes.includes('Communication Plan Update'))
  assert.ok(projectContextTypes.includes('Cost / Project Control'))
  assert.ok(projectContextTypes.includes('RACI Update'))

  const controlSignalTypes = exportData.controlSignalRows.map((row) => row['Signal Type'])
  assert.ok(controlSignalTypes.includes('Open Change'))
  assert.ok(controlSignalTypes.includes('Open Assumption/Dependency'))
  assert.ok(controlSignalTypes.includes('Pending Decision'))
  assert.ok(controlSignalTypes.includes('Open Lesson Follow-up'))
  assert.ok(!controlSignalTypes.includes('Open Risk'))

  assert.equal(exportData.windowStart, '2026-02-01')
  assert.equal(exportData.windowEnd, '2026-02-14')
  assert.equal(exportData.nextPeriodStart, '2026-02-15')
  assert.equal(exportData.nextPeriodEnd, '2026-02-21')
  assert.match(exportData.fileNameBase, /^Alpha_Launch_project_report_input$/)

  const templateKeys = Object.keys(exportData.outputTemplateRows[0])
  assert.deepEqual(templateKeys, AI_REPORT_SECTION_NAMES)

  const userNotesRow = exportData.additionalNotesRows.find((row) => row.Section === 'User Export Notes')
  assert.equal(userNotesRow?.Value, 'Please emphasize UAT completion risk and vendor follow-up.')
})

test('buildAiReportExportData adds fallback rows when period has no records', () => {
  const exportData = buildAiReportExportData({
    project: { id: 'project_9', name: 'No Data Project' },
    tasks: [],
    registers: { actions: [], risks: [], issues: [] },
    tracker: [],
    statusReport: {},
    todos: [],
    dateFrom: '2026-02-01',
    dateTo: '2026-02-07',
    timezone: 'UTC',
    generatedAtUtc: '2026-02-24T12:00:00.000Z'
  })

  assert.equal(exportData.thisPeriodCompletedRows.length, 1)
  assert.equal(exportData.thisPeriodCompletedRows[0].Source, 'System')
  assert.equal(exportData.keyDeliverablesNextPeriodRows.length, 1)
  assert.equal(exportData.mainRisksAndIssuesRows.length, 1)
})
