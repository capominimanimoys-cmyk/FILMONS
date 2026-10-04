// Quiz editor (full-screen panel over the outline): settings, questions
// (multiple choice with one correct answer, or true/false) and a
// "Preview quiz" that runs the student experience against the draft.
import { useState } from 'react';
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, Plus, Trash2, X } from 'lucide-react';
import { newQuestion, quizProblems, uid, type DocQuestion, type DocQuiz } from '../../../lib/courseBuilder';
import { Card, Field, Segmented, StatusPill, Toggle, inputCls } from './BuilderUI';
import { QuizIntro, QuizQuestions, QuizResult } from '../QuizViews';
import type { CourseBuilderState } from './useCourseBuilder';

export function QuizEditor({ b, quiz, onClose }: { b: CourseBuilderState; quiz: DocQuiz; onClose: () => void }) {
  const [preview, setPreview] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const patch = (p: Partial<DocQuiz>) => b.setDoc(d => ({
    ...d, sections: d.sections.map(s => ({ ...s, items: s.items.map(i => (i.id === quiz.id && i.kind === 'quiz' ? { ...i, ...p } : i)) })),
  }));
  const setQuestions = (questions: DocQuestion[]) => patch({ questions });
  const patchQ = (id: string, p: Partial<DocQuestion>) => setQuestions(quiz.questions.map(q => (q.id === id ? { ...q, ...p } : q)));
  const moveQ = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= quiz.questions.length) return;
    const next = [...quiz.questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
  };
  const duplicateQ = (i: number) => {
    const q = quiz.questions[i];
    const map = new Map(q.options.map(o => [o.id, uid()]));
    const copy: DocQuestion = { ...q, id: uid(), options: q.options.map(o => ({ ...o, id: map.get(o.id)! })), correctOptionId: q.correctOptionId ? map.get(q.correctOptionId) ?? null : null };
    const next = [...quiz.questions];
    next.splice(i + 1, 0, copy);
    setQuestions(next);
  };
  const problems = quizProblems(quiz);
  const unlimited = quiz.maxAttempts === null;

  const close = () => {
    // Leaving with problems is allowed (the draft keeps them); show them once.
    if (problems.length && !showProblems) { setShowProblems(true); return; }
    onClose();
  };

  if (preview) return <QuizPreview quiz={quiz} onClose={() => setPreview(false)} />;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-gray-50" role="dialog" aria-modal="true" aria-label="Quiz editor">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-100 bg-white px-3 py-2.5 sm:px-6" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <button type="button" onClick={onClose} aria-label="Back to outline" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-gray-600 hover:bg-gray-100">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Outline</span>
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-black text-gray-900">{quiz.isFinal ? 'Final quiz' : 'Quiz'}</p>
        <StatusPill state={problems.length ? 'Incomplete' : 'Ready'} />
        <button type="button" onClick={() => setPreview(true)} disabled={!quiz.questions.length} aria-label="Preview quiz"
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Preview quiz</span>
        </button>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-16">
        <Card className="space-y-5">
          <Field label="Quiz title" htmlFor="qz-title">
            <input id="qz-title" autoFocus={!quiz.title} value={quiz.title} maxLength={120} onChange={e => patch({ title: e.target.value })} placeholder="e.g. Lighting basics check" className={inputCls} />
          </Field>
          <Field label="Instructions" optional htmlFor="qz-ins">
            <textarea id="qz-ins" rows={2} value={quiz.instructions} onChange={e => patch({ instructions: e.target.value })} className={`${inputCls} resize-y`} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Passing score" htmlFor="qz-pass" hint="Every question is worth the same. Score is a percentage.">
              <div className="flex items-center gap-2">
                <input id="qz-pass" type="number" min={1} max={100} value={quiz.passingScore}
                  onChange={e => patch({ passingScore: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} className={`${inputCls} w-24`} />
                <span className="text-sm font-bold text-gray-500">%</span>
              </div>
            </Field>
            <Field label="Attempts">
              <Segmented ariaLabel="Attempts" value={unlimited ? 'unlimited' : 'limited'}
                options={[{ id: 'unlimited', label: 'Unlimited' }, { id: 'limited', label: 'Limited' }]}
                onChange={v => patch({ maxAttempts: v === 'unlimited' ? null : 3 })} />
              {!unlimited && (
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" min={1} max={20} value={quiz.maxAttempts ?? 1} aria-label="Attempt limit"
                    onChange={e => patch({ maxAttempts: Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))) })} className={`${inputCls} w-24`} />
                  <span className="text-sm text-gray-500">attempts</span>
                </div>
              )}
            </Field>
          </div>
          <Toggle checked={quiz.required} onChange={required => patch({ required })} label="Passing required for course completion"
            description="When off, the quiz is optional practice and doesn't block completion or the certificate." />
        </Card>

        {(showProblems || quiz.questions.length > 0) && problems.length > 0 && (
          <div data-pop className="rounded-2xl border border-amber-200 bg-amber-50 p-4" role="alert">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertCircle className="h-4 w-4" /> Finish this quiz before publishing</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-6 text-xs text-amber-900">{problems.map(p => <li key={p}>{p}</li>)}</ul>
            {showProblems && <button type="button" onClick={onClose} className="mt-2 text-xs font-bold text-amber-900 underline">Back to outline anyway</button>}
          </div>
        )}

        {quiz.questions.map((q, i) => (
          <Card key={q.id} className="space-y-3">
            <div className="flex items-center gap-1">
              <p className="flex-1 text-[11px] font-black uppercase tracking-wide text-gray-400">
                Question {i + 1} · {q.type === 'true_false' ? 'True or false' : 'Multiple choice'}
              </p>
              <button type="button" onClick={() => moveQ(i, -1)} disabled={i === 0} aria-label="Move question up" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => moveQ(i, 1)} disabled={i === quiz.questions.length - 1} aria-label="Move question down" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => duplicateQ(i)} aria-label="Duplicate question" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><Copy className="h-4 w-4" /></button>
              <button type="button" onClick={() => setQuestions(quiz.questions.filter(x => x.id !== q.id))} aria-label="Delete question" className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
            <textarea value={q.prompt} rows={2} onChange={e => patchQ(q.id, { prompt: e.target.value })} placeholder="Question" aria-label={`Question ${i + 1} text`} className={`${inputCls} resize-y font-semibold`} />
            <div className="space-y-2" role="radiogroup" aria-label={`Correct answer for question ${i + 1}`}>
              <p className="text-xs font-semibold text-gray-500">Answers -- select the correct one</p>
              {q.options.map((o, oi) => (
                <div key={o.id} className="flex items-center gap-2">
                  <input type="radio" name={`correct-${q.id}`} checked={q.correctOptionId === o.id} onChange={() => patchQ(q.id, { correctOptionId: o.id })}
                    aria-label={`Mark answer ${oi + 1} correct`} className="h-4 w-4 shrink-0 accent-emerald-600" />
                  {q.type === 'true_false' ? (
                    <span className={`flex-1 rounded-xl border px-3.5 py-2 text-sm ${q.correctOptionId === o.id ? 'border-emerald-300 bg-emerald-50 font-bold text-emerald-800' : 'border-gray-200 text-gray-700'}`}>{o.text}</span>
                  ) : (
                    <input value={o.text} onChange={e => patchQ(q.id, { options: q.options.map(x => (x.id === o.id ? { ...x, text: e.target.value } : x)) })}
                      placeholder={`Answer ${oi + 1}`} aria-label={`Answer ${oi + 1}`}
                      className={`${inputCls} !py-2 ${q.correctOptionId === o.id ? '!border-emerald-300 !bg-emerald-50' : ''}`} />
                  )}
                  {q.type === 'multiple_choice' && q.options.length > 2 && (
                    <button type="button" onClick={() => patchQ(q.id, { options: q.options.filter(x => x.id !== o.id), correctOptionId: q.correctOptionId === o.id ? null : q.correctOptionId })}
                      aria-label={`Remove answer ${oi + 1}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
              {q.type === 'multiple_choice' && q.options.length < 6 && (
                <button type="button" onClick={() => patchQ(q.id, { options: [...q.options, { id: uid(), text: '' }] })} className="flex items-center gap-1 pl-6 text-xs font-bold text-blue-600 hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add answer
                </button>
              )}
              {!q.correctOptionId && <p className="pl-6 text-xs font-semibold text-red-600">Select the correct answer</p>}
            </div>
            <textarea value={q.explanation} rows={2} onChange={e => patchQ(q.id, { explanation: e.target.value })} placeholder="Explanation shown after the quiz (optional)"
              aria-label={`Explanation for question ${i + 1}`} className={`${inputCls} resize-y text-xs`} />
          </Card>
        ))}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setQuestions([...quiz.questions, newQuestion('multiple_choice')])} className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:border-blue-300 hover:text-blue-700">
            <Plus className="h-4 w-4" /> Multiple choice
          </button>
          <button type="button" onClick={() => setQuestions([...quiz.questions, newQuestion('true_false')])} className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:border-blue-300 hover:text-blue-700">
            <Plus className="h-4 w-4" /> True or false
          </button>
        </div>

        <button type="button" onClick={close} className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700">Save quiz</button>
      </div>
    </div>
  );
}

/** The student experience against the draft -- graded locally, nothing saved. */
function QuizPreview({ quiz, onClose }: { quiz: DocQuiz; onClose: () => void }) {
  const [phase, setPhase] = useState<'intro' | 'taking' | 'result'>('intro');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState(0);
  const questions = quiz.questions.map(q => ({ id: q.id, prompt: q.prompt || 'Untitled question', options: q.options.map(o => ({ id: o.id, text: o.text || '(empty answer)' })) }));
  const correct = quiz.questions.filter(q => q.correctOptionId && answers[q.id] === q.correctOptionId).length;
  const score = quiz.questions.length ? Math.round((correct / quiz.questions.length) * 100) : 0;
  const passed = score >= quiz.passingScore;
  const exhausted = !passed && quiz.maxAttempts !== null && attempts >= quiz.maxAttempts;

  return (
    <div className="fixed inset-0 z-[65] overflow-y-auto bg-gray-50" role="dialog" aria-modal="true" aria-label="Quiz preview">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-violet-100 bg-violet-50 px-3 py-2.5 sm:px-6" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <Eye className="h-4 w-4 text-violet-700" />
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-violet-900">Preview -- what students see. Nothing is saved.</p>
        <button type="button" onClick={onClose} className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-gray-800 border border-violet-200">Close preview</button>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-5 pb-16">
        {phase === 'intro' && (
          <QuizIntro title={quiz.title} instructions={quiz.instructions || null} passingScore={quiz.passingScore} questionCount={quiz.questions.length}
            attemptsAllowed={quiz.maxAttempts} attemptsUsed={attempts} bestScore={null} required={quiz.required}
            onStart={() => { setAnswers({}); setPhase('taking'); }} startLabel="Start quiz" />
        )}
        {phase === 'taking' && (
          <QuizQuestions questions={questions} answers={answers} onAnswer={(q, o) => setAnswers(a => ({ ...a, [q]: o }))}
            onSubmit={() => { setAttempts(n => n + 1); setPhase('result'); }} />
        )}
        {phase === 'result' && (
          <QuizResult score={score} passed={passed} correctCount={correct} questionCount={quiz.questions.length} passingScore={quiz.passingScore}
            questions={questions} answers={answers}
            review={passed || exhausted ? quiz.questions.map(q => ({ questionId: q.id, correctOptionId: q.correctOptionId, explanation: q.explanation || null })) : null}
            attemptsAllowed={quiz.maxAttempts} attemptsUsed={attempts}
            onRetry={() => { setAnswers({}); setPhase('taking'); }} onContinue={onClose} continueLabel="Back to editor" />
        )}
      </div>
    </div>
  );
}
