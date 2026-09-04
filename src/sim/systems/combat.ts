/**
 * Стадия `combat` (SYSTEM_ORDER: `input → ai → movement → collision →
 * combat → effects`, `docs/tech/architecture.md` §4). Всё, что касается
 * героя: стрельба/удары (`attack`), рывок (`dash`), перезарядка (`reload`),
 * переключение оружия (`slot1`/`slot2`/`slot3`), полёт и попадание снарядов,
 * применение урона по врагам (формулы `sim/formulas/**`, `docs/design/
 * combat.md` §4/§5) и уборка мёртвых сущностей. Тик врагов (телеграф/атака)
 * — стадия `ai` (`ai.ts`), которая уже отработала раньше в этом же тике.
 *
 * Ослабление скорости от шока (§4.6) и блокировка движения от
 * обездвиживания/смерти применяются в `inputControlSystem`
 * (`input-control.ts`) — это единственное место, которое пишет `velocity`
 * из `InputSnapshot`, поэтому там же и гасится.
 *
 * OF-035: перки героя (`formulas/perks.ts`) читаются здесь через
 * `getPlayerPerkEffect` в трёх точках — перезарядка («Быстрые руки»),
 * разброс на бегу («Твёрдая рука»/«Хладнокровие») и урон в рукопашной
 * («Крепкий хребет»/«Оба кулака»); «Последний патрон» взводится в
 * `player-damage.ts` при входящем ударе и потребляется здесь, в
 * `performRangedAttack`, гарантированным критом следующего выстрела. Убийство
 * врага игроком начисляет опыт (`formulas/progression.ts`) через
 * `grantKillXp`, если у убийцы есть компонент `progression`.
 */

import type { InputSnapshot } from '../../core/input';
import type { EntityId, World } from '../../core/world';
import type {
  FacingComponent,
  ProjectileComponent,
  TransformComponent,
  WeaponRuntimeState,
  WeaponsComponent,
  MapGridComponent,
} from '../components';
import { rollCrit } from '../formulas/crit';
import { computeDamage, computeFistsDamage } from '../formulas/damage';
import { computeIframesMs, DASH_COOLDOWN_MS } from '../formulas/dash';
import { ENEMY_DEFS } from '../formulas/enemies';
import { aggregatePerkEffects, EMPTY_PERK_EFFECT, type PerkEffect } from '../formulas/perks';
import { grantXp, xpForEnemyKill } from '../formulas/progression';
import { computeSpreadDeg } from '../formulas/spread';
import {
  PROJECTILE_HIT_RADIUS_M,
  PROJECTILE_MAX_RANGE_M,
  PROJECTILE_SPEED_TILES_PER_SEC,
  WEAPON_DEFS,
  WEAPON_SLOT_ORDER,
  WRENCH_STUN_EVERY_HITS,
  WRENCH_STUN_MS,
  type WeaponDef,
  type WeaponId,
} from '../formulas/weapons';
import { isEnemyWeaknessActive } from './ai';

/** Аггрегированный эффект перков героя (пусто, если у сущности нет компонента `perks`) — общая точка для reload/разброса/урона в рукопашной. */
function getPlayerPerkEffect(world: World, ownerId: EntityId): PerkEffect {
  const perks = world.store('perks').get(ownerId);
  return perks ? aggregatePerkEffects(perks.unlockedPerkIds) : EMPTY_PERK_EFFECT;
}

/** Начисляет опыт убийце врага (`ENEMY_DEFS[...].xpLevel/danger`, `rpg-system.md` §4) — no-op, если у убийцы нет компонента `progression` (например, снаряд без владельца-героя в синтетических тестах). */
function grantKillXp(world: World, killerId: EntityId, deadEnemyDefId: keyof typeof ENEMY_DEFS): void {
  const progression = world.store('progression').get(killerId);
  if (!progression) return;
  const def = ENEMY_DEFS[deadEnemyDefId];
  const amount = xpForEnemyKill(def.xpLevel, def.danger);
  const result = grantXp(progression, amount, progression.smekalka);
  progression.xp = result.state.xp;
  progression.level = result.state.level;
  progression.skillPoints = result.state.skillPoints;
}

