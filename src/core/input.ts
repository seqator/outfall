/**
 * Данные ввода — чистый контракт (§3.4 доклада engine-architect).
 *
 * Это именно *данные*, без DOM: `core`/`sim` читают `InputSnapshot`, не зная,
 * откуда он взялся. DOM-реализация, которая производит эти снимки, живёт в
 * `src/input` (маппинг клавиатуры/мыши → `InputSnapshot`) — задача OF-010/015.
 */

export type Action =
  'attack' | 'interact' | 'dash' | 'reload' | 'inventory' | 'pause' | 'slot1' | 'slot2' | 'slot3';

/** Неизменяемый снимок ввода на один тик симуляции. */
export interface InputSnapshot {
  readonly moveX: number; // -1..1, уже в мировых осях
  readonly moveY: number;
  readonly aimWorld: { readonly x: number; readonly y: number };
  readonly pressed: ReadonlySet<Action>; // нажаты именно в этом тике
  readonly held: ReadonlySet<Action>; // удерживаются
}

/** Снимок «ничего не нажато» — используется в тестах и как начальное состояние. */
export const EMPTY_INPUT: InputSnapshot = Object.freeze({
  moveX: 0,
  moveY: 0,
  aimWorld: Object.freeze({ x: 0, y: 0 }),
  pressed: new Set<Action>(),
  held: new Set<Action>(),
});
