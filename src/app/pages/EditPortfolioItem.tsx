// "Edit Work" -- the main editing action for a single portfolio_item,
// reachable from the item's own three-dot menu (both Home -> Portfolio's
// feed card and Portfolio.tsx's grid). A real page/route rather than a
// sheet, per spec ("Edit Work page slides in right -> left") -- uses the
// same .page-enter-forward convention every other forward navigation in
// this app already uses (see styles/motion.css), not a bespoke transition.
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  getPortfolioItem, updatePortfolioItem, PORTFOLIO_CATEGORIES, PORTFOLIO_SUBCATEGORIES,
  type PortfolioItem,
} from '../lib/portfolioApi';
import { getPortfolioMediaAspectRatio } from '../components/PortfolioMedia';

export function EditPortfolioItem() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [item, setItem] = useState<PortfolioItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const availableSubcategories = PORTFOLIO_SUBCATEGORIES[category] ?? [];
  const [tagsText, setTagsText] = useState('');

  useEffect(() => {
    if (!itemId) return;
    getPortfolioItem(itemId).then(row => {
      setLoading(false);
      if (!row || (user && row.user_id !== user.id)) { setNotFound(true); return; }
      setItem(row);
      setTitle(row.title ?? '');
      setDescription(row.description ?? '');
      setCategory(row.category ?? '');
      setSubcategory(row.subcategory ?? '');
      setTagsText((row.tags ?? []).join(', '));
    });
  }, [itemId, user?.id]);

  const handleSave = async () => {
    if (!item) return;
    if (!title.trim()) { toast.error('Give this project a title'); return; }
    setSaving(true);
    const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean);
    const ok = await updatePortfolioItem(item.id, {
      title: title.trim(), description: description.trim(), category,
      subcategory: subcategory || undefined, tags,
    });
    setSaving(false);
    if (!ok) { toast.error('Could not save changes. Please try again.'); return; }
    toast.success('Project updated');
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center gap-3">
        <p className="text-sm font-bold text-gray-900">Couldn't open this project</p>
        <p className="text-xs text-gray-400">It may have been removed, or you don't have permission to edit it.</p>
        <button onClick={() => navigate('/portfolio')} className="mt-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">
          Back to Portfolio
        </button>
      </div>
    );
  }

  return (
    <div className="page-enter-forward min-h-screen bg-white flex flex-col">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-14 bg-white/95 backdrop-blur-md border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-gray-700 -ml-1 px-2 py-1.5 rounded-xl hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-semibold">Edit Work</span>
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 max-w-lg w-full mx-auto">
        {(item.thumbnail_url || item.media_url) && (
          <div className="w-full rounded-2xl overflow-hidden bg-gray-100" style={{ aspectRatio: getPortfolioMediaAspectRatio(item) }}>
            <img src={item.thumbnail_url || item.media_url} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500">Title</label>
          <input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Project title"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-400"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500">Description</label>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Tell people about this project…"
            rows={4}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-400 resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500">Category</label>
          <select
            value={category} onChange={e => { setCategory(e.target.value); setSubcategory(''); }}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-400"
          >
            <option value="">Select a category</option>
            {PORTFOLIO_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {availableSubcategories.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500">Subcategory</label>
            <select
              value={subcategory} onChange={e => setSubcategory(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-400"
            >
              <option value="">Select a subcategory</option>
              {availableSubcategories.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-500">Tags</label>
          <input
            value={tagsText} onChange={e => setTagsText(e.target.value)}
            placeholder="Comma-separated, e.g. Cinematography, BTS"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-400"
          />
        </div>
      </div>
    </div>
  );
}
