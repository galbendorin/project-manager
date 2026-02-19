/**
 * Application constants and configurations
 */

// RAID Register schemas
export const SCHEMAS = {
  risks: {
    title: "Risk Log",
    cols: ["Visible", "Number", "Category", "Risk Details", "Mitigation Action", "Notes", "Raised", "Owner", "Level"]
  },
  issues: {
    title: "Issue Log",
    cols: ["Visible", "Number", "Issue Assigned to", "Description", "Current Status", "Status", "Raised", "Target", "Update", "Completed"]
  },
  actions: {
    title: "Action Log",
    cols: ["Visible", "Number", "Category", "Action Assigned to", "Description", "Current Status", "Status", "Raised", "Target", "Update", "Completed"]
  },
  minutes: {
    title: "Minutes Log",
    cols: ["Visible", "Number", "Date Raised", "Minute Description", "Status"]
  },
  costs: {
    title: "Cost Register",
    cols: ["Visible", "Number", "Cost Description", "Date Raised", "Site Name", "Cost", "To be charged to", "Accepted by", "Date", "Billing"]
  },
  changes: {
    title: "Change Control",
    cols: ["Visible", "Number", "Category", "Assigned to", "Description", "Impact/Status", "Status", "Raised", "Target", "Updated", "Complete"]
  },
  comms: {
    title: "Communication Plan",
    cols: ["Visible", "Company", "Name", "Position", "Mobile", "Phone", "Email"]
  }
};

// Tracker schema (not in SCHEMAS because TrackerView has its own layout)
export const TRACKER_COLS = [
  { key: 'taskName', label: 'Task Name', width: 220, editable: false },
  { key: 'notes', label: 'Notes', width: 200, editable: true },
  { key: 'status', label: 'Status', width: 120, editable: true, type: 'select', options: ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] },
  { key: 'rag', label: 'RAG', width: 70, editable: true, type: 'select', options: ['Green', 'Amber', 'Red'] },
  { key: 'nextAction', label: 'Next Action', width: 200, editable: true },
  { key: 'owner', label: 'Owner', width: 120, editable: true },
  { key: 'dateAdded', label: 'Date Added', width: 110, editable: false },
  { key: 'lastUpdated', label: 'Last Updated', width: 110, editable: false }
];

// SVG Icons
export const ICONS = {
  eyeOpen: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>`,
  
  eyeClosed: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>`,
  
  plus: `<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><path d="M12 4v16m8-8H4"/></svg>`,
  
  trash: `<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`
};

// Dependency types
export const DEP_TYPES = [
  { value: 'FS', label: 'Finish to Start' },
  { value: 'SS', label: 'Start to Start' },
  { value: 'FF', label: 'Finish to Finish' },
  { value: 'SF', label: 'Start to Finish' }
];

// Task types
export const TASK_TYPES = [
  { value: 'Task', label: 'Task Item' },
  { value: 'Milestone', label: 'Milestone' }
];

// View modes for Gantt chart
export const VIEW_MODES = [
  { value: 'week', label: 'Weekly View' },
  { value: '2week', label: 'Bi-Weekly' },
  { value: 'month', label: 'Monthly' }
];

// Default task template
export const DEFAULT_TASK = {
  id: null,
  name: "New Task",
  type: "Task",
  start: new Date().toISOString().split('T')[0],
  dur: 1,
  pct: 0,
  parent: null,
  depType: "FS",
  indent: 0,
  tracked: false
};

// Tab configurations
export const TABS = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'tracker', label: 'Master Tracker' },
  { id: 'risks', label: 'Risk Log' },
  { id: 'issues', label: 'Issue Log' },
  { id: 'actions', label: 'Action Log' },
  { id: 'minutes', label: 'Minutes' },
  { id: 'costs', label: 'Costs' },
  { id: 'changes', label: 'Changes' },
  { id: 'comms', label: 'Comms Plan' }
];
