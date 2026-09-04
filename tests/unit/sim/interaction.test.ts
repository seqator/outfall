import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createInputSnapshot } from '../../../src/core/input';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld } from '../../../src/core/world';
import { interactionSystem } from '../../../src/sim';

function build() {
  return createWorld(createSeededRng(1), createEventBus());
}

function createControlledHero(world: ReturnType<typeof build>, x: number, y: number) {
  const hero = world.create();
  world.store('transform').add(hero, { x, y, z: 0, prevX: x, prevY: y });
  world.store('controlled').add(hero, { speed: 4 });
  return hero;
}

describe('sim/systems: interactionSystem', () => {
  it('без нажатия interact ничего не эмитит', () => {
    const world = build();
    createControlledHero(world, 3, 4);
    let received: unknown;
    world.events.on('input.interact-requested', (payload) => {
      received = payload;
    });

    interactionSystem(world, 1 / 60, createInputSnapshot());
    world.events.drain();

    expect(received).toBeUndefined();
  });

  it('нажатие interact эмитит событие с позицией героя', () => {
    const world = build();
    const hero = createControlledHero(world, 3, 4);
    let received: { entity: number; x: number; y: number } | undefined;
    world.events.on('input.interact-requested', (payload) => {
      received = payload;
    });

    interactionSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['interact']) }));
    world.events.drain();

    expect(received).toEqual({ entity: hero, x: 3, y: 4 });
  });

  it('без controlled-сущности (герой ещё не заспавнен) ничего не эмитит', () => {
    const world = build();
    let received: unknown;
    world.events.on('input.interact-requested', (payload) => {
      received = payload;
    });

    interactionSystem(world, 1 / 60, createInputSnapshot({ pressed: new Set(['interact']) }));
    world.events.drain();

    expect(received).toBeUndefined();
  });
});
