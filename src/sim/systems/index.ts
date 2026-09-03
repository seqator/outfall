/**
 * Системы ECS — чистые функции `(world, dt, input) => void`, выполняются в
 * фиксированном порядке (§3.2): `input → ai → movement → collision → combat →
 * effects → quest → cleanup`. OF-010 реализует первый пример из этой цепочки
 * (`input → movement`) как эталон для остальных стадий; ИИ/коллизии/бой
 * добавляются задачами OF-015/016 и далее — сюда же, в конец массива, в
 * порядке своей стадии.
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';
import { inputControlSystem } from './input-control';
import { movementSystem } from './movement';

export type System = (world: World, dt: number, input: InputSnapshot) => void;

export { inputControlSystem, movementSystem };

/** Порядок систем фиксирован и не должен зависеть от порядка регистрации. */
export const SYSTEM_ORDER: readonly System[] = [inputControlSystem, movementSystem];
