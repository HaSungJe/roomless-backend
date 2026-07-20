// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // any 를 허용(no-explicit-any off)하므로 그 파생 unsafe 규칙들도 끔 — 일관성 유지.
      // (repository 의 error.errno, mock, 인프라 등 any 사용이 의도적인 코드베이스)
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      // `_` 접두 변수/인자는 의도적 미사용(디스카드) — 무시. catch 변수는 미사용 허용(통일 500 throw 패턴).
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none'}],
      // 손으로 관리하는 코드 스타일(공백 있는 import + 압축 객체)과 prettier 가 충돌 — lint 형식강제는 끔.
      // 형식 정렬이 필요하면 `npm run format`(prettier --write) 을 별도로 실행.
      'prettier/prettier': 'off',
    },
  },
  {
    // 테스트 전용 완화 — mock/observable await, Function 타입 mock
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
);
