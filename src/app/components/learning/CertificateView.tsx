// "Certificate of completion" -- one design used for the builder preview,
// the student's certificate page and the downloadable PDF. Always
// landscape (A4 proportions); scales to its container width.
import { forwardRef, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { learningOrigin } from '../../lib/learningOrigin';

export function certificateVerifyUrl(code: string): string {
  // Canonical address -- what the QR code and share links point at.
  const origin = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://filmons.app/learning' : learningOrigin();
  return `${origin}/certificate/${encodeURIComponent(code)}`;
}

export interface CertificateData {
  studentName: string; courseTitle: string; instructorName: string; completedAt: string; code: string;
}

export const CertificateView = forwardRef<HTMLDivElement, { data: CertificateData; sample?: boolean }>(function CertificateView({ data, sample }, ref) {
  const verifyUrl = certificateVerifyUrl(data.code);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(verifyUrl, { margin: 0, width: 240, color: { dark: '#0f172a', light: '#ffffff' } }).then(setQr).catch(() => setQr(null));
  }, [verifyUrl]);
  const date = new Date(data.completedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div ref={ref} className="relative w-full overflow-hidden bg-white text-slate-900" style={{ aspectRatio: '297 / 210', containerType: 'inline-size' }}>
      {/* decoration behind the frame, kept clear of the text */}
      <div className="absolute -right-[14cqw] -top-[14cqw] h-[32cqw] w-[32cqw] rounded-full bg-blue-50" />
      <div className="absolute -bottom-[16cqw] -left-[16cqw] h-[24cqw] w-[24cqw] rounded-full bg-indigo-50" />
      {/* frame */}
      <div className="absolute inset-[2.2cqw] rounded-[1cqw] border-[0.35cqw] border-blue-600" />
      <div className="absolute inset-[3cqw] rounded-[0.6cqw] border border-blue-200" />

      <div className="relative flex h-full flex-col px-[8cqw] py-[6.5cqw]">
        <div className="flex items-center justify-between">
          <p className="font-black tracking-[0.06em]" style={{ fontSize: '2.6cqw' }}>
            FILMONS <span className="text-blue-600">LEARNING</span>
          </p>
          {sample && <span className="rounded-full bg-amber-100 px-[1.4cqw] py-[0.4cqw] font-bold text-amber-800" style={{ fontSize: '1.3cqw' }}>Preview</span>}
        </div>

        <div className="mt-[4.5cqw]">
          <p className="font-bold uppercase tracking-[0.3em] text-blue-600" style={{ fontSize: '1.5cqw' }}>Certificate of completion</p>
          <p className="mt-[2cqw] text-slate-500" style={{ fontSize: '1.6cqw' }}>This certifies that</p>
          <p className="mt-[0.6cqw] font-black leading-tight" style={{ fontSize: '5cqw' }}>{data.studentName}</p>
          <p className="mt-[1.6cqw] text-slate-500" style={{ fontSize: '1.6cqw' }}>has successfully completed the course</p>
          <p className="mt-[0.6cqw] font-black leading-snug text-slate-900" style={{ fontSize: '3cqw' }}>{data.courseTitle}</p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-[3cqw]">
          <div className="grid grid-cols-2 gap-x-[5cqw] gap-y-[1.4cqw]" style={{ fontSize: '1.45cqw' }}>
            <div>
              <p className="font-black text-slate-900">{data.instructorName}</p>
              <p className="text-slate-500">Instructor</p>
            </div>
            <div>
              <p className="font-black text-slate-900">{date}</p>
              <p className="text-slate-500">Completion date</p>
            </div>
            <div className="col-span-2">
              <p className="font-mono font-bold text-slate-900">{data.code}</p>
              <p className="text-slate-500">Certificate ID · verify at {verifyUrl.replace(/^https?:\/\//, '')}</p>
            </div>
          </div>
          <div className="shrink-0 text-center">
            {qr ? <img src={qr} alt="Verification QR code" style={{ width: '11cqw', height: '11cqw' }} /> : <div className="bg-slate-100" style={{ width: '11cqw', height: '11cqw' }} />}
            <p className="mt-[0.5cqw] text-slate-400" style={{ fontSize: '1.1cqw' }}>Scan to verify</p>
          </div>
        </div>
      </div>
    </div>
  );
});
