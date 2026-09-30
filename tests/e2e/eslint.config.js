import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['playwright-report', 'test-results', '.auth']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A forgotten await lets a test finish before its action or assertion ran.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['specs/**/*.ts', 'support/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      // Page objects wrap assertions: expectInvoices(), expectQuery(), expectAccessible()…
      'playwright/expect-expect': [
        'warn',
        { assertFunctionPatterns: ['^expect[A-Z]', '\\.expect[A-Z]'] },
      ],
    },
  },
]);
