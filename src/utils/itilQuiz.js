export const ITIL_QUIZ_STORAGE_VERSION = 1;
export const ITIL_PASS_MARK = 26;
export const SHORT_ASSESSMENT_COUNT = 8;
export const SHORT_ASSESSMENT_SIZE = 10;
export const SHORT_ASSESSMENT_PASS_MARK = 7;

const createEmptyPaperProgress = () => ({
  answers: {},
  assisted: {},
  completedAt: '',
  currentQuestionIndex: 0,
  mode: 'practice',
  selections: {},
  startedAt: '',
});

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
    return {
      label: `${marker[1]}. ${marker[2]}`,
      text: normalized.slice(textStart, textEnd).trim(),
      isCorrect: marker[2] === 'Correct',
    };
  });
};

const buildStableQuestionRank = (index, total) => (
  ((index * 37) + 17) % total
);

export const buildShortAssessmentSets = (papers = []) => {
  const sourceQuestions = papers.flatMap((paper) => (
    (Array.isArray(paper?.questions) ? paper.questions : []).map((question) => ({
      paper,
      question,
      sourceKey: `${paper.id}:${question.number}`,
    }))
  ));

  if (sourceQuestions.length === 0) return [];

  const shuffledQuestions = sourceQuestions
    .map((item, index) => ({
      ...item,
      index,
      rank: buildStableQuestionRank(index, sourceQuestions.length),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);

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
