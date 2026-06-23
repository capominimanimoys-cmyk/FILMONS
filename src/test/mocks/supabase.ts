import { vi } from 'vitest';

export const mockSupabaseAuth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
  signOut: vi.fn(),
  admin: {
    updateUserById: vi.fn(),
  },
};

export const mockSupabaseFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
}));

export const mockSupabase = {
  auth: mockSupabaseAuth,
  from: mockSupabaseFrom,
  rpc: vi.fn(),
};

vi.mock('../../lib/supabase', () => ({
  supabase: mockSupabase,
}));
