const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['**/?(*.)+(spec|test).ts?(x)'],
    exclude: ['node_modules/**', 'examples/**'],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    silent: true,
  },
});
