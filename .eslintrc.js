/* eslint-env node */
module.exports = {
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  ignorePatterns: ["examples/*"],
  env: {
    node: true,
    jest: true
  },
  rules: {
    "ordered-imports": 0,
    "object-literal-sort-keys": 0,
    "no-string-literal": 0,
    "object-literal-key-quotes": 0,
    "no-console": 0,
    "@typescript-eslint/no-explicit-any": 1,
    "@typescript-eslint/no-unused-vars": [1, { "argsIgnorePattern": "^_" }],
  }
};
