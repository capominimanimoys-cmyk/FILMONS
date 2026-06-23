// src/test/auth/emailSignup.test.tsx
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AuthProvider, useAuth } from '../../app/context/AuthContext';
// Side-effect import: registers vi.mock('../../lib/supabase', …)
import '../mocks/supabase';

// ---------------------------------------------------------------------------
// Static mocks (hoisted by Vitest)
// ---------------------------------------------------------------------------

vi.mock('@emailjs/browser', () => ({
  default: {
    init: vi.fn(),
    send: vi.fn().mockResolvedValue({ status: 200 }),
  },
}));

// Mock the data-seeding helper so it doesn't fire real fetch calls
vi.mock('../../app/lib/initializeData', () => ({
  seedDemoData: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Shorthand: return a successful JSON response */
function ok(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

/** Shorthand: return an error JSON response */
function err(body: unknown, status = 400): Promise<Response> {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

// ---------------------------------------------------------------------------
// Test-only component that exercises AuthContext.signup
// ---------------------------------------------------------------------------

function TestEmailSignup() {
  const { signup, isAuthenticated } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signup(email, password, name, phone || undefined);
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          data-testid="email-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          data-testid="password-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <input
          data-testid="name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
        />
        <input
          data-testid="phone-input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
        />
        <button type="submit">Sign Up</button>
      </form>
      {error && <div data-testid="error-message">{error}</div>}
      {isAuthenticated && <div data-testid="authenticated">Authenticated</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapper — MemoryRouter because the app uses react-router (not react-router-dom)
// ---------------------------------------------------------------------------

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render and wait until AuthProvider finishes initialising */
async function renderSignup() {
  const view = render(<TestEmailSignup />, { wrapper: Wrapper });
  // AuthProvider renders a loading div while isInitialized === false.
  // It resolves synchronously when there is no cached session, but wait
  // for the form to appear just in case.
  await waitFor(() => screen.getByTestId('email-input'));
  return view;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Email Signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    // Any unmatched fetch calls (e.g. AuthProvider background refresh) should
    // resolve silently so they don't pollute the assertions below.
    mockFetch.mockResolvedValue(ok({ user: null }));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  // ── Test 1: successful signup without phone ─────────────────────────────

  it('should successfully sign up with email and password', async () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      accountType: 'renter',
    };

    // authApi.signup → POST /users
    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
      const body = JSON.parse(init?.body as string ?? '{}');
      expect(body.email).toBe('test@example.com');
      expect(body.name).toBe('Test User');
      // password is NOT forwarded to the server in this architecture
      expect(body.password).toBeUndefined();
      return ok({ user: mockUser });
    });

    const user = userEvent.setup();
    await renderSignup();

    await user.type(screen.getByTestId('email-input'),    'test@example.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.type(screen.getByTestId('name-input'),     'Test User');

    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      // fetch must have been called at least once (for the POST /users)
      expect(mockFetch).toHaveBeenCalled();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/users');
    });

    // No error should surface
    expect(screen.queryByTestId('error-message')).toBeNull();
  });

  // ── Test 2: successful signup with phone ────────────────────────────────

  it('should sign up with email, password, name, and phone', async () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      phone: '+1234567890',
      accountType: 'renter',
    };

    mockFetch.mockImplementationOnce((_url: string, init: RequestInit) => {
      const body = JSON.parse(init?.body as string ?? '{}');
      expect(body.email).toBe('test@example.com');
      expect(body.name).toBe('Test User');
      expect(body.phone).toBe('+1234567890');
      return ok({ user: mockUser });
    });

    const user = userEvent.setup();
    await renderSignup();

    await user.type(screen.getByTestId('email-input'),    'test@example.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.type(screen.getByTestId('name-input'),     'Test User');
    await user.type(screen.getByTestId('phone-input'),    '+1234567890');

    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/users');
    });

    expect(screen.queryByTestId('error-message')).toBeNull();
  });

  // ── Test 3: email already exists ────────────────────────────────────────

  it('should handle signup error - email already exists', async () => {
    // Server returns 409 with an error payload
    mockFetch.mockImplementationOnce(() =>
      err({ error: 'User already registered' }, 409)
    );

    const user = userEvent.setup();
    await renderSignup();

    await user.type(screen.getByTestId('email-input'),    'existing@example.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.type(screen.getByTestId('name-input'),     'Test User');

    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'User already registered'
      );
    });
  });

  // ── Test 4: weak password ────────────────────────────────────────────────
  // Password validation happens client-side or the server may reject it.

  it('should handle signup error - weak password', async () => {
    mockFetch.mockImplementationOnce(() =>
      err({ error: 'Password should be at least 6 characters' }, 400)
    );

    const user = userEvent.setup();
    await renderSignup();

    await user.type(screen.getByTestId('email-input'),    'test@example.com');
    await user.type(screen.getByTestId('password-input'), '123');
    await user.type(screen.getByTestId('name-input'),     'Test User');

    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
  });

  // ── Test 5: invalid email format ─────────────────────────────────────────

  it('should handle signup error - invalid email format', async () => {
    mockFetch.mockImplementationOnce(() =>
      err({ error: 'Invalid email format' }, 400)
    );

    const user = userEvent.setup();
    await renderSignup();

    await user.type(screen.getByTestId('email-input'),    'invalid-email');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.type(screen.getByTestId('name-input'),     'Test User');

    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent(
        'Invalid email format'
      );
    });
  });
});
