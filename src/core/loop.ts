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

type FrameSubscriber = (alpha: number, frameDtMs: number) => void;

/**
 * Реализация «накопителя»: рендер вызывает кадры с произвольным интервалом
 * (`RafLike`), симуляция шагает строго по `TICK_DT`. Излишек времени между
 * тиками копится в `accumulator` и на следующем кадре досчитывается — так
 * `sim.step` вызывается одинаковое число раз независимо от частоты кадров.
 *
 * `MAX_TICKS_PER_FRAME` защищает от «спирали смерти»: если вкладка была
 * свёрнута и накопился большой долг тиков, досчитываем не более `N` тиков за
 * кадр и отбрасываем остаток — иначе один длинный кадр порождал бы шторм
 * тиков, который никогда не даст кадру прорисоваться.
 */
export function createLoop(sim: Simulation, input: InputSource, raf: RafLike): GameLoop {
  let running = false;
  let rafHandle: number | null = null;
  let lastTimeMs: number | null = null;
  let accumulator = 0;
  const subscribers = new Set<FrameSubscriber>();

  function frame(timeMs: number): void {
    if (!running) return;

    const frameDtMs = lastTimeMs === null ? 0 : timeMs - lastTimeMs;
    lastTimeMs = timeMs;
    accumulator += frameDtMs / 1000;

    let steps = 0;
    while (accumulator >= TICK_DT && steps < MAX_TICKS_PER_FRAME) {
      sim.step(TICK_DT, input.snapshot());
      accumulator -= TICK_DT;
      steps += 1;
    }
    if (steps === MAX_TICKS_PER_FRAME && accumulator >= TICK_DT) {
      // Не догнали за отведённый бюджет тиков — сбрасываем долг, а не копим его дальше.
      accumulator = 0;
    }

    const alpha = accumulator / TICK_DT;
    for (const subscriber of subscribers) {
      subscriber(alpha, frameDtMs);
    }

    if (running) {
      rafHandle = raf.request(frame);
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      lastTimeMs = null;
      accumulator = 0;
      rafHandle = raf.request(frame);
    },
    stop(): void {
      running = false;
      if (rafHandle !== null) {
        raf.cancel(rafHandle);
        rafHandle = null;
      }
    },
    onFrame(cb: FrameSubscriber): () => void {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
  };
}
