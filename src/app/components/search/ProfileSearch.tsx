// Shared profile UI for Connect search AND Browse search -- one card, one
// carousel, one full list, so a profile looks and behaves identically everywhere:
//   * ProfileSearchCard    -- the card (photo, name + badge, @username, role · place,
//                              up to 3 skill/tool chips, Trust Score, Follow)
//   * ProfilesSection      -- self-loading carousel (max 5 cards, arrows on desktop,
//                              "View all →" only when more exist)
//   * ProfilesList         -- the full vertical list: heading + count + Filters +
//                              removable chips, bottom-sheet filters, infinite scroll,
//                              skeletons, empty / error states, scroll/filter restore
// Follow state comes from FollowContext, so Browse and Connect always agree.
import { prefetchHandlers } from '../../lib/prefetch';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { BadgeCheck, ChevronLeft, ChevronRight, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFollow } from '../../context/FollowContext';
import {
  EMPTY_PROFILE_FILTERS, applyProfileFilters, hasActiveProfileFilters, loadProfiles, peekProfiles,
  type ProfileFilters, type SearchProfile, type ViewerSignals,
} from '../../lib/profileSearch';
import { SmartAddressInput } from '../SmartAddressInput';

// ── Data hook ────────────────────────────────────────────────────────────────
export function useViewerSignals(): ViewerSignals | null {
  const { user } = useAuth() as any;
  return useMemo(() => user ? {
    id: user.id, primaryRole: user.primaryRole, skills: user.skills, gear: user.gear, city: user.city, province: user.province,
  } : null, [user?.id, user?.primaryRole, user?.city, user?.province, user?.skills, user?.gear]);
}

/** Loads the ranked profile list for `query` (recommendations when empty). Keeps the
 *  previous results visible while reloading or after a failure, and never reports a
 *  failed load as "no results". */
export function useProfiles(query: string) {
  const viewer = useViewerSignals();
  const [data, setData] = useState<SearchProfile[] | null>(() => peekProfiles(query, viewer?.id));
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const cached = peekProfiles(query, viewer?.id);
    if (cached) { setData(cached); setLoading(false); } else setLoading(true);
    setError(false);
    // Short typing delay (no delay for the empty / recommendations case).
    const t = setTimeout(() => {
      loadProfiles(query, viewer, tick > 0)
        .then(r => { if (alive) { setData(r); setLoading(false); } })
        .catch(() => { if (alive) { setError(true); setLoading(false); } });
    }, query.trim() ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, viewer?.id, tick]);

  return { data, loading, error, retry: () => setTick(t => t + 1) };
}

