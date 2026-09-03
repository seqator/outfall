/**
 * Публичный вход слоя `sim`. Импортирует только `core`. Не импортирует
 * `render/ui/audio/input/assets` и не трогает `window`/`document` —
 * граница проверяется ESLint (`import-x/no-restricted-paths`,
 * `no-restricted-globals`).
 */

// components/ и formulas/ пока не экспортируют ничего (наполнятся вместе с
// первыми системами — OF-015/016), поэтому `export *` из них ESLint считает
// ошибкой ("no named exports"). systems/ уже содержит контракт `System`.
export * from './systems';
