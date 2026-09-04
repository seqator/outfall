/**
 * ИИ Босса-задвижки (§2.8 combat.md) — единственный враг с ролью `'boss'`.
 * Живёт отдельно от `ai.ts`, потому что его атака принципиально не похожа
 * на телеграф-атаки остальных семи врагов: Босс не преследует и не целится
 * по фактической позиции игрока — раз в цикл выбирает случайную точку в
 * пределах «арены» и после `telegraphMs` наносит урон по площади
 * (`aoeRadiusM`) вокруг этой точки. `ai.ts` вызывает функции этого файла из
 * общего конечного автомата (`aiState`/`AiPhase`) только для роли `'boss'`
 * — сам автомат (idle/chase/telegraph/attack/cooldown), спавн и слабость
 * (окно `cooldown-start` в `ENEMY_DEFS['enemy.boss_zadvizhka'].weakness`)
 * переиспользуют общую инфраструктуру `ai.ts`/`combat.ts`, не дублируются
 * здесь — только выбор точки и резолв самого урона.
 *
 * ДОПУЩЕНИЕ (арена и цикл атаки): GDD не задаёт геометрию арены и полный
 * откат между залпами (только телеграф/урон/окно слабости, §2.8) — карта
 * финала «Труба» ещё не построена (OF-037 `todo`). Арена — круг радиуса
 * `ENEMY_DEFS['enemy.boss_zadvizhka'].attack.rangeM` вокруг собственной
 * (неподвижной) позиции босса, тот же приём-плейсхолдер, что уже применяет
 * `enemies.ts` к дальностям атак остальных врагов. Полный цикл (500 мс
 * телеграф + 4000 мс откат, из которых первые 2000 мс — открытый шток) даёт
 * ~9 циклов в минуту: при стрельбе строго в открытый шток (×3, игнорирует
 * броню) любое оружие среза убивает 400 ХП/10 брони заметно быстрее
 * критерия «≤ 3 мин» (см. `tests/integration/boss-encounter.test.ts` —
 * практическая самопроверка формулами и системами напрямую, детерминированный
 * headless-сценарий вместо Playwright: тот же принцип «нет GPU в
 * песочнице», что уже объясняет `tests/e2e/stress.spec.ts`, но здесь
 * дополнительно надёжнее, потому что сам критерий — про игровую логику, не
 * про рендер).
 */

import type { SeededRng } from '../../core/rng';
import type { EntityId, World } from '../../core/world';
import { computeDamage } from '../formulas/damage';
import type { EnemyDef } from '../formulas/enemies';
import { applyDamageToPlayer } from './player-damage';

export interface ArenaPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Равномерная выборка точки в круге радиуса `radiusM` вокруг
 * `(originX, originY)` — детерминированный `world.rng`, без сгущения к
 * центру (площадь кольца ∝ r², поэтому радиус берётся как `sqrt(u)`, а не
 * `u`, иначе точки скучивались бы у центра арены).
 */
export function pickArenaPoint(
  rng: SeededRng,
  originX: number,
  originY: number,
  radiusM: number,
): ArenaPoint {
  const angle = rng.next() * Math.PI * 2;
  const r = Math.sqrt(rng.next()) * radiusM;
  return { x: originX + Math.cos(angle) * r, y: originY + Math.sin(angle) * r };
}

/**
 * Резолвит «Водяной залп»: если цель жива, не в i-frames рывка и находится
 * в `aoeRadiusM` от заранее выбранной точки (`aim`, выставлена `ai.ts` в
 * момент входа в `telegraph`) — наносит урон по формуле §4.1 (Слабость=1 —
 * это атака босса ПО игроку; слабость самого босса читается в обратную
 * сторону, в `combat.ts`, когда игрок бьёт босса), шок/«Последний патрон»/
 * «Дублёная шкура» — через `player-damage.ts`, как и у остальных врагов.
 * Промах (игрок вне AoE или в i-frames) не наносит урона вовсе — телеграф
 * был прочитан.
 */
export function resolveBossAttack(
  world: World,
  def: EnemyDef,
  targetId: EntityId | null,
  aim: ArenaPoint,
): void {
  if (targetId === null || !world.alive(targetId)) return;

  const targetTransform = world.store('transform').get(targetId);
  const targetHealth = world.store('health').get(targetId);
  if (!targetTransform || !targetHealth) return;

  // `def.attack.aoeRadiusM` всегда задан для роли `'boss'` (`ENEMY_DEFS`) —
  // `?? 0` защищает тип на случай вызова с чужим `EnemyDef`, недостижимо
  // через публичный API (только `ai.ts` вызывает эту функцию, и только для
  // `def.role === 'boss'`).
  /* v8 ignore next */
  const aoeRadiusM = def.attack.aoeRadiusM ?? 0;
  const dist = Math.hypot(targetTransform.x - aim.x, targetTransform.y - aim.y);
  if (dist > aoeRadiusM) return;

  const dash = world.store('dashState').get(targetId);
  if (dash && dash.iframesRemainingMs > 0) return;

  // Броня — `targetHealth.armor` героя, тем же фиксом, что и `ai.ts`
  // (P0-2, `docs/qa/balance-report.md`) — раньше `armor: 0` был захардкожен.
  const damage = computeDamage({
    base: def.attack.damage,
    skill: def.skill,
    crit: 1,
    weakness: 1,
    armor: targetHealth.armor,
  });
  applyDamageToPlayer(world, targetId, damage, targetTransform.x, targetTransform.y);
}
