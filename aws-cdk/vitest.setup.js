globalThis.jest = {
  setTimeout(timeout) {
    globalThis.vi.setConfig({ testTimeout: timeout, hookTimeout: timeout });
  },
};
