const PREFIX_ROUTES = [
  { type: 'risk', pattern: /^\s*risk\s*[:\-]\s*/i },
  { type: 'issue', pattern: /^\s*issue\s*[:\-]\s*/i },
  { type: 'decision', pattern: /^\s*decision\s*[:\-]\s*/i },
  { type: 'meeting', pattern: /^\s*(meeting|minutes?|note)\s*[:\-]\s*/i },
  { type: 'action', pattern: /^\s*action\s*[:\-]\s*/i },
  { type: 'task', pattern: /^\s*(task|todo)\s*[:\-]\s*/i },
];

const ROUTE_META = {
  task: { label: 'Task', destination: 'Tasks' },
  action: { label: 'Action', destination: 'Action Log' },
  risk: { label: 'Risk', destination: 'Risk Log' },
  issue: { label: 'Issue', destination: 'Issue Log' },
  decision: { label: 'Decision', destination: 'Decision Log' },
  meeting: { label: 'Meeting note', destination: 'Meeting Log' },
};

const KEYWORD_RULES = [
  {
    type: 'decision',
    pattern: /\b(decision|decided|approved|agreed)\b/i,
    reason: 'Looks like a decision or approval note.',
  },
  {
    type: 'meeting',
    pattern: /\b(meeting|minutes|note from|discussed|call with)\b/i,
    reason: 'Looks like meeting context.',
  },
  {
    type: 'risk',
    pattern: /\b(risk|blocker|dependency|delay|slip|concern|at risk)\b/i,
    reason: 'Looks like a delivery risk or blocker.',
  },
  {
    type: 'issue',
    pattern: /\b(issue|problem|broken|failed|blocked|incident)\b/i,
    reason: 'Looks like an issue to track.',
  },
  {
    type: 'action',
    pattern: /\b(follow up|follow-up|chase|send|confirm|call|ask)\b/i,
    reason: 'Looks like something that needs doing.',
  },
];

export const getCaptureRouteMeta = (type = 'task') => ROUTE_META[type] || ROUTE_META.task;

export const suggestCaptureRoute = (value = '', fallback = 'task') => {
  const text = String(value || '').trim();
  if (!text) {
    return {
      type: fallback,
      cleanedText: '',
      reason: '',
      viaPrefix: false,
      meta: getCaptureRouteMeta(fallback),
    };
  }

  for (const rule of PREFIX_ROUTES) {
    if (rule.pattern.test(text)) {
      const cleanedText = text.replace(rule.pattern, '').trim();
      return {
        type: rule.type,
        cleanedText: cleanedText || text,
        reason: `Prefix routes this to ${getCaptureRouteMeta(rule.type).destination}.`,
        viaPrefix: true,
        meta: getCaptureRouteMeta(rule.type),
      };
    }
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      return {
        type: rule.type,
        cleanedText: text,
        reason: rule.reason,
        viaPrefix: false,
        meta: getCaptureRouteMeta(rule.type),
      };
    }
  }

  return {
    type: fallback,
    cleanedText: text,
    reason: fallback === 'task' ? 'Defaulting to Tasks for a general capture.' : '',
    viaPrefix: false,
    meta: getCaptureRouteMeta(fallback),
  };
};
