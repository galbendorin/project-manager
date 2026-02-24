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
      risks: [
        { _id: 'risk_1', number: 1, level: 'High', riskdetails: 'Vendor delay on hardware' }
      ],
      issues: [
        { _id: 'issue_1', number: 2, status: 'Open', description: 'Missing access for QA', target: '2026-02-19' }
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
    dateFrom: '2026-02-01',
    dateTo: '2026-02-14',
    timezone: 'America/New_York',
    generatedAtUtc: '2026-02-24T12:00:00.000Z'
  })

  const completedRefs = exportData.thisPeriodCompletedRows.map((row) => row.Reference)
  assert.ok(completedRefs.includes('todo_done_in'))
  assert.ok(!completedRefs.includes('todo_done_out'))
  assert.ok(!completedRefs.includes('todo_done_other_proj'))

  const nextRefs = exportData.keyDeliverablesNextPeriodRows.map((row) => row.Reference)
  assert.ok(nextRefs.includes('todo_next'))
  assert.ok(nextRefs.includes('action_next'))

  const signalTypes = exportData.mainRisksAndIssuesRows.map((row) => row['Signal Type'])
  assert.ok(signalTypes.includes('Overdue ToDo'))
  assert.ok(signalTypes.includes('Open Risk'))
  assert.ok(signalTypes.includes('Open Issue'))
  assert.ok(signalTypes.includes('Tracker Risk Signal'))

  assert.equal(exportData.windowStart, '2026-02-01')
  assert.equal(exportData.windowEnd, '2026-02-14')
  assert.equal(exportData.nextPeriodStart, '2026-02-15')
  assert.equal(exportData.nextPeriodEnd, '2026-02-28')
  assert.match(exportData.fileNameBase, /^Alpha_Launch_project_report_input$/)

  const templateKeys = Object.keys(exportData.outputTemplateRows[0])
  assert.deepEqual(templateKeys, AI_REPORT_SECTION_NAMES)
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
