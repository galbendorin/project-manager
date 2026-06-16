export const ITIL_QUIZ_STORAGE_VERSION = 1;
export const ITIL_PASS_MARK = 26;
export const SHORT_ASSESSMENT_COUNT = 8;
export const SHORT_ASSESSMENT_SIZE = 10;
export const SHORT_ASSESSMENT_PASS_MARK = 7;
export const REMIXED_ASSESSMENT_COUNT = 8;
export const REMIXED_ASSESSMENT_SIZE = 10;
export const REMIXED_ASSESSMENT_PASS_MARK = 7;

const LETTERS = ['A', 'B', 'C', 'D'];

const createEmptyPaperProgress = () => ({
  answers: {},
  assisted: {},
  completedAt: '',
  currentQuestionIndex: 0,
  lastScore: null,
  mode: 'practice',
  selections: {},
  startedAt: '',
});

const normalizeScoreSnapshot = (score = null) => {
  if (!score || typeof score !== 'object') return null;

  return {
    assisted: Math.max(0, Number(score.assisted) || 0),
    answered: Math.max(0, Number(score.answered) || 0),
    completedAt: typeof score.completedAt === 'string' ? score.completedAt : '',
    correct: Math.max(0, Number(score.correct) || 0),
    incorrect: Math.max(0, Number(score.incorrect) || 0),
    mode: score.mode === 'mock' ? 'mock' : 'practice',
    passed: Boolean(score.passed),
    passMark: Math.max(0, Number(score.passMark) || 0),
    questionCount: Math.max(0, Number(score.questionCount) || 0),
    remaining: Math.max(0, Number(score.remaining) || 0),
    unassistedCorrect: Math.max(0, Number(score.unassistedCorrect) || 0),
  };
};

export const createEmptyItilQuizProgress = () => ({
  version: ITIL_QUIZ_STORAGE_VERSION,
  papers: {},
});

export const normalizePaperProgress = (progress = {}) => ({
  ...createEmptyPaperProgress(),
  ...progress,
  answers: progress?.answers && typeof progress.answers === 'object' ? progress.answers : {},
  assisted: progress?.assisted && typeof progress.assisted === 'object' ? progress.assisted : {},
  selections: progress?.selections && typeof progress.selections === 'object' ? progress.selections : {},
  currentQuestionIndex: Number.isFinite(Number(progress?.currentQuestionIndex))
    ? Math.max(0, Number(progress.currentQuestionIndex))
    : 0,
  lastScore: normalizeScoreSnapshot(progress?.lastScore),
  mode: progress?.mode === 'mock' ? 'mock' : 'practice',
});

export const normalizeItilQuizProgress = (progress = {}) => ({
  version: ITIL_QUIZ_STORAGE_VERSION,
  papers: Object.fromEntries(
    Object.entries(progress?.papers || {}).map(([paperId, paperProgress]) => (
      [paperId, normalizePaperProgress(paperProgress)]
    ))
  ),
});

export const getPaperProgress = (progress = {}, paperId = '') => (
  normalizePaperProgress(progress?.papers?.[paperId])
);

export const summarizePaperProgress = (paper, paperProgress = {}) => {
  const normalizedProgress = normalizePaperProgress(paperProgress);
  const questions = Array.isArray(paper?.questions) ? paper.questions : [];
  const answeredQuestions = questions.filter((question) => normalizedProgress.answers[question.number]);
  const correctQuestions = answeredQuestions.filter(
    (question) => normalizedProgress.answers[question.number] === question.answer
  );
  const assistedQuestions = questions.filter((question) => normalizedProgress.assisted[question.number]);
  const unassistedCorrectQuestions = correctQuestions.filter(
    (question) => !normalizedProgress.assisted[question.number]
  );

  return {
    answered: answeredQuestions.length,
    assisted: assistedQuestions.length,
    correct: correctQuestions.length,
    incorrect: answeredQuestions.length - correctQuestions.length,
    passed: unassistedCorrectQuestions.length >= (paper?.passMark || ITIL_PASS_MARK),
    remaining: Math.max(0, questions.length - answeredQuestions.length),
    unassistedCorrect: unassistedCorrectQuestions.length,
  };
};

