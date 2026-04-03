import { getCurrentDate, getFinishDate, parseDateValue, toISODateString } from './helpers.js';

const CLOSED_STATUS_TOKENS = ['done', 'completed', 'closed', 'resolved', 'implemented', 'cancelled'];
const HIGH_RISK_TOKENS = ['high', 'critical', 'red'];

const normalizeStatus = (value = '') => String(value || '').trim().toLowerCase();

const isClosedStatus = (value = '') => {
  const normalized = normalizeStatus(value);
  return CLOSED_STATUS_TOKENS.some((token) => normalized.includes(token));
};

const normalizeDate = (value) => toISODateString(value);

const calendarDaysFromToday = (value, todayIso) => {
  const target = parseDateValue(value);
  const today = parseDateValue(todayIso);
  if (!target || !today) return null;
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetUtc - todayUtc) / 86400000);
};

const formatShortDate = (value) => {
  const date = parseDateValue(value);
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const countRecentUpdates = (items = [], todayIso) => (
  items.filter((item) => {
    const updatedAt = item?.updatedAt || item?.createdAt || item?.update || item?.lastUpdated || item?.dateAdded;
    const delta = calendarDaysFromToday(updatedAt, todayIso);
    return delta !== null && delta >= -7 && delta <= 0;
  }).length
);

export const buildProjectNowSummary = ({
  tasks = [],
  registers = {},
  tracker = [],
  statusReport = {},
  todos = [],
  today = getCurrentDate(),
} = {}) => {
  const openTasks = (tasks || []).filter((task) => Number(task?.pct || 0) < 100);
  const openActions = (registers?.actions || []).filter((item) => !isClosedStatus(item?.status || item?.currentstatus));
  const openIssues = (registers?.issues || []).filter((item) => !isClosedStatus(item?.status || item?.currentstatus));
  const highRisks = (registers?.risks || []).filter((item) => {
    const level = normalizeStatus(item?.level);
    return HIGH_RISK_TOKENS.some((token) => level.includes(token));
  });
  const trackerAttention = (tracker || []).filter((item) => {
    const rag = normalizeStatus(item?.rag);
    const status = normalizeStatus(item?.status);
    return (rag === 'red' || rag === 'amber') && !isClosedStatus(status);
  });
  const openTodos = (todos || []).filter((item) => !item?.isDerived && !isClosedStatus(item?.status));

  const upcomingCandidates = [
    ...openTasks
      .map((task) => ({
        source: 'Project Plan',
        title: task?.name || 'Task',
        dueDate: normalizeDate(getFinishDate(task?.start, task?.dur || 0)),
      }))
      .filter((item) => item.dueDate),
    ...openActions
      .map((item) => ({
        source: 'Action Log',
        title: item?.description || item?.currentstatus || 'Action',
        dueDate: normalizeDate(item?.target),
      }))
      .filter((item) => item.dueDate),
    ...openTodos
      .map((item) => ({
        source: 'Tasks',
        title: item?.title || 'Task',
        dueDate: normalizeDate(item?.dueDate),
      }))
      .filter((item) => item.dueDate),
  ].map((item) => ({
    ...item,
    deltaDays: calendarDaysFromToday(item.dueDate, today),
  })).filter((item) => item.deltaDays !== null);

  const dueSoonCount = upcomingCandidates.filter((item) => item.deltaDays >= 0 && item.deltaDays <= 7).length;
  const overdueCount = upcomingCandidates.filter((item) => item.deltaDays < 0).length;

  const nextItem = (() => {
    const futureItems = upcomingCandidates
      .filter((item) => item.deltaDays >= 0)
      .sort((a, b) => a.deltaDays - b.deltaDays);
    if (futureItems.length > 0) return futureItems[0];

    const overdueItems = upcomingCandidates
      .filter((item) => item.deltaDays < 0)
      .sort((a, b) => b.deltaDays - a.deltaDays);
    return overdueItems[0] || null;
  })();

  const recentUpdates = countRecentUpdates(tasks, today)
    + countRecentUpdates(openActions, today)
    + countRecentUpdates(openIssues, today)
    + countRecentUpdates(highRisks, today)
    + countRecentUpdates(tracker, today)
    + countRecentUpdates(openTodos, today);

  const rag = statusReport?.overallRag || 'Green';
  const attentionCount = trackerAttention.length + openIssues.length + highRisks.length;

  const summaryParts = [];
  if (attentionCount > 0) {
    summaryParts.push(`${attentionCount} need attention`);
  } else {
    summaryParts.push('No major blockers are showing');
  }

  if (overdueCount > 0) {
    summaryParts.push(`${overdueCount} overdue`);
  } else if (dueSoonCount > 0) {
    summaryParts.push(`${dueSoonCount} due this week`);
  }

  if (nextItem?.title) {
    summaryParts.push(`Next: ${nextItem.title}${nextItem.dueDate ? ` (${formatShortDate(nextItem.dueDate)})` : ''}`);
  }

  if (recentUpdates > 0) {
    summaryParts.push(`${recentUpdates} recent updates`);
  }

  const rawNarrative = `${statusReport?.overallNarrative || ''} ${statusReport?.additionalNotes || ''}`.trim();
  const narrative = rawNarrative.length > 180 ? `${rawNarrative.slice(0, 177)}...` : rawNarrative;

  return {
    rag,
    attentionCount,
    overdueCount,
    dueSoonCount,
    recentUpdates,
    nextItem,
    summaryLine: summaryParts.join(' · '),
    narrative,
  };
};
