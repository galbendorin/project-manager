import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessFinancePlanner,
  normalizeFinanceAccessEmail,
} from './financeAccess.js';

test('Financial Planner access is limited to the household accounts', () => {
  assert.equal(canAccessFinancePlanner('galben.dorin@yahoo.com'), true);
  assert.equal(canAccessFinancePlanner(' Galben.Dorin@Yahoo.com '), true);
  assert.equal(canAccessFinancePlanner('irina.urmanschi@gmail.com'), true);
  assert.equal(canAccessFinancePlanner(' Irina.Urmanschi@Gmail.com '), true);
  assert.equal(canAccessFinancePlanner('dorin.galben@yahoo.com'), false);
  assert.equal(canAccessFinancePlanner(''), false);
});

test('Financial Planner access normalizes email addresses', () => {
  assert.equal(normalizeFinanceAccessEmail(' Galben.Dorin@Yahoo.com '), 'galben.dorin@yahoo.com');
});
