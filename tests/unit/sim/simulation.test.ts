import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createInputSnapshot } from '../../../src/core/input';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld } from '../../../src/core/world';
import { createSimulation } from '../../../src/sim';

declare module '../../../src/core/events' {
  interface GameEvents {
    'test:tick': { tick: number };
  }
}

function build() {
  return createWorld(createSeededRng(1), createEventBus());
}

describe('sim/simulation: createSimulation', () => {
  it('step() продвигает world.tick ровно на 1', () => {
    const world = build();
    const sim = createSimulation(world);

    sim.step(1 / 60, createInputSnapshot());
    expect(world.tick).toBe(1);
    sim.step(1 / 60, createInputSnapshot());
    expect(world.tick).toBe(2);
  });

  it('step() прогоняет системы SYSTEM_ORDER — управляемая сущность двигается', () => {
    const world = build();
    const sim = createSimulation(world);
    const player = world.create();
    world.store('transform').add(player, { x: 0, y: 0, z: 0, prevX: 0, prevY: 0 });
    world.store('velocity').add(player, { vx: 0, vy: 0 });
    world.store('controlled').add(player, { speed: 1 });

    sim.step(1, createInputSnapshot({ moveX: 1 }));

    expect(world.store('transform').get(player)?.x).toBe(1);
  });

  it('step() доставляет события, накопленные за тик, синхронно к моменту возврата (drain в конце шага)', () => {
    const world = build();
    const sim = createSimulation(world);
    const handler = vi.fn();
    world.events.on('test:tick', handler);

    // emit нельзя сделать из системы напрямую в этом тесте (нет такой системы),
    // поэтому проверяем через сам events-контракт мира до и после step().
    world.events.emit('test:tick', { tick: 0 });
    expect(handler).not.toHaveBeenCalled();

    sim.step(1 / 60, createInputSnapshot());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ tick: 0 });
  });
});
