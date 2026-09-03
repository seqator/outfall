/**
 * Правило «час до каши» (OF-017, `docs/design/items-economy.md` §3).
 *
 * Таймер тикает по симуляционному времени, а не `Date.now()`: эта функция
 * принимает готовый `dtMs` (сколько симуляционных миллисекунд прошло с
 * прошлого вызова) и ничего не знает про `GameLoop`/`World`/реальные часы —
 * так распад детерминирован и тестируется без таймеров/моков времени.
 * «Пауза на экранах инвентаря/крафта/сохранения» (§3) реализуется тем, что
 * вызывающая сторона просто не продвигает `dtMs`, пока эти экраны открыты —
 * без отдельного флага паузы здесь.
 */

import { requireItem, type ItemRegistry } from './registry';
import type { InventoryStack, InventoryState } from './types';

/** Итог распада `id23–26` из `items-economy.md` §4 — единственная запасная позиция junk на срез OF-017. */
export const KASHA_ITEM_ID = 'item.junk_kasha';

export interface DecayedStack {
  readonly uid: string;
  readonly fromItemId: string;
}

export interface DecayTickResult {
  readonly state: InventoryState;
  /** Стеки, распавшиеся в `junk_kasha` именно в этом вызове — источник события `audio:play item_decay_warning`/лога для UI. */
  readonly decayed: readonly DecayedStack[];
}

function decayStack(
  stack: InventoryStack,
  dtMs: number,
  decayed: DecayedStack[],
): InventoryStack {
  if (stack.decayRemainingMs === undefined) return stack;

  const remaining = stack.decayRemainingMs - dtMs;
  if (remaining > 0) {
    return { ...stack, decayRemainingMs: remaining };
  }

  decayed.push({ uid: stack.uid, fromItemId: stack.itemId });
  return { uid: stack.uid, itemId: KASHA_ITEM_ID, quantity: 1 };
}

/**
 * Продвигает таймеры распада всех стеков (вещмешок + экипировка — на срез
 * находки не экипируются, но проверка обеих зон не завязана на это допущение)
 * на `dtMs`. `registry` должен содержать `KASHA_ITEM_ID`, иначе последующее
 * чтение веса/цены через `requireItem` упадёт — это проверяется тестом
 * реестра фикстур, не здесь (эта функция не трогает реестр вовсе).
 */
export function tickInventoryDecay(state: InventoryState, dtMs: number): DecayTickResult {
  if (dtMs <= 0) return { state, decayed: [] };

  const decayed: DecayedStack[] = [];
  const backpack = state.backpack.map((s) => decayStack(s, dtMs, decayed));

  const equipment = { ...state.equipment };
  for (const key of Object.keys(equipment) as (keyof typeof equipment)[]) {
    const stack = equipment[key];
    if (stack) equipment[key] = decayStack(stack, dtMs, decayed);
  }

  return { state: { ...state, backpack, equipment }, decayed };
}

/** Удобный помощник для UI: сколько мс осталось у стека, `undefined` — не портится. */
export function decayRemainingMs(state: InventoryState, uid: string): number | undefined {
  const stack = state.backpack.find((s) => s.uid === uid);
  return stack?.decayRemainingMs;
}

/** Проверка целостности фикстур/контента: реестр обязан знать `KASHA_ITEM_ID`, иначе распад приведёт к битой ссылке. */
export function assertRegistryHasKasha(registry: ItemRegistry): void {
  requireItem(registry, KASHA_ITEM_ID);
}