// ── Card ─────────────────────────────────────────────────────────────────────
// Fixed-structure card so every card is the same size at a given width and text
// size, whatever the profile contains:
//   * min-height 220px, 16px padding, 3 grid rows: [avatar + text + Follow] /
//     [skills, one row] / [Trust Score, bottom-right]
//   * every text line is ONE line with an ellipsis and always occupies its line
//     (empty lines are reserved), chips never wrap, Follow's slot is reserved even
//     when hidden (own card), Trust Score's slot is reserved even when unscored
//   * line / chip heights are in rem, so at larger accessibility text sizes every
//     card grows by the same amount
function Avatar({ p }: { p: SearchProfile }) {
  const [failed, setFailed] = useState(false);
  const initial = p.name?.trim()?.[0]?.toUpperCase() ?? '?';
  return (
    <div className="shrink-0 w-16 h-16 rounded-full overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-2xl font-black text-gray-500 self-start">
      {p.avatarUrl && !failed
        ? <img src={p.avatarUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="w-full h-full object-cover" />
        : initial}
    </div>
  );
}

const NBSP = '\u00A0';
const CARD_CLASS = 'w-full min-h-[220px] bg-white rounded-2xl border border-gray-200 p-4 grid grid-rows-[auto_auto_1fr] gap-y-3';

export function ProfileSearchCard({ profile: p, onOpen, onNavigate }: {
  profile: SearchProfile; onOpen?: (p: SearchProfile) => void;
  /** Host page navigation hook (Browse search uses it to save its state before leaving). */
  onNavigate?: (path: string) => void;
}) {
  const navigate = useNavigate();
  const { user, showGuestPrompt } = useAuth() as any;
  const { isFollowing, isPending, follow, unfollow } = useFollow();
  const following = isFollowing(p.id);
  const isSelf = !!user && user.id === p.id;

  const open = () => { onOpen?.(p); if (onNavigate) onNavigate(`/host/${p.id}`); else navigate(`/host/${p.id}`); };
  const toggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) { showGuestPrompt('Create your Filmons account to follow creators.', 'Sign up to follow creators'); return; }
    if (following) await unfollow(p.id); else await follow(p.id);
  };

  return (
    <div
      role="link" tabIndex={0} onClick={open} {...prefetchHandlers('host', p.id)}
      onKeyDown={e => { if (e.key === 'Enter') open(); }}
      className={`${CARD_CLASS} cursor-pointer active:scale-[0.995] hover:border-gray-300 transition-colors text-left`}
    >
      {/* Row 1: avatar | name / username / role / location | Follow */}
      <div className="flex items-start gap-3 min-w-0">
        <Avatar p={p} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0 h-6">
            <p className="text-[17px] font-black text-gray-900 leading-6 truncate min-w-0">{p.name}</p>
            {p.isVerified && <BadgeCheck className="w-[18px] h-[18px] shrink-0 fill-blue-600 text-white" aria-label="Verified" />}
          </div>
          <p className="h-5 text-sm leading-5 text-gray-400 truncate">{p.username ? `@${p.username}` : NBSP}</p>
          <p className="h-5 text-sm leading-5 text-gray-800 truncate">{p.headline || NBSP}</p>
          <p className="h-5 text-sm leading-5 text-gray-500 truncate">{p.place || NBSP}</p>
        </div>
        {/* Same slot whether or not Follow is shown (hidden on your own card). */}
        <div className="shrink-0 w-[88px] h-9">
          {!isSelf && (
            <button
              onClick={toggleFollow} disabled={isPending(p.id)} aria-pressed={following}
              className={`w-full h-full rounded-xl border-2 text-sm font-bold transition-colors disabled:opacity-60 ${
                following ? 'border-gray-200 bg-gray-100 text-gray-700' : 'border-blue-600 text-blue-600 hover:bg-blue-50'}`}
            >
              {following ? 'Following' : 'Follow'}
            </button>
          )}
        </div>
      </div>

      {/* Row 2: up to 3 skills / tools in ONE row; long labels truncate, nothing stacks. */}
      <div className="flex flex-nowrap gap-1.5 min-w-0 overflow-hidden h-7">
        {p.chips.slice(0, 3).map(c => (
          <span key={c} title={c}
            className="min-w-[2.5rem] shrink truncate rounded-full bg-gray-100 px-3 text-xs font-medium leading-7 text-gray-600">{c}</span>
        ))}
      </div>

      {/* Row 3: Trust Score anchored bottom-right (slot reserved even without a score). */}
      <div className="flex items-end justify-end">
        <div className={`text-right ${p.trust == null ? 'invisible' : ''}`}>
          <p className="text-[11px] leading-4 text-gray-400">Trust Score</p>
          <p className="leading-7"><span className="text-2xl font-black text-violet-600">{p.trust ?? 0}</span><span className="text-sm text-gray-400">/100</span></p>
        </div>
      </div>
    </div>
  );
}

export function ProfileCardSkeleton() {
  return (
    <div className={`${CARD_CLASS} animate-pulse`} aria-hidden>
      <div className="flex items-start gap-3">
        <div className="w-16 h-16 rounded-full bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-2 pt-1"><div className="h-4 w-2/3 bg-gray-100 rounded" /><div className="h-3 w-1/3 bg-gray-100 rounded" /><div className="h-3 w-1/2 bg-gray-100 rounded" /></div>
        <div className="w-[88px] h-9 bg-gray-100 rounded-xl shrink-0" />
      </div>
      <div className="flex gap-1.5 h-7"><div className="h-7 w-16 bg-gray-100 rounded-full" /><div className="h-7 w-20 bg-gray-100 rounded-full" /></div>
      <div />
    </div>
  );
}

// ── Carousel section ─────────────────────────────────────────────────────────
const MAX_CARDS = 5;

