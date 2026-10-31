/* Lightweight local progress tracking.
   Everything stays in this browser. Storage failures are non-fatal: the lab
   continues to work, it just will not remember the visitor. */

const KEY = 'og-progress-v1';

const empty = () => ({
  chapters: {},
  quiz: {
    attempts: 0,
    bestPercent: 0,
    lastPercent: 0,
    lastAt: 0,
    answers: {},
  },
});

function normalize(value) {
  const base = empty();
  if (!value || typeof value !== 'object') return base;
  if (value.chapters && typeof value.chapters === 'object') base.chapters = { ...value.chapters };
  if (value.quiz && typeof value.quiz === 'object') {
    base.quiz = {
      ...base.quiz,
      ...value.quiz,
      answers: value.quiz.answers && typeof value.quiz.answers === 'object' ? { ...value.quiz.answers } : {},
    };
  }
  return base;
}

export function getProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return empty();
  }
}

function write(progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* progress is a convenience, never a hard requirement */
  }
  return progress;
}

export function chapterIsComplete(slug) {
  return Boolean(getProgress().chapters[slug]);
}

export function completedChapters() {
  return new Set(Object.keys(getProgress().chapters));
}

export function setChapterComplete(slug, complete = true) {
  const progress = getProgress();
  if (complete) progress.chapters[slug] = Date.now();
  else delete progress.chapters[slug];
  return write(progress);
}

export function toggleChapterComplete(slug) {
  const complete = !chapterIsComplete(slug);
  setChapterComplete(slug, complete);
  return complete;
}

export function recordQuizAttempt({ answers, score, total }) {
  const progress = getProgress();
  const percent = total ? Math.round((score / total) * 100) : 0;
  progress.quiz.attempts += 1;
  progress.quiz.lastPercent = percent;
  progress.quiz.bestPercent = Math.max(progress.quiz.bestPercent, percent);
  progress.quiz.lastAt = Date.now();
  for (const answer of answers) {
    progress.quiz.answers[answer.id] = { selected: answer.selected, correct: answer.correct };
  }
  return write(progress);
}

export function resetProgress() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function progressSummary(chapterTotal) {
  const progress = getProgress();
  const completed = Object.keys(progress.chapters).length;
  return {
    completed,
    total: chapterTotal,
    percent: chapterTotal ? Math.round((completed / chapterTotal) * 100) : 0,
    quiz: progress.quiz,
  };
}
