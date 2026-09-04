import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createInputSnapshot, type InputSnapshot } from '../../../src/core/input';
import type { SeededRng } from '../../../src/core/rng';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld, type EntityId, type World } from '../../../src/core/world';
import type { PerkId } from '../../../src/sim/formulas/perks';
import { spawnEnemy } from '../../../src/sim/systems/ai';
import {
  combatSystem,
  createWeaponRuntimeState,
  createWeaponsComponent,
} from '../../../src/sim/systems/combat';

/** RNG с заранее заданной очередью значений `next()` — детерминированный контроль над разбросом/критом в тестах. Последнее значение повторяется после исчерпания очереди. */
function fakeRng(sequence: readonly number[]): SeededRng {
  let i = 0;
  const next = (): number => {
    const v = sequence[i] ?? sequence[sequence.length - 1] ?? 0;
    if (i < sequence.length) i += 1;
    return v;
  };
  return {
    seed: 0,
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    range: (min: number, max: number) => next() * (max - min) + min,
  };
}

function build(rng: SeededRng = createSeededRng(1)): World {
  return createWorld(rng, createEventBus());
}

interface HeroOpts {
  readonly hp?: number;
  readonly courage?: number;
  readonly reflex?: number;
  readonly guns?: number;
  readonly heavy?: number;
  readonly fists?: number;
  readonly facing?: { dirX: number; dirY: number };
}

/** Полностью снаряжённый герой: все компоненты, которые в demo-scene навешиваются поверх createHero (OF-016). */
function addHero(world: World, x: number, y: number, opts: HeroOpts = {}): EntityId {
  const hero = world.create();
  world.store('transform').add(hero, { x, y, z: 0, prevX: x, prevY: y });
  world.store('velocity').add(hero, { vx: 0, vy: 0 });
  world.store('controlled').add(hero, { speed: 4 });
  world.store('collidable').add(hero, { radius: 0.3 });
  world.store('health').add(hero, { hp: opts.hp ?? 100, maxHp: opts.hp ?? 100, armor: 0 });
  world.store('weapons').add(hero, createWeaponsComponent());
  world.store('facing').add(hero, opts.facing ?? { dirX: 1, dirY: 0 });
  world.store('attributes').add(hero, { courage: opts.courage ?? 5, reflex: opts.reflex ?? 5 });
  world
    .store('combatSkills')
    .add(hero, { guns: opts.guns ?? 50, heavy: opts.heavy ?? 50, fists: opts.fists ?? 50 });
  world.store('dashState').add(hero, { iframesRemainingMs: 0, cooldownRemainingMs: 0 });
  return hero;
}

const NO_SPREAD_NO_CRIT: readonly number[] = [0.5, 0.99];
const NO_SPREAD_CRIT: readonly number[] = [0.5, 0];

function attackInput(overrides: Partial<InputSnapshot> = {}): InputSnapshot {
  return createInputSnapshot({ held: new Set(['attack']), ...overrides });
}

describe('sim/systems/combat: createWeaponsComponent/createWeaponRuntimeState', () => {
  it('стартовое состояние — полный магазин, без КД/перезарядки/комбо', () => {
    expect(createWeaponRuntimeState('item.pistol_ogryzok')).toEqual({
      ammo: 8,
      cooldownMs: 0,
      reloadRemainingMs: 0,
      comboHits: 0,
      comboTargetId: null,
    });
  });

  it('оружие без магазина (Кран) — ammo=0', () => {
    expect(createWeaponRuntimeState('item.wrench_kran').ammo).toBe(0);
  });

  it('createWeaponsComponent экипирует пистолет по умолчанию, содержит все три оружия среза', () => {
    const weapons = createWeaponsComponent();
    expect(weapons.equipped).toBe('item.pistol_ogryzok');
    expect(Object.keys(weapons.states).sort()).toEqual(
      ['item.pistol_ogryzok', 'item.shotgun_duplo', 'item.wrench_kran'].sort(),
    );
  });
});

