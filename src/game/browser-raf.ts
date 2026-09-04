/**
 * `RafLike` (контракт — `core/loop.ts`) поверх настоящего браузерного
 * `requestAnimationFrame` — единственная DOM-реализация, живёт в `game` по
 * тому же правилу, что и `PixiRenderer`/`DomInputSource`: `core` не знает о
 * DOM, `game` — единственная сторона, которая его подключает.
 */

import type { RafLike } from '../core/loop';

export function createBrowserRaf(): RafLike {
  return {
    request(cb: (timeMs: number) => void): number {
      return window.requestAnimationFrame(cb);
    },
    cancel(handle: number): void {
      window.cancelAnimationFrame(handle);
    },
    now(): number {
      return performance.now();
    },
  };
}
