import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isHouseholdToolPath,
} from './navigationState.js';

test('isHouseholdToolPath recognizes gated household routes', () => {
  assert.equal(isHouseholdToolPath('/shopping'), true);
  assert.equal(isHouseholdToolPath('/shopping/'), true);
  assert.equal(isHouseholdToolPath('/meals'), true);
  assert.equal(isHouseholdToolPath('/baby'), true);
  assert.equal(isHouseholdToolPath('/habits'), true);
});

test('isHouseholdToolPath ignores public and project workspace routes', () => {
  assert.equal(isHouseholdToolPath('/'), false);
  assert.equal(isHouseholdToolPath('/pricing'), false);
  assert.equal(isHouseholdToolPath('/track'), false);
  assert.equal(isHouseholdToolPath('/shopping-list'), false);
});
