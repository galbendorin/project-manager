import { parseDateValue, toISODateString } from './helpers.js';

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

const WEEKDAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const OWNER_END_PATTERNS = [
  { pattern: /\bfor\s+me\s*$/i, value: '__self__' },
  { pattern: /\bfor\s+(@[A-Za-z][A-Za-z0-9._-]*)\s*$/i },
  { pattern: /\b(?:owner|assigned to)\s*[:\-]\s*([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)?)\s*$/i },
  { pattern: /\bfor\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)?)\s*$/ },
];

const cleanCaptureText = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?])/g, '$1')
  .replace(/(?:^|[\s,.;:!?])[-,:;]+$/g, '')
  .trim();

const stripMatchFromText = (text, match) => {
  if (!match) return cleanCaptureText(text);
  return cleanCaptureText(`${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`);
};

const startOfDay = (value) => {
  const parsed = parseDateValue(value) || new Date();
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const addCalendarDays = (value, days) => {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
};

const resolveWeekdayDate = (weekdayName, referenceDate, { nextWeek = false, includeToday = true } = {}) => {
  const targetDay = WEEKDAY_INDEX[String(weekdayName || '').toLowerCase()];
  if (typeof targetDay !== 'number') return '';

  const base = nextWeek
    ? addCalendarDays(startOfDay(referenceDate), 7)
    : startOfDay(referenceDate);
  const currentDay = base.getDay();
  let delta = (targetDay - currentDay + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return toISODateString(addCalendarDays(base, delta));
};

const extractOwnerDetails = (text, selfOwnerName = '') => {
  for (const rule of OWNER_END_PATTERNS) {
    const match = rule.pattern.exec(text);
    if (!match) continue;

    const ownerValue = rule.value || match[1] || '';
    const normalizedOwner = ownerValue === '__self__'
      ? (String(selfOwnerName || '').trim() || 'Me')
      : String(ownerValue || '').replace(/^@/, '').trim();

    return {
      ownerText: normalizedOwner,
      text: stripMatchFromText(text, match),
    };
  }

  return {
    ownerText: '',
    text,
  };
};

const DUE_PATTERNS = [
  {
    pattern: /\bnext week\b/i,
    resolve: (_, referenceDate) => toISODateString(addCalendarDays(startOfDay(referenceDate), 7)),
  },
  {
    pattern: /\b(?:by|on)\s+today\b|\btoday\b/i,
    resolve: (_, referenceDate) => toISODateString(startOfDay(referenceDate)),
  },
  {
    pattern: /\b(?:by|on)\s+tomorrow\b|\btomorrow\b/i,
    resolve: (_, referenceDate) => toISODateString(addCalendarDays(startOfDay(referenceDate), 1)),
  },
  {
    pattern: /\b(?:by|on)\s+next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    resolve: (match, referenceDate) => resolveWeekdayDate(match[1], referenceDate, { nextWeek: true }),
  },
  {
    pattern: /\b(?:by|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    resolve: (match, referenceDate) => resolveWeekdayDate(match[1], referenceDate, { includeToday: true }),
  },
  {
    pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$/i,
    resolve: (match, referenceDate) => resolveWeekdayDate(match[1], referenceDate, { includeToday: true }),
  },
];

const extractDueDateDetails = (text, referenceDate) => {
  for (const rule of DUE_PATTERNS) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    return {
      dueDate: rule.resolve(match, referenceDate),
      text: stripMatchFromText(text, match),
    };
  }

  return {
    dueDate: '',
    text,
  };
};

export const getCaptureRouteMeta = (type = 'task') => ROUTE_META[type] || ROUTE_META.task;

export const suggestCaptureRoute = (value = '', fallback = 'task', options = {}) => {
  const text = String(value || '').trim();
  if (!text) {
    return {
      type: fallback,
      cleanedText: '',
      reason: '',
      viaPrefix: false,
      meta: getCaptureRouteMeta(fallback),
      dueDate: '',
      ownerText: '',
    };
  }

  const referenceDate = options.today || new Date();
  const selfOwnerName = options.selfOwnerName || '';
  const enrichCapture = (result) => {
    const ownerResult = extractOwnerDetails(result.cleanedText || text, selfOwnerName);
    const dueResult = extractDueDateDetails(ownerResult.text, referenceDate);
    const cleanedText = cleanCaptureText(dueResult.text) || result.cleanedText || text;

    return {
      ...result,
      cleanedText,
      dueDate: dueResult.dueDate || '',
      ownerText: ownerResult.ownerText || '',
    };
  };

  for (const rule of PREFIX_ROUTES) {
    if (rule.pattern.test(text)) {
      const cleanedText = text.replace(rule.pattern, '').trim();
      return enrichCapture({
        type: rule.type,
        cleanedText: cleanedText || text,
        reason: `Prefix routes this to ${getCaptureRouteMeta(rule.type).destination}.`,
        viaPrefix: true,
        meta: getCaptureRouteMeta(rule.type),
      });
    }
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      return enrichCapture({
        type: rule.type,
        cleanedText: text,
        reason: rule.reason,
        viaPrefix: false,
        meta: getCaptureRouteMeta(rule.type),
      });
    }
  }

  return enrichCapture({
    type: fallback,
    cleanedText: text,
    reason: fallback === 'task' ? 'Defaulting to Tasks for a general capture.' : '',
    viaPrefix: false,
    meta: getCaptureRouteMeta(fallback),
  });
};
