// A quiz inside the student lesson view -- graded on the server. Correct
// answers only arrive after a pass or once every attempt is used.
import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { learningServer, type Completion, type QuizQuestion, type QuizState, type QuizSubmitResult, type ViewerItem } from '../../lib/learningServer';
import { QuizIntro, QuizQuestions, QuizResult, type QuizReview } from './QuizViews';

type Phase =
  | { kind: 'intro' }
  | { kind: 'loading' }
  | { kind: 'taking'; attemptId: string; questions: QuizQuestion[] }
  | { kind: 'result'; result: QuizSubmitResult; questions: QuizQuestion[]; answers: Record<string, string> }
  | { kind: 'review'; questions: QuizQuestion[]; review: QuizReview[]; answers: Record<string, string>; score: number; passed: boolean };

export function StudentQuiz({ courseId, userId, item, state, onChanged, onNext, nextLabel }: {
  courseId: string; userId: string; item: ViewerItem; state: QuizState | undefined;
  onChanged: (state: QuizState, completion: Completion | null) => void;
  onNext?: () => void; nextLabel?: string;
}) {
  const quiz = item.quiz!;
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const used = state?.attemptsUsed ?? 0, allowed = state?.attemptsAllowed ?? quiz.maxAttempts;

  useEffect(() => { setPhase({ kind: 'intro' }); setAnswers({}); setError(null); }, [item.id]);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const start = async (retake = false) => {
    setError(null);
    setPhase({ kind: 'loading' });
    try {
      const r = await learningServer.quizStart(courseId, item.id, userId, retake);
      setAnswers(r.answers ?? {});
      setPhase({ kind: 'taking', attemptId: r.attemptId, questions: r.questions });
    } catch (e: any) {
      setError(e?.message || 'Could not start the quiz');
      setPhase({ kind: 'intro' });
    }
  };

  const openReview = async () => {
    setError(null);
    setPhase({ kind: 'loading' });
    try {
      const r = await learningServer.quizReview(courseId, item.id, userId);
      setPhase({ kind: 'review', questions: r.questions, review: r.review, answers: r.lastAttempt?.answers ?? {}, score: r.lastAttempt?.score ?? 0, passed: !!r.lastAttempt?.passed });
    } catch (e: any) {
      setError(e?.message || 'Could not load the answers');
      setPhase({ kind: 'intro' });
    }
  };

  // Answers are saved during the attempt (debounced), so a refresh or a
  // dropped connection doesn't lose them.
  const answer = (attemptId: string, qid: string, oid: string) => {
    const next = { ...answers, [qid]: oid };
    setAnswers(next);
    setSaving('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      learningServer.quizAnswer(attemptId, userId, next).then(() => setSaving('saved'), () => setSaving('error'));
    }, 500);
  };

  const submit = async (attemptId: string, questions: QuizQuestion[]) => {
    clearTimeout(saveTimer.current);
    setSubmitting(true);
    setError(null);
    try {
      const result = await learningServer.quizSubmit(attemptId, userId, answers);
      setPhase({ kind: 'result', result, questions, answers });
      onChanged(result.state, result.completion);
    } catch (e: any) {
      setError(e?.message || 'Could not submit -- your answers are saved, try again');
    }
    setSubmitting(false);
  };

  if (phase.kind === 'loading') return <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading quiz…</div>;

  if (phase.kind === 'taking') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-black text-gray-900">{item.title}</p>
        {error && <ErrorNote message={error} />}
        <QuizQuestions questions={phase.questions} answers={answers} onAnswer={(q, o) => answer(phase.attemptId, q, o)}
          onSubmit={() => submit(phase.attemptId, phase.questions)} submitting={submitting}
          saveNote={saving === 'saving' ? '· Saving…' : saving === 'saved' ? '· Saved' : saving === 'error' ? <span className="text-red-600">· Couldn’t save -- keep going, we’ll retry on submit</span> : null} />
      </div>
    );
  }

  if (phase.kind === 'result') {
    const r = phase.result;
    return (
      <QuizResult score={r.score} passed={r.passed} correctCount={r.correctCount} questionCount={r.questionCount} passingScore={quiz.passingScore}
        questions={phase.questions} answers={phase.answers} review={r.review} attemptsAllowed={r.state.attemptsAllowed} attemptsUsed={r.state.attemptsUsed}
        onRetry={() => start()} onContinue={onNext} continueLabel={nextLabel} />
    );
  }

  if (phase.kind === 'review') {
    return (
      <QuizResult score={phase.score} passed={phase.passed} correctCount={phase.review.filter(x => x.correctOptionId && phase.answers[x.questionId] === x.correctOptionId).length}
        questionCount={phase.questions.length} passingScore={quiz.passingScore} questions={phase.questions} answers={phase.answers} review={phase.review}
        attemptsAllowed={state?.attemptsAllowed ?? null} attemptsUsed={used} onContinue={onNext} continueLabel={nextLabel} />
    );
  }

  const exhausted = !!state?.exhausted;
  const passed = !!state?.passed;
  return (
    <div className="space-y-3">
      {error && <ErrorNote message={error} onRetry={() => start()} />}
      <QuizIntro title={item.title} instructions={quiz.instructions} passingScore={quiz.passingScore} questionCount={quiz.questionCount}
        attemptsAllowed={allowed} attemptsUsed={used} bestScore={state?.bestScore ?? null} required={quiz.required}
        onStart={passed || exhausted ? undefined : () => start()}
        startLabel={state?.inProgressAttemptId ? 'Resume quiz' : used ? 'Try again' : 'Start quiz'}
        disabledReason={exhausted ? `You’ve used all your attempts${quiz.required ? '. Your instructor can grant you another one.' : '.'}` : null}
        footer={(passed || exhausted) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {passed && <p className="w-full rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Passed with {state?.bestScore}%</p>}
            <button type="button" onClick={openReview} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50">See answers</button>
            {passed && <button type="button" onClick={() => start(true)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100">Retake</button>}
            {onNext && <button type="button" onClick={onNext} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700">{nextLabel}</button>}
          </div>
        )} />
    </div>
  );
}

function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="flex items-center gap-1 text-xs font-bold"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>}
    </div>
  );
}
