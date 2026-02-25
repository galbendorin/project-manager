/**
 * AI Plan Assistant — prompts and response handling for
 * plan creation and conversational plan editing.
 *
 * CREATE mode: AI returns a full task array.
 * EDIT mode: AI returns a compact patch (changes only), which we apply locally.
 */

import { generateAiContent } from './aiClient.js'

// ── System prompt for creating a brand new plan ──────────────────────

const CREATE_PLAN_SYSTEM = `You are a senior project manager creating a work breakdown structure.

Rules:
- Create a realistic, actionable project plan based on the user's description.
- Use a hierarchical structure: phases (indent 0) contain tasks (indent 1), subtasks (indent 2).
- Durations are in BUSINESS DAYS (Mon-Fri). Be realistic — don't underestimate.
- Set "parent" to the id of the predecessor/dependency task. Top-level tasks with no dependency have parent: null.
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

// ── System prompt for editing (patch mode) ───────────────────────────

const EDIT_PLAN_SYSTEM = `You are a project management assistant. You receive a task list and a user instruction.

Return ONLY a JSON object describing the changes. Format:

{
  "updates": [
    { "id": 5, "dur": 10 },
    { "id": 12, "name": "New name", "owner": "QA Lead" }
  ],
  "additions": [
    { "name": "New task", "type": "Task", "indent": 1, "dur": 5, "owner": "Dev", "insertAfterId": 12, "parent": null, "depType": "FS" }
  ],
  "deletions": [3, 7]
}

RULES:
- "updates": array of objects. Each MUST have "id" plus ONLY the fields that change. Do NOT include unchanged fields.
- "additions": array of new tasks to add. Include "insertAfterId" to position them (the id of the task they go after). Set "parent" to the id of the dependency if needed.
- "deletions": array of task ids to remove.
- Omit any section that has no items (e.g., if no deletions, don't include "deletions").
- Durations are BUSINESS DAYS. 1 week = 5 days. 2 weeks = 10 days.
- "parent" field = the id of the predecessor task (finish-to-start dependency). null = no dependency.
- Keep responses minimal — only include what actually changes.
- If the user asks to add a dependency between tasks, update the dependent task's "parent" field to the predecessor's id.

IMPORTANT: Return ONLY the JSON object. No explanation, no markdown fences, no extra text.`

// ── Build a compact task summary for the edit prompt ─────────────────

const buildTaskSummary = (tasks) => {
  return tasks.map(t => {
    const parts = [`#${t.id} "${t.name}"`]
    if (t.dur) parts.push(`dur:${t.dur}d`)
    if (t.start) parts.push(`start:${t.start}`)
    if (t.owner) parts.push(`owner:${t.owner}`)
    if (t.parent) parts.push(`dep:#${t.parent}`)
    if (t.pct) parts.push(`${t.pct}%`)
    if (t.indent) parts.push(`indent:${t.indent}`)
    return parts.join(' | ')
  }).join('\n')
}

// ── Parse patch response ─────────────────────────────────────────────

const parsePatch = (text) => {
  if (!text) return null

  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '')
  }

  try {
    const patch = JSON.parse(cleaned)
    if (typeof patch !== 'object' || Array.isArray(patch)) return null

    const hasUpdates = Array.isArray(patch.updates) && patch.updates.length > 0
    const hasAdditions = Array.isArray(patch.additions) && patch.additions.length > 0
    const hasDeletions = Array.isArray(patch.deletions) && patch.deletions.length > 0

    if (!hasUpdates && !hasAdditions && !hasDeletions) return null

    return {
      updates: patch.updates || [],
      additions: patch.additions || [],
      deletions: patch.deletions || []
    }
  } catch {
    return null
  }
}

// ── Apply patch to task array ────────────────────────────────────────

const applyPatch = (tasks, patch) => {
  let result = [...tasks]

  // 1. Apply deletions
  if (patch.deletions.length > 0) {
    const deleteSet = new Set(patch.deletions)
    result = result.filter(t => !deleteSet.has(t.id))
  }

  // 2. Apply updates
  for (const update of patch.updates) {
    const idx = result.findIndex(t => t.id === update.id)
    if (idx === -1) continue
    const { id, ...changes } = update
    result[idx] = { ...result[idx], ...changes }
  }

  // 3. Apply additions
  const maxId = result.reduce((max, t) => Math.max(max, t.id || 0), 0)
  let nextId = maxId + 1

  for (const addition of patch.additions) {
    const { insertAfterId, ...taskData } = addition
    const newTask = {
      id: nextId++,
      name: taskData.name || 'New Task',
      type: taskData.type || 'Task',
      indent: taskData.indent || 0,
      dur: taskData.dur ?? 1,
      start: taskData.start || null,
      pct: 0,
      parent: taskData.parent ?? null,
      depType: taskData.depType || 'FS',
      owner: taskData.owner || ''
    }

    if (insertAfterId) {
      const afterIdx = result.findIndex(t => t.id === insertAfterId)
      if (afterIdx !== -1) {
        result.splice(afterIdx + 1, 0, newTask)
      } else {
        result.push(newTask)
      }
    } else {
      result.push(newTask)
    }
  }

  return result
}

// ── Parse full task array (for create mode) ──────────────────────────

const parseTaskArray = (text) => {
  if (!text) return null

  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '')
  }

  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed) || parsed.length === 0) return null

    const valid = parsed.every(t =>
      typeof t.id === 'number' &&
      typeof t.name === 'string' &&
      t.name.length > 0
    )
    if (!valid) return null

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
      owner: t.owner || ''
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

// ── Main API: edit existing plan (patch mode) ────────────────────────

export const editPlan = async ({ tasks, userRequest, settings, onChunk, signal }) => {
  let fullText = ''

  const summary = buildTaskSummary(tasks)
  const userMessage = `CURRENT PLAN (${tasks.length} tasks):\n${summary}\n\nINSTRUCTION: ${userRequest.trim()}`

  const result = await generateAiContent({
    provider: settings.provider,
    apiKey: settings.apiKey,
    model: settings.model,
    systemPrompt: EDIT_PLAN_SYSTEM,
    userMessage,
    maxTokens: 4096,
    onChunk: onChunk ? (chunk, full) => {
      fullText = full
      onChunk(chunk, full)
    } : undefined,
    signal
  })

  if (!result.ok) return { ok: false, error: result.error }

  const text = result.text || fullText
  const patch = parsePatch(text)
  if (!patch) return { ok: false, error: 'AI returned invalid response. Please try again.', rawText: text }

  const updatedTasks = applyPatch(tasks, patch)

  return { ok: true, tasks: updatedTasks, patch, rawText: text }
}

// ── Describe changes from a patch ────────────────────────────────────

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
