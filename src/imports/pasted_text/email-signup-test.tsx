// src/test/auth/emailSignup.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../app/context/AuthContext';
import { mockSupabase, mockSupabaseAuth } from '../mocks/supabase';

// Mock EmailJS
vi.mock('@emailjs/browser', () => ({
  default: {
    init: vi.fn(),
    send: vi.fn().mockResolvedValue({ status: 200 }),
  },
}));

// Test component
function TestEmailSignup() {
  const { signup, user, isAuthenticated } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [error, setError] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signup(email, password, name, phone);
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

describe('Email Signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should successfully sign up with email and password', async () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      user_metadata: { name: 'Test User' },
    };

    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: mockUser, session: null },
      error: null,
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestEmailSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    // Fill in form
    await user.type(screen.getByTestId('email-input'), 'test@example.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    
    // Submit
    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          data: {
            name: 'Test User',
            phone: '',
          },
        },
      });
    });
  });

  it('should sign up with email, password, name, and phone', async () => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      user_metadata: { name: 'Test User', phone: '+1234567890' },
    };

    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: mockUser, session: null },
      error: null,
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestEmailSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByTestId('email-input'), 'test@example.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    
    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          data: {
            name: 'Test User',
            phone: '+1234567890',
          },
        },
      });
    });
  });

  it('should handle signup error - email already exists', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestEmailSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByTestId('email-input'), 'existing@example.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    
    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent('User already registered');
    });
  });

  it('should handle signup error - weak password', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Password should be at least 6 characters' },
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestEmailSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByTestId('email-input'), 'test@example.com');
    await user.type(screen.getByTestId('password-input'), '123');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    
    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });
  });

  it('should handle signup error - invalid email format', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid email format' },
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestEmailSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByTestId('email-input'), 'invalid-email');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    
    await user.click(screen.getByText('Sign Up'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent('Invalid email format');
    });
  });
});