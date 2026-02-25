/**
 * AI Prompt Builders — converts project data into structured prompts
 * for report generation and project plan creation.
 * 
 * Reuses buildAiReportExportData() so the data logic is shared
 * between the local file export and the live AI generation.
 */

import { buildAiReportExportData, AI_REPORT_SECTION_NAMES } from './aiReportExport.js'

/**
 * Build the system prompt for AI report generation
 */
const REPORT_SYSTEM_PROMPT = `You are a senior project manager writing a concise status report.

Rules:
- Use ONLY the data provided. Do not invent facts or statistics.
- Write in professional, clear language suitable for stakeholders.
- Be specific: reference task names, dates, owners, and risk items from the data.
- Keep each section 2-5 sentences. Executives read these quickly.
- If a section has no relevant data, write "No items to report for this period."
- For risks and issues, include severity and any mitigation actions mentioned.
- Dates should be formatted as DD Mon YYYY (e.g., 15 Feb 2026).

Return EXACTLY these sections as markdown headers (##):
${AI_REPORT_SECTION_NAMES.map(s => `## ${s}`).join('\n')}

Do not add any other sections. Do not add a title or preamble before the first section.`

/**
 * Format a table of rows as a readable text block for the prompt
 */
const formatDataTable = (rows, columns) => {
  if (!rows || rows.length === 0) return '(none)\n'
  return rows.map(row => {
    return columns
      .filter(col => row[col] !== undefined && row[col] !== '')
      .map(col => `  ${col}: ${row[col]}`)
      .join('\n')
  }).join('\n---\n') + '\n'
}

/**
 * Build the user message for report generation from export data
 */
export const buildReportPrompt = ({
  project,
  tasks,
  registers,
  tracker,
  statusReport,
  todos,
  userNotes,
  dateFrom,
  dateTo
}) => {
  const data = buildAiReportExportData({
    project,
    tasks,
    registers,
    tracker,
    statusReport,
    todos,
    userNotes,
    dateFrom,
    dateTo
  })

  const lines = []
  
  lines.push(`PROJECT: ${project?.name || 'Current Project'}`)
  lines.push(`REPORTING WINDOW: ${data.windowStart} to ${data.windowEnd}`)
  lines.push(`NEXT PERIOD: ${data.nextPeriodStart} to ${data.nextPeriodEnd}`)
  lines.push('')

  lines.push('=== COMPLETED THIS PERIOD ===')
  lines.push(formatDataTable(
    data.thisPeriodCompletedRows,
    ['Source', 'Title', 'Owner', 'Completed Date', 'Due Date', 'Status']
  ))

  lines.push('=== PLANNED NEXT PERIOD ===')
  lines.push(formatDataTable(
    data.keyDeliverablesNextPeriodRows,
    ['Source', 'Title', 'Owner', 'Due Date', 'Status', 'Notes']
  ))

  lines.push('=== RISK SIGNALS ===')
  lines.push(formatDataTable(
    data.mainRisksAndIssuesRows,
    ['Signal Type', 'Severity', 'Source', 'Summary', 'Status', 'Due Date']
  ))

  lines.push('=== EXISTING NARRATIVE (for context) ===')
  for (const note of data.additionalNotesRows) {
    const val = note.Value?.trim()
    if (val) {
      lines.push(`${note.Section}: ${val}`)
    }
  }

  if (userNotes?.trim()) {
    lines.push('')
    lines.push(`=== USER NOTES ===`)
    lines.push(userNotes.trim())
  }

  return lines.join('\n')
}

export const getReportSystemPrompt = () => REPORT_SYSTEM_PROMPT

/**
 * System prompt for SLT email digest
 */
const EMAIL_DIGEST_SYSTEM_PROMPT = `You are a senior project manager writing a concise weekly status email for Senior Leadership (SLT/Exec).

Rules:
- Write in professional, direct business English — no filler or jargon.
- Keep the ENTIRE email under 250 words. Executives scan, not read.
- Use this structure:
  Subject line: [Project Name] Status Update — [Date] — [RAG colour]
  
  Opening line: One sentence overall status.
  
  Key Progress: 2-3 bullet points of what was achieved this period.
  
  Coming Up: 2-3 bullet points of what's planned next period.
  
  Risks & Issues: Only mention items rated High/Very High, or say "None requiring escalation."
  
  Decisions Needed: List any, or say "None at this time."

