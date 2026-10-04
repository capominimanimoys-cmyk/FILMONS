// FILMONS Learning -- certificate verification page (/learning/certificate/:code).
// Public: anyone with the link or QR code can confirm a certificate is
// genuine. Shows the certificate's own details only -- never account data.
// The certificate's owner also gets Download PDF / Share / Add to profile.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BadgeCheck, Loader2, RotateCcw, SearchX, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { learningServer, type PublicCertificate } from '../lib/learningServer';
import { CertificateView } from '../components/learning/CertificateView';
import { CertificateActions } from '../components/learning/CertificateActions';
import { LearningWordmark } from '../components/learning/LearningNav';

export function CertificatePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState<'loading' | 'found' | 'missing' | 'error'>('loading');
  const [cert, setCert] = useState<PublicCertificate | null>(null);
  const [mine, setMine] = useState(false);
  const certRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setState('loading');
    learningServer.verifyCertificate(code)
      .then(r => { if (r.found && r.certificate) { setCert(r.certificate); setState('found'); } else setState('missing'); })
      .catch(() => setState('error'));
  };
  useEffect(load, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user || !cert) { setMine(false); return; }
    learningServer.myCertificates(user.id).then(r => setMine(r.certificates.some(c => c.code === cert.code))).catch(() => setMine(false));
  }, [user?.id, cert?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = cert ? `Certificate of completion · ${cert.courseTitle} · FILMONS Learning` : 'Certificate verification · FILMONS Learning';
  }, [cert]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 sm:px-8" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate('/')}><LearningWordmark /></button>
        <button onClick={() => navigate('/')} className="text-xs font-bold text-blue-600 hover:underline">Explore courses</button>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
        {state === 'loading' && <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking certificate…</div>}

        {state === 'error' && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
            <p className="text-sm font-bold text-red-700">We couldn’t check this certificate right now.</p>
            <button onClick={load} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-800 border border-gray-200"><RotateCcw className="h-4 w-4" /> Retry</button>
          </div>
        )}

        {state === 'missing' && (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-gray-100 bg-white px-6 py-16 text-center">
            <SearchX className="h-10 w-10 text-gray-300" />
            <h1 className="text-lg font-black text-gray-900">No certificate found</h1>
            <p className="max-w-sm text-sm text-gray-500">There’s no FILMONS Learning certificate with the ID <span className="font-mono font-bold text-gray-700">{code}</span>. Check the ID and try again.</p>
          </div>
        )}

        {state === 'found' && cert && (
          <div className="space-y-5">
            {cert.valid ? (
              <div data-pop className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4">
                <BadgeCheck className="h-6 w-6 shrink-0 text-emerald-600" />
                <div>
                  <h1 className="text-base font-black text-emerald-900">Valid certificate of completion</h1>
                  <p className="mt-0.5 text-sm text-emerald-800">Issued by FILMONS Learning to <b>{cert.studentName}</b> for completing <b>{cert.courseTitle}</b>.</p>
                </div>
              </div>
            ) : (
              <div data-pop className="flex items-start gap-3 rounded-2xl bg-red-50 p-4">
                <ShieldAlert className="h-6 w-6 shrink-0 text-red-600" />
                <div>
                  <h1 className="text-base font-black text-red-900">This certificate is no longer valid</h1>
                  <p className="mt-0.5 text-sm text-red-800">It was revoked by FILMONS Learning.</p>
                </div>
              </div>
            )}

            <div data-pop className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <CertificateView ref={certRef} data={cert} />
            </div>

            <dl data-pop className="grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-sm sm:grid-cols-2">
              {[
                ['Student', cert.studentName], ['Course', cert.courseTitle], ['Instructor', cert.instructorName],
                ['Completed', new Date(cert.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })],
                ['Certificate ID', cert.code], ['Status', cert.valid ? 'Valid' : 'Revoked'],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-gray-400">{k}</dt><dd className={`font-bold text-gray-900 ${k === 'Certificate ID' ? 'font-mono' : ''}`}>{v}</dd></div>
              ))}
            </dl>
            <p className="text-xs leading-relaxed text-gray-500">
              A certificate of completion confirms the student completed this course on FILMONS Learning. It is not an accredited qualification.
            </p>

            {mine && cert.valid && (
              <div data-pop className="space-y-2 rounded-2xl border border-gray-100 bg-white p-4">
                <p className="text-sm font-black text-gray-900">Your certificate</p>
                <CertificateActions certificate={cert} showView={false} pdfNode={certRef.current} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
