/**
 * Публичный вход инвентаря (OF-017): чистая логика без DOM/рендера — вес,
 * перегруз, экипировка, реестр предметов, распад «час до каши». UI
 * (`src/ui/inventory`) не импортирует этот модуль напрямую (граница
 * `import-x/no-restricted-paths`, см. `eslint.config.js`): их связывает
 * `screen.ts` в этом же каталоге — единственный файл `game`, которому можно
 * знать и про логику, и про `ui`.
 */

export * from './types';
export * from './registry';
export * from './equip-slots';
export * from './weight';
export * from './inventory';
export * from './decay';