describe('sim/systems/combat: переключение оружия/перезарядка', () => {
  it('slot2/slot3 переключают экипированное оружие, каждое хранит своё состояние независимо', () => {
    const world = build();
    const hero = addHero(world, 0, 0);

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['slot2']) }));
    expect(world.store('weapons').get(hero)?.equipped).toBe('item.shotgun_duplo');

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['slot3']) }));
    expect(world.store('weapons').get(hero)?.equipped).toBe('item.wrench_kran');
  });

  it('reload запускает перезарядку, ammo не меняется мгновенно', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.states['item.pistol_ogryzok'].ammo = 3;

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['reload']) }));

    const state = world.store('weapons').get(hero)?.states['item.pistol_ogryzok'];
    expect(state?.reloadRemainingMs).toBe(1200);
    expect(state?.ammo).toBe(3);
  });

  it('по истечении reloadMs магазин заполняется полностью', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.states['item.pistol_ogryzok'].ammo = 0;

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['reload']) }));
    combatSystem(world, 1.2, createInputSnapshot());

    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].ammo).toBe(8);
    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].reloadRemainingMs).toBe(0);
  });

  it('reload не запускается повторно, если магазин уже полон', () => {
    const world = build();
    const hero = addHero(world, 0, 0);

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['reload']) }));

    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].reloadRemainingMs).toBe(0);
  });

  it('стрельба недоступна во время перезарядки — патроны не расходуются, снаряд не появляется', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) {
      weapons.states['item.pistol_ogryzok'].ammo = 3;
      weapons.states['item.pistol_ogryzok'].reloadRemainingMs = 500;
    }

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].ammo).toBe(3);
    expect([...world.query('projectile')]).toHaveLength(0);
  });
});

describe('sim/systems/combat: перезарядка/КД тикают на всё оружие независимо от экипированного', () => {
  it('КД неэкипированного оружия тоже уменьшается', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.states['item.shotgun_duplo'].cooldownMs = 100;

    combatSystem(world, 0.05, createInputSnapshot());

    expect(world.store('weapons').get(hero)?.states['item.shotgun_duplo'].cooldownMs).toBeCloseTo(50, 6);
  });
});

describe('sim/systems/combat: facing (прицеливание по направлению движения)', () => {
  it('обновляет facing по moveX/moveY, нормализуя вектор', () => {
    const world = build();
    const hero = addHero(world, 0, 0, { facing: { dirX: 1, dirY: 0 } });

    combatSystem(world, 1 / 60, createInputSnapshot({ moveX: 0, moveY: -1 }));

    expect(world.store('facing').get(hero)).toEqual({ dirX: 0, dirY: -1 });
  });

  it('сохраняет последнее направление, если ввод движения нулевой', () => {
    const world = build();
    const hero = addHero(world, 0, 0, { facing: { dirX: 0, dirY: -1 } });

    combatSystem(world, 1 / 60, createInputSnapshot());

    expect(world.store('facing').get(hero)).toEqual({ dirX: 0, dirY: -1 });
  });
});

describe('sim/systems/combat: стрельба «Огрызком» — снаряды', () => {
  it('held(attack) с боезапасом порождает снаряд, расходует патрон, выставляет КД', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].ammo).toBe(7);
    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].cooldownMs).toBe(250);
    const projectiles = [...world.query('projectile')];
    expect(projectiles).toHaveLength(1);
    const projectile = world.store('projectile').get(projectiles[0] as EntityId);
    expect(projectile?.dirX).toBeCloseTo(1, 6); // facing (1,0), без разброса (rng.next()=0.5 → offset 0)
    expect(projectile?.dirY).toBeCloseTo(0, 6);
    expect(projectile?.crit).toBe(1);
    expect(projectile?.baseDamage).toBe(8);
  });

  it('крит-бросок (rng → крит) помечает снаряд Крит=2', () => {
    const world = build(fakeRng(NO_SPREAD_CRIT));
    addHero(world, 0, 0);

    combatSystem(world, 1 / 60, attackInput());

    const [projectileId] = [...world.query('projectile')];
    expect(world.store('projectile').get(projectileId as EntityId)?.crit).toBe(2);
  });

  it('на КД повторный выстрел не расходует патрон', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);

    combatSystem(world, 1 / 60, attackInput());
    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].ammo).toBe(7);
    expect([...world.query('projectile')]).toHaveLength(1);
  });

  it('пустой магазин — выстрела нет, штрафа/авто-перезарядки нет (§1 combat.md)', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.states['item.pistol_ogryzok'].ammo = 0;

    combatSystem(world, 1 / 60, attackInput());

    expect([...world.query('projectile')]).toHaveLength(0);
    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].reloadRemainingMs).toBe(0);
  });

  it('снаряд летит и попадает во врага, наносит урон и эмитит combat.hit', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 0, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0.2, y: 0 }); // сразу на пути снаряда

    const hitHandler = vi.fn();
    world.events.on('combat.hit', hitHandler);

    combatSystem(world, 1 / 60, attackInput());
    world.events.drain();

    expect(hitHandler).toHaveBeenCalledTimes(1);
    // §4.1: База=8, Навык=50, Крит=1, Слабость=1 (raki не в telegraph), Броня=2 → max(1, 8×1×1×1−2) = 6
    expect(world.store('health').get(enemy)?.hp).toBe(34);
  });

  it('снаряд, врезавшийся в стену, уничтожается без урона', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 0.5, 0.5);
    const grid = world.create();
    const collision = new Uint8Array(4 * 4);
    collision[0 * 4 + 2] = 1; // стена прямо по курсу (x=2,y=0)
    world.store('mapGrid').add(grid, { width: 4, height: 4, collision });

    combatSystem(world, 1 / 60, attackInput());
    for (let i = 0; i < 10 && [...world.query('projectile')].length > 0; i += 1) {
      combatSystem(world, 1 / 60, createInputSnapshot());
    }

    expect([...world.query('projectile')]).toHaveLength(0);
  });

  it('снаряд, не встретивший ничего, самоуничтожается за пределом дальности', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 0, 0);

    combatSystem(world, 1 / 60, attackInput());
    // Огрызок: 18 тайлов/с, дальность 14 тайлов ⇒ долетает за < 1 с.
    for (let i = 0; i < 60; i += 1) combatSystem(world, 1 / 60, createInputSnapshot());

    expect([...world.query('projectile')]).toHaveLength(0);
  });

  it('«Дупло» на дистанции свыше 6 м наносит половину урона (§3.1)', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.shotgun_duplo';
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 7, y: 0 }); // за пределом 6 м «Дупла»

    combatSystem(world, 1 / 60, attackInput());
    for (let i = 0; i < 60 && [...world.query('projectile')].length > 0; i += 1) {
      combatSystem(world, 1 / 60, createInputSnapshot());
    }

    // §4.1 с половинным уроном «Дупла»: База 14×0,5=7, Навык=50, Крит=1, Слабость=1, Броня=2 → max(1,7−2)=5
    expect(world.store('health').get(enemy)?.hp).toBe(35);
  });
});

