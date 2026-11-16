import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['scripts/**/*.mjs', 'tests/**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', window: 'readonly', document: 'readonly', localStorage: 'readonly', URL: 'readonly', navigator: 'readonly' } } },
);
