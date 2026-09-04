import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createInputSnapshot } from '../../../src/core/input';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld } from '../../../src/core/world';
import { entityCollisionSystem } from '../../../src/sim';

function build() {
  return createWorld(createSeededRng(1), createEventBus());
}

describe('sim/systems: entityCollisionSystem', () => {
  it('две collidable-сущности не пересекаются — движение не трогается', () => {
    const world = build();
    const a = world.create();
    world.store('transform').add(a, { x: 1, y: 1, z: 0, prevX: 0.5, prevY: 1 });
    world.store('collidable').add(a, { radius: 0.3 });

    const b = world.create();
    world.store('transform').add(b, { x: 5, y: 5, z: 0, prevX: 5, prevY: 5 });
    world.store('collidable').add(b, { radius: 0.3 });

    entityCollisionSystem(world, 1 / 60, createInputSnapshot());

    expect(world.store('transform').get(a)).toEqual({ x: 1, y: 1, z: 0, prevX: 0.5, prevY: 1 });
    expect(world.store('transform').get(b)).toEqual({ x: 5, y: 5, z: 0, prevX: 5, prevY: 5 });
  });

  it('A движется прямо в стоящую B — движение A откатывается к prevX/prevY, B не двигается (repro Duxa)', () => {
    const world = build();
    // A шёл вправо этот тик: prevX=1, x=1.9 — почти уперевшись в B на x=2.
    const a = world.create();
    world.store('transform').add(a, { x: 1.9, y: 2, z: 0, prevX: 1, prevY: 2 });
    world.store('collidable').add(a, { radius: 0.3 });

    const b = world.create();
    world.store('transform').add(b, { x: 2, y: 2, z: 0, prevX: 2, prevY: 2 });
    world.store('collidable').add(b, { radius: 0.3 });

    entityCollisionSystem(world, 1 / 60, createInputSnapshot());

    // Сумма радиусов 0.6 > dist(1.9,2)=0.1 — перекрытие, откат к prevX/prevY.
    expect(world.store('transform').get(a)).toEqual({ x: 1, y: 2, z: 0, prevX: 1, prevY: 2 });
    expect(world.store('transform').get(b)).toEqual({ x: 2, y: 2, z: 0, prevX: 2, prevY: 2 });
  });

  it('скольжение по диагонали: X упирается в B, Y свободна', () => {
    const world = build();
    // A движется по диагонали: X-компонент упрётся в B (x=2), Y — свободна.
    const a = world.create();
    world.store('transform').add(a, { x: 1.9, y: 2.5, z: 0, prevX: 1, prevY: 2 });
    world.store('collidable').add(a, { radius: 0.3 });

    const b = world.create();
    world.store('transform').add(b, { x: 2, y: 2, z: 0, prevX: 2, prevY: 2 });
    world.store('collidable').add(b, { radius: 0.3 });

    entityCollisionSystem(world, 1 / 60, createInputSnapshot());

    const transformA = world.store('transform').get(a);
    expect(transformA?.x).toBe(1); // ось X отменена столкновением с B
    expect(transformA?.y).toBe(2.5); // ось Y прошла беспрепятственно (dist до B по Y=2.5 достаточен)
  });

  it('сущности без collidable не участвуют — ни как движущиеся, ни как препятствие', () => {
    const world = build();
    // Декор/NPC без collidable, стоит там же, куда движется A — не должен блокировать.
    const npc = world.create();
    world.store('transform').add(npc, { x: 2, y: 2, z: 0, prevX: 2, prevY: 2 });

    const a = world.create();
    world.store('transform').add(a, { x: 1.9, y: 2, z: 0, prevX: 1, prevY: 2 });
    world.store('collidable').add(a, { radius: 0.3 });

    entityCollisionSystem(world, 1 / 60, createInputSnapshot());

    // A не откатывается — npc без collidable не участвует в проверке.
    expect(world.store('transform').get(a)).toEqual({ x: 1.9, y: 2, z: 0, prevX: 1, prevY: 2 });
    // npc тоже не трогается — у него даже нет collidable, чтобы попасть в снимок.
    expect(world.store('transform').get(npc)).toEqual({ x: 2, y: 2, z: 0, prevX: 2, prevY: 2 });
  });

  it('мёртвая (health.hp<=0) сущность с collidable не блокирует', () => {
    const world = build();
    const corpse = world.create();
    world.store('transform').add(corpse, { x: 2, y: 2, z: 0, prevX: 2, prevY: 2 });
    world.store('collidable').add(corpse, { radius: 0.3 });
    world.store('health').add(corpse, { hp: 0, maxHp: 10, armor: 0 });

    const a = world.create();
    world.store('transform').add(a, { x: 1.9, y: 2, z: 0, prevX: 1, prevY: 2 });
    world.store('collidable').add(a, { radius: 0.3 });

    entityCollisionSystem(world, 1 / 60, createInputSnapshot());

    // Труп не блокирует — A проходит сквозь его позицию беспрепятственно.
    expect(world.store('transform').get(a)).toEqual({ x: 1.9, y: 2, z: 0, prevX: 1, prevY: 2 });
  });

  it('детерминизм: два прогона идентичного сценария дают идентичный результат', () => {
    function run(): unknown {
      const world = createWorld(createSeededRng(42), createEventBus());
      const a = world.create();
      world.store('transform').add(a, { x: 1.9, y: 2.5, z: 0, prevX: 1, prevY: 2 });
      world.store('collidable').add(a, { radius: 0.3 });

      const b = world.create();
      world.store('transform').add(b, { x: 2, y: 2, z: 0, prevX: 2, prevY: 2 });
      world.store('collidable').add(b, { radius: 0.3 });

      const c = world.create();
      world.store('transform').add(c, { x: 5, y: 5, z: 0, prevX: 4.5, prevY: 4.8 });
      world.store('collidable').add(c, { radius: 0.35 });

      entityCollisionSystem(world, 1 / 60, createInputSnapshot());

      return [
        world.store('transform').get(a),
        world.store('transform').get(b),
        world.store('transform').get(c),
      ];
    }

    expect(run()).toEqual(run());
  });
});
