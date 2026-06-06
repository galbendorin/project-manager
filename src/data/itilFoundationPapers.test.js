import test from 'node:test';
import assert from 'node:assert/strict';

import { PAPERS } from './itilFoundationPapers.js';

const LETTERS = ['A', 'B', 'C', 'D'];

test('ITIL Foundation sample papers include two complete 40-question mocks', () => {
  assert.equal(PAPERS.length, 2);
  assert.equal(PAPERS.reduce((total, paper) => total + paper.questions.length, 0), 80);

  PAPERS.forEach((paper) => {
    assert.equal(paper.questionCount, 40);
    assert.equal(paper.questions.length, 40);
    assert.equal(paper.passMark, 26);

    paper.questions.forEach((question, index) => {
      assert.equal(question.number, index + 1);
      assert.ok(question.prompt);
      assert.deepEqual(Object.keys(question.choices).sort(), LETTERS);
      assert.ok(LETTERS.includes(question.answer));
      assert.ok(question.choices[question.answer]);
      assert.ok(question.syllabusRef);
      assert.ok(question.rationale);
    });
  });
});
