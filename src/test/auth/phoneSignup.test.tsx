// src/test/auth/phoneSignup.test.tsx
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { authApi } from '../../app/lib/api';
// Side-effect import: registers vi.mock('../../lib/supabase', …)
import { mockSupabaseAuth } from '../mocks/supabase';

// ---------------------------------------------------------------------------
// Static mocks
// ---------------------------------------------------------------------------

// Prevent seedDemoData from firing real fetch calls inside AuthContext effects
vi.mock('../../app/lib/initializeData', () => ({
  seedDemoData: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Successful JSON response */
function ok(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Error JSON response */
function err(body: unknown, status = 400): Promise<Response> {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

// ---------------------------------------------------------------------------
// Test component
//
// Mirrors the real PhoneSignup.tsx flow:
//   step "phone"  → authApi.signupWithPhone  (server duplicate check + Supabase OTP)
//   step "verify" → authApi.completePhoneSignup
//                    └─ authApi.verifyPhoneOTP  (supabase.auth.verifyOtp)
//                    └─ POST /users             (fetch)
//                    └─ saveSession             (localStorage)
// ---------------------------------------------------------------------------

function TestPhoneSignup() {
  const [phone, setPhone]           = useState('');
  const [name, setName]             = useState('');
  const [code, setCode]             = useState('');
  const [step, setStep]             = useState<'phone' | 'verify'>('phone');
  const [error, setError]           = useState('');
  const [currentUser, setCurrentUser] = useState<{ name: string } | null>(null);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await authApi.signupWithPhone(phone);
      setStep('verify');
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // completePhoneSignup = verifyPhoneOTP (supabase) + POST /users (fetch)
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = await authApi.completePhoneSignup(
        phone,
        code,
        name || 'Test User',
        undefined,
        'renter',
      );
      setCurrentUser(user);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      {step === 'phone' ? (
        <form onSubmit={handleSendOTP}>
          <input
            data-testid="phone-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
          />
          <input
            data-testid="name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
          <button type="submit">Send OTP</button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOTP}>
          <input
            data-testid="code-input"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Verification Code"
          />
          <button type="submit">Verify</button>
        </form>
      )}
      {error && <div data-testid="error-message">{error}</div>}
      {currentUser && (
        <div data-testid="user-authenticated">{currentUser.name}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Phone Signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    // Default fallback for any unmatched fetch (e.g. stray background calls)
    mockFetch.mockResolvedValue(ok({ user: null }));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // ── Test 1: OTP sent for a new phone number ─────────────────────────────

  it('should send OTP to phone number', async () => {
    // authApi.signupWithPhone → GET /users/by-phone/:normalized (phone is new)
    mockFetch.mockResolvedValueOnce(ok({ user: null }));
    // Supabase delivers the OTP
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    const user = userEvent.setup();
    render(<TestPhoneSignup />);

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'),  'Test User');
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      // Supabase was called with the formatted number
      expect(mockSupabaseAuth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+1234567890',
      });
      // UI advanced to the verification step
      expect(screen.getByTestId('code-input')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('error-message')).toBeNull();
  });

  // ── Test 2: Phone number normalised with + prefix ───────────────────────

  it('should format phone number with + prefix if missing', async () => {
    mockFetch.mockResolvedValueOnce(ok({ user: null }));
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    const user = userEvent.setup();
    render(<TestPhoneSignup />);

    // User types number WITHOUT the leading +
    await user.type(screen.getByTestId('phone-input'), '1234567890');
    await user.type(screen.getByTestId('name-input'),  'Test User');
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      // authApi.sendPhoneOTP must have prepended the + before calling Supabase
      expect(mockSupabaseAuth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+1234567890',
      });
    });
  });

  // ── Test 3: Successful OTP verification + profile creation ──────────────

  it('should verify OTP and create profile', async () => {
    const mockUser = {
      id: 'test-user-id',
      name: 'Test User',
      phone: '+1234567890',
      accountType: 'renter',
    };

    // Phase A – Send OTP
    mockFetch.mockResolvedValueOnce(ok({ user: null }));  // GET /by-phone
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    // Phase B – completePhoneSignup:
    //   1. supabase.auth.verifyOtp  (no fetch)
    //   2. fetch POST /users
    mockSupabaseAuth.verifyOtp.mockResolvedValue({
      data: {
        user: { id: 'supabase-id', phone: '+1234567890' },
        session: { access_token: 'test-token' },
      },
      error: null,
    });
    mockFetch.mockResolvedValueOnce(ok({ user: mockUser }));  // POST /users

    const user = userEvent.setup();
    render(<TestPhoneSignup />);

    // Step 1 – send OTP
    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'),  'Test User');
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() =>
      expect(screen.getByTestId('code-input')).toBeInTheDocument()
    );

    // Step 2 – verify
    await user.type(screen.getByTestId('code-input'), '123456');
    await user.click(screen.getByText('Verify'));

    await waitFor(() => {
      expect(mockSupabaseAuth.verifyOtp).toHaveBeenCalledWith({
        phone: '+1234567890',
        token: '123456',
        type: 'sms',
      });
      // POST /users must have been called (the second fetch call)
      const postCall = mockFetch.mock.calls.find(
        ([url, init]: [string, RequestInit]) =>
          url.includes('/users') && init?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      // Created user displayed
      expect(screen.getByTestId('user-authenticated')).toHaveTextContent('Test User');
    });
  });

  // ── Test 4: Invalid OTP ─────────────────────────────────────────────────

  it('should handle invalid OTP error', async () => {
    // Phase A – Send OTP succeeds
    mockFetch.mockResolvedValueOnce(ok({ user: null }));
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    // Phase B – verifyOtp fails → completePhoneSignup throws before POSTing /users
    mockSupabaseAuth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid verification code' },
    });

    const user = userEvent.setup();
    render(<TestPhoneSignup />);

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'),  'Test User');
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() =>
      expect(screen.getByTestId('code-input')).toBeInTheDocument()
    );

    await user.type(screen.getByTestId('code-input'), '000000');
    await user.click(screen.getByText('Verify'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Invalid verification code'
      );
    });
  });

  // ── Test 5: Expired OTP ─────────────────────────────────────────────────

  it('should handle expired OTP error', async () => {
    mockFetch.mockResolvedValueOnce(ok({ user: null }));
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });
    mockSupabaseAuth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Token has expired' },
    });

    const user = userEvent.setup();
    render(<TestPhoneSignup />);

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'),  'Test User');
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() =>
      expect(screen.getByTestId('code-input')).toBeInTheDocument()
    );

    await user.type(screen.getByTestId('code-input'), '123456');
    await user.click(screen.getByText('Verify'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Token has expired'
      );
    });
  });

  // ── Test 6: Phone already registered ───────────────────────────────────
  // authApi.signupWithPhone throws immediately when the server returns an
  // existing user — it must NOT proceed to call supabase.auth.signInWithOtp.

  it('should handle phone number already registered', async () => {
    // Server returns an existing user for this phone number
    mockFetch.mockResolvedValueOnce(
      ok({ user: { id: 'existing-user', phone: '+1234567890' } })
    );

    const user = userEvent.setup();
    render(<TestPhoneSignup />);

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'),  'Test User');
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      // Error surfaced to the user
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'User with this phone number already exists'
      );
      // OTP must NOT have been dispatched for an already-registered number
      expect(mockSupabaseAuth.signInWithOtp).not.toHaveBeenCalled();
      // UI must NOT have advanced to the verify step
      expect(screen.queryByTestId('code-input')).toBeNull();
    });
  });
});
