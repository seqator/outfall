/**
 * Публичный вход слоя `core`. Только чистый TypeScript: без DOM, без импортов
 * рендера/UI/аудио/ввода/ассетов. См. границы в `eslint.config.js`
 * (`import-x/no-restricted-paths`) и `docs/tech/architecture.md`.
 */

export * from './loop';
export * from './input';
export * from './world';
export * from './events';
export * from './rng';
export * from './iso';
export * from './math';
