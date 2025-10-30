import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // Scripts run in Node and may use CommonJS. Treat them as node env so ESLint
  // no-undef checks for `require` and `process` are correct.
  {
    files: ['scripts/**', 'scripts/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: {
      globals: globals.node,
      parserOptions: { sourceType: 'script' }
    },
    rules: {
      // scripts are utilities; relax the unused vars pattern here
      'no-unused-vars': ['error', { args: 'none' }]
    }
  }
])
