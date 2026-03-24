const MODULE_HEADER_LABELS = {
  schedule: 'Tasks',
  todo: 'Tasks',
  risks: 'Risks',
  issues: 'Issues',
  actions: 'Actions',
  minutes: 'Meetings',
  tracker: 'Tracked Items',
  timesheets: 'Entries',
  stakeholders: 'Stakeholders',
  commsplan: 'Communications',
  costs: 'Costs',
  changes: 'Changes',
  assumptions: 'Dependencies',
  decisions: 'Decisions',
  lessons: 'Lessons',
  raci: 'Roles'
};

export const getModuleHeaderLabel = (moduleType) => MODULE_HEADER_LABELS[moduleType] || '';

export const getModuleHeaderCountText = (moduleType, count) => {
  const label = getModuleHeaderLabel(moduleType);
  if (!label || count == null) return '';
  return `${label}: ${count}`;
};