describe('sim/systems/combat: слабость врага применяется по фазе ИИ', () => {
  it('попадание по раку во время telegraph даёт множитель ×1,5', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 0, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0.2, y: 0 });
    const aiState = world.store('aiState').get(enemy);
    if (aiState) aiState.phase = 'telegraph';

    combatSystem(world, 1 / 60, attackInput());

    // §4.1: 8×1×1×1,5−2 = 10
    expect(world.store('health').get(enemy)?.hp).toBe(30);
  });
});

describe('sim/systems/combat: рывок', () => {
  it('pressed(dash) с готовым откатом выставляет i-frames по Острота и запускает откат 800 мс', () => {
    const world = build();
    const hero = addHero(world, 0, 0, { reflex: 10 });

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['dash']) }));

    expect(world.store('dashState').get(hero)).toEqual({
      iframesRemainingMs: 200,
      cooldownRemainingMs: 800,
    });
  });

  it('повторный рывок недоступен, пока не истёк откат', () => {
    const world = build();
    const hero = addHero(world, 0, 0, { reflex: 5 });

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['dash']) }));
    combatSystem(world, 0.5, createInputSnapshot({ pressed: new Set(['dash']) }));

    // Откат ещё не истёк (0.5с < 0.8с) — iframes не переставлены заново.
    expect(world.store('dashState').get(hero)?.cooldownRemainingMs).toBeCloseTo(300, 3);
  });

  it('рывок недоступен во время обездвиживания', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    world.store('immobilized').add(hero, { remainingMs: 500 });

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['dash']) }));

    expect(world.store('dashState').get(hero)?.cooldownRemainingMs).toBe(0);
  });
});

describe('sim/systems/combat: «Кран» (ближний бой)', () => {
  it('удар по врагу в радиусе наносит урон по формуле §5.1', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const enemy = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.5, y: 0 });

    combatSystem(world, 1 / 60, attackInput());

    // §5.1: 18×(0,75+0,25)×1×1 − 4×0,5 = 16
    expect(world.store('health').get(enemy)?.hp).toBe(14);
  });

  it('не тратит патроны и не создаёт снаряд', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.5, y: 0 });

    combatSystem(world, 1 / 60, attackInput());

    expect([...world.query('projectile')]).toHaveLength(0);
  });

  it('каждый 3-й удар подряд по одной цели оглушает её на 0,5 с и прерывает её телеграф', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const enemy = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.5, y: 0 });
    const health = world.store('health').get(enemy);
    if (health) health.hp = 9999; // изолируем механику оглушения от механики смерти
    const aiState = world.store('aiState').get(enemy);
    if (aiState) aiState.phase = 'telegraph';

    combatSystem(world, 1 / 60, attackInput());
    combatSystem(world, 0.6, attackInput()); // КД «Крана» 0,6 с — второй удар доступен
    combatSystem(world, 0.6, attackInput()); // третий удар — оглушение

    expect(world.store('aiState').get(enemy)?.stunnedMs).toBe(500);
    expect(world.store('aiState').get(enemy)?.phase).toBe('cooldown');
    expect(world.store('weapons').get(hero)?.states['item.wrench_kran'].comboHits).toBe(0);
  });

  it('промах по пустому месту сбрасывает счётчик комбо', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';

    combatSystem(world, 1 / 60, attackInput()); // никого нет рядом — промах, комбо остаётся 0

    expect(world.store('weapons').get(hero)?.states['item.wrench_kran'].comboHits).toBe(0);
  });

  it('из нескольких врагов в радиусе бьёт ближайшего', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const far = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 1.0, y: 0 });
    const near = spawnEnemy(world, 'enemy.raki', { x: 0.4, y: 0 });

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('health').get(near)?.hp).toBeLessThan(40);
    expect(world.store('health').get(far)?.hp).toBe(30);
  });
});

