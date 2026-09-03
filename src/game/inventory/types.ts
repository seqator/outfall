/**
 * Типы данных инвентаря (OF-017). Источник правил — `docs/design/items-economy.md`
 * (OF-007): 5 слотов экипировки + весовой «вещмешок» без лимита по числу
 * предметов (§1.1), таймер «час до каши» для герметичных находок (§3).
 *
 * Состояние — обычные данные (без методов), как остальной `sim`/`core`
 * (docs/tech/architecture.md §4): переходы состояния делают функции из
 * `inventory.ts`/`decay.ts`, а не сами структуры.
 */

/**
 * 5 фиксированных слотов экипировки (`items-economy.md` §1.1, таблица «Слоты»).
 * `armorBody`/`armorHead`/`utility` — латиница camelCase вместо кириллических
 * названий колонки таблицы («Броня — тело/голова», «Обвес»), это техническое
 * имя ключа, не пользовательский текст (тот берётся из `nameKey`/i18n).
 */
export type EquipmentSlotId = 'ranged' | 'melee' | 'armorBody' | 'armorHead' | 'utility';

export const EQUIPMENT_SLOT_IDS: readonly EquipmentSlotId[] = [
  'ranged',
  'melee',
  'armorBody',
  'armorHead',
  'utility',
];

/**
 * Один стек предмета — либо в вещмешке, либо в слоте экипировки.
 * `uid` — идентификатор конкретного экземпляра стека (не путать с `itemId` —
 * ссылкой на запись в `ItemRegistry`): нужен, чтобы различать два независимых
 * герметичных находки одного `itemId` с разными таймерами распада, и чтобы UI
 * могло адресовать конкретную ячейку без пересчёта индексов при перестановке.
 * Генерируется вызывающей стороной (`game`-оркестрацией), а не этим модулем —
 * логика инвентаря остаётся чистой и детерминированной без своего счётчика/RNG.
 */
export interface InventoryStack {
  readonly uid: string;
  readonly itemId: string;
  readonly quantity: number;
  /**
   * Остаток мс до превращения в `item.junk_kasha` (`items-economy.md` §3).
   * `undefined` — предмет без порчи (нет `spoilSec` в `ItemSchema`).
   * Тикает только явным вызовом `tickInventoryDecay(state, dtMs)` — вызывающая
   * сторона передаёт симуляционное `dt`, поэтому пауза/меню естественным
   * образом останавливают распад, если во время них `dtMs` не передаётся.
   */
  readonly decayRemainingMs?: number;
}

export type Equipment = Readonly<Partial<Record<EquipmentSlotId, InventoryStack>>>;

export interface InventoryState {
  readonly backpack: readonly InventoryStack[];
  readonly equipment: Equipment;
  /**
   * Гайки (`items-economy.md` §2.1). Валюта весит 0 кг и не участвует в
   * `ItemSchema`-стеках вещмешка (см. допущение в `registry.ts`) — отдельный
   * счётчик, чтобы не выдумывать для неё несуществующий `kind` в схеме.
   */
  readonly wallet: number;
}

export function createEmptyInventory(): InventoryState {
  return { backpack: [], equipment: {}, wallet: 0 };
}
