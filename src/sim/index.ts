/**
 * Публичный вход слоя `sim`. Импортирует только `core`. Не импортирует
 * `render/ui/audio/input/assets` и не трогает `window`/`document` —
 * граница проверяется ESLint (`import-x/no-restricted-paths`,
 * `no-restricted-globals`).
 */

// formulas/ пока не экспортирует ничего (наполнится вместе с боевыми
// формулами — OF-016), поэтому `export *` из него ESLint считает ошибкой
// ("no named exports"). components/ и systems/ уже содержат первый пример
// (движение); simulation.ts склеивает их в контракт `Simulation` из core.
export * from './components';
export * from './systems';
export * from './simulation';
