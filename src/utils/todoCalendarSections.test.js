import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTodoCalendarSections,
  formatTodoMonthLabel,
  getTodoSectionDefaultDueDate,
} from './todoCalendarSections.js';

test('formatTodoMonthLabel returns month and short year', () => {
  assert.equal(formatTodoMonthLabel('2026-05'), "May '26");
});

test('buildTodoCalendarSections groups future work into calendar month sections', () => {
  const items = [
    { _id: '1', title: 'Overdue', dueDate: '2026-04-03', status: 'Open' },
    { _id: '2', title: 'This week', dueDate: '2026-04-09', status: 'Open' },
    { _id: '3', title: 'Next week', dueDate: '2026-04-15', status: 'Open' },
    { _id: '4', title: 'Later April', dueDate: '2026-04-28', status: 'Open' },
    { _id: '5', title: 'May task', dueDate: '2026-05-15', status: 'Open' },
    { _id: '6', title: 'No deadline', dueDate: '', status: 'Open' },
    { _id: '7', title: 'Far future', dueDate: '2027-06-01', status: 'Open' },
  ];

  const result = buildTodoCalendarSections(items, { today: '2026-04-06', showFutureMonths: true });

  assert.deepEqual(
    result.sections.map((section) => section.label),
    ['Passed deadline', 'This week', 'Next week', "Apr '26", "May '26", 'Later / no deadline']
  );
  assert.equal(result.futureItemCount, 2);
  assert.equal(result.sections.find((section) => section.key === 'later').items.length, 2);
});

test('buildTodoCalendarSections can hide future month sections while keeping counts', () => {
  const items = [
    { _id: '4', title: 'Later April', dueDate: '2026-04-28', status: 'Open' },
    { _id: '5', title: 'May task', dueDate: '2026-05-15', status: 'Open' },
  ];

  const result = buildTodoCalendarSections(items, { today: '2026-04-06', showFutureMonths: false });

  assert.deepEqual(
    result.sections.map((section) => section.label),
    ['Passed deadline', 'This week', 'Next week', 'Later / no deadline']
  );
  assert.equal(result.futureMonthSections.length, 2);
  assert.equal(result.futureItemCount, 2);
});

test('getTodoSectionDefaultDueDate returns month-end for month sections', () => {
  assert.equal(getTodoSectionDefaultDueDate('month:2026-05'), '2026-05-31');
});
