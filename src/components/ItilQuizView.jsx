import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PAPERS } from '../data/itilFoundationPapers';
import { readLocalJson, writeLocalJson } from '../utils/offlineState';
import {
  createEmptyItilQuizProgress,
  formatRationaleSections,
  getNextQuestionIndex,
  getPaperProgress,
  getQuestionStatus,
  normalizeItilQuizProgress,
  summarizePaperProgress,
} from '../utils/itilQuiz';

const LETTERS = ['A', 'B', 'C', 'D'];
const MOCK_DURATION_MS = 60 * 60 * 1000;

const CheckIcon = ({ className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const CloseIcon = ({ className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const EyeIcon = ({ className = 'h-4 w-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

const TargetIcon = ({ className = 'h-5 w-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <path strokeLinecap="round" d="M12 2v3M22 12h-3M12 22v-3M2 12h3" />
  </svg>
);

const ClockIcon = ({ className = 'h-5 w-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
  </svg>
);

const BookIcon = ({ className = 'h-5 w-5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 016.5 3H20v16H6.5A2.5 2.5 0 014 16.5v-11z" />
    <path strokeLinecap="round" d="M4 16.5A2.5 2.5 0 016.5 14H20M8 7h7M8 10h5" />
  </svg>
);

const formatCountdown = (milliseconds) => {
  const safeMilliseconds = Math.max(0, Number(milliseconds) || 0);
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getStorageKey = (currentUserId = '') => (
  `pmworkspace:itil-foundation-quiz:${currentUserId || 'local'}:v1`
);

const ProgressBar = ({ value = 0, max = 40, tone = 'accent' }) => {
  const percentage = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  const toneClass = tone === 'success' ? 'bg-emerald-500' : 'bg-[var(--pm-accent)]';
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full transition-all ${toneClass}`} style={{ width: `${percentage}%` }} />
    </div>
  );
};

const ObjectiveCard = ({ icon, label, value, detail, tone = 'slate' }) => {
  const toneClasses = {
    accent: 'border-[var(--pm-accent)]/20 bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)]',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    slate: 'border-slate-200 bg-white text-slate-700',
  };
  return (
    <div className={`rounded-[22px] border px-4 py-4 shadow-sm ${toneClasses[tone] || toneClasses.slate}`}>
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em]">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-black tracking-[-0.04em] text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold leading-5 text-slate-500">{detail}</div>
    </div>
  );
};

const ModeBadge = ({ mode = 'practice' }) => (
  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
    mode === 'mock'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-sky-200 bg-sky-50 text-sky-700'
  }`}>
    {mode === 'mock' ? 'Mock exam' : 'Practice'}
  </span>
);

const PaperCard = ({ paper, paperProgress, onContinue, onStart, onReset }) => {
  const summary = summarizePaperProgress(paper, paperProgress);
  const hasProgress = Boolean(
    paperProgress.startedAt
    || paperProgress.completedAt
    || summary.answered > 0
    || summary.assisted > 0
    || Object.keys(paperProgress.selections || {}).length > 0
  );
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="pm-kicker">Official sample</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">{paper.title}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {paper.questionCount} questions · {paper.recommendedMinutes} minutes · pass at {paper.passMark}
          </p>
        </div>
        {hasProgress ? <ModeBadge mode={paperProgress.mode} /> : null}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Answered</div>
          <div className="mt-1 text-xl font-black text-slate-950">{summary.answered}/40</div>
        </div>
        <div className="rounded-2xl bg-emerald-50 px-3 py-3">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600">Unassisted</div>
          <div className="mt-1 text-xl font-black text-emerald-700">{summary.unassistedCorrect}</div>
        </div>
        <div className="rounded-2xl bg-amber-50 px-3 py-3">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-600">Assisted</div>
          <div className="mt-1 text-xl font-black text-amber-700">{summary.assisted}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
          <span>Progress</span>
          <span>{summary.remaining} remaining</span>
        </div>
        <ProgressBar value={summary.answered} max={paper.questionCount} />
      </div>

      {hasProgress ? (
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <button type="button" onClick={onContinue} className="pm-toolbar-primary rounded-2xl px-4 py-3 text-sm font-black text-white">
            Continue
          </button>
          <button type="button" onClick={onReset} className="pm-subtle-button rounded-2xl px-4 py-3 text-sm font-bold">
            Reset
          </button>
        </div>
      ) : (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => onStart('practice')} className="pm-toolbar-primary rounded-2xl px-4 py-3 text-sm font-black text-white">
            Start practice
          </button>
          <button type="button" onClick={() => onStart('mock')} className="pm-subtle-button rounded-2xl px-4 py-3 text-sm font-bold">
            Start 60-min mock
          </button>
        </div>
      )}
    </article>
  );
};

const QuizHome = ({ progress, onContinue, onStart, onReset }) => {
  const paperSummaries = PAPERS.map((paper) => summarizePaperProgress(paper, getPaperProgress(progress, paper.id)));
  const totalAnswered = paperSummaries.reduce((sum, summary) => sum + summary.answered, 0);
  const totalUnassisted = paperSummaries.reduce((sum, summary) => sum + summary.unassistedCorrect, 0);
  const papersPassed = paperSummaries.filter((summary) => summary.passed).length;

  return (
    <div className="pm-shell-bg min-h-full px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <section className="pm-home-panel overflow-hidden rounded-[28px] p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)] lg:items-end">
            <div>
              <p className="pm-kicker">ITIL 4 Foundation</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[0.98] tracking-[-0.06em] text-slate-950 sm:text-5xl">
                Practise for the pass, learn from every answer.
              </h1>
              <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                Complete both official sample papers. Your objective is to score at least 26 out of 40
                without opening the rationale first. Progress is saved on this device.
              </p>
            </div>
            <div className="rounded-[24px] border border-[var(--pm-accent)]/20 bg-[var(--pm-accent-soft)] p-4">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--pm-accent-strong)]">
                <TargetIcon className="h-4 w-4" />
                Your objective
              </div>
              <div className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-950">26 / 40 unassisted</div>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                Use rationales freely while learning. Assisted questions are tracked separately from your mock-ready score.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <ObjectiveCard icon={<BookIcon />} label="Coverage" value={`${totalAnswered} / 80`} detail="Questions answered across both papers" />
          <ObjectiveCard icon={<TargetIcon />} label="Unassisted correct" value={totalUnassisted} detail="Correct without revealing the rationale first" tone="emerald" />
          <ObjectiveCard icon={<CheckIcon className="h-5 w-5" />} label="Papers passed" value={`${papersPassed} / 2`} detail="Reach 26 unassisted correct in each paper" tone="accent" />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="pm-kicker">Mock tests</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Choose a paper</h2>
            </div>
            <div className="max-w-md text-xs font-semibold leading-5 text-slate-500">
              Practice mode is relaxed. Mock mode starts a 60-minute timer, while still letting you reveal a rationale if you choose.
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {PAPERS.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                paperProgress={getPaperProgress(progress, paper.id)}
                onContinue={() => onContinue(paper)}
                onReset={() => onReset(paper)}
                onStart={(mode) => onStart(paper, mode)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const QuestionNavigator = ({ paper, paperProgress, currentQuestionIndex, onSelectQuestion }) => (
  <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-10 sm:overflow-visible sm:px-0 sm:pb-0">
    {paper.questions.map((question, index) => {
      const status = getQuestionStatus(question, paperProgress);
      const statusClass = {
        assisted: 'border-amber-200 bg-amber-50 text-amber-700',
        correct: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        incorrect: 'border-rose-200 bg-rose-50 text-rose-700',
        selected: 'border-sky-200 bg-sky-50 text-sky-700',
        unanswered: 'border-slate-200 bg-white text-slate-500',
      }[status];
      return (
        <button
          key={question.number}
          type="button"
          onClick={() => onSelectQuestion(index)}
          className={`h-9 w-9 shrink-0 rounded-xl border text-xs font-black transition ${statusClass} ${
            index === currentQuestionIndex ? 'ring-2 ring-[var(--pm-accent)] ring-offset-1' : ''
          }`}
          aria-label={`Go to question ${question.number}`}
        >
          {question.number}
        </button>
      );
    })}
  </div>
);

const RationalePanel = ({ question }) => {
  const sections = formatRationaleSections(question.rationale);
  return (
    <section className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="pm-kicker text-amber-700">Rationale</p>
          <h3 className="mt-2 text-lg font-black text-slate-950">
            Correct answer: {question.answer}. {question.choices[question.answer]}
          </h3>
        </div>
        <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-black text-amber-700">
          Syllabus {question.syllabusRef}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {sections.map((section, index) => (
          <div
            key={`${section.label}-${index}`}
            className={`rounded-2xl border px-3 py-3 ${
              section.isCorrect
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-100 bg-white/80 text-slate-600'
            }`}
          >
            <div className="text-xs font-black">{section.label}</div>
            <p className="mt-1 text-xs font-medium leading-5">{section.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

const QuizQuestion = ({
  now,
  onBack,
  onFinish,
  onGoToQuestion,
  onNext,
  onPrevious,
  onRevealRationale,
  onSelectAnswer,
  onSubmitAnswer,
  paper,
  paperProgress,
}) => {
  const questionIndex = Math.min(paperProgress.currentQuestionIndex, paper.questions.length - 1);
  const question = paper.questions[questionIndex];
  const summary = summarizePaperProgress(paper, paperProgress);
  const selectedAnswer = paperProgress.selections[question.number] || '';
  const submittedAnswer = paperProgress.answers[question.number] || '';
  const isAssisted = Boolean(paperProgress.assisted[question.number]);
  const showRationale = isAssisted || Boolean(submittedAnswer);
  const isCorrect = Boolean(submittedAnswer && submittedAnswer === question.answer);
  const timeRemaining = paperProgress.mode === 'mock' && paperProgress.startedAt
    ? MOCK_DURATION_MS - (now - new Date(paperProgress.startedAt).getTime())
    : null;

  return (
    <div className="pm-shell-bg min-h-full px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onBack} className="pm-subtle-button rounded-2xl px-3 py-2 text-xs font-bold sm:text-sm">
            Back to tests
          </button>
          <div className="flex items-center gap-2">
            <ModeBadge mode={paperProgress.mode} />
            {timeRemaining !== null ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${
                timeRemaining <= 10 * 60 * 1000
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}>
                <ClockIcon className="h-3.5 w-3.5" />
                {formatCountdown(timeRemaining)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden self-start rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm xl:block">
            <p className="pm-kicker">{paper.title}</p>
            <h2 className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-950">Pass objective</h2>
            <div className="mt-4 rounded-2xl bg-emerald-50 px-3 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600">Unassisted score</div>
              <div className="mt-1 text-2xl font-black text-emerald-700">{summary.unassistedCorrect} / {paper.passMark}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-slate-50 px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Answered</div>
                <div className="mt-1 text-lg font-black text-slate-950">{summary.answered}</div>
              </div>
              <div className="rounded-2xl bg-amber-50 px-3 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-600">Assisted</div>
                <div className="mt-1 text-lg font-black text-amber-700">{summary.assisted}</div>
              </div>
            </div>
            <div className="mt-4">
              <QuestionNavigator
                paper={paper}
                paperProgress={paperProgress}
                currentQuestionIndex={questionIndex}
                onSelectQuestion={onGoToQuestion}
              />
            </div>
            <button type="button" onClick={onFinish} className="pm-subtle-button mt-4 w-full rounded-2xl px-4 py-2.5 text-xs font-bold">
              View results
            </button>
          </aside>

          <main className="min-w-0">
            <div className="mb-3 rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm xl:hidden">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="pm-kicker">{paper.title}</p>
                  <div className="mt-1 text-sm font-black text-slate-950">
                    {summary.unassistedCorrect} / {paper.passMark} unassisted
                  </div>
                </div>
                <button type="button" onClick={onFinish} className="pm-subtle-button rounded-xl px-3 py-2 text-xs font-bold">
                  Results
                </button>
              </div>
              <QuestionNavigator
                paper={paper}
                paperProgress={paperProgress}
                currentQuestionIndex={questionIndex}
                onSelectQuestion={onGoToQuestion}
              />
            </div>

            <article className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="pm-kicker">Question {question.number}</p>
                <span className="text-xs font-black text-slate-400">{questionIndex + 1} / {paper.questionCount}</span>
              </div>
              <h1 className="mt-4 text-[1.45rem] font-black leading-tight tracking-[-0.035em] text-slate-950 sm:text-3xl">
                {question.prompt}
              </h1>

              <div className="mt-5 space-y-2.5">
                {LETTERS.map((letter) => {
                  const selected = selectedAnswer === letter;
                  const correctChoice = showRationale && question.answer === letter;
                  const incorrectChoice = submittedAnswer === letter && submittedAnswer !== question.answer;
                  return (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => onSelectAnswer(question, letter)}
                      disabled={Boolean(submittedAnswer)}
                      className={`grid w-full grid-cols-[36px_minmax(0,1fr)] items-start gap-3 rounded-[20px] border px-3 py-3 text-left transition sm:px-4 sm:py-4 ${
                        correctChoice
                          ? 'border-emerald-300 bg-emerald-50'
                          : incorrectChoice
                            ? 'border-rose-300 bg-rose-50'
                            : selected
                              ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)]'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`grid h-9 w-9 place-items-center rounded-xl text-xs font-black ${
                        correctChoice
                          ? 'bg-emerald-600 text-white'
                          : incorrectChoice
                            ? 'bg-rose-600 text-white'
                            : selected
                              ? 'bg-[var(--pm-accent)] text-white'
                              : 'bg-slate-100 text-slate-600'
                      }`}>
                        {letter}
                      </span>
                      <span className="pt-1 text-sm font-semibold leading-6 text-slate-700">{question.choices[letter]}</span>
                    </button>
                  );
                })}
              </div>

              {submittedAnswer ? (
                <div className={`mt-4 flex items-start gap-3 rounded-[20px] border px-4 py-3 ${
                  isCorrect
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}>
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-current">
                    {isCorrect ? <CheckIcon className="h-4 w-4" /> : <CloseIcon className="h-4 w-4" />}
                  </span>
                  <div>
                    <div className="text-sm font-black">{isCorrect ? 'Correct' : 'Not quite'}</div>
                    <p className="mt-1 text-xs font-semibold leading-5">
                      {isCorrect
                        ? `You selected ${submittedAnswer}.`
                        : `You selected ${submittedAnswer}. The correct answer is ${question.answer}.`}
                      {isAssisted ? ' This question is recorded as assisted.' : ''}
                    </p>
                  </div>
                </div>
              ) : null}

              {showRationale ? <RationalePanel question={question} /> : null}

              <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => onSubmitAnswer(question)}
                  disabled={!selectedAnswer || Boolean(submittedAnswer)}
                  className="pm-toolbar-primary rounded-2xl px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittedAnswer ? 'Answer submitted' : 'Submit answer'}
                </button>
                <button
                  type="button"
                  onClick={() => onRevealRationale(question)}
                  disabled={showRationale}
                  className="pm-subtle-button inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <EyeIcon />
                  {showRationale ? 'Rationale shown' : 'Check rationale'}
                </button>
              </div>
              {!showRationale && !submittedAnswer ? (
                <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-400">
                  Checking the rationale before submitting marks this question as assisted.
                </p>
              ) : null}
            </article>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onPrevious}
                disabled={questionIndex === 0}
                className="pm-subtle-button rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={questionIndex === paper.questions.length - 1 ? onFinish : onNext}
                className="pm-toolbar-primary rounded-2xl px-4 py-3 text-sm font-black text-white"
              >
                {questionIndex === paper.questions.length - 1 ? 'View results' : 'Next question'}
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

const ResultsView = ({ onBack, onReset, onReviewQuestion, paper, paperProgress }) => {
  const summary = summarizePaperProgress(paper, paperProgress);
  const reviewQuestions = paper.questions.filter((question) => (
    paperProgress.answers[question.number]
    && (
      paperProgress.answers[question.number] !== question.answer
      || paperProgress.assisted[question.number]
    )
  ));
  return (
    <div className="pm-shell-bg min-h-full px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <section className="pm-home-panel rounded-[28px] p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
            <div className={`grid aspect-square w-40 place-items-center rounded-full border-[12px] ${
              summary.passed
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}>
              <div className="text-center">
                <div className="text-4xl font-black tracking-[-0.06em]">{summary.unassistedCorrect}</div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em]">unassisted</div>
              </div>
            </div>
            <div>
              <p className="pm-kicker">{paper.title} results</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.055em] text-slate-950">
                {summary.passed ? 'Pass objective reached.' : 'Keep building your unassisted score.'}
              </h1>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                You answered {summary.answered} questions, got {summary.correct} correct overall,
                and scored {summary.unassistedCorrect} correct without revealing the rationale first.
                The pass target is {paper.passMark}.
              </p>
              <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
                <button type="button" onClick={onBack} className="pm-toolbar-primary rounded-2xl px-5 py-3 text-sm font-black text-white">
                  Continue paper
                </button>
                <button type="button" onClick={onReset} className="pm-subtle-button rounded-2xl px-5 py-3 text-sm font-bold">
                  Reset paper
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ObjectiveCard label="Answered" value={`${summary.answered}/40`} detail={`${summary.remaining} remaining`} />
          <ObjectiveCard label="Correct" value={summary.correct} detail="Including assisted answers" tone="emerald" />
          <ObjectiveCard label="Unassisted" value={summary.unassistedCorrect} detail={`${Math.max(0, paper.passMark - summary.unassistedCorrect)} to pass target`} tone="accent" />
          <ObjectiveCard label="Assisted" value={summary.assisted} detail="Rationale opened before submit" />
        </section>

        <section>
          <div className="mb-3">
            <p className="pm-kicker">Review queue</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">Questions worth revisiting</h2>
          </div>
          {reviewQuestions.length ? (
            <div className="space-y-2">
              {reviewQuestions.map((question) => {
                const submittedAnswer = paperProgress.answers[question.number] || '';
                return (
                  <button
                    key={question.number}
                    type="button"
                    onClick={() => onReviewQuestion(paper.questions.indexOf(question))}
                    className="grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:border-[var(--pm-accent)] sm:px-4"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-xs font-black text-slate-600">
                      {question.number}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-950">{question.prompt}</span>
                      <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                        {submittedAnswer ? `Your answer ${submittedAnswer}` : 'Not answered'} · Correct {question.answer}
                        {paperProgress.assisted[question.number] ? ' · Assisted' : ''}
                      </span>
                    </span>
                    <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">Review</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-8 text-center text-sm font-black text-emerald-700">
              {summary.remaining > 0
                ? `No answered questions need review yet. Continue when you are ready for the remaining ${summary.remaining}.`
                : 'Perfect unassisted paper. Nothing is waiting in your review queue.'}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default function ItilQuizView({ currentUserId }) {
  const storageKey = useMemo(() => getStorageKey(currentUserId), [currentUserId]);
  const [progress, setProgress] = useState(() => (
    normalizeItilQuizProgress(readLocalJson(getStorageKey(currentUserId), createEmptyItilQuizProgress()))
  ));
  const [activePaperId, setActivePaperId] = useState('');
  const [screen, setScreen] = useState('home');
  const [now, setNow] = useState(() => Date.now());

  const activePaper = useMemo(
    () => PAPERS.find((paper) => paper.id === activePaperId) || null,
    [activePaperId]
  );
  const activePaperProgress = activePaper ? getPaperProgress(progress, activePaper.id) : null;

  useEffect(() => {
    setProgress(normalizeItilQuizProgress(readLocalJson(storageKey, createEmptyItilQuizProgress())));
    setActivePaperId('');
    setScreen('home');
  }, [storageKey]);

  useEffect(() => {
    writeLocalJson(storageKey, normalizeItilQuizProgress(progress));
  }, [progress, storageKey]);

  useEffect(() => {
    if (screen !== 'question' || activePaperProgress?.mode !== 'mock') return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [activePaperProgress?.mode, screen]);

  const updatePaperProgress = useCallback((paperId, updater) => {
    setProgress((previous) => {
      const normalized = normalizeItilQuizProgress(previous);
      const current = getPaperProgress(normalized, paperId);
      const nextPaperProgress = typeof updater === 'function' ? updater(current) : updater;
      return {
        ...normalized,
        papers: {
          ...normalized.papers,
          [paperId]: nextPaperProgress,
        },
      };
    });
  }, []);

  const startPaper = useCallback((paper, mode) => {
    updatePaperProgress(paper.id, (current) => ({
      ...current,
      answers: {},
      assisted: {},
      completedAt: '',
      currentQuestionIndex: 0,
      mode,
      selections: {},
      startedAt: new Date().toISOString(),
    }));
    setActivePaperId(paper.id);
    setNow(Date.now());
    setScreen('question');
  }, [updatePaperProgress]);

  const continuePaper = useCallback((paper) => {
    updatePaperProgress(paper.id, (current) => ({
      ...current,
      currentQuestionIndex: getNextQuestionIndex(paper, current),
      startedAt: current.startedAt || new Date().toISOString(),
    }));
    setActivePaperId(paper.id);
    setNow(Date.now());
    setScreen('question');
  }, [updatePaperProgress]);

  const resetPaper = useCallback((paper) => {
    if (!window.confirm(`Reset all saved progress for ${paper.title}?`)) return;
    setProgress((previous) => {
      const normalized = normalizeItilQuizProgress(previous);
      const nextPapers = { ...normalized.papers };
      delete nextPapers[paper.id];
      return { ...normalized, papers: nextPapers };
    });
    if (activePaperId === paper.id) {
      setActivePaperId('');
      setScreen('home');
    }
  }, [activePaperId]);

  const setQuestionIndex = useCallback((index) => {
    if (!activePaper) return;
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, activePaper.questions.length - 1));
    updatePaperProgress(activePaper.id, (current) => ({ ...current, currentQuestionIndex: safeIndex }));
  }, [activePaper, updatePaperProgress]);

  const selectAnswer = useCallback((question, letter) => {
    if (!activePaper) return;
    updatePaperProgress(activePaper.id, (current) => {
      if (current.answers[question.number]) return current;
      return {
        ...current,
        selections: { ...current.selections, [question.number]: letter },
      };
    });
  }, [activePaper, updatePaperProgress]);

  const submitAnswer = useCallback((question) => {
    if (!activePaper) return;
    updatePaperProgress(activePaper.id, (current) => {
      const selection = current.selections[question.number];
      if (!selection || current.answers[question.number]) return current;
      return {
        ...current,
        answers: { ...current.answers, [question.number]: selection },
      };
    });
  }, [activePaper, updatePaperProgress]);

  const revealRationale = useCallback((question) => {
    if (!activePaper) return;
    updatePaperProgress(activePaper.id, (current) => ({
      ...current,
      assisted: { ...current.assisted, [question.number]: true },
    }));
  }, [activePaper, updatePaperProgress]);

  const showResults = useCallback(() => {
    if (!activePaper) return;
    updatePaperProgress(activePaper.id, (current) => ({
      ...current,
      completedAt: new Date().toISOString(),
    }));
    setScreen('results');
  }, [activePaper, updatePaperProgress]);

  useEffect(() => {
    if (
      screen !== 'question'
      || activePaperProgress?.mode !== 'mock'
      || !activePaperProgress?.startedAt
    ) return;

    const startedAt = new Date(activePaperProgress.startedAt).getTime();
    if (Number.isFinite(startedAt) && now - startedAt >= MOCK_DURATION_MS) {
      showResults();
    }
  }, [activePaperProgress?.mode, activePaperProgress?.startedAt, now, screen, showResults]);

  if (screen === 'question' && activePaper && activePaperProgress) {
    return (
      <QuizQuestion
        now={now}
        onBack={() => setScreen('home')}
        onFinish={showResults}
        onGoToQuestion={setQuestionIndex}
        onNext={() => setQuestionIndex(activePaperProgress.currentQuestionIndex + 1)}
        onPrevious={() => setQuestionIndex(activePaperProgress.currentQuestionIndex - 1)}
        onRevealRationale={revealRationale}
        onSelectAnswer={selectAnswer}
        onSubmitAnswer={submitAnswer}
        paper={activePaper}
        paperProgress={activePaperProgress}
      />
    );
  }

  if (screen === 'results' && activePaper && activePaperProgress) {
    return (
      <ResultsView
        onBack={() => setScreen('question')}
        onReset={() => resetPaper(activePaper)}
        onReviewQuestion={(index) => {
          setQuestionIndex(index);
          setScreen('question');
        }}
        paper={activePaper}
        paperProgress={activePaperProgress}
      />
    );
  }

  return (
    <QuizHome
      progress={progress}
      onContinue={continuePaper}
      onReset={resetPaper}
      onStart={startPaper}
    />
  );
}
