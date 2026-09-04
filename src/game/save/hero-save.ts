/**
 * Снимок/восстановление боевых компонентов героя (OF-019) — единственная
 * часть `game/save`, которая трогает `World`/ECS напрямую. Отделена от
 * `save-schema.ts` (чистые данные) и `save-store.ts` (I/O), чтобы демо-сцена
 * и тесты пользовались одной и той же логикой чтения/записи компонентов, а
 * не дублировали её (см. `demo-scene.ts`, `tests/unit/game/save/*`).
 *
 * Копирует поля, а не хранит ссылки на живые компоненты: `combatSystem`
 * (`src/sim/systems/combat.ts`) мутирует объекты компонентов на месте каждый
 * тик, так что снимок обязан быть независимой копией в момент вызова —
 * иначе «сохранение» продолжало бы меняться вместе с миром.
 */

import type { EntityId, World } from '../../core/world';
import type { HeroSave, WeaponsSave } from './save-schema';

/** Бросается, если у сущности нет компонента, необходимого для снимка героя — снимать «не-героя» этим модулем не предполагается. */
export class MissingHeroComponentError extends Error {}

function requireComponent<T>(value: T | undefined, componentName: string): T {
  if (value === undefined) {
    throw new MissingHeroComponentError(
      `captureHeroSave: у сущности нет компонента "${componentName}"`,
    );
  }
  return value;
}

/** Снимает позицию + боевые статы героя в независимую от мира копию (`HeroSave`). */
export function captureHeroSave(world: World, hero: EntityId): HeroSave {
  const transform = requireComponent(world.store('transform').get(hero), 'transform');
  const health = requireComponent(world.store('health').get(hero), 'health');
  const facing = requireComponent(world.store('facing').get(hero), 'facing');
  const attributes = requireComponent(world.store('attributes').get(hero), 'attributes');
  const combatSkills = requireComponent(world.store('combatSkills').get(hero), 'combatSkills');
  const dashState = requireComponent(world.store('dashState').get(hero), 'dashState');

  return {
    x: transform.x,
    y: transform.y,
    hp: health.hp,
    maxHp: health.maxHp,
    armor: health.armor,
    facing: { dirX: facing.dirX, dirY: facing.dirY },
    attributes: { courage: attributes.courage, reflex: attributes.reflex },
    combatSkills: { guns: combatSkills.guns, heavy: combatSkills.heavy, fists: combatSkills.fists },
    dashState: {
      iframesRemainingMs: dashState.iframesRemainingMs,
      cooldownRemainingMs: dashState.cooldownRemainingMs,
    },
  };
}

/** Пишет `HeroSave` в компоненты `hero` — (пере)создаёт их через `store().add()`, так что работает и на свежей сущности без предыдущего состояния. `prevX/prevY` = `x/y`, чтобы рендер-интерполяция не «доехала» из точки до загрузки. */
export function applyHeroSave(world: World, hero: EntityId, save: HeroSave): void {
  world.store('transform').add(hero, {
    x: save.x,
    y: save.y,
    z: 0,
    prevX: save.x,
    prevY: save.y,
  });
  world.store('health').add(hero, { hp: save.hp, maxHp: save.maxHp, armor: save.armor });
  world.store('facing').add(hero, { dirX: save.facing.dirX, dirY: save.facing.dirY });
  world
    .store('attributes')
    .add(hero, { courage: save.attributes.courage, reflex: save.attributes.reflex });
  world.store('combatSkills').add(hero, {
    guns: save.combatSkills.guns,
    heavy: save.combatSkills.heavy,
    fists: save.combatSkills.fists,
  });
  world.store('dashState').add(hero, {
    iframesRemainingMs: save.dashState.iframesRemainingMs,
    cooldownRemainingMs: save.dashState.cooldownRemainingMs,
  });
}

/** Снимает экипированное оружие + независимое расходуемое состояние каждого из трёх оружий среза (`WeaponsComponent`, `sim/components`). */
export function captureWeaponsSave(world: World, hero: EntityId): WeaponsSave {
  const weapons = requireComponent(world.store('weapons').get(hero), 'weapons');
  return {
    equipped: weapons.equipped,
    states: {
      'item.pistol_ogryzok': { ...weapons.states['item.pistol_ogryzok'] },
      'item.shotgun_duplo': { ...weapons.states['item.shotgun_duplo'] },
      'item.wrench_kran': { ...weapons.states['item.wrench_kran'] },
    },
  };
}

/** Пишет `WeaponsSave` обратно в `weapons`-компонент героя. */
export function applyWeaponsSave(world: World, hero: EntityId, save: WeaponsSave): void {
  world.store('weapons').add(hero, {
    equipped: save.equipped,
    states: {
      'item.pistol_ogryzok': { ...save.states['item.pistol_ogryzok'] },
      'item.shotgun_duplo': { ...save.states['item.shotgun_duplo'] },
      'item.wrench_kran': { ...save.states['item.wrench_kran'] },
    },
  });
}