describe('sim/systems/combat: боевые статы по умолчанию (компоненты attributes/combatSkills отсутствуют у героя)', () => {
  it('ближний бой использует Кураж=5/НавыкКулаки=50 по умолчанию', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    world.store('attributes').remove(hero);
    world.store('combatSkills').remove(hero);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const enemy = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.5, y: 0 });

    combatSystem(world, 1 / 60, attackInput());

    // Тот же результат, что и с явными courage=5/fists=50 (см. тест формулы §5.1 выше) — 16 урона.
    expect(world.store('health').get(enemy)?.hp).toBe(14);
  });

  it('стрельба использует Навык=50 по умолчанию для веток guns и heavy', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    world.store('attributes').remove(hero);
    world.store('combatSkills').remove(hero);

    combatSystem(world, 1 / 60, attackInput());

    const [projectileId] = [...world.query('projectile')];
    expect(world.store('projectile').get(projectileId as EntityId)?.skill).toBe(50);

    const weapons = world.store('weapons').get(hero);
    if (weapons) {
      weapons.equipped = 'item.shotgun_duplo';
      weapons.states['item.shotgun_duplo'].cooldownMs = 0;
    }
    combatSystem(world, 1 / 60, attackInput());
    const projectiles = [...world.query('projectile')];
    const shotgunProjectile = world.store('projectile').get(projectiles[1] as EntityId);
    expect(shotgunProjectile?.skill).toBe(50);
  });
});

describe('sim/systems/combat: слабость по умолчанию, если у цели нет aiState', () => {
  it('снаряд по «голой» enemy-сущности без aiState считает слабость неактивной, а не падает', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 0, 0);
    const bareEnemy = world.create();
    world.store('transform').add(bareEnemy, { x: 0.2, y: 0, z: 0, prevX: 0.2, prevY: 0 });
    world.store('collidable').add(bareEnemy, { radius: 0.35 });
    world.store('health').add(bareEnemy, { hp: 40, maxHp: 40, armor: 2 });
    world.store('enemy').add(bareEnemy, { defId: 'enemy.raki' });
    // Намеренно без `aiState` — защитная ветка на случай неполной сущности.

    expect(() => combatSystem(world, 1 / 60, attackInput())).not.toThrow();

    // Слабость не применяется (weaknessActive считается false без aiState) — та же формула, что и в базовом тесте: 6 урона.
    expect(world.store('health').get(bareEnemy)?.hp).toBe(34);
  });

  it('«Кран» по «голой» enemy-сущности без aiState — то же самое для ближнего боя', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const bareEnemy = world.create();
    world.store('transform').add(bareEnemy, { x: 0.5, y: 0, z: 0, prevX: 0.5, prevY: 0 });
    world.store('collidable').add(bareEnemy, { radius: 0.35 });
    world.store('health').add(bareEnemy, { hp: 30, maxHp: 30, armor: 4 });
    world.store('enemy').add(bareEnemy, { defId: 'enemy.ohrana_progress2' });

    expect(() => combatSystem(world, 1 / 60, attackInput())).not.toThrow();

    expect(world.store('health').get(bareEnemy)?.hp).toBe(14);
  });
});

describe('sim/systems/combat: смерть врага', () => {
  it('враг с ХП ≤ 0 удаляется из мира в этом же тике (cleanupDeadEnemies)', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 0, 0);
    const enemy = spawnEnemy(world, 'enemy.podlineiny', { x: 0.2, y: 0 }); // ХП 25, Броня 0
    const health = world.store('health').get(enemy);
    if (health) health.hp = 3; // почти мёртв — один выстрел добьёт

    const deathHandler = vi.fn();
    world.events.on('combat.death', deathHandler);

    combatSystem(world, 1 / 60, attackInput());
    world.events.drain();

    expect(deathHandler).toHaveBeenCalledTimes(1);
    expect(world.alive(enemy)).toBe(false);
  });
});

