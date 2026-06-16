import test from 'node:test';
import assert from 'node:assert/strict';

import { PAPERS } from './itilFoundationPapers.js';
import {
  REMIXED_ASSESSMENT_COUNT,
  REMIXED_ASSESSMENT_SIZE,
  SHORT_ASSESSMENT_COUNT,
  SHORT_ASSESSMENT_SIZE,
  buildRemixedAssessmentSets,
  buildShortAssessmentSets,
  formatRationaleSections,
} from '../utils/itilQuiz.js';

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

test('short assessments cover all questions once across eight iterations', () => {
  const assessments = buildShortAssessmentSets(PAPERS);
  assert.equal(assessments.length, SHORT_ASSESSMENT_COUNT);

  assessments.forEach((assessment) => {
    assert.equal(assessment.questionCount, SHORT_ASSESSMENT_SIZE);
    assert.equal(assessment.questions.length, SHORT_ASSESSMENT_SIZE);
  });

  const sourceKeys = assessments.flatMap((assessment) => (
    assessment.questions.map((question) => question.sourceKey)
  ));
  const expectedSourceKeys = PAPERS.flatMap((paper) => (
    paper.questions.map((question) => `${paper.id}:${question.number}`)
  ));

  assert.equal(sourceKeys.length, 80);
  assert.equal(new Set(sourceKeys).size, 80);
  assert.deepEqual([...sourceKeys].sort(), expectedSourceKeys.sort());
});

test('remixed assessments move answer letters while preserving answer text and rationale logic', () => {
  const assessments = buildRemixedAssessmentSets(PAPERS);
  const sourceQuestionsByKey = new Map(
    PAPERS.flatMap((paper) => (
      paper.questions.map((question) => [`${paper.id}:${question.number}`, question])
    ))
  );

  assert.equal(assessments.length, REMIXED_ASSESSMENT_COUNT);

  const sourceKeys = assessments.flatMap((assessment) => {
    assert.equal(assessment.questionCount, REMIXED_ASSESSMENT_SIZE);
    assert.equal(assessment.questions.length, REMIXED_ASSESSMENT_SIZE);

    return assessment.questions.map((question) => {
      const sourceQuestion = sourceQuestionsByKey.get(question.sourceKey);
      const rationaleSections = formatRationaleSections(question.rationale);
      const correctSection = rationaleSections.find((section) => section.isCorrect);

      assert.ok(sourceQuestion, `Missing source question for ${question.sourceKey}`);
      assert.notEqual(question.answer, sourceQuestion.answer);
      assert.equal(question.choices[question.answer], sourceQuestion.choices[sourceQuestion.answer]);
      assert.deepEqual(Object.values(question.choices).sort(), Object.values(sourceQuestion.choices).sort());
      assert.equal(rationaleSections.length, LETTERS.length);
      assert.equal(correctSection?.letter, question.answer);

      return question.sourceKey;
    });
  });

  assert.equal(sourceKeys.length, 80);
  assert.equal(new Set(sourceKeys).size, 80);
});
