// Quiz screens shared by the student lesson view (server-graded) and the
// course builder's "Preview quiz" (graded locally from the instructor's
// own draft): the start screen, the questions, and the result with review.
import type { ReactNode } from 'react';
import { CheckCircle2, ClipboardCheck, RotateCcw, XCircle } from 'lucide-react';

export interface QuizQ { id: string; prompt: string; options: { id: string; text: string }[] }
export interface QuizReview { questionId: string; correctOptionId: string | null; explanation: string | null }

export function attemptsLabel(allowed: number | null, used: number): string {
  if (allowed === null) return used ? `Unlimited attempts · ${used} used` : 'Unlimited attempts';
  const left = Math.max(0, allowed - used);
  return `${left} of ${allowed} attempt${allowed === 1 ? '' : 's'} left`;
}

export function QuizIntro({ title, instructions, passingScore, questionCount, attemptsAllowed, attemptsUsed, bestScore, required, onStart, startLabel, disabledReason, footer }: {
  title: string; instructions: string | null; passingScore: number; questionCount: number;
  attemptsAllowed: number | null; attemptsUsed: number; bestScore: number | null; required: boolean;
  onStart?: () => void; startLabel: string; disabledReason?: string | null; footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50"><ClipboardCheck className="h-6 w-6 text-violet-600" /></span>
      <h2 className="mt-3 text-xl font-black text-gray-900">{title || 'Untitled quiz'}</h2>
      {instructions && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">{instructions}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label="Questions" value={String(questionCount)} />
        <Stat label="Passing score" value={`${passingScore}%`} />
        <Stat label="Attempts" value={attemptsAllowed === null ? 'Unlimited' : `${Math.max(0, attemptsAllowed - attemptsUsed)} left`} />
        <Stat label="Best score" value={bestScore === null ? '–' : `${bestScore}%`} />
      </dl>
      <p className="mt-3 text-xs text-gray-500">
        {required ? 'You need to pass this quiz to complete the course.' : 'Optional -- it doesn’t affect course completion.'} {attemptsLabel(attemptsAllowed, attemptsUsed)}.
      </p>
      {disabledReason ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{disabledReason}</p>
      ) : onStart ? (
        <button type="button" onClick={onStart} className="mt-5 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 sm:w-auto sm:px-8">{startLabel}</button>
      ) : null}
      {footer}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <dt className="text-[11px] font-semibold text-gray-400">{label}</dt>
      <dd className="text-sm font-black text-gray-900">{value}</dd>
    </div>
  );
}

export function QuizQuestions({ questions, answers, onAnswer, onSubmit, submitting, saveNote }: {
  questions: QuizQ[]; answers: Record<string, string>; onAnswer: (questionId: string, optionId: string) => void;
  onSubmit: () => void; submitting?: boolean; saveNote?: ReactNode;
}) {
  const answered = questions.filter(q => answers[q.id]).length;
  return (
    <div className="space-y-3">
      {questions.map((q, n) => (
        <fieldset key={q.id} className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5">
          <legend className="sr-only">Question {n + 1}</legend>
          <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">Question {n + 1} of {questions.length}</p>
          <p className="mt-1 text-base font-bold text-gray-900">{q.prompt}</p>
          <div className="mt-3 space-y-2">
            {q.options.map(o => {
              const checked = answers[q.id] === o.id;
              return (
                <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors ${checked ? 'border-blue-500 bg-blue-50 font-semibold text-gray-900' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
                  <input type="radio" name={q.id} checked={checked} onChange={() => onAnswer(q.id, o.id)} className="h-4 w-4 accent-blue-600" />
                  {o.text}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-0 -mx-4 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-xs text-gray-500">{answered} of {questions.length} answered {saveNote}</p>
          <button type="button" onClick={onSubmit} disabled={submitting || answered < questions.length}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit answers'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuizResult({ score, passed, correctCount, questionCount, passingScore, questions, answers, review, attemptsAllowed, attemptsUsed, onRetry, onContinue, continueLabel }: {
  score: number; passed: boolean; correctCount: number; questionCount: number; passingScore: number;
  questions: QuizQ[]; answers: Record<string, string>; review: QuizReview[] | null;
  attemptsAllowed: number | null; attemptsUsed: number;
  onRetry?: () => void; onContinue?: () => void; continueLabel?: string;
}) {
  const canRetry = !passed && (attemptsAllowed === null || attemptsUsed < attemptsAllowed);
  const reviewMap = new Map((review ?? []).map(r => [r.questionId, r]));
  return (
    <div className="space-y-3">
      <div className={`rounded-2xl p-5 sm:p-6 ${passed ? 'bg-emerald-50' : 'bg-red-50'}`} aria-live="polite">
        <div className="flex items-center gap-3">
          {passed ? <CheckCircle2 className="h-9 w-9 text-emerald-600" /> : <XCircle className="h-9 w-9 text-red-500" />}
          <div>
            <p className="text-3xl font-black text-gray-900">{score}%</p>
            <p className={`text-sm font-bold ${passed ? 'text-emerald-700' : 'text-red-700'}`}>{passed ? 'Passed' : 'Not passed'} · passing score {passingScore}%</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-600">{correctCount} of {questionCount} correct. {passed ? '' : attemptsLabel(attemptsAllowed, attemptsUsed) + '.'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {canRetry && onRetry && (
            <button type="button" onClick={onRetry} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-gray-900 border border-gray-200 hover:bg-gray-50">
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          )}
          {onContinue && (
            <button type="button" onClick={onContinue} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700">{continueLabel || 'Continue'}</button>
          )}
        </div>
        {!passed && !canRetry && !review && <p className="mt-3 text-xs text-gray-600">You’ve used all your attempts.</p>}
      </div>

      {review ? (
        <div className="space-y-2">
          <p className="px-1 text-sm font-black text-gray-900">Answers</p>
          {questions.map((q, n) => {
            const r = reviewMap.get(q.id);
            const mine = answers[q.id];
            const right = r?.correctOptionId && mine === r.correctOptionId;
            return (
              <div key={q.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                <p className="flex items-start gap-2 text-sm font-bold text-gray-900">
                  {right ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                  <span>{n + 1}. {q.prompt}</span>
                </p>
                <ul className="mt-2 space-y-1 pl-6 text-sm">
                  {q.options.map(o => (
                    <li key={o.id} className={o.id === r?.correctOptionId ? 'font-bold text-emerald-700' : o.id === mine ? 'text-red-600 line-through' : 'text-gray-500'}>
                      {o.text}{o.id === r?.correctOptionId ? ' ✓' : o.id === mine ? ' (your answer)' : ''}
                    </li>
                  ))}
                </ul>
                {r?.explanation && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">{r.explanation}</p>}
              </div>
            );
          })}
        </div>
      ) : !passed && canRetry ? (
        <p className="px-1 text-xs text-gray-500">Correct answers are shown once you pass or use all your attempts.</p>
      ) : null}
    </div>
  );
}
