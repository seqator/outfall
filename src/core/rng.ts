/**
 * Детерминированный генератор случайных чисел (§3.1). Единственный источник
 * случайности, разрешённый в `sim` — никаких `Math.random`/`Date.now`.
 * Один и тот же seed даёт идентичную последовательность на любой машине.
 */

export interface SeededRng {
  readonly seed: number;
  /** Следующее число с плавающей точкой в [0, 1). */
  next(): number;
  /** Целое число в [min, max]. */
  int(min: number, max: number): number;
  /** Число с плавающей точкой в [min, max). */
  range(min: number, max: number): number;
}

/**
 * mulberry32 — компактный, быстрый, стабильный между платформами PRNG.
 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
export function createSeededRng(seed: number): SeededRng {
  let state = seed >>> 0;

  function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    seed,
    next,
    int(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    range(min: number, max: number): number {
      return next() * (max - min) + min;
    },
  };
}
