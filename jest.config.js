module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  testPathIgnorePatterns: ['node_modules', 'examples'],
  verbose: true,
  silent: true,
};
