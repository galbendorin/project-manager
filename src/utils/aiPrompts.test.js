import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReportPrompt, getReportSystemPrompt } from './aiPrompts.js'

test('buildReportPrompt includes expanded context blocks while keeping the same report headers', () => {
  const prompt = buildReportPrompt({
    project: { id: 'project_1', name: 'Alpha Launch' },
    tasks: [],
    registers: {
      decisions: [
        { _id: 'decision_1', decision: 'Use phased go-live', status: 'Approved', datedecided: '2026-02-11', decidedby: 'SteerCo' }
      ],
      minutes: [
        { _id: 'minute_1', dateraised: '2026-02-10', minutedescription: 'SteerCo agreed weekly checkpoints.', status: 'Logged' }
      ],
      stakeholders: [
        { _id: 'stakeholder_1', name: 'Jane Doe', role: 'Sponsor', organisation: 'ClientCo', updatedAt: '2026-02-10T10:00:00.000Z' }
      ],
      risks: [],
      issues: [],
      actions: [],
      changes: [],
      assumptions: [],
      lessons: [],
      commsplan: [],
      costs: [],
      _raci: [{ updatedAt: '2026-02-12T12:00:00.000Z', roles: [], assignments: { _customTasks: [] } }]
    },
    tracker: [],
    statusReport: { overallNarrative: 'Narrative context' },
    todos: [],
    userNotes: 'Focus on governance outcomes.',
    dateFrom: '2026-02-01',
    dateTo: '2026-02-14'
  })

  assert.match(prompt, /=== GOVERNANCE CONTEXT ===/)
  assert.match(prompt, /=== CONTROL SIGNALS ===/)
  assert.match(prompt, /=== PROJECT CONTEXT ===/)
  assert.match(prompt, /Use phased go-live/)
  assert.match(prompt, /Narrative context/)
  assert.match(prompt, /Focus on governance outcomes\./)

  const systemPrompt = getReportSystemPrompt()
  assert.match(systemPrompt, /## Overall Status Narrative/)
  assert.match(systemPrompt, /## Key Deliverables This Period/)
  assert.match(systemPrompt, /## Key Deliverables Next Period/)
  assert.match(systemPrompt, /## Main Risks and Issues/)
  assert.match(systemPrompt, /## Additional Notes/)
})
