/**
 * Боевые события шины (`core/events.ts`), доставляются после тика
 * (ADR-002 §5) — `game` подписывается на них, чтобы дёрнуть VFX/аудио
 * (`renderer.emitParticles`), не заглядывая внутрь `sim`/ECS напрямую.
 * Расширяет `GameEvents` тем же приёмом declaration merging, что и
 * `Components` в `sim/components/index.ts`.
 */

import type { EntityId } from '../core/world';

export interface CombatHitEvent {
  readonly targetId: EntityId;
  readonly wx: number;
  readonly wy: number;
  readonly damage: number;
  readonly crit: boolean;
}

export interface CombatDeathEvent {
  readonly entityId: EntityId;
  readonly wx: number;
  readonly wy: number;
  readonly isEnemy: boolean;
}

declare module '../core/events' {
  interface GameEvents {
    'combat.hit': CombatHitEvent;
    'combat.death': CombatDeathEvent;
  }
}
