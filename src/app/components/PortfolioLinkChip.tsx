// The link attached to a Portfolio work (portfolio_items.external_link), shown
// as a small tappable chip wherever the work appears. Opens in a new tab and
// never triggers the card it sits on (stopPropagation).
import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { externalLinkLabel, normalizeExternalLink } from '../lib/externalLink';

export function PortfolioLinkChip({ url, className = '' }: { url?: string | null; className?: string }) {
  const safe = normalizeExternalLink(url);
  if (!safe) return null;
  return (
    <a
      href={safe} target="_blank" rel="noopener noreferrer nofollow"
      onClick={e => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 max-w-full rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 px-2.5 py-1 text-xs font-semibold transition-colors ${className}`}
    >
      <Link2 className="w-3 h-3 shrink-0" />
      <span className="truncate">{externalLinkLabel(safe)}</span>
    </a>
  );
}

// A Post that attaches a Portfolio work only caches title/category/thumbnail, so
// its link is looked up live by the work's id (one small query per work, cached
// and shared between cards) instead of adding another column to `posts`.
const linkCache = new Map<string, string | null>();
const linkInflight = new Map<string, Promise<string | null>>();

export function usePortfolioItemLink(itemId?: string | null): string | null {
  const [link, setLink] = useState<string | null>(itemId ? linkCache.get(itemId) ?? null : null);
  useEffect(() => {
    if (!itemId) { setLink(null); return; }
    if (linkCache.has(itemId)) { setLink(linkCache.get(itemId) ?? null); return; }
    let alive = true;
    let p = linkInflight.get(itemId);
    if (!p) {
      p = Promise.resolve(supabase.from('portfolio_items').select('external_link').eq('id', itemId).maybeSingle())
        .then(({ data }) => (data?.external_link as string | undefined) ?? null, () => null)
        .then(v => { linkCache.set(itemId, v); linkInflight.delete(itemId); return v; });
      linkInflight.set(itemId, p);
    }
    p.then(v => { if (alive) setLink(v); });
    return () => { alive = false; };
  }, [itemId]);
  return link;
}