const WEAPON_SLOT1 = WEAPON_SLOT_ORDER[0] as WeaponId;
const WEAPON_SLOT2 = WEAPON_SLOT_ORDER[1] as WeaponId;
const WEAPON_SLOT3 = WEAPON_SLOT_ORDER[2] as WeaponId;

const EPSILON = 1e-6;

/** Создаёт стартовое расходуемое состояние оружия — полный магазин (или 0 для безпатронного), без КД/перезарядки/комбо. */
export function createWeaponRuntimeState(id: WeaponId): WeaponRuntimeState {
  const def = WEAPON_DEFS[id];
  return {
    ammo: def.magazineSize ?? 0,
    cooldownMs: 0,
    reloadRemainingMs: 0,
    comboHits: 0,
    comboTargetId: null,
  };
}

/** Стартовый набор оружия героя среза: все три оружия сразу, экипирован пистолет. */
export function createWeaponsComponent(
  equipped: WeaponId = 'item.pistol_ogryzok',
): WeaponsComponent {
  return {
    equipped,
    states: {
      'item.pistol_ogryzok': createWeaponRuntimeState('item.pistol_ogryzok'),
      'item.shotgun_duplo': createWeaponRuntimeState('item.shotgun_duplo'),
      'item.wrench_kran': createWeaponRuntimeState('item.wrench_kran'),
    },
  };
}

function tickPlayerTimers(world: World, dtMs: number): void {
  for (const entity of world.query('controlled', 'weapons')) {
    const dash = world.store('dashState').get(entity);
    if (dash) {
      dash.iframesRemainingMs = Math.max(0, dash.iframesRemainingMs - dtMs);
      dash.cooldownRemainingMs = Math.max(0, dash.cooldownRemainingMs - dtMs);
    }
    const shock = world.store('shockState').get(entity);
    if (shock) shock.remainingMs = Math.max(0, shock.remainingMs - dtMs);
    const immobilized = world.store('immobilized').get(entity);
    if (immobilized) immobilized.remainingMs = Math.max(0, immobilized.remainingMs - dtMs);

    const weapons = world.store('weapons').get(entity);
    /* v8 ignore next */
    if (!weapons) continue;
    for (const id of WEAPON_SLOT_ORDER) {
      const state = weapons.states[id];
      state.cooldownMs = Math.max(0, state.cooldownMs - dtMs);
      if (state.reloadRemainingMs > 0) {
        state.reloadRemainingMs = Math.max(0, state.reloadRemainingMs - dtMs);
        if (state.reloadRemainingMs === 0) {
          const def = WEAPON_DEFS[id];
          // Перезарядка запускается только при `def.magazineSize !== undefined`
          // (см. `handlePlayerWeapons`) — оружие без магазина (Кран) сюда
          // не попадает, `reloadRemainingMs` для него никогда не становится
          // > 0. Защита инварианта, не достижимая через публичный API.
          /* v8 ignore next */
          if (def.magazineSize !== undefined) state.ammo = def.magazineSize;
        }
      }
    }
  }
}

function handlePlayerFacing(world: World, input: InputSnapshot): void {
  for (const entity of world.query('controlled', 'facing')) {
    const facing = world.store('facing').get(entity);
    /* v8 ignore next */
    if (!facing) continue;
    const len = Math.hypot(input.moveX, input.moveY);
    if (len > EPSILON) {
      facing.dirX = input.moveX / len;
      facing.dirY = input.moveY / len;
    }
  }
}

interface NearestEnemy {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly dist: number;
}

