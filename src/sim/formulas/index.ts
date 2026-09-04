/**
 * Публичный вход `sim/formulas` — чистые функции урона/крита/разброса/
 * рывка/жара/шока (`docs/design/combat.md` §4/§5) плюс статические данные
 * оружия/врагов среза, которые эти формулы используют.
 */

export * from './damage';
export * from './crit';
export * from './spread';
export * from './dash';
export * from './heat';
export * from './shock';
export * from './weapons';
export * from './enemies';
export * from './perks';
export * from './progression';
