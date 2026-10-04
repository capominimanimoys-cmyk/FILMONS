// Actions on an issued certificate: View certificate, Download PDF, Share,
// Add to FILMONS profile (Education & training -- only after the student
// confirms).
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Check, Download, Eye, GraduationCap, Loader2, Share2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { parseEducation, blankEduEntry } from '../../lib/education';
import { downloadCertificatePdf } from '../../lib/certificatePdf';
import type { PublicCertificate } from '../../lib/learningServer';
import { CertificateView, certificateVerifyUrl } from './CertificateView';
import { ConfirmDialog } from './builder/BuilderUI';

export function CertificateActions({ certificate, showView = true, pdfNode }: {
  certificate: PublicCertificate; showView?: boolean;
  /** The certificate element to render into the PDF; one is rendered off-screen when not given. */
  pdfNode?: HTMLElement | null;
}) {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const hidden = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [confirmProfile, setConfirmProfile] = useState(false);
  const [adding, setAdding] = useState(false);
  const entryId = `cert-${certificate.code}`;
  const onProfile = !!user && parseEducation((user as any).education).entries.some(e => e.id === entryId);
  const url = certificateVerifyUrl(certificate.code);

  const download = async () => {
    const node = pdfNode ?? hidden.current;
    if (!node) return;
    setDownloading(true);
    try { await downloadCertificatePdf(node, `FILMONS-certificate-${certificate.code}.pdf`); }
    catch { toast.error('Could not create the PDF. Please try again.'); }
    setDownloading(false);
  };

  const share = async () => {
    const data = { title: `Certificate of completion -- ${certificate.courseTitle}`, text: `I completed “${certificate.courseTitle}” on FILMONS Learning.`, url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
    } catch (e: any) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast.success('Verification link copied'); }
    catch { toast(url); }
  };

  const addToProfile = async () => {
    if (!user) return;
    setAdding(true);
    try {
      const edu = parseEducation((user as any).education);
      const year = String(new Date(certificate.completedAt).getFullYear());
      const entry = {
        ...blankEduEntry(), id: entryId, type: 'online_course' as const, school: 'FILMONS Learning',
        degree: 'Certificate of completion', field: certificate.courseTitle, startYear: year, endYear: year, current: false,
        description: `Instructor: ${certificate.instructorName} · Certificate ID ${certificate.code} · Verify: ${url}`, showOnProfile: true,
      };
      await updateUser({ education: { ...edu, entries: [...edu.entries.filter(e => e.id !== entryId), entry] } } as any);
      toast.success('Added to your FILMONS profile');
      setConfirmProfile(false);
    } catch { toast.error('Could not update your profile'); }
    setAdding(false);
  };

  const btn = 'flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-60';
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {showView && <button type="button" onClick={() => navigate(`/certificate/${certificate.code}`)} className={btn}><Eye className="h-4 w-4" /> View certificate</button>}
        <button type="button" onClick={download} disabled={downloading} className={btn}>{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF</button>
        <button type="button" onClick={share} className={btn}><Share2 className="h-4 w-4" /> Share</button>
        {user && (
          <button type="button" onClick={() => setConfirmProfile(true)} disabled={onProfile} className={btn}>
            {onProfile ? <><Check className="h-4 w-4 text-emerald-600" /> On your profile</> : <><GraduationCap className="h-4 w-4" /> Add to FILMONS profile</>}
          </button>
        )}
      </div>
      {!pdfNode && (
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 1123, pointerEvents: 'none' }}>
          <CertificateView ref={hidden} data={certificate} />
        </div>
      )}
      {confirmProfile && (
        <ConfirmDialog title="Add to your FILMONS profile?" confirmLabel={adding ? 'Adding…' : 'Add to profile'} busy={adding}
          body={<>This adds <b>Certificate of completion -- {certificate.courseTitle}</b> (FILMONS Learning, {new Date(certificate.completedAt).getFullYear()}) to <b>Education &amp; training</b> on your profile, visible to others. You can hide or remove it from your profile anytime.</>}
          onCancel={() => setConfirmProfile(false)} onConfirm={addToProfile} />
      )}
    </>
  );
}
