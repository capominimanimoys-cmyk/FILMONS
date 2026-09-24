// Album Credits -- ported as-is from the retired EditAlbumScreen.tsx (kept
// functionally unchanged, per the Album UX overhaul plan) into its own
// file so AlbumEditor.tsx can reuse it without dragging along the rest of
// that screen. Search an existing Filmons member, or add an unlisted name.
import { useState, useRef } from 'react';
import { Search, X, Plus, Trash2 } from 'lucide-react';
import { addAlbumCredit, deleteAlbumCredit, type AlbumCredit } from '../lib/portfolioApi';
import { searchProfiles, type ProfileResult } from '../lib/mentionsApi';
import { BottomSheet } from './BottomSheet';
import { supabase } from '../../lib/supabase';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function AddCreditForm({ onAdd }: { onAdd: (c: { role: string; creatorUserId?: string; unlistedName?: string }) => void }) {
  const [role, setRole] = useState('');
  const [unlisted, setUnlisted] = useState(false);
  const [unlistedName, setUnlistedName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [selected, setSelected] = useState<ProfileResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (q: string) => {
    setQuery(q);
    setSelected(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => setResults(await searchProfiles(q)), 250);
  };

  const canSubmit = role.trim() && (unlisted ? unlistedName.trim() : !!selected);

  return (
    <div className="px-4 pb-4 space-y-3">
      <Field label="Role">
        <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Makeup Artist"
          className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
      </Field>

      {!unlisted ? (
        <Field label="Creator">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query} onChange={e => handleSearch(e.target.value)} placeholder="Search Filmons member"
              className="w-full border border-gray-200 rounded-2xl pl-10 pr-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400"
            />
          </div>
          {selected ? (
            <div className="flex items-center justify-between mt-2 px-3 py-2 bg-blue-50 rounded-xl">
              <p className="text-sm font-bold text-blue-700">@{selected.username}</p>
              <button onClick={() => setSelected(null)}><X className="w-3.5 h-3.5 text-blue-400" /></button>
            </div>
          ) : results.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {results.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setSelected(r); setResults([]); setQuery(r.username); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-50 text-left"
                >
                  <p className="text-sm font-semibold text-gray-800">{r.display_name}</p>
                  <p className="text-xs text-gray-400">@{r.username}</p>
                </button>
              ))}
            </div>
          )}
        </Field>
      ) : (
        <Field label="Collaborator Name">
          <input value={unlistedName} onChange={e => setUnlistedName(e.target.value)} placeholder="Full name"
            className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm bg-gray-50 outline-none focus:border-blue-400" />
        </Field>
      )}

      <button onClick={() => setUnlisted(v => !v)} className="text-xs font-bold text-blue-600">
        {unlisted ? 'Search Filmons members instead' : "This person isn't on Filmons"}
      </button>

      <button
        onClick={() => onAdd({ role: role.trim(), creatorUserId: selected?.id, unlistedName: unlisted ? unlistedName.trim() : undefined })}
        disabled={!canSubmit}
        className="w-full py-3.5 rounded-2xl font-black text-white text-sm disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}
      >
        Add Credit
      </button>
    </div>
  );
}

export function AlbumCreditsSection({ albumId, credits, setCredits, creditProfiles, setCreditProfiles }: {
  albumId: string;
  credits: AlbumCredit[];
  setCredits: React.Dispatch<React.SetStateAction<AlbumCredit[]>>;
  creditProfiles: Record<string, { name: string; username: string }>;
  setCreditProfiles: React.Dispatch<React.SetStateAction<Record<string, { name: string; username: string }>>>;
}) {
  const [addCreditOpen, setAddCreditOpen] = useState(false);

  const handleDeleteCredit = async (creditId: string) => {
    const ok = await deleteAlbumCredit(creditId);
    if (ok) setCredits(prev => prev.filter(c => c.id !== creditId));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Credits</label>
        <button onClick={() => setAddCreditOpen(true)} className="text-xs font-bold text-blue-600 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add Credit
        </button>
      </div>
      {credits.length === 0 ? (
        <p className="text-xs text-gray-400">No credits added yet.</p>
      ) : (
        <div className="space-y-2">
          {credits.map(c => {
            const profile = c.creator_user_id ? creditProfiles[c.creator_user_id] : undefined;
            const name = profile?.name || c.unlisted_name || 'Unknown';
            return (
              <div key={c.id} className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{name}</p>
                  <p className="text-xs text-gray-400">{c.role}</p>
                </div>
                <button onClick={() => handleDeleteCredit(c.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {addCreditOpen && (
        <BottomSheet onClose={() => setAddCreditOpen(false)} title="Add Credit">
          <AddCreditForm
            onAdd={async credit => {
              const row = await addAlbumCredit(albumId, { ...credit, sortOrder: credits.length });
              if (row) {
                setCredits(prev => [...prev, row]);
                if (credit.creatorUserId) {
                  const { data } = await supabase.from('profiles').select('id, name, username').eq('id', credit.creatorUserId).maybeSingle();
                  if (data) setCreditProfiles(prev => ({ ...prev, [data.id]: { name: data.name, username: data.username } }));
                }
              }
              setAddCreditOpen(false);
            }}
          />
        </BottomSheet>
      )}
    </div>
  );
}
