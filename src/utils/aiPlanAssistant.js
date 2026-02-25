/**
 * AI Plan Assistant — prompts and response handling for
 * plan creation and conversational plan editing.
 *
 * The AI always returns a full task array as JSON.
 * The app replaces projectData with the returned array.
 */

import { generateAiContent } from './aiClient.js'

// ── System prompt for creating a brand new plan ──────────────────────

const CREATE_PLAN_SYSTEM = `You are a senior project manager creating a work breakdown structure.

Rules:
- Create a realistic, actionable project plan based on the user's description.
- Use a hierarchical structure: phases (indent 0) contain tasks (indent 1), subtasks (indent 2).
- Durations are in BUSINESS DAYS (Mon-Fri). Be realistic — don't underestimate.
- Set "parent" to the id of the parent task for children. Top-level tasks have parent: null.
- Dependencies use "parent" field pointing to predecessor task id (FS = finish-to-start).
- Assign generic role-based owners (e.g., "PM", "Tech Lead", "Developer", "QA", "BA").
- Include milestones (dur: 0, type: "Milestone") at key decision points and phase gates.
- Start dates are auto-calculated by the app from dependencies — set start to null for dependent tasks.
- The first task should have a start date in YYYY-MM-DD format (today or user-specified).
- IDs must be sequential integers starting from 1.

Return ONLY a valid JSON array. Each element must have exactly these fields:
{
  "id": number,
  "name": "Task name",
  "type": "Task" or "Milestone",
  "indent": 0-2,
  "dur": number (business days, 0 for milestones),
  "start": "YYYY-MM-DD" or null,
  "pct": 0,
  "parent": null or id of predecessor task,
  "depType": "FS",
  "owner": "Role name"
}

Do not include any text before or after the JSON array. No markdown fences. Just raw JSON.`

// ── System prompt for editing an existing plan ───────────────────────

const EDIT_PLAN_SYSTEM = `You are a senior project manager assistant that edits project plans.

You receive the current project plan as a JSON array and a user instruction.
Apply the requested changes and return the COMPLETE updated task array.

Task schema:
{
  "id": number,
  "name": "Task name",
  "type": "Task" or "Milestone",
  "indent": 0-2,
  "dur": number (business days, 0 for milestones),
  "start": "YYYY-MM-DD" or null,
  "pct": 0-100,
  "parent": null or id of predecessor task (finish-to-start dependency),
  "depType": "FS",
  "owner": "Role name",
  "tracked": boolean
}

Rules:
- Return the COMPLETE task array, not just the changed tasks.
- When adding tasks, assign the next sequential id (max existing id + 1).
- When adding dependencies, set the "parent" field of the dependent task to the predecessor's id.
- When removing tasks, remove them from the array and update any tasks that depended on them.
- When changing durations, update the "dur" field. Durations are in BUSINESS DAYS.
- When moving deadlines, adjust start dates or durations as appropriate.
- When reordering tasks, maintain correct indent hierarchy.
- Preserve all existing task fields you don't need to change (especially "tracked", "pct", timestamps).
- Do NOT change task ids unless absolutely necessary (merging/splitting).
- Keep "depType" as "FS" unless the user specifies otherwise.
- Start dates are auto-calculated from dependencies by the app — set to null if task has a parent dependency.

Respond with ONLY the complete JSON array. No text before or after. No markdown fences.`

// ── Build user message for editing ───────────────────────────────────

const buildEditMessage = (tasks, userRequest) => {
  const simplifiedTasks = tasks.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type || 'Task',
    indent: t.indent || 0,
    dur: t.dur,
    start: t.start,
    pct: t.pct || 0,
    parent: t.parent,
    depType: t.depType || 'FS',
    owner: t.owner || '',
    tracked: !!t.tracked
  }))

  return `CURRENT PLAN:\n${JSON.stringify(simplifiedTasks, null, 2)}\n\nUSER REQUEST:\n${userRequest}`
}

// ── Parse AI response into task array ────────────────────────────────

const parseTaskArray = (text) => {
  if (!text) return null

  // Strip markdown fences if present
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '')
  }

  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return null
    if (parsed.length === 0) return null

    // Validate minimum fields
    const valid = parsed.every(t =>
      typeof t.id === 'number' &&
      typeof t.name === 'string' &&
      t.name.length > 0
    )
    if (!valid) return null

    // Normalize fields
    return parsed.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type || 'Task',
      indent: t.indent || 0,
      dur: t.dur ?? 1,
      start: t.start || null,
      pct: t.pct || 0,
      parent: t.parent ?? null,
      depType: t.depType || 'FS',
      owner: t.owner || '',
      tracked: !!t.tracked
    }))
  } catch {
    return null
  }
}

// ── Main API: create a new plan ──────────────────────────────────────

export const createPlan = async ({ description, settings, onChunk, signal }) => {
  let fullText = ''

  const result = await generateAiContent({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    systemPrompt: CREATE_PLAN_SYSTEM,
    userMessage: description,
    maxTokens: 8192,
    onChunk: onChunk ? (chunk, full) => {
      fullText = full
      onChunk(chunk, full)
    } : undefined,
    signal
  })

  if (!result.ok) return { ok: false, error: result.error }

  const text = result.text || fullText
  const tasks = parseTaskArray(text)
  if (!tasks) return { ok: false, error: 'AI returned invalid task data. Please try again.', rawText: text }

  return { ok: true, tasks, rawText: text }
}

// ── Main API: edit existing plan ─────────────────────────────────────

export const editPlan = async ({ tasks, userRequest, settings, onChunk, signal }) => {
  let fullText = ''

  const result = await generateAiContent({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    systemPrompt: EDIT_PLAN_SYSTEM,
    userMessage: buildEditMessage(tasks, userRequest),
    maxTokens: 8192,
    onChunk: onChunk ? (chunk, full) => {
      fullText = full
      onChunk(chunk, full)
    } : undefined,
    signal
  })

  if (!result.ok) return { ok: false, error: result.error }

  const text = result.text || fullText
  const updatedTasks = parseTaskArray(text)
  if (!updatedTasks) return { ok: false, error: 'AI returned invalid task data. Please try again.', rawText: text }

  return { ok: true, tasks: updatedTasks, rawText: text }
}

// ── Describe changes between old and new task arrays ─────────────────

export const describeChanges = (oldTasks, newTasks) => {
  const oldIds = new Set(oldTasks.map(t => t.id))
  const newIds = new Set(newTasks.map(t => t.id))

  const added = newTasks.filter(t => !oldIds.has(t.id))
  const removed = oldTasks.filter(t => !newIds.has(t.id))

  const modified = newTasks.filter(t => {
    if (!oldIds.has(t.id)) return false
    const old = oldTasks.find(o => o.id === t.id)
    return JSON.stringify(old) !== JSON.stringify(t)
  })

  const parts = []
  if (added.length > 0) parts.push(`${added.length} task${added.length > 1 ? 's' : ''} added`)
  if (removed.length > 0) parts.push(`${removed.length} task${removed.length > 1 ? 's' : ''} removed`)
  if (modified.length > 0) parts.push(`${modified.length} task${modified.length > 1 ? 's' : ''} modified`)
  if (parts.length === 0) parts.push('No changes detected')

  return {
    added,
    removed,
    modified,
    summary: parts.join(', ')
  }
}