export const buildPaperScoreSnapshot = (paper, paperProgress = {}, completedAt = '') => {
  const normalizedProgress = normalizePaperProgress(paperProgress);
  const summary = summarizePaperProgress(paper, normalizedProgress);

  return normalizeScoreSnapshot({
    ...summary,
    completedAt,
    mode: normalizedProgress.mode,
    passMark: paper?.passMark || ITIL_PASS_MARK,
    questionCount: Array.isArray(paper?.questions) ? paper.questions.length : 0,
  });
};

export const getNextQuestionIndex = (paper, paperProgress = {}) => {
  const normalizedProgress = normalizePaperProgress(paperProgress);
  const questions = Array.isArray(paper?.questions) ? paper.questions : [];
  const unansweredIndex = questions.findIndex(
    (question) => !normalizedProgress.answers[question.number]
  );
  if (unansweredIndex >= 0) return unansweredIndex;
  return Math.min(normalizedProgress.currentQuestionIndex, Math.max(0, questions.length - 1));
};

export const getQuestionStatus = (question, paperProgress = {}) => {
  const normalizedProgress = normalizePaperProgress(paperProgress);
  const answer = normalizedProgress.answers[question?.number];
  if (answer) {
    return answer === question?.answer ? 'correct' : 'incorrect';
  }
  if (normalizedProgress.assisted[question?.number]) return 'assisted';
  if (normalizedProgress.selections[question?.number]) return 'selected';
  return 'unanswered';
};

