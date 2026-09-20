// FILMONS Learning -- /learning/create (?edit=<courseId> to edit a draft).
// This is deliberately the BASIC course form (title/description/category/
// level/price/cover) -- enough to create and publish a real course card,
// not the full curriculum/lesson builder (video upload per lesson,
// sections, drafts-within-drafts). That's its own larger, separately
// specced flow. Permission is enforced here (not just hidden from a menu):
// a Creator/Creator+ landing on this route directly sees the upgrade
// screen, never the form.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Lock, ImagePlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLearningTransition } from '../context/LearningTransitionContext';
import { canCreateCourses, createCourse, updateCourse, publishCourse, getCourse, type CourseLevel } from '../lib/coursesApi';
import { notifyEvent } from '../lib/notifyEvent';
import { PORTFOLIO_CATEGORIES } from '../lib/portfolioApi';
import { supabase } from '../../lib/supabase';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

const LEVELS: { id: CourseLevel; label: string }[] = [
  { id: 'all_levels', label: 'All levels' }, { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' }, { id: 'advanced', label: 'Advanced' },
];

export function CreateCourse() {
  const navigate = useNavigate();
  const { leaveLearning } = useLearningTransition();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const editId = params.get('edit');

  const [loading, setLoading] = useState(!!editId);
  const [title, setTitle] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState<CourseLevel>('all_levels');
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);

  const allowed = canCreateCourses(user?.accountType);

  // Captured so handleSave can tell a genuine first publish (worth
  // notifying followers/connections about) apart from re-saving an
  // already-published course -- editing published copy shouldn't re-fire
  // the "published a new course" fan-out every time.
  const wasPublishedRef = useRef(false);

  useEffect(() => {
    if (!editId) return;
    getCourse(editId).then(c => {
      if (!c) { setLoading(false); return; }
      setTitle(c.title);
      setShortDescription(c.shortDescription ?? '');
      setDescription(c.description ?? '');
      setCategory(c.category ?? '');
      setLevel(c.level);
      setIsFree(c.isFree || c.price === 0);
      setPrice(c.price ? String(c.price) : '');
      setCoverUrl(c.coverUrl ?? '');
      wasPublishedRef.current = c.status === 'published';
      setLoading(false);
    });
  }, [editId]);

  if (!allowed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center"><Lock className="w-6 h-6 text-blue-500" /></div>
        <p className="text-base font-black text-gray-900">Upgrade to create courses</p>
        <p className="text-sm text-gray-500 max-w-xs">Upgrade to Professional or Business to create and publish courses on Filmons.</p>
        <div className="flex gap-3">
          <button onClick={() => leaveLearning('/professional-account-steps')} className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold">Go Professional</button>
          <button onClick={() => leaveLearning('/business-account-steps')} className="px-5 py-3 rounded-2xl bg-gray-900 text-white text-sm font-bold">Go Business</button>
        </div>
        <button onClick={() => navigate('/')} className="text-sm font-bold text-gray-400">Back to Learning</button>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><FilmonsBrandLoader size="lg" label="Loading" /></div>;

  const handleCoverUpload = async (file: File) => {
    if (!user) return;
    setUploadingCover(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `covers/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('courses').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('courses').getPublicUrl(path);
      setCoverUrl(data.publicUrl);
    } catch (e: any) {
      toast.error('Could not upload cover image');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async (publish: boolean) => {
    if (!user || !title.trim()) { toast.error('Add a title'); return; }
    setSaving(true);
    const input = {
      title, shortDescription, description, category: category || undefined,
      level, price: Number(price) || 0, isFree, coverUrl: coverUrl || undefined,
    };
    let id = editId;
    if (editId) {
      const ok = await updateCourse(editId, user.id, input);
      if (!ok) { setSaving(false); toast.error('Could not save'); return; }
    } else {
      const created = await createCourse(user.id, user.accountType, input);
      if (!created) { setSaving(false); toast.error('Could not create course'); return; }
      id = created.id;
    }
    if (publish && id) {
      const ok = await publishCourse(id, user.id);
      if (!ok) {
        toast.error('Saved as draft -- could not publish');
      } else {
        toast.success('Course published!');
        // Only a genuine draft -> published transition notifies
        // followers/connections -- re-saving an already-published course
        // (editing details, updating the cover) never re-fires this.
        if (!wasPublishedRef.current) {
          notifyEvent({
            type: 'course_published', instructorId: user.id, instructorName: user.name || user.username || '',
            courseId: id, courseTitle: title.trim().slice(0, 80),
          });
        }
      }
    } else {
      toast.success('Draft saved');
    }
    setSaving(false);
    navigate('/my-learning');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
          <ArrowLeft className="w-4 h-4 text-gray-700" />
        </button>
        <p className="text-sm font-bold text-gray-900">{editId ? 'Edit Course' : 'Create Course'}</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">
        <button onClick={() => document.getElementById('course-cover-input')?.click()}
          className="w-full rounded-2xl bg-white border border-dashed border-gray-300 flex items-center justify-center overflow-hidden"
          style={{ aspectRatio: '16/9' }}>
          {coverUrl ? <img src={coverUrl} alt="" className="w-full h-full object-cover" /> : (
            <div className="flex flex-col items-center gap-1.5 text-gray-400">
              <ImagePlus className="w-6 h-6" />
              <span className="text-xs font-semibold">{uploadingCover ? 'Uploading…' : 'Add cover image'}</span>
            </div>
          )}
        </button>
        <input id="course-cover-input" type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }} />

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="e.g. Cinematography Fundamentals"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none" />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Short description</label>
          <input value={shortDescription} onChange={e => setShortDescription(e.target.value)} maxLength={140} placeholder="One sentence about this course"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none" />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="What will students learn in this course?"
            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none resize-none" />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Category</label>
          <div className="flex flex-wrap gap-2">
            {PORTFOLIO_CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${category === c ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Level</label>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map(l => (
              <button key={l.id} onClick={() => setLevel(l.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${level === l.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-800">Free course</p>
            <button onClick={() => setIsFree(v => !v)} className={`w-11 h-6 rounded-full transition-colors relative ${isFree ? 'bg-blue-600' : 'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isFree ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {!isFree && (
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Price (CAD)</label>
              <input value={price} onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="39.00"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => handleSave(false)} disabled={saving} className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 text-sm font-bold disabled:opacity-60">
            Save draft
          </button>
          <button onClick={() => handleSave(true)} disabled={saving} className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
            {saving ? 'Saving…' : 'Publish'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 text-center">You can add lessons and curriculum after creating the course.</p>
      </div>
    </div>
  );
}
