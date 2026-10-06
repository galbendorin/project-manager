import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { transformWithOxc } from 'vite';

// Exercise the actual App route branches and callbacks with controlled hooks.
// Lazy page contents and account services are irrelevant to the update notice.
const source = (await readFile(new URL('../App.jsx', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\n/gm, '').replace('export default App;', '');
const { code } = await transformWithOxc(source, 'App.jsx', { jsx: { runtime: 'classic' } });

function fixture({ path = '/shopping', pending = true, activation = Promise.resolve(true), project = null } = {}) {
  const slots = [], effects = [];
  let cursor = 0, reloads = 0;
  const window = Object.assign(new EventTarget(), {
    location: { pathname: path, search: '', reload() { reloads += 1; } },
    history: { pushState() {}, replaceState() {} },
  });
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((item, i) => !Object.is(item, slots[index][i]))) {
      slots[index] = deps; effects.push(effect);
    }
  };
  const renderApp = vm.runInNewContext(`${code}\nApp`, {
    React, useState, useEffect, useCallback: callback => callback,
    lazy: () => () => null, Suspense: ({ children }) => children, window,
    useAuth: () => ({ user: { id: 'test-owner', email: 'owner@example.test' }, loading: false }),
    usePlan: () => ({ householdToolsEnabled: true, financeToolsEnabled: true, loading: false }),
    useCheckoutStatus: () => null, useOnlineStatus: () => true,
    useTodoSourceNavigation: () => ({ request: null, error: '', openSource() {}, clear() {} }),
    OfflineBanner: () => null, CheckoutToast: () => null, AppStartupReady: () => null,
    loadAccentTheme: () => 'orchid', applyAccentTheme() {}, saveAccentTheme() {},
    loadLastAppPath: () => '/', readAppShortcutIntent: () => null,
    hasPendingServiceWorker: () => pending, activatePendingServiceWorker: () => activation,
    getFeatureByRoute: () => null, canAccessItilQuiz: () => false, hasPendingFinanceInvitation: () => false,
    saveLastAppPath() {}, clearLastProject() {}, saveLastProject() {}, loadLastProject: () => project,
    isHouseholdToolPath: value => ['/shopping', '/meals', '/baby', '/habits', '/weight'].includes(value),
  });
  return {
    render() { cursor = 0; return renderApp(); },
    flush() { effects.splice(0).forEach(effect => effect()); },
    setPending(value) { pending = value; },
    announce() { window.dispatchEvent(new Event('pmworkspace:update-available')); },
    reloads: () => reloads,
  };
}
function button(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'button' && ['Update now', 'Updating…'].includes(node.props.children)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = button(child); if (found) return found;
  }
  return null;
}
for (const path of ['/shopping', '/meals', '/track', '/']) {
  test(`waiting update is actionable on ${path} without a selected project`, () => {
    assert.equal(button(fixture({ path }).render())?.props.children, 'Update now');
  });
}
test('the project workspace retains its update action', () => {
  const f = fixture({ path: '/', project: { id: 'test-project' } });
  f.render(); f.flush();
  assert.equal(button(f.render())?.props.children, 'Update now');
});
test('Shopping displays an update that arrives after the page opens', () => {
  const f = fixture({ pending: false });
  assert.equal(button(f.render()), null); f.flush(); f.announce();
  assert.equal(button(f.render())?.props.children, 'Update now');
});
test('registration completing before the subscription does not lose its notice', () => {
  const f = fixture({ pending: false });
  assert.equal(button(f.render()), null);
  f.setPending(true); f.announce(); f.flush();
  assert.equal(button(f.render())?.props.children, 'Update now');
});
test('Shopping waits for activation before reloading', async () => {
  let resolve;
  const f = fixture({ activation: new Promise(done => { resolve = done; }) });
  const applying = button(f.render()).props.onClick();
  assert.equal(button(f.render()).props.disabled, true);
  assert.equal(f.reloads(), 0);
  resolve(true); await applying;
  assert.equal(f.reloads(), 1);
});
test('failed activation leaves Shopping open and permits retry', async () => {
  const f = fixture({ activation: Promise.resolve(false) });
  await button(f.render()).props.onClick();
  assert.equal(f.reloads(), 0);
  assert.equal(button(f.render()).props.disabled, false);
  assert.match(JSON.stringify(f.render()), /The update is taking longer/);
});
