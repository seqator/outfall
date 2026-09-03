/**
 * Собирает мир и фиксированный порядок систем в реализацию контракта
 * `Simulation` из `core/loop.ts`: `GameLoop` не знает про ECS, он лишь зовёт
 * `step(dt, input)` ровно `TICK_DT` секунд симуляции за раз.
 *
 * Один шаг — это: прогон `SYSTEM_ORDER` → инкремент `world.tick` → доставка
 * накопленных за тик событий (`events.drain()`). Порядок «сначала системы,
 * потом drain» гарантирует, что подписчики видят согласованное состояние
 * мира на момент события, а не мир в процессе очередной системы.
 */

import type { Simulation } from '../core/loop';
import type { World, WorldControl } from '../core/world';
import { SYSTEM_ORDER } from './systems';

export function createSimulation(world: World & WorldControl): Simulation {
  return {
    step(dt, input): void {
      for (const system of SYSTEM_ORDER) {
        system(world, dt, input);
      }
      world.advanceTick();
      world.events.drain();
    },
  };
}