function findNearestEnemyInRange(
  world: World,
  x: number,
  y: number,
  rangeM: number,
): NearestEnemy | undefined {
  let best: NearestEnemy | undefined;
  for (const entity of world.query('enemy', 'transform', 'collidable', 'health')) {
    const t = world.store('transform').get(entity);
    const c = world.store('collidable').get(entity);
    const h = world.store('health').get(entity);
    /* v8 ignore next */
    if (!t || !c || !h) continue;
    if (h.hp <= 0) continue;
    const dist = Math.hypot(t.x - x, t.y - y);
    if (dist > rangeM + c.radius) continue;
    if (!best || dist < best.dist) best = { id: entity, x: t.x, y: t.y, dist };
  }
  return best;
}

/**
 * Наносит урон и эмитит `combat.hit`/`combat.death` по врагу — общая точка
 * для снарядов и «Крана». `killerId` — кто нанёс удар (герой, обычно) —
 * используется только для начисления опыта (`grantKillXp`) при добивающем
 * ударе; `wasAlive`-проверка защищает от двойного начисления/двойного
 * `combat.death`, если несколько попаданий пришлись на уже мёртвого, но ещё
 * не убранного из мира врага в одном тике.
 */
function applyDamageToEnemy(
  world: World,
  targetId: EntityId,
  damage: number,
  crit: boolean,
  killerId: EntityId,
): void {
  const health = world.store('health').get(targetId);
  const transform = world.store('transform').get(targetId);
  /* v8 ignore next */
  if (!health || !transform) return;

  const wasAlive = health.hp > 0;
  health.hp = Math.max(0, health.hp - damage);
  world.events.emit('combat.hit', { targetId, wx: transform.x, wy: transform.y, damage, crit });

  if (wasAlive && health.hp <= 0) {
    world.events.emit('combat.death', {
      entityId: targetId,
      wx: transform.x,
      wy: transform.y,
      isEnemy: true,
    });
    const enemy = world.store('enemy').get(targetId);
    // `applyDamageToEnemy` вызывается только для целей, найденных через
    // `world.query('enemy', ...)` (`findNearestEnemyInRange`/
    // `findProjectileTarget` ниже) — `targetId` всегда несёт компонент
    // `enemy`, `if` защищает тип, не достижимо через публичный API.
    /* v8 ignore next */
    if (enemy) grantKillXp(world, killerId, enemy.defId);
  }
}

function performMeleeAttack(
  world: World,
  ownerId: EntityId,
  transform: TransformComponent,
  def: WeaponDef,
  state: WeaponRuntimeState,
): void {
  // `performMeleeAttack` вызывается только для `def.branch === 'fists'`
  // (единственное такое оружие среза — «Кран», всегда с `meleeRangeM`) —
  // `?? 0` защищает тип, но недостижима через публичный API.
  /* v8 ignore next */
  const meleeRangeM = def.meleeRangeM ?? 0;
  const target = findNearestEnemyInRange(world, transform.x, transform.y, meleeRangeM);
  if (!target) {
    state.comboHits = 0;
    state.comboTargetId = null;
    return;
  }

  state.comboHits = state.comboTargetId === target.id ? state.comboHits + 1 : 1;
  state.comboTargetId = target.id;

  const enemy = world.store('enemy').get(target.id);
  const aiState = world.store('aiState').get(target.id);
  /* v8 ignore next */
  if (!enemy) return;
  const enemyDef = ENEMY_DEFS[enemy.defId];
  const weaknessActive = aiState
    ? isEnemyWeaknessActive(enemyDef.weakness.window, aiState.phase, aiState.phaseElapsedMs, enemyDef.weakness.windowMs)
    : false;
  const weakness = weaknessActive ? enemyDef.weakness.multiplier : 1;

  const attrs = world.store('attributes').get(ownerId);
  const skills = world.store('combatSkills').get(ownerId);
  const crit = rollCrit(world.rng, attrs?.courage ?? 5);
  const ignoresArmor = weaknessActive && enemyDef.weakness.ignoresArmor;

  const baseDamage = computeFistsDamage({
    base: def.baseDamage,
    skill: skills?.fists ?? 50,
    crit,
    weakness,
    armor: enemyDef.armor,
    ignoresArmor,
  });

  // «Крепкий хребет»/«Оба кулака» (`rpg-system.md` §3) — множители поверх
  // базовой формулы §5.1, не внутри неё (см. докстринг `PerkEffect`).
  const meleeEffect = getPlayerPerkEffect(world, ownerId);
  const damage = baseDamage * (meleeEffect.meleeDamageMult ?? 1) * (meleeEffect.fistsDamageMult ?? 1);

  applyDamageToEnemy(world, target.id, damage, crit === 2, ownerId);

  if (aiState && state.comboHits >= WRENCH_STUN_EVERY_HITS) {
    aiState.stunnedMs = WRENCH_STUN_MS;
    aiState.phase = 'cooldown';
    aiState.phaseElapsedMs = 0;
    state.comboHits = 0;
  }
}

