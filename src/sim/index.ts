/**
 * Публичный вход слоя `sim`. Импортирует только `core`. Не импортирует
 * `render/ui/audio/input/assets` и не трогает `window`/`document` —
 * граница проверяется ESLint (`import-x/no-restricted-paths`,
 * `no-restricted-globals`).
 */

export * from './components';
export * from './systems';
export * from './formulas';
