import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createInputSnapshot } from '../../../src/core/input';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld, type EntityId, type World } from '../../../src/core/world';
import { effectsSystem, spawnHazardZone } from '../../../src/sim/systems/effects';

function build(): World {
  return createWorld(createSeededRng(1), createEventBus());
}

function addPlayer(world: World, x: number, y: number, maxHp = 100): EntityId {
  const player = world.create();
  world.store('transform').add(player, { x, y, z: 0, prevX: x, prevY: y });
  world.store('velocity').add(player, { vx: 0, vy: 0 });
  world.store('controlled').add(player, { speed: 4 });
  world.store('health').add(player, { hp: maxHp, maxHp, armor: 0 });
  return player;
}

const INPUT = createInputSnapshot();

describe('sim/systems/effects: spawnHazardZone', () => {
  it('создаёт сущность-лужу с transform + hazardZone из переданных параметров', () => {
    const world = build();
    spawnHazardZone(world, 3, 4, { radiusM: 1.5, damagePerSec: 4, durationMs: 3000 });

    const [entity] = [...world.query('hazardZone')];
    expect(world.store('transform').get(entity as EntityId)).toMatchObject({ x: 3, y: 4 });
    expect(world.store('hazardZone').get(entity as EntityId)).toEqual({
      radiusM: 1.5,
      damagePerSec: 4,
      remainingMs: 3000,
    });
  });
});

describe('sim/systems/effects: effectsSystem — тик лужи (§2.5 combat.md, Чистый)', () => {
  it('игрок внутри радиуса теряет damagePerSec × dt урона за тик', () => {
    const world = build();
    const player = addPlayer(world, 0, 0, 100);
    spawnHazardZone(world, 0, 0, { radiusM: 1.5, damagePerSec: 4, durationMs: 3000 });

    effectsSystem(world, 1, INPUT); // 1 секунда одним шагом — 4 урона

    expect(world.store('health').get(player)?.hp).toBeCloseTo(96, 6);
  });

  it('игрок вне радиуса не получает урона', () => {
    const world = build();
    const player = addPlayer(world, 10, 10, 100);
    spawnHazardZone(world, 0, 0, { radiusM: 1.5, damagePerSec: 4, durationMs: 3000 });

    effectsSystem(world, 1, INPUT);

    expect(world.store('health').get(player)?.hp).toBe(100);
  });

  it('накопленный урон за 3 секунды (полная длительность лужи Чистого) — 12 урона суммарно, ×1/60 шагами', () => {
    const world = build();
    const player = addPlayer(world, 0, 0, 100);
    spawnHazardZone(world, 0, 0, { radiusM: 1.5, damagePerSec: 4, durationMs: 3000 });

    for (let i = 0; i < 180; i += 1) effectsSystem(world, 1 / 60, INPUT); // 3 с

    expect(world.store('health').get(player)?.hp).toBeCloseTo(88, 1);
  });

  it('лужа исчезает по истечении durationMs', () => {
    const world = build();
    addPlayer(world, 0, 0, 100);
    spawnHazardZone(world, 0, 0, { radiusM: 1.5, damagePerSec: 4, durationMs: 500 });

    effectsSystem(world, 0.6, INPUT);

    expect([...world.query('hazardZone')]).toHaveLength(0);
  });

  it('не наносит урона мёртвому игроку (hp уже ≤ 0)', () => {
    const world = build();
    const player = addPlayer(world, 0, 0, 100);
    const health = world.store('health').get(player);
    if (health) health.hp = 0;
    spawnHazardZone(world, 0, 0, { radiusM: 1.5, damagePerSec: 4, durationMs: 3000 });

    expect(() => effectsSystem(world, 1, INPUT)).not.toThrow();
    expect(world.store('health').get(player)?.hp).toBe(0);
  });

  it('добивающий тик эмитит combat.death (isEnemy: false)', () => {
    const world = build();
    const player = addPlayer(world, 0, 0, 2);
    spawnHazardZone(world, 0, 0, { radiusM: 1.5, damagePerSec: 4, durationMs: 3000 });

    const handler = vi.fn();
    world.events.on('combat.death', handler);

    effectsSystem(world, 1, INPUT); // 4 урона за 1 секунду > 2 ХП
    world.events.drain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(world.store('health').get(player)?.hp).toBe(0);
  });

  it('не роняет систему без единой controlled-сущности в мире', () => {
    const world = build();
    spawnHazardZone(world, 0, 0, { radiusM: 1.5, damagePerSec: 4, durationMs: 3000 });

    expect(() => effectsSystem(world, 1, INPUT)).not.toThrow();
  });
});
