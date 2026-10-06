// FILMONS Learning -- live sessions (see
// supabase/migrations/20240613000000_live_sessions.sql). Direct Supabase
// calls, same pattern as coursesApi.ts.
import { supabase } from '../../lib/supabase';
import { canCreateCourses } from './coursesApi';

export type SessionFormat = 'one_to_one' | 'small_group';
export type MeetingPlatform = 'zoom' | 'teams';
export type LiveStatus = 'draft' | 'published' | 'unpublished';
export type ApplicationStatus = 'applied' | 'accepted' | 'awaiting_payment' | 'confirmed' | 'declined' | 'cancelled';
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export const PLATFORM_LABEL: Record<MeetingPlatform, string> = { zoom: 'Zoom', teams: 'Microsoft Teams' };
export const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP'];

export interface LiveSession {
  id: string;
  instructorId: string;
  instructor?: { id: string; name: string; username: string | null; avatarUrl: string | null };
  title: string;
  coverUrl: string | null;
  description: string;
  topic: string;
  learningOutcomes: string[];
  format: SessionFormat;
  durationMinutes: number;
  language: string;
  maxParticipants: number;
  timezone: string;
  availableDays: string[];
  allowPreferredDate: boolean;
  isFree: boolean;
  price: number;
  currency: string;
  platform: MeetingPlatform;
  questions: { goals: boolean; experience: boolean; dates: boolean };
  status: LiveStatus;
  createdAt: string;
  publishedAt: string | null;
}

export interface LiveApplication {
  id: string;
  sessionId: string;
  studentId: string;
  student?: { name: string; avatarUrl: string | null };
  goals: string | null;
  experience: string | null;
  preferredDate: string | null;
  status: ApplicationStatus;
  scheduledAt: string | null;
  fee: number | null;
  currency: string | null;
  meetingLink: string | null;
  createdAt: string;
  session?: LiveSession;
}

const rowToSession = (r: any): LiveSession => ({
  id: r.id, instructorId: r.instructor_id, title: r.title, coverUrl: r.cover_url, description: r.description ?? '',
  topic: r.topic ?? '', learningOutcomes: Array.isArray(r.learning_outcomes) ? r.learning_outcomes : [],
  format: r.format, durationMinutes: r.duration_minutes, language: r.language, maxParticipants: r.max_participants,
  timezone: r.timezone ?? '', availableDays: Array.isArray(r.available_days) ? r.available_days : [],
  allowPreferredDate: !!r.allow_preferred_date, isFree: !!r.is_free, price: Number(r.price) || 0, currency: r.currency,
  platform: r.platform, questions: { goals: true, experience: true, dates: true, ...(r.questions ?? {}) },
  status: r.status, createdAt: r.created_at, publishedAt: r.published_at,
});

const rowToApp = (r: any): LiveApplication => ({
  id: r.id, sessionId: r.session_id, studentId: r.student_id, goals: r.goals, experience: r.experience,
  preferredDate: r.preferred_date, status: r.status, scheduledAt: r.scheduled_at,
  fee: r.fee == null ? null : Number(r.fee), currency: r.currency, meetingLink: r.meeting_link, createdAt: r.created_at,
});

async function profilesById(ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const { data } = await supabase.from('profiles').select('id, name, username, avatar_url').in('id', [...new Set(ids)]);
  return new Map((data ?? []).map((p: any) => [p.id, p]));
}

export interface LiveDraft {
  title: string; coverUrl: string; description: string; topic: string; learningOutcomes: string[];
  format: SessionFormat; durationMinutes: number; language: string; maxParticipants: number;
  timezone: string; availableDays: string[]; allowPreferredDate: boolean;
  isFree: boolean; price: number; currency: string;
  platform: MeetingPlatform; meetingLink: string;
  questions: { goals: boolean; experience: boolean; dates: boolean };
}

export function emptyLiveDraft(): LiveDraft {
  let timezone = 'America/Toronto';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone; } catch {}
  return {
    title: '', coverUrl: '', description: '', topic: '', learningOutcomes: [''],
    format: 'one_to_one', durationMinutes: 60, language: 'English', maxParticipants: 1,
    timezone, availableDays: ['mon', 'tue', 'wed', 'thu', 'fri'], allowPreferredDate: true,
    isFree: true, price: 0, currency: 'CAD', platform: 'zoom', meetingLink: '',
    questions: { goals: true, experience: true, dates: true },
  };
}