describe('sim/systems/combat: SYSTEM_ORDER (интеграция)', () => {
  it('inputControlSystem гасит скорость шокированного игрока на 15%', async () => {
    const { inputControlSystem } = await import('../../../src/sim/systems/input-control');
    const world = build();
    const hero = addHero(world, 0, 0);
    world.store('shockState').add(hero, { remainingMs: 1000 });

    inputControlSystem(world, 1 / 60, createInputSnapshot({ moveX: 1, moveY: 0 }));

    expect(world.store('velocity').get(hero)?.vx).toBeCloseTo(4 * 0.85, 6);
  });

  it('inputControlSystem останавливает мёртвого игрока', async () => {
    const { inputControlSystem } = await import('../../../src/sim/systems/input-control');
    const world = build();
    const hero = addHero(world, 0, 0, { hp: 1 });
    const health = world.store('health').get(hero);
    if (health) health.hp = 0;

    inputControlSystem(world, 1 / 60, createInputSnapshot({ moveX: 1, moveY: 0 }));

    expect(world.store('velocity').get(hero)).toEqual({ vx: 0, vy: 0 });
  });

  it('inputControlSystem блокирует обездвиженного игрока', async () => {
    const { inputControlSystem } = await import('../../../src/sim/systems/input-control');
    const world = build();
    const hero = addHero(world, 0, 0);
    world.store('immobilized').add(hero, { remainingMs: 500 });

    inputControlSystem(world, 1 / 60, createInputSnapshot({ moveX: 1, moveY: 0 }));

    expect(world.store('velocity').get(hero)).toEqual({ vx: 0, vy: 0 });
  });
});

describe('sim/systems/combat: tickPlayerTimers — сущности без части боевых компонентов', () => {
  it('controlled+weapons без dashState/shockState/immobilized не падает', () => {
    const world = build();
    const hero = world.create();
    world.store('transform').add(hero, { x: 0, y: 0, z: 0, prevX: 0, prevY: 0 });
    world.store('velocity').add(hero, { vx: 0, vy: 0 });
    world.store('controlled').add(hero, { speed: 4 });
    world.store('weapons').add(hero, createWeaponsComponent());

    expect(() => combatSystem(world, 1 / 60, createInputSnapshot())).not.toThrow();
  });

  it('активный shockState тикает вниз внутри combatSystem (tickPlayerTimers)', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    world.store('shockState').add(hero, { remainingMs: 1000 });

    combatSystem(world, 0.5, createInputSnapshot());

    expect(world.store('shockState').get(hero)?.remainingMs).toBeCloseTo(500, 3);
  });
});

describe('sim/systems/combat: findNearestEnemyInRange — фильтры дальности/живости/сравнения', () => {
  it('пропускает мёртвого врага в физическом радиусе, бьёт следующего живого', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const dead = spawnEnemy(world, 'enemy.raki', { x: 0.3, y: 0 });
    const deadHealth = world.store('health').get(dead);
    if (deadHealth) deadHealth.hp = 0;
    const alive = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.6, y: 0 });

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('health').get(alive)?.hp).toBeLessThan(30);
  });

  it('игнорирует врага геометрически вне радиуса удара', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const farAway = spawnEnemy(world, 'enemy.raki', { x: 5, y: 0 }); // meleeRangeM «Крана» = 1,2

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('health').get(farAway)?.hp).toBe(40);
  });

  it('из трёх целей в радиусе бьёт ближайшую (в т.ч. «не обновляем best», если следующая дальше)', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const mid = spawnEnemy(world, 'enemy.raki', { x: 0.8, y: 0 });
    const nearest = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.3, y: 0 });
    const farthest = spawnEnemy(world, 'enemy.podlineiny', { x: 1.0, y: 0 });

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('health').get(nearest)?.hp).toBeLessThan(30);
    expect(world.store('health').get(mid)?.hp).toBe(40);
    expect(world.store('health').get(farthest)?.hp).toBe(25);
  });
});

describe('sim/systems/combat: слабость активна в ближнем бою (окно cooldown у Охраны)', () => {
  it('удар «Краном» по Охране во время её окна перезарядки даёт ×2', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const enemy = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.5, y: 0 });
    const health = world.store('health').get(enemy);
    if (health) health.hp = 9999; // изолируем множитель слабости от смерти/уборки трупа
    const aiState = world.store('aiState').get(enemy);
    if (aiState) aiState.phase = 'cooldown';

    combatSystem(world, 1 / 60, attackInput());

    // §5.1 со Слабость=2: 18×(0,75+0,25)×1×2 − 4×0,5 = 34
    expect(world.store('health').get(enemy)?.hp).toBe(9999 - 34);
  });
});