export function ProfilesSection({ query, title, onViewAll, onNavigate, className = '', vertical = false }: {
  /** Stack the cards in a vertical list instead of a sideways carousel. */
  vertical?: boolean;
  /** Empty = "Creators for you" recommendations. */
  query: string;
  title?: string;
  onViewAll: () => void;
  onNavigate?: (path: string) => void;
  className?: string;
}) {
  const { data, loading, error, retry } = useProfiles(query);
  const scroller = useRef<HTMLDivElement>(null);
  const heading = title ?? (query.trim() ? 'Profiles' : 'Creators for you');
  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * Math.min(440, (scroller.current?.clientWidth ?? 440) * 0.9), behavior: 'smooth' });

  if (!loading && !error && data && data.length === 0) return null; // omit an empty section
  const shown = (data ?? []).slice(0, MAX_CARDS);

  return (
    <section className={`mb-5 ${className}`} aria-label={heading}>
      <div className="flex items-center justify-between px-4 md:px-0 mb-2.5">
        <h2 className="text-base font-black text-gray-900">{heading}</h2>
        <div className="flex items-center gap-2">
          {data && data.length > MAX_CARDS && (
            <button onClick={onViewAll} className="text-sm font-bold text-blue-600 hover:text-blue-700">View all →</button>
          )}
          <div className={vertical ? 'hidden' : 'hidden md:flex items-center gap-1'}>
            <button onClick={() => scrollBy(-1)} aria-label="Previous" className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => scrollBy(1)} aria-label="Next" className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
      {error && !data ? (
        <button onClick={retry} className="mx-4 md:mx-0 flex items-center gap-1.5 text-sm text-gray-500">
          Couldn’t load profiles. <span className="font-bold text-blue-600 inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Retry</span>
        </button>
      ) : (
        <div ref={scroller} className={vertical
          ? 'grid grid-cols-1 md:grid-cols-2 gap-3 px-4 md:px-0'
          : 'flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-pl-4 md:scroll-pl-0 px-4 md:px-0'}>
          {(loading && !data ? Array.from({ length: 2 }) : shown).map((p, i) => (
            <div key={p ? (p as SearchProfile).id : i} className={vertical ? 'min-w-0' : 'snap-start shrink-0 w-[calc(100%-2.5rem)] md:w-[440px]'}>
              {p ? <ProfileSearchCard profile={p as SearchProfile} onNavigate={onNavigate} /> : <ProfileCardSkeleton />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────
function FilterSheet({ value, onApply, onClose }: { value: ProfileFilters; onApply: (f: ProfileFilters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ProfileFilters>(value);
  const [loc, setLoc] = useState(value.location);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const field = 'w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-blue-400';
  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Profile filters">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto bg-white rounded-t-3xl shadow-2xl md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] md:rounded-3xl"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <p className="text-base font-black text-gray-900">Filters</p>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Location</label>
            <div className="mt-1.5">
              <SmartAddressInput value={loc} onInputChange={v => { setLoc(v); setDraft(d => ({ ...d, location: v })); }}
                onAddressSelect={display => { setLoc(display); setDraft(d => ({ ...d, location: display.split(',')[0].trim() })); }}
                mode="city" placeholder="City or province" countryCodes={['CA', 'US']} />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Role or business industry</label>
            <input className={`${field} mt-1.5`} value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))} placeholder="e.g. Cinematographer" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Skills or tools</label>
            <input className={`${field} mt-1.5`} value={draft.skill} onChange={e => setDraft(d => ({ ...d, skill: e.target.value }))} placeholder="e.g. Pro Tools, Sony FX3" />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 cursor-pointer">
            <span className="text-sm font-semibold text-gray-800">Verified profiles only</span>
            <input type="checkbox" checked={draft.verifiedOnly} onChange={e => setDraft(d => ({ ...d, verifiedOnly: e.target.checked }))} className="w-5 h-5 accent-blue-600" />
          </label>
        </div>
        <div className="px-5 flex gap-3">
          <button onClick={() => { setDraft(EMPTY_PROFILE_FILTERS); setLoc(''); }} className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">Reset</button>
          <button onClick={() => { onApply(draft); onClose(); }} className="flex-[2] py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-sm font-bold text-white">Show results</button>
        </div>
      </div>
    </div>
  );
}

// ── Full list ────────────────────────────────────────────────────────────────
const PAGE = 15;
const STATE_KEY = 'filmons_profiles_list_state';

export function ProfilesList({ query, onClearQuery }: { query: string; onClearQuery?: () => void }) {
  const { data, loading, error, retry } = useProfiles(query);
  const [filters, setFilters] = useState<ProfileFilters>(() => {
    try { const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); return s && s.query === query ? s.filters : EMPTY_PROFILE_FILTERS; } catch { return EMPTY_PROFILE_FILTERS; }
  });
  const [showFilters, setShowFilters] = useState(false);
  const [shown, setShown] = useState(() => {
    try { const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); return s && s.query === query ? Math.max(PAGE, s.shown) : PAGE; } catch { return PAGE; }
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  const filtered = useMemo(() => applyProfileFilters(data ?? [], filters), [data, filters]);
  const visible = filtered.slice(0, shown);
  const active = hasActiveProfileFilters(filters);

  // New query / new filters start from the top of the list.
  useEffect(() => { if (restored.current) setShown(PAGE); }, [query, filters]);

  // Load more as the viewer nears the bottom (list is already ranked; ids are unique, so no duplicates).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= filtered.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setShown(s => s + PAGE); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, filtered.length]);

  // Returning from a profile restores filters, how far the list was loaded, and the scroll position.
  useEffect(() => {
    if (!data || restored.current) return;
    restored.current = true;
    try {
      const s = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
      if (s && s.query === query && s.scrollY) requestAnimationFrame(() => window.scrollTo(0, s.scrollY));
    } catch { /* ignore */ }
  }, [data, query]);
  const rememberState = useCallback(() => {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ query, filters, shown, scrollY: window.scrollY })); } catch { /* ignore */ }
  }, [query, filters, shown]);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.location.trim()) chips.push({ key: 'location', label: filters.location.trim(), clear: () => setFilters(f => ({ ...f, location: '' })) });
  if (filters.role.trim()) chips.push({ key: 'role', label: filters.role.trim(), clear: () => setFilters(f => ({ ...f, role: '' })) });
  if (filters.skill.trim()) chips.push({ key: 'skill', label: filters.skill.trim(), clear: () => setFilters(f => ({ ...f, skill: '' })) });
  if (filters.verifiedOnly) chips.push({ key: 'verified', label: 'Verified', clear: () => setFilters(f => ({ ...f, verifiedOnly: false })) });

  const heading = query.trim() ? 'Profiles' : 'Creators for you';
  const firstLoad = loading && !data;

  return (
    <div className="px-4 md:px-0 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-gray-900 leading-tight">{heading}</h1>
          {!firstLoad && data && <p className="text-base text-gray-400 mt-0.5">{filtered.length} result{filtered.length === 1 ? '' : 's'}</p>}
        </div>
        <button onClick={() => setShowFilters(true)} aria-label="Filters"
          className="relative w-12 h-12 rounded-2xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0">
          <SlidersHorizontal className="w-5 h-5 text-gray-800" />
          {active && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{chips.length}</span>}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {chips.map(c => (
            <button key={c.key} onClick={c.clear} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 px-3 py-1.5 text-xs font-bold">
              {c.label} <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {error && data && (
        <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>Couldn’t refresh results.</span>
          <button onClick={retry} className="font-bold underline">Retry</button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {firstLoad ? (
          Array.from({ length: 5 }).map((_, i) => <ProfileCardSkeleton key={i} />)
        ) : error && !data ? (
          <div role="alert" className="mx-auto max-w-sm rounded-2xl border border-gray-100 bg-white p-6 text-center">
            <p className="text-sm font-bold text-gray-900">We couldn’t load profiles.</p>
            <button onClick={retry} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white"><RotateCcw className="w-4 h-4" /> Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14">
            <p className="text-sm text-gray-500">No creators found. Try another name, role, or location.</p>
            {active && <button onClick={() => setFilters(EMPTY_PROFILE_FILTERS)} className="mt-3 text-sm font-bold text-blue-600">Clear filters</button>}
            {!active && query.trim() && onClearQuery && <button onClick={onClearQuery} className="mt-3 text-sm font-bold text-blue-600">Clear search</button>}
          </div>
        ) : (
          <>
            {visible.map(p => <ProfileSearchCard key={p.id} profile={p} onOpen={rememberState} />)}
            {shown < filtered.length && <div ref={sentinel} className="space-y-3"><ProfileCardSkeleton /></div>}
          </>
        )}
      </div>

      {showFilters && <FilterSheet value={filters} onApply={setFilters} onClose={() => setShowFilters(false)} />}
    </div>
  );
}
