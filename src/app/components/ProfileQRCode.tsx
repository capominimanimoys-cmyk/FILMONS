import { useEffect, useRef, useState } from 'react';
import { X, Download, Share2 } from 'lucide-react';

interface ProfileQRCodeProps {
  userId: string;
  name: string;
  avatar?: string;
  onClose: () => void;
}

export function ProfileQRCode({ userId, name, avatar, onClose }: ProfileQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profileUrl = `${window.location.origin}/host/${userId}`;

  useEffect(() => {
    // Draw QR using a simple URL-encoded QR service (no external library needed)
    // We render a QR code via the Google Charts API (no auth required)
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(profileUrl)}&bgcolor=ffffff&color=000000&qzone=2`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = 300;
      canvas.height = 300;
      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 0, 0, 300, 300);

      // Overlay avatar in center if provided
      if (avatar) {
        const av = new Image();
        av.crossOrigin = 'anonymous';
        av.onload = () => {
          const cx = 150, cy = 150, r = 28;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(av, cx - r, cy - r, r * 2, r * 2);
          ctx.restore();
        };
        av.src = avatar;
      }
    };
    img.src = qrUrl;
  }, [profileUrl, avatar]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `filmons-${name.replace(/\s/g, '-')}-qr.png`;
    a.click();
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} on Filmons`, url: profileUrl });
      } else {
        await navigator.clipboard.writeText(profileUrl);
        alert('Profile link copied!');
      }
    } catch {}
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-black text-gray-900">My Filmons QR</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* QR Canvas */}
          <div className="flex flex-col items-center py-6 px-5">
            <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-4">
              <canvas ref={canvasRef} className="w-[240px] h-[240px]" />
            </div>

            {/* User info */}
            <div className="text-center mb-5">
              <p className="font-black text-gray-900 text-base">{name}</p>
              <p className="text-xs text-gray-400 mt-0.5 break-all">{profileUrl}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 w-full">
              <button onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 rounded-2xl text-sm font-bold hover:bg-gray-200 transition-colors">
                <Download className="w-4 h-4" /> Save
              </button>
              <button onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl text-sm font-bold hover:bg-blue-700 transition-colors">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}