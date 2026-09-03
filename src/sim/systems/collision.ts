/**
 * Стадия `collision` (SYSTEM_ORDER: input → ai → movement → collision → ... —
 * §3.2 доклада engine-architect, `docs/tech/architecture.md` §4). OF-015:
 * коллизии по сетке — простой AABB-чек клеток вокруг сущности против
 * `MapGridComponent`, построенный загрузчиком карты (`src/game/world/map-loader.ts`).
 *
 * Работает поверх `movementSystem`: та уже проинтегрировала `transform` из
 * `velocity` и зафиксировала `prevX/prevY` как позицию до этого тика. Здесь
 * позиция поочерёдно откатывается по каждой оси, если целевая клетка занята
 * стеной — так движение вдоль стены («скольжение») не останавливается
 * целиком, если заблокирована только одна ось.
 *
 * Без выделения памяти в горячем цикле: `isBlocked` — только целочисленная
 * арифметика и обращения к `Uint8Array`, без создания массивов/объектов на
 * сущность (бюджет `sim ≤ 4 мс`, `docs/tech/architecture.md`).
 */

import type { InputSnapshot } from '../../core/input';
import type { World } from '../../core/world';
import type { MapGridComponent } from '../components';

/** Клетка вне границ карты считается стеной — карта не бесконечна. */
function isBlocked(grid: MapGridComponent, x: number, y: number, radius: number): boolean {
  const minX = Math.floor(x - radius);
  const maxX = Math.floor(x + radius);
  const minY = Math.floor(y - radius);
  const maxY = Math.floor(y + radius);

  for (let ty = minY; ty <= maxY; ty++) {
    if (ty < 0 || ty >= grid.height) return true;
    for (let tx = minX; tx <= maxX; tx++) {
      if (tx < 0 || tx >= grid.width) return true;
      if (grid.collision[ty * grid.width + tx] === 1) return true;
    }
  }
  return false;
}

/** Единственная сущность-карта на загруженный уровень (см. `map-loader.ts`); undefined — карта ещё не загружена. */
function findMapGrid(world: World): MapGridComponent | undefined {
  for (const entity of world.query('mapGrid')) {
    return world.store('mapGrid').get(entity);
  }
  return undefined;
}

export function collisionSystem(world: World, _dt: number, _input: InputSnapshot): void {
  const grid = findMapGrid(world);
  if (!grid) return;

  for (const entity of world.query('transform', 'velocity', 'collidable')) {
    const transform = world.store('transform').get(entity);
    const collidable = world.store('collidable').get(entity);
    // `world.query(...)` уже гарантирует наличие обоих компонентов — защита
    // инварианта ECS, а не достижимая ветка через публичный API.
    /* v8 ignore next */
    if (!transform || !collidable) continue;

    const fromX = transform.prevX;
    const fromY = transform.prevY;

    let resolvedX = transform.x;
    let resolvedY = transform.y;

    if (isBlocked(grid, resolvedX, fromY, collidable.radius)) {
      resolvedX = fromX;
    }
    if (isBlocked(grid, resolvedX, resolvedY, collidable.radius)) {
      resolvedY = fromY;
    }

    transform.x = resolvedX;
    transform.y = resolvedY;
  }
}
