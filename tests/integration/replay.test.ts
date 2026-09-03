/**
 * Реплей-тест детерминизма (критерий готовности OF-010): одна и та же пара
 * «seed + фиксированная последовательность инпутов», прогнанная через
 * `GameLoop` → `Simulation` → `World`, обязана дать один и тот же хэш
 * состояния мира — независимо от того, сколько раз мы это повторяем.
 *
 * Прогон намеренно идёт через настоящий `GameLoop` (не напрямую через
 * `sim.step` в цикле), с `FakeRaf`, тикающим строго по `TICK_DT`: так тест
 * проверяет интеграцию `core/loop` + `sim/simulation` + `core/world` целиком,
 * а не только сумму частей по отдельности.
 */

import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/core/events';
import { createInputSnapshot, createScriptedInput, type InputSnapshot } from '../../src/core/input';
import { TICK_DT, createLoop } from '../../src/core/loop';
import { createSeededRng } from '../../src/core/rng';
import { createWorld } from '../../src/core/world';
import { createSimulation } from '../../src/sim';
import { createFakeRaf } from '../unit/core/support/fake-raf';

const TICK_MS = TICK_DT * 1000;
const FRAME_COUNT = 90; // 1.5 секунды симуляции на 60 Гц
const DECOR_COUNT = 3;

/** Детерминированная (без Math.random) запись ввода — одна и та же на оба прогона. */
function buildScript(): InputSnapshot[] {
  const frames: InputSnapshot[] = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const moveX = Math.sin(i * 0.3);
    const moveY = Math.cos(i * 0.2);
    frames.push(createInputSnapshot({ moveX, moveY }));
  }
  return frames;
}

/** FNV-1a 32-бит: маленький, без зависимостей, достаточно для теста на равенство. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Строит мир: одна управляемая сущность-игрок + несколько «декоративных», расставленных через world.rng. */
function buildWorld(seed: number) {
  const rng = createSeededRng(seed);
  const events = createEventBus();
  const world = createWorld(rng, events);

  const player = world.create();
  world.store('transform').add(player, { x: 0, y: 0, z: 0, prevX: 0, prevY: 0 });
  world.store('velocity').add(player, { vx: 0, vy: 0 });
  world.store('controlled').add(player, { speed: 3 });

  const decorIds: number[] = [];
  for (let i = 0; i < DECOR_COUNT; i += 1) {
    const decor = world.create();
    world.store('transform').add(decor, {
      x: world.rng.range(-5, 5),
      y: world.rng.range(-5, 5),
      z: 0,
      prevX: 0,
      prevY: 0,
    });
    decorIds.push(decor);
  }

  return { world, player, decorIds };
}

/** Прогоняет FRAME_COUNT кадров ровно по TICK_MS через настоящий GameLoop и возвращает хэш итогового мира. */
function runReplay(seed: number): string {
  const { world, player, decorIds } = buildWorld(seed);
  const sim = createSimulation(world);
  const input = createScriptedInput(buildScript());
  const raf = createFakeRaf();
  const loop = createLoop(sim, input, raf);

  loop.start();
  for (let i = 0; i <= FRAME_COUNT; i += 1) {
    raf.fire(i * TICK_MS);
  }
  loop.stop();

  const snapshot = {
    tick: world.tick,
    player: world.store('transform').get(player),
    playerVelocity: world.store('velocity').get(player),
    decor: decorIds.map((id) => world.store('transform').get(id)),
  };

  return fnv1a(JSON.stringify(snapshot));
}

describe('integration/replay: детерминизм seed + инпуты ⇒ хэш мира', () => {
  it('два независимых прогона с тем же seed дают идентичный хэш', () => {
    const first = runReplay(1234);
    const second = runReplay(1234);

    expect(first).toBe(second);
  });

  it('хэш зафиксирован — регрессия ловит любое изменение поведения sim/core', () => {
    expect(runReplay(1234)).toBe('e5fd88b0');
  });

  it('другой seed даёт другой хэш (мир действительно зависит от rng, а не только от инпутов)', () => {
    expect(runReplay(1234)).not.toBe(runReplay(5678));
  });

  it('мир реально продвинулся: игрок сдвинулся, тик досчитан', () => {
    const { world, player } = buildWorld(1234);
    const sim = createSimulation(world);
    const input = createScriptedInput(buildScript());
    const raf = createFakeRaf();
    const loop = createLoop(sim, input, raf);

    loop.start();
    for (let i = 0; i <= FRAME_COUNT; i += 1) {
      raf.fire(i * TICK_MS);
    }
    loop.stop();

    expect(world.tick).toBe(FRAME_COUNT);
    const transform = world.store('transform').get(player);
    expect(transform).toBeDefined();
    expect(transform?.x !== 0 || transform?.y !== 0).toBe(true);
  });
});