function performRangedAttack(
  world: World,
  ownerId: EntityId,
  transform: TransformComponent,
  facing: FacingComponent,
  weaponId: WeaponId,
  def: WeaponDef,
  input: InputSnapshot,
): void {
  const attrs = world.store('attributes').get(ownerId);
  const skills = world.store('combatSkills').get(ownerId);
  const skillValue = def.branch === 'heavy' ? (skills?.heavy ?? 50) : (skills?.guns ?? 50);
  const moving = Math.hypot(input.moveX, input.moveY) > EPSILON;

  // «Твёрдая рука»/«Хладнокровие» (`rpg-system.md` §3) — верхняя граница
  // `КоэфДвижения` разброса на бегу; если несколько активны, `aggregatePerkEffects`
  // уже взял минимум (более сильное снижение штрафа).
  const rangedEffect = getPlayerPerkEffect(world, ownerId);
  const moveCoef =
    rangedEffect.moveSpreadCoefCap !== undefined
      ? Math.min(def.moveSpreadCoef, rangedEffect.moveSpreadCoefCap)
      : def.moveSpreadCoef;

  const spreadDeg = computeSpreadDeg({
    baseConeDeg: def.baseSpreadDeg,
    skill: skillValue,
    moving,
    moveCoef,
  });
  const spreadRad = (spreadDeg * Math.PI) / 180;
  const offset = (world.rng.next() * 2 - 1) * (spreadRad / 2);
  const baseAngle = Math.atan2(facing.dirY, facing.dirX);
  const angle = baseAngle + offset;

  // «Последний патрон» (`rpg-system.md` §3, перк 3): после срабатывания
  // страховки (взводится в `player-damage.ts`) следующий выстрел героя —
  // гарантированный крит, флаг потребляется здесь один раз.
  const perksState = world.store('perks').get(ownerId);
  let crit = rollCrit(world.rng, attrs?.courage ?? 5);
  if (perksState?.guaranteedCritPending) {
    crit = 2;
    perksState.guaranteedCritPending = false;
  }

  const projectile = world.create();
  world
    .store('transform')
    .add(projectile, {
      x: transform.x,
      y: transform.y,
      z: 0,
      prevX: transform.x,
      prevY: transform.y,
    });
  world.store('projectile').add(projectile, {
    ownerId,
    dirX: Math.cos(angle),
    dirY: Math.sin(angle),
    speed: PROJECTILE_SPEED_TILES_PER_SEC[weaponId],
    baseDamage: def.baseDamage,
    weaponId,
    skill: skillValue,
    crit,
    traveled: 0,
    maxRangeM: PROJECTILE_MAX_RANGE_M,
  });
}

