// @ts-nocheck — Deno Edge Function file; uses npm: and https:// specifiers not understood by Node/Vite TS checker
/**
 * aiEditor.tsx — Filmons AI Editor Backend
 *
 * Routes:
 *   POST  /make-server-ec8fe879/ai-editor/command        — receive prompt, route intent, create job
 *   PATCH /make-server-ec8fe879/ai-editor/job/:id        — client reports result after processing
 *   GET   /make-server-ec8fe879/ai-editor/versions/:pid  — list post versions
 *
 * Critical rule enforced here:
 *   retouch_engine.allowGeneration = false — always, unconditionally.
 *   Skin smoothing, teeth, red-eye, dark circles → client canvas only.
 */
import { sql } from "./db.tsx";
// deno-lint-ignore no-explicit-any
type HonoApp = any;

// ── Types ─────────────────────────────────────────────────────────────────────

type Engine    = 'retouch_engine' | 'enhance_engine' | 'generative_engine' | 'caption_engine' | 'scoring_engine';
type Strength  = 'natural' | 'medium' | 'strong';
type RiskLevel = 'low' | 'medium' | 'high';

interface EditPlan {
  intent:          string;
  operation:       string;
  engine:          Engine;
  allowGeneration: boolean;
  target:          string[];
  protect:         string[];
  strength:        Strength;
  strengthValue:   number;
  risk:            RiskLevel;
}

// ── Intent Router ─────────────────────────────────────────────────────────────

