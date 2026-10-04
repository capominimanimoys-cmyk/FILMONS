// FILMONS Learning -- Create course flow.
//   /create                                   -> creates a draft, opens the builder
//   /instructor/course/:courseId/edit?step=N  -> the 8-step builder
// Professional and Business accounts only. Drafts save automatically; the
// instructor can leave at any point and resume later from the Instructor
// dashboard. Lives inside LearningLayout, so the navigation drawer/sidebar
// stays available.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, Loader2, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canCreateCourses, createCourse } from '../lib/coursesApi';
import { STEPS, builderApi, checklist, type Problem } from '../lib/courseBuilder';
import { indexContentHashtags } from '../lib/hashtagsApi';
import { EmptyState, LearningPage, PageTitle, SignInPrompt } from '../components/learning/LearningPageParts';
import { useCourseBuilder, type CourseBuilderState } from '../components/learning/builder/useCourseBuilder';
import { StepBasics, StepOutcomes, StepPresentation } from '../components/learning/builder/StepsIntro';
import { StepLessons } from '../components/learning/builder/StepLessons';
import { StepCertificate, StepPricing, StepPublish, StepReview } from '../components/learning/builder/StepsFinish';
import { ConfirmDialog } from '../components/learning/builder/BuilderUI';
import { LayoutDashboard } from 'lucide-react';

function Gate({ children }: { children: (userId: string) => React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <LearningPage><PageTitle title="Create a course" /><SignInPrompt message="Log in with your FILMONS account to create a course." /></LearningPage>;
  if (!canCreateCourses(user.accountType)) {
    return (
      <LearningPage>
        <PageTitle title="Create a course" />
        <EmptyState icon={<LayoutDashboard className="h-9 w-9" />} title="For Professional and Business accounts"
          body="Upgrade your FILMONS account to Professional or Business to create and publish courses. Every account can buy and take courses." />
      </LearningPage>
    );
  }
  return <>{children(user.id)}</>;
}

// ── /create ───────────────────────────────────────────────────────────────
export function CreateCourseStart() {
  const [params] = useSearchParams();
  const legacyEdit = params.get('edit'); // old /create?edit=<id> links
  if (legacyEdit) return <Navigate to={`/instructor/course/${legacyEdit}/edit?step=1`} replace />;
  return <Gate>{() => <CreateDraft />}</Gate>;
}

function CreateDraft() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const started = useRef(false);
  const [error, setError] = useState(false);
  const create = useCallback(() => {
    if (!user) return;
    setError(false);
    createCourse(user.id, user.accountType, { title: 'Untitled course', level: 'all_levels' as any, price: 0, isFree: false })
      .then(c => { if (c) navigate(`/instructor/course/${c.id}/edit?step=1`, { replace: true }); else setError(true); })
      .catch(() => setError(true));
  }, [user, navigate]);
  useEffect(() => { if (!started.current) { started.current = true; create(); } }, [create]);
  return (
    <LearningPage>
      {error ? (
        <div data-pop className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
          <p className="text-sm font-bold text-red-700">We couldn’t start a new course.</p>
          <button onClick={create} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-800 border border-gray-200"><RotateCcw className="h-4 w-4" /> Try again</button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Creating your course…</div>
      )}
    </LearningPage>
  );
}

// ── /instructor/course/:courseId/edit ─────────────────────────────────────
export function CourseBuilder() {
  return <Gate>{userId => <Builder userId={userId} />}</Gate>;
}

export function SaveStatus({ b }: { b: CourseBuilderState }) {
  if (b.saveState === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold text-red-600" role="status">
        <AlertCircle className="h-3.5 w-3.5" /> Changes could not be saved
        <button type="button" onClick={() => b.saveNow()} className="underline">Retry</button>
      </span>
    );
  }
  if (b.saveState === 'saving') return <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>;
  if (b.saveState === 'saved') return <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500" role="status"><Cloud className="h-3.5 w-3.5" /> Saved</span>;
  return null;
}

