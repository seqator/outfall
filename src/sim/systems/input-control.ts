/**
 * Пример системы `input`-стадии (SYSTEM_ORDER: input → ... → movement — см.
 * §3.2 доклада engine-architect). Переносит `InputSnapshot` в `velocity`
 * управляемых сущностей: сама точка, откуда скорость берётся (ИИ,
 * скрипт-катсцена и т.д.), системе движения безразлична — ей нужна только
 * `velocity`.
 *
 * OF-016: единственное место, которое пишет `velocity` из `InputSnapshot`,
 * поэтому здесь же гасится движение по боевым причинам — смерть (ХП ≤ 0),
 * обездвиживание сетью Подлинейного (`immobilized`, §2.2 combat.md) и
 * замедление от шока (`shockState`, −15%, §4.6 combat.md). Сущности без этих
 * компонентов (напр. декоративные `controlled`-заглушки в тестах) ведут себя
 * как раньше — до OF-016 (`?? `/`undefined` не меняют поведение).
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';
import { SHOCK_SPEED_MULTIPLIER } from '../formulas/shock';

export function inputControlSystem(world: World, _dt: number, input: InputSnapshot): void {
  for (const entity of world.query('controlled', 'velocity')) {
    const controlled = world.store('controlled').get(entity);
    const velocity = world.store('velocity').get(entity);
    // `world.query('controlled', 'velocity')` уже гарантирует наличие обоих
    // компонентов — проверка защищает только от гипотетического рассинхрона
    // между query() и store(), а не от реального сценария в текущей ECS.
    /* v8 ignore next */
    if (!controlled || !velocity) continue;

    const health = world.store('health').get(entity);
    if (health && health.hp <= 0) {
      velocity.vx = 0;
      velocity.vy = 0;
      continue;
    }

    const immobilized = world.store('immobilized').get(entity);
    if (immobilized && immobilized.remainingMs > 0) {
      velocity.vx = 0;
      velocity.vy = 0;
      continue;
    }

    const shock = world.store('shockState').get(entity);
    const speedMultiplier = shock && shock.remainingMs > 0 ? SHOCK_SPEED_MULTIPLIER : 1;

    velocity.vx = input.moveX * controlled.speed * speedMultiplier;
    velocity.vy = input.moveY * controlled.speed * speedMultiplier;
  }
}
