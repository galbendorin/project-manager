export const TASK_CHECKLIST_POSITION_STEP = 1024;

export const buildTaskChecklistScopeKey = (projectId, cardKey) => (
  `${projectId || 'personal'}::${cardKey || ''}`
);

export const parseChecklistItemLines = (value) => (
  String(value || '')
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/^\s*\[[ xX]\]\s+/, '')
      .trim())
    .filter(Boolean)
);

const numericPosition = (item) => (
  Number.isFinite(Number(item?.position)) ? Number(item.position) : 0
);

export const sortTaskChecklists = (checklists = []) => (
  [...checklists].sort((left, right) => {
    const leftPos = numericPosition(left);
    const rightPos = numericPosition(right);
    if (leftPos !== rightPos) return leftPos - rightPos;
    return String(left.title || '').localeCompare(String(right.title || ''));
  })
);

export const sortTaskChecklistItems = (items = []) => (
  [...items].sort((left, right) => {
    const leftPos = numericPosition(left);
    const rightPos = numericPosition(right);
    if (leftPos !== rightPos) return leftPos - rightPos;
    return String(left.createdAt || left.created_at || '').localeCompare(String(right.createdAt || right.created_at || ''));
  })
);

export const calculateTaskChecklistPosition = (items = [], targetIndex = items.length) => {
  const ordered = sortTaskChecklistItems(items);
  const previous = targetIndex > 0 ? ordered[targetIndex - 1] : null;
  const next = targetIndex < ordered.length ? ordered[targetIndex] : null;
  const previousPos = previous ? numericPosition(previous) : null;
  const nextPos = next ? numericPosition(next) : null;

  if (previousPos === null && nextPos === null) return TASK_CHECKLIST_POSITION_STEP;
  if (previousPos === null) return nextPos - TASK_CHECKLIST_POSITION_STEP;
  if (nextPos === null) return previousPos + TASK_CHECKLIST_POSITION_STEP;
  return previousPos + ((nextPos - previousPos) / 2);
};

export const summarizeTaskChecklists = (checklists = []) => {
  const totals = (checklists || []).reduce((acc, checklist) => {
    const items = Array.isArray(checklist?.items) ? checklist.items : [];
    items.forEach((item) => {
      acc.total += 1;
      if (item?.checked) acc.completed += 1;
    });
    return acc;
  }, { completed: 0, total: 0 });

  return {
    ...totals,
    percent: totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0,
    isComplete: totals.total > 0 && totals.completed === totals.total,
  };
};
