import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Camera, Plus, Trash2, Link as LinkIcon, MapPin, AtSign,
  User as UserIcon, ChevronRight, Check, Loader2, Instagram,
  Facebook, Phone, Mail, MessageCircle, Globe, Store,
  ShoppingBag, Briefcase, AlertCircle, Zap,
} from 'lucide-react';
import { User, UserLink } from '../types';
import { authApi } from '../lib/api';
import { toast } from 'sonner';
import { UserAvatar } from './AccountTypeBadge';
import { SmartAddressInput } from './SmartAddressInput';

// ── Account categories ─────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'musician',         emoji: '🎵', label: 'Musician / Artist'     },
  { id: 'blogger',          emoji: '✍️', label: 'Blogger / Writer'       },
  { id: 'clothing-brand',   emoji: '👗', label: 'Clothing Brand'         },
  { id: 'community',        emoji: '🌐', label: 'Community'              },
  { id: 'digital-creator',  emoji: '✨', label: 'Digital Creator'        },
  { id: 'content-creator',  emoji: '🎬', label: 'Content Creator'        },
  { id: 'education',        emoji: '📚', label: 'Education'              },
  { id: 'gamer',            emoji: '🎮', label: 'Gamer'                  },
  { id: 'streamer',         emoji: '📺', label: 'Streamer'               },
  { id: 'photographer',     emoji: '📷', label: 'Photographer'           },
  { id: 'videographer',     emoji: '🎥', label: 'Videographer'           },
  { id: 'producer',         emoji: '🎛️', label: 'Producer'               },
  { id: 'sound-designer',   emoji: '🔊', label: 'Sound Designer'         },
  { id: 'visual-artist',    emoji: '🎨', label: 'Visual Artist'          },
  { id: 'actor',            emoji: '🎭', label: 'Actor / Performer'      },
  { id: 'beauty',           emoji: '💄', label: 'Beauty / Makeup'        },
  { id: 'fitness',          emoji: '🏋️', label: 'Fitness'                },
  { id: 'food',             emoji: '🍳', label: 'Food / Chef'            },
  { id: 'influencer',       emoji: '📱', label: 'Influencer'             },
  { id: 'brand',            emoji: '🏢', label: 'Brand / Business'       },
  { id: 'screenwriter',     emoji: '📝', label: 'Screenwriter'           },
  { id: 'film-tv',          emoji: '🎞️', label: 'Film & TV'              },
];

// ── Nav items ──────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'photos',    label: 'Photos',             icon: Camera       },
  { id: 'profile',   label: 'Profile Info',        icon: UserIcon     },
  { id: 'account',   label: 'Account Type',        icon: Briefcase    },
  { id: 'location',  label: 'Location & Links',    icon: MapPin       },
  { id: 'contact',   label: 'Contact & Social',    icon: Phone        },
];

