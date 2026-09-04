/**
 * Общая точка применения урона по игроку от атак врагов — и обычных
 * (`ai.ts: resolveEnemyAttack`, телеграф-атаки восьми врагов), и Босса
 * (`boss-ai.ts: resolveBossAttack`, AoE-залп «Водяной залп»). Вынесена
 * отдельно, чтобы шок (§4.6), гарантированный шок Энергосбытовца (§2.4) и
 * перки «Дублёная шкура»/«Последний патрон» (`rpg-system.md` §3, OF-035)
 * читались из компонентов героя один раз, а не дублировались в обеих
 * системах — `ai.ts` не может импортировать `boss-ai.ts` напрямую для этой
 * логики без цикла (`boss-ai.ts` сам вызывается из `ai.ts`).
 */

import type { EntityId, World } from '../../core/world';
import { aggregatePerkEffects, EMPTY_PERK_EFFECT } from '../formulas/perks';
import {
  applyForcedShockHit,
  applyShockHit,
  SHOCK_DURATION_MS,
  SHOCK_THRESHOLD_RATIO,
} from '../formulas/shock';

export interface ApplyPlayerDamageOptions {
  /** Энергосбытовец (§2.4) — шок накладывается независимо от % урона. */
  readonly forcedShock?: boolean;
}

/**
 * Применяет `rawDamage` к здоровью цели: сначала плоское снижение урона
 * («Дублёная шкура»), затем — «Последний патрон» (если удар смертелен,
 * страховка ещё доступна и перк разблокирован — оставляет 1 ХП и один раз
 * взводит гарантированный крит следующего выстрела героя, `combat.ts:
 * performRangedAttack`), иначе — обычное вычитание. После этого — шок (с
 * порогом/длительностью, переопределёнными перками, если активны) и события
 * `combat.hit`/`combat.death`. Отсутствующий `health`-компонент — no-op
 * (симметрично `ai.ts`/`combat.ts`, которые уже защищаются от «голых»
 * сущностей).
 */
export function applyDamageToPlayer(
  world: World,
  targetId: EntityId,
  rawDamage: number,
  wx: number,
  wy: number,
  options: ApplyPlayerDamageOptions = {},
): void {
  const targetHealth = world.store('health').get(targetId);
  if (!targetHealth) return;

  const perksState = world.store('perks').get(targetId);
  const effect = perksState ? aggregatePerkEffects(perksState.unlockedPerkIds) : EMPTY_PERK_EFFECT;

  // Тот же принцип «результат никогда не опускается ниже 1», что и §4.1 —
  // применён уже после плоского снижения перком, не как часть computeDamage.
  const damage = Math.max(1, rawDamage - (effect.flatDamageReduction ?? 0));

  const wouldDie = targetHealth.hp - damage <= 0;
  const lastStandTriggers =
    (effect.lastStandPerFight ?? false) &&
    perksState !== undefined &&
    perksState.lastStandAvailable &&
    wouldDie;

  // `lastStandTriggers` уже требует `perksState !== undefined` — `&& perksState`
  // повторно защищает тип для TS (сужение через отдельную переменную ему не
  // видно), не открывает новую достижимую через публичный API ветку.
  /* v8 ignore next */
  if (lastStandTriggers && perksState) {
    targetHealth.hp = 1;
    perksState.lastStandAvailable = false;
    if (effect.guaranteedCritOnNextShot) perksState.guaranteedCritPending = true;
  } else {
    targetHealth.hp = Math.max(0, targetHealth.hp - damage);
  }

  const shockStore = world.store('shockState');
  const thresholdRatio = effect.shockThresholdRatio ?? SHOCK_THRESHOLD_RATIO;
  const durationMs = effect.shockDurationMs ?? SHOCK_DURATION_MS;
  const nextShock = options.forcedShock
    ? applyForcedShockHit(durationMs)
    : applyShockHit(shockStore.get(targetId), damage, targetHealth.maxHp, thresholdRatio, durationMs);
  if (nextShock) {
    if (shockStore.has(targetId)) {
      const current = shockStore.get(targetId);
      /* v8 ignore next */
      if (current) current.remainingMs = nextShock.remainingMs;
    } else {
      shockStore.add(targetId, { remainingMs: nextShock.remainingMs });
    }
  }

  world.events.emit('combat.hit', { targetId, wx, wy, damage, crit: false });
  if (targetHealth.hp <= 0) {
    world.events.emit('combat.death', { entityId: targetId, wx, wy, isEnemy: false });
  }
}