/** Problems that stop publishing, keyed by the builder step that fixes them. */
export function liveProblems(d: LiveDraft): { step: number; message: string }[] {
  const p: { step: number; message: string }[] = [];
  if (d.title.trim().length < 5) p.push({ step: 1, message: 'Add a title (at least 5 characters)' });
  if (!d.description.trim()) p.push({ step: 1, message: 'Add a description' });
  if (!d.topic.trim()) p.push({ step: 1, message: 'Add a topic' });
  if (!d.learningOutcomes.some(o => o.trim())) p.push({ step: 1, message: 'Add at least one learning outcome' });
  if (d.format === 'small_group' && d.maxParticipants < 2) p.push({ step: 2, message: 'A small group needs at least 2 participants' });
  if (!(d.durationMinutes > 0)) p.push({ step: 2, message: 'Set a duration' });
  if (!d.timezone) p.push({ step: 3, message: 'Set your timezone' });
  if (!d.availableDays.length) p.push({ step: 3, message: 'Choose at least one available day' });
  if (!d.isFree && !(d.price > 0)) p.push({ step: 4, message: 'Enter the session fee' });
  if (d.meetingLink.trim() && !/^https?:\/\/\S+$/i.test(d.meetingLink.trim())) p.push({ step: 5, message: 'The meeting link must start with https://' });
  return p;
}

