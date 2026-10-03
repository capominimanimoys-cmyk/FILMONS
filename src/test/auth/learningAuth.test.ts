import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { auth: {} } }));
vi.mock('../../app/context/AuthContext', () => ({ buildHandoffUrl: (u: string) => u }));

import { resolveLearningReturnTo, toFilmonsLearningPath, learningLoginPath } from '../../app/lib/learningAuth';
import { sanitizeReturnUrl, pendingAuthStep } from '../../app/lib/authReturnUrl';

describe('Learning sign-in return URLs', () => {
  it('accepts Learning-relative paths', () => {
    expect(resolveLearningReturnTo('/course/abc')).toBe('/course/abc');
    expect(resolveLearningReturnTo('/course/abc?checkout=1')).toBe('/course/abc?checkout=1');
  });

  it('falls back to Learning home for missing, external or auth-page targets', () => {
    expect(resolveLearningReturnTo(null)).toBe('/');
    expect(resolveLearningReturnTo('https://evil.example')).toBe('/');
    expect(resolveLearningReturnTo('//evil.example')).toBe('/');
    expect(resolveLearningReturnTo('/\\evil.example')).toBe('/');
    expect(resolveLearningReturnTo('/login')).toBe('/');
    expect(resolveLearningReturnTo('/signup?x=1')).toBe('/');
  });

  it('maps to the filmons.app address and never stores the Learning auth pages as a return URL', () => {
    expect(toFilmonsLearningPath('/')).toBe('/learning');
    expect(toFilmonsLearningPath('/course/abc')).toBe('/learning/course/abc');
    expect(sanitizeReturnUrl('/learning/login')).toBeNull();
    expect(sanitizeReturnUrl('/learning/course/abc')).toBe('/learning/course/abc');
  });

  it('builds sign-in links that carry the destination', () => {
    expect(learningLoginPath('/')).toBe('/login');
    expect(learningLoginPath('/course/abc')).toBe('/login?returnTo=%2Fcourse%2Fabc');
  });

  it('applies the same post-sign-in gates as the main app', () => {
    const done = { username: 'maya', emailVerified: true };
    expect(pendingAuthStep(done, true)).toBeNull();
    expect(pendingAuthStep(done, null)).toBeNull();
    expect(pendingAuthStep(done, false)).toBe('/verify-device');
    expect(pendingAuthStep({ username: 'maya', emailVerified: false }, true)).toBe('/verify-email');
    expect(pendingAuthStep({ emailVerified: true }, true)).toBe('/onboarding');
  });
});
