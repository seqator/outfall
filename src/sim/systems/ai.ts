/**
 * Стадия `ai` (SYSTEM_ORDER: `input → ai → movement → collision → combat →
 * effects`, `docs/tech/architecture.md` §4). Конечный автомат ИИ для трёх
 * врагов среза (Раки/Подлинейный/Охрана «Прогресс-2», `docs/design/
 * combat.md` §2.1–2.3): `idle → chase → telegraph → attack → cooldown`.
 *
 * Атака врага резолвится мгновенной проверкой дальности в момент завершения
 * телеграфа (не как перемещающийся снаряд/дуга) — рывок Раков и бросок сети
 * Подлинейного не реализованы как физические сущности с траекторией, только
 * как «попал/не попал» по дистанции; направленных хитбоксов/дуг в срезе нет
 * (см. допущения в `sim/formulas/enemies.ts`). Дальнобойный снаряд-сущность
 * (`projectile`) применяется только к оружию игрока — `combat.ts`.
 *
 * `spawnEnemy` — единственная точка создания боевой сущности врага из
 * `ENEMY_DEFS`; вызывается `game/demo-scene.ts` для меток спавна карты
 * (`spawnMarker`, kind: 'enemy') и для стресс-теста (много врагов сразу).
 */

import type { InputSnapshot } from '../../core/input';
import type { EntityId, World } from '../../core/world';
import type { AiPhase, TransformComponent } from '../components';
import { computeDamage } from '../formulas/damage';
import { ENEMY_DEFS, type EnemyDef, type EnemyDefId, type WeaknessWindow } from '../formulas/enemies';
import { applyShockHit } from '../formulas/shock';

/** Небольшой запас поверх заявленной дальности атаки — терпимость к «дребезгу» дистанции между тиками (герой/враг могут сместиться за 16.7 мс). */
const ATTACK_RANGE_TOLERANCE_M = 0.15;
/** Если игрок ушёл дальше `aggroRadius × ушёл-множитель`, погоня прекращается — небольшой гистерезис, чтобы враг не «дёргался» на границе радиуса агро. */
const CHASE_GIVEUP_MULTIPLIER = 1.5;
const DEFAULT_ENEMY_RADIUS = 0.35;

export function spawnEnemy(world: World, defId: EnemyDefId, position: { x: number; y: number }): EntityId {
  const def = ENEMY_DEFS[defId];
  const entity = world.create();
  world
    .store('transform')
    .add(entity, { x: position.x, y: position.y, z: 0, prevX: position.x, prevY: position.y });
  world.store('velocity').add(entity, { vx: 0, vy: 0 });
  world.store('collidable').add(entity, { radius: DEFAULT_ENEMY_RADIUS });
  world.store('health').add(entity, { hp: def.hp, maxHp: def.hp, armor: def.armor });
  world.store('enemy').add(entity, { defId });
  world.store('aiState').add(entity, { phase: 'idle', phaseElapsedMs: 0, targetId: null, stunnedMs: 0 });
  return entity;
}

/** Активна ли слабость врага прямо сейчас — по текущей фазе ИИ и типу окна из `EnemyDef.weakness.window`. */
export function isEnemyWeaknessActive(window: WeaknessWindow, phase: AiPhase): boolean {
  if (window === 'always') return true;
  return phase === window;
}

interface NearestPlayer {
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly dist: number;
}

function findNearestPlayer(world: World, x: number, y: number): NearestPlayer | undefined {
  let best: NearestPlayer | undefined;
  for (const entity of world.query('transform', 'controlled')) {
    const t = world.store('transform').get(entity);
    /* v8 ignore next */
    if (!t) continue;
    const dist = Math.hypot(t.x - x, t.y - y);
    if (!best || dist < best.dist) best = { id: entity, x: t.x, y: t.y, dist };
  }
  return best;
}

/**
 * Резолвит атаку врага в момент завершения телеграфа: если цель всё ещё в
 * зоне поражения и не в i-frames рывка — наносит урон по формуле §4.1,
 * применяет шок (§4.6) и обездвиживание (сеть Подлинейного), эмитит
 * `combat.hit`/`combat.death` для VFX. Промах (игрок вышел из радиуса или
 * поймал i-frames) не наносит урон вообще — телеграф был «прочитан».
 */
