/**
 * Тестовый двойник `RafLike` (`src/core/loop.ts`): не планирует ничего сам —
 * кадр происходит только тогда, когда тест явно вызывает `fire(timeMs)`.
 * Это то, что делает `GameLoop` тестируемым без реального `requestAnimationFrame`
 * и без таймеров: тест полностью контролирует «время».
 */

import type { RafLike } from '../../../../src/core/loop';

export interface FakeRaf extends RafLike {
  /** Есть ли сейчас невыполненный запрос кадра (аналог «есть что рисовать»). */
  readonly isScheduled: boolean;
  /** Сколько раз всего был вызван `request`. */
  readonly requestCount: number;
  /** Сколько раз был вызван `cancel`. */
  readonly cancelCount: number;
  /** Выполняет отложенный запрос кадра с переданной временной меткой, мс. */
  fire(timeMs: number): void;
}

export interface FakeRafOptions {
  /**
   * Не сбрасывать запланированный кадр в `cancel()` — имитирует ненадёжный
   * `RafLike` (например, `cancelAnimationFrame`, который не успел сработать).
   * Используется в тестах на защитный guard `GameLoop` внутри `frame()`.
   */
  unreliableCancel?: boolean;
}

export function createFakeRaf(options: FakeRafOptions = {}): FakeRaf {
  let queued: ((timeMs: number) => void) | null = null;
  let nextHandle = 1;
  let requestCount = 0;
  let cancelCount = 0;

  return {
    get isScheduled(): boolean {
      return queued !== null;
    },
    get requestCount(): number {
      return requestCount;
    },
    get cancelCount(): number {
      return cancelCount;
    },
    request(cb: (timeMs: number) => void): number {
      requestCount += 1;
      queued = cb;
      return nextHandle++;
    },
    cancel(_handle: number): void {
      cancelCount += 1;
      if (!options.unreliableCancel) {
        queued = null;
      }
    },
    now(): number {
      return 0;
    },
    fire(timeMs: number): void {
      const cb = queued;
      queued = null;
      cb?.(timeMs);
    },
  };
}
