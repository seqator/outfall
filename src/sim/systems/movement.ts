/**
 * Пример системы стадии `movement` (SYSTEM_ORDER: input → ai → movement →
 * ... — §3.2). Чистое кинематическое интегрирование: `transform` смещается
 * на `velocity * dt`. `prevX/prevY` фиксируются до интеграции — рендер
 * использует их вместе с `alpha` из `GameLoop` для интерполяции между тиками
 * (§3.1), сама система движения ничего не знает о рендере.
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';

export function movementSystem(world: World, dt: number, _input: InputSnapshot): void {
  for (const entity of world.query('transform', 'velocity')) {
    const transform = world.store('transform').get(entity);
    const velocity = world.store('velocity').get(entity);
    if (!transform || !velocity) continue;

    transform.prevX = transform.x;
    transform.prevY = transform.y;
    transform.x += velocity.vx * dt;
    transform.y += velocity.vy * dt;
  }
}
