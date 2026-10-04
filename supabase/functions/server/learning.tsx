/**
 * learning.tsx — FILMONS Learning server routes: course builder drafts,
 * publish validation, lesson access, progress, quiz grading, completion
 * and certificates. Mounted at /make-server-ec8fe879/learning/*.
 *
 * Why these live on the server (see migration 20240611000000_course_builder):
 *  - quiz answer keys and drafts (which contain them) are unreadable from
 *    the browser; grading happens here and correct answers are only
 *    returned after a pass or when attempts are used up
 *  - lesson media URLs/resources are only returned to enrolled students,
 *    the instructor, or (preview lessons + preview resources) anyone
 *  - progress, attempts, enrollments and certificates are only written here
 *
 * Caller identity: this app has no server-verified user session (requests
 * carry the public anon key and a userId in the body, like every other
 * route in this server). These routes check that the given user may act
 * (owner, enrolled, attempts left...), not that the caller *is* that user.
 */
import { createClient } from "npm:@supabase/supabase-js";
import { sql } from "./db.tsx";

type HonoApp = any;
const P = "/make-server-ec8fe879/learning";
const VIDEO_COMPLETE_PERCENT = 90;
const PLATFORM_FEE_BPS = 800; // 8% -- matches course_transactions.fee_bps default
const CURRENCIES = ["CAD", "USD"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let _admin: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!_admin) {
    _admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
  }
  return _admin;
}

class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}
const fail = (status: number, message: string, extra?: Record<string, unknown>) => { throw new HttpError(status, message, extra); };

function route(app: HonoApp, path: string, handler: (body: any, c: any) => Promise<unknown>) {
  app.post(`${P}${path}`, async (c: any) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      return c.json(await handler(body, c));
    } catch (e: any) {
      if (e instanceof HttpError) return c.json({ error: e.message, ...e.extra }, e.status);
      console.error(`[learning] ${path}:`, e?.message || e);
      return c.json({ error: "Something went wrong" }, 500);
    }
  });
}

