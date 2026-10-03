// FILMONS Learning's own sign-in state. Learning uses the same FILMONS
// account (one account system), but being signed in on FILMONS does NOT
// sign you in to Learning -- the person has to sign in on Learning's own
// login page first (where an existing FILMONS session is offered as
// "Continue as [Name]"). This provider sits right under AuthProvider in
// LearningApp and re-provides AuthContext with the user hidden until a
// Learning session exists for that exact account, so every Learning page
// and provider below it (useAuth()) treats the person as signed out
// until then. The Learning login/signup pages read the real FILMONS
// session through useFilmonsSession() instead.
import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { AuthContext, AuthContextType } from './AuthContext';
import { consumeLearningSignInHandoff } from '../lib/learningAuth';

const SESSION_KEY = 'filmons_learning_session'; // FILMONS user id signed in to Learning

// A sign-in handoff only completes on landing past the auth pages -- e.g.
// pressing Back from Google onto the login page must not sign anyone in.
function onLearningAuthPage(): boolean {
  return typeof window !== 'undefined' && /\/(login|signup)\/?$/.test(window.location.pathname);
}

function readSession(): string | null {
  try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
}
function writeSession(userId: string | null) {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId);
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

interface LearningSessionValue {
  /** Mark this FILMONS account as signed in to Learning. */
  startLearningSession: (userId: string) => void;
  /** Sign out of Learning only -- the FILMONS session is left alone. */
  endLearningSession: () => void;
}

const LearningSessionContext = createContext<LearningSessionValue>({
  startLearningSession: () => {},
  endLearningSession: () => {},
});
const FilmonsSessionContext = createContext<AuthContextType | null>(null);

export function LearningSessionProvider({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  const [sessionUserId, setSessionUserId] = useState<string | null>(() => {
    // Arriving back from a Learning sign-in that finished on a FILMONS
    // page (Google, FILMONS sign-in, email verification, onboarding...):
    // that sign-in was for Learning, so start the session for it now.
    if (auth.user?.id && !onLearningAuthPage() && consumeLearningSignInHandoff()) {
      writeSession(auth.user.id);
      return auth.user.id;
    }
    return readSession();
  });

  // Same, for a FILMONS session that only resolves after mount.
  useEffect(() => {
    if (auth.user?.id && auth.user.id !== sessionUserId && !onLearningAuthPage() && consumeLearningSignInHandoff()) {
      writeSession(auth.user.id);
      setSessionUserId(auth.user.id);
    }
  }, [auth.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Signing out of FILMONS ends the Learning session too.
  useEffect(() => {
    if (!auth.user && sessionUserId) { writeSession(null); setSessionUserId(null); }
  }, [auth.user, sessionUserId]);

  const session = useMemo<LearningSessionValue>(() => ({
    startLearningSession: (userId: string) => { writeSession(userId); setSessionUserId(userId); },
    endLearningSession: () => { writeSession(null); setSessionUserId(null); },
  }), []);

  // A Learning session only counts for the account it was started with.
  const signedIn = !!auth.user && auth.user.id === sessionUserId;
  const gated = useMemo<AuthContextType>(() => (
    signedIn ? auth : { ...auth, user: null, isAuthenticated: false, deviceVerified: null }
  ), [auth, signedIn]);

  return (
    <FilmonsSessionContext.Provider value={auth}>
      <LearningSessionContext.Provider value={session}>
        <AuthContext.Provider value={gated}>{children}</AuthContext.Provider>
      </LearningSessionContext.Provider>
    </FilmonsSessionContext.Provider>
  );
}

export function useLearningSession() {
  return useContext(LearningSessionContext);
}

/** The real FILMONS session, ignoring Learning's own sign-in state --
 *  only for the Learning login/signup pages. */
export function useFilmonsSession(): AuthContextType {
  const ctx = useContext(FilmonsSessionContext);
  const fallback = useContext(AuthContext);
  return ctx ?? fallback;
}
