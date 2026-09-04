import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createInputSnapshot } from '../../../src/core/input';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld, type EntityId, type World } from '../../../src/core/world';
import type { AiPhase } from '../../../src/sim/components';
import { aiSystem, isEnemyWeaknessActive, spawnEnemy } from '../../../src/sim/systems/ai';

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

/**
 * Прогоняет `aiSystem` мелкими шагами (1/60 с — тик симуляции), пока фаза
 * врага не достигнет `target`, чтобы тесты не зависели от точного числа
 * вызовов, нужного для перехода `idle → chase → telegraph → attack →
 * cooldown` (переход происходит только на *следующем* вызове после того,
 * как условие фазы выполнено — по одной фазе за вызов, как и остальные
 * системы ECS проекта).
 */
function advanceUntilPhase(world: World, enemy: EntityId, target: AiPhase, maxSteps = 2000): void {
  for (let i = 0; i < maxSteps; i += 1) {
    if (world.store('aiState').get(enemy)?.phase === target) return;
    aiSystem(world, 1 / 60, INPUT);
  }
  throw new Error(`advanceUntilPhase: фаза "${target}" не достигнута за ${maxSteps} тиков`);
}

describe('sim/systems/ai: isEnemyWeaknessActive', () => {
  it('window="always" — активна независимо от фазы', () => {
    expect(isEnemyWeaknessActive('always', 'idle')).toBe(true);
    expect(isEnemyWeaknessActive('always', 'attack')).toBe(true);
  });

  it('window="telegraph" — активна только в фазе telegraph', () => {
    expect(isEnemyWeaknessActive('telegraph', 'telegraph')).toBe(true);
    expect(isEnemyWeaknessActive('telegraph', 'chase')).toBe(false);
  });

  it('window="cooldown" — активна только в фазе cooldown', () => {
    expect(isEnemyWeaknessActive('cooldown', 'cooldown')).toBe(true);
    expect(isEnemyWeaknessActive('cooldown', 'attack')).toBe(false);
  });
});

describe('sim/systems/ai: spawnEnemy', () => {
  it('создаёт сущность врага с ХП/бронёй/ролью из ENEMY_DEFS', () => {
    const world = build();
    const entity = spawnEnemy(world, 'enemy.raki', { x: 3, y: 4 });

    expect(world.store('transform').get(entity)).toMatchObject({ x: 3, y: 4 });
    expect(world.store('health').get(entity)).toEqual({ hp: 40, maxHp: 40, armor: 2 });
    expect(world.store('enemy').get(entity)).toEqual({ defId: 'enemy.raki' });
    expect(world.store('aiState').get(entity)).toEqual({
      phase: 'idle',
      phaseElapsedMs: 0,
      targetId: null,
      stunnedMs: 0,
    });
  });
});

