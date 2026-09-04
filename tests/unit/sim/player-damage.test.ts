import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld, type EntityId, type World } from '../../../src/core/world';
import { applyDamageToPlayer } from '../../../src/sim/systems/player-damage';

function build(): World {
  return createWorld(createSeededRng(1), createEventBus());
}

function addPlayer(world: World, hp: number, maxHp = hp): EntityId {
  const player = world.create();
  world.store('health').add(player, { hp, maxHp, armor: 0 });
  return player;
}

describe('sim/systems/player-damage: applyDamageToPlayer — базовое поведение (без перков)', () => {
  it('вычитает урон, эмитит combat.hit', () => {
    const world = build();
    const player = addPlayer(world, 100);
    const handler = vi.fn();
    world.events.on('combat.hit', handler);

    applyDamageToPlayer(world, player, 15, 1, 2);
    world.events.drain();

    expect(world.store('health').get(player)?.hp).toBe(85);
    expect(handler).toHaveBeenCalledExactlyOnceWith({ targetId: player, wx: 1, wy: 2, damage: 15, crit: false });
  });

  it('добивающий удар эмитит combat.death (isEnemy: false)', () => {
    const world = build();
    const player = addPlayer(world, 10);
    const handler = vi.fn();
    world.events.on('combat.death', handler);

    applyDamageToPlayer(world, player, 15, 0, 0);
    world.events.drain();

    expect(handler).toHaveBeenCalledExactlyOnceWith({ entityId: player, wx: 0, wy: 0, isEnemy: false });
    expect(world.store('health').get(player)?.hp).toBe(0);
  });

  it('удар ≥30% МаксХП триггерит обычный шок на 4000 мс', () => {
    const world = build();
    const player = addPlayer(world, 100);

    applyDamageToPlayer(world, player, 30, 0, 0);

    expect(world.store('shockState').get(player)?.remainingMs).toBe(4000);
  });

  it('удар <30% МаксХП не триггерит шок', () => {
    const world = build();
    const player = addPlayer(world, 100);

    applyDamageToPlayer(world, player, 29, 0, 0);

    expect(world.store('shockState').get(player)).toBeUndefined();
  });

  it('отсутствие health-компонента — no-op, не падает', () => {
    const world = build();
    const entity = world.create();
    expect(() => applyDamageToPlayer(world, entity, 10, 0, 0)).not.toThrow();
  });

  it('forcedShock: true триггерит шок независимо от % урона (Энергосбытовец, §2.4)', () => {
    const world = build();
    const player = addPlayer(world, 1000);

    applyDamageToPlayer(world, player, 20, 0, 0, { forcedShock: true }); // 2% МаксХП — далеко ниже 30%

    expect(world.store('shockState').get(player)?.remainingMs).toBe(4000);
  });
});

describe('sim/systems/player-damage: перк «Дублёная шкура» (flatDamageReduction=2, shockThresholdRatio=0.4)', () => {
  function addPlayerWithShkura(world: World, hp: number): EntityId {
    const player = addPlayer(world, hp);
    world
      .store('perks')
      .add(player, { unlockedPerkIds: ['perk.dublyonaya_shkura'], lastStandAvailable: false, guaranteedCritPending: false });
    return player;
  }

  it('снижает входящий урон на 2 (после брони)', () => {
    const world = build();
    const player = addPlayerWithShkura(world, 100);

    applyDamageToPlayer(world, player, 15, 0, 0);

    expect(world.store('health').get(player)?.hp).toBe(87); // 100-(15-2)
  });

  it('не опускает урон ниже 1 (тот же принцип §4.1)', () => {
    const world = build();
    const player = addPlayerWithShkura(world, 100);

    applyDamageToPlayer(world, player, 1, 0, 0);

    expect(world.store('health').get(player)?.hp).toBe(99);
  });

  it('шок теперь триггерится только с 40% МаксХП, не с прежних 30%', () => {
    const world = build();
    const player = addPlayerWithShkura(world, 100);

    applyDamageToPlayer(world, player, 32, 0, 0); // 32-2=30, 30% — было бы триггером без перка

    expect(world.store('shockState').get(player)).toBeUndefined();
  });

  it('40% всё ещё триггерит шок', () => {
    const world = build();
    const player = addPlayerWithShkura(world, 100);

    applyDamageToPlayer(world, player, 42, 0, 0); // 42-2=40 = 40% ровно

    expect(world.store('shockState').get(player)?.remainingMs).toBe(4000);
  });
});

describe('sim/systems/player-damage: перк «Хладнокровие» (shockDurationMs=2000)', () => {
  it('триггерящий удар выставляет шок на 2000 мс вместо 4000', () => {
    const world = build();
    const player = addPlayer(world, 100);
    world
      .store('perks')
      .add(player, { unlockedPerkIds: ['perk.khladnokroviye'], lastStandAvailable: false, guaranteedCritPending: false });

    applyDamageToPlayer(world, player, 30, 0, 0);

    expect(world.store('shockState').get(player)?.remainingMs).toBe(2000);
  });
});

describe('sim/systems/player-damage: перк «Последний патрон» (lastStandPerFight + guaranteedCritOnNextShot)', () => {
  function addPlayerWithLastStand(world: World, hp: number, available = true): EntityId {
    const player = addPlayer(world, hp);
    world.store('perks').add(player, {
      unlockedPerkIds: ['perk.posledniy_patron'],
      lastStandAvailable: available,
      guaranteedCritPending: false,
    });
    return player;
  }

  it('смертельный удар оставляет 1 ХП вместо 0, если страховка доступна', () => {
    const world = build();
    const player = addPlayerWithLastStand(world, 10);

    applyDamageToPlayer(world, player, 15, 0, 0);

    expect(world.store('health').get(player)?.hp).toBe(1);
  });

  it('взводит guaranteedCritPending и гасит lastStandAvailable после срабатывания', () => {
    const world = build();
    const player = addPlayerWithLastStand(world, 10);

    applyDamageToPlayer(world, player, 15, 0, 0);

    const perks = world.store('perks').get(player);
    expect(perks?.lastStandAvailable).toBe(false);
    expect(perks?.guaranteedCritPending).toBe(true);
  });

  it('не эмитит combat.death при срабатывании страховки', () => {
    const world = build();
    const player = addPlayerWithLastStand(world, 10);
    const handler = vi.fn();
    world.events.on('combat.death', handler);

    applyDamageToPlayer(world, player, 15, 0, 0);
    world.events.drain();

    expect(handler).not.toHaveBeenCalled();
  });

  it('страховка уже израсходована в этом «бою» — смертельный удар убивает как обычно', () => {
    const world = build();
    const player = addPlayerWithLastStand(world, 10, false);

    applyDamageToPlayer(world, player, 15, 0, 0);

    expect(world.store('health').get(player)?.hp).toBe(0);
  });

  it('несмертельный удар не расходует страховку', () => {
    const world = build();
    const player = addPlayerWithLastStand(world, 100);

    applyDamageToPlayer(world, player, 15, 0, 0);

    expect(world.store('perks').get(player)?.lastStandAvailable).toBe(true);
    expect(world.store('health').get(player)?.hp).toBe(85);
  });
});
