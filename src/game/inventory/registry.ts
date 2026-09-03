/**
 * Реестр предметов (OF-017): валидирует сырые данные по `ItemSchema` (OF-009,
 * `src/data/schemas/item.ts`) и индексирует по `id` для O(1)-поиска остальным
 * кодом инвентаря.
 *
 * ДОПУЩЕНИЕ (расхождение OF-007 vs OF-009, отмечено в отчёте задачи).
 * `docs/design/items-economy.md` §4 описывает типы `weapon | armor |
 * consumable | ammo | material | find | junk | quest | currency`, а
 * `ItemKindSchema` (уже реализован, вне зоны этой задачи) знает только
 * `weapon | armor | consumable | junk | key | ammo`. Валюту и материалы схема
 * вообще не выделяет отдельным `kind`. Поэтому здесь принято:
 *  - `material` (Детали, Синткомпонент, Лом) → `kind: 'junk'`;
 *  - `find` (герметичные находки) → `kind: 'junk'` + заполненное `spoilSec`
 *    (распад определяется по наличию `spoilSec`, а не по `kind`, см. `decay.ts`);
 *  - `quest` (Жетон трубочиста) → `kind: 'key'`;
 *  - `currency` (Гайка) → не предмет `ItemSchema` вовсе, а отдельный счётчик
 *    `InventoryState.wallet` (`types.ts`) — весит 0 кг и не имеет слота, как
 *    в `items-economy.md` §1.2, но не требует придумывать несуществующий `kind`.
 *
 * Второе расхождение: у `ItemSchema` нет полей `slot`/`armorValue` из таблицы
 * `items-economy.md` §4 (нет способа узнать «броня — тело» или «броня —
 * голова» прямо из предмета). Слот брони конкретного `id` задаётся отдельной
 * таблицей `ArmorSlotTable` (`equip-slots.ts`), а не схемой — расширение
 * `ItemSchema` не входит в зону `src/game/inventory/**`/`src/ui/inventory/**`.
 */

import { ItemSchema, type Item } from '../../data/schemas';

export type ItemRegistry = ReadonlyMap<string, Item>;

/**
 * Строит реестр из массива сырых (ещё не типизированных) объектов —
 * например, распарсенного JSON-фикстур-файла. Валидирует каждый элемент
 * `ItemSchema.parse` (бросает `ZodError` на первой невалидной записи — реестр
 * предметов собирается один раз при загрузке контента, тихо проглатывать
 * битые данные здесь неправильно) и проверяет уникальность `id`.
 */
export function createItemRegistry(rawItems: readonly unknown[]): ItemRegistry {
  const map = new Map<string, Item>();
  for (const raw of rawItems) {
    const item = ItemSchema.parse(raw);
    if (map.has(item.id)) {
      throw new Error(`createItemRegistry: дублирующийся id предмета "${item.id}"`);
    }
    map.set(item.id, item);
  }
  return map;
}

/** Строгий поиск: отсутствие `id` в реестре — ошибка целостности контента, а не штатный случай. */
export function requireItem(registry: ItemRegistry, id: string): Item {
  const item = registry.get(id);
  if (!item) {
    throw new Error(`ItemRegistry: предмет "${id}" не найден в реестре`);
  }
  return item;
}
