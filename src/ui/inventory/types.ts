/**
 * Вид-модель инвентаря для DOM-UI (OF-017, `docs/art/ui-shchitok.md` §5
 * «Экран 2 — Инвентарь»). Типы этого файла намеренно НЕ переиспользуют типы
 * `src/game/inventory` (`InventoryState`/`ItemRegistry`...) — `ui` не может
 * импортировать `game`/`sim` (граница слоёв, `eslint.config.js`
 * `import-x/no-restricted-paths`). Приведение доменного состояния к этой
 * вид-модели делает `src/game/inventory/screen.ts` — единственное место,
 * которому разрешено знать оба слоя.
 */

/** 5 слотов экипировки (`items-economy.md` §1.1) — те же имена ключей, что и `EquipmentSlotId` в `game/inventory`, совпадение намеренное, но не типовая зависимость. */
export type InventorySlotId = 'ranged' | 'melee' | 'armorBody' | 'armorHead' | 'utility';

export const INVENTORY_SLOT_IDS: readonly InventorySlotId[] = [
  'ranged',
  'melee',
  'armorBody',
  'armorHead',
  'utility',
];

/** Подпись слота для силуэта (`ui-shchitok.md` §5: «Голова», «Тело», «Оружие»...). */
export const INVENTORY_SLOT_LABELS: Readonly<Record<InventorySlotId, string>> = {
  ranged: 'ОРУЖИЕ ДАЛЬНЕЕ',
  melee: 'ОРУЖИЕ БЛИЖНЕЕ',
  armorBody: 'ТЕЛО',
  armorHead: 'ГОЛОВА',
  utility: 'ОБВЕС',
};

export interface DecayView {
  /** Оставшееся мс — для форматирования `мм:сс` (§3 `items-economy.md`). */
  readonly remainingMs: number;
  /** true — остаток < 5 минут, ячейка подсвечивается (`items-economy.md` §3 «Как это видно игроку»). */
  readonly warning: boolean;
}

export interface InventoryItemView {
  readonly uid: string;
  readonly name: string;
  readonly quantity: number;
  readonly weightKg: number;
  readonly priceGaiki: number;
  readonly effectText: string;
  readonly decay?: DecayView;
}

export interface InventorySlotView {
  readonly slotId: InventorySlotId;
  readonly item?: InventoryItemView;
  /** Слот недоступен для текущего предмета/требования (`items-economy.md` §1.4) — перечёркнут `rust`. */
  readonly locked?: boolean;
}

export interface InventoryViewModel {
  readonly weightCurrentKg: number;
  readonly weightLimitKg: number;
  readonly overloaded: boolean;
  readonly walletGaiki: number;
  readonly slots: readonly InventorySlotView[];
  readonly backpack: readonly InventoryItemView[];
  readonly selectedUid?: string;
}

export interface InventoryHandlers {
  onSelect(uid: string): void;
  /** Клик по предмету вещмешка со свободным слотом под него — экипировать. */
  onEquip(uid: string): void;
  onUnequip(slotId: InventorySlotId): void;
  onDrop(uid: string): void;
  onClose(): void;
}
