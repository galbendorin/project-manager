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