export const formatRationaleSections = (rationale = '') => {
  const normalized = String(rationale || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const markers = [...normalized.matchAll(/(?:^|\s)([A-D])\.\s+(Correct|Incorrect)\.?\s*/g)];
  if (markers.length < 2) {
    return [{ label: 'Explanation', text: normalized, isCorrect: true }];
  }

  return markers.map((marker, index) => {
    const nextMarker = markers[index + 1];
    const textStart = marker.index + marker[0].length;
    const textEnd = nextMarker?.index ?? normalized.length;
    const status = marker[2];
    return {
      letter: marker[1],
      status,
      label: `${marker[1]}. ${status}`,
      text: normalized.slice(textStart, textEnd).trim(),
      isCorrect: status === 'Correct',
    };
  });
};

const buildStableQuestionRank = (index, total) => (
  ((index * 37) + 17) % total
);

const buildSourceQuestionList = (papers = []) => (
  papers.flatMap((paper) => (
    (Array.isArray(paper?.questions) ? paper.questions : []).map((question) => ({
      paper,
      question,
      sourceKey: `${paper.id}:${question.number}`,
    }))
  ))
);

const buildShuffledSourceQuestions = (papers = []) => {
  const sourceQuestions = buildSourceQuestionList(papers);
  if (sourceQuestions.length === 0) return [];

  return sourceQuestions
    .map((item, index) => ({
      ...item,
      index,
      rank: buildStableQuestionRank(index, sourceQuestions.length),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
};

export const buildShortAssessmentSets = (papers = []) => {
  const shuffledQuestions = buildShuffledSourceQuestions(papers);
  if (shuffledQuestions.length === 0) return [];

  return Array.from({ length: SHORT_ASSESSMENT_COUNT }, (_, setIndex) => {
    const start = setIndex * SHORT_ASSESSMENT_SIZE;
    const questions = shuffledQuestions
      .slice(start, start + SHORT_ASSESSMENT_SIZE)
      .map(({ paper, question, sourceKey }, questionIndex) => ({
        ...question,
        number: questionIndex + 1,
        sourceKey,
        sourceNumber: question.number,
        sourcePaperId: paper.id,
        sourcePaperTitle: paper.title,
        sourceLabel: `${paper.title} Q${question.number}`,
      }));

    return {
      id: `assessment-${setIndex + 1}`,
      title: `Short Assessment ${setIndex + 1}`,
      subtitle: 'ITIL 4 Foundation',
      kicker: '10-question prep',
      continueLabel: 'Continue assessment',
      resetLabel: 'Reset assessment',
      questionCount: questions.length,
      passMark: SHORT_ASSESSMENT_PASS_MARK,
      recommendedMinutes: 15,
      questions,
    };
  }).filter((assessment) => assessment.questions.length > 0);
};

const buildChoiceRemap = (question = {}, questionIndex = 0) => {
  const seed = Number(question.sourceNumber || question.number || questionIndex + 1);
  const shift = (Math.abs(seed + questionIndex) % (LETTERS.length - 1)) + 1;
  const newToOld = Object.fromEntries(
    LETTERS.map((newLetter, index) => [
      newLetter,
      LETTERS[(index + shift) % LETTERS.length],
    ])
  );
  const oldToNew = Object.fromEntries(
    Object.entries(newToOld).map(([newLetter, oldLetter]) => [oldLetter, newLetter])
  );
  return { newToOld, oldToNew };
};

const buildRationaleSectionsByLetter = (question = {}) => {
  const sections = formatRationaleSections(question.rationale);
  const byLetter = Object.fromEntries(
    sections
      .filter((section) => LETTERS.includes(section.letter))
      .map((section) => [section.letter, section])
  );

  if (LETTERS.every((letter) => byLetter[letter])) return byLetter;

  const correctSection = sections.find((section) => section.isCorrect);
  const incorrectText = sections
    .filter((section) => !section.isCorrect)
    .map((section) => section.text)
    .join(' ')
    .trim();

  if (!correctSection || !incorrectText || !LETTERS.includes(question.answer)) return null;

  return Object.fromEntries(
    LETTERS.map((letter) => [
      letter,
      letter === question.answer
        ? { ...correctSection, letter, status: 'Correct', isCorrect: true }
        : { letter, status: 'Incorrect', label: `${letter}. Incorrect`, text: incorrectText, isCorrect: false },
    ])
  );
};

const buildRemixedRationale = (question = {}, newToOld = {}) => {
  const sectionsByLetter = buildRationaleSectionsByLetter(question);
  if (!sectionsByLetter) return question.rationale;

  return LETTERS.map((newLetter) => {
    const sourceLetter = newToOld[newLetter];
    const section = sectionsByLetter[sourceLetter];
    if (!section) return '';
    const status = section.isCorrect ? 'Correct' : 'Incorrect';
    return `${newLetter}. ${status}. ${section.text}`;
  }).filter(Boolean).join(' ');
};

export const buildRemixedQuestion = (question = {}, questionIndex = 0) => {
  const { newToOld, oldToNew } = buildChoiceRemap(question, questionIndex);
  const answer = oldToNew[question.answer] || question.answer;

  return {
    ...question,
    answer,
    choices: Object.fromEntries(
      LETTERS.map((newLetter) => [
        newLetter,
        question.choices?.[newToOld[newLetter]] || '',
      ])
    ),
    rationale: buildRemixedRationale(question, newToOld),
    remixChoiceOrder: newToOld,
    sourceAnswerLetter: question.answer,
  };
};

export const buildRemixedAssessmentSets = (papers = []) => {
  const shuffledQuestions = buildShuffledSourceQuestions(papers);
  if (shuffledQuestions.length === 0) return [];

  return Array.from({ length: REMIXED_ASSESSMENT_COUNT }, (_, setIndex) => {
    const start = setIndex * REMIXED_ASSESSMENT_SIZE;
    const questions = shuffledQuestions
      .slice(start, start + REMIXED_ASSESSMENT_SIZE)
      .map(({ paper, question, sourceKey }, questionIndex) => ({
        ...buildRemixedQuestion(question, start + questionIndex),
        number: questionIndex + 1,
        sourceKey,
        sourceNumber: question.number,
        sourcePaperId: paper.id,
        sourcePaperTitle: paper.title,
        sourceLabel: `${paper.title} Q${question.number}`,
      }));

    return {
      id: `remix-assessment-${setIndex + 1}`,
      title: `Rationale Remix ${setIndex + 1}`,
      subtitle: 'ITIL 4 Foundation',
      kicker: 'Answer remix',
      continueLabel: 'Continue remix',
      resetLabel: 'Reset remix',
      questionCount: questions.length,
      passMark: REMIXED_ASSESSMENT_PASS_MARK,
      recommendedMinutes: 15,
      questions,
    };
  }).filter((assessment) => assessment.questions.length > 0);
};
