/**
 * Пример системы `input`-стадии (SYSTEM_ORDER: input → ... → movement — см.
 * §3.2 доклада engine-architect). Переносит `InputSnapshot` в `velocity`
 * управляемых сущностей: сама точка, откуда скорость берётся (ИИ,
 * скрипт-катсцена и т.д.), системе движения безразлична — ей нужна только
 * `velocity`.
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';

export function inputControlSystem(world: World, _dt: number, input: InputSnapshot): void {
  for (const entity of world.query('controlled', 'velocity')) {
    const controlled = world.store('controlled').get(entity);
    const velocity = world.store('velocity').get(entity);
    // `world.query('controlled', 'velocity')` уже гарантирует наличие обоих
    // компонентов — проверка защищает только от гипотетического рассинхрона
    // между query() и store(), а не от реального сценария в текущей ECS.
    /* v8 ignore next */
    if (!controlled || !velocity) continue;

    velocity.vx = input.moveX * controlled.speed;
    velocity.vy = input.moveY * controlled.speed;
  }
}
