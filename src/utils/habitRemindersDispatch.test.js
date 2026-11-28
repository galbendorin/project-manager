import test from 'node:test';
import assert from 'node:assert/strict';

import * as dispatchModule from '../../api/habit-reminders-dispatch.js';

const { createHabitRemindersDispatcher } = dispatchModule;

const createDispatcherSupabaseStub = ({
  reminders = [],
  subscriptions = [],
  habits = [],
  claimRaceIds = new Set(),
} = {}) => {
  const claimUpdates = [];

  const buildFilterExecutor = (table, action = 'select', payload = null) => {
    const filters = [];
    let orderCol = null;
    let ascending = true;
    let rangeBounds = null;
    const chain = {
      select() {
        if (action === 'update') {
          const idFilter = filters.find((f) => f.col === 'id')?.val;
          if (claimRaceIds.has(idFilter)) {
            return Promise.resolve({ data: [], error: null });
          }
          const matchedReminder = reminders.find((r) => r.id === idFilter);
          const expectedLastFilter = filters.find((f) => f.col === 'last_triggered_date');
          if (!matchedReminder) {
            return Promise.resolve({ data: [], error: null });
          }
          if (expectedLastFilter) {
            const currentVal = matchedReminder.last_triggered_date || null;
            if (currentVal !== expectedLastFilter.val) {
              return Promise.resolve({ data: [], error: null });
            }
          }
          matchedReminder.last_triggered_date = payload.last_triggered_date;
          claimUpdates.push({ id: idFilter, phase: 'claim', value: payload.last_triggered_date });
          return Promise.resolve({ data: [{ id: idFilter }], error: null });
        }
        return chain;
      },
      eq(col, val) {
        filters.push({ op: 'eq', col, val });
        return chain;
      },
      is(col, val) {
        filters.push({ op: 'is', col, val });
        return chain;
      },
      in(col, val) {
        filters.push({ op: 'in', col, val });
        return chain;
      },
      order(col, opts = {}) {
        orderCol = col;
        ascending = opts.ascending !== false;
        return chain;
      },
      range(from, to) {
        rangeBounds = { from, to };
        return chain;
      },
      then(resolve, reject) {
        if (action === 'update') {
          const idFilter = filters.find((f) => f.col === 'id')?.val;
          const expectedFilter = filters.find((f) => f.col === 'last_triggered_date')?.val;
          const matchedReminder = reminders.find((r) => r.id === idFilter);
          if (matchedReminder && matchedReminder.last_triggered_date === expectedFilter) {
            matchedReminder.last_triggered_date = payload.last_triggered_date;
            claimUpdates.push({ id: idFilter, phase: 'rollback', value: payload.last_triggered_date });
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }

        let rows = [];
        if (table === 'habit_reminders') rows = [...reminders];
        if (table === 'push_subscriptions') rows = [...subscriptions];
        if (table === 'habit_items') rows = [...habits];

        for (const filter of filters) {
          if (filter.op === 'eq') rows = rows.filter((row) => row[filter.col] === filter.val);
          if (filter.op === 'is') rows = rows.filter((row) => row[filter.col] === filter.val);
          if (filter.op === 'in') rows = rows.filter((row) => filter.val.includes(row[filter.col]));
        }
        if (orderCol) {
          rows.sort((left, right) => {
            const cmp = String(left[orderCol] ?? '').localeCompare(String(right[orderCol] ?? ''));
            return ascending ? cmp : -cmp;
          });
        }
        if (rangeBounds) {
          rows = rows.slice(rangeBounds.from, rangeBounds.to + 1);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    };
    return chain;
  };

  return {
    claimUpdates,
    from(table) {
      return {
        select() {
          return buildFilterExecutor(table, 'select');
        },
        update(payload) {
          return buildFilterExecutor(table, 'update', payload);
        },
      };
    },
  };
};

test('createHabitRemindersDispatcher skips when Web Push is not configured', async () => {
  const dispatch = createHabitRemindersDispatcher({
    supabase: null,
    isPushConfigured: () => false,
  });

  const result = await dispatch();
  assert.equal(result.ok, false);
  assert.equal(result.skipped, 'push_not_configured');
});

test('createHabitRemindersDispatcher claims due reminders, delivers Web Push, and avoids unsubscribed claims', async () => {
  const reminders = [
    {
      id: 'rem-due',
      user_id: 'user-1',
      habit_id: 'hab-1',
      title: 'Evening check-in',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: null,
    },
    {
      id: 'rem-no-sub',
      user_id: 'user-2',
      habit_id: null,
      title: 'No push user',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: null,
    },
    {
      id: 'rem-archived',
      user_id: 'user-1',
      habit_id: 'hab-archived',
      title: 'Archived habit',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: null,
    },
  ];
  const subscriptions = [
    {
      user_id: 'user-1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-1',
      is_active: true,
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/device-1' },
    },
  ];
  const habits = [
    { id: 'hab-1', user_id: 'user-1', name: 'Read 20 pages', archived_at: null },
    { id: 'hab-archived', user_id: 'user-1', name: 'Old habit', archived_at: '2026-10-01T00:00:00Z' },
  ];

  const supabase = createDispatcherSupabaseStub({ reminders, subscriptions, habits });
  const sentPayloads = [];

  const dispatch = createHabitRemindersDispatcher({
    supabase,
    now: () => new Date('2026-11-28T21:10:00Z'),
    isPushConfigured: () => true,
    sendPush: async ({ subscription, payload }) => {
      sentPayloads.push({ endpoint: subscription.endpoint, payload });
    },
    deactivatePush: async () => {},
  });

  const firstRun = await dispatch();
  assert.equal(firstRun.ok, true);
  assert.equal(firstRun.dueCount, 3);
  assert.equal(firstRun.claimed, 1);
  assert.equal(firstRun.sent, 1);
  assert.equal(firstRun.skippedNoSubscription, 1);
  assert.equal(firstRun.skippedArchived, 1);
  assert.equal(sentPayloads.length, 1);
  assert.equal(sentPayloads[0].payload.data.kind, 'habit-reminder');
  assert.equal(sentPayloads[0].payload.data.url, '/habits');
  assert.match(sentPayloads[0].payload.body, /Read 20 pages/);
  assert.equal(reminders[0].last_triggered_date, '2026-11-28');
  assert.equal(reminders[1].last_triggered_date, null);

  // Subsequent run in the same 60-minute window must not re-fire the claimed reminder.
  const secondRun = await dispatch();
  assert.equal(secondRun.claimed, 0);
  assert.equal(secondRun.sent, 0);
  assert.equal(sentPayloads.length, 1);
});

test('createHabitRemindersDispatcher deactivates 410 subscriptions and rolls back claim when zero deliveries succeed', async () => {
  const reminders = [
    {
      id: 'rem-1',
      user_id: 'user-1',
      habit_id: null,
      title: 'Journal',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: null,
    },
  ];
  const subscriptions = [
    {
      user_id: 'user-1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/expired',
      is_active: true,
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/expired' },
    },
  ];

  const deactivated = [];
  const supabase = createDispatcherSupabaseStub({ reminders, subscriptions });
  const dispatch = createHabitRemindersDispatcher({
    supabase,
    now: () => new Date('2026-11-28T21:05:00Z'),
    isPushConfigured: () => true,
    sendPush: async () => {
      const error = new Error('Gone');
      error.statusCode = 410;
      throw error;
    },
    deactivatePush: async (endpoint) => {
      deactivated.push(endpoint);
    },
  });

  const result = await dispatch();
  assert.equal(result.claimed, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.deactivated, 1);
  assert.deepEqual(deactivated, ['https://fcm.googleapis.com/fcm/send/expired']);
  assert.equal(reminders[0].last_triggered_date, null);
});

test('createHabitRemindersDispatcher retains claim when at least one device receives push and ignores claim races', async () => {
  const reminders = [
    {
      id: 'rem-partial',
      user_id: 'user-1',
      habit_id: null,
      title: 'Evening check-in',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: '2026-11-27',
    },
    {
      id: 'rem-race',
      user_id: 'user-1',
      habit_id: null,
      title: 'Race check',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: null,
    },
  ];
  const subscriptions = [
    {
      user_id: 'user-1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/good',
      is_active: true,
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/good' },
    },
    {
      user_id: 'user-1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/dead',
      is_active: true,
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/dead' },
    },
  ];

  const deactivated = [];
  const supabase = createDispatcherSupabaseStub({
    reminders,
    subscriptions,
    claimRaceIds: new Set(['rem-race']),
  });

  const dispatch = createHabitRemindersDispatcher({
    supabase,
    now: () => new Date('2026-11-28T21:15:00Z'),
    isPushConfigured: () => true,
    sendPush: async ({ subscription }) => {
      if (subscription.endpoint.endsWith('/dead')) {
        const err = new Error('Not found');
        err.statusCode = 404;
        throw err;
      }
    },
    deactivatePush: async (endpoint) => {
      deactivated.push(endpoint);
    },
  });

  const result = await dispatch();
  assert.equal(result.claimed, 1);
  assert.equal(result.skippedRace, 1);
  assert.equal(result.sent, 1);
  assert.equal(result.deactivated, 1);
  assert.equal(reminders[0].last_triggered_date, '2026-11-28');
  assert.deepEqual(deactivated, ['https://fcm.googleapis.com/fcm/send/dead']);
});

test('habit-reminders-dispatch exposes POST schedule handler without a default export', async () => {
  assert.equal(typeof dispatchModule.POST, 'function');
  assert.equal('default' in dispatchModule, false);

  const missingHeadersRes = await dispatchModule.POST(
    new Request('https://example.test/api/habit-reminders-dispatch', { method: 'POST' }),
  );
  assert.equal(missingHeadersRes.status, 400);
});

test('createHabitRemindersDispatcher paginates reminders and chunks subscription and habit lookups', async () => {
  const reminders = [
    {
      id: 'rem-1',
      user_id: 'user-1',
      habit_id: 'hab-1',
      title: 'Already sent',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: '2026-11-28',
    },
    {
      id: 'rem-2',
      user_id: 'user-1',
      habit_id: 'hab-2',
      title: 'Page 1 due',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: null,
    },
    {
      id: 'rem-3',
      user_id: 'user-2',
      habit_id: 'hab-3',
      title: 'Page 2 due',
      reminder_time: '21:00:00',
      frequency: 'daily',
      weekdays: [],
      timezone: 'Europe/London',
      is_enabled: true,
      last_triggered_date: null,
    },
  ];
  const subscriptions = [
    {
      id: 'sub-1',
      user_id: 'user-1',
      endpoint: 'https://fcm.googleapis.com/fcm/send/u1',
      is_active: true,
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/u1' },
    },
    {
      id: 'sub-2',
      user_id: 'user-2',
      endpoint: 'https://fcm.googleapis.com/fcm/send/u2',
      is_active: true,
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/u2' },
    },
  ];
  const habits = [
    { id: 'hab-1', user_id: 'user-1', name: 'Habit 1', archived_at: null },
    { id: 'hab-2', user_id: 'user-1', name: 'Habit 2', archived_at: null },
    { id: 'hab-3', user_id: 'user-2', name: 'Habit 3', archived_at: null },
  ];

  const supabase = createDispatcherSupabaseStub({ reminders, subscriptions, habits });
  const sentPayloads = [];
  const dispatch = createHabitRemindersDispatcher({
    supabase,
    now: () => new Date('2026-11-28T21:10:00Z'),
    pageSize: 2,
    idChunkSize: 1,
    isPushConfigured: () => true,
    sendPush: async ({ subscription, payload }) => {
      sentPayloads.push({ endpoint: subscription.endpoint, title: payload.title });
    },
    deactivatePush: async () => {},
  });

  const result = await dispatch();
  assert.equal(result.remindersChecked, 3);
  assert.equal(result.dueCount, 2);
  assert.equal(result.claimed, 2);
  assert.equal(result.sent, 2);
  assert.deepEqual(sentPayloads, [
    { endpoint: 'https://fcm.googleapis.com/fcm/send/u1', title: 'Page 1 due' },
    { endpoint: 'https://fcm.googleapis.com/fcm/send/u2', title: 'Page 2 due' },
  ]);
});
