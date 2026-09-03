// @ts-check
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

/**
 * Границы слоёв (docs/planerka/01-concept/engine-architect.md §2):
 *   core ← sim ← game → render, audio, ui, input, assets
 * `core` и `sim` не импортируют render/ui/audio/input/assets/game и не
 * трогают window/document. `pixi.js` импортируется только в `src/render/pixi/**`.
 */
const LAYER_ZONES = [
  {
    target: './src/core',
    from: [
      './src/sim',
      './src/game',
      './src/render',
      './src/audio',
      './src/ui',
      './src/input',
      './src/assets',
      './src/data',
    ],
    message:
      '`core` — базовый слой и не может импортировать sim/game/render/audio/ui/input/assets/data.',
  },
  {
    target: './src/sim',
    from: ['./src/game', './src/render', './src/audio', './src/ui', './src/input', './src/assets'],
    message:
      '`sim` не может импортировать render/ui/audio/input/assets/game — только core (и типы данных контента).',
  },
  {
    target: './src/render',
    from: ['./src/game', './src/sim'],
    message:
      '`render` не может импортировать game/sim — зависимость должна идти в обратную сторону (game → render).',
  },
  {
    target: './src/audio',
    from: ['./src/game', './src/sim'],
    message: '`audio` не может импортировать game/sim.',
  },
  {
    target: './src/ui',
    from: ['./src/game', './src/sim'],
    message: '`ui` не может импортировать game/sim.',
  },
  {
    target: './src/input',
    from: ['./src/game', './src/sim'],
    message: '`input` не может импортировать game/sim.',
  },
  {
    target: './src/assets',
    from: ['./src/game', './src/sim'],
    message: '`assets` не может импортировать game/sim.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TS уже ловит обращения к необъявленным именам с точностью до типов;
      // no-undef на DOM-глобалах (window, HTMLElement...) даёт только шум.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'import-x/no-unresolved': 'off', // резолвится через typescript-парсер/tsconfig
      // Стандартный паттерн `import tseslint from 'typescript-eslint'` /
      // `import importX from 'eslint-plugin-import-x'` из документации обоих
      // пакетов — предупреждение здесь шумное, а не сигнал реальной ошибки.
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/order': [
        'warn',
        { 'newlines-between': 'never', alphabetize: { order: 'asc', caseInsensitive: true } },
      ],
    },
  },

  // Границы слоёв — только исходники движка.
  {
    files: ['src/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: LAYER_ZONES }],
    },
  },

  // `pixi.js` — единственная тяжёлая runtime-зависимость, изолирована в render/pixi.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/render/pixi/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pixi.js',
              message: "import 'pixi.js' разрешён только внутри src/render/pixi/**.",
            },
          ],
        },
      ],
    },
  },

  // `core`/`sim` — чистый TS: никакого DOM.
  {
    files: ['src/core/**/*.ts', 'src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'fetch',
      ],
    },
  },

  // tools/* — node-скрипты (tsx), не участвуют в границах движка.
  {
    files: ['tools/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': 'off',
      'no-console': 'off',
    },
  },

  // tests/* — vitest/playwright.
  {
    files: ['tests/**/*.ts'],
    rules: {
      'import-x/no-restricted-paths': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // Сам конфиг ESLint — plain JS, не входит в tsconfig (allowJs: false), не
  // может участвовать в типизированном парсинге.
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettierConfig,
);
