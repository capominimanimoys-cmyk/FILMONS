// FILMONS cookie consent -- separate from the legal Terms/Privacy Policy
// agreement at signup (see CreateAccount.tsx). Necessary cookies are
// always on (required for sign-in, security, session, and for
// remembering this very choice); Functional, Analytics and Marketing
// default OFF until the user actively consents.
export interface CookiePreferences {
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  consentedAt: string;
}

const KEY = 'filmons_cookie_consent';

export function getCookiePreferences(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.necessary === true) return parsed as CookiePreferences;
    return null;
  } catch {
    return null;
  }
}

export function saveCookiePreferences(prefs: Omit<CookiePreferences, 'necessary' | 'consentedAt'>): CookiePreferences {
  const full: CookiePreferences = { necessary: true, ...prefs, consentedAt: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(full)); } catch {}
  return full;
}

export function acceptAllCookies(): CookiePreferences {
  return saveCookiePreferences({ functional: true, analytics: true, marketing: true });
}

export function acceptNecessaryOnly(): CookiePreferences {
  return saveCookiePreferences({ functional: false, analytics: false, marketing: false });
}