function Builder({ userId }: { userId: string }) {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const b = useCourseBuilder(courseId, userId);
  const step = Math.min(8, Math.max(1, Number(params.get('step')) || 1));
  const [publishing, setPublishing] = useState(false);
  const [serverProblems, setServerProblems] = useState<Problem[] | null>(null);
  const [leaving, setLeaving] = useState(false);
  const pendingFocus = useRef<string | null>(null);
  const instructorName = user?.name || user?.username || 'Instructor';

  const goTo = useCallback((n: number, target?: string) => {
    pendingFocus.current = target ?? null;
    setParams(p => { const q = new URLSearchParams(p); q.set('step', String(n)); return q; }, { replace: false });
    if (!target) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setParams]);

  // After a "Fix" jump, scroll to and focus the field that needs attention.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    requestAnimationFrame(() => {
      const el = document.getElementById(`field-${target}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.querySelector<HTMLElement>('input, textarea, select, button')?.focus({ preventScroll: true });
      el.classList.add('ring-2', 'ring-amber-300');
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-300'), 1600);
    });
  }, [step]);

  useEffect(() => { setServerProblems(null); }, [b.doc]);

  const exit = async (force = false) => {
    const uploading = Object.values(b.uploads).some(u => u.status === 'uploading');
    if (uploading && !force) { setLeaving(true); return; }
    const ok = await b.saveNow();
    if (!ok) { toast.error('Changes could not be saved', { description: 'Check your connection and try again -- your work is still here.' }); return; }
    navigate(`/instructor/course/${courseId}`);
  };

  const publish = async () => {
    if (!courseId || !b.doc) return;
    setPublishing(true);
    setServerProblems(null);
    try {
      if (!(await b.saveNow())) throw new Error('Changes could not be saved');
      const r = await builderApi.publish(courseId, userId);
      const d = b.doc;
      indexContentHashtags('course', courseId, `${d.basics.title} ${d.basics.shortDescription} ${d.presentation.description} ${d.basics.topics.map(t => `#${t}`).join(' ')}`).catch(() => {});
      toast.success(r.firstPublish ? 'Your course is live' : 'Changes published');
      navigate(`/instructor/course/${courseId}?published=1`);
    } catch (e: any) {
      if (e?.data?.problems) setServerProblems(e.data.problems);
      else toast.error(e?.message || 'Could not publish');
    } finally {
      setPublishing(false);
    }
  };

  if (b.loadState === 'loading') return <div className="flex items-center justify-center gap-2 py-32 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading your course…</div>;
  if (b.loadState === 'error' || !b.doc) {
    return (
      <LearningPage>
        <div data-pop className="rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
          <p className="text-sm font-bold text-red-700">{b.loadError}</p>
          <div className="mt-3 flex justify-center gap-2">
            <button onClick={() => b.reload()} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-800 border border-gray-200"><RotateCcw className="h-4 w-4" /> Retry</button>
            <button onClick={() => navigate('/instructor')} className="rounded-xl px-4 py-2 text-sm font-bold text-gray-600">Instructor dashboard</button>
          </div>
        </div>
      </LearningPage>
    );
  }

  const doc = b.doc;
  const problems = checklist(doc, { payoutReady: !!b.meta?.payoutReady });
  const stepsWithProblems = new Set(problems.map(p => p.step));
  const props = { b, doc, instructorName };

  return (
    <div className="pb-28">
      {/* Mobile: current step + progress */}
      {/* Sits just under the Learning header (also sticky on mobile). */}
      <div className="sticky z-10 border-b border-gray-100 bg-white px-4 py-2.5 lg:hidden" style={{ top: 'calc(max(10px, env(safe-area-inset-top)) + 51px)' }}>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs font-bold text-gray-500">Step {step} of 8 · <span className="text-gray-900">{STEPS[step - 1]}</span></p>
          <SaveStatus b={b} />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={1} aria-valuemax={8} aria-valuenow={step} aria-label="Course setup progress">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${(step / 8) * 100}%`, transition: 'width 250ms ease' }} />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-5 md:px-8">
        {/* Desktop: step list */}
        <aside className="sticky top-6 hidden h-fit w-60 shrink-0 lg:block">
          <p data-pop className="truncate text-sm font-black text-gray-900">{doc.basics.title || 'Untitled course'}</p>
          <div className="mt-1 mb-4"><SaveStatus b={b} /></div>
          <ol className="space-y-0.5">
            {STEPS.map((name, i) => {
              const n = i + 1, active = n === step, issue = stepsWithProblems.has(n);
              return (
                <li data-pop key={name}>
                  <button type="button" onClick={() => goTo(n)} aria-current={active ? 'step' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-bold ${active ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {n <= 6 && !issue && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                  </button>
                </li>
              );
            })}
          </ol>
          {b.meta?.course.status !== 'draft' && (
            <p className="mt-4 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">Editing a published course. Students see the current version until you select <b>Publish changes</b>.</p>
          )}
        </aside>

        <main className="min-w-0 max-w-2xl flex-1">
          {step === 1 && <StepBasics {...props} />}
          {step === 2 && <StepOutcomes {...props} />}
          {step === 3 && <StepPresentation {...props} />}
          {step === 4 && <StepLessons {...props} />}
          {step === 5 && <StepCertificate {...props} />}
          {step === 6 && <StepPricing {...props} />}
          {step === 7 && <StepReview {...props} goTo={goTo} />}
          {step === 8 && <StepPublish {...props} goTo={goTo} onPublish={publish} publishing={publishing} serverProblems={serverProblems} />}
        </main>
      </div>

      {/* Back / Save and exit / Continue */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-100 bg-white/95 backdrop-blur md:left-64" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 md:px-8">
          <button type="button" onClick={() => goTo(step - 1)} disabled={step === 1}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-30">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button type="button" onClick={() => exit()} className="ml-auto rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100">Save and exit</button>
          {step < 8 ? (
            <button type="button" onClick={() => goTo(step + 1)} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-700">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <span className="hidden items-center gap-1.5 px-2 text-xs font-semibold text-gray-500 sm:flex">
              {problems.length ? `${problems.length} to finish` : <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Ready</>}
            </span>
          )}
        </div>
      </div>

      {leaving && (
        <ConfirmDialog title="Uploads are still running" confirmLabel="Leave anyway" destructive
          body="If you leave now, files that are still uploading will be cancelled. Everything else is saved."
          onCancel={() => setLeaving(false)} onConfirm={() => { setLeaving(false); exit(true); }} />
      )}
    </div>
  );
}
