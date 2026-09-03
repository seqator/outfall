/**
 * Системы ECS — чистые функции `(world, dt, input) => void`, выполняются в
 * фиксированном порядке (§3.2). Конкретные системы (движение, ИИ, бой,
 * коллизии...) добавляются задачами OF-015/016 и далее; `SYSTEM_ORDER`
 * наполняется по мере их появления.
 */

import type { World } from '../../core/world';
import type { InputSnapshot } from '../../core/input';

export type System = (world: World, dt: number, input: InputSnapshot) => void;

/** Порядок систем фиксирован и не должен зависеть от порядка регистрации. */
export const SYSTEM_ORDER: readonly System[] = [];
