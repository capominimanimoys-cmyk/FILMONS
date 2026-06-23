// src/test/auth/phoneSignup.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../../app/context/AuthContext';
import { mockSupabase, mockSupabaseAuth } from '../mocks/supabase';

function TestPhoneSignup() {
  const { signupWithPhone, verifyPhoneOTP, user } = useAuth();
  const [phone, setPhone] = React.useState('');
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [step, setStep] = React.useState<'phone' | 'verify'>('phone');
  const [error, setError] = React.useState('');

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signupWithPhone(phone, name, 'renter');
      setStep('verify');
      setError('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verifyPhoneOTP(phone, code);
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
      {user && <div data-testid="user-authenticated">{user.name}</div>}
    </div>
  );
}

describe('Phone Signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should send OTP to phone number', async () => {
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestPhoneSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(mockSupabaseAuth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+1234567890',
      });
      expect(sessionStorage.getItem('pending_signup')).toBeTruthy();
    });
  });

  it('should format phone number with + prefix if missing', async () => {
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestPhoneSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByTestId('phone-input'), '1234567890');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(mockSupabaseAuth.signInWithOtp).toHaveBeenCalledWith({
        phone: '+1234567890',
      });
    });
  });

  it('should verify OTP and create profile', async () => {
    const mockUser = {
      id: 'test-user-id',
      phone: '+1234567890',
    };

    const mockProfile = {
      id: 'test-user-id',
      name: 'Test User',
      phone: '+1234567890',
      account_type: 'renter',
    };

    // Step 1: Send OTP
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    // Step 2: Verify OTP
    mockSupabaseAuth.verifyOtp.mockResolvedValue({
      data: { user: mockUser, session: { access_token: 'test-token' } },
      error: null,
    });

    mockSupabaseAuth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
      single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestPhoneSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    // Send OTP
    sessionStorage.setItem('pending_signup', JSON.stringify({
      phone: '+1234567890',
      name: 'Test User',
      accountType: 'renter',
    }));

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    await user.click(screen.getByText('Send OTP'));

    // Verify OTP
    await waitFor(() => {
      expect(screen.getByTestId('code-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('code-input'), '123456');
    await user.click(screen.getByText('Verify'));

    await waitFor(() => {
      expect(mockSupabaseAuth.verifyOtp).toHaveBeenCalledWith({
        phone: '+1234567890',
        token: '123456',
        type: 'sms',
      });
    });
  });

  it('should handle invalid OTP error', async () => {
    mockSupabaseAuth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid verification code' },
    });

    sessionStorage.setItem('pending_signup', JSON.stringify({
      phone: '+1234567890',
      name: 'Test User',
      accountType: 'renter',
    }));

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestPhoneSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    // Send OTP first
    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    await user.click(screen.getByText('Send OTP'));

    // Try to verify with wrong code
    await waitFor(() => {
      expect(screen.getByTestId('code-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('code-input'), '000000');
    await user.click(screen.getByText('Verify'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent('Invalid verification code');
    });
  });

  it('should handle expired OTP error', async () => {
    mockSupabaseAuth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Token has expired' },
    });

    sessionStorage.setItem('pending_signup', JSON.stringify({
      phone: '+1234567890',
      name: 'Test User',
      accountType: 'renter',
    }));

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestPhoneSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    await user.click(screen.getByText('Send OTP'));

    await waitFor(() => {
      expect(screen.getByTestId('code-input')).toBeInTheDocument();
    });

    await user.type(screen.getByTestId('code-input'), '123456');
    await user.click(screen.getByText('Verify'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toHaveTextContent('Token has expired');
    });
  });

  it('should handle phone number already registered', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'existing-user' },
        error: null,
      }),
    });

    mockSupabaseAuth.signInWithOtp.mockResolvedValue({
      data: { messageId: 'test-message-id' },
      error: null,
    });

    const user = userEvent.setup();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <TestPhoneSignup />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByTestId('phone-input'), '+1234567890');
    await user.type(screen.getByTestId('name-input'), 'Test User');
    await user.click(screen.getByText('Send OTP'));

    // Should still send OTP (for signin flow)
    await waitFor(() => {
      expect(mockSupabaseAuth.signInWithOtp).toHaveBeenCalled();
    });
  });
});