function handlePlayerWeapons(world: World, input: InputSnapshot): void {
  for (const entity of world.query('controlled', 'weapons', 'transform', 'facing', 'health')) {
    const weapons = world.store('weapons').get(entity);
    const transform = world.store('transform').get(entity);
    const facing = world.store('facing').get(entity);
    const health = world.store('health').get(entity);
    /* v8 ignore next */
    if (!weapons || !transform || !facing || !health) continue;
    if (health.hp <= 0) continue;

    if (input.pressed.has('slot1')) weapons.equipped = WEAPON_SLOT1;
    if (input.pressed.has('slot2')) weapons.equipped = WEAPON_SLOT2;
    if (input.pressed.has('slot3')) weapons.equipped = WEAPON_SLOT3;

    const weaponId = weapons.equipped;
    const def = WEAPON_DEFS[weaponId];
    const state = weapons.states[weaponId];

    if (
      input.pressed.has('reload') &&
      def.magazineSize !== undefined &&
      def.reloadMs !== undefined
    ) {
      if (state.ammo < def.magazineSize && state.reloadRemainingMs <= 0) {
        // «Быстрые руки» (`rpg-system.md` §3, перк 1) — перезарядка −25%.
        const reloadEffect = getPlayerPerkEffect(world, entity);
        state.reloadRemainingMs = def.reloadMs * (reloadEffect.reloadTimeMult ?? 1);
        world.events.emit('combat.reload-start', { ownerId: entity, weaponId });
      }
    }

    const canFire =
      input.held.has('attack') && state.cooldownMs <= 0 && state.reloadRemainingMs <= 0;
    if (!canFire) continue;

    if (def.branch === 'fists') {
      performMeleeAttack(world, entity, transform, def, state);
      state.cooldownMs = def.fireCooldownMs;
      world.events.emit('combat.weapon-fired', {
        ownerId: entity,
        weaponId,
        branch: def.branch,
        wx: transform.x,
        wy: transform.y,
      });
    } else if (state.ammo > 0) {
      performRangedAttack(world, entity, transform, facing, weaponId, def, input);
      state.ammo -= 1;
      state.cooldownMs = def.fireCooldownMs;
      world.events.emit('combat.weapon-fired', {
        ownerId: entity,
        weaponId,
        branch: def.branch,
        wx: transform.x,
        wy: transform.y,
      });
    } else {
      // Магазин пуст — GDD §1 явно запрещает штрафовать за это (не
      // запускаем авто-перезарядку и не наказываем игрока, только явный
      // `reload`); сухой щелчок бойка — чисто звуковая обратная связь
      // (`sfx.weapon.pistol.empty`), не игровой эффект.
      world.events.emit('combat.fire-empty', { ownerId: entity, weaponId });
    }
  }
}

function handlePlayerDash(world: World, input: InputSnapshot): void {
  for (const entity of world.query('controlled', 'dashState', 'attributes', 'health')) {
    const dash = world.store('dashState').get(entity);
    const attrs = world.store('attributes').get(entity);
    const health = world.store('health').get(entity);
    /* v8 ignore next */
    if (!dash || !attrs || !health) continue;
    if (health.hp <= 0) continue;

    const immobilized = world.store('immobilized').get(entity);
    if (immobilized && immobilized.remainingMs > 0) continue; // сеть Подлинейного запрещает и рывок (§2.2)

    if (input.pressed.has('dash') && dash.cooldownRemainingMs <= 0) {
      dash.iframesRemainingMs = computeIframesMs(attrs.reflex);
      dash.cooldownRemainingMs = DASH_COOLDOWN_MS;
      const transform = world.store('transform').get(entity);
      // `controlled`-сущности среза всегда несут `transform` (герой создаётся
      // с ним в `map-loader.createHero`) — `?? 0` защищает тип на случай
      // неполной сущности, не достижимо через публичный API сейчас.
      /* v8 ignore next 2 */
      const wx = transform?.x ?? 0;
      const wy = transform?.y ?? 0;
      world.events.emit('combat.dash-start', { ownerId: entity, wx, wy });
    }
  }
}

