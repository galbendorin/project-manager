import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRemixedQuestion,
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
  assert.equal(sections[1].letter, 'B');
  assert.equal(sections[1].label, 'B. Correct');
  assert.equal(sections[1].isCorrect, true);
});

test('remixed question moves the correct answer and rewrites rationale letters', () => {
  const question = {
    number: 1,
    answer: 'C',
    choices: {
      A: 'Change enablement',
      B: 'Service request management',
      C: 'Release management',
      D: 'Deployment management',
    },
    rationale: 'A. Incorrect. Change enablement controls change risk. B. Incorrect. Service request management handles requests. C. Correct. Release management makes new and changed services available. D. Incorrect. Deployment management moves components to environments.',
  };

  const remixed = buildRemixedQuestion(question, 0);
  const sections = formatRationaleSections(remixed.rationale);
  const correctSection = sections.find((section) => section.isCorrect);

  assert.notEqual(remixed.answer, question.answer);
  assert.equal(remixed.choices[remixed.answer], question.choices[question.answer]);
  assert.deepEqual(Object.values(remixed.choices).sort(), Object.values(question.choices).sort());
  assert.equal(sections.length, 4);
  assert.equal(correctSection.letter, remixed.answer);
  assert.match(correctSection.text, /Release management/);
});

test('remixed question expands grouped rationale into aligned A-D sections', () => {
  const question = {
    number: 6,
    answer: 'D',
    choices: {
      A: '1 and 2',
      B: '2 and 3',
      C: '3 and 4',
      D: '1 and 4',
    },
    rationale: 'D. Correct. Statements 1 and 4 are supported by the rationale. A, B, C. Incorrect. The remaining combinations include unsupported statements.',
  };

  const remixed = buildRemixedQuestion(question, 1);
  const sections = formatRationaleSections(remixed.rationale);
  const correctSection = sections.find((section) => section.isCorrect);

  assert.notEqual(remixed.answer, question.answer);
  assert.equal(remixed.choices[remixed.answer], question.choices[question.answer]);
  assert.equal(sections.length, 4);
  assert.deepEqual(sections.map((section) => section.letter), ['A', 'B', 'C', 'D']);
  assert.equal(correctSection.letter, remixed.answer);
});
