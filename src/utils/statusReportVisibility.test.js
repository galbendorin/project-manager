import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStatusReportRegisterSignals,
  isPublicRegisterItem,
  scopeRegisterItemsForStatusReport,
} from './statusReportVisibility.js';

test('register rows are public unless explicitly marked private', () => {
  assert.equal(isPublicRegisterItem({ public: true }), true);
  assert.equal(isPublicRegisterItem({ public: false }), false);
  assert.equal(isPublicRegisterItem({}), true);
  assert.equal(isPublicRegisterItem(null), false);
});

test('external Status Report keeps public rows and hides private rows', () => {
  const items = [
    { _id: 'public', public: true },
    { _id: 'legacy', public: undefined },
    { _id: 'private', public: false },
  ];

  assert.deepEqual(
    scopeRegisterItemsForStatusReport(items, true).map((item) => item._id),
    ['public', 'legacy'],
  );
});

test('internal Status Report keeps both public and private rows', () => {
  const items = [
    { _id: 'public', public: true },
    { _id: 'private', public: false },
  ];

  assert.deepEqual(
    scopeRegisterItemsForStatusReport(items, false).map((item) => item._id),
    ['public', 'private'],
  );
});

test('status report scopes each register independently', () => {
  const signals = getStatusReportRegisterSignals({
    risks: [{ _id: 'risk-public', public: true }, { _id: 'risk-private', public: false }],
    issues: [{ _id: 'issue-private', public: false }],
    actions: [{ _id: 'action-public' }],
    changes: null,
  }, true);

  assert.deepEqual(signals.risks.map((item) => item._id), ['risk-public']);
  assert.deepEqual(signals.issues, []);
  assert.deepEqual(signals.actions.map((item) => item._id), ['action-public']);
  assert.deepEqual(signals.changes, []);
});
