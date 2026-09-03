import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createInputSnapshot } from '../../../src/core/input';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld } from '../../../src/core/world';
import { collisionSystem, movementSystem } from '../../../src/sim';

function build() {
  return createWorld(createSeededRng(1), createEventBus());
}

/** 4×4 карта, стена одной вертикальной линией по x=2 (кроме проверок границ). */
function addTestGrid(world: ReturnType<typeof build>): void {
  const width = 4;
  const height = 4;
  // прим.: row-major, 0 — пол, 1 — стена
  // ряд y=0: 0 0 1 0
  // ряд y=1: 0 0 1 0
  // ряд y=2: 0 0 1 0
  // ряд y=3: 0 0 1 0
  const collision = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    collision[y * width + 2] = 1;
  }
  const mapEntity = world.create();
  world.store('mapGrid').add(mapEntity, { width, height, collision });
}

describe('sim/systems: collisionSystem', () => {
  it('без mapGrid ничего не делает — transform не трогается', () => {
    const world = build();
    const e = world.create();
    world.store('transform').add(e, { x: 5, y: 5, z: 0, prevX: 5, prevY: 5 });
    world.store('velocity').add(e, { vx: 1, vy: 0 });
    world.store('collidable').add(e, { radius: 0.3 });

    collisionSystem(world, 1 / 60, createInputSnapshot());

    expect(world.store('transform').get(e)).toEqual({ x: 5, y: 5, z: 0, prevX: 5, prevY: 5 });
  });

  it('пропускает сущности без collidable (velocity+transform недостаточно)', () => {
    const world = build();
    addTestGrid(world);
    const e = world.create();
    world.store('transform').add(e, { x: 1, y: 1, z: 0, prevX: 1, prevY: 1 });
    world.store('velocity').add(e, { vx: 5, vy: 0 });
    movementSystem(world, 1, createInputSnapshot());

    collisionSystem(world, 1, createInputSnapshot());

    // movementSystem уже переместил сущность внутрь стены — collisionSystem
    // не должен трогать сущности без `collidable`.
    expect(world.store('transform').get(e)?.x).toBe(6);
  });

  it('блокирует движение прямо в стену — позиция откатывается к prevX/prevY', () => {
    const world = build();
    addTestGrid(world);
    const e = world.create();
    // Стартуем рядом со стеной (x=2 занята), пытаемся пройти сквозь неё вправо.
    // dt/скорость подобраны так, чтобы шаг за тик (0.4) был меньше толщины
    // стены (1 клетка) — как и в реальной игре на 60 Гц, где шаг на порядки
    // меньше клетки; проверка по AABB на клетку — не свипаемая (continuous)
    // коллизия и рассчитана именно на такие малые шаги за тик.
    world.store('transform').add(e, { x: 1.5, y: 1.5, z: 0, prevX: 1.5, prevY: 1.5 });
    world.store('velocity').add(e, { vx: 2, vy: 0 });
    world.store('collidable').add(e, { radius: 0.3 });

    movementSystem(world, 0.2, createInputSnapshot());
    collisionSystem(world, 0.2, createInputSnapshot());

    expect(world.store('transform').get(e)).toEqual({
      x: 1.5,
      y: 1.5,
      z: 0,
      prevX: 1.5,
      prevY: 1.5,
    });
  });

  it('позволяет скольжение вдоль стены: блокируется только заблокированная ось', () => {
    const world = build();
    addTestGrid(world);
    const e = world.create();
    world.store('transform').add(e, { x: 1.5, y: 1.5, z: 0, prevX: 1.5, prevY: 1.5 });
    // Диагональное движение: по x упрёмся в стену, по y — свободно.
    world.store('velocity').add(e, { vx: 2, vy: 1 });
    world.store('collidable').add(e, { radius: 0.3 });

    movementSystem(world, 0.2, createInputSnapshot());
    collisionSystem(world, 0.2, createInputSnapshot());

    const transform = world.store('transform').get(e);
    expect(transform?.x).toBe(1.5); // ось x отменена столкновением
    expect(transform?.y).toBeCloseTo(1.7); // ось y прошла беспрепятственно
  });

  it('не пускает за границу карты (клетка вне сетки считается стеной)', () => {
    const world = build();
    addTestGrid(world);
    const e = world.create();
    world.store('transform').add(e, { x: 0.5, y: 0.5, z: 0, prevX: 0.5, prevY: 0.5 });
    world.store('velocity').add(e, { vx: -5, vy: -5 });
    world.store('collidable').add(e, { radius: 0.3 });

    movementSystem(world, 1, createInputSnapshot());
    collisionSystem(world, 1, createInputSnapshot());

    expect(world.store('transform').get(e)).toEqual({
      x: 0.5,
      y: 0.5,
      z: 0,
      prevX: 0.5,
      prevY: 0.5,
    });
  });

  it('свободное движение без препятствий не меняется', () => {
    const world = build();
    addTestGrid(world);
    const e = world.create();
    world.store('transform').add(e, { x: 0.5, y: 0.5, z: 0, prevX: 0.5, prevY: 0.5 });
    world.store('velocity').add(e, { vx: 1, vy: 0 });
    world.store('collidable').add(e, { radius: 0.1 });

    movementSystem(world, 0.2, createInputSnapshot());
    collisionSystem(world, 0.2, createInputSnapshot());

    const transform = world.store('transform').get(e);
    expect(transform?.x).toBeCloseTo(0.7);
    expect(transform?.y).toBeCloseTo(0.5);
  });
});