function need(v: unknown, name: string): string {
  if (typeof v !== "string" || !UUID.test(v)) fail(400, `Invalid ${name}`);
  return v as string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Draft document -- the builder's working copy of a course
// ═══════════════════════════════════════════════════════════════════════════
interface DocOption { id: string; text: string }
interface DocQuestion { id: string; type: "multiple_choice" | "true_false"; prompt: string; options: DocOption[]; correctOptionId: string | null; explanation: string }
interface DocResource { id: string; name: string; url: string; fileType: string; isPreview: boolean }
interface DocVideo {
  kind: "video"; id: string; title: string; description: string;
  videoUrl: string; videoStatus: "none" | "uploading" | "processing" | "ready" | "failed"; durationSeconds: number; posterUrl: string;
  isPreview: boolean; resources: DocResource[];
  exercise: { enabled: boolean; instructions: string; expectedResult: string };
}
interface DocQuiz {
  kind: "quiz"; id: string; title: string; instructions: string; passingScore: number;
  maxAttempts: number | null; required: boolean; isFinal: boolean; questions: DocQuestion[];
}
interface DocLegacy { kind: "legacy"; id: string; title: string; type: string; content: string; videoUrl: string; durationSeconds: number; isPreview: boolean }
type DocItem = DocVideo | DocQuiz | DocLegacy;
interface DocSection { id: string; title: string; description: string; items: DocItem[] }
interface CourseDoc {
  version: 1;
  basics: { title: string; shortDescription: string; language: string; category: string; topics: string[]; level: string };
  outcomes: { outcomes: { id: string; text: string }[]; audience: string; prerequisites: string; tools: string };
  presentation: { coverUrl: string; introVideoUrl: string; introVideoStatus: string; description: string };
  sections: DocSection[];
  certificate: { enabled: boolean };
  pricing: { isFree: boolean | null; price: number; currency: string };
}

const str = (v: unknown, max = 20000) => (typeof v === "string" ? v : "").slice(0, max);

async function loadCourseOwned(courseId: string, instructorId: string) {
  const { data: course, error } = await admin().from("courses").select("*").eq("id", courseId).maybeSingle();
  if (error) throw error;
  if (!course) fail(404, "Course not found");
  if (course.instructor_id !== instructorId) fail(403, "Only the course's instructor can do this");
  return course;
}

async function canCreate(userId: string): Promise<boolean> {
  const { data } = await admin().from("profiles").select("account_type").eq("id", userId).maybeSingle();
  return data?.account_type === "professional" || data?.account_type === "business";
}

async function payoutReady(userId: string): Promise<boolean> {
  const { data } = await admin().from("payout_methods").select("provider, status, details").eq("host_id", userId);
  return (data ?? []).some((m: any) => m.status === "ready" || ((!m.provider || m.provider === "manual") && m.details));
}

/** Rebuilds a draft document from a course's live tables (used the first
 *  time a course that predates the builder, or has no draft, is edited). */
async function docFromLive(course: any): Promise<CourseDoc> {
  const db = admin();
  const { data: sections } = await db.from("course_sections").select("*").eq("course_id", course.id).order("position");
  const sectionIds = (sections ?? []).map((s: any) => s.id);
  const { data: lessons } = sectionIds.length
    ? await db.from("course_lessons").select("*").in("section_id", sectionIds).order("position")
    : { data: [] as any[] };
  const lessonIds = (lessons ?? []).map((l: any) => l.id);
  const [{ data: resources }, { data: questions }] = await Promise.all([
    lessonIds.length ? db.from("course_resources").select("*").in("lesson_id", lessonIds).order("position") : Promise.resolve({ data: [] as any[] }),
    lessonIds.length ? db.from("course_quiz_questions").select("*").in("lesson_id", lessonIds).order("position") : Promise.resolve({ data: [] as any[] }),
  ]);
  const questionIds = (questions ?? []).map((q: any) => q.id);
  const { data: keys } = questionIds.length
    ? await db.from("course_quiz_answer_keys").select("*").in("question_id", questionIds)
    : { data: [] as any[] };
  const keyMap = new Map((keys ?? []).map((k: any) => [k.question_id, k]));

  const items = (sectionId: string): DocItem[] => (lessons ?? []).filter((l: any) => l.section_id === sectionId).map((l: any): DocItem => {
    if (l.type === "quiz") {
      return {
        kind: "quiz", id: l.id, title: l.title, instructions: l.quiz_instructions ?? "", passingScore: l.quiz_passing_score ?? 70,
        maxAttempts: l.quiz_max_attempts ?? null, required: l.quiz_required ?? true, isFinal: !!l.is_final_quiz,
        questions: (questions ?? []).filter((q: any) => q.lesson_id === l.id).map((q: any) => ({
          id: q.id, type: q.type, prompt: q.prompt, options: Array.isArray(q.options) ? q.options : [],
          correctOptionId: keyMap.get(q.id)?.correct_option_id ?? null, explanation: keyMap.get(q.id)?.explanation ?? "",
        })),
      };
    }
    if (l.type === "video") {
      return {
        kind: "video", id: l.id, title: l.title, description: l.description ?? "", videoUrl: l.video_url ?? "",
        videoStatus: l.video_url ? (l.video_processing_status === "failed" ? "failed" : "ready") : "none",
        durationSeconds: l.duration_seconds ?? 0, posterUrl: l.video_poster_url ?? "", isPreview: !!l.is_preview,
        resources: (resources ?? []).filter((r: any) => r.lesson_id === l.id).map((r: any) => ({
          id: r.id, name: r.title, url: r.file_url, fileType: r.file_type ?? "", isPreview: !!r.is_preview,
        })),
        exercise: { enabled: !!(l.exercise_instructions), instructions: l.exercise_instructions ?? "", expectedResult: l.exercise_expected_result ?? "" },
      };
    }
    return { kind: "legacy", id: l.id, title: l.title, type: l.type, content: l.content ?? "", videoUrl: l.video_url ?? "", durationSeconds: l.duration_seconds ?? 0, isPreview: !!l.is_preview };
  });

  return {
    version: 1,
    basics: {
      title: course.title === "Untitled course" ? "" : (course.title ?? ""), shortDescription: course.short_description ?? "",
      language: course.language ?? "English", category: course.category ?? "", topics: course.topics ?? [],
      level: ["beginner", "intermediate", "advanced"].includes(course.level) ? course.level : "",
    },
    outcomes: {
      outcomes: (Array.isArray(course.learning_outcomes) ? course.learning_outcomes : []).map((t: string) => ({ id: crypto.randomUUID(), text: t })),
      audience: course.audience ?? "", prerequisites: course.prerequisites ?? "", tools: course.required_tools ?? "",
    },
    presentation: { coverUrl: course.cover_url ?? "", introVideoUrl: course.trailer_url ?? "", introVideoStatus: course.trailer_url ? "ready" : "none", description: course.description ?? "" },
    sections: (sections ?? []).map((s: any) => ({ id: s.id, title: s.title, description: s.description ?? "", items: items(s.id) })),
    certificate: { enabled: !!course.certificate_enabled },
    pricing: { isFree: course.status === "draft" && !course.published_at && !course.is_free && !Number(course.price) ? null : !!course.is_free, price: Number(course.price) || 0, currency: course.currency || "CAD" },
  };
}

// ── Publish validation (the builder's review checklist mirrors these) ──
interface Problem { step: number; target?: string; message: string }

function validateDoc(doc: CourseDoc, opts: { payoutReady: boolean }): Problem[] {
  const p: Problem[] = [];
  const b = doc.basics ?? {} as CourseDoc["basics"];
  if (!b.title?.trim()) p.push({ step: 1, target: "title", message: "Add a course title" });
  if (!b.shortDescription?.trim()) p.push({ step: 1, target: "shortDescription", message: "Add a short description" });
  if (!b.language?.trim()) p.push({ step: 1, target: "language", message: "Choose the teaching language" });
  if (!b.category?.trim()) p.push({ step: 1, target: "category", message: "Choose a category" });
  if (!["beginner", "intermediate", "advanced"].includes(b.level)) p.push({ step: 1, target: "level", message: "Choose a level" });
  if (!(doc.outcomes?.outcomes ?? []).some(o => o.text?.trim())) p.push({ step: 2, target: "outcomes", message: "Add at least one learning outcome" });
  if (!doc.presentation?.coverUrl) p.push({ step: 3, target: "cover", message: "Add a course cover image" });
  if (!doc.presentation?.description?.trim()) p.push({ step: 3, target: "description", message: "Add the full course description" });
  if (doc.presentation?.introVideoUrl && doc.presentation.introVideoStatus !== "ready") p.push({ step: 3, target: "intro", message: "Wait for the introduction video to finish processing" });

  const items = (doc.sections ?? []).flatMap(s => s.items.map(i => ({ s, i })));
  const videos = items.filter(x => x.i.kind === "video") as { s: DocSection; i: DocVideo }[];
  if (!videos.some(v => v.i.videoStatus === "ready" && v.i.title.trim() && v.i.durationSeconds > 0)) {
    p.push({ step: 4, target: "lessons", message: "Add at least one complete video lesson" });
  }
  for (const s of doc.sections ?? []) if (!s.title?.trim()) p.push({ step: 4, target: `section:${s.id}`, message: "Every section needs a title" });
  for (const { i } of videos) {
    if (!i.title.trim()) p.push({ step: 4, target: `item:${i.id}`, message: "A video lesson is missing its title" });
    if (i.videoStatus === "uploading" || i.videoStatus === "processing") p.push({ step: 4, target: `item:${i.id}`, message: `“${i.title || "Untitled lesson"}” is still processing` });
    else if (i.videoStatus !== "ready") p.push({ step: 4, target: `item:${i.id}`, message: `“${i.title || "Untitled lesson"}” needs a video` });
    if (i.exercise?.enabled && !i.exercise.instructions.trim()) p.push({ step: 4, target: `item:${i.id}`, message: `Add exercise instructions to “${i.title || "Untitled lesson"}”` });
    for (const r of i.resources ?? []) if (!r.name.trim() || !r.url) p.push({ step: 4, target: `item:${i.id}`, message: `A resource in “${i.title || "Untitled lesson"}” needs a name and file` });
  }
  for (const { i } of items.filter(x => x.i.kind === "quiz") as { i: DocQuiz }[]) {
    const name = `“${i.title || "Untitled quiz"}”`;
    if (!i.title.trim()) p.push({ step: 4, target: `item:${i.id}`, message: "A quiz is missing its title" });
    if (!i.questions.length) p.push({ step: 4, target: `item:${i.id}`, message: `${name} needs at least one question` });
    if (!(i.passingScore >= 1 && i.passingScore <= 100)) p.push({ step: 4, target: `item:${i.id}`, message: `${name} needs a passing score between 1 and 100%` });
    if (i.maxAttempts !== null && !(i.maxAttempts >= 1)) p.push({ step: 4, target: `item:${i.id}`, message: `${name} needs at least 1 attempt` });
    i.questions.forEach((q, n) => {
      if (!q.prompt.trim()) p.push({ step: 4, target: `item:${i.id}`, message: `Question ${n + 1} in ${name} has no text` });
      if (q.options.length < 2 || q.options.some(o => !o.text.trim())) p.push({ step: 4, target: `item:${i.id}`, message: `Question ${n + 1} in ${name} needs at least two filled-in answers` });
      if (!q.correctOptionId || !q.options.some(o => o.id === q.correctOptionId)) p.push({ step: 4, target: `item:${i.id}`, message: `Question ${n + 1} in ${name} has no correct answer` });
    });
  }

  const pr = doc.pricing ?? {} as CourseDoc["pricing"];
  if (pr.isFree === null || pr.isFree === undefined) p.push({ step: 6, target: "pricing", message: "Choose Free or Paid" });
  else if (!pr.isFree) {
    if (!(pr.price >= 1 && pr.price <= 10000)) p.push({ step: 6, target: "price", message: "Set a price between 1 and 10,000" });
    if (!CURRENCIES.includes(pr.currency)) p.push({ step: 6, target: "currency", message: "Choose a supported currency" });
    if (!opts.payoutReady) p.push({ step: 6, target: "payout", message: "Finish payout setup to publish a paid course" });
  }
  return p;
}

function docIdsValid(doc: CourseDoc): boolean {
  for (const s of doc.sections ?? []) {
    if (!UUID.test(s.id)) return false;
    for (const i of s.items ?? []) {
      if (!UUID.test(i.id)) return false;
      if (i.kind === "quiz") for (const q of i.questions) if (!UUID.test(q.id)) return false;
      if (i.kind === "video") for (const r of i.resources) if (!UUID.test(r.id)) return false;
    }
  }
  return true;
}

/** Writes the draft into the live course tables in one transaction. Ids
 *  come from the draft, so unchanged lessons keep their ids -- and with
 *  them every student's progress and quiz history. */
async function applyDoc(course: any, doc: CourseDoc, ownershipConfirmed: boolean) {
  const db = sql();
  const b = doc.basics, o = doc.outcomes, pr = doc.presentation, price = doc.pricing;
  await db.begin(async (tx: any) => {
    await tx`
      UPDATE public.courses SET
        title = ${b.title.trim()}, short_description = ${b.shortDescription.trim()}, description = ${pr.description.trim()},
        category = ${b.category}, topics = ARRAY(SELECT jsonb_array_elements_text(${tx.json(b.topics.slice(0, 10))}::jsonb)), level = ${b.level}, language = ${b.language},
        learning_outcomes = ${tx.json(o.outcomes.map(x => x.text.trim()).filter(Boolean))}::jsonb,
        audience = ${o.audience.trim() || null}, prerequisites = ${o.prerequisites.trim() || null}, required_tools = ${o.tools.trim() || null},
        cover_url = ${pr.coverUrl}, trailer_url = ${pr.introVideoUrl || null},
        certificate_enabled = ${!!doc.certificate.enabled},
        is_free = ${!!price.isFree}, price = ${price.isFree ? 0 : price.price}, currency = ${price.currency || "CAD"},
        status = 'published', published_at = COALESCE(published_at, now()), unpublished_at = NULL,
        ownership_confirmed_at = ${ownershipConfirmed ? new Date().toISOString() : null}::timestamptz,
        has_draft_changes = false, updated_at = now()
      WHERE id = ${course.id}`;

    // Ids come from the draft: refuse any that already belong to another
    // course, so an upsert can never pull someone else's lesson in.
        const foreign = await tx`
      SELECT 1 FROM public.course_sections WHERE id = ANY(ARRAY(SELECT jsonb_array_elements_text(${tx.json(doc.sections.map(s => s.id))}::jsonb))::uuid[]) AND course_id <> ${course.id}
      UNION ALL
      SELECT 1 FROM public.course_lessons l JOIN public.course_sections s ON s.id = l.section_id
      WHERE l.id = ANY(ARRAY(SELECT jsonb_array_elements_text(${tx.json(doc.sections.flatMap(s => s.items.map(i => i.id)))}::jsonb))::uuid[]) AND s.course_id <> ${course.id}
      LIMIT 1`;
    if (foreign.length) throw new HttpError(400, "Invalid ids in course draft");

    for (const [si, s] of doc.sections.entries()) {
      await tx`
        INSERT INTO public.course_sections (id, course_id, title, description, position)
        VALUES (${s.id}, ${course.id}, ${s.title.trim()}, ${s.description.trim() || null}, ${si})
        ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, position = EXCLUDED.position`;
      for (const [ii, i] of s.items.entries()) {
        const row: Record<string, unknown> = {
          id: i.id, section_id: s.id, title: i.title.trim() || "Untitled", position: ii,
          type: i.kind === "legacy" ? i.type : i.kind,
          description: i.kind === "video" ? (i.description.trim() || null) : null,
          content: i.kind === "legacy" ? (i.content || null) : null,
          video_url: i.kind === "video" ? i.videoUrl : i.kind === "legacy" ? (i.videoUrl || null) : null,
          video_poster_url: i.kind === "video" ? (i.posterUrl || null) : null,
          video_processing_status: i.kind === "video" ? "ready" : null,
          duration_seconds: i.kind === "video" || i.kind === "legacy" ? Math.round(i.durationSeconds || 0) || null : null,
          is_preview: i.kind === "quiz" ? false : !!i.isPreview,
          exercise_instructions: i.kind === "video" && i.exercise.enabled ? i.exercise.instructions.trim() : null,
          exercise_expected_result: i.kind === "video" && i.exercise.enabled ? (i.exercise.expectedResult.trim() || null) : null,
          quiz_instructions: i.kind === "quiz" ? (i.instructions.trim() || null) : null,
          quiz_passing_score: i.kind === "quiz" ? Math.round(i.passingScore) : 70,
          quiz_max_attempts: i.kind === "quiz" ? i.maxAttempts : null,
          quiz_required: i.kind === "quiz" ? !!i.required : true,
          is_final_quiz: i.kind === "quiz" ? !!i.isFinal : false,
        };
        await tx`
          INSERT INTO public.course_lessons ${tx(row)}
          ON CONFLICT (id) DO UPDATE SET
            section_id = EXCLUDED.section_id, title = EXCLUDED.title, position = EXCLUDED.position, type = EXCLUDED.type,
            description = EXCLUDED.description, content = EXCLUDED.content, video_url = EXCLUDED.video_url,
            video_poster_url = EXCLUDED.video_poster_url, video_processing_status = EXCLUDED.video_processing_status,
            duration_seconds = EXCLUDED.duration_seconds, is_preview = EXCLUDED.is_preview,
            exercise_instructions = EXCLUDED.exercise_instructions, exercise_expected_result = EXCLUDED.exercise_expected_result,
            quiz_instructions = EXCLUDED.quiz_instructions, quiz_passing_score = EXCLUDED.quiz_passing_score,
            quiz_max_attempts = EXCLUDED.quiz_max_attempts, quiz_required = EXCLUDED.quiz_required, is_final_quiz = EXCLUDED.is_final_quiz`;

        await tx`DELETE FROM public.course_resources WHERE lesson_id = ${i.id}`;
        if (i.kind === "video") {
          for (const [ri, r] of i.resources.entries()) {
            await tx`
              INSERT INTO public.course_resources (id, lesson_id, title, file_url, file_type, is_preview, position)
              VALUES (${r.id}, ${i.id}, ${r.name.trim()}, ${r.url}, ${r.fileType || null}, ${!!r.isPreview}, ${ri})`;
          }
        }
        // Questions are replaced wholesale; attempts store answers by
        // question id, so unchanged questions keep matching their history.
        await tx`DELETE FROM public.course_quiz_questions WHERE lesson_id = ${i.id}`;
        if (i.kind === "quiz") {
          for (const [qi, q] of i.questions.entries()) {
            await tx`
              INSERT INTO public.course_quiz_questions (id, lesson_id, position, type, prompt, options)
              VALUES (${q.id}, ${i.id}, ${qi}, ${q.type}, ${q.prompt.trim()}, ${tx.json(q.options.map(op => ({ id: op.id, text: op.text.trim() })))}::jsonb)`;
            await tx`
              INSERT INTO public.course_quiz_answer_keys (question_id, correct_option_id, explanation)
              VALUES (${q.id}, ${q.correctOptionId}, ${q.explanation.trim() || null})`;
          }
        }
      }
    }
    // Only now remove what the draft no longer contains: lessons moved to
    // another section were re-parented above, so deleting their old
    // section can't cascade away their progress.
    const ids = (list: string[]) => tx`ARRAY(SELECT jsonb_array_elements_text(${tx.json(list)}::jsonb))::uuid[]`;
    const sectionIds = doc.sections.map(s => s.id);
    const lessonIds = doc.sections.flatMap(s => s.items.map(i => i.id));
    await tx`
      DELETE FROM public.course_lessons
      WHERE section_id IN (SELECT id FROM public.course_sections WHERE course_id = ${course.id})
        AND NOT (id = ANY(${ids(lessonIds)}))`;
    await tx`DELETE FROM public.course_sections WHERE course_id = ${course.id} AND NOT (id = ANY(${ids(sectionIds)}))`;

    await tx`
      INSERT INTO public.course_drafts (course_id, doc, updated_at) VALUES (${course.id}, ${tx.json(doc)}::jsonb, now())
      ON CONFLICT (course_id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Access, progress, completion
// ═══════════════════════════════════════════════════════════════════════════
async function getAccess(courseId: string, userId: string | null) {
  const db = admin();
  const { data: course } = await db.from("courses").select("*").eq("id", courseId).maybeSingle();
  if (!course) fail(404, "Course not found");
  const isInstructor = !!userId && course.instructor_id === userId;
  let enrolled = false;
  if (userId && !isInstructor) {
    const { data } = await db.from("course_enrollments").select("id").eq("course_id", courseId).eq("user_id", userId).eq("status", "active").maybeSingle();
    enrolled = !!data;
  }
  // A draft is only visible to its instructor.
  if (course.status === "draft" && !isInstructor) fail(404, "Course not found");
  return { course, isInstructor, enrolled, full: isInstructor || enrolled };
}

async function requireLearner(courseId: string, userId: string) {
  const a = await getAccess(courseId, userId);
  if (!a.full) fail(403, "Enroll in this course to continue");
  return a;
}

async function loadOutline(courseId: string) {
  const db = admin();
  const { data: sections } = await db.from("course_sections").select("*").eq("course_id", courseId).order("position");
  const sectionIds = (sections ?? []).map((s: any) => s.id);
  const { data: lessons } = sectionIds.length
    ? await db.from("course_lessons").select("*").in("section_id", sectionIds).order("position")
    : { data: [] as any[] };
  const bySection = new Map<string, any[]>();
  for (const l of lessons ?? []) bySection.set(l.section_id, [...(bySection.get(l.section_id) ?? []), l]);
  const ordered = (sections ?? []).flatMap((s: any) => bySection.get(s.id) ?? []);
  return { sections: sections ?? [], bySection, lessons: ordered };
}

async function quizStates(courseId: string, userId: string, quizLessons: any[]) {
  const db = admin();
  const ids = quizLessons.map(l => l.id);
  if (!ids.length) return new Map<string, any>();
  const [{ data: attempts }, { data: grants }] = await Promise.all([
    db.from("course_quiz_attempts").select("id, lesson_id, status, score, passed, answers, started_at").eq("user_id", userId).in("lesson_id", ids),
    db.from("course_quiz_attempt_grants").select("lesson_id, attempts").eq("user_id", userId).in("lesson_id", ids),
  ]);
  const map = new Map<string, any>();
  for (const l of quizLessons) {
    const mine = (attempts ?? []).filter((a: any) => a.lesson_id === l.id);
    const submitted = mine.filter((a: any) => a.status === "submitted");
    const extra = (grants ?? []).filter((g: any) => g.lesson_id === l.id).reduce((n: number, g: any) => n + (g.attempts || 0), 0);
    const allowed = l.quiz_max_attempts == null ? null : l.quiz_max_attempts + extra;
    const passed = submitted.some((a: any) => a.passed);
    const inProgress = mine.find((a: any) => a.status === "in_progress") ?? null;
    map.set(l.id, {
      attemptsUsed: submitted.length,
      attemptsAllowed: allowed,
      bestScore: submitted.length ? Math.max(...submitted.map((a: any) => a.score ?? 0)) : null,
      passed,
      exhausted: !passed && allowed !== null && submitted.length >= allowed,
      inProgressAttemptId: inProgress?.id ?? null,
    });
  }
  return map;
}

function isRequired(l: any): boolean {
  if (l.type === "quiz") return !!l.quiz_required;
  return true; // every video (and older lesson type) must be completed
}

async function computeCompletion(course: any, userId: string, outline?: Awaited<ReturnType<typeof loadOutline>>) {
  const db = admin();
  const o = outline ?? await loadOutline(course.id);
  const required = o.lessons.filter(isRequired);
  const { data: progress } = await db.from("course_progress").select("lesson_id, completed").eq("user_id", userId).eq("course_id", course.id);
  const doneSet = new Set((progress ?? []).filter((p: any) => p.completed).map((p: any) => p.lesson_id));
  const quizzes = await quizStates(course.id, userId, required.filter((l: any) => l.type === "quiz"));
  const done = required.filter((l: any) => l.type === "quiz" ? quizzes.get(l.id)?.passed : doneSet.has(l.id));
  const complete = required.length > 0 && done.length === required.length;
  return { required: required.length, done: done.length, complete };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function certificateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `FLM-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function publicCertificate(c: any) {
  return {
    code: c.code, studentName: c.student_name, courseTitle: c.course_title, instructorName: c.instructor_name,
    completedAt: c.completed_at, issuedAt: c.issued_at, valid: !c.revoked, courseId: c.course_id,
  };
}

/** Issues the certificate once the student meets every requirement -- at
 *  most one per student per course (unique constraint), never twice. */
async function maybeIssueCertificate(course: any, userId: string) {
  const db = admin();
  const { data: existing } = await db.from("course_certificates").select("*").eq("user_id", userId).eq("course_id", course.id).maybeSingle();
  if (existing) return publicCertificate(existing);
  if (!course.certificate_enabled) return null;
  const completion = await computeCompletion(course, userId);
  if (!completion.complete) return null;
  const { data: people } = await db.from("profiles").select("id, name, username").in("id", [userId, course.instructor_id]);
  const student = (people ?? []).find((p: any) => p.id === userId);
  const instructor = (people ?? []).find((p: any) => p.id === course.instructor_id);
  for (let i = 0; i < 3; i++) {
    const { data, error } = await db.from("course_certificates").insert({
      code: certificateCode(), user_id: userId, course_id: course.id,
      student_name: student?.name || student?.username || "FILMONS learner",
      course_title: course.title, instructor_name: instructor?.name || instructor?.username || "FILMONS instructor",
    }).select("*").maybeSingle();
    if (data) return publicCertificate(data);
    // 23505 on (user_id, course_id): a parallel request already issued it.
    const { data: raced } = await db.from("course_certificates").select("*").eq("user_id", userId).eq("course_id", course.id).maybeSingle();
    if (raced) return publicCertificate(raced);
    if (error && error.code !== "23505") throw error;
  }
  return null;
}

async function completionPayload(course: any, userId: string) {
  const completion = await computeCompletion(course, userId);
  const certificate = completion.complete ? await maybeIssueCertificate(course, userId) : null;
  return { ...completion, certificateEnabled: !!course.certificate_enabled, certificate };
}

async function upsertProgress(courseId: string, lessonId: string, userId: string, patch: Record<string, unknown>) {
  const db = admin();
  const { data: existing } = await db.from("course_progress").select("*").eq("user_id", userId).eq("lesson_id", lessonId).maybeSingle();
  const row = { user_id: userId, course_id: courseId, lesson_id: lessonId, ...existing, ...patch, updated_at: new Date().toISOString() };
  delete (row as any).id;
  const { error } = await db.from("course_progress").upsert(row, { onConflict: "user_id,lesson_id" });
  if (error) throw error;
}

async function lessonInCourse(courseId: string, lessonId: string) {
  const { data: lesson } = await admin().from("course_lessons").select("*, course_sections!inner(course_id)").eq("id", lessonId).maybeSingle();
  if (!lesson || (lesson as any).course_sections?.course_id !== courseId) fail(404, "Lesson not found");
  return lesson;
}

async function quizReview(lessonId: string) {
  const db = admin();
  const { data: questions } = await db.from("course_quiz_questions").select("id, prompt, options, type").eq("lesson_id", lessonId).order("position");
  const ids = (questions ?? []).map((q: any) => q.id);
  const { data: keys } = ids.length ? await db.from("course_quiz_answer_keys").select("*").in("question_id", ids) : { data: [] as any[] };
  const km = new Map((keys ?? []).map((k: any) => [k.question_id, k]));
  return (questions ?? []).map((q: any) => ({ questionId: q.id, correctOptionId: km.get(q.id)?.correct_option_id ?? null, explanation: km.get(q.id)?.explanation ?? null }));
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════════════
export function registerLearningRoutes(app: HonoApp): void {
  // ── Builder ────────────────────────────────────────────────────────────
  route(app, "/draft/load", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    const course = await loadCourseOwned(courseId, instructorId);
    const { data: draft } = await admin().from("course_drafts").select("doc, updated_at").eq("course_id", courseId).maybeSingle();
    const doc = draft?.doc ?? await docFromLive(course);
    return {
      doc, savedAt: draft?.updated_at ?? null,
      course: { status: course.status, publishedAt: course.published_at, hasDraftChanges: !!course.has_draft_changes, ownershipConfirmedAt: course.ownership_confirmed_at },
      payoutReady: await payoutReady(instructorId), platformFeeBps: PLATFORM_FEE_BPS,
    };
  });

  route(app, "/draft/save", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    const doc = b.doc as CourseDoc;
    if (!doc || doc.version !== 1 || !Array.isArray(doc.sections)) fail(400, "Invalid course draft");
    if (!docIdsValid(doc)) fail(400, "Invalid ids in course draft");
    if (JSON.stringify(doc).length > 2_000_000) fail(413, "Course draft is too large");
    const course = await loadCourseOwned(courseId, instructorId);
    const db = admin();
    const now = new Date().toISOString();
    const { error } = await db.from("course_drafts").upsert({ course_id: courseId, doc, updated_at: now }, { onConflict: "course_id" });
    if (error) throw error;
    if (course.status === "draft") {
      // Never published: keep the course row (dashboard cards, the draft's
      // own preview) in step with the draft.
      await db.from("courses").update({
        title: str(doc.basics.title, 200).trim() || "Untitled course", short_description: str(doc.basics.shortDescription, 400).trim() || null,
        category: str(doc.basics.category, 100) || null, cover_url: str(doc.presentation.coverUrl, 2000) || null,
        level: ["beginner", "intermediate", "advanced"].includes(doc.basics.level) ? doc.basics.level : "all_levels",
        updated_at: now,
      }).eq("id", courseId);
    } else {
      await db.from("courses").update({ has_draft_changes: true }).eq("id", courseId);
    }
    return { savedAt: now };
  });

  route(app, "/draft/discard", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    const course = await loadCourseOwned(courseId, instructorId);
    if (course.status === "draft") fail(400, "This course has no published version to go back to");
    await admin().from("course_drafts").delete().eq("course_id", courseId);
    await admin().from("courses").update({ has_draft_changes: false }).eq("id", courseId);
    return { ok: true };
  });

  route(app, "/validate", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    await loadCourseOwned(courseId, instructorId);
    const { data: draft } = await admin().from("course_drafts").select("doc").eq("course_id", courseId).maybeSingle();
    if (!draft) fail(400, "Nothing to publish yet");
    return { problems: validateDoc(draft.doc, { payoutReady: await payoutReady(instructorId) }) };
  });

  route(app, "/publish", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    if (b.ownershipConfirmed !== true) fail(400, "Confirm that you own this content or have permission to use it");
    const course = await loadCourseOwned(courseId, instructorId);
    if (!(await canCreate(instructorId))) fail(403, "Only Professional and Business accounts can publish courses");
    const { data: draft } = await admin().from("course_drafts").select("doc").eq("course_id", courseId).maybeSingle();
    if (!draft) fail(400, "Nothing to publish yet");
    const doc = draft.doc as CourseDoc;
    if (!docIdsValid(doc)) fail(400, "Invalid ids in course draft");
    const problems = validateDoc(doc, { payoutReady: await payoutReady(instructorId) });
    if (problems.length) fail(422, "The course isn't ready to publish", { problems });
    await applyDoc(course, doc, true);
    return { ok: true, firstPublish: course.status === "draft" };
  });

  route(app, "/status", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    const course = await loadCourseOwned(courseId, instructorId);
    if (b.status === "unpublished") {
      if (course.status !== "published") fail(400, "Only a published course can be unpublished");
      await admin().from("courses").update({ status: "unpublished", unpublished_at: new Date().toISOString() }).eq("id", courseId);
    } else if (b.status === "published") {
      if (course.status !== "unpublished") fail(400, "Use Publish to publish a draft");
      await admin().from("courses").update({ status: "published", unpublished_at: null }).eq("id", courseId);
    } else fail(400, "Unknown status");
    return { ok: true };
  });

  route(app, "/students", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    const course = await loadCourseOwned(courseId, instructorId);
    const db = admin();
    const { data: enrollments } = await db.from("course_enrollments").select("user_id, enrolled_at, status").eq("course_id", courseId).order("enrolled_at", { ascending: false });
    const userIds = (enrollments ?? []).map((e: any) => e.user_id);
    if (!userIds.length) return { students: [] };
    const outline = await loadOutline(courseId);
    const requiredQuizzes = outline.lessons.filter((l: any) => l.type === "quiz");
    const [{ data: people }, { data: certs }] = await Promise.all([
      db.from("profiles").select("id, name, username, avatar_url").in("id", userIds),
      db.from("course_certificates").select("user_id, code").eq("course_id", courseId),
    ]);
    const students = [];
    for (const e of enrollments ?? []) {
      const completion = await computeCompletion(course, e.user_id, outline);
      const qs = await quizStates(courseId, e.user_id, requiredQuizzes);
      const person = (people ?? []).find((p: any) => p.id === e.user_id);
      students.push({
        userId: e.user_id, name: person?.name || person?.username || "Student", username: person?.username ?? null, avatar: person?.avatar_url ?? null,
        enrolledAt: e.enrolled_at, status: e.status, progressPercent: completion.required ? Math.round((completion.done / completion.required) * 100) : 0,
        complete: completion.complete, certificateCode: (certs ?? []).find((c: any) => c.user_id === e.user_id)?.code ?? null,
        exhaustedQuizzes: requiredQuizzes.filter((l: any) => l.quiz_required && qs.get(l.id)?.exhausted).map((l: any) => ({ lessonId: l.id, title: l.title })),
      });
    }
    return { students };
  });

  route(app, "/earnings", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    const course = await loadCourseOwned(courseId, instructorId);
    const { data: tx } = await admin().from("course_transactions").select("gross_amount, fee_amount, net_amount, currency, status, payout_status, created_at").eq("course_id", courseId).order("created_at", { ascending: false });
    const paid = (tx ?? []).filter((t: any) => t.status === "paid");
    const sum = (k: string) => Math.round(paid.reduce((n: number, t: any) => n + Number(t[k] || 0), 0) * 100) / 100;
    return {
      currency: course.currency || "CAD", sales: paid.length, gross: sum("gross_amount"), fees: sum("fee_amount"), net: sum("net_amount"),
      refunds: (tx ?? []).filter((t: any) => t.status === "refunded").length,
      recent: (tx ?? []).slice(0, 20),
      platformFeeBps: PLATFORM_FEE_BPS, isFree: !!course.is_free, price: Number(course.price) || 0,
    };
  });

  route(app, "/quiz/grant", async (b) => {
    const courseId = need(b.courseId, "courseId"), instructorId = need(b.instructorId, "instructorId");
    const lessonId = need(b.lessonId, "lessonId"), userId = need(b.userId, "userId");
    await loadCourseOwned(courseId, instructorId);
    const lesson = await lessonInCourse(courseId, lessonId);
    if (lesson.type !== "quiz") fail(400, "Not a quiz");
    const { error } = await admin().from("course_quiz_attempt_grants").insert({ lesson_id: lessonId, user_id: userId, granted_by: instructorId, attempts: 1 });
    if (error) throw error;
    return { ok: true };
  });

  // ── Students ───────────────────────────────────────────────────────────
  route(app, "/enroll", async (b) => {
    const courseId = need(b.courseId, "courseId"), userId = need(b.userId, "userId");
    const { course, isInstructor } = await getAccess(courseId, userId);
    if (isInstructor) return { ok: true };
    if (course.status !== "published") fail(400, "This course isn't open for new students");
    if (!course.is_free || Number(course.price) > 0) fail(402, "This course must be purchased");
    const { error } = await admin().from("course_enrollments").upsert({ user_id: userId, course_id: courseId, status: "active" }, { onConflict: "user_id,course_id", ignoreDuplicates: true });
    if (error) throw error;
    return { ok: true };
  });

  route(app, "/curriculum", async (b) => {
    const courseId = need(b.courseId, "courseId");
    const userId = typeof b.userId === "string" && UUID.test(b.userId) ? b.userId : null;
    const { course, isInstructor, enrolled, full } = await getAccess(courseId, userId);
    const db = admin();
    const outline = await loadOutline(courseId);
    const lessonIds = outline.lessons.map((l: any) => l.id);
    const [{ data: resources }, { data: qCounts }] = await Promise.all([
      lessonIds.length ? db.from("course_resources").select("*").in("lesson_id", lessonIds).order("position") : Promise.resolve({ data: [] as any[] }),
      lessonIds.length ? db.from("course_quiz_questions").select("lesson_id").in("lesson_id", lessonIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const sections = outline.sections.map((s: any) => ({
      id: s.id, title: s.title, description: s.description ?? null,
      items: (outline.bySection.get(s.id) ?? []).map((l: any) => {
        const open = full || l.is_preview;
        return {
          id: l.id, type: l.type, title: l.title, description: open ? (l.description ?? null) : null,
          durationSeconds: l.duration_seconds ?? null, isPreview: !!l.is_preview, posterUrl: l.video_poster_url ?? null,
          videoUrl: open ? (l.video_url ?? null) : null,
          content: open ? (l.content ?? null) : null,
          exercise: open && l.exercise_instructions ? { instructions: l.exercise_instructions, expectedResult: l.exercise_expected_result ?? null } : null,
          resources: (resources ?? []).filter((r: any) => r.lesson_id === l.id && (full || (l.is_preview && r.is_preview))).map((r: any) => ({
            id: r.id, name: r.title, url: r.file_url, fileType: r.file_type ?? null, isPreview: !!r.is_preview,
          })),
          quiz: l.type === "quiz" ? {
            instructions: l.quiz_instructions ?? null, passingScore: l.quiz_passing_score ?? 70, maxAttempts: l.quiz_max_attempts ?? null,
            required: !!l.quiz_required, isFinal: !!l.is_final_quiz, questionCount: (qCounts ?? []).filter((q: any) => q.lesson_id === l.id).length,
          } : null,
        };
      }),
    }));
    let progress: Record<string, unknown> = {}, quizzes: Record<string, unknown> = {}, completion = null;
    if (userId && full) {
      const { data: rows } = await db.from("course_progress").select("lesson_id, completed, watched_percent, exercise_completed, video_position_seconds").eq("user_id", userId).eq("course_id", courseId);
      progress = Object.fromEntries((rows ?? []).map((r: any) => [r.lesson_id, { completed: !!r.completed, watchedPercent: r.watched_percent ?? 0, exerciseCompleted: !!r.exercise_completed, positionSeconds: r.video_position_seconds ?? 0 }]));
      quizzes = Object.fromEntries(await quizStates(courseId, userId, outline.lessons.filter((l: any) => l.type === "quiz")));
      completion = await completionPayload(course, userId);
    }
    return {
      access: isInstructor ? "instructor" : enrolled ? "enrolled" : "preview",
      course: { id: course.id, title: course.title, status: course.status, certificateEnabled: !!course.certificate_enabled, instructorId: course.instructor_id },
      sections, progress, quizzes, completion,
    };
  });

  route(app, "/progress/video", async (b) => {
    const courseId = need(b.courseId, "courseId"), lessonId = need(b.lessonId, "lessonId"), userId = need(b.userId, "userId");
    const { course } = await requireLearner(courseId, userId);
    const lesson = await lessonInCourse(courseId, lessonId);
    if (lesson.type !== "video") fail(400, "Not a video lesson");
    const pct = Math.max(0, Math.min(100, Math.round(Number(b.watchedPercent) || 0)));
    const pos = Math.max(0, Math.round(Number(b.positionSeconds) || 0));
    const { data: existing } = await admin().from("course_progress").select("watched_percent, completed").eq("user_id", userId).eq("lesson_id", lessonId).maybeSingle();
    const watched = Math.max(existing?.watched_percent ?? 0, pct);
    const completed = !!existing?.completed || watched >= VIDEO_COMPLETE_PERCENT;
    await upsertProgress(courseId, lessonId, userId, { watched_percent: watched, video_position_seconds: pos, completed });
    const becameComplete = completed && !existing?.completed;
    return { watchedPercent: watched, completed, completion: becameComplete ? await completionPayload(course, userId) : null };
  });

  route(app, "/progress/exercise", async (b) => {
    const courseId = need(b.courseId, "courseId"), lessonId = need(b.lessonId, "lessonId"), userId = need(b.userId, "userId");
    await requireLearner(courseId, userId);
    const lesson = await lessonInCourse(courseId, lessonId);
    if (!lesson.exercise_instructions) fail(400, "This lesson has no exercise");
    await upsertProgress(courseId, lessonId, userId, { exercise_completed: b.completed !== false });
    return { ok: true };
  });

  // Older lesson types (text, image, pdf, file, link) have nothing to watch.
  route(app, "/progress/complete", async (b) => {
    const courseId = need(b.courseId, "courseId"), lessonId = need(b.lessonId, "lessonId"), userId = need(b.userId, "userId");
    const { course } = await requireLearner(courseId, userId);
    const lesson = await lessonInCourse(courseId, lessonId);
    if (lesson.type === "video" || lesson.type === "quiz") fail(400, "This lesson completes automatically");
    await upsertProgress(courseId, lessonId, userId, { completed: b.completed !== false });
    return { completion: await completionPayload(course, userId) };
  });

  route(app, "/quiz/start", async (b) => {
    const courseId = need(b.courseId, "courseId"), lessonId = need(b.lessonId, "lessonId"), userId = need(b.userId, "userId");
    await requireLearner(courseId, userId);
    const lesson = await lessonInCourse(courseId, lessonId);
    if (lesson.type !== "quiz") fail(400, "Not a quiz");
    const state = (await quizStates(courseId, userId, [lesson])).get(lessonId);
    const db = admin();
    let attemptId = state.inProgressAttemptId, answers = {};
    if (attemptId) {
      const { data } = await db.from("course_quiz_attempts").select("answers").eq("id", attemptId).maybeSingle();
      answers = data?.answers ?? {};
    } else {
      if (state.passed && b.retake !== true) fail(409, "You already passed this quiz", { state });
      if (state.attemptsAllowed !== null && state.attemptsUsed >= state.attemptsAllowed) fail(409, "No attempts left", { state });
      const { data, error } = await db.from("course_quiz_attempts").insert({ lesson_id: lessonId, course_id: courseId, user_id: userId }).select("id").single();
      if (error) throw error;
      attemptId = data.id;
    }
    const { data: questions } = await db.from("course_quiz_questions").select("id, type, prompt, options").eq("lesson_id", lessonId).order("position");
    return { attemptId, answers, questions: questions ?? [], state };
  });

  route(app, "/quiz/answer", async (b) => {
    const attemptId = need(b.attemptId, "attemptId"), userId = need(b.userId, "userId");
    const answers = b.answers && typeof b.answers === "object" ? b.answers : {};
    const { data, error } = await admin().from("course_quiz_attempts").update({ answers })
      .eq("id", attemptId).eq("user_id", userId).eq("status", "in_progress").select("id").maybeSingle();
    if (error) throw error;
    if (!data) fail(409, "This attempt was already submitted");
    return { ok: true };
  });

  route(app, "/quiz/submit", async (b) => {
    const attemptId = need(b.attemptId, "attemptId"), userId = need(b.userId, "userId");
    const db = admin();
    const { data: attempt } = await db.from("course_quiz_attempts").select("*").eq("id", attemptId).eq("user_id", userId).maybeSingle();
    if (!attempt) fail(404, "Attempt not found");
    if (attempt.status !== "in_progress") fail(409, "This attempt was already submitted");
    const { course } = await requireLearner(attempt.course_id, userId);
    const lesson = await lessonInCourse(attempt.course_id, attempt.lesson_id);
    const answers: Record<string, string> = b.answers && typeof b.answers === "object" ? b.answers : attempt.answers ?? {};
    const key = await quizReview(attempt.lesson_id);
    if (!key.length) fail(400, "This quiz has no questions");
    const correct = key.filter(k => k.correctOptionId && answers[k.questionId] === k.correctOptionId).length;
    const score = Math.round((correct / key.length) * 100); // equal points per question
    const passed = score >= (lesson.quiz_passing_score ?? 70);
    const { data: updated } = await db.from("course_quiz_attempts").update({ answers, score, passed, status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", attemptId).eq("status", "in_progress").select("id").maybeSingle();
    if (!updated) fail(409, "This attempt was already submitted");
    const state = (await quizStates(attempt.course_id, userId, [lesson])).get(lesson.id);
    const reveal = state.passed || state.exhausted;
    return {
      score, passed, correctCount: correct, questionCount: key.length, state,
      review: reveal ? key : null,
      completion: passed ? await completionPayload(course, userId) : null,
    };
  });

  route(app, "/quiz/review", async (b) => {
    const courseId = need(b.courseId, "courseId"), lessonId = need(b.lessonId, "lessonId"), userId = need(b.userId, "userId");
    await requireLearner(courseId, userId);
    const lesson = await lessonInCourse(courseId, lessonId);
    const state = (await quizStates(courseId, userId, [lesson])).get(lessonId);
    if (!(state.passed || state.exhausted)) fail(403, "Answers are shown after you pass or use all your attempts");
    const { data: last } = await admin().from("course_quiz_attempts").select("answers, score, passed").eq("user_id", userId).eq("lesson_id", lessonId).eq("status", "submitted").order("submitted_at", { ascending: false }).limit(1).maybeSingle();
    const { data: questions } = await admin().from("course_quiz_questions").select("id, type, prompt, options").eq("lesson_id", lessonId).order("position");
    return { questions: questions ?? [], review: await quizReview(lessonId), lastAttempt: last ?? null, state };
  });

  route(app, "/completion", async (b) => {
    const courseId = need(b.courseId, "courseId"), userId = need(b.userId, "userId");
    const { course } = await requireLearner(courseId, userId);
    return await completionPayload(course, userId);
  });

  route(app, "/certificates/mine", async (b) => {
    const userId = need(b.userId, "userId");
    const { data } = await admin().from("course_certificates").select("*").eq("user_id", userId).order("issued_at", { ascending: false });
    return { certificates: (data ?? []).map(publicCertificate) };
  });

  // Public verification -- certificate details only, no account data.
  app.get(`${P}/certificates/verify/:code`, async (c: any) => {
    const code = String(c.req.param("code") || "").toUpperCase();
    if (!/^FLM-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return c.json({ found: false });
    const { data } = await admin().from("course_certificates").select("*").eq("code", code).maybeSingle();
    if (!data) return c.json({ found: false });
    const { courseId: _omit, ...pub } = publicCertificate(data);
    return c.json({ found: true, certificate: { ...pub, courseId: data.course_id } });
  });
}
