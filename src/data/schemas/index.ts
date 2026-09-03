/**
 * Публичный вход схем контента (OF-009). Кросс-ссылочная валидация всей
 * папки `public/data/**` — `tools/validate-data.ts`, не эта точка входа:
 * здесь только декларативные zod-схемы и типы, выведенные из них
 * (`z.infer`), без побочных эффектов и без чтения файловой системы.
 */

export * from './common';
export * from './rpg';
export * from './rules';
export * from './item';
export * from './perk';
export * from './enemy';
export * from './quest';
export * from './dialog';
export * from './map';
export * from './i18n';
