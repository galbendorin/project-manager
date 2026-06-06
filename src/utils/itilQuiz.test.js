import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatRationaleSections,
  getNextQuestionIndex,
  getQuestionStatus,
  summarizePaperProgress,
} from './itilQuiz.js';

const paper = {
  passMark: 2,
  questions: [
    { number: 1, answer: 'A' },
    { number: 2, answer: 'B' },
    { number: 3, answer: 'C' },
  ],
};

test('quiz summary separates assisted answers from the unassisted pass score', () => {
  const summary = summarizePaperProgress(paper, {
    answers: { 1: 'A', 2: 'B', 3: 'A' },
    assisted: { 2: true },
  });

  assert.equal(summary.correct, 2);
  assert.equal(summary.unassistedCorrect, 1);
  assert.equal(summary.assisted, 1);
  assert.equal(summary.passed, false);
});

test('quiz resumes at the first unanswered question', () => {
  assert.equal(getNextQuestionIndex(paper, { answers: { 1: 'A' } }), 1);
  assert.equal(getNextQuestionIndex(paper, { answers: { 1: 'A', 2: 'B', 3: 'C' }, currentQuestionIndex: 2 }), 2);
});

test('quiz question status prioritizes submitted answers', () => {
  assert.equal(getQuestionStatus(paper.questions[0], { answers: { 1: 'A' }, assisted: { 1: true } }), 'correct');
  assert.equal(getQuestionStatus(paper.questions[1], { assisted: { 2: true } }), 'assisted');
  assert.equal(getQuestionStatus(paper.questions[2], { selections: { 3: 'D' } }), 'selected');
});

test('rationale formatter separates option explanations', () => {
  const sections = formatRationaleSections('A. Incorrect. Not this. B. Correct. This is right. C. Incorrect. No. D. Incorrect. No.');
  assert.equal(sections.length, 4);
  assert.equal(sections[1].label, 'B. Correct');
  assert.equal(sections[1].isCorrect, true);
});

