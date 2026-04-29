import { TABS } from './constants.js';

const PROJECT_TAB_MEMORY_KEY = 'pmworkspace.projectLastTabs.v1';
const DEFAULT_PROJECT_TAB = 'schedule';
const VALID_PROJECT_TABS = new Set(TABS.map((tab) => tab.id));

const canUseStorage = (storage) => (
  storage
  && typeof storage.getItem === 'function'
  && typeof storage.setItem === 'function'
);

const readTabMemory = (storage) => {
  if (!canUseStorage(storage)) return {};

  try {
    const parsed = JSON.parse(storage.getItem(PROJECT_TAB_MEMORY_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeProjectTab = (tabId) => {
  const normalized = String(tabId || '').trim();
  return VALID_PROJECT_TABS.has(normalized) ? normalized : DEFAULT_PROJECT_TAB;
};

const normalizeProjectId = (projectId) => String(projectId || '').trim();

export const getStoredProjectTab = (projectId, storage = globalThis.localStorage) => {
  const safeProjectId = normalizeProjectId(projectId);
  if (!safeProjectId) return DEFAULT_PROJECT_TAB;

  const memory = readTabMemory(storage);
  return normalizeProjectTab(memory[safeProjectId]);
};

export const saveStoredProjectTab = (projectId, tabId, storage = globalThis.localStorage) => {
  const safeProjectId = normalizeProjectId(projectId);
  if (!safeProjectId || !canUseStorage(storage)) return false;

  try {
    const memory = readTabMemory(storage);
    memory[safeProjectId] = normalizeProjectTab(tabId);
    storage.setItem(PROJECT_TAB_MEMORY_KEY, JSON.stringify(memory));
    return true;
  } catch {
    return false;
  }
};

export const projectTabMemoryKey = PROJECT_TAB_MEMORY_KEY;
export const defaultProjectTab = DEFAULT_PROJECT_TAB;