describe('sim/systems/combat: handlePlayerWeapons — переключение slot1, мёртвый герой', () => {
  it('slot1 возвращает экипировку на пистолет с любого другого оружия', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['slot1']) }));

    expect(world.store('weapons').get(hero)?.equipped).toBe('item.pistol_ogryzok');
  });

  it('мёртвый герой не стреляет и не переключает оружие', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0, { hp: 10 });
    const health = world.store('health').get(hero);
    if (health) health.hp = 0;

    combatSystem(
      world,
      1 / 60,
      createInputSnapshot({ held: new Set(['attack']), pressed: new Set(['slot2']) }),
    );

    expect([...world.query('projectile')]).toHaveLength(0);
    expect(world.store('weapons').get(hero)?.equipped).toBe('item.pistol_ogryzok');
  });
});

describe('sim/systems/combat: handlePlayerDash — мёртвый герой', () => {
  it('мёртвый герой не может рывком уйти в неуязвимость', () => {
    const world = build();
    const hero = addHero(world, 0, 0, { hp: 10 });
    const health = world.store('health').get(hero);
    if (health) health.hp = 0;

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['dash']) }));

    expect(world.store('dashState').get(hero)?.cooldownRemainingMs).toBe(0);
  });
});

describe('sim/systems/combat: новые события шины для аудио-слоя (OF-026)', () => {
  it('выстрел из «Огрызка» эмитит combat.weapon-fired с branch=guns', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 1, 2);

    const handler = vi.fn();
    world.events.on('combat.weapon-fired', handler);

    combatSystem(world, 1 / 60, attackInput());
    world.events.drain();

    expect(handler).toHaveBeenCalledExactlyOnceWith({
      ownerId: hero,
      weaponId: 'item.pistol_ogryzok',
      branch: 'guns',
      wx: 1,
      wy: 2,
    });
  });

  it('удар «Краном» (в т.ч. промах) тоже эмитит combat.weapon-fired с branch=fists', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';

    const handler = vi.fn();
    world.events.on('combat.weapon-fired', handler);

    combatSystem(world, 1 / 60, attackInput()); // никого рядом нет — промах, звук взмаха всё равно есть
    world.events.drain();

    expect(handler).toHaveBeenCalledExactlyOnceWith({
      ownerId: hero,
      weaponId: 'item.wrench_kran',
      branch: 'fists',
      wx: 0,
      wy: 0,
    });
  });

  it('запуск перезарядки эмитит combat.reload-start', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.states['item.pistol_ogryzok'].ammo = 3;

    const handler = vi.fn();
    world.events.on('combat.reload-start', handler);

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['reload']) }));
    world.events.drain();

    expect(handler).toHaveBeenCalledExactlyOnceWith({
      ownerId: hero,
      weaponId: 'item.pistol_ogryzok',
    });
  });

  it('повторный reload на уже идущей перезарядке не эмитит второй combat.reload-start', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.states['item.pistol_ogryzok'].ammo = 3;

    const handler = vi.fn();
    world.events.on('combat.reload-start', handler);

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['reload']) }));
    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['reload']) }));
    world.events.drain();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('выстрел по пустому магазину эмитит combat.fire-empty, а не combat.weapon-fired', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.states['item.pistol_ogryzok'].ammo = 0;

    const emptyHandler = vi.fn();
    const firedHandler = vi.fn();
    world.events.on('combat.fire-empty', emptyHandler);
    world.events.on('combat.weapon-fired', firedHandler);

    combatSystem(world, 1 / 60, attackInput());
    world.events.drain();

    expect(emptyHandler).toHaveBeenCalledExactlyOnceWith({
      ownerId: hero,
      weaponId: 'item.pistol_ogryzok',
    });
    expect(firedHandler).not.toHaveBeenCalled();
  });

  it('успешный рывок эмитит combat.dash-start с позицией героя', () => {
    const world = build();
    const hero = addHero(world, 3, 4, { reflex: 10 });

    const handler = vi.fn();
    world.events.on('combat.dash-start', handler);

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['dash']) }));
    world.events.drain();

    expect(handler).toHaveBeenCalledExactlyOnceWith({ ownerId: hero, wx: 3, wy: 4 });
  });

  it('рывок на откате не эмитит combat.dash-start повторно', () => {
    const world = build();
    addHero(world, 0, 0, { reflex: 5 });

    const handler = vi.fn();
    world.events.on('combat.dash-start', handler);

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['dash']) }));
    combatSystem(world, 0.1, createInputSnapshot({ pressed: new Set(['dash']) }));
    world.events.drain();

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('sim/systems/combat: снаряды — выход за границу карты и защита от самопоражения', () => {
  it('снаряд, вылетевший за границу сетки без стены на пути, уничтожается на границе', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 1.5, 1.5, { facing: { dirX: -1, dirY: 0 } });
    const grid = world.create();
    world.store('mapGrid').add(grid, { width: 4, height: 4, collision: new Uint8Array(16) });

    combatSystem(world, 1 / 60, attackInput());
    for (let i = 0; i < 10 && [...world.query('projectile')].length > 0; i += 1) {
      combatSystem(world, 1 / 60, createInputSnapshot());
    }

    expect([...world.query('projectile')]).toHaveLength(0);
  });

  it('снаряд не может «попасть» в свой собственный источник (ownerId), даже если тот отмечен как enemy', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    // Синтетическая сущность-«владелец», помеченная как enemy — проверяет,
    // что защита `entity === ownerId` в `findProjectileTarget` реально
    // фильтрует источник снаряда, а не просто полагается на то, что игрок
    // никогда не бывает `enemy` в текущем содержимом игры.
    world.store('enemy').add(hero, { defId: 'enemy.raki' });
    world.store('collidable').add(hero, { radius: 0.3 });
    world.store('health').add(hero, { hp: 100, maxHp: 100, armor: 0 }); // нужен для world.query(..., 'health'), иначе цикл findProjectileTarget вообще не дойдёт до проверки ownerId

    const projectile = world.create();
    world.store('transform').add(projectile, { x: 0, y: 0, z: 0, prevX: 0, prevY: 0 });
    world.store('projectile').add(projectile, {
      ownerId: hero,
      dirX: 1,
      dirY: 0,
      speed: 18,
      baseDamage: 8,
      weaponId: 'item.pistol_ogryzok',
      skill: 50,
      crit: 1,
      traveled: 0,
      maxRangeM: 14,
    });

    combatSystem(world, 1 / 600, createInputSnapshot());

    // Снаряд пережил тик — не «поразил» собственного владельца немедленно на старте.
    expect(world.alive(projectile)).toBe(true);
    expect(world.store('health').get(hero)?.hp).toBe(100);
  });

  it('пропускает уже мёртвого (но ещё не убранного) врага при поиске цели снаряда', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 0, 0);
    const deadEnemy = spawnEnemy(world, 'enemy.raki', { x: 0.2, y: 0 });
    const deadHealth = world.store('health').get(deadEnemy);
    if (deadHealth) deadHealth.hp = 0; // мёртв, но ещё не destroy() — cleanupDeadEnemies отработает только после combatSystem

    expect(() => combatSystem(world, 1 / 60, attackInput())).not.toThrow();
    // Снаряд пролетает мимо мёртвого — цель не найдена, снаряд продолжает лететь.
    expect([...world.query('projectile')]).toHaveLength(1);
  });
});

