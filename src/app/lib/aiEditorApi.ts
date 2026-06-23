/**
 * aiEditorApi — Frontend client for the Filmons AI Editor backend.
 *
 * Flow:
 *   sendCommand()   → POST /ai-editor/command  (intent routing + job creation)
 *   completeJob()   → PATCH /ai-editor/job/:id (report result after client processing)
 *   getVersions()   → GET  /ai-editor/versions/:postId
 */
import { supabase } from '../../lib/supabase';

const BASE = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export interface CommandResponse {
  status:          'plan_ready' | 'error';
  jobId:           string;
  intent:          string;
  operation:       string;
  engine:          'retouch_engine' | 'enhance_engine' | 'generative_engine' | 'caption_engine' | 'scoring_engine';
  allowGeneration: boolean;
  target:          string[];
  protect:         string[];
  strength:        'natural' | 'medium' | 'strong';
  strengthValue:   number;
  risk:            'low' | 'medium' | 'high';
  processing:      'client_canvas' | 'client_api';
}

export interface PostVersion {
  id:             string;
  version_number: number;
  media_url:      string;
  is_original:    boolean;
  created_at:     string;
  intent?:        string;
  operation?:     string;
  engine?:        string;
}

export const aiEditorApi = {
  /** Send a natural-language command. Returns the intent-routed edit plan + jobId. */
  async sendCommand(params: {
    postId?:  string;
    mediaUrl: string;
    prompt:   string;
    mode?:    'preview' | 'apply';
  }): Promise<CommandResponse> {
    const res = await fetch(`${BASE}/make-server-ec8fe879/ai-editor/command`, {
      method:  'POST',
      headers: await authHeaders(),
      body:    JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`AI Editor command failed: ${await res.text()}`);
    return res.json();
  },

  /**
   * Report the result of a client-side edit back to the backend.
   * The backend saves the version and updates validation fields.
   */
  async completeJob(jobId: string, params: {
    status:     'done' | 'failed' | 'rejected';
    resultUrl?: string;
    validation?: {
      faceSimilarity:    number;
      bodyChanged:       boolean;
      backgroundChanged: boolean;
    };
  }): Promise<void> {
    try {
      await fetch(`${BASE}/make-server-ec8fe879/ai-editor/job/${jobId}`, {
        method:  'PATCH',
        headers: await authHeaders(),
        body:    JSON.stringify(params),
      });
    } catch (e) {
      // Non-critical — local edit already applied; just log
      console.warn('[aiEditorApi] completeJob failed (non-critical):', e);
    }
  },

  /** List all saved versions for a post (original + each edit). */
  async getVersions(postId: string): Promise<PostVersion[]> {
    try {
      const res = await fetch(`${BASE}/make-server-ec8fe879/ai-editor/versions/${postId}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) return [];
      const { versions } = await res.json();
      return versions ?? [];
    } catch { return []; }
  },
};
