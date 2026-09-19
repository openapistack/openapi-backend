import type { vi } from 'vitest';

declare global {
  const jest: typeof vi;

  namespace jest {
    type Mock<T = unknown> = ReturnType<typeof vi.fn>;
  }
}

export {};
