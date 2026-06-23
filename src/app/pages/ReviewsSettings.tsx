import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { reliabilityApi, ReputationScore, CREATOR_TIERS } from '../lib/reliabilityApi';
import { reputationSettingsApi } from '../lib/settingsApi';
import { useEffect } from 'react';
import { ArrowLeft, Star, ChevronRight, Trophy, Shield, Check } from 'lucide-react';
import { useT } from '../lib/i18n';
import { toast } from 'sonner';

function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: () => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>}
      </div>
      <button onClick={onChange}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${on ? 'left-5.5' : 'left-0.5'}`}/>
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-4">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">{title}</p>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">{children}</div>
    </div>
  );
}

const BADGES = [
  { icon: '⭐', label: 'Top Creator',           sub: 'Earned by top 5% of creators',       earned: false },
  { icon: '🤝', label: 'Reliable Collaborator', sub: '10+ successful collaborations',       earned: false },
  { icon: '📦', label: 'Trusted Renter',         sub: '10+ successful rentals, no damage',  earned: false },
  { icon: '⚡', label: 'Fast Responder',          sub: 'Average reply under 2 hours',        earned: false },
  { icon: '✓',  label: 'Verified Professional',  sub: 'Professional verification approved',  earned: false },
  { icon: '🔥', label: 'Trending Creative',       sub: 'Portfolio in top weekly views',      earned: false },
];

export function ReviewsSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [rep, setRep] = useState<ReputationScore | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    reliabilityApi.getScore(user.id).then(r => setRep(r)).catch(() => {});
    reputationSettingsApi.load(user.id).then(s => {
      if (!s) return;
      setReviewVis(s.review_visibility ?? 'Public');
      setShowRating(s.show_star_ratings ?? true);
      setShowWritten(s.show_written_reviews ?? true);
      setShowScore(s.show_reliability ?? true);
      setShowCollabHistory(s.show_collab_history ?? true);
      setVerifiedOnly(s.verified_only ?? true);
      setAllowAnon(s.allow_anonymous ?? false);
      setAllowRespond(s.allow_public_response ?? true);
    }).catch(() => {});
  }, [user?.id]);
  const [reviewVis,     setReviewVis]     = useState('Public');
  const [showRating,    setShowRating]    = useState(true);
  const [showWritten,   setShowWritten]   = useState(true);
  const [showScore,     setShowScore]     = useState(true);
  const [showCollabHistory, setShowCollabHistory] = useState(true);
  const [allowAnon,     setAllowAnon]     = useState(false);
  const [verifiedOnly,  setVerifiedOnly]  = useState(true);
  const [allowRespond,  setAllowRespond]  = useState(true);

  const score  = rep?.reliability_score ?? 70;
  const level  = rep?.reliability_level ?? 'reliable';
  const tier   = CREATOR_TIERS[level as keyof typeof CREATOR_TIERS] ?? CREATOR_TIERS.reliable;
  const stats  = {
    rating:       Number(rep?.renter_avg_rating ?? 5.0).toFixed(1),
    count:        rep?.renter_reviews_count ?? 0,
    projects:     rep?.completed_collabs ?? 0,
    rentals:      rep?.rentals_hosted ?? 0,
    responseRate: rep?.response_rate ?? 100,
  };

  const saveAll = async () => {
    if (!user?.id) { toast.error('Please sign in'); return; }
    try {
      await reputationSettingsApi.save(user.id, {
        review_visibility: reviewVis, show_star_ratings: showRating,
        show_written_reviews: showWritten, show_reliability: showScore,
        show_collab_history: showCollabHistory, verified_only: verifiedOnly,
        allow_anonymous: allowAnon, allow_public_response: allowRespond,
      });
      toast.success('Reputation settings saved');
    } catch { toast.error('Failed to save'); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-14 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-700"/>
          </button>
          <h1 className="text-base font-black text-gray-900">Reviews & Reputation</h1>
        </div>
        <button onClick={saveAll} className="text-xs font-bold text-blue-600">Save</button>
      </div>

      <div className="py-4 space-y-5">

        {/* ── Dashboard ── */}
        <div className="mx-4 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-bold text-gray-900 mb-4">Reputation Dashboard</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Overall Rating',    value: stats.count > 0 ? `${stats.rating} ★` : '—',    color: 'text-yellow-500' },
              { label: 'Reviews',           value: String(stats.count),                               color: 'text-gray-900'   },
              { label: 'Response Rate',     value: `${stats.responseRate}%`,                         color: 'text-green-600'  },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-blue-700">{stats.projects}</p>
              <p className="text-[10px] text-gray-500">Projects</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-purple-700">{stats.rentals}</p>
              <p className="text-[10px] text-gray-500">Rentals</p>
            </div>
          </div>
        </div>

        {/* ── Review visibility ── */}
        <Section title="Review Visibility">
          <div className="px-4 py-3.5">
            <p className="text-sm font-semibold text-gray-900 mb-2">Who can see your reviews</p>
            <div className="flex flex-wrap gap-2">
              {['Public','Followers Only','Private'].map(opt => (
                <button key={opt} onClick={() => { setReviewVis(opt); toast.success('Saved'); }}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold border transition-all ${reviewVis===opt?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <Toggle on={showRating}    onChange={() => setShowRating(!showRating)}       label="Show Star Ratings"/>
          <Toggle on={showWritten}   onChange={() => setShowWritten(!showWritten)}     label="Show Written Reviews"/>
          <Toggle on={showScore}     onChange={() => setShowScore(!showScore)}         label="Show Reliability Score"/>
          <Toggle on={showCollabHistory} onChange={() => setShowCollabHistory(!showCollabHistory)} label="Show Collaboration History"/>
        </Section>

        {/* ── Review controls ── */}
        <Section title="Review Controls">
          <Toggle on={verifiedOnly} onChange={() => setVerifiedOnly(!verifiedOnly)}
            label="Verified Transactions Only" sub="Only users who completed a rental/collab can review you"/>
          <Toggle on={allowAnon}    onChange={() => setAllowAnon(!allowAnon)}
            label="Allow Anonymous Reviews"     sub="Clients can leave reviews without their name"/>
          <Toggle on={allowRespond} onChange={() => setAllowRespond(!allowRespond)}
            label="Allow Public Responses"      sub="Respond publicly to reviews on your profile"/>
          <button onClick={() => toast.info('Review moderation — coming soon')}
            className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
            <div className="text-left"><p className="text-sm font-semibold text-gray-900">Report & Appeal Reviews</p><p className="text-xs text-gray-400">Dispute fake or abusive reviews</p></div>
            <ChevronRight className="w-4 h-4 text-gray-300"/>
          </button>
        </Section>

        {/* ── Trust badges ── */}
        <Section title="Trust Badges">
          <div className="p-4 space-y-3">
            {BADGES.map(b => (
              <div key={b.label} className={`flex items-center gap-3 p-3 rounded-xl ${b.earned ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${b.earned ? 'bg-blue-600 shadow-sm' : 'bg-gray-100'}`}>
                  {b.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${b.earned ? 'text-blue-700' : 'text-gray-500'}`}>{b.label}</p>
                  <p className="text-xs text-gray-400">{b.sub}</p>
                </div>
                {b.earned
                  ? <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold shrink-0">Earned</span>
                  : <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-bold shrink-0">Locked</span>
                }
              </div>
            ))}
          </div>
        </Section>

        {/* ── Rating categories ── */}
        <Section title="Rating Categories (Received)">
          <div className="p-4">
            <p className="text-xs text-gray-400 mb-3">Categories other users rate you on after collaborations or rentals</p>
            {[
              { cat: 'Professionalism', items: ['Communication','Punctuality','Reliability','Responsiveness'] },
              { cat: 'Creative Work',   items: ['Quality','Creativity','Storytelling','Technical Skills'] },
              { cat: 'Rental',          items: ['Gear Condition','Return Timing','Equipment Care'] },
            ].map(g => (
              <div key={g.cat} className="mb-3">
                <p className="text-xs font-bold text-gray-600 mb-1">{g.cat}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map(i => <span key={i} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{i}</span>)}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <div className="mx-4 pb-24">
          <button onClick={saveAll}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-sm transition-colors shadow-md">
            Save Reputation Settings
          </button>
        </div>
      </div>
    </div>
  );
}