// FILMONS Learning -- Create live session flow (/create/live). Seven steps:
// details, format, availability, fee, meeting platform, application
// questions, review + publish. Professional and Business accounts only.
// Steps slide in (see .lp-slide-fwd in learning-pop.css); cards pop in.
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, ImagePlus, LayoutDashboard, Loader2, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canCreateCourses } from '../lib/coursesApi';
import {
  CURRENCIES, DAYS, DAY_LABEL, PLATFORM_LABEL, emptyLiveDraft, formatFee, liveProblems, publishLiveSession, uploadLiveCover,
  type LiveDraft,
} from '../lib/liveSessionsApi';
import { Card, Field, Segmented, StepHeading, Toggle, inputCls } from '../components/learning/builder/BuilderUI';
import { EmptyState, LearningPage, PageTitle, SignInPrompt } from '../components/learning/LearningPageParts';

const STEPS = ['Session details', 'Format', 'Availability', 'Session fee', 'Meeting platform', 'Application questions', 'Review and publish'];

export function LiveSessionBuilder() {
  const { user } = useAuth();
  if (!user) return <LearningPage><PageTitle title="Create a live session" /><SignInPrompt message="Log in with your FILMONS account to create a live session." /></LearningPage>;
  if (!canCreateCourses(user.accountType)) {
    return (
      <LearningPage>
        <PageTitle title="Create a live session" />
        <EmptyState icon={<LayoutDashboard className="h-9 w-9" />} title="For Professional and Business accounts"
          body="Upgrade your FILMONS account to Professional or Business to offer live sessions." />
      </LearningPage>
    );
  }
  return <Builder userId={user.id} accountType={user.accountType} />;
}

