declare const describe: (name: string, fn: () => void) => void;
declare const beforeAll: (fn: () => unknown | Promise<unknown>) => void;
declare const afterAll: (fn: () => unknown | Promise<unknown>) => void;
declare const test: (name: string, fn: () => unknown | Promise<unknown>, timeout?: number) => void;
declare const expect: {
  (actual: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toHaveProperty(property: string): void;
  };
};
declare const jest: {
  setTimeout(timeout: number): void;
};
