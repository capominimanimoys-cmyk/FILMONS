// "Edit Work" -- the main editing action for a single portfolio_item,
// reachable from the item's own three-dot menu (both Home -> Portfolio's
// feed card and Portfolio.tsx's grid). A real page/route rather than a
// sheet, per spec ("Edit Work page slides in right -> left") -- uses the
// same .page-enter-forward convention every other forward navigation in
// this app already uses (see styles/motion.css), not a bespoke transition.
import { normalizeExternalLink, externalLinkLabel } from '../lib/externalLink';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getPortfolioItem, updatePortfolioItem, type PortfolioItem } from '../lib/portfolioApi';
import {
  CategoryPanel, TextFieldPanel, TagsPanel, VisibilityPanel, LocationPanel, FieldRow, VISIBILITY_OPTIONS, type ItemVisibility,
} from '../components/PortfolioFieldSelectors';
import { getPortfolioMediaAspectRatio } from '../components/PortfolioMedia';

type PanelId = 'link' | 'category' | 'role' | 'skills' | 'location' | 'collaborators' | 'hashtags' | 'visibility';
// Field panels open above the page (z 85 + depth*2).
const PANEL_DEPTH = 4;

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
  // Same fields as the Add Work editor.
  const [role, setRole] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<ItemVisibility>('public');
  const [link, setLink] = useState('');
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

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
      setRole(row.role ?? '');
      setTools(row.tools ?? []);
      setLocation(row.location ?? '');
      setCollaborators(row.collaborators ?? []);
      setHashtags(row.tags ?? []);
      setVisibility(((row as any).visibility as ItemVisibility) || 'public');
      setLink(row.external_link ?? '');
    });
  }, [itemId, user?.id]);

  const handleSave = async () => {
    if (!item) return;
    if (!title.trim()) { toast.error('Give this project a title'); return; }
    const safeLink = normalizeExternalLink(link);
    if (link.trim() && !safeLink) { toast.error('Enter a valid link, e.g. https://vimeo.com/123'); return; }
    setSaving(true);
    const ok = await updatePortfolioItem(item.id, {
      title: title.trim(), description: description.trim(), category,
      subcategory: subcategory || undefined, tags: hashtags,
      // '' / [] (not undefined) so clearing a field actually removes the stored value.
      role: role.trim(), tools, collaborators, location: location.trim(), visibility,
      // '' (not undefined) so clearing the field actually removes the stored link.
      external_link: safeLink ?? '',
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

        <FieldRow label="Category" placeholder="Select category" value={[category, subcategory].filter(Boolean).join(' · ')} onClick={() => setActivePanel('category')} />
        <FieldRow label="Link" placeholder="Add a link (website, video, article)" value={link ? externalLinkLabel(normalizeExternalLink(link) ?? link) : ''} onClick={() => setActivePanel('link')} />
        <FieldRow label="Your role" placeholder="e.g. Cinematographer" value={role} onClick={() => setActivePanel('role')} />
        <FieldRow label="Skills & tools" placeholder="Add skills or tools" value={tools.join(', ')} onClick={() => setActivePanel('skills')} />
        <FieldRow label="Location" placeholder="Add location" value={location} onClick={() => setActivePanel('location')} />
        <FieldRow label="Collaborators" placeholder="Tag collaborators" value={collaborators.join(', ')} onClick={() => setActivePanel('collaborators')} />
        <FieldRow label="Hashtags" placeholder="Add hashtags" value={hashtags.map(t => `#${t}`).join(' ')} onClick={() => setActivePanel('hashtags')} />
        <FieldRow label="Visibility" placeholder="Public" value={VISIBILITY_OPTIONS.find(o => o.id === visibility)?.label} onClick={() => setActivePanel('visibility')} />
      </div>
      {activePanel === 'category' && (
        <CategoryPanel depth={PANEL_DEPTH} category={category} subcategory={subcategory}
          onSave={(c, s2) => { setCategory(c); setSubcategory(s2); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'link' && (
        <TextFieldPanel depth={PANEL_DEPTH} title="Link" placeholder="https://example.com/your-work" value={link}
          onSave={v => {
            if (v && !normalizeExternalLink(v)) { toast.error('Enter a valid link, e.g. https://vimeo.com/123'); return; }
            setLink(v ? normalizeExternalLink(v)! : ''); setActivePanel(null);
          }}
          onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'role' && (
        <TextFieldPanel depth={PANEL_DEPTH} title="Your role" placeholder="e.g. Cinematographer" value={role}
          onSave={v => { setRole(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'skills' && (
        <TagsPanel depth={PANEL_DEPTH} title="Skills & tools" placeholder="Add skills or tools" values={tools}
          onSave={v => { setTools(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'location' && (
        <LocationPanel depth={PANEL_DEPTH} value={location}
          onSave={v => { setLocation(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'collaborators' && (
        <TagsPanel depth={PANEL_DEPTH} title="Collaborators" placeholder="Tag collaborators" values={collaborators}
          onSave={v => { setCollaborators(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'hashtags' && (
        <TagsPanel depth={PANEL_DEPTH} title="Hashtags" placeholder="Add hashtags" values={hashtags}
          onSave={v => { setHashtags(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
      {activePanel === 'visibility' && (
        <VisibilityPanel depth={PANEL_DEPTH} value={visibility}
          onSave={v => { setVisibility(v); setActivePanel(null); }} onClose={() => setActivePanel(null)} />
      )}
    </div>
  );
}
