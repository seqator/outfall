import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createInputSnapshot } from '../../../src/core/input';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld } from '../../../src/core/world';
import {
  SYSTEM_ORDER,
  aiSystem,
  collisionSystem,
  combatSystem,
  effectsSystem,
  inputControlSystem,
  interactionSystem,
  movementSystem,
} from '../../../src/sim';

function build() {
  return createWorld(createSeededRng(1), createEventBus());
}

describe('sim/systems: SYSTEM_ORDER', () => {
  it('порядок стадий: input → ai → movement → collision → combat → effects → interaction (§4 architecture.md, OF-016/025/035)', () => {
    expect(SYSTEM_ORDER.indexOf(inputControlSystem)).toBeLessThan(SYSTEM_ORDER.indexOf(aiSystem));
    expect(SYSTEM_ORDER.indexOf(aiSystem)).toBeLessThan(SYSTEM_ORDER.indexOf(movementSystem));
    expect(SYSTEM_ORDER.indexOf(movementSystem)).toBeLessThan(
      SYSTEM_ORDER.indexOf(collisionSystem),
    );
    expect(SYSTEM_ORDER.indexOf(collisionSystem)).toBeLessThan(
      SYSTEM_ORDER.indexOf(combatSystem),
    );
    expect(SYSTEM_ORDER.indexOf(combatSystem)).toBeLessThan(SYSTEM_ORDER.indexOf(effectsSystem));
    expect(SYSTEM_ORDER.indexOf(effectsSystem)).toBeLessThan(
      SYSTEM_ORDER.indexOf(interactionSystem),
    );
    expect(SYSTEM_ORDER).toHaveLength(7);
  });
});

describe('sim/systems: inputControlSystem', () => {
  it('выставляет velocity = moveX/moveY * speed для управляемой сущности', () => {
    const world = build();
    const e = world.create();
    world.store('controlled').add(e, { speed: 4 });
    world.store('velocity').add(e, { vx: 0, vy: 0 });

    inputControlSystem(world, 1 / 60, createInputSnapshot({ moveX: 1, moveY: -0.5 }));

    expect(world.store('velocity').get(e)).toEqual({ vx: 4, vy: -2 });
  });

  it('не трогает сущности без controlled', () => {
    const world = build();
    const e = world.create();
    world.store('velocity').add(e, { vx: 1, vy: 1 });

    inputControlSystem(world, 1 / 60, createInputSnapshot({ moveX: 1, moveY: 1 }));

    expect(world.store('velocity').get(e)).toEqual({ vx: 1, vy: 1 });
  });

  it('не трогает controlled-сущности без velocity (query исключает неполный набор компонентов)', () => {
    const world = build();
    const e = world.create();
    world.store('controlled').add(e, { speed: 4 });

    expect(() =>
      inputControlSystem(world, 1 / 60, createInputSnapshot({ moveX: 1 })),
    ).not.toThrow();
    expect(world.store('velocity').has(e)).toBe(false);
  });
});

describe('sim/systems: movementSystem', () => {
  it('интегрирует transform из velocity на dt', () => {
    const world = build();
    const e = world.create();
    world.store('transform').add(e, { x: 0, y: 0, z: 0, prevX: 0, prevY: 0 });
    world.store('velocity').add(e, { vx: 2, vy: -1 });

    movementSystem(world, 0.5, createInputSnapshot());

    expect(world.store('transform').get(e)).toEqual({ x: 1, y: -0.5, z: 0, prevX: 0, prevY: 0 });
  });

  it('перед интеграцией фиксирует prevX/prevY как позицию на начало тика', () => {
    const world = build();
    const e = world.create();
    world.store('transform').add(e, { x: 5, y: 5, z: 0, prevX: 999, prevY: 999 });
    world.store('velocity').add(e, { vx: 1, vy: 1 });

    movementSystem(world, 1, createInputSnapshot());

    const transform = world.store('transform').get(e);
    expect(transform?.prevX).toBe(5);
    expect(transform?.prevY).toBe(5);
    expect(transform?.x).toBe(6);
    expect(transform?.y).toBe(6);
  });

  it('не трогает сущности без velocity', () => {
    const world = build();
    const e = world.create();
    world.store('transform').add(e, { x: 1, y: 1, z: 0, prevX: 1, prevY: 1 });

    movementSystem(world, 1, createInputSnapshot());

    expect(world.store('transform').get(e)).toEqual({ x: 1, y: 1, z: 0, prevX: 1, prevY: 1 });
  });

  it('не трогает velocity-сущности без transform (query исключает неполный набор компонентов)', () => {
    const world = build();
    const e = world.create();
    world.store('velocity').add(e, { vx: 1, vy: 1 });

    expect(() => movementSystem(world, 1, createInputSnapshot())).not.toThrow();
    expect(world.store('transform').has(e)).toBe(false);
  });
});

describe('sim: input → movement сквозной прогон через SYSTEM_ORDER', () => {
  it('один тик перемещает управляемую сущность в сторону ввода', () => {
    const world = build();
    const player = world.create();
    world.store('transform').add(player, { x: 0, y: 0, z: 0, prevX: 0, prevY: 0 });
    world.store('velocity').add(player, { vx: 0, vy: 0 });
    world.store('controlled').add(player, { speed: 2 });

    const input = createInputSnapshot({ moveX: 1, moveY: 0 });
    for (const system of SYSTEM_ORDER) {
      system(world, 1, input);
    }

    expect(world.store('transform').get(player)).toEqual({ x: 2, y: 0, z: 0, prevX: 0, prevY: 0 });
  });
});
