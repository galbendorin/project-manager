import { getCurrentDate, getFinishDate, parseDateValue, toISODateString } from './helpers.js';

const CLOSED_STATUS_TOKENS = ['done', 'completed', 'closed', 'resolved', 'implemented', 'cancelled'];
const BLOCKER_STATUS_TOKENS = ['blocked', 'blocker', 'on hold'];
const HIGH_RISK_TOKENS = ['high', 'critical', 'red'];

const normalizeText = (value = '') => String(value || '').trim();
const normalizeLower = (value = '') => normalizeText(value).toLowerCase();

const isClosedStatus = (value = '') => {
  const normalized = normalizeLower(value);
  return CLOSED_STATUS_TOKENS.some((token) => normalized.includes(token));
};

const isBlockerStatus = (value = '') => {
  const normalized = normalizeLower(value);
  return BLOCKER_STATUS_TOKENS.some((token) => normalized.includes(token));
};

const getItemStatus = (item = {}) => (
  item.status
  || item.currentstatus
  || item.currentStatus
  || item.rag
  || ''
);

const getOwner = (item = {}, fields = []) => fields
  .map((field) => normalizeText(item?.[field]))
  .find(Boolean) || '';

const calendarDaysFromToday = (value, todayIso) => {
  const target = parseDateValue(value);
  const today = parseDateValue(todayIso);
  if (!target || !today) return null;
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetUtc - todayUtc) / 86400000);
};

export const formatFocusDateLabel = (deltaDays) => {
  if (deltaDays === null) return 'No date';
  if (deltaDays < -1) return `${Math.abs(deltaDays)} days late`;
  if (deltaDays === -1) return '1 day late';
  if (deltaDays === 0) return 'Today';
  if (deltaDays === 1) return 'Tomorrow';
  return `In ${deltaDays} days`;
};

const normalizeDueDate = (value) => toISODateString(value);

const buildFocusItem = ({
  id,
  source,
  title,
  owner,
  dueDate,
  priority = 0,
  today,
}) => {
  const normalizedDueDate = normalizeDueDate(dueDate);
  const deltaDays = normalizedDueDate ? calendarDaysFromToday(normalizedDueDate, today) : null;
  return {
    id,
    source,
    title: normalizeText(title) || 'Untitled item',
    owner: normalizeText(owner),
    dueDate: normalizedDueDate,
    deltaDays,
    dateLabel: formatFocusDateLabel(deltaDays),
    priority,
  };
};

const sortFocusItems = (a, b) => {
  const aHasDate = a.deltaDays !== null;
  const bHasDate = b.deltaDays !== null;
  const aOverdue = aHasDate && a.deltaDays < 0;
  const bOverdue = bHasDate && b.deltaDays < 0;

  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
  if (aHasDate && bHasDate && a.deltaDays !== b.deltaDays) return a.deltaDays - b.deltaDays;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.title.localeCompare(b.title);
};

const hasStatusNote = (statusReport = {}) => [
  statusReport.overallStatus,
  statusReport.overallNarrative,
  statusReport.additionalNotes,
  statusReport.summary,
].some((value) => normalizeText(value).length >= 8);

