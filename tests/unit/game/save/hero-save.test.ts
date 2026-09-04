/**
 * OF-019: `src/game/save/hero-save.ts` — снимок/восстановление боевых
 * компонентов героя поверх реального `World` (`core/world.ts`).
 */

import { describe, expect, it } from 'vitest';
import { createEventBus, createSeededRng, createWorld } from '../../../../src/core';
import type { World } from '../../../../src/core/world';
import {
  applyHeroSave,
  applyWeaponsSave,
  captureHeroSave,
  captureWeaponsSave,
  MissingHeroComponentError,
} from '../../../../src/game/save/hero-save';
import { createWeaponsComponent, WEAPON_DEFS } from '../../../../src/sim';

function buildWorldWithHero(): { world: World; hero: number } {
  const world = createWorld(createSeededRng(1), createEventBus());
  const hero = world.create();
  world.store('transform').add(hero, { x: 3, y: 4, z: 0, prevX: 3, prevY: 4 });
  world.store('health').add(hero, { hp: 55, maxHp: 80, armor: 2 });
  world.store('facing').add(hero, { dirX: 0, dirY: -1 });
  world.store('attributes').add(hero, { courage: 6, reflex: 4 });
  world.store('combatSkills').add(hero, { guns: 60, heavy: 40, fists: 30 });
  world.store('dashState').add(hero, { iframesRemainingMs: 0, cooldownRemainingMs: 300 });
  world.store('weapons').add(hero, createWeaponsComponent());
  world
    .store('progression')
    .add(hero, { xp: 120, level: 2, skillPoints: 12, skillPointCursor: 1, smekalka: 5 });
  return { world, hero };
}

describe('hero-save: captureHeroSave / applyHeroSave', () => {
  it('снимает все поля героя, нужные для продолжения боя', () => {
    const { world, hero } = buildWorldWithHero();
    const save = captureHeroSave(world, hero);
    expect(save).toEqual({
      x: 3,
      y: 4,
      hp: 55,
      maxHp: 80,
      armor: 2,
      facing: { dirX: 0, dirY: -1 },
      attributes: { courage: 6, reflex: 4 },
      combatSkills: { guns: 60, heavy: 40, fists: 30 },
      dashState: { iframesRemainingMs: 0, cooldownRemainingMs: 300 },
      progression: { xp: 120, level: 2, skillPoints: 12, skillPointCursor: 1, smekalka: 5 },
    });
  });

  it('снимок независим от дальнейших мутаций мира (не хранит ссылку на живой компонент)', () => {
    const { world, hero } = buildWorldWithHero();
    const save = captureHeroSave(world, hero);
    const health = world.store('health').get(hero);
    if (!health) throw new Error('unreachable: health only just added above');
    health.hp = 1;
    expect(save.hp).toBe(55);
  });

  it('applyHeroSave пишет позицию/статы обратно, включая prevX/prevY = x/y', () => {
    const { world, hero } = buildWorldWithHero();
    applyHeroSave(world, hero, {
      x: 20,
      y: 21,
      hp: 70,
      maxHp: 80,
      armor: 0,
      facing: { dirX: 1, dirY: 0 },
      attributes: { courage: 5, reflex: 5 },
      combatSkills: { guns: 50, heavy: 50, fists: 50 },
      dashState: { iframesRemainingMs: 100, cooldownRemainingMs: 0 },
      progression: { xp: 300, level: 3, skillPoints: 22, skillPointCursor: 2, smekalka: 5 },
    });
    const transform = world.store('transform').get(hero);
    expect(transform).toEqual({ x: 20, y: 21, z: 0, prevX: 20, prevY: 21 });
    expect(world.store('health').get(hero)).toEqual({ hp: 70, maxHp: 80, armor: 0 });
    expect(world.store('dashState').get(hero)).toEqual({
      iframesRemainingMs: 100,
      cooldownRemainingMs: 0,
    });
    expect(world.store('progression').get(hero)).toEqual({
      xp: 300,
      level: 3,
      skillPoints: 22,
      skillPointCursor: 2,
      smekalka: 5,
    });
  });

  it('applyHeroSave работает и на сущности, у которой ещё не было этих компонентов', () => {
    const source = buildWorldWithHero();
    const save = captureHeroSave(source.world, source.hero);

    const target = createWorld(createSeededRng(1), createEventBus());
    const freshHero = target.create();
    applyHeroSave(target, freshHero, save);
    expect(target.store('health').get(freshHero)).toEqual({ hp: 55, maxHp: 80, armor: 2 });
  });

  it('captureHeroSave бросает MissingHeroComponentError, если у сущности нет нужного компонента', () => {
    const world = createWorld(createSeededRng(1), createEventBus());
    const notHero = world.create();
    expect(() => captureHeroSave(world, notHero)).toThrow(MissingHeroComponentError);
  });
});

describe('hero-save: captureWeaponsSave / applyWeaponsSave', () => {
  it('снимает экипированное оружие и независимое состояние каждого из трёх', () => {
    const { world, hero } = buildWorldWithHero();
    const weapons = world.store('weapons').get(hero);
    if (!weapons) throw new Error('unreachable: weapons only just added above');
    weapons.states['item.pistol_ogryzok'].ammo = 3;

    const save = captureWeaponsSave(world, hero);
    expect(save.equipped).toBe('item.pistol_ogryzok');
    expect(save.states['item.pistol_ogryzok'].ammo).toBe(3);
    expect(save.states['item.shotgun_duplo'].ammo).toBe(
      WEAPON_DEFS['item.shotgun_duplo'].magazineSize,
    );
  });

  it('снимок оружия независим от дальнейших мутаций (глубокая копия по каждому оружию)', () => {
    const { world, hero } = buildWorldWithHero();
    const save = captureWeaponsSave(world, hero);
    const weapons = world.store('weapons').get(hero);
    if (!weapons) throw new Error('unreachable: weapons only just added above');
    weapons.states['item.pistol_ogryzok'].ammo = 0;
    expect(save.states['item.pistol_ogryzok'].ammo).toBe(
      WEAPON_DEFS['item.pistol_ogryzok'].magazineSize,
    );
  });

  it('applyWeaponsSave восстанавливает ammo/КД/комбо-состояние оружия', () => {
    const { world, hero } = buildWorldWithHero();
    applyWeaponsSave(world, hero, {
      equipped: 'item.wrench_kran',
      states: {
        'item.pistol_ogryzok': {
          ammo: 1,
          cooldownMs: 10,
          reloadRemainingMs: 0,
          comboHits: 0,
          comboTargetId: null,
        },
        'item.shotgun_duplo': {
          ammo: 0,
          cooldownMs: 0,
          reloadRemainingMs: 500,
          comboHits: 0,
          comboTargetId: null,
        },
        'item.wrench_kran': {
          ammo: 0,
          cooldownMs: 0,
          reloadRemainingMs: 0,
          comboHits: 2,
          comboTargetId: 7,
        },
      },
    });
    const weapons = world.store('weapons').get(hero);
    expect(weapons?.equipped).toBe('item.wrench_kran');
    expect(weapons?.states['item.pistol_ogryzok'].ammo).toBe(1);
    expect(weapons?.states['item.wrench_kran'].comboTargetId).toBe(7);
  });
});
