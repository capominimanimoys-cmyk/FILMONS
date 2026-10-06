// Card for a published live session (Learning home row).
import { useNavigate } from 'react-router';
import { Clock, Radio, Users, Video } from 'lucide-react';
import { PLATFORM_LABEL, formatFee, type LiveSession } from '../../lib/liveSessionsApi';

export function LiveSessionCard({ session: s }: { session: LiveSession }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(`/live/${s.id}`)} className="block w-full overflow-hidden rounded-2xl border border-gray-100 bg-white text-left hover:shadow-sm">
      <div className="relative aspect-video bg-gray-900">
        {s.coverUrl ? <img src={s.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-white/60"><Radio className="h-8 w-8" /></div>}
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white"><Radio className="h-3 w-3" /> Live</span>
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-bold leading-snug text-gray-900">{s.title}</p>
        <p className="truncate text-xs text-gray-400">{s.instructor?.name}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{s.format === 'one_to_one' ? '1:1' : `Up to ${s.maxParticipants}`}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{s.durationMinutes}m</span>
          <span className="flex items-center gap-1"><Video className="h-3 w-3" />{PLATFORM_LABEL[s.platform]}</span>
        </div>
        <p className="text-sm font-black text-gray-900">{s.isFree ? 'Free' : `${formatFee(s.price, s.currency)} / person`}</p>
      </div>
    </button>
  );
}
