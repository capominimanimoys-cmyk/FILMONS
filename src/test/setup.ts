import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
vi.stubEnv('VITE_EMAILJS_SERVICE_ID', 'test_service_id');
vi.stubEnv('VITE_EMAILJS_PUBLIC_KEY', 'test_public_key');
