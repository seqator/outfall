/**
 * Стадия `interaction`: переводит `pressed.has('interact')` в событие шины,
 * а не читает `InputSnapshot` заново в `game` — `input.snapshot()` уже
 * вызван один раз внутри `GameLoop.frame()` (`core/loop.ts`) и передан этому
 * тику; повторный вызов из `game`-слоя опустошил бы одноразовый набор
 * `pressed` (см. `src/input/dom-input.ts`: `pressed` — снимок `justPressed`,
 * очищаемый при каждом `snapshot()`). `sim` — единственная сторона внутри
 * тика, которая законно читает `pressed`, поэтому она же и публикует факт
 * нажатия как событие — по тому же приёму, что боевые события `combat.*`
 * (`src/sim/events.ts`).
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';

export interface InteractRequestedEvent {
  readonly entity: import('../../core/world').EntityId;
  readonly x: number;
  readonly y: number;
}

declare module '../../core/events' {
  interface GameEvents {
    'input.interact-requested': InteractRequestedEvent;
  }
}

export function interactionSystem(world: World, _dt: number, input: InputSnapshot): void {
  if (!input.pressed.has('interact')) return;
  for (const entity of world.query('transform', 'controlled')) {
    const transform = world.store('transform').get(entity);
    /* v8 ignore next */
    if (!transform) continue;
    world.events.emit('input.interact-requested', { entity, x: transform.x, y: transform.y });
    break;
  }
}
