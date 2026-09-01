// Client side of the FILMONS Admin passwordless login. No token is ever
// stored here (no sessionStorage, no localStorage) -- the session lives
// entirely in an HttpOnly cookie set by admin-verify-code, invisible to
// this file's own JS. Every call goes through /api/fn/* (see
// vercel.json), a same-origin rewrite proxy to the Supabase edge
// functions -- what makes the browser attach that cookie automatically,
// with no cross-site SameSite=None/credentialed-CORS complexity.
const API_BASE = '/api/fn';

export interface AdminSession {
  name: string;
  role: 'super_admin' | 'support_agent';
}

export const adminAuth = {
  async generateCode(): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/admin-generate-code`, { method: 'POST', credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok || data.error) return { success: false, error: data.error || 'Could not send code' };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  },

  async verifyCode(code: string): Promise<{ success: boolean; error?: string; session?: AdminSession }> {
    try {
      const res = await fetch(`${API_BASE}/admin-verify-code`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { success: false, error: data.error || 'Incorrect code' };
      return { success: true, session: { name: data.name, role: data.role } };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  },

  // Confirms the HttpOnly cookie (if any) is still a valid session --
  // this is the only way this app ever knows "am I logged in", never a
  // locally-stored flag.
  async checkSession(): Promise<AdminSession | null> {
    try {
      const res = await fetch(`${API_BASE}/admin-session-check`, { credentials: 'same-origin' });
      const data = await res.json();
      return data?.authenticated ? { name: data.name, role: data.role } : null;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/admin-logout`, { method: 'POST', credentials: 'same-origin' });
    } catch {}
  },
};

// Every other admin API call (support-case-admin-action, verification
// actions, etc.) should build its URL from this so the session cookie is
// always sent -- a direct https://<project>.supabase.co/... call is
// cross-origin and won't carry an HttpOnly cookie scoped to this site.
export function adminFn(name: string): string {
  return `${API_BASE}/${name}`;
}