export const buildProjectReadiness = ({
  tasks = [],
  registers = {},
  tracker = [],
  statusReport = {},
  todos = [],
  today = getCurrentDate(),
} = {}) => {
  const openTasks = (tasks || []).filter((task) => Number(task?.pct || 0) < 100);
  const openActions = (registers?.actions || []).filter((item) => !isClosedStatus(getItemStatus(item)));
  const openIssues = (registers?.issues || []).filter((item) => !isClosedStatus(getItemStatus(item)));
  const openTodos = (todos || []).filter((item) => !item?.isDerived && !isClosedStatus(getItemStatus(item)));
  const activeTracker = (tracker || []).filter((item) => !isClosedStatus(getItemStatus(item)));
  const highRisks = (registers?.risks || []).filter((item) => {
    const level = normalizeLower(item?.level || item?.rag || item?.impact || item?.status);
    return HIGH_RISK_TOKENS.some((token) => level.includes(token)) && !isClosedStatus(getItemStatus(item));
  });

  const focusItems = [
    ...openTasks.map((task) => buildFocusItem({
      id: `task:${task.id}`,
      source: 'Plan',
      title: task?.name,
      owner: task?.owner,
      dueDate: task?.finish || getFinishDate(task?.start, task?.dur || 0),
      priority: normalizeLower(task?.rag) === 'red' ? 3 : normalizeLower(task?.rag) === 'amber' ? 2 : 0,
      today,
    })),
    ...openActions.map((item, index) => buildFocusItem({
      id: `action:${item?._id || index}`,
      source: 'Action',
      title: item?.description || item?.currentstatus,
      owner: getOwner(item, ['actionassignedto', 'assignedto', 'owner']),
      dueDate: item?.target || item?.dueDate,
      priority: 1,
      today,
    })),
    ...openIssues.map((item, index) => buildFocusItem({
      id: `issue:${item?._id || index}`,
      source: 'Issue',
      title: item?.description || item?.currentstatus,
      owner: getOwner(item, ['issueassignedto', 'assignedto', 'owner']),
      dueDate: item?.target || item?.dueDate,
      priority: 3,
      today,
    })),
    ...openTodos.map((item, index) => buildFocusItem({
      id: `todo:${item?._id || item?.id || index}`,
      source: 'Task',
      title: item?.title,
      owner: getOwner(item, ['owner', 'assignedTo', 'assignedto']),
      dueDate: item?.dueDate,
      priority: 1,
      today,
    })),
  ].sort(sortFocusItems);

  const openWork = [...openTasks, ...openActions, ...openIssues, ...openTodos];
  const missingOwnerCount = [
    ...openTasks.filter((task) => !normalizeText(task?.owner)),
    ...openActions.filter((item) => !getOwner(item, ['actionassignedto', 'assignedto', 'owner'])),
    ...openIssues.filter((item) => !getOwner(item, ['issueassignedto', 'assignedto', 'owner'])),
  ].length;
  const missingDateCount = [
    ...openTasks.filter((task) => !normalizeDueDate(task?.finish || getFinishDate(task?.start, task?.dur || 0))),
    ...openActions.filter((item) => !normalizeDueDate(item?.target || item?.dueDate)),
    ...openTodos.filter((item) => !normalizeDueDate(item?.dueDate)),
  ].length;
  const blockers = [
    ...openIssues.filter((item) => isBlockerStatus(getItemStatus(item))),
    ...activeTracker.filter((item) => normalizeLower(item?.rag) === 'red' || isBlockerStatus(getItemStatus(item))),
    ...highRisks,
  ];

  const checks = [
    {
      key: 'next',
      status: focusItems.length > 0 ? 'pass' : 'warn',
      label: focusItems.length > 0 ? 'Next work is visible' : 'Add one next step',
      detail: focusItems.length > 0 ? `${Math.min(focusItems.length, 3)} item${Math.min(focusItems.length, 3) === 1 ? '' : 's'} ready to pick from` : 'Add a dated task or action so the next move is clear.',
    },
    {
      key: 'owners',
      status: missingOwnerCount === 0 ? 'pass' : 'warn',
      label: missingOwnerCount === 0 ? 'Owners look clear' : `${missingOwnerCount} item${missingOwnerCount === 1 ? '' : 's'} need owner`,
      detail: missingOwnerCount === 0 ? 'Open tasks and actions have someone accountable.' : 'Assign owners before sharing the plan.',
    },
    {
      key: 'dates',
      status: missingDateCount === 0 ? 'pass' : 'warn',
      label: missingDateCount === 0 ? 'Dates look clear' : `${missingDateCount} item${missingDateCount === 1 ? '' : 's'} need date`,
      detail: missingDateCount === 0 ? 'Open work has timing attached.' : 'Add dates so the mobile focus list stays useful.',
    },
    {
      key: 'blockers',
      status: blockers.length === 0 ? 'pass' : 'warn',
      label: blockers.length === 0 ? 'No blockers flagged' : `${blockers.length} blocker${blockers.length === 1 ? '' : 's'} to review`,
      detail: blockers.length === 0 ? 'Nothing critical is marked as blocked right now.' : 'Check issues, red tracker items, and high risks.',
    },
    {
      key: 'status',
      status: hasStatusNote(statusReport) || openWork.length === 0 ? 'pass' : 'warn',
      label: hasStatusNote(statusReport) || openWork.length === 0 ? 'Status note present' : 'Add a short status note',
      detail: hasStatusNote(statusReport) || openWork.length === 0 ? 'The project has summary context for users.' : 'One short sentence helps others understand the project.',
    },
  ];

  const passedChecks = checks.filter((check) => check.status === 'pass').length;

  return {
    focusItems: focusItems.slice(0, 3),
    allFocusItemCount: focusItems.length,
    checks,
    passedChecks,
    totalChecks: checks.length,
    scoreLabel: `${passedChecks}/${checks.length}`,
    isReady: passedChecks === checks.length,
  };
};
