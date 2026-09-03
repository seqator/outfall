/**
 * Игровой тик с фиксированным шагом.
 *
 * Контракт зафиксирован в docs/planerka/01-concept/engine-architect.md §3.1.
 * Полная реализация `createLoop` — задача OF-010 («Ядро»). Здесь — только
 * константы и интерфейсы, на которые опираются остальные слои (render/game).
 *
 * `core` не импортирует DOM/render/input: `RafLike` — это абстракция над
 * `requestAnimationFrame`, реальная DOM-реализация живёт в `src/game`.
 */

import type { InputSnapshot } from './input';

/** Частота симуляции, Гц. Решение планёрки: 60 Гц (не 30, как в черновике). */
export const TICK_HZ = 60;
/** Длительность одного тика симуляции, секунды. */
export const TICK_DT = 1 / TICK_HZ;
/** Защита от «спирали смерти»: сколько тиков максимум догоняем за один кадр. */
export const MAX_TICKS_PER_FRAME = 5;

/** Один детерминированный шаг симуляции. */
export interface Simulation {
  step(dt: number, input: InputSnapshot): void;
}

/** Источник кадров: абстракция над requestAnimationFrame для тестируемости. */
export interface RafLike {
  request(cb: (timeMs: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

/** Источник ввода: снимок на тик, без знания о DOM. */
export interface InputSource {
  snapshot(): InputSnapshot;
}

export interface GameLoop {
  start(): void;
  stop(): void;
  /** alpha ∈ [0,1) — доля пройденного тика, для интерполяции в рендере. */
  onFrame(cb: (alpha: number, frameDtMs: number) => void): () => void;
}

/**
 * Заглушка каркаса: сигнатура зафиксирована, реализация — OF-010.
 * Бросает исключение намеренно, чтобы явно провалить любой код, который
 * попытается использовать цикл до реализации ядра.
 */
export function createLoop(_sim: Simulation, _input: InputSource, _raf: RafLike): GameLoop {
  throw new Error('createLoop: реализация запланирована в OF-010 (ядро/ECS)');
}
