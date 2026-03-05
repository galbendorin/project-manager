import { DEFAULT_STATUS_REPORT } from '../../utils/constants.js';

export const createEmptyRegisters = () => ({
  risks: [],
  issues: [],
  actions: [],
  minutes: [],
  costs: [],
  changes: [],
  stakeholders: [],
  commsplan: [],
  assumptions: [],
  decisions: [],
  lessons: [],
  _raci: []
});

export const createEmptyStatusReport = () => ({ ...DEFAULT_STATUS_REPORT });

export const createEmptyProjectSnapshot = () => ({
  tasks: [],
  registers: createEmptyRegisters(),
  tracker: [],
  status_report: createEmptyStatusReport(),
  baseline: null
});