describe('sim/systems/combat: OF-035 — перки героя, читаемые через aggregatePerkEffects', () => {
  function addPerks(
    world: World,
    hero: EntityId,
    unlockedPerkIds: readonly PerkId[],
    overrides: { lastStandAvailable?: boolean; guaranteedCritPending?: boolean } = {},
  ): void {
    world.store('perks').add(hero, {
      unlockedPerkIds: [...unlockedPerkIds],
      lastStandAvailable: overrides.lastStandAvailable ?? false,
      guaranteedCritPending: overrides.guaranteedCritPending ?? false,
    });
  }

  it('«Быстрые руки» ускоряет перезарядку на 25% (0,9 с вместо 1,2 с у «Огрызка»)', () => {
    const world = build();
    const hero = addHero(world, 0, 0);
    addPerks(world, hero, ['perk.bystrye_ruki']);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.states['item.pistol_ogryzok'].ammo = 3;

    combatSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['reload']) }));

    expect(world.store('weapons').get(hero)?.states['item.pistol_ogryzok'].reloadRemainingMs).toBeCloseTo(900, 6);
  });

  it('«Твёрдая рука» снижает разброс на бегу (предел КоэфДвижения 1,3 вместо 1,6 для «Дупла»)', () => {
    // rng.next()=1 → максимальный офсет разброса (в одну сторону), второй
    // next()=0.99 → без крита — так угол снаряда напрямую показывает разброс.
    const withoutPerk = build(fakeRng([1, 0.99]));
    const heroWithout = addHero(withoutPerk, 0, 0);
    const weaponsWithout = withoutPerk.store('weapons').get(heroWithout);
    if (weaponsWithout) weaponsWithout.equipped = 'item.shotgun_duplo';
    combatSystem(withoutPerk, 1 / 60, attackInput({ moveX: 1, moveY: 0 }));
    const projectileWithout = withoutPerk
      .store('projectile')
      .get([...withoutPerk.query('projectile')][0] as EntityId);

    const withPerk = build(fakeRng([1, 0.99]));
    const heroWith = addHero(withPerk, 0, 0);
    addPerks(withPerk, heroWith, ['perk.tvyordaya_ruka']);
    const weaponsWith = withPerk.store('weapons').get(heroWith);
    if (weaponsWith) weaponsWith.equipped = 'item.shotgun_duplo';
    combatSystem(withPerk, 1 / 60, attackInput({ moveX: 1, moveY: 0 }));
    const projectileWith = withPerk.store('projectile').get([...withPerk.query('projectile')][0] as EntityId);

    // Меньший предел КоэфДвижения (1,3 вместо 1,6) даёт меньший разброс —
    // снаряд с перком летит ближе к направлению взгляда (dirX ближе к 1).
    expect(projectileWithout?.dirX).toBeCloseTo(0.9867, 3);
    expect(projectileWith?.dirX).toBeCloseTo(0.9912, 3);
    expect(projectileWith?.dirX ?? 0).toBeGreaterThan(projectileWithout?.dirX ?? 0);
  });

  it('«Последний патрон»: guaranteedCritPending форсирует крит следующего выстрела и гасится после использования', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT)); // rng сам по себе НЕ дал бы крит
    const hero = addHero(world, 0, 0);
    addPerks(world, hero, ['perk.posledniy_patron'], { guaranteedCritPending: true });

    combatSystem(world, 1 / 60, attackInput());

    const [projectileId] = [...world.query('projectile')];
    expect(world.store('projectile').get(projectileId as EntityId)?.crit).toBe(2);
    expect(world.store('perks').get(hero)?.guaranteedCritPending).toBe(false);
  });

  it('«Крепкий хребет»/«Оба кулака» умножают урон в рукопашной поверх формулы §5.1', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    addPerks(world, hero, ['perk.krepkiy_khrebet', 'perk.oba_kulaka']);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const enemy = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.5, y: 0 });

    combatSystem(world, 1 / 60, attackInput());

    // База §5.1 без перков = 16 (см. тест выше); ×1,15×1,5 = 27,6
    expect(world.store('health').get(enemy)?.hp).toBeCloseTo(30 - 16 * 1.15 * 1.5, 6);
  });

  it('без компонента perks — поведение идентично отсутствию перков (регрессия)', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const enemy = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.5, y: 0 });

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('health').get(enemy)?.hp).toBe(14);
  });
});

