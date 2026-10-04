// Certificate PDF download: renders the on-screen certificate to a JPEG
// (html-to-image, already a dependency) and wraps it in a one-page A4
// landscape PDF -- a minimal hand-written PDF, so no PDF library is needed.
import { toJpeg } from 'html-to-image';

function bytes(s: string): Uint8Array { return new TextEncoder().encode(s); }

function jpegSize(data: Uint8Array): { width: number; height: number } {
  let i = 2;
  while (i < data.length) {
    if (data[i] !== 0xff) { i++; continue; }
    const marker = data[i + 1];
    const len = (data[i + 2] << 8) | data[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) return { height: (data[i + 5] << 8) | data[i + 6], width: (data[i + 7] << 8) | data[i + 8] };
    i += 2 + len;
  }
  throw new Error('Could not read image size');
}

export function jpegToPdf(jpeg: Uint8Array): Blob {
  const { width, height } = jpegSize(jpeg);
  const W = 842, H = 595; // A4 landscape, points
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (c: Uint8Array) => { chunks.push(c); length += c.length; };
  const obj = (n: number, body: (Uint8Array | string)[]) => {
    offsets[n] = length;
    push(bytes(`${n} 0 obj\n`));
    body.forEach(p => push(typeof p === 'string' ? bytes(p) : p));
    push(bytes('\nendobj\n'));
  };
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  push(bytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  obj(5, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  const xref = length;
  push(bytes(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

export async function downloadCertificatePdf(node: HTMLElement, fileName: string) {
  const dataUrl = await toJpeg(node, { quality: 0.95, pixelRatio: Math.max(2, 2480 / node.offsetWidth), backgroundColor: '#ffffff', cacheBust: true });
  const bin = atob(dataUrl.split(',')[1]);
  const jpeg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(jpegToPdf(jpeg));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
