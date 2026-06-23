// src/test/auth/authFlow.integration.test.tsx
import React from 'react';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../../app/context/AuthContext';
import { Login } from '../../app/pages/Login';
import { authApi } from '../../app/lib/api';
import { mockSupabaseAuth } from '../mocks/supabase';
import emailjs from '@emailjs/browser';

// ---------------------------------------------------------------------------
// Static mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

// Spy on useNavigate without breaking MemoryRouter / Link / useLocation
const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router')>();
  return { ...mod, useNavigate: () => mockNavigate };
});

// Login.tsx imports a Figma-generated component whose children import
// figma:asset/* virtual modules — these don't resolve in jsdom.
vi.mock('../../imports/CreateCommercialImageForFilmons-2178-1130', () => ({
  default: () => null,
}));

vi.mock('@emailjs/browser', () => ({
  default: {
    init: vi.fn(),
    send: vi.fn().mockResolvedValue({ status: 200, text: 'OK' }),
  },
}));

// Prevent seedDemoData (called inside completeLogin) from firing real fetches
vi.mock('../../app/lib/initializeData', () => ({
  seedDemoData: vi.fn().mockResolvedValue(undefined),
}));

// Side-effect import: registers vi.mock('../../lib/supabase', …)
import '../mocks/supabase';

// ---------------------------------------------------------------------------
// Global stubs
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// HeroPanel uses ResizeObserver which doesn't exist in jsdom
vi.stubGlobal(
  'ResizeObserver',
  vi.fn(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() })),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  accountType: 'renter' as const,
  phone: undefined,
  avatar: undefined,
  followers: [],
  following: [],
};

function ok(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

function err(body: unknown, status = 400): Promise<Response> {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

// Render Login inside router + auth context and wait for initialisation
async function renderLogin() {
  render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
  // AuthProvider renders a loading div until isInitialized flips to true;
  // wait for the Sign In tab button to prove the form is visible.
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: /sign in/i }).length).toBeGreaterThan(0)
  );
}

