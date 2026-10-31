import { QUIZ } from '../quiz-data.js';
import { DOCS } from '../content.js';
import { getProgress, progressSummary, recordQuizAttempt, resetProgress } from '../progress.js';
import { esc, icon, toast } from '../ui.js';

function progressMarkup() {
  const summary = progressSummary(DOCS.length);
  const quiz = summary.quiz;
  const best = quiz.attempts ? `${quiz.bestPercent}%` : '—';
  const last = quiz.attempts ? `${quiz.lastPercent}%` : '—';
  return `
    <div class="progress-overview">
      <div class="progress-main">
        <p class="eyebrow">Your progress</p>
        <h2>${summary.completed} of ${summary.total} chapters complete</h2>
        <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.percent}" aria-label="Chapter completion">
          <span style="width:${summary.percent}%"></span>
        </div>
        <p class="dim" style="margin:0">Progress is stored only in this browser. <a href="#/learn">Open the chapters</a>.</p>
      </div>
      <div class="progress-stats">
        <div><strong>${best}</strong><span>best quiz score</span></div>
        <div><strong>${last}</strong><span>last score</span></div>
        <div><strong>${quiz.attempts}</strong><span>attempt${quiz.attempts === 1 ? '' : 's'}</span></div>
      </div>
    </div>`;
}

function questionMarkup(question, index, savedAnswers) {
  const saved = savedAnswers[question.id];
  const selected = saved && Number.isInteger(saved.selected) ? saved.selected : null;
  return `<fieldset class="quiz-q" data-quiz-question="${esc(question.id)}">
    <legend>
      <span class="quiz-num">${String(index + 1).padStart(2, '0')}</span>
      <span class="quiz-question">${esc(question.question)}</span>
      <span class="pill">${esc(question.topic)}</span>
    </legend>
    <div class="quiz-options">
      ${question.options.map((option, optionIndex) => `<label class="quiz-option">
        <input type="radio" name="q-${esc(question.id)}" value="${optionIndex}"${selected === optionIndex ? ' checked' : ''}>
        <span>${esc(option)}</span>
      </label>`).join('')}
    </div>
    <div class="quiz-feedback" data-feedback hidden></div>
  </fieldset>`;
}

export function renderQuiz(view) {
  const progress = getProgress();
  view.innerHTML = `
    <header class="page-head">
      <p class="eyebrow">Knowledge check</p>
      <h1>Quiz: can you spot the boundary?</h1>
      <p class="page-lede">
        ${QUIZ.length} questions across tokens, BFF, federation, SAML, attributes and proxy trust.
        Answer them in one sitting; every answer links back to the chapter or simulation that explains it.
      </p>
      <div class="hero-actions">
        <a class="btn" href="#/learn">${icon('book', 15)} Review the chapters</a>
        <a class="btn btn-ghost" href="#/selftest">${icon('check', 15)} Inspect the lab</a>
      </div>
    </header>

    <section data-quiz-progress class="quiz-progress">${progressMarkup()}</section>

    <form class="quiz" data-quiz novalidate>
      ${QUIZ.map((question, index) => questionMarkup(question, index, progress.quiz.answers)).join('')}
      <div class="quiz-actions">
        <button class="btn btn-primary" type="submit">${icon('check', 15)} Check answers</button>
        <button class="btn btn-ghost" type="button" data-quiz-reset>${icon('reset', 15)} Reset all progress</button>
        <span class="dim" data-quiz-status role="status" aria-live="polite"></span>
      </div>
    </form>

    <section class="quiz-result" data-quiz-result hidden tabindex="-1"></section>
  `;

  const form = view.querySelector('[data-quiz]');
  const result = view.querySelector('[data-quiz-result]');
  const status = view.querySelector('[data-quiz-status]');
  const progressBox = view.querySelector('[data-quiz-progress]');

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const answers = QUIZ.map((question) => {
      const inputs = [...form.querySelectorAll(`input[name="q-${question.id}"]`)];
      const selectedInput = inputs.find((input) => input.checked);
      const selected = selectedInput ? Number(selectedInput.value) : null;
      return { question, selected, correct: selected === question.answer };
    });

    const missing = answers.find((answer) => answer.selected === null);
    if (missing) {
      status.textContent = `Answer question ${QUIZ.indexOf(missing.question) + 1} before checking.`;
      const fieldset = form.querySelector(`[data-quiz-question="${missing.question.id}"]`);
      fieldset?.classList.add('is-missing');
      fieldset?.querySelector('input')?.focus();
      fieldset?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    let score = 0;
    for (const answer of answers) {
      const fieldset = form.querySelector(`[data-quiz-question="${answer.question.id}"]`);
      if (!fieldset) continue;
      fieldset.classList.remove('is-missing');
      fieldset.classList.toggle('is-correct', answer.correct);
      fieldset.classList.toggle('is-wrong', !answer.correct);
      if (answer.correct) score += 1;

      const feedback = fieldset.querySelector('[data-feedback]');
      feedback.hidden = false;
      feedback.innerHTML = `
        <div class="quiz-verdict ${answer.correct ? 'ok' : 'bad'}">
          <strong>${answer.correct ? 'Correct' : 'Not quite'}</strong>
          <span>${answer.correct ? '' : `Correct answer: ${esc(answer.question.options[answer.question.answer])}`}</span>
        </div>
        <p>${esc(answer.question.explanation)}</p>
        <a href="${esc(answer.question.link.href)}">${esc(answer.question.link.label)} →</a>`;
    }

    const percent = Math.round((score / QUIZ.length) * 100);
    recordQuizAttempt({
      score,
      total: QUIZ.length,
      answers: answers.map((answer) => ({
        id: answer.question.id,
        selected: answer.selected,
        correct: answer.correct,
      })),
    });

    progressBox.innerHTML = progressMarkup();
    result.hidden = false;
    result.innerHTML = `
      <div class="quiz-score ${percent >= 80 ? 'ok' : percent >= 50 ? 'care' : 'bad'}">
        <span class="quiz-score-value">${score}<small>/${QUIZ.length}</small></span>
        <div>
          <strong>${percent}%</strong>
          <p>${percent >= 80 ? 'Strong. The boundaries are clear.' : percent >= 50 ? 'Good start. Review the links below.' : 'Read the linked chapters, then try again.'}</p>
        </div>
      </div>
      <p>Best score: <strong>${progressSummary(DOCS.length).quiz.bestPercent}%</strong> across
         ${progressSummary(DOCS.length).quiz.attempts} attempt${progressSummary(DOCS.length).quiz.attempts === 1 ? '' : 's'}.
         <a href="#/learn">Return to the chapters</a> or change an answer and check again.</p>`;
    status.textContent = 'Attempt saved in this browser.';
    result.focus({ preventScroll: true });
    result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  form.querySelector('[data-quiz-reset]')?.addEventListener('click', () => {
    if (typeof window.confirm === 'function' && !window.confirm('Reset chapter and quiz progress in this browser?')) return;
    resetProgress();
    toast('Progress reset');
    renderQuiz(view);
  });
}
