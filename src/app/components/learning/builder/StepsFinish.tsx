// Course builder steps 5-8: Completion and certificate, Price and access,
// Preview and review, Publish.
import { useState } from 'react';
import {
  AlertCircle, Award, BadgeCheck, CheckCircle2, ChevronRight, ClipboardCheck, Clock, Lock, PlayCircle, ShieldCheck, Video, Wallet,
} from 'lucide-react';
import {
  CURRENCIES, LEVELS, checklist, courseVideoSeconds, formatDuration, formatDurationWords, type CourseDoc, type Problem,
} from '../../../lib/courseBuilder';
import { useLearningTransition } from '../../../context/LearningTransitionContext';
import { CertificateView } from '../CertificateView';
import { Card, Field, StepHeading, Toggle, inputCls } from './BuilderUI';
import type { CourseBuilderState } from './useCourseBuilder';

type StepProps = { b: CourseBuilderState; doc: CourseDoc; instructorName: string };

const money = (n: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);

// ── 5. Completion and certificate ────────────────────────────────────────
export function StepCertificate({ b, doc, instructorName }: StepProps) {
  const required = doc.sections.flatMap(s => s.items).filter(i => i.kind !== 'quiz' || i.required);
  const videos = required.filter(i => i.kind !== 'quiz').length, quizzes = required.length - videos;
  return (
    <div className="space-y-4">
      <StepHeading title="Completion and certificate" subtitle="Decide what students receive when they finish." />
      <Card className="space-y-3">
        <p className="text-sm font-bold text-gray-900">How students complete this course</p>
        <ul className="space-y-2 text-sm text-gray-600">
          <li data-pop className="flex gap-2"><Video className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> Watch at least 90% of every video lesson{videos ? ` (${videos})` : ''}. Opening a lesson alone doesn’t count.</li>
          <li data-pop className="flex gap-2"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" /> Pass every required quiz{quizzes ? ` (${quizzes})` : ''}. Optional quizzes don’t block completion.</li>
        </ul>
      </Card>
      <Card className="space-y-4">
        <Toggle checked={doc.certificate.enabled} onChange={enabled => b.setDoc(d => ({ ...d, certificate: { enabled } }))}
          label="Issue a certificate of completion"
          description="Issued automatically -- once per student -- when they meet every requirement. Each certificate has a unique ID and a public verification page." />
        {doc.certificate.enabled && (
          <>
            <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
              <CertificateView sample data={{
                studentName: 'Student’s full name', courseTitle: doc.basics.title || 'Your course title',
                instructorName: instructorName || 'Instructor name', completedAt: new Date().toISOString(), code: 'FLM-XXXX-XXXX',
              }} />
            </div>
            <p className="text-xs leading-relaxed text-gray-500">
              Labelled “Certificate of completion”. It confirms the student finished your course on FILMONS Learning; it doesn’t claim accreditation.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

// ── 6. Price and access ──────────────────────────────────────────────────
export function StepPricing({ b, doc }: StepProps) {
  const { leaveLearning } = useLearningTransition();
  const pr = doc.pricing;
  const set = (patch: Partial<CourseDoc['pricing']>) => b.setDoc(d => ({ ...d, pricing: { ...d.pricing, ...patch } }));
  const feeBps = b.meta?.platformFeeBps ?? 800;
  const fee = Math.round(pr.price * feeBps) / 10000;
  const payoutReady = !!b.meta?.payoutReady;
  return (
    <div className="space-y-4">
      <StepHeading title="Price and access" subtitle="Purchasing gives access to the full course. Free preview lessons stay open to everyone before purchase." />
      <div className="grid gap-3 sm:grid-cols-2" id="field-pricing" role="radiogroup" aria-label="Price">
        {[{ free: true, title: 'Free', body: 'Anyone with a FILMONS account can enroll.' }, { free: false, title: 'Paid', body: 'Students buy once for lifetime access to the full course.' }].map(o => (
          <button key={o.title} type="button" role="radio" aria-checked={pr.isFree === o.free} onClick={() => set({ isFree: o.free })}
            data-pop className={`rounded-2xl border-2 bg-white p-4 text-left transition-colors ${pr.isFree === o.free ? 'border-blue-600' : 'border-gray-100 hover:border-gray-200'}`}>
            <p className="text-base font-black text-gray-900">{o.title}</p>
            <p className="mt-1 text-xs text-gray-500">{o.body}</p>
          </button>
        ))}
      </div>
      {pr.isFree === false && (
        <Card className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label="Price" htmlFor="pr-price" id="field-price">
              <input id="pr-price" type="number" min={1} max={10000} step="0.01" value={pr.price || ''} placeholder="49.00"
                onChange={e => set({ price: Math.max(0, Math.round((Number(e.target.value) || 0) * 100) / 100) })} className={inputCls} />
            </Field>
            <Field label="Currency" htmlFor="pr-cur" id="field-currency">
              <select id="pr-cur" value={pr.currency} onChange={e => set({ currency: e.target.value })} className={inputCls}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="rounded-xl bg-gray-50 p-4 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Price</span><span className="font-bold">{money(pr.price || 0, pr.currency)}</span></div>
            <div className="mt-1 flex justify-between"><span className="text-gray-500">FILMONS platform fee ({feeBps / 100}%)</span><span className="font-bold">− {money(fee, pr.currency)}</span></div>
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2"><span className="font-bold text-gray-900">Estimated earnings per sale</span><span className="font-black text-emerald-700">{money(Math.max(0, (pr.price || 0) - fee), pr.currency)}</span></div>
            <p className="mt-2 text-xs text-gray-400">Before payment processing and taxes, which can vary.</p>
          </div>
          <div id="field-payout" className={`flex items-start gap-3 rounded-xl p-4 ${payoutReady ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <Wallet className={`mt-0.5 h-5 w-5 shrink-0 ${payoutReady ? 'text-emerald-600' : 'text-amber-600'}`} />
            <div className="min-w-0 text-sm">
              <p className="font-bold text-gray-900">{payoutReady ? 'Payout setup is complete' : 'Payout setup required'}</p>
              <p className="mt-0.5 text-xs text-gray-600">{payoutReady ? 'Your earnings will be paid out to your FILMONS wallet payout method.' : 'You need a payout method on FILMONS before you can publish a paid course. Your draft is saved.'}</p>
              {!payoutReady && (
                <button type="button" onClick={async () => { await b.saveNow(); leaveLearning('/wallet/payout-method'); }} className="mt-2 text-xs font-black text-blue-600 hover:underline">Set up payouts on FILMONS</button>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 7. Preview and review ────────────────────────────────────────────────
export function StepReview({ b, doc, instructorName, goTo }: StepProps & { goTo: (step: number, target?: string) => void }) {
  const problems = checklist(doc, { payoutReady: !!b.meta?.payoutReady });
  return (
    <div className="space-y-4">
      <StepHeading title="Preview and review" subtitle="This is how students will see your course." />
      <Checklist problems={problems} goTo={goTo} />
      <CoursePreview doc={doc} instructorName={instructorName} />
    </div>
  );
}

export function Checklist({ problems, goTo }: { problems: Problem[]; goTo: (step: number, target?: string) => void }) {
  if (!problems.length) {
    return (
      <div data-pop className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        <div>
          <p className="text-sm font-black text-emerald-900">Ready to publish</p>
          <p className="text-xs text-emerald-800">Everything required is in place.</p>
        </div>
      </div>
    );
  }
  return (
    <div data-pop className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-black text-amber-900"><AlertCircle className="h-4 w-4" /> {problems.length} thing{problems.length === 1 ? '' : 's'} to finish before publishing</p>
      <ul className="mt-2 divide-y divide-amber-100">
        {problems.map((p, i) => (
          <li key={i}>
            <button type="button" onClick={() => goTo(p.step, p.target)} className="flex w-full items-center gap-2 py-2 text-left text-sm text-amber-950 hover:underline">
              <span className="min-w-0 flex-1">{p.message}</span>
              <span className="shrink-0 text-xs font-bold text-amber-700">Fix</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-amber-600" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CoursePreview({ doc, instructorName }: { doc: CourseDoc; instructorName: string }) {
  const total = courseVideoSeconds(doc);
  const lessons = doc.sections.flatMap(s => s.items);
  const level = LEVELS.find(l => l.id === doc.basics.level)?.label;
  const pr = doc.pricing;
  return (
    <div data-pop className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
      <div className="relative bg-black" style={{ aspectRatio: '16/9' }}>
        {doc.presentation.introVideoUrl && doc.presentation.introVideoStatus === 'ready'
          ? <video src={doc.presentation.introVideoUrl} poster={doc.presentation.coverUrl || undefined} controls playsInline className="h-full w-full object-contain" />
          : doc.presentation.coverVideoUrl ? <video src={doc.presentation.coverVideoUrl} poster={doc.presentation.coverUrl || undefined} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          : doc.presentation.coverUrl ? <img src={doc.presentation.coverUrl} alt="" className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-sm text-white/50">No cover yet</div>}
      </div>
      <div className="space-y-5 p-4 sm:p-6">
        <div>
          {doc.basics.category && <p className="text-xs font-bold uppercase tracking-wide text-blue-600">{doc.basics.category}</p>}
          <h2 className="mt-1 text-xl font-black text-gray-900">{doc.basics.title || 'Untitled course'}</h2>
          {doc.basics.shortDescription && <p className="mt-1 text-sm text-gray-600">{doc.basics.shortDescription}</p>}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>By <span className="font-bold text-gray-800">{instructorName}</span></span>
            {level && <span>{level}</span>}
            <span>{doc.basics.language}</span>
            {total > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDurationWords(total)}</span>}
            {doc.certificate.enabled && <span className="flex items-center gap-1 font-semibold text-blue-700"><Award className="h-3 w-3" /> Certificate of completion</span>}
          </div>
          {doc.basics.topics.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{doc.basics.topics.map(t => <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">#{t}</span>)}</div>}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
          <span className="text-lg font-black text-gray-900">{pr.isFree ? 'Free' : pr.isFree === false ? money(pr.price || 0, pr.currency) : 'Price not set'}</span>
          <span className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white">{pr.isFree === false ? 'Buy course' : 'Enroll'}</span>
        </div>
        {doc.outcomes.outcomes.some(o => o.text.trim()) && (
          <div>
            <p className="text-sm font-black text-gray-900">What you’ll learn</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">{doc.outcomes.outcomes.filter(o => o.text.trim()).map(o => (
              <li data-pop key={o.id} className="flex gap-2 text-sm text-gray-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{o.text}</li>
            ))}</ul>
          </div>
        )}
        {[['Who this course is for', doc.outcomes.audience], ['Prerequisites', doc.outcomes.prerequisites], ['Tools you’ll need', doc.outcomes.tools]].filter(([, v]) => v.trim()).map(([k, v]) => (
          <div key={k}><p className="text-sm font-black text-gray-900">{k}</p><p className="mt-1 whitespace-pre-line text-sm text-gray-600">{v}</p></div>
        ))}
        {doc.presentation.description && <div><p className="text-sm font-black text-gray-900">About this course</p><p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-gray-600">{doc.presentation.description}</p></div>}
        <div>
          <p className="text-sm font-black text-gray-900">Course content</p>
          <p className="text-xs text-gray-500">{doc.sections.length} sections · {lessons.filter(i => i.kind !== 'quiz').length} lessons · {lessons.filter(i => i.kind === 'quiz').length} quizzes</p>
          <div className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">
            {doc.sections.map(s => (
              <div key={s.id} className="p-3">
                <p className="text-sm font-bold text-gray-900">{s.title || 'Untitled section'}</p>
                {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                <ul className="mt-1.5 space-y-1">
                  {s.items.map(i => (
                    <li data-pop key={i.id} className="flex items-center gap-2 text-sm text-gray-700">
                      {i.kind === 'quiz' ? <ClipboardCheck className="h-4 w-4 shrink-0 text-violet-600" /> : i.isPreview ? <PlayCircle className="h-4 w-4 shrink-0 text-emerald-600" /> : <Lock className="h-4 w-4 shrink-0 text-gray-300" />}
                      <span className="min-w-0 flex-1 truncate">{i.title || 'Untitled'}</span>
                      {i.kind !== 'quiz' && i.isPreview && <span className="text-xs font-bold text-emerald-600">Preview</span>}
                      {i.kind === 'quiz' && <span className="text-xs text-gray-400">{i.questions.length} questions{i.isFinal ? ' · Final' : ''}</span>}
                      {i.kind === 'video' && i.durationSeconds > 0 && <span className="text-xs text-gray-400">{formatDuration(i.durationSeconds)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 8. Publish ───────────────────────────────────────────────────────────
export function StepPublish({ b, doc, goTo, onPublish, publishing, serverProblems }: StepProps & {
  goTo: (step: number, target?: string) => void; onPublish: () => void; publishing: boolean; serverProblems: Problem[] | null;
}) {
  const [confirmed, setConfirmed] = useState(!!b.meta?.course.ownershipConfirmedAt && b.meta?.course.status !== 'draft');
  const problems = serverProblems ?? checklist(doc, { payoutReady: !!b.meta?.payoutReady });
  const published = b.meta?.course.status !== 'draft';
  const blockedByUploads = Object.values(b.uploads).some(u => u.status === 'uploading');
  return (
    <div className="space-y-4">
      <StepHeading title={published ? 'Publish changes' : 'Publish'}
        subtitle={published ? 'Your edits stay a draft until you publish them. Students keep their progress and certificates.' : 'Published courses appear in search, recommendations and topic pages.'} />
      <Checklist problems={problems} goTo={goTo} />
      <Card className="space-y-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
          <span className="text-sm leading-relaxed text-gray-700">
            I confirm that I own all the content in this course -- videos, images, music, resources and text -- or have permission to use it.
          </span>
        </label>
        <button type="button" onClick={onPublish} disabled={!confirmed || problems.length > 0 || publishing || blockedByUploads}
          data-pop className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
          {publishing ? 'Publishing…' : <><ShieldCheck className="h-4 w-4" /> {published ? 'Publish changes' : 'Publish course'}</>}
        </button>
        {blockedByUploads && <p className="text-center text-xs text-gray-500">Wait for uploads to finish.</p>}
        {!published && !problems.length && <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-500"><BadgeCheck className="h-3.5 w-3.5 text-blue-600" /> You can keep editing after publishing.</p>}
      </Card>
    </div>
  );
}