function generateLinkId() { return `link-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Compress & resize an image file to keep it well under server limits (~400KB max)
function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Thin section divider with label ───────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{children}</p>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────
interface EditProfileModalProps {
  user: User;
  onClose: () => void;
  onSaved: (updated: User) => void;
}

// ── Main component ─────────────────────────────────────────────────────────
export function EditProfileModal({ user, onClose, onSaved }: EditProfileModalProps) {
  const [activeSection, setActiveSection] = useState('photos');

  // media
  const [avatar, setAvatar]         = useState(user.avatar || '');
  const [coverPhoto, setCoverPhoto] = useState(user.coverPhoto || '');
  const [uploadingAvatar, setUploadingAvatar]   = useState(false);
  const [uploadingCover, setUploadingCover]     = useState(false);
  const avatarRef  = useRef<HTMLInputElement>(null);
  const coverRef   = useRef<HTMLInputElement>(null);

  // basic info
  const [name, setName]             = useState(user.name || '');
  const [username, setUsername]     = useState(user.username || '');
  const [bio, setBio]               = useState(user.bio || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');

  // account
  const [accountMode, setAccountMode]       = useState<'creator' | 'business'>(user.accountMode || (user.accountType === 'renter' ? 'creator' : 'business'));
  const [accountCategory, setAccountCategory] = useState(user.accountCategory || '');

  // location + links
  const [location, setLocation]     = useState(user.location || '');
  const [city, setCity]             = useState(user.city || '');
  const [province, setProvince]     = useState(user.province || '');
  const [postalCode, setPostalCode] = useState(user.postalCode || '');
  const [streetAddress, setStreetAddress] = useState(user.streetAddress || '');
  const [links, setLinks]           = useState<UserLink[]>(user.links || []);

  // contact
  const [instagram, setInstagram]   = useState(user.instagram || '');
  const [facebook, setFacebook]     = useState(user.facebook || '');
  const [whatsapp, setWhatsapp]     = useState(user.whatsapp || '');

  // save state
  const [saving, setSaving] = useState(false);

  // ── Close on Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Username validation (debounced) ──────────────────────────────────────
  useEffect(() => {
    if (!username) { setUsernameStatus('idle'); return; }
    if (username === user.username) { setUsernameStatus('ok'); return; }

    const isValid = /^[a-z0-9_]{3,30}$/.test(username);
    if (!isValid) { setUsernameStatus('invalid'); return; }

    setUsernameStatus('checking');
    const timer = setTimeout(() => {
      const all: User[] = JSON.parse(localStorage.getItem('filmons_users') || '[]');
      const taken = all.some(u => u.id !== user.id && u.username === username);
      setUsernameStatus(taken ? 'taken' : 'ok');
    }, 400);
    return () => clearTimeout(timer);
  }, [username, user.id, user.username]);

  // ── Avatar upload ────────────────────────────────────────────────────────
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingAvatar(true);
    try { setAvatar(await compressImage(file)); }
    finally { setUploadingAvatar(false); e.target.value = ''; }
  };

  // ── Cover photo upload ───────────────────────────────────────────────────
  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingCover(true);
    try { setCoverPhoto(await compressImage(file, 1500, 0.85)); }
    finally { setUploadingCover(false); e.target.value = ''; }
  };

  // ── Links ────────────────────────────────────────────────────────────────
  const addLink = () => {
    if (links.length >= 5) { toast.error('Maximum 5 links'); return; }
    setLinks(prev => [...prev, { id: generateLinkId(), label: '', url: '' }]);
  };
  const updateLink = (id: string, key: keyof UserLink, val: string) =>
    setLinks(prev => prev.map(l => l.id === id ? { ...l, [key]: val } : l));
  const removeLink = (id: string) => setLinks(prev => prev.filter(l => l.id !== id));

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); setActiveSection('profile'); return; }
    if (usernameStatus === 'taken')   { toast.error('Username is already taken'); setActiveSection('profile'); return; }
    if (usernameStatus === 'invalid') { toast.error('Username must be 3–30 characters, letters/numbers/_'); setActiveSection('profile'); return; }
    if (usernameStatus === 'checking') { toast.error('Still checking username, please wait'); return; }

    // Validate URLs
    const invalidLinks = links.filter(l => l.url && !/^https?:\/\/.+/.test(l.url.trim()));
    if (invalidLinks.length) { toast.error('Links must start with http:// or https://'); setActiveSection('location'); return; }

    setSaving(true);
    try {
      // ── Upload any new images to Supabase Storage first ──────────────────
      // data: URLs are uploaded; existing https:// URLs are passed through as-is
      let avatarUrl = avatar;
      let coverPhotoUrl = coverPhoto;

      if (avatar && avatar.startsWith('data:')) {
        try {
          avatarUrl = await authApi.uploadPhoto(user.id, 'avatar', avatar);
        } catch (uploadErr: any) {
          console.error('Avatar upload failed:', uploadErr);
          toast.error('Failed to upload profile photo. Please try a smaller image.');
          return;
        }
      }
      if (coverPhoto && coverPhoto.startsWith('data:')) {
        try {
          coverPhotoUrl = await authApi.uploadPhoto(user.id, 'cover', coverPhoto);
        } catch (uploadErr: any) {
          console.error('Cover upload failed:', uploadErr);
          toast.error('Failed to upload cover photo. Please try a smaller image.');
          return;
        }
      }

      // Derive accountType from accountMode for backward compat
      const accountType = accountMode === 'business' ? 'business' : 'renter';

      // ── Save profile with the resolved URLs (small strings, never data:) ─
      const updated = await authApi.updateUser(user.id, {
        name: name.trim(),
        username: username.trim() || undefined,
        avatar: avatarUrl || undefined,
        coverPhoto: coverPhotoUrl || undefined,
        bio: bio.trim() || undefined,
        location: location.trim() || undefined,
        city: city || undefined,
        province: province || undefined,
        postalCode: postalCode || undefined,
        streetAddress: streetAddress || undefined,
        links: links.filter(l => l.url.trim()),
        accountMode,
        accountCategory: accountCategory || undefined,
        accountType,
        instagram: instagram.trim() || undefined,
        facebook: facebook.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
      });
      onSaved(updated);
      toast.success('Profile saved!');
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white w-full sm:max-w-2xl sm:rounded-2xl flex flex-col max-h-[95vh] sm:max-h-[90vh] z-10 shadow-2xl">

        {/* ── Sticky header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
          <h2 className="font-bold text-gray-900 text-base">Edit Profile</h2>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>

        {/* ── Body: sidebar + content ──────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* Sidebar nav (desktop only) */}
          <nav className="hidden sm:flex flex-col w-44 border-r border-gray-100 py-4 flex-shrink-0">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeSection === s.id
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <s.icon className="w-4 h-4 flex-shrink-0" />
                {s.label}
              </button>
            ))}
          </nav>

          {/* Mobile nav tabs */}
          <div className="sm:hidden flex border-b border-gray-100 overflow-x-auto flex-shrink-0 absolute top-[61px] left-0 right-0 bg-white z-10">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] font-medium border-b-2 transition-colors ${
                  activeSection === s.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500'
                }`}
              >
                <s.icon className="w-4 h-4" />
                {s.label.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-8 mt-[52px] sm:mt-0">

            {/* ════ PHOTOS ════ */}
            {activeSection === 'photos' && (
              <div className="space-y-6">
                {/* Cover photo */}
                <div>
                  <SectionLabel>Cover Photo</SectionLabel>
                  <div
                    className="relative w-full h-36 rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 cursor-pointer group"
                    onClick={() => coverRef.current?.click()}
                  >
                    {coverPhoto
                      ? <img src={coverPhoto} alt="Cover" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/80">
                          <Camera className="w-8 h-8" />
                          <span className="text-sm font-medium">Add cover photo</span>
                        </div>
                    }
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {uploadingCover
                        ? <Loader2 className="w-8 h-8 text-white animate-spin" />
                        : <div className="flex flex-col items-center gap-1 text-white">
                            <Camera className="w-7 h-7" />
                            <span className="text-xs font-medium">{coverPhoto ? 'Change' : 'Add'} cover photo</span>
                          </div>
                      }
                    </div>
                    {coverPhoto && (
                      <button
                        onClick={e => { e.stopPropagation(); setCoverPhoto(''); }}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <input ref={coverRef} type="file" accept="image/*"
                    style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
                    onChange={handleCoverChange} />
                  <p className="text-xs text-gray-400 mt-1.5">Recommended: 1500 × 500 px · JPG or PNG</p>
                </div>

                {/* Avatar */}
                <div>
                  <SectionLabel>Profile Photo</SectionLabel>
                  <div className="flex items-center gap-5">
                    <div
                      className="relative cursor-pointer group flex-shrink-0"
                      onClick={() => avatarRef.current?.click()}
                    >
                      <UserAvatar user={{ ...user, avatar }} size={88} className="border-4 border-white shadow-lg" />
                      <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {uploadingAvatar
                          ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                          : <Camera className="w-5 h-5 text-white" />
                        }
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => avatarRef.current?.click()}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
                      >
                        <Camera className="w-4 h-4" />{avatar ? 'Change photo' : 'Upload photo'}
                      </button>
                      {avatar && (
                        <button
                          onClick={() => setAvatar('')}
                          className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1.5"
                        >
                          <Trash2 className="w-4 h-4" />Remove photo
                        </button>
                      )}
                      <p className="text-xs text-gray-400">JPG, PNG or GIF · Max 5 MB</p>
                    </div>
                    <input ref={avatarRef} type="file" accept="image/*"
                      style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
                      onChange={handleAvatarChange} />
                  </div>
                </div>
              </div>
            )}

            {/* ════ PROFILE INFO ════ */}
            {activeSection === 'profile' && (
              <div className="space-y-5">
                <SectionLabel>Profile Info</SectionLabel>

                {/* Display Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Display Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      maxLength={60}
                      placeholder="Your full name"
                      disabled={user.accountType === 'business' || user.accountMode === 'business'}
                      className={`w-full border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent
                        ${user.accountType === 'business' || user.accountMode === 'business'
                          ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed'
                          : 'border-gray-200 text-gray-800'}`}
                    />
                  </div>
                  {(user.accountType === 'business' || user.accountMode === 'business') ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1 flex items-center gap-1.5">
                      🔒 Creator+ accounts cannot change their legal name as it must match their verified ID. Contact support if needed.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-1 text-right">{name.length}/60</p>
                  )}
                </div>

                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      maxLength={30}
                      placeholder="your_handle"
                      className={`w-full border rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent ${
                        usernameStatus === 'ok'      ? 'border-green-400 focus:ring-green-400' :
                        usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red-400 focus:ring-red-400' :
                        'border-gray-200 focus:ring-blue-400'
                      }`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                      {usernameStatus === 'ok'       && <Check className="w-4 h-4 text-green-500" />}
                      {(usernameStatus === 'taken' || usernameStatus === 'invalid') &&
                        <AlertCircle className="w-4 h-4 text-red-500" />}
                    </div>
                  </div>
                  {usernameStatus === 'taken'   && <p className="text-xs text-red-500 mt-1">@{username} is already taken</p>}
                  {usernameStatus === 'invalid' && <p className="text-xs text-red-500 mt-1">3–30 characters: letters, numbers, underscores only</p>}
                  {usernameStatus === 'ok'      && username !== user.username &&
                    <p className="text-xs text-green-600 mt-1">@{username} is available!</p>}
                  <p className="text-xs text-gray-400 mt-1">This is how others can find you: @{username || 'yourhandle'}</p>
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    placeholder="Tell the Filmons community about yourself — what you create, what gear you love, what you're working on…"
                    rows={4}
                    maxLength={300}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none leading-relaxed"
                  />
                  <p className="text-xs text-gray-400 mt-1 text-right">{bio.length}/300</p>
                </div>
              </div>
            )}

            {/* ════ ACCOUNT TYPE ════ */}
            {activeSection === 'account' && (
              <div className="space-y-6">
                <div>
                  <SectionLabel>Account Mode</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Creator */}
                    <button
                      onClick={() => setAccountMode('creator')}
                      className={`rounded-2xl border-2 p-4 text-left transition-all ${accountMode === 'creator' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><ShoppingBag className="w-5 h-5 text-blue-600"/></div>
                          <span className="font-semibold text-gray-900 text-sm">Creator</span>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${accountMode==='creator'?'border-blue-500 bg-blue-500':'border-gray-300'}`}>
                          {accountMode==='creator'&&<Check className="w-3 h-3 text-white"/>}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">For buyers, renters, fans & creators.</p>
                      <ul className="mt-2 space-y-1">
                        {['Rent & buy gear','Follow & post','Like & comment'].map(f=>(
                          <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600"><Check className="w-3 h-3 text-blue-500 flex-shrink-0"/>{f}</li>
                        ))}
                      </ul>
                    </button>

                    {/* Creator+ */}
                    <button
                      onClick={() => setAccountMode('business')}
                      className={`rounded-2xl border-2 p-4 text-left transition-all overflow-hidden ${accountMode==='business'?'border-purple-500':'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center"><Zap className="w-5 h-5 text-white"/></div>
                          <span className="font-semibold text-gray-900 text-sm">Creator+</span>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${accountMode==='business'?'border-purple-500 bg-purple-500':'border-gray-300'}`}>
                          {accountMode==='business'&&<Check className="w-3 h-3 text-white"/>}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 leading-relaxed">For sellers, hosts & service providers.</p>
                      <ul className="mt-2 space-y-1">
                        {['Everything in Creator','List & sell gear','Offer services','Verified seller badge'].map(f=>(
                          <li key={f} className="flex items-center gap-1.5 text-xs text-gray-600"><Check className="w-3 h-3 text-purple-500 flex-shrink-0"/>{f}</li>
                        ))}
                      </ul>
                      <div className="mt-2">
                        <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">Requires identity verification</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Category picker */}
                <div>
                  <SectionLabel>Account Category <span className="normal-case font-normal">(optional)</span></SectionLabel>
                  <p className="text-xs text-gray-500 mb-3">Choose the category that best describes what you do.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setAccountCategory(prev => prev === cat.id ? '' : cat.id)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                          accountCategory === cat.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-base leading-none">{cat.emoji}</span>
                        <span className="leading-tight">{cat.label}</span>
                        {accountCategory === cat.id && <Check className="w-3 h-3 ml-auto flex-shrink-0 text-blue-500" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ════ LOCATION & LINKS ════ */}
            {activeSection === 'location' && (
              <div className="space-y-6">
                {/* Smart location search */}
                <div>
                  <SectionLabel>Location <span className="normal-case font-normal text-gray-400">(Canada only)</span></SectionLabel>
                  <SmartAddressInput
                    value={location}
                    onInputChange={setLocation}
                    onAddressSelect={(display, parts) => {
                      setLocation(display);
                      setCity(parts.city);
                      setProvince(parts.province);
                      setPostalCode(parts.postalCode);
                      setStreetAddress(parts.streetAddress);
                    }}
                    mode="city"
                    placeholder="Search your city in Canada…"
                    canadaOnly
                  />
                  {location && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mt-2">
                      <MapPin className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      <span className="text-xs font-semibold text-green-700 flex-1">{location}</span>
                      <button type="button" onClick={() => setLocation('')} className="text-green-400 hover:text-green-600">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1.5">📍 Only Canadian locations are supported on Filmons.</p>
                </div>

                {/* Links */}
                <div>
                  <SectionLabel>Links <span className="normal-case font-normal">({links.length}/5)</span></SectionLabel>
                  <p className="text-xs text-gray-500 mb-3">Add your portfolio, website, or other relevant links.</p>

                  <div className="space-y-3">
                    {links.map((link, i) => (
                      <div key={link.id} className="flex items-start gap-2">
                        <div className="flex-1 space-y-1.5">
                          <input
                            value={link.label}
                            onChange={e => updateLink(link.id, 'label', e.target.value)}
                            placeholder='Label — e.g. "Portfolio"'
                            maxLength={40}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                          />
                          <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <input
                              value={link.url}
                              onChange={e => updateLink(link.id, 'url', e.target.value)}
                              placeholder="https://yoursite.com"
                              type="url"
                              className={`w-full border rounded-xl pl-8 pr-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:border-transparent ${
                                link.url && !/^https?:\/\/.+/.test(link.url.trim())
                                  ? 'border-red-300 focus:ring-red-400'
                                  : 'border-gray-200 focus:ring-blue-400'
                              }`}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => removeLink(link.id)}
                          className="mt-1 w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {links.length < 5 && (
                    <button
                      onClick={addLink}
                      className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      <Plus className="w-4 h-4" />Add a link
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ════ CONTACT & SOCIAL ════ */}
            {activeSection === 'contact' && (
              <div className="space-y-5">
                <SectionLabel>Social &amp; Contact Handles</SectionLabel>
                <p className="text-sm text-gray-500 -mt-4">
                  Changing email or phone? Use the <strong>Contact &amp; Privacy</strong> section on your profile page — those require verification.
                </p>

                {[
                  { key: 'instagram', icon: Instagram, placeholder: '@yourusername', label: 'Instagram', val: instagram, set: setInstagram, prefix: 'instagram.com/' },
                  { key: 'facebook',  icon: Facebook,  placeholder: 'Your name or page URL', label: 'Facebook', val: facebook, set: setFacebook, prefix: 'facebook.com/' },
                  { key: 'whatsapp',  icon: MessageCircle, placeholder: '+1 555 0000', label: 'WhatsApp', val: whatsapp, set: setWhatsapp, prefix: '+' },
                ].map(({ key, icon: Icon, placeholder, label, val, set, prefix }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
                    <div className="relative">
                      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        value={val}
                        onChange={e => set(e.target.value)}
                        placeholder={placeholder}
                        className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>

        {/* ── Mobile: save button at bottom ─────────────────────────────────── */}
        <div className="sm:hidden px-5 pb-5 pt-3 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-2xl transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}