import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessItilQuiz,
  normalizeAccessEmail,
} from './itilQuizAccess.js';

test('ITIL quiz access is limited to approved emails', () => {
  assert.equal(canAccessItilQuiz('galben.dorin@yahoo.com'), true);
  assert.equal(canAccessItilQuiz(' Galben.Dorin@Yahoo.com '), true);
  assert.equal(canAccessItilQuiz('carlo.capaldo@gtt.net'), true);
  assert.equal(canAccessItilQuiz(' Carlo.Capaldo@GTT.NET '), true);
  assert.equal(canAccessItilQuiz('dorin.galben@yahoo.com'), false);
  assert.equal(canAccessItilQuiz(''), false);
});

test('access email normalization trims and lowercases', () => {
  assert.equal(normalizeAccessEmail(' Galben.Dorin@Yahoo.com '), 'galben.dorin@yahoo.com');
});