describe('sim/systems/ai: aiSystem — фазы', () => {
  it('idle → chase, когда игрок в радиусе агро', () => {
    const world = build();
    addPlayer(world, 5, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 }); // aggroRadiusM=8

    aiSystem(world, 1 / 60, INPUT);

    expect(world.store('aiState').get(enemy)?.phase).toBe('chase');
  });

  it('idle остаётся idle, если игрок вне радиуса агро', () => {
    const world = build();
    addPlayer(world, 100, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });

    aiSystem(world, 1 / 60, INPUT);

    expect(world.store('aiState').get(enemy)?.phase).toBe('idle');
    expect(world.store('velocity').get(enemy)).toEqual({ vx: 0, vy: 0 });
  });

  it('chase движется к игроку с moveSpeed врага', () => {
    const world = build();
    addPlayer(world, 5, 0); // в радиусе агро (8), но дальше дальности атаки (1,5) — остаётся в chase
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'chase');

    aiSystem(world, 1 / 60, INPUT); // шаг преследования внутри chase

    const velocity = world.store('velocity').get(enemy);
    expect(velocity?.vx).toBeGreaterThan(0);
    expect(velocity?.vy).toBeCloseTo(0, 6);
  });

  it('chase → idle, если игрок ушёл далеко за радиус агро (гистерезис ×1,5)', () => {
    const world = build();
    const player = addPlayer(world, 5, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'chase');

    const transform = world.store('transform').get(player);
    if (transform) transform.x = 100;
    aiSystem(world, 1 / 60, INPUT);

    expect(world.store('aiState').get(enemy)?.phase).toBe('idle');
    expect(world.store('aiState').get(enemy)?.targetId).toBeNull();
  });

  it('chase → telegraph, когда игрок в радиусе атаки', () => {
    const world = build();
    addPlayer(world, 1, 0); // rangeM Раков = 1.5
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });

    advanceUntilPhase(world, enemy, 'telegraph');

    expect(world.store('velocity').get(enemy)).toEqual({ vx: 0, vy: 0 });
  });

  it('telegraph считает мс и переходит в attack ровно по истечении telegraphMs (400 мс у Раков)', () => {
    const world = build();
    addPlayer(world, 1, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'telegraph');

    // 399 мс — ещё телеграф
    aiSystem(world, 0.399, INPUT);
    expect(world.store('aiState').get(enemy)?.phase).toBe('telegraph');

    // ещё 1 мс — 400 мс суммарно, переход в attack (резолв — на следующем вызове)
    aiSystem(world, 0.001, INPUT);
    expect(world.store('aiState').get(enemy)?.phase).toBe('attack');

    // следующий вызов — резолв урона и переход в cooldown
    aiSystem(world, 1 / 60, INPUT);
    expect(world.store('aiState').get(enemy)?.phase).toBe('cooldown');
  });

  it('attack наносит урон игроку по формуле §4.1 (База=15, Навык=50, Крит=1, Слабость=1, Броня=0 → 15)', () => {
    const world = build();
    const player = addPlayer(world, 1, 0, 100);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'cooldown');

    expect(world.store('health').get(player)?.hp).toBe(85);
  });

  it('i-frames рывка блокируют урон полностью', () => {
    const world = build();
    const player = addPlayer(world, 1, 0, 100);
    world.store('dashState').add(player, { iframesRemainingMs: 500, cooldownRemainingMs: 0 });
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'cooldown');

    expect(world.store('health').get(player)?.hp).toBe(100);
  });

  it('игрок вне дальности атаки на момент резолва — промах, урон не наносится', () => {
    const world = build();
    const player = addPlayer(world, 1, 0, 100);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'attack');

    const transform = world.store('transform').get(player);
    if (transform) transform.x = 10; // выбежал из радиуса атаки перед самым резолвом

    aiSystem(world, 1 / 60, INPUT); // резолв attack → cooldown

    expect(world.store('aiState').get(enemy)?.phase).toBe('cooldown');
    expect(world.store('health').get(player)?.hp).toBe(100);
  });

  it('шок триггерится, когда удар ≥30% МаксХП (Раки 15 урона против МаксХП 40 → 37,5%)', () => {
    const world = build();
    const player = addPlayer(world, 1, 0, 40);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'cooldown');

    expect(world.store('shockState').get(player)?.remainingMs).toBe(4000);
  });

  it('Подлинейный обездвиживает игрока при попадании сети', () => {
    const world = build();
    const player = addPlayer(world, 3, 0, 100); // rangeM Подлинейного = 4
    const enemy = spawnEnemy(world, 'enemy.podlineiny', { x: 0, y: 0 });

    advanceUntilPhase(world, enemy, 'cooldown');

    expect(world.store('immobilized').get(player)?.remainingMs).toBe(1000);
    expect(world.store('health').get(player)?.hp).toBe(95);
  });

  it('шок не стекается: второй триггерящий удар обновляет уже существующий shockState на месте, не пересоздавая его', () => {
    const world = build();
    const player = addPlayer(world, 1, 0, 40);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'cooldown'); // первый удар — создаёт shockState

    expect(world.store('shockState').get(player)?.remainingMs).toBe(4000);

    // Симулируем «прошло 2 секунды» — таймер начал убывать.
    const shock = world.store('shockState').get(player);
    if (shock) shock.remainingMs = 2000;

    advanceUntilPhase(world, enemy, 'chase'); // откат
    advanceUntilPhase(world, enemy, 'cooldown', 5000); // второй удар — обновляет тот же компонент

    // Таймер сброшен на полные 4000 мс (не «удвоен» и не суммирован).
    expect(world.store('shockState').get(player)?.remainingMs).toBe(4000);
  });

  it('cooldown возвращается в chase по истечении cooldownMs', () => {
    const world = build();
    addPlayer(world, 1, 0, 100);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'cooldown'); // 1500 мс у Раков

    aiSystem(world, 1.499, INPUT);
    expect(world.store('aiState').get(enemy)?.phase).toBe('cooldown');
    aiSystem(world, 0.001, INPUT);
    expect(world.store('aiState').get(enemy)?.phase).toBe('chase');
  });

  it('оглушённый враг (stunnedMs > 0) не продвигает фазу и стоит на месте', () => {
    const world = build();
    addPlayer(world, 1, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'telegraph');
    const state = world.store('aiState').get(enemy);
    if (state) state.stunnedMs = 500;
    const elapsedBeforeStun = world.store('aiState').get(enemy)?.phaseElapsedMs;

    aiSystem(world, 0.1, INPUT);

    expect(world.store('aiState').get(enemy)?.phase).toBe('telegraph');
    expect(world.store('aiState').get(enemy)?.phaseElapsedMs).toBe(elapsedBeforeStun); // телеграф не продвинулся
    expect(world.store('aiState').get(enemy)?.stunnedMs).toBeCloseTo(400, 3);
    expect(world.store('velocity').get(enemy)).toEqual({ vx: 0, vy: 0 });
  });

  it('мёртвый враг (hp ≤ 0) не действует', () => {
    const world = build();
    addPlayer(world, 1, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    const health = world.store('health').get(enemy);
    if (health) health.hp = 0;

    expect(() => aiSystem(world, 1 / 60, INPUT)).not.toThrow();
    expect(world.store('aiState').get(enemy)?.phase).toBe('idle');
    expect(world.store('velocity').get(enemy)).toEqual({ vx: 0, vy: 0 });
  });

  it('цель, умершая между телеграфом и резолвом (alive() === false), не роняет систему', () => {
    const world = build();
    const player = addPlayer(world, 1, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    advanceUntilPhase(world, enemy, 'attack');
    world.destroy(player);

    expect(() => aiSystem(world, 1 / 60, INPUT)).not.toThrow();
    expect(world.store('aiState').get(enemy)?.phase).toBe('cooldown');
  });

  it('без событий combat.death, когда игрок не умирает от удара', () => {
    const world = build();
    addPlayer(world, 1, 0, 1000);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    const handler = vi.fn();
    world.events.on('combat.death', handler);

    advanceUntilPhase(world, enemy, 'cooldown');
    world.events.drain();

    expect(handler).not.toHaveBeenCalled();
  });

  it('эмитит combat.hit/combat.death, когда удар добивает игрока', () => {
    const world = build();
    addPlayer(world, 1, 0, 10);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    const hitHandler = vi.fn();
    const deathHandler = vi.fn();
    world.events.on('combat.hit', hitHandler);
    world.events.on('combat.death', deathHandler);

    advanceUntilPhase(world, enemy, 'cooldown');
    world.events.drain();

    expect(hitHandler).toHaveBeenCalledTimes(1);
    expect(deathHandler).toHaveBeenCalledTimes(1);
  });

  it('из нескольких «controlled»-сущностей агрится на ближайшую (сравнение и «дальше — не обновляем», и «ближе — обновляем»)', () => {
    const world = build();
    const far = addPlayer(world, 20, 0);
    const near = addPlayer(world, 2, 0);
    const evenFarther = addPlayer(world, 5, 0); // дальше near, создан после — проверяет ветку «не обновляем best»
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });

    aiSystem(world, 1 / 60, INPUT);

    expect(world.store('aiState').get(enemy)?.targetId).toBe(near);
    expect(world.store('aiState').get(enemy)?.targetId).not.toBe(far);
    expect(world.store('aiState').get(enemy)?.targetId).not.toBe(evenFarther);
  });

  it('цель без health-компонента — резолв атаки не падает и не эмитит combat.hit', () => {
    const world = build();
    const player = world.create();
    world.store('transform').add(player, { x: 1, y: 0, z: 0, prevX: 1, prevY: 0 });
    world.store('velocity').add(player, { vx: 0, vy: 0 });
    world.store('controlled').add(player, { speed: 4 }); // намеренно без health
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0, y: 0 });
    const hitHandler = vi.fn();
    world.events.on('combat.hit', hitHandler);

    expect(() => advanceUntilPhase(world, enemy, 'cooldown')).not.toThrow();
    world.events.drain();

    expect(hitHandler).not.toHaveBeenCalled();
  });
});