describe('sim/systems/combat: OF-035 — начисление опыта убийце (formulas/progression.ts)', () => {
  function addProgression(world: World, hero: EntityId): void {
    world.store('progression').add(hero, { xp: 0, level: 1, skillPoints: 0, smekalka: 5 });
  }

  it('убийство врага снарядом начисляет опыт по xpLevel/danger врага', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    addProgression(world, hero);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0.2, y: 0 });
    const health = world.store('health').get(enemy);
    if (health) health.hp = 1; // один выстрел добивает

    combatSystem(world, 1 / 60, attackInput());

    // enemy.raki: xpLevel=1, danger=0 → xpForEnemyKill(1,0) = 10
    expect(world.store('progression').get(hero)?.xp).toBe(10);
  });

  it('убийство врага «Краном» тоже начисляет опыт (общая точка applyDamageToEnemy)', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    addProgression(world, hero);
    const weapons = world.store('weapons').get(hero);
    if (weapons) weapons.equipped = 'item.wrench_kran';
    const enemy = spawnEnemy(world, 'enemy.ohrana_progress2', { x: 0.5, y: 0 });
    const health = world.store('health').get(enemy);
    if (health) health.hp = 1;

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('progression').get(hero)?.xp).toBe(10);
  });

  it('ранение, не убивающее врага, не начисляет опыт', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    addProgression(world, hero);
    spawnEnemy(world, 'enemy.raki', { x: 0.2, y: 0 }); // ХП 40, один выстрел не убивает

    combatSystem(world, 1 / 60, attackInput());

    expect(world.store('progression').get(hero)?.xp).toBe(0);
  });

  it('без компонента progression у убийцы — не падает, просто не начисляет', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    addHero(world, 0, 0);
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0.2, y: 0 });
    const health = world.store('health').get(enemy);
    if (health) health.hp = 1;

    expect(() => combatSystem(world, 1 / 60, attackInput())).not.toThrow();
  });

  it('накопленный опыт левелапит героя, если суммарно хватает (несколько убийств)', () => {
    const world = build(fakeRng(NO_SPREAD_NO_CRIT));
    const hero = addHero(world, 0, 0);
    world.store('progression').add(hero, { xp: 290, level: 1, skillPoints: 0, smekalka: 6 });
    const enemy = spawnEnemy(world, 'enemy.raki', { x: 0.2, y: 0 }); // xpForEnemyKill = 10 → 290+10=300=порог ур.2
    const health = world.store('health').get(enemy);
    if (health) health.hp = 1;

    combatSystem(world, 1 / 60, attackInput());

    const progression = world.store('progression').get(hero);
    expect(progression?.xp).toBe(300);
    expect(progression?.level).toBe(2);
    expect(progression?.skillPoints).toBe(12); // 6 + Смекалка(6)
  });
});