function resolveEnemyAttack(
  world: World,
  def: EnemyDef,
  targetId: EntityId | null,
  origin: TransformComponent,
): void {
  if (targetId === null || !world.alive(targetId)) return;

  const targetTransform = world.store('transform').get(targetId);
  const targetHealth = world.store('health').get(targetId);
  if (!targetTransform || !targetHealth) return;

  const dist = Math.hypot(targetTransform.x - origin.x, targetTransform.y - origin.y);
  if (dist > def.attack.rangeM + ATTACK_RANGE_TOLERANCE_M) return;

  const dash = world.store('dashState').get(targetId);
  if (dash && dash.iframesRemainingMs > 0) return;

  // Входящий урон по игроку — та же формула §4.1, Крит=1 (у врагов среза нет
  // характеристики Кураж — крит для их атак не задан GDD), Слабость=1
  // (слабости — это то, что игрок находит у врага, не наоборот), Броня=0
  // (система брони игрока — инвентарь OF-017, вне скоупа OF-016).
  const damage = computeDamage({ base: def.attack.damage, skill: def.skill, crit: 1, weakness: 1, armor: 0 });
  targetHealth.hp = Math.max(0, targetHealth.hp - damage);

  const shockStore = world.store('shockState');
  const nextShock = applyShockHit(shockStore.get(targetId), damage, targetHealth.maxHp);
  if (nextShock) {
    if (shockStore.has(targetId)) {
      const current = shockStore.get(targetId);
      /* v8 ignore next */
      if (current) current.remainingMs = nextShock.remainingMs;
    } else {
      shockStore.add(targetId, { remainingMs: nextShock.remainingMs });
    }
  }

  if (def.attack.immobilizeMs !== undefined) {
    world.store('immobilized').add(targetId, { remainingMs: def.attack.immobilizeMs });
  }

  world.events.emit('combat.hit', {
    targetId,
    wx: targetTransform.x,
    wy: targetTransform.y,
    damage,
    crit: false,
  });

  if (targetHealth.hp <= 0) {
    world.events.emit('combat.death', {
      entityId: targetId,
      wx: targetTransform.x,
      wy: targetTransform.y,
      isEnemy: false,
    });
  }
}

export function aiSystem(world: World, dt: number, _input: InputSnapshot): void {
  const dtMs = dt * 1000;

  for (const entity of world.query('enemy', 'aiState', 'transform', 'velocity', 'health')) {
    const enemy = world.store('enemy').get(entity);
    const state = world.store('aiState').get(entity);
    const transform = world.store('transform').get(entity);
    const velocity = world.store('velocity').get(entity);
    const health = world.store('health').get(entity);
    /* v8 ignore next */
    if (!enemy || !state || !transform || !velocity || !health) continue;

    if (health.hp <= 0) {
      // Мёртв, но ещё не убран из мира (уборка трупов — combatSystem, стадия
      // `combat` идёт после `ai` в этом же тике) — просто не действует.
      velocity.vx = 0;
      velocity.vy = 0;
      continue;
    }

    const def = ENEMY_DEFS[enemy.defId];

    if (state.stunnedMs > 0) {
      state.stunnedMs = Math.max(0, state.stunnedMs - dtMs);
      velocity.vx = 0;
      velocity.vy = 0;
      continue;
    }

    const player = findNearestPlayer(world, transform.x, transform.y);

    switch (state.phase) {
      case 'idle': {
        velocity.vx = 0;
        velocity.vy = 0;
        if (player && player.dist <= def.aggroRadiusM) {
          state.phase = 'chase';
          state.phaseElapsedMs = 0;
          state.targetId = player.id;
        }
        break;
      }

      case 'chase': {
        if (!player || player.dist > def.aggroRadiusM * CHASE_GIVEUP_MULTIPLIER) {
          state.phase = 'idle';
          state.phaseElapsedMs = 0;
          state.targetId = null;
          velocity.vx = 0;
          velocity.vy = 0;
          break;
        }
        state.targetId = player.id;
        if (player.dist <= def.attack.rangeM) {
          velocity.vx = 0;
          velocity.vy = 0;
          state.phase = 'telegraph';
          state.phaseElapsedMs = 0;
        } else {
          const dx = player.x - transform.x;
          const dy = player.y - transform.y;
          // `player.dist` (= Math.hypot(dx, dy)) уже проверен выше как
          // `> def.attack.rangeM` (> 0) в этой ветке `else` — `len` не может
          // быть нулём здесь; `|| 1` — чистая защита от деления на 0, не
          // достижимая через публичный API этой функции.
          /* v8 ignore next */
          const len = Math.hypot(dx, dy) || 1;
          velocity.vx = (dx / len) * def.moveSpeed;
          velocity.vy = (dy / len) * def.moveSpeed;
        }
        break;
      }

      case 'telegraph': {
        velocity.vx = 0;
        velocity.vy = 0;
        state.phaseElapsedMs += dtMs;
        if (state.phaseElapsedMs >= def.attack.telegraphMs) {
          state.phase = 'attack';
          state.phaseElapsedMs = 0;
        }
        break;
      }

      case 'attack': {
        velocity.vx = 0;
        velocity.vy = 0;
        resolveEnemyAttack(world, def, state.targetId, transform);
        state.phase = 'cooldown';
        state.phaseElapsedMs = 0;
        break;
      }

      case 'cooldown': {
        velocity.vx = 0;
        velocity.vy = 0;
        state.phaseElapsedMs += dtMs;
        if (state.phaseElapsedMs >= def.attack.cooldownMs) {
          state.phase = 'chase';
          state.phaseElapsedMs = 0;
        }
        break;
      }
    }
  }
}