- Use the RAG status (Red/Amber/Green) naturally — e.g., "Project is tracking Green."
- Include specific numbers: % complete, task counts, milestone dates.
- Do NOT include greetings like "Dear team" or sign-offs like "Best regards". Just the content.
- Format as plain text with clear line breaks. No markdown headers — this goes into an email.
- Start with the Subject line on its own line prefixed with "Subject: ".`

export const getEmailDigestSystemPrompt = () => EMAIL_DIGEST_SYSTEM_PROMPT

/**
 * Build prompt for email digest — reuses the same data as report generation
 */
export const buildEmailDigestPrompt = ({
  project,
  tasks,
  registers,
  tracker,
  statusReport,
  todos,
  dateFrom,
  dateTo
}) => {
  return buildReportPrompt({
    project,
    tasks,
    registers,
    tracker,
    statusReport,
    todos,
    userNotes: 'Generate a concise SLT executive email digest from this data.',
    dateFrom,
    dateTo
  })
}

/**
 * System prompt for AI project plan generation
 */
const PLAN_SYSTEM_PROMPT = `You are a senior project manager creating a work breakdown structure.

Rules:
- Create a realistic, actionable project plan based on the user's description.
- Use a hierarchical structure: phases (indent 0) contain tasks (indent 1), which may contain subtasks (indent 2).
- Durations are in BUSINESS DAYS (Mon-Fri). Be realistic — don't underestimate.
- Include dependencies where tasks logically follow each other (finish-to-start).
- Assign generic role-based owners (e.g., "PM", "Tech Lead", "Developer", "QA", "BA").
- Include milestones (duration 0) at key decision points and phase gates.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "name": "Task name",
  "type": "Task" or "Milestone",
  "indent": 0-2,
  "dur": number (business days, 0 for milestones),
  "owner": "Role name",
  "parent": null or index of parent task (0-based),
  "pct": 0
}

Do not include any text before or after the JSON array. Do not wrap in markdown code fences.`

/**
 * Build prompt for project plan generation
 */
export const buildPlanPrompt = (description) => {
  return `Create a project plan for the following:\n\n${description.trim()}\n\nReturn the plan as a JSON array.`
}

export const getPlanSystemPrompt = () => PLAN_SYSTEM_PROMPT

/**
 * System prompt for conversational plan editing
 */
const EDIT_SYSTEM_PROMPT = `You are a senior project manager assistant that modifies project plans.

You will receive the current project plan as a JSON array and an instruction from the user.

Each task has these fields:
- id: unique number
- name: task name
- type: "Task" or "Milestone"
- indent: 0 (phase), 1 (task), 2 (subtask)
- dur: duration in BUSINESS DAYS (Mon-Fri). 0 for milestones. Parent durations are auto-calculated from children — set to 0.
- start: start date YYYY-MM-DD (or null to auto-calculate from dependencies)
- parent: id of parent task, or null
- depType: "FS" (finish-to-start), "SS", "FF", or "SF"
- pct: percentage complete (0-100)
- owner: person or role name
- dependencies: array of dependency objects like [{"taskId": 3, "type": "FS"}]

RULES:
1. Apply the user's requested changes to the task list.
2. Return the COMPLETE modified task array as valid JSON.
3. Preserve all existing tasks that aren't being changed.
4. When adding tasks, use IDs higher than any existing ID.
5. When adding dependencies, use {"taskId": <id>, "type": "FS"} format.
6. Keep the hierarchy consistent — if you add a task under a phase, set indent and parent correctly.
7. Durations are BUSINESS DAYS. 1 week = 5 days. 2 weeks = 10 days.
8. If the user says "move deadline" or "change duration", adjust the dur or start field.
9. Do NOT remove tasks unless explicitly asked.

Return ONLY the JSON array. No text before or after. No markdown code fences.`

/**
 * Serialize current tasks into compact format for the AI
 */
const serializeTasks = (tasks) => {
  if (!tasks || tasks.length === 0) return '[]'
  return JSON.stringify(tasks.map(t => ({
    id: t.id,
    name: t.name || 'Untitled',
    type: t.type || 'Task',
    indent: t.indent || 0,
    dur: t.dur || 0,
    start: t.start || null,
    parent: t.parent || null,
    depType: t.depType || 'FS',
    pct: t.pct || 0,
    owner: t.owner || '',
    dependencies: t.dependencies || []
  })))
}

/**
 * Build user message for plan editing
 */
export const buildEditPrompt = (tasks, instruction) => {
  return `CURRENT PLAN:\n${serializeTasks(tasks)}\n\nINSTRUCTION: ${instruction.trim()}\n\nReturn the complete modified task array as JSON.`
}

export const getEditSystemPrompt = () => EDIT_SYSTEM_PROMPT
