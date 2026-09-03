/**
 * Системы ECS — чистые функции `(world, dt, input) => void`, выполняются в
 * фиксированном порядке (§3.2): `input → ai → movement → collision → combat →
 * effects → quest → cleanup`. OF-010 реализовала первый пример из этой цепочки
 * (`input → movement`) как эталон для остальных стадий; OF-015 добавляет
 * стадию `collision` (коллизии по сетке карты) следующей за `movement` — ИИ и
 * бой добавляются задачей OF-016 и далее, в конец массива, в порядке своей
 * стадии.
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';
import { collisionSystem } from './collision';
import { inputControlSystem } from './input-control';
import { movementSystem } from './movement';

export type System = (world: World, dt: number, input: InputSnapshot) => void;

export { inputControlSystem, movementSystem, collisionSystem };

/** Порядок систем фиксирован и не должен зависеть от порядка регистрации. */
export const SYSTEM_ORDER: readonly System[] = [inputControlSystem, movementSystem, collisionSystem];
