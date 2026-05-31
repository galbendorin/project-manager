export const FEATURE_ACCESS = {
  public: 'public',
  authenticated: 'authenticated',
  household: 'household',
  admin: 'admin',
};

export const APP_FEATURES = [
  {
    id: 'projects',
    label: 'Projects',
    route: '/',
    access: FEATURE_ACCESS.authenticated,
    surface: 'workspace',
    homeTitle: 'Project workspace',
  },
  {
    id: 'timesheets',
    label: 'Timesheets',
    route: '/track',
    access: FEATURE_ACCESS.authenticated,
    surface: 'workspace',
    homeTitle: 'Log hours',
  },
  {
    id: 'meal-planner',
    label: 'Meal Planner',
    route: '/meals',
    access: FEATURE_ACCESS.household,
    surface: 'household',
    homeTitle: 'Plan meals',
  },
  {
    id: 'shopping-list',
    label: 'Shopping List',
    route: '/shopping',
    access: FEATURE_ACCESS.household,
    surface: 'household',
    homeTitle: 'Share groceries',
  },
  {
    id: 'baby',
    label: 'Baby',
    route: '/baby',
    access: FEATURE_ACCESS.household,
    surface: 'household',
    homeTitle: 'Track care',
  },
  {
    id: 'habits',
    label: 'Habits',
    route: '/habits',
    access: FEATURE_ACCESS.household,
    surface: 'household',
    homeTitle: 'Track habits',
  },
  {
    id: 'weight',
    label: 'Weight',
    route: '/weight',
    access: FEATURE_ACCESS.household,
    surface: 'household',
    homeTitle: 'Track weight',
  },
];

export const PROJECT_HOME_LAUNCH_FEATURE_IDS = [
  'meal-planner',
  'shopping-list',
  'baby',
  'habits',
  'weight',
  'timesheets',
];

export const normalizeFeatureRoute = (path = '/') => (
  String(path || '/').replace(/\/+$/, '') || '/'
);

export const getFeatureById = (featureId = '') => (
  APP_FEATURES.find((feature) => feature.id === featureId) || null
);

export const getFeatureByRoute = (path = '') => {
  const normalized = normalizeFeatureRoute(path);
  return APP_FEATURES.find((feature) => feature.route === normalized) || null;
};

export const getFeaturesByAccess = (access) => (
  APP_FEATURES.filter((feature) => feature.access === access)
);

export const HOUSEHOLD_TOOL_FEATURES = getFeaturesByAccess(FEATURE_ACCESS.household);

export const HOUSEHOLD_TOOL_PATHS = new Set(
  HOUSEHOLD_TOOL_FEATURES.map((feature) => feature.route)
);

export const isHouseholdFeaturePath = (path = '') => (
  HOUSEHOLD_TOOL_PATHS.has(normalizeFeatureRoute(path))
);

export const getProjectHomeLaunchFeatures = ({ includeHouseholdTools = false } = {}) => (
  PROJECT_HOME_LAUNCH_FEATURE_IDS
    .map(getFeatureById)
    .filter(Boolean)
    .filter((feature) => (
      feature.access !== FEATURE_ACCESS.household || includeHouseholdTools
    ))
);

const getEnvValue = (env = {}, key) => (
  typeof env?.[key] === 'string' ? env[key].trim() : ''
);

const createHealthCheck = ({ id, label, status, detail = '' }) => ({
  id,
  label,
  status,
  detail,
});

export const buildAdminHealthSnapshot = ({
  env = {},
  effectivePlan = 'starter',
  hasSharedHouseholdProjectAccess = false,
  householdToolsEnabled = false,
  isAdmin = false,
  isOnline = true,
  limits = {},
  profile = null,
  projectCount = 0,
  canUsePlatformAi = false,
} = {}) => {
  const supabaseUrlConfigured = Boolean(getEnvValue(env, 'VITE_SUPABASE_URL'));
  const supabaseAnonKeyConfigured = Boolean(getEnvValue(env, 'VITE_SUPABASE_ANON_KEY'));
  const privateTools = HOUSEHOLD_TOOL_FEATURES.map((feature) => feature.label);
  const maxProjects = limits?.maxProjects === 999 ? 'unlimited' : String(limits?.maxProjects ?? 0);

  const checks = [
    createHealthCheck({
      id: 'admin-access',
      label: 'Admin access',
      status: isAdmin ? 'ok' : 'blocked',
      detail: isAdmin ? 'Admin-only diagnostics visible' : 'Hidden from non-admin accounts',
    }),
    createHealthCheck({
      id: 'supabase-client-env',
      label: 'Supabase client',
      status: supabaseUrlConfigured && supabaseAnonKeyConfigured ? 'ok' : 'blocked',
      detail: supabaseUrlConfigured && supabaseAnonKeyConfigured
        ? 'URL and anon key are configured'
        : 'Missing Vite Supabase client env',
    }),
    createHealthCheck({
      id: 'profile',
      label: 'Profile',
      status: profile?.id ? 'ok' : 'watch',
      detail: profile?.id ? `Plan ${effectivePlan}` : 'Waiting for profile data',
    }),
    createHealthCheck({
      id: 'household-tools',
      label: 'Household tools',
      status: householdToolsEnabled ? 'ok' : 'watch',
      detail: householdToolsEnabled
        ? `${privateTools.length} private tools gated`
        : 'Private tools hidden for this account',
    }),
    createHealthCheck({
      id: 'shopping-project',
      label: 'Shopping project',
      status: hasSharedHouseholdProjectAccess ? 'ok' : 'watch',
      detail: hasSharedHouseholdProjectAccess
        ? 'Shared household project visible'
        : 'No shared household project detected',
    }),
    createHealthCheck({
      id: 'project-limit',
      label: 'Project limit',
      status: limits?.maxProjects === 999 || projectCount <= (limits?.maxProjects ?? 0) ? 'ok' : 'watch',
      detail: `${projectCount} of ${maxProjects} owned projects`,
    }),
    createHealthCheck({
      id: 'platform-ai',
      label: 'Platform AI',
      status: canUsePlatformAi ? 'ok' : 'watch',
      detail: canUsePlatformAi ? 'Available when manually triggered' : 'Disabled or plan-gated',
    }),
    createHealthCheck({
      id: 'network',
      label: 'Network',
      status: isOnline ? 'ok' : 'watch',
      detail: isOnline ? 'Browser is online' : 'Browser is offline',
    }),
  ];

  const hasBlocked = checks.some((check) => check.status === 'blocked');
  const hasWatch = checks.some((check) => check.status === 'watch');

  return {
    status: hasBlocked ? 'blocked' : hasWatch ? 'watch' : 'ok',
    checks,
    privateTools,
  };
};