export async function uploadLiveCover(userId: string, file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPG, PNG or WebP image');
  if (file.size > 10 * 1024 * 1024) throw new Error('Cover images can be up to 10 MB');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `live/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('courses').upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return supabase.storage.from('courses').getPublicUrl(path).data.publicUrl;
}

export async function publishLiveSession(userId: string, accountType: string | null | undefined, d: LiveDraft): Promise<string> {
  if (!canCreateCourses(accountType)) throw new Error('Only Professional and Business accounts can publish live sessions');
  const problems = liveProblems(d);
  if (problems.length) throw new Error(problems[0].message);
  const { data, error } = await supabase.from('live_sessions').insert({
    instructor_id: userId, title: d.title.trim(), cover_url: d.coverUrl || null, description: d.description.trim(),
    topic: d.topic.trim(), learning_outcomes: d.learningOutcomes.map(o => o.trim()).filter(Boolean),
    format: d.format, duration_minutes: d.durationMinutes, language: d.language.trim() || 'English',
    max_participants: d.format === 'one_to_one' ? 1 : d.maxParticipants,
    timezone: d.timezone, available_days: d.availableDays, allow_preferred_date: d.allowPreferredDate,
    is_free: d.isFree, price: d.isFree ? 0 : d.price, currency: d.currency, platform: d.platform,
    questions: d.questions, status: 'published', published_at: new Date().toISOString(),
  }).select('id').single();
  if (error || !data) throw new Error(error?.message || 'Could not publish');
  if (d.meetingLink.trim()) {
    await supabase.from('live_session_links').upsert({ session_id: data.id, meeting_link: d.meetingLink.trim() });
  }
  return data.id;
}

export async function getLiveSession(id: string): Promise<LiveSession | null> {
  const { data, error } = await supabase.from('live_sessions').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const s = rowToSession(data);
  const p = (await profilesById([s.instructorId])).get(s.instructorId);
  if (p) s.instructor = { id: p.id, name: p.name, username: p.username ?? null, avatarUrl: p.avatar_url ?? null };
  return s;
}

export async function getLiveSessionsByInstructor(instructorId: string): Promise<LiveSession[]> {
  const { data } = await supabase.from('live_sessions').select('*').eq('instructor_id', instructorId).order('created_at', { ascending: false });
  return (data ?? []).map(rowToSession);
}

export async function setLiveSessionStatus(id: string, instructorId: string, status: LiveStatus): Promise<boolean> {
  const { error } = await supabase.from('live_sessions').update({ status }).eq('id', id).eq('instructor_id', instructorId);
  return !error;
}

/** Default meeting link -- only ever fetched for the instructor. */
export async function getSessionLinkForInstructor(sessionId: string): Promise<string> {
  const { data } = await supabase.from('live_session_links').select('meeting_link').eq('session_id', sessionId).maybeSingle();
  return data?.meeting_link ?? '';
}

export async function setSessionLink(sessionId: string, link: string): Promise<boolean> {
  const l = link.trim();
  if (!l) { const { error } = await supabase.from('live_session_links').delete().eq('session_id', sessionId); return !error; }
  const { error } = await supabase.from('live_session_links').upsert({ session_id: sessionId, meeting_link: l });
  return !error;
}

// ── Applications ──────────────────────────────────────────────────────────
export async function getMyApplicationFor(sessionId: string, studentId: string): Promise<LiveApplication | null> {
  const { data } = await supabase.from('live_session_applications').select('*')
    .eq('session_id', sessionId).eq('student_id', studentId)
    .not('status', 'in', '(declined,cancelled)').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data ? rowToApp(data) : null;
}

export async function applyToSession(session: LiveSession, studentId: string, input: { goals?: string; experience?: string; preferredDate?: string }): Promise<string | null> {
  if (session.status !== 'published') return 'This session is not open for applications';
  if (session.instructorId === studentId) return 'You can’t apply to your own session';
  if (await getMyApplicationFor(session.id, studentId)) return 'You already have an application for this session';
  const { error } = await supabase.from('live_session_applications').insert({
    session_id: session.id, student_id: studentId,
    goals: input.goals?.trim() || null, experience: input.experience?.trim() || null, preferred_date: input.preferredDate?.trim() || null,
  });
  return error ? error.message : null;
}

export async function getApplicationsForSession(sessionId: string): Promise<LiveApplication[]> {
  const { data } = await supabase.from('live_session_applications').select('*').eq('session_id', sessionId).order('created_at', { ascending: false });
  const apps = (data ?? []).map(rowToApp);
  const profiles = await profilesById(apps.map(a => a.studentId));
  return apps.map(a => ({ ...a, student: profiles.get(a.studentId) ? { name: profiles.get(a.studentId).name, avatarUrl: profiles.get(a.studentId).avatar_url ?? null } : undefined }));
}

/** Instructor accepts: sets date/time, fee and (optionally) this booking's
 *  meeting link. Free -> confirmed straight away; paid -> awaiting payment. */
export async function acceptApplication(app: LiveApplication, session: LiveSession, input: { scheduledAt: string; fee: number; currency: string; meetingLink?: string }): Promise<string | null> {
  const free = !(input.fee > 0);
  let link = input.meetingLink?.trim() || '';
  if (!link) link = await getSessionLinkForInstructor(session.id);
  if (link && !/^https?:\/\/\S+$/i.test(link)) return 'The meeting link must start with https://';
  const { error } = await supabase.from('live_session_applications').update({
    status: free ? 'confirmed' : 'awaiting_payment', scheduled_at: new Date(input.scheduledAt).toISOString(),
    fee: free ? 0 : input.fee, currency: input.currency, meeting_link: link || null, updated_at: new Date().toISOString(),
  }).eq('id', app.id).eq('status', 'applied');
  return error ? error.message : null;
}

export async function updateApplicationStatus(id: string, status: ApplicationStatus): Promise<boolean> {
  const { error } = await supabase.from('live_session_applications').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  return !error;
}

/** Instructor adds/changes the link on a booking later. */
export async function setApplicationLink(id: string, link: string): Promise<string | null> {
  const l = link.trim();
  if (l && !/^https?:\/\/\S+$/i.test(l)) return 'The meeting link must start with https://';
  const { error } = await supabase.from('live_session_applications').update({ meeting_link: l || null, updated_at: new Date().toISOString() }).eq('id', id);
  return error ? error.message : null;
}

export async function getMyBookings(studentId: string): Promise<LiveApplication[]> {
  const { data } = await supabase.from('live_session_applications').select('*').eq('student_id', studentId).order('created_at', { ascending: false });
  const apps = (data ?? []).map(rowToApp);
  if (!apps.length) return [];
  const { data: ss } = await supabase.from('live_sessions').select('*').in('id', [...new Set(apps.map(a => a.sessionId))]);
  const sessions = new Map((ss ?? []).map((r: any) => [r.id, rowToSession(r)]));
  const profiles = await profilesById([...sessions.values()].map(s => s.instructorId));
  return apps.map(a => {
    const s = sessions.get(a.sessionId);
    const p = s && profiles.get(s.instructorId);
    if (s && p) s.instructor = { id: p.id, name: p.name, username: p.username ?? null, avatarUrl: p.avatar_url ?? null };
    // The meeting link only reaches the UI for a confirmed booking.
    return { ...a, session: s, meetingLink: a.status === 'confirmed' ? a.meetingLink : null };
  });
}

export function joinLabel(p: MeetingPlatform) { return p === 'zoom' ? 'Join Zoom session' : 'Join Teams session'; }
export function formatFee(fee: number | null | undefined, currency: string | null | undefined) {
  return !fee ? 'Free' : new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'CAD' }).format(fee);
}
