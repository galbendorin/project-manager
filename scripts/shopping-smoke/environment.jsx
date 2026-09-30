import { createShoppingDraftOwner } from '../../src/utils/shoppingDraftOwner.js';
import { createSyntheticShoppingService } from './service.js';

// Fresh synthetic account on each page load: never open another owner's storage.
export const ownerId = `q11-synthetic-${crypto.randomUUID()}`;
export const service = createSyntheticShoppingService({ ownerId, projectId: crypto.randomUUID() });
const manager = createShoppingDraftOwner({ enabled: true, initialUserId: ownerId });
const shoppingDraftScope = manager.getScope();
const noop = async () => {};
export const useAuth = () => ({ user: { id: ownerId }, shoppingDraftScope });
export const usePlan = () => ({ canCreateProject: false, limits: {}, refreshProjectCount: noop });
export const supabase = { from: service.from, auth: {
  getSession: async () => ({ data: { session: { user: { id: ownerId } } }, error: null }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
} };
export const createShoppingSessionTransport = () => service;
export const notifyShoppingListSubscribers = noop;
export const useShoppingListLiveUpdates = () => ({ pushSupported: false, pushEnabled: false,
  pushPermission: 'default', pushBusy: false, pushMessage: '', liveUpdateMessage: '',
  handleEnablePushAlerts: noop, handleDisablePushAlerts: noop, handleTestPushAlert: noop });
