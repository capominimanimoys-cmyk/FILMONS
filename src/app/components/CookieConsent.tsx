/**
 * FILMONS cookie consent — a bottom banner on first visit, plus a
 * preferences modal reachable from the banner or from
 * Settings -> Privacy & Safety -> Cookie Preferences (see
 * PrivacySettings.tsx). Separate from the legal Terms of Service /
 * Privacy Policy agreement checkbox at signup (see CreateAccount.tsx) --
 * this is about cookies specifically, that is a broader legal agreement.
 * Persisted via cookieConsent.ts (localStorage); never re-shown once a
 * valid preference is saved, except when reopened deliberately from
 * Settings.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Cookie, X } from 'lucide-react';
import {
  CookiePreferences, getCookiePreferences, saveCookiePreferences,
  acceptAllCookies, acceptNecessaryOnly,
} from '../lib/cookieConsent';

// A module-level callback so PrivacySettings.tsx's "Cookie Preferences"
// row can reopen this same modal without needing its own duplicate copy
// of the preferences UI, and without lifting state up into Root.tsx.
let openPreferencesExternally: (() => void) | null = null;
export function openCookiePreferences() {
  openPreferencesExternally?.();
}

function CategoryRow({ title, description, locked, on, onChange }: {
  title: string; description: string; locked?: boolean; on: boolean; onChange?: () => void;
}) {
  return (
    <div className="py-3.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        {locked ? (
          <span className="shrink-0 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Always active</span>
        ) : (
          <button onClick={onChange}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${on ? 'bg-blue-600' : 'bg-gray-200'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${on ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`}/>
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}

function PreferencesModal({ initial, onClose, onSave }: {
  initial: CookiePreferences | null;
  onClose: () => void;
  onSave: (prefs: CookiePreferences) => void;
}) {
  const [functional, setFunctional] = useState(initial?.functional ?? false);
  const [analytics, setAnalytics] = useState(initial?.analytics ?? false);
  const [marketing, setMarketing] = useState(initial?.marketing ?? false);

  const save = () => onSave(saveCookiePreferences({ functional, analytics, marketing }));
  const acceptAll = () => onSave(acceptAllCookies());

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-white">
          <p className="text-base font-black text-gray-900">Cookie preferences</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        <div className="px-5">
          <CategoryRow
            title="Strictly Necessary" locked on
            description="Required for sign-in, security, account sessions, marketplace functionality, and saving your privacy choices."
          />
          <CategoryRow
            title="Functional" on={functional} onChange={() => setFunctional(v => !v)}
            description="Remember settings and preferences to provide a more personalized experience."
          />
          <CategoryRow
            title="Analytics" on={analytics} onChange={() => setAnalytics(v => !v)}
            description="Help FILMONS understand how people use the platform, which features are useful, and where improvements are needed."
          />
          <CategoryRow
            title="Marketing" on={marketing} onChange={() => setMarketing(v => !v)}
            description="Used for advertising or measuring marketing campaigns if FILMONS introduces these technologies."
          />
        </div>
        <div className="px-5 pb-5 pt-4 flex flex-col gap-2" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
          <button onClick={save} className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-bold text-sm active:opacity-80">
            Save preferences
          </button>
          <button onClick={acceptAll} className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold text-sm active:opacity-80">
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

export function CookieConsent() {
  const [prefs, setPrefs] = useState<CookiePreferences | null | undefined>(undefined);
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    setPrefs(getCookiePreferences());
    openPreferencesExternally = () => setShowPreferences(true);
    return () => { openPreferencesExternally = null; };
  }, []);

  // Not yet resolved (avoids a flash of the banner before localStorage is
  // read) or already consented and not deliberately reopened from Settings.
  if (prefs === undefined) return null;
  if (prefs && !showPreferences) return null;

  return (
    <>
      {!prefs && !showPreferences && (
        <div
          className="fixed inset-x-0 bottom-0 z-[190] bg-white border-t border-gray-200 shadow-[0_-4px_24px_rgba(0,0,0,0.12)] px-4 py-4 sm:px-6"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-2xl mx-auto">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Cookie className="w-4.5 h-4.5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-black text-gray-900 mb-1">Your privacy matters</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  FILMONS uses necessary cookies to keep the platform secure, remember your preferences, and provide essential features. With your permission, we may also use analytics cookies to understand how FILMONS is used and improve the experience.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPrefs(acceptAllCookies())}
                className="flex-1 min-w-[110px] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold active:opacity-80 transition-colors"
              >
                Accept all
              </button>
              <button
                onClick={() => setPrefs(acceptNecessaryOnly())}
                className="flex-1 min-w-[110px] py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 active:opacity-80 transition-colors"
              >
                Necessary only
              </button>
              <button
                onClick={() => setShowPreferences(true)}
                className="flex-1 min-w-[130px] py-2.5 text-blue-600 text-xs font-bold hover:bg-blue-50 rounded-xl active:opacity-80 transition-colors"
              >
                Manage preferences
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2.5">
              See our <Link to="/cookie-policy" className="underline hover:text-gray-600">Cookie Policy</Link> and <Link to="/privacy-policy" className="underline hover:text-gray-600">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      )}

      {showPreferences && (
        <PreferencesModal
          initial={prefs ?? null}
          onClose={() => setShowPreferences(false)}
          onSave={(saved) => { setPrefs(saved); setShowPreferences(false); }}
        />
      )}
    </>
  );
}