function routeIntent(prompt: string): EditPlan {
  const t = prompt.toLowerCase();

  // ── Retouch Engine — NO generative AI, canvas-only ────────────────────────
  if (/smooth.?skin|skin.?tone|soften.?skin|blemish|acne|skin.?smooth|shine|oily/.test(t))
    return { intent:'skin_retouch', operation:'smooth_skin', engine:'retouch_engine', allowGeneration:false,
      target:['skin_texture'], protect:['face_shape','eyes','nose','mouth','teeth','hair','body_shape','clothing','background'],
      strength:'natural', strengthValue:0.10, risk:'low' };

  if (/fix.?teeth|whiten.?teeth|teeth|smile/.test(t))
    return { intent:'teeth_retouch', operation:'teeth_whitening', engine:'retouch_engine', allowGeneration:false,
      target:['teeth'], protect:['lips','face_shape','skin','eyes','nose','hair','background','clothing'],
      strength:'natural', strengthValue:0.10, risk:'low' };

  if (/red.?eye|redeye/.test(t))
    return { intent:'eye_retouch', operation:'red_eye_removal', engine:'retouch_engine', allowGeneration:false,
      target:['eye_pupils'], protect:['face_shape','iris','eyelashes','skin','hair','background'],
      strength:'natural', strengthValue:0.10, risk:'low' };

  if (/dark.?circle|under.?eye|eye.?bag/.test(t))
    return { intent:'shadow_retouch', operation:'reduce_dark_circles', engine:'retouch_engine', allowGeneration:false,
      target:['under_eye_area'], protect:['face_shape','eyes','nose','skin','hair','background'],
      strength:'natural', strengthValue:0.12, risk:'low' };

  if (/hair/.test(t))
    return { intent:'hair_retouch', operation:'enhance_hair', engine:'retouch_engine', allowGeneration:false,
      target:['hair'], protect:['face_shape','eyes','nose','mouth','skin','background'],
      strength:'natural', strengthValue:0.10, risk:'low' };

  if (/wrinkle|smooth.?shirt|collar|smooth.?cloth/.test(t))
    return { intent:'clothing_retouch', operation:'smooth_clothing', engine:'retouch_engine', allowGeneration:false,
      target:['clothing_surface'], protect:['face_shape','skin','hair','background'],
      strength:'natural', strengthValue:0.10, risk:'low' };

  // ── AutoFix (safe default) ────────────────────────────────────────────────
  // engine: enhance_engine | allow_generation: false | locks face, body, bg
  if (/^autofix$|auto.?fix|one.?tap|quick.?fix/.test(t))
    return { intent:'autofix', operation:'autofix', engine:'enhance_engine', allowGeneration:false,
      target:['entire_image_quality'],
      protect:['face_identity','body_shape','hair','clothing','background'],
      strength:'natural', strengthValue:0.12, risk:'low' };

  // ── Enhance Engine — quality-only, canvas ─────────────────────────────────
  if (/sharpen|unblur|crisp|fix.?blur|denoise|noise|grain/.test(t))
    return { intent:'quality_enhance', operation:'sharpen_denoise', engine:'enhance_engine', allowGeneration:false,
      target:['entire_image_sharpness'], protect:['all_content'], strength:'natural', strengthValue:0.12, risk:'low' };

  if (/light|bright|dark|exposure/.test(t))
    return { intent:'quality_enhance', operation:'improve_lighting', engine:'enhance_engine', allowGeneration:false,
      target:['entire_image_brightness'], protect:['all_content'], strength:'natural', strengthValue:0.12, risk:'low' };

  if (/color|colour|saturation|vibrant/.test(t))
    return { intent:'quality_enhance', operation:'enhance_colors', engine:'enhance_engine', allowGeneration:false,
      target:['entire_image_color'], protect:['all_content'], strength:'natural', strengthValue:0.12, risk:'low' };

  if (/resolution|upscale|4k|hd|pixelated/.test(t))
    return { intent:'quality_enhance', operation:'upscale_resolution', engine:'enhance_engine', allowGeneration:false,
      target:['entire_image_resolution'], protect:['all_content'], strength:'natural', strengthValue:1.0, risk:'low' };

  if (/hdr|dynamic.?range/.test(t))
    return { intent:'quality_enhance', operation:'hdr_effect', engine:'enhance_engine', allowGeneration:false,
      target:['entire_image_dynamic_range'], protect:['all_content'], strength:'natural', strengthValue:0.12, risk:'low' };

  // ── Caption Engine ────────────────────────────────────────────────────────
  if (/rewrite|shorter|longer|engaging/.test(t))
    return { intent:'caption_rewrite', operation:'rewrite_caption', engine:'caption_engine', allowGeneration:false,
      target:['caption_text'], protect:['image_content'], strength:'natural', strengthValue:1.0, risk:'low' };

  if (/hashtag|tags/.test(t))
    return { intent:'hashtag_generate', operation:'generate_hashtags', engine:'caption_engine', allowGeneration:false,
      target:['hashtags'], protect:['image_content'], strength:'natural', strengthValue:1.0, risk:'low' };

  if (/caption|write|describe/.test(t))
    return { intent:'caption_generate', operation:'generate_caption', engine:'caption_engine', allowGeneration:false,
      target:['caption_text'], protect:['image_content'], strength:'natural', strengthValue:1.0, risk:'low' };

  // ── Scoring Engine ────────────────────────────────────────────────────────
  if (/score|analy|insight|engagement|predict/.test(t))
    return { intent:'content_score', operation:'analyze_content', engine:'scoring_engine', allowGeneration:false,
      target:['post_metadata'], protect:['image_content'], strength:'natural', strengthValue:1.0, risk:'low' };

  // ── Segmentation (medium risk, no text-to-image) ──────────────────────────
  if (/remove.?background|no.?background|transparent/.test(t))
    return { intent:'background_remove', operation:'remove_background', engine:'generative_engine', allowGeneration:false,
      target:['background'], protect:['subject','face','clothing','hair_edges'],
      strength:'natural', strengthValue:1.0, risk:'medium' };

  if (/remove.?object|erase|delete/.test(t))
    return { intent:'object_removal', operation:'remove_object', engine:'generative_engine', allowGeneration:false,
      target:['selected_object'], protect:['person','surrounding_content'],
      strength:'natural', strengthValue:1.0, risk:'medium' };

  // ── Generative (high risk, allowGeneration: true) ─────────────────────────
  if (/blur.?background|bokeh/.test(t))
    return { intent:'background_change', operation:'blur_background', engine:'generative_engine', allowGeneration:true,
      target:['background'], protect:['subject','face','clothing'], strength:'natural', strengthValue:0.6, risk:'high' };

  if (/background/.test(t))
    return { intent:'background_change', operation:'replace_background', engine:'generative_engine', allowGeneration:true,
      target:['background'], protect:['subject','face','clothing'], strength:'natural', strengthValue:0.7, risk:'high' };

  if (/change.?cloth|change.?outfit|add.?glass|add.?hat|accessory|weather/.test(t))
    return { intent:'magic_edit', operation:'generative_edit', engine:'generative_engine', allowGeneration:true,
      target:['specified_element'], protect:['face_identity','background'],
      strength:'natural', strengthValue:0.5, risk:'high' };

  // Default: magic edit
  return { intent:'magic_edit', operation:'generative_edit', engine:'generative_engine', allowGeneration:true,
    target:['specified_element'], protect:['face_identity'],
    strength:'natural', strengthValue:0.5, risk:'high' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractUserId(authHeader: string | null): string | null {
  if (!authHeader) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub ?? null;
  } catch { return null; }
}

// ── Route registration ────────────────────────────────────────────────────────

export function registerAiEditorRoutes(app: HonoApp): void {

  // ── POST /ai-editor/command ───────────────────────────────────────────────
  app.post('/make-server-ec8fe879/ai-editor/command', async (c: HonoApp) => {
    try {
      const body = await c.req.json() as {
        postId?:  string;
        mediaUrl: string;
        prompt:   string;
        mode?:    'preview' | 'apply';
      };

      const { postId, mediaUrl, prompt } = body;
      if (!mediaUrl || !prompt) return c.json({ error: 'mediaUrl and prompt required' }, 400);

      const userId = extractUserId(c.req.header('Authorization') ?? null);

      // Route and enforce the critical rule
      const plan = routeIntent(prompt);
      if (plan.engine === 'retouch_engine') plan.allowGeneration = false;

      // Create job
      const db = sql();
      const [job] = await db`
        INSERT INTO ai_edit_jobs
          (post_id, user_id, prompt, intent, operation, engine, status, original_url)
        VALUES
          (${postId ?? null}, ${userId}, ${prompt}, ${plan.intent},
           ${plan.operation}, ${plan.engine}, 'pending', ${mediaUrl})
        RETURNING id
      `;

      return c.json({
        status:          'plan_ready',
        jobId:           job.id,
        intent:          plan.intent,
        operation:       plan.operation,
        engine:          plan.engine,
        allowGeneration: plan.allowGeneration,
        target:          plan.target,
        protect:         plan.protect,
        strength:        plan.strength,
        strengthValue:   plan.strengthValue,
        risk:            plan.risk,
        processing:      (plan.engine === 'retouch_engine' || plan.engine === 'enhance_engine')
                         ? 'client_canvas' : 'client_api',
      });

    } catch (e) {
      console.error('[ai-editor] command:', e);
      return c.json({ error: String(e) }, 500);
    }
  });

  // ── PATCH /ai-editor/job/:id — client reports result ─────────────────────
  app.patch('/make-server-ec8fe879/ai-editor/job/:id', async (c: HonoApp) => {
    try {
      const jobId = c.req.param('id');
      const body  = await c.req.json() as {
        status:      string;
        resultUrl?:  string;
        validation?: { faceSimilarity: number; bodyChanged: boolean; backgroundChanged: boolean };
      };

      const db = sql();
      await db`
        UPDATE ai_edit_jobs SET
          status      = ${body.status},
          preview_url = ${body.resultUrl ?? null},
          result_url  = ${body.resultUrl ?? null},
          validation  = ${body.validation ? JSON.stringify(body.validation) : null}
        WHERE id = ${jobId}
      `;

      // Create version entry when edit succeeds
      if (body.status === 'done' && body.resultUrl) {
        const [job] = await db`
          SELECT post_id, user_id FROM ai_edit_jobs WHERE id = ${jobId}
        `;
        if (job?.post_id) {
          const [last] = await db`
            SELECT COALESCE(MAX(version_number), 1) AS n
            FROM post_versions WHERE post_id = ${job.post_id}
          `;
          await db`
            INSERT INTO post_versions
              (post_id, user_id, version_number, media_url, edit_job_id, is_original)
            VALUES
              (${job.post_id}, ${job.user_id}, ${(last?.n ?? 1) + 1},
               ${body.resultUrl}, ${jobId}, false)
            ON CONFLICT (post_id, version_number) DO NOTHING
          `;
        }
      }

      return c.json({ status: 'updated' });

    } catch (e) {
      console.error('[ai-editor] job patch:', e);
      return c.json({ error: String(e) }, 500);
    }
  });

  // ── GET /ai-editor/versions/:postId ──────────────────────────────────────
  app.get('/make-server-ec8fe879/ai-editor/versions/:postId', async (c: HonoApp) => {
    try {
      const postId = c.req.param('postId');
      const db = sql();
      const rows = await db`
        SELECT
          v.id, v.version_number, v.media_url, v.is_original, v.created_at,
          j.intent, j.operation, j.engine
        FROM post_versions v
        LEFT JOIN ai_edit_jobs j ON j.id = v.edit_job_id
        WHERE v.post_id = ${postId}
        ORDER BY v.version_number ASC
      `;
      return c.json({ versions: rows });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });
}