// Switch to the "Create Account" tab
async function switchToSignup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Create Account' }));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Full Authentication Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockNavigate.mockReset();
    // Default: any unmatched fetch resolves to an empty-user response
    mockFetch.mockResolvedValue(ok({ user: null }));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // ── Test 1: Signup form initiation ────────────────────────────────────────
  // Filling the signup form and submitting it should trigger an EmailJS send
  // and open the verification dialog.

  it('should submit signup form, send verification email, and open dialog', async () => {
    const user = userEvent.setup();
    await renderLogin();

    await switchToSignup(user);

    // Fill: name (placeholder "Jane Smith"), email, password
    await user.type(screen.getByLabelText(/full name/i),      'Test User');
    await user.type(screen.getByLabelText(/email address/i),  'test@example.com');
    await user.type(screen.getByLabelText(/password/i),       'password123');

    // Submit — button text is "Continue with Email"
    await user.click(screen.getByRole('button', { name: /continue with email/i }));

    await waitFor(() => {
      // EmailJS was called with the right service + template
      expect(emailjs.send).toHaveBeenCalledWith(
        'service_s6wwjtj',
        'template_p5pgn33',
        expect.objectContaining({
          to_email: 'test@example.com',
          to_name:  'Test User',
          verification_code: expect.stringMatching(/^\d{6}$/),
        }),
        'iSSpIM-AeV9uUQ7Jt',
      );
    });

    // Verification dialog must be visible
    await waitFor(() => {
      expect(screen.getByText('Verify your email')).toBeInTheDocument();
    });
  });

  // ── Test 2: Login form initiation ─────────────────────────────────────────
  // Submitting the login form should hit the server, send a verification email
  // (with the hardcoded code '000000'), and open the dialog.

  it('should submit login form, call server, send verification email, and open dialog', async () => {
    // authApi.signin → GET /users/by-email/:email
    mockFetch.mockResolvedValueOnce(ok({ user: mockUser }));

    const user = userEvent.setup();
    await renderLogin();

    // Login tab is active by default
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i),      'password123');

    // Both the "Sign In" tab and the submit button share the same accessible name;
    // the submit button is always the last one in DOM order.
    const signInBtns = screen.getAllByRole('button', { name: /^sign in$/i });
    await user.click(signInBtns[signInBtns.length - 1]);

    await waitFor(() => {
      // Server was queried for the user by email
      const fetchedUrl: string = mockFetch.mock.calls[0][0];
      expect(fetchedUrl).toContain('/users/by-email/');
      expect(fetchedUrl).toContain('test%40example.com');
    });

    await waitFor(() => {
      // EmailJS was called — login always sends the server-returned code '000000'
      expect(emailjs.send).toHaveBeenCalledWith(
        'service_s6wwjtj',
        'template_p5pgn33',
        expect.objectContaining({
          to_email:          'test@example.com',
          verification_code: '000000',
        }),
        'iSSpIM-AeV9uUQ7Jt',
      );
    });

    // Dialog must open with the login-specific heading
    await waitFor(() => {
      expect(screen.getByText('Check your inbox')).toBeInTheDocument();
    });
  });

  // ── Test 3: Complete login with correct code ──────────────────────────────
  // After the dialog opens the user types the code ('000000' for email login),
  // submits it, completeLogin fetches the user from the server, and navigate
  // is called with '/'.

  it('should complete full email login flow with correct verification code', async () => {
    // Call 1: authApi.signin  → GET /users/by-email
    // Call 2: completeLogin   → GET /users/by-email (server refresh)
    mockFetch
      .mockResolvedValueOnce(ok({ user: mockUser }))
      .mockResolvedValueOnce(ok({ user: mockUser }));

    const user = userEvent.setup();
    await renderLogin();

    // ── Step 1: submit login form ──
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i),      'password123');

    const signInBtns = screen.getAllByRole('button', { name: /^sign in$/i });
    await user.click(signInBtns[signInBtns.length - 1]);

    // ── Step 2: dialog appears ──
    await waitFor(() =>
      expect(screen.getByText('Check your inbox')).toBeInTheDocument()
    );

    // ── Step 3: enter the verification code ──
    // authApi.signin always returns verificationCode: '000000'
    const codeInput = screen.getByLabelText(/6-digit verification code/i);
    await user.type(codeInput, '000000');

    // ── Step 4: click "✓ Verify & Sign In" ──
    const verifyBtn = screen.getByRole('button', { name: /verify & sign in/i });
    await user.click(verifyBtn);

    // ── Step 5: completeLogin should navigate to home ──
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  // ── Test 4: Signup → email already taken (localStorage check) ────────────
  // If the email is already in localStorage the form should show a toast error
  // without opening the dialog or calling EmailJS.

  it('should block signup when email already exists in localStorage', async () => {
    localStorage.setItem(
      'filmons_users',
      JSON.stringify([{ ...mockUser, id: 'existing-id' }]),
    );

    const user = userEvent.setup();
    await renderLogin();
    await switchToSignup(user);

    await user.type(screen.getByLabelText(/full name/i),     'Test User');
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i),      'password123');

    await user.click(screen.getByRole('button', { name: /continue with email/i }));

    // EmailJS must NOT have been called — no dialog, no code sent
    await waitFor(() => {
      expect(emailjs.send).not.toHaveBeenCalled();
    });

    // Dialog must remain closed
    expect(screen.queryByText('Verify your email')).toBeNull();
  });

  // ── Test 5: Login with non-existent email ─────────────────────────────────
  // Server returns no user → authApi.signin throws → toast error, no dialog.

  it('should show error when login email does not exist on server', async () => {
    mockFetch.mockResolvedValueOnce(ok({ user: null })); // no user found

    const user = userEvent.setup();
    await renderLogin();

    await user.type(screen.getByLabelText(/email address/i), 'nobody@example.com');
    await user.type(screen.getByLabelText(/password/i),      'password123');

    const signInBtns = screen.getAllByRole('button', { name: /^sign in$/i });
    await user.click(signInBtns[signInBtns.length - 1]);

    await waitFor(() => {
      // Dialog must remain closed
      expect(screen.queryByText('Check your inbox')).toBeNull();
      // EmailJS must not have been called
      expect(emailjs.send).not.toHaveBeenCalled();
    });
  });

  // ── Test 6: Phone OTP signup — authApi integration ───────────────────────
  // Tests the full authApi phone flow end-to-end (signupWithPhone →
  // completePhoneSignup) without rendering any page component.

  it('should complete phone OTP signup flow via authApi', async () => {
    const phoneUser = {
      id: 'phone-user-id',
      name: 'Phone User',
      phone: '+14165550100',
      accountType: 'renter' as const,
    };

    // signupWithPhone → GET /users/by-phone/:normalized (new number)
    mockFetch.mockResolvedValueOnce(ok({ user: null }));
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'msg-id' },
      error: null,
    });

    // Phase 1: send OTP
    const signupResult = await authApi.signupWithPhone('+14165550100');
    expect(signupResult).toEqual({ needsVerification: true });
    expect(mockSupabaseAuth.signInWithOtp).toHaveBeenCalledWith({
      phone: '+14165550100',
    });

    // completePhoneSignup → verifyOtp (Supabase) + POST /users (fetch)
    mockSupabaseAuth.verifyOtp.mockResolvedValue({
      data: {
        user: { id: 'supabase-id', phone: '+14165550100' },
        session: { access_token: 'test-token' },
      },
      error: null,
    });
    mockFetch.mockResolvedValueOnce(ok({ user: phoneUser }));

    // Phase 2: verify OTP and create profile
    const createdUser = await authApi.completePhoneSignup(
      '+14165550100',
      '123456',
      'Phone User',
      undefined,
      'renter',
    );

    expect(mockSupabaseAuth.verifyOtp).toHaveBeenCalledWith({
      phone:  '+14165550100',
      token:  '123456',
      type:   'sms',
    });

    // Fetch POST /users must have been called
    const postCall = mockFetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) =>
        url.includes('/users') && init?.method === 'POST',
    );
    expect(postCall).toBeDefined();

    // Created user is returned and session is saved to localStorage
    expect(createdUser.name).toBe('Phone User');
    expect(localStorage.getItem('filmons_current_user')).not.toBeNull();
  });
});