function findMapGrid(world: World): MapGridComponent | undefined {
  for (const entity of world.query('mapGrid')) {
    return world.store('mapGrid').get(entity);
  }
  return undefined;
}

function isWallAt(grid: MapGridComponent, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return true;
  return grid.collision[ty * grid.width + tx] === 1;
}

function findProjectileTarget(
  world: World,
  ownerId: EntityId,
  x: number,
  y: number,
): EntityId | undefined {
  for (const entity of world.query('enemy', 'transform', 'collidable', 'health')) {
    if (entity === ownerId) continue;
    const t = world.store('transform').get(entity);
    const c = world.store('collidable').get(entity);
    const h = world.store('health').get(entity);
    /* v8 ignore next */
    if (!t || !c || !h) continue;
    if (h.hp <= 0) continue;
    if (Math.hypot(t.x - x, t.y - y) <= c.radius + PROJECTILE_HIT_RADIUS_M) return entity;
  }
  return undefined;
}

function resolveProjectileHit(
  world: World,
  targetId: EntityId,
  projectile: ProjectileComponent,
): void {
  const enemy = world.store('enemy').get(targetId);
  const aiState = world.store('aiState').get(targetId);
  /* v8 ignore next */
  if (!enemy) return;
  const def = ENEMY_DEFS[enemy.defId];
  const weaknessActive = aiState
    ? isEnemyWeaknessActive(def.weakness.window, aiState.phase, aiState.phaseElapsedMs, def.weakness.windowMs)
    : false;
  const weakness = weaknessActive ? def.weakness.multiplier : 1;

  const weaponDef = WEAPON_DEFS[projectile.weaponId];
  let base = projectile.baseDamage;
  if (weaponDef.rangeFalloff && projectile.traveled > weaponDef.rangeFalloff.beyondM) {
    base *= weaponDef.rangeFalloff.multiplier;
  }

  const ignoresArmor = weaknessActive && def.weakness.ignoresArmor;

  const damage = computeDamage({
    base,
    skill: projectile.skill,
    crit: projectile.crit,
    weakness,
    armor: def.armor,
    ignoresArmor,
  });

  applyDamageToEnemy(world, targetId, damage, projectile.crit === 2, projectile.ownerId);
}

function updateProjectiles(world: World, dt: number): void {
  const grid = findMapGrid(world);

  for (const entity of world.query('projectile', 'transform')) {
    const projectile = world.store('projectile').get(entity);
    const transform = world.store('transform').get(entity);
    /* v8 ignore next */
    if (!projectile || !transform) continue;

    transform.prevX = transform.x;
    transform.prevY = transform.y;
    const step = projectile.speed * dt;
    transform.x += projectile.dirX * step;
    transform.y += projectile.dirY * step;
    projectile.traveled += step;

    let destroyed = false;

    if (grid && isWallAt(grid, transform.x, transform.y)) {
      destroyed = true;
    }

    if (!destroyed) {
      const targetId = findProjectileTarget(world, projectile.ownerId, transform.x, transform.y);
      if (targetId !== undefined) {
        resolveProjectileHit(world, targetId, projectile);
        destroyed = true;
      }
    }

    if (!destroyed && projectile.traveled >= projectile.maxRangeM) {
      destroyed = true;
    }

    if (destroyed) world.destroy(entity);
  }
}

function cleanupDeadEnemies(world: World): void {
  for (const entity of world.query('enemy', 'health')) {
    const health = world.store('health').get(entity);
    if (health && health.hp <= 0) world.destroy(entity);
  }
}

export function combatSystem(world: World, dt: number, input: InputSnapshot): void {
  const dtMs = dt * 1000;

  tickPlayerTimers(world, dtMs);
  handlePlayerFacing(world, input);
  handlePlayerWeapons(world, input);
  handlePlayerDash(world, input);
  updateProjectiles(world, dt);
  cleanupDeadEnemies(world);
}