function Builder({ userId, accountType }: { userId: string; accountType: string }) {
  const navigate = useNavigate();
  const [d, setD] = useState<LiveDraft>(emptyLiveDraft);
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [tried, setTried] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof LiveDraft>(k: K, v: LiveDraft[K]) => setD(p => ({ ...p, [k]: v }));

  const problems = liveProblems(d);
  const stepProblems = (n: number) => problems.filter(p => p.step === n);
  const go = (n: number) => { setDir(n > step ? 'fwd' : 'back'); setStep(n); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const next = () => {
    if (stepProblems(step).length) { setTried(true); toast.error(stepProblems(step)[0].message); return; }
    setTried(false); go(step + 1);
  };

  const pickCover = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try { set('coverUrl', await uploadLiveCover(userId, f)); }
    catch (e: any) { toast.error(e?.message || 'Could not upload the cover'); }
    setUploading(false);
  };

  const publish = async () => {
    if (problems.length) { go(problems[0].step); setTried(true); return; }
    setPublishing(true);
    try {
      const id = await publishLiveSession(userId, accountType, d);
      toast.success('Your live session is published');
      navigate(`/live/${id}`, { replace: true });
    } catch (e: any) { toast.error(e?.message || 'Could not publish'); setPublishing(false); }
  };

  const err = (n: number, match: string) => (tried ? stepProblems(n).find(p => p.message.includes(match))?.message : undefined);
  const outcomes = d.learningOutcomes;

  return (
    <div className="pb-28">
      <div className="mx-auto max-w-2xl px-4 py-5 md:px-8">
        <div data-pop className="mb-5">
          <p className="text-xs font-bold text-gray-500">Step {step} of {STEPS.length} · <span className="text-gray-900">{STEPS[step - 1]}</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step}>
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${(step / STEPS.length) * 100}%`, transition: 'width 250ms ease' }} />
          </div>
        </div>

        <div key={step} className={dir === 'fwd' ? 'lp-slide-fwd' : 'lp-slide-back'}>
          {step === 1 && (
            <>
              <StepHeading title="Session details" subtitle="Tell students what you’ll teach." />
              <Card className="space-y-4">
                <Field label="Title" htmlFor="ls-title" error={err(1, 'title')}>
                  <input id="ls-title" value={d.title} maxLength={90} onChange={e => set('title', e.target.value)} placeholder="e.g. Colour grading your first short film" className={inputCls} />
                </Field>
                <Field label="Cover image" optional hint="JPG, PNG or WebP, up to 10 MB.">
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { pickCover(e.target.files?.[0]); e.target.value = ''; }} />
                  {d.coverUrl ? (
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-gray-100">
                      <img src={d.coverUrl} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => set('coverUrl', '')} aria-label="Remove cover" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                      className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50">
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                      {uploading ? 'Uploading…' : 'Upload cover image'}
                    </button>
                  )}
                </Field>
                <Field label="Description" htmlFor="ls-desc" error={err(1, 'description')}>
                  <textarea id="ls-desc" value={d.description} rows={5} onChange={e => set('description', e.target.value)} placeholder="What will you cover and who is it for?" className={inputCls} />
                </Field>
                <Field label="Topic" htmlFor="ls-topic" error={err(1, 'topic')}>
                  <input id="ls-topic" value={d.topic} onChange={e => set('topic', e.target.value)} placeholder="e.g. Cinematography" className={inputCls} />
                </Field>
                <Field label="Learning outcomes" hint="What will students be able to do afterwards?" error={err(1, 'outcome')}>
                  <div className="space-y-2">
                    {outcomes.map((o, i) => (
                      <div key={i} className="flex gap-2">
                        <input value={o} onChange={e => set('learningOutcomes', outcomes.map((x, j) => j === i ? e.target.value : x))} placeholder={`Outcome ${i + 1}`} className={inputCls} />
                        {outcomes.length > 1 && <button type="button" onClick={() => set('learningOutcomes', outcomes.filter((_, j) => j !== i))} aria-label="Remove outcome" className="shrink-0 rounded-xl px-2.5 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>}
                      </div>
                    ))}
                    {outcomes.length < 8 && <button type="button" onClick={() => set('learningOutcomes', [...outcomes, ''])} className="flex items-center gap-1.5 text-sm font-bold text-blue-600"><Plus className="h-4 w-4" /> Add outcome</button>}
                  </div>
                </Field>
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <StepHeading title="Format" subtitle="How will you teach this session?" />
              <Card className="space-y-4">
                <Field label="Session type">
                  <Segmented ariaLabel="Session type" value={d.format} onChange={v => setD(p => ({ ...p, format: v, maxParticipants: v === 'one_to_one' ? 1 : Math.max(p.maxParticipants, 2) }))}
                    options={[{ id: 'one_to_one', label: 'One-to-one' }, { id: 'small_group', label: 'Small group' }]} />
                </Field>
                <Field label="Duration" htmlFor="ls-dur">
                  <select id="ls-dur" value={d.durationMinutes} onChange={e => set('durationMinutes', Number(e.target.value))} className={inputCls}>
                    {[30, 45, 60, 90, 120, 180].map(m => <option key={m} value={m}>{m >= 60 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`}</option>)}
                  </select>
                </Field>
                <Field label="Language" htmlFor="ls-lang">
                  <input id="ls-lang" value={d.language} onChange={e => set('language', e.target.value)} className={inputCls} />
                </Field>
                {d.format === 'small_group' && (
                  <Field label="Maximum participants" htmlFor="ls-max" error={err(2, 'group')}>
                    <input id="ls-max" type="number" min={2} max={20} value={d.maxParticipants} onChange={e => set('maxParticipants', Math.min(20, Number(e.target.value) || 0))} className={inputCls} />
                  </Field>
                )}
              </Card>
            </>
          )}

          {step === 3 && (
            <>
              <StepHeading title="Availability" subtitle="When can students book you?" />
              <Card className="space-y-4">
                <Field label="Your timezone" htmlFor="ls-tz" error={err(3, 'timezone')}>
                  <input id="ls-tz" value={d.timezone} onChange={e => set('timezone', e.target.value)} placeholder="e.g. America/Toronto" className={inputCls} />
                </Field>
                <Field label="Available days" error={err(3, 'day')}>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map(day => {
                      const on = d.availableDays.includes(day);
                      return (
                        <button key={day} type="button" aria-pressed={on} onClick={() => set('availableDays', on ? d.availableDays.filter(x => x !== day) : [...d.availableDays, day])}
                          className={`rounded-full px-4 py-2 text-sm font-bold ${on ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}>{DAY_LABEL[day]}</button>
                      );
                    })}
                  </div>
                </Field>
                <Toggle checked={d.allowPreferredDate} onChange={v => set('allowPreferredDate', v)} label="Let students suggest a preferred date"
                  description="Students can propose a date when they apply. You still confirm the final time." />
              </Card>
            </>
          )}

          {step === 4 && (
            <>
              <StepHeading title="Session fee" subtitle="Choose whether this session is free or paid." />
              <Card className="space-y-4">
                <Segmented ariaLabel="Fee type" value={d.isFree ? 'free' : 'paid'} onChange={v => set('isFree', v === 'free')} options={[{ id: 'free', label: 'Free' }, { id: 'paid', label: 'Paid' }]} />
                {!d.isFree && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Amount" htmlFor="ls-price" error={err(4, 'fee')}>
                      <input id="ls-price" type="number" min={0} step="0.01" value={d.price || ''} onChange={e => set('price', Number(e.target.value) || 0)} placeholder="0.00" className={inputCls} />
                    </Field>
                    <Field label="Currency" htmlFor="ls-cur">
                      <select id="ls-cur" value={d.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
                    </Field>
                  </div>
                )}
                <p className="rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-900">{d.isFree ? 'Free session' : `${formatFee(d.price, d.currency)} per person, per session`}</p>
              </Card>
            </>
          )}

          {step === 5 && (
            <>
              <StepHeading title="Meeting platform" subtitle="Where will the session take place?" />
              <Card className="space-y-4">
                <Segmented ariaLabel="Meeting platform" value={d.platform} onChange={v => set('platform', v)} options={[{ id: 'zoom', label: 'Zoom' }, { id: 'teams', label: 'Microsoft Teams' }]} />
                <Field label={`${PLATFORM_LABEL[d.platform]} link`} optional htmlFor="ls-link" error={err(5, 'link')}
                  hint="Paste it now, or add it to each confirmed booking later. Only confirmed participants can see it.">
                  <input id="ls-link" type="url" value={d.meetingLink} onChange={e => set('meetingLink', e.target.value)} placeholder="https://" className={inputCls} />
                </Field>
              </Card>
            </>
          )}

          {step === 6 && (
            <>
              <StepHeading title="Application questions" subtitle="What should students tell you when they apply?" />
              <Card className="space-y-4">
                <Toggle checked={d.questions.goals} onChange={v => set('questions', { ...d.questions, goals: v })} label="Learning goals" description="What do they want to get out of the session?" />
                <Toggle checked={d.questions.experience} onChange={v => set('questions', { ...d.questions, experience: v })} label="Experience level" description="Beginner, intermediate or advanced." />
                <Toggle checked={d.questions.dates} disabled={!d.allowPreferredDate} onChange={v => set('questions', { ...d.questions, dates: v })} label="Preferred dates"
                  description={d.allowPreferredDate ? 'When would they like to take it?' : 'Turn on preferred dates in Availability to ask this.'} />
              </Card>
            </>
          )}

          {step === 7 && (
            <>
              <StepHeading title="Review and publish" subtitle="This is how your session will look to students." />
              <Card className="space-y-4">
                {d.coverUrl && <div className="aspect-video overflow-hidden rounded-xl bg-gray-100"><img src={d.coverUrl} alt="" className="h-full w-full object-cover" /></div>}
                <div>
                  <p className="text-lg font-black text-gray-900">{d.title || 'Untitled session'}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{d.topic}</p>
                </div>
                <p className="whitespace-pre-line text-sm text-gray-600">{d.description}</p>
                <ul className="space-y-1">{d.learningOutcomes.filter(o => o.trim()).map((o, i) => <li key={i} className="flex gap-2 text-sm text-gray-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{o}</li>)}</ul>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    ['Format', d.format === 'one_to_one' ? 'One-to-one' : `Small group · up to ${d.maxParticipants}`],
                    ['Duration', `${d.durationMinutes} min`],
                    ['Language', d.language],
                    ['Platform', PLATFORM_LABEL[d.platform]],
                    ['Timezone', d.timezone],
                    ['Days', d.availableDays.map(x => DAY_LABEL[x]).join(', ')],
                    ['Fee', d.isFree ? 'Free' : `${formatFee(d.price, d.currency)} per person, per session`],
                    ['Meeting link', d.meetingLink.trim() ? 'Added (confirmed participants only)' : 'Add per booking later'],
                  ].map(([k, v]) => <div key={k}><dt className="text-xs text-gray-400">{k}</dt><dd className="font-bold text-gray-900">{v}</dd></div>)}
                </dl>
              </Card>
              {problems.length > 0 && (
                <Card className="mt-3 border-amber-200 bg-amber-50">
                  <p className="text-sm font-black text-amber-900">{problems.length} to finish</p>
                  <ul className="mt-2 space-y-1">{problems.map((p, i) => <li key={i}><button type="button" onClick={() => go(p.step)} className="text-left text-sm font-semibold text-amber-900 underline">{p.message}</button></li>)}</ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-100 bg-white/95 backdrop-blur md:left-64" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3 md:px-8">
          <button type="button" onClick={() => step === 1 ? navigate('/instructor') : go(step - 1)} className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100">
            <ArrowLeft className="h-4 w-4" /> {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < STEPS.length ? (
            <button type="button" onClick={next} className="ml-auto flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-700">Continue <ArrowRight className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={publish} disabled={publishing} className="ml-auto flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
              {publishing && <Loader2 className="h-4 w-4 animate-spin" />} Publish live session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
