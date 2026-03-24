import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countOwnedProjects,
  normalizeInviteEmail,
  isProjectOwner,
  getProjectCollaborator,
  normalizeProjectRecord,
  shouldSeedDemoProject,
  summarizeProjectAccess,
} from './projectSharing.js';

test('normalizeInviteEmail trims and lowercases input', () => {
  assert.equal(normalizeInviteEmail('  Person@Example.COM '), 'person@example.com');
});

test('isProjectOwner compares owner id to current user id', () => {
  assert.equal(isProjectOwner({ user_id: 'owner-1' }, 'owner-1'), true);
  assert.equal(isProjectOwner({ user_id: 'owner-1' }, 'owner-2'), false);
});

test('getProjectCollaborator prefers current user membership when present', () => {
  const project = {
    project_members: [
      { user_id: 'member-1', member_email: 'a@example.com' },
      { user_id: 'member-2', member_email: 'b@example.com' },
    ],
  };

  assert.deepEqual(getProjectCollaborator(project, 'member-2'), project.project_members[1]);
  assert.deepEqual(getProjectCollaborator(project, 'missing-user'), project.project_members[0]);
});

test('normalizeProjectRecord annotates ownership and sharing flags', () => {
  const ownedProject = normalizeProjectRecord({
    id: 'project-1',
    user_id: 'owner-1',
    is_demo: 1,
    project_members: [{ user_id: 'member-1', member_email: 'member@example.com' }],
  }, 'owner-1');

  assert.equal(ownedProject.is_demo, true);
  assert.equal(ownedProject.isOwned, true);
  assert.equal(ownedProject.isShared, true);
  assert.equal(ownedProject.isSharedByMe, true);
  assert.equal(ownedProject.isSharedWithMe, false);

  const sharedProject = normalizeProjectRecord({
    id: 'project-2',
    user_id: 'owner-1',
    project_members: [{ user_id: 'member-2', member_email: 'member2@example.com' }],
  }, 'member-2');

  assert.equal(sharedProject.isOwned, false);
  assert.equal(sharedProject.isShared, true);
  assert.equal(sharedProject.isSharedByMe, false);
  assert.equal(sharedProject.isSharedWithMe, true);
});

test('summarizeProjectAccess separates owned and shared counts', () => {
  const summary = summarizeProjectAccess([
    { id: 'project-1', user_id: 'owner-1' },
    { id: 'project-2', user_id: 'owner-1' },
    { id: 'project-3', user_id: 'owner-2' },
  ], 'owner-1');

  assert.deepEqual(summary, {
    ownedCount: 2,
    sharedCount: 1,
  });
});

test('countOwnedProjects counts only projects owned by the active user', () => {
  assert.equal(countOwnedProjects([
    { id: 'project-1', user_id: 'owner-1' },
    { id: 'project-2', user_id: 'owner-1' },
    { id: 'project-3', user_id: 'owner-2' },
  ], 'owner-1'), 2);
});

test('shouldSeedDemoProject stays true for shared-only new accounts', () => {
  assert.equal(shouldSeedDemoProject({
    projects: [
      { id: 'project-1', user_id: 'owner-2', isOwned: false },
    ],
    currentUserId: 'owner-1',
    demoSeeded: false,
  }), true);
});

test('shouldSeedDemoProject turns false once the user owns a project or is already seeded', () => {
  assert.equal(shouldSeedDemoProject({
    projects: [
      { id: 'project-1', user_id: 'owner-1', isOwned: true },
      { id: 'project-2', user_id: 'owner-2', isOwned: false },
    ],
    currentUserId: 'owner-1',
    demoSeeded: false,
  }), false);

  assert.equal(shouldSeedDemoProject({
    projects: [],
    currentUserId: 'owner-1',
    demoSeeded: true,
  }), false);
});
