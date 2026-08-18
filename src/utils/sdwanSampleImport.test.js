import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkspaceJsonImport } from './importParsers.js';

const sampleUrl = new URL('../../public/samples/sd-wan-project-plan-all-tabs.json', import.meta.url);

test('SD-WAN sample workspace import populates every supported professional project area', () => {
  const payload = JSON.parse(readFileSync(sampleUrl, 'utf8'));
  const imported = parseWorkspaceJsonImport(payload, {
    nowIso: '2026-08-18T12:00:00.000Z',
  });

  assert.equal(payload.projectName, 'Global SD-WAN Deployment - 12 Sites');
  assert.equal(imported.tasks.length, 55);
  assert.equal(imported.todos.length, 8);
  assert.equal(imported.tracker.length, 8);

  const professionalRegisters = [
    'risks',
    'issues',
    'actions',
    'minutes',
    'costs',
    'changes',
    'stakeholders',
    'commsplan',
    'assumptions',
    'decisions',
    'lessons',
  ];

  professionalRegisters.forEach((register) => {
    assert.ok(imported.registers[register].length > 0, `${register} should be populated`);
  });

  const raci = imported.registers._raci[0];
  assert.equal(raci.roles.length, 7);
  assert.equal(raci.assignments._customTasks.length, 12);
  assert.equal(raci.assignments['custom-0::Programme Sponsor'], 'A');

  assert.equal(imported.statusReport.overallRag, 'Amber');
  assert.match(imported.statusReport.overallNarrative, /SD-WAN/);
  assert.notEqual(imported.statusReport.deliverablesNextPeriod, '');

  assert.ok(imported.tracker.every((item) => Number.isInteger(item.taskId)));
  assert.equal(
    imported.tasks.some((task) => task.name.toLowerCase().includes('network transformation')),
    false
  );
});
