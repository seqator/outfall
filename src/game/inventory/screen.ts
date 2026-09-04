/**
 * Склейка логики инвентаря (этот каталог) и DOM-UI (`src/ui/inventory`) —
 * единственное место, которому разрешено импортировать оба слоя
 * (`docs/tech/architecture.md` §1: `game → ui`, а `ui` не может импортировать
 * `game` — граница `import-x/no-restricted-paths` в `eslint.config.js`).
 * `ui/inventory` не знает о существовании этого файла и не может его
 * импортировать; всё взаимодействие идёт через колбэки `InventoryHandlers`.
 *
 * Не входит в OF-017: реальная привязка к `GameLoop`/сценам (когда открывать
 * экран по Tab/I, пауза симуляции, автоматический вызов `tickInventoryDecay`
 * на каждый тик) — эта задача не создаёт сцен, ей ещё неоткуда брать
 * `World`/`GameLoop` (см. `docs/tech/architecture.md` §3–4, OF-015/018/027).
 * `createInventoryScreen` — уже готовый контракт «дай состояние — получи
 * DOM», который такая обвязка сможет использовать без изменений.
 */

import {
  createInventoryPanel,
  type InventoryHandlers,
  type InventoryItemView,
  type InventorySlotView,
  type InventoryViewModel,
} from '../../ui/inventory';
import type { I18n } from '../i18n';
import type { ArmorSlotTable } from './equip-slots';
import { equipItem, removeItem, unequipItem } from './inventory';
import { requireItem, type ItemRegistry } from './registry';
import { EQUIPMENT_SLOT_IDS, type EquipmentSlotId, type InventoryState } from './types';
import { totalWeightKg, weightLimitKg } from './weight';

/** `items-economy.md` §3: «при остатке < 5 минут запись подсвечивается». */
const DECAY_WARNING_MS = 5 * 60 * 1000;

export interface InventoryScreenOptions {
  readonly registry: ItemRegistry;
  readonly armorSlots: ArmorSlotTable;
  /** Каркас персонажа (`rpg-system.md` §1.1) — вне зоны OF-017, приходит готовым от вызывающей стороны. */
  readonly karkas: number;
  /** Резолвер локализации (`src/game/i18n`, OF-019/025) — обязателен, см. докстринг `dialogue-screen.ts` про баг с сырыми ключами в OF-030. */
  readonly t: I18n['t'];
  /** Вызывается после каждого изменения состояния — обычно записывает его в `SaveStore`/ECS-компонент вызывающей стороны (OF-019/будущая интеграция). */
  onStateChange?(state: InventoryState): void;
  /** Вызывается по кнопке закрытия панели (`src/ui/inventory/render.ts`) — вызывающая сторона снимает паузу и уничтожает экран. */
  onClose?(): void;
}

export interface InventoryScreen {
  readonly state: InventoryState;
  update(state: InventoryState): void;
  destroy(): void;
}

function toItemView(
  registry: ItemRegistry,
  t: I18n['t'],
  uid: string,
  itemId: string,
  quantity: number,
  decayRemainingMs: number | undefined,
): InventoryItemView {
  const item = requireItem(registry, itemId);
  return {
    uid,
    name: t(item.nameKey),
    quantity,
    weightKg: item.weight,
    priceGaiki: item.value,
    effectText: t(item.descKey),
    ...(decayRemainingMs !== undefined
      ? { decay: { remainingMs: decayRemainingMs, warning: decayRemainingMs < DECAY_WARNING_MS } }
      : {}),
  };
}

function toViewModel(
  state: InventoryState,
  registry: ItemRegistry,
  t: I18n['t'],
  karkas: number,
  selectedUid: string | undefined,
): InventoryViewModel {
  const weightCurrentKg = totalWeightKg(state, registry);
  const weightLimit = weightLimitKg(karkas);

  const slots: InventorySlotView[] = EQUIPMENT_SLOT_IDS.map((slotId) => {
    const stack = state.equipment[slotId];
    return {
      slotId,
      ...(stack
        ? { item: toItemView(registry, t, stack.uid, stack.itemId, stack.quantity, stack.decayRemainingMs) }
        : {}),
    };
  });

  const backpack = state.backpack.map((stack) =>
    toItemView(registry, t, stack.uid, stack.itemId, stack.quantity, stack.decayRemainingMs),
  );

  return {
    weightCurrentKg,
    weightLimitKg: weightLimit,
    overloaded: weightCurrentKg > weightLimit,
    walletGaiki: state.wallet,
    slots,
    backpack,
    ...(selectedUid !== undefined ? { selectedUid } : {}),
  };
}

/** Каждый вызов `addItem` из внешнего кода (подбор предмета на карте) должен передавать свой уникальный `uid` — счётчик здесь исключительно для примера/тестов сборки экрана, не для продакшен-подбора лута (это будущая система world-pickup, OF-015/025). */
let devUidCounter = 0;
function nextDevUid(): string {
  devUidCounter += 1;
  return `dev-stack-${devUidCounter}`;
}

export function createInventoryScreen(
  root: HTMLElement,
  initialState: InventoryState,
  options: InventoryScreenOptions,
): InventoryScreen {
  let state = initialState;
  let selectedUid: string | undefined;

  function emitChange(): void {
    options.onStateChange?.(state);
  }

  function refresh(): void {
    panel.update(toViewModel(state, options.registry, options.t, options.karkas, selectedUid));
  }

  const handlers: InventoryHandlers = {
    onSelect(uid): void {
      selectedUid = uid;
      refresh();
    },
    onEquip(uid): void {
      const outcome = equipItem(state, options.registry, options.armorSlots, uid);
      if (outcome.ok) {
        state = outcome.state;
        emitChange();
      }
      refresh();
    },
    onUnequip(slotId: EquipmentSlotId): void {
      const outcome = unequipItem(state, slotId);
      if (outcome.ok) {
        state = outcome.state;
        emitChange();
      }
      refresh();
    },
    onDrop(uid): void {
      const outcome = removeItem(state, uid, Number.POSITIVE_INFINITY);
      state = outcome.state;
      if (selectedUid === uid) selectedUid = undefined;
      emitChange();
      refresh();
    },
    onClose(): void {
      // Снятие с паузы/возврат фокуса — обязанность интеграции сцены (OF-027);
      // этот модуль только пробрасывает клик по кнопке закрытия наверх.
      options.onClose?.();
    },
  };

  const panel = createInventoryPanel(root, handlers);
  refresh();

  return {
    get state() {
      return state;
    },
    update(next: InventoryState): void {
      state = next;
      refresh();
    },
    destroy(): void {
      panel.destroy();
    },
  };
}

/** Вспомогательный генератор `uid` для сценариев/демо вне продакшен-подбора лута. */
export { nextDevUid };
