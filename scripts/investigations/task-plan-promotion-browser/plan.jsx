const noop = () => {};
export const usePlan = () => ({
  effectivePlan: 'pro', isPaid: true, isAdmin: false, isReadOnly: false, isTrialActive: false, simulatedPlan: null, simulatorOptions: [],
  isInTaskGrace: () => false, hasTabAccess: () => true, getTaskHardLimit: () => 1000,
  canUseAiReport: false, canUsePlatformAi: false, canUseAiAssistant: false, aiReportsRemaining: 0,
  canBaseline: true, canExport: true, canImport: true, refreshProfile: noop, setSimulatedPlan: noop,
  limits: { label: 'Synthetic Pro', maxTasksPerProject: 1000, maxProjects: 100, canUseAi: false, aiReportsPerMonth: 0 },
});
