// Instagram / YouTube / TikTok / Facebook / X / Website — reads straight off
// the same fields Profile.tsx's About tab has always read (discrete columns
// falling back to the free-form profile_meta jsonb, see AboutEditor).
// Facebook/X are new keys on that same jsonb -- no migration needed.
import { Pencil } from 'lucide-react';

export interface SocialLinksData {
  website?: string; instagram?: string; youtube?: string; tiktok?: string;
  facebook?: string; x?: string;
}

export function socialLinksFromUser(user: any): SocialLinksData {
  const meta = user?.profileMeta || {};
  return {
    website:   user?.website   || meta.website,
    instagram: user?.instagram || meta.instagram,
    youtube:   user?.youtube   || meta.youtube,
    tiktok:    user?.tiktok    || meta.tiktok,
    facebook:  user?.facebook  || meta.facebook,
    x:         user?.x         || meta.x,
  };
}

export function SocialLinksSection({ links, isOwner, onEdit }: { links: SocialLinksData; isOwner: boolean; onEdit?: () => void }) {
  const { website, instagram, youtube, tiktok, facebook, x } = links;
  const hasAny = website || instagram || youtube || tiktok || facebook || x;
  if (!hasAny && !isOwner) return null;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-black text-gray-900">Social Links</p>
        {isOwner && (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      {!hasAny ? (
        <p className="text-xs text-gray-400">No social links added yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {website && (
            <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full font-medium hover:bg-blue-100 transition-colors">
              🌐 {website.replace(/https?:\/\//, '').split('/')[0]}
            </a>
          )}
          {instagram && (
            <a href={`https://instagram.com/${instagram.replace('@', '')}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-white rounded-full px-2.5 py-1 font-medium hover:opacity-90 transition-opacity"
              style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="2" /><circle cx="17.5" cy="6.5" r="1.2" fill="white" /><rect x="2" y="2" width="20" height="20" rx="6" stroke="white" strokeWidth="2" fill="none" /></svg>
              @{instagram.replace('@', '')}
            </a>
          )}
          {youtube && (
            <a href={youtube.startsWith('http') ? youtube : `https://youtube.com/${youtube}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-white bg-red-600 hover:bg-red-700 px-2.5 py-1 rounded-full font-medium transition-colors">
              <svg className="w-3 h-3" viewBox="0 0 24 24"><polygon points="9,7 17,12 9,17" fill="white" /></svg>
              YouTube
            </a>
          )}
          {tiktok && (
            <a href={`https://tiktok.com/${tiktok.startsWith('@') ? tiktok : '@' + tiktok}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-white bg-black hover:bg-gray-900 px-2.5 py-1 rounded-full font-medium transition-colors">
              <span className="text-[10px] font-black">TT</span>
              {tiktok}
            </a>
          )}
          {facebook && (
            <a href={facebook.startsWith('http') ? facebook : `https://facebook.com/${facebook}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-white bg-[#1877F2] hover:opacity-90 px-2.5 py-1 rounded-full font-medium transition-opacity">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="white"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V8c0-.9.25-1.5 1.55-1.5H17V3.7C16.7 3.65 15.7 3.55 14.5 3.55c-2.4 0-4 1.45-4 4.1V10H7.8v3.1h2.7v8h3z" /></svg>
              Facebook
            </a>
          )}
          {x && (
            <a href={`https://x.com/${x.replace('@', '')}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-white bg-black hover:bg-gray-900 px-2.5 py-1 rounded-full font-medium transition-colors">
              <span className="text-[10px] font-black">X</span>
              @{x.replace('@', '')}
            </a>
          )}
        </div>
      )}
    </section>
  );
}
