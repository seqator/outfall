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
 *
 * OF-059 (`docs/design/progression-of-059.md`): `progression` (xp/level/
 * skillPoints/skillPointCursor/smekalka) снимается и восстанавливается
 * симметрично остальным боевым компонентам — до этой правки уровень героя
 * ни на что не влиял, поэтому не сохранялся вовсе; теперь `grantKillXp`
 * (`sim/systems/combat.ts`) считает дельту `maxHp`/`combatSkills` от
 * `progression.level`, и без сохранения самого компонента загрузка
 * откатывала бы его на уровень 1, а следующий левел-ап задвоил бы уже
 * восстановленные из сейва `health.maxHp`/`combatSkills`.
 */

import type { EntityId, World } from '../../core/world';
import type { WeaponRuntimeState } from '../../sim';
import type { HeroSave, WeaponRuntimeStateSave, WeaponsSave } from './save-schema';

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
  const progression = requireComponent(world.store('progression').get(hero), 'progression');

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
    progression: {
      xp: progression.xp,
      level: progression.level,
      skillPoints: progression.skillPoints,
      skillPointCursor: progression.skillPointCursor,
      smekalka: progression.smekalka,
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
  world.store('progression').add(hero, {
    xp: save.progression.xp,
    level: save.progression.level,
    skillPoints: save.progression.skillPoints,
    skillPointCursor: save.progression.skillPointCursor,
    smekalka: save.progression.smekalka,
  });
}

/**
 * OF-057: `WeaponRuntimeState.reserveAmmo` намеренно НЕ сохраняется —
 * это не самостоятельное состояние, а зеркало реального `InventoryState`
 * (уже часть `SaveState.inventory`, сохраняется отдельно), которое
 * `demo-scene.ts` пересчитывает заново каждый кадр. Сохранять его вторым
 * источником правды означало бы либо дублирование (лишний повод разъехаться
 * с инвентарём), либо просто мёртвое поле — `WeaponRuntimeStateSaveSchema`
 * (`save-schema.ts`) его не описывает, только 5 полей, которые реально нужны,
 * чтобы `sim` продолжил бой после загрузки.
 */
function captureWeaponState(state: WeaponRuntimeState): WeaponRuntimeStateSave {
  return {
    ammo: state.ammo,
    cooldownMs: state.cooldownMs,
    reloadRemainingMs: state.reloadRemainingMs,
    comboHits: state.comboHits,
    comboTargetId: state.comboTargetId,
  };
}

/** `reserveAmmo: 0` — временный плейсхолдер до первой синхронизации с инвентарём (см. докстринг `captureWeaponState` выше): `demo-scene.ts` перезаписывает его актуальным числом на первом же кадре после загрузки, раньше, чем игрок физически успеет нажать `R`. */
function applyWeaponState(save: WeaponRuntimeStateSave): WeaponRuntimeState {
  return {
    ammo: save.ammo,
    cooldownMs: save.cooldownMs,
    reloadRemainingMs: save.reloadRemainingMs,
    comboHits: save.comboHits,
    comboTargetId: save.comboTargetId,
    reserveAmmo: 0,
  };
}

/** Снимает экипированное оружие + независимое расходуемое состояние каждого из трёх оружий среза (`WeaponsComponent`, `sim/components`). */
export function captureWeaponsSave(world: World, hero: EntityId): WeaponsSave {
  const weapons = requireComponent(world.store('weapons').get(hero), 'weapons');
  return {
    equipped: weapons.equipped,
    states: {
      'item.pistol_ogryzok': captureWeaponState(weapons.states['item.pistol_ogryzok']),
      'item.shotgun_duplo': captureWeaponState(weapons.states['item.shotgun_duplo']),
      'item.wrench_kran': captureWeaponState(weapons.states['item.wrench_kran']),
    },
  };
}

/** Пишет `WeaponsSave` обратно в `weapons`-компонент героя. */
export function applyWeaponsSave(world: World, hero: EntityId, save: WeaponsSave): void {
  world.store('weapons').add(hero, {
    equipped: save.equipped,
    states: {
      'item.pistol_ogryzok': applyWeaponState(save.states['item.pistol_ogryzok']),
      'item.shotgun_duplo': applyWeaponState(save.states['item.shotgun_duplo']),
      'item.wrench_kran': applyWeaponState(save.states['item.wrench_kran']),
    },
  });
}
