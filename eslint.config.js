import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'tools/'] },
  {
    files: ['js/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser, L: 'readonly' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none' }], 'no-redeclare': 'error', 'eqeqeq': ['warn', 'always', { null: 'ignore' }], 'prefer-const': 'warn', 'no-var': 'error' },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'warn' },
  },
];
