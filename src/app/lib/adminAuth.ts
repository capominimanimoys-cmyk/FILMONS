// Client side of the admin identity system — see supabase/functions/
// admin-login and _shared/adminAuth.ts. Replaces AdminVerifications.tsx's
// old sessionStorage.adminAuthenticated/adminName flags (a shared password
// with no server-side check) with a real per-admin login that returns a
// signed, expiring token every sensitive admin edge function now verifies.
import { projectId, publicAnonKey } from '/utils/supabase/info';

const TOKEN_KEY = 'filmons_admin_token';
const NAME_KEY = 'filmons_admin_name';
const ROLE_KEY = 'filmons_admin_role';

export interface AdminSession {
  token: string;
  name: string;
  role: 'super_admin' | 'support_agent';
}

export const adminAuth = {
  async login(name: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { success: false, error: data.error || 'Login failed' };
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(NAME_KEY, data.name);
      sessionStorage.setItem(ROLE_KEY, data.role);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  },

  logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(NAME_KEY);
    sessionStorage.removeItem(ROLE_KEY);
  },

  getToken(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
  },

  getAdmin(): AdminSession | null {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const name = sessionStorage.getItem(NAME_KEY);
    const role = sessionStorage.getItem(ROLE_KEY) as AdminSession['role'] | null;
    if (!token || !name || !role) return null;
    return { token, name, role };
  },

  isAuthenticated(): boolean {
    return !!sessionStorage.getItem(TOKEN_KEY);
  },

  authHeader(): Record<string, string> {
    const token = sessionStorage.getItem(TOKEN_KEY);
    return token ? { 'X-Admin-Token': token } : {};
  },
};
