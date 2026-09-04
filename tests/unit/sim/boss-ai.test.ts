import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld, type EntityId, type World } from '../../../src/core/world';
import { ENEMY_DEFS } from '../../../src/sim/formulas/enemies';
import { pickArenaPoint, resolveBossAttack } from '../../../src/sim/systems/boss-ai';

function build(): World {
  return createWorld(createSeededRng(1), createEventBus());
}

function addPlayer(world: World, x: number, y: number, maxHp = 100, armor = 0): EntityId {
  const player = world.create();
  world.store('transform').add(player, { x, y, z: 0, prevX: x, prevY: y });
  world.store('health').add(player, { hp: maxHp, maxHp, armor });
  return player;
}

const BOSS_DEF = ENEMY_DEFS['enemy.boss_zadvizhka'];

describe('sim/systems/boss-ai: pickArenaPoint', () => {
  it('точка всегда внутри круга заданного радиуса вокруг origin (100 сэмплов)', () => {
    const rng = createSeededRng(42);
    for (let i = 0; i < 100; i += 1) {
      const p = pickArenaPoint(rng, 10, 20, 10);
      expect(Math.hypot(p.x - 10, p.y - 20)).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it('детерминирована по seed — тот же seed даёт ту же точку', () => {
    const a = pickArenaPoint(createSeededRng(7), 0, 0, 10);
    const b = pickArenaPoint(createSeededRng(7), 0, 0, 10);
    expect(a).toEqual(b);
  });

  it('radiusM=0 — точка всегда совпадает с origin', () => {
    const p = pickArenaPoint(createSeededRng(1), 5, 5, 0);
    expect(p).toEqual({ x: 5, y: 5 });
  });
});

describe('sim/systems/boss-ai: resolveBossAttack (§2.8 combat.md — «Водяной залп»)', () => {
  it('игрок внутри aoeRadiusM от точки прицеливания получает урон по §4.1', () => {
    const world = build();
    const player = addPlayer(world, 10, 10, 100);

    resolveBossAttack(world, BOSS_DEF, player, { x: 11, y: 10 }); // дистанция 1 м ≤ aoeRadiusM=3

    // База=25, Навык=50, Крит=1, Слабость=1, Броня=0 → 25×1,0=25
    expect(world.store('health').get(player)?.hp).toBe(75);
  });

  it('игрок вне aoeRadiusM — промах, урона нет', () => {
    const world = build();
    const player = addPlayer(world, 0, 0, 100);

    resolveBossAttack(world, BOSS_DEF, player, { x: 50, y: 50 });

    expect(world.store('health').get(player)?.hp).toBe(100);
  });

  /** Регрессия на P0-2 из `docs/qa/balance-report.md` (тот же захардкоженный `armor: 0`, что и в `ai.ts`, см. `tests/unit/sim/ai.test.ts`). */
  it('P0-2: ненулевая броня игрока вычитается из урона Босса (База=25, Навык=50 → 25, Броня=10 → 15)', () => {
    const world = build();
    const player = addPlayer(world, 10, 10, 100, 10);

    resolveBossAttack(world, BOSS_DEF, player, { x: 11, y: 10 });

    expect(world.store('health').get(player)?.hp).toBe(85);
  });

  it('i-frames рывка блокируют урон полностью, даже если игрок в зоне AoE', () => {
    const world = build();
    const player = addPlayer(world, 0, 0, 100);
    world.store('dashState').add(player, { iframesRemainingMs: 200, cooldownRemainingMs: 0 });

    resolveBossAttack(world, BOSS_DEF, player, { x: 0, y: 0 });

    expect(world.store('health').get(player)?.hp).toBe(100);
  });

  it('цель без health-компонента — no-op, не падает', () => {
    const world = build();
    const bare = world.create();
    world.store('transform').add(bare, { x: 0, y: 0, z: 0, prevX: 0, prevY: 0 }); // намеренно без health

    expect(() => resolveBossAttack(world, BOSS_DEF, bare, { x: 0, y: 0 })).not.toThrow();
  });

  it('targetId=null — no-op, не падает', () => {
    const world = build();
    expect(() => resolveBossAttack(world, BOSS_DEF, null, { x: 0, y: 0 })).not.toThrow();
  });

  it('мёртвая (уничтоженная) цель — no-op, не падает', () => {
    const world = build();
    const player = addPlayer(world, 0, 0, 100);
    world.destroy(player);

    expect(() => resolveBossAttack(world, BOSS_DEF, player, { x: 0, y: 0 })).not.toThrow();
  });

  it('удар, добивающий цель, эмитит combat.hit и combat.death (isEnemy: false)', () => {
    const world = build();
    const player = addPlayer(world, 0, 0, 10);
    const hitHandler = vi.fn();
    const deathHandler = vi.fn();
    world.events.on('combat.hit', hitHandler);
    world.events.on('combat.death', deathHandler);

    resolveBossAttack(world, BOSS_DEF, player, { x: 0, y: 0 });
    world.events.drain();

    expect(hitHandler).toHaveBeenCalledTimes(1);
    expect(deathHandler).toHaveBeenCalledExactlyOnceWith({ entityId: player, wx: 0, wy: 0, isEnemy: false });
  });
});
