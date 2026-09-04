/**
 * Системы ECS — чистые функции `(world, dt, input) => void`, выполняются в
 * фиксированном порядке (§3.2): `input → ai → movement → collision → combat →
 * effects → quest → cleanup`. OF-010 реализовала первый пример из этой цепочки
 * (`input → movement`) как эталон для остальных стадий; OF-015 добавила
 * стадию `collision` (коллизии по сетке карты) следующей за `movement`.
 * OF-016 добавляет `ai` (телеграф/атака трёх врагов среза, `ai.ts`) между
 * `input` и `movement` и `combat` (стрельба/рывок/снаряды/урон/смерть,
 * `combat.ts`) после `collision` — ровно та точка, которую фиксирует §4
 * `docs/tech/architecture.md`. `effects`/`quest`/`cleanup` — задачи после
 * OF-016.
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';
import { aiSystem, isEnemyWeaknessActive, spawnEnemy } from './ai';
import { collisionSystem } from './collision';
import { combatSystem, createWeaponRuntimeState, createWeaponsComponent } from './combat';
import { inputControlSystem } from './input-control';
import { movementSystem } from './movement';

export type System = (world: World, dt: number, input: InputSnapshot) => void;

export {
  inputControlSystem,
  aiSystem,
  spawnEnemy,
  isEnemyWeaknessActive,
  movementSystem,
  collisionSystem,
  combatSystem,
  createWeaponsComponent,
  createWeaponRuntimeState,
};

/** Порядок систем фиксирован и не должен зависеть от порядка регистрации. */
export const SYSTEM_ORDER: readonly System[] = [
  inputControlSystem,
  aiSystem,
  movementSystem,
  collisionSystem,
  combatSystem,
];
