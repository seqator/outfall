/**
 * Данные ввода — чистый контракт (§3.4 доклада engine-architect).
 *
 * Это именно *данные*, без DOM: `core`/`sim` читают `InputSnapshot`, не зная,
 * откуда он взялся. DOM-реализация, которая производит эти снимки, живёт в
 * `src/input` (маппинг клавиатуры/мыши → `InputSnapshot`) — задача OF-015.
 */

import type { InputSource } from './loop';

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

/**
 * Собирает `InputSnapshot` из частичных полей, остальное берёт из
 * `EMPTY_INPUT`. Упрощает чтение тестов и сценариев реплея — не нужно
 * выписывать все пять полей ради одного нажатого действия.
 */
export function createInputSnapshot(partial: Partial<InputSnapshot> = {}): InputSnapshot {
  return {
    moveX: partial.moveX ?? EMPTY_INPUT.moveX,
    moveY: partial.moveY ?? EMPTY_INPUT.moveY,
    aimWorld: partial.aimWorld ?? EMPTY_INPUT.aimWorld,
    pressed: partial.pressed ?? EMPTY_INPUT.pressed,
    held: partial.held ?? EMPTY_INPUT.held,
  };
}

/**
 * `InputSource`, воспроизводящий заранее записанную последовательность
 * снимков — «ScriptedInput» из §3.4. Основа детерминированного реплея:
 * тот же `seed` + та же `sequence` ⇒ тот же результат симуляции. После конца
 * последовательности повторяет последний снимок (а не падает и не зацикливает
 * запись), чтобы длинные тесты можно было прогонять дальше записанных кадров.
 */
export function createScriptedInput(sequence: readonly InputSnapshot[]): InputSource {
  let index = 0;
  return {
    snapshot(): InputSnapshot {
      const frame = sequence[index] ?? sequence[sequence.length - 1] ?? EMPTY_INPUT;
      if (index < sequence.length) index += 1;
      return frame;
    },
  };
}
