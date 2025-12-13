import js from '@eslint/js';
import globals from 'globals';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import { defineConfig } from 'eslint/config';
import eslintConfigPrettier from 'eslint-config-prettier';
export default defineConfig([
  {
    ignores: [
      'dist/',
      'node_modules/',
      'package-lock.json',
      'functions/package-lock.json',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        __firebase_config: 'readonly',
        __initial_auth_token: 'readonly',
        __app_id: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-case-declarations': 'off',
      'no-empty': 'warn',
    },
  },
  {
    files: ['**/*.json'],
    plugins: { json },
    language: 'json/json',
    extends: ['json/recommended'],
  },
  {
    files: ['**/*.md'],
    plugins: { markdown },
    language: 'markdown/gfm',
    extends: ['markdown/recommended'],
  },
  eslintConfigPrettier,
]);
