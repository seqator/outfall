/**
 * Стадия `effects` (SYSTEM_ORDER: `input → ai → movement → collision →
 * combat → effects → quest → cleanup`, `docs/tech/architecture.md` §4) —
 * первая реализация этой стадии. OF-035: тик персистентных зон урона
 * (`hazardZone`) — «лужа» Чистого (§2.5 combat.md), созданная `aiSystem`
 * (`ai.ts: resolveEnemyAttack`) через `spawnHazardZone` ниже при попадании
 * атаки с `hazardOnHit`.
 *
 * ДОПУЩЕНИЕ: урон наносится непрерывно (`damagePerSec × dt`), не
 * дискретными «тиками раз в секунду» — тот же принцип, что и весь остальной
 * урон в этой ECS (нет прецедента дискретных DOT-тиков в проекте, весь урон
 * — либо мгновенное попадание, либо, как здесь, гладкая скорость). Урон
 * лужи не триггерит «Шок» (§4.6: триггер — «ОдинУдар ≥ 30% МаксХП», а
 * непрерывная лужа концептуально не «один удар») и не проходит через
 * `player-damage.ts` (перки «Дублёная шкура»/«Последний патрон» рассчитаны
 * на дискретные удары врагов, не на урон средой — тот же класс решения, что
 * уже принят для урона от снарядов игрока, который тоже не эмитит шок).
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';

export interface HazardOnHit {
  readonly radiusM: number;
  readonly damagePerSec: number;
  readonly durationMs: number;
}

/** Создаёт сущность-лужу в точке (x,y) — вызывается `aiSystem` при попадании атаки с `hazardOnHit` (Чистый, §2.5). */
export function spawnHazardZone(world: World, x: number, y: number, hazard: HazardOnHit): void {
  const entity = world.create();
  world.store('transform').add(entity, { x, y, z: 0, prevX: x, prevY: y });
  world.store('hazardZone').add(entity, {
    radiusM: hazard.radiusM,
    damagePerSec: hazard.damagePerSec,
    remainingMs: hazard.durationMs,
  });
}

export function effectsSystem(world: World, dt: number, _input: InputSnapshot): void {
  for (const entity of world.query('hazardZone', 'transform')) {
    const hazard = world.store('hazardZone').get(entity);
    const zoneTransform = world.store('transform').get(entity);
    /* v8 ignore next */
    if (!hazard || !zoneTransform) continue;

    hazard.remainingMs -= dt * 1000;

    for (const target of world.query('controlled', 'transform', 'health')) {
      const targetTransform = world.store('transform').get(target);
      const targetHealth = world.store('health').get(target);
      /* v8 ignore next */
      if (!targetTransform || !targetHealth) continue;
      if (targetHealth.hp <= 0) continue;

      const dist = Math.hypot(targetTransform.x - zoneTransform.x, targetTransform.y - zoneTransform.y);
      if (dist > hazard.radiusM) continue;

      targetHealth.hp = Math.max(0, targetHealth.hp - hazard.damagePerSec * dt);
      if (targetHealth.hp <= 0) {
        world.events.emit('combat.death', {
          entityId: target,
          wx: targetTransform.x,
          wy: targetTransform.y,
          isEnemy: false,
        });
      }
    }

    if (hazard.remainingMs <= 0) world.destroy(entity);
  }
}
