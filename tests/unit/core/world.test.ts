import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../../src/core/events';
import { createSeededRng } from '../../../src/core/rng';
import { createWorld } from '../../../src/core/world';

declare module '../../../src/core/world' {
  interface Components {
    position: { x: number; y: number };
    tag: { name: string };
  }
}

function build() {
  return createWorld(createSeededRng(1), createEventBus());
}

describe('core/world: createWorld', () => {
  it('стартует с tick 0 и без сущностей', () => {
    const world = build();
    expect(world.tick).toBe(0);
    expect(Array.from(world.query('position'))).toEqual([]);
  });

  it('create() возвращает новую живую сущность', () => {
    const world = build();
    const e = world.create();
    expect(world.alive(e)).toBe(true);
  });

  it('create() даёт разным сущностям разные id', () => {
    const world = build();
    const a = world.create();
    const b = world.create();
    expect(a).not.toBe(b);
  });

  it('destroy() делает сущность неживой', () => {
    const world = build();
    const e = world.create();
    world.destroy(e);
    expect(world.alive(e)).toBe(false);
  });

  it('alive() для никогда не существовавшего id возвращает false', () => {
    const world = build();
    expect(world.alive(999_999)).toBe(false);
  });

  it('destroy() уже уничтоженной сущности — no-op, не бросает исключение', () => {
    const world = build();
    const e = world.create();
    world.destroy(e);
    expect(() => world.destroy(e)).not.toThrow();
    expect(world.alive(e)).toBe(false);
  });

  it('переиспользованный слот индекса получает новый id (генерация меняется)', () => {
    const world = build();
    const first = world.create();
    world.destroy(first);
    const second = world.create();

    // Слот индекса мог переиспользоваться, но численный id обязан отличаться —
    // иначе старые ссылки на `first` ожили бы вместе с новой сущностью.
    expect(second).not.toBe(first);
    expect(world.alive(first)).toBe(false);
    expect(world.alive(second)).toBe(true);
  });

  it('store().add()/get()/has()/remove() работают независимо от других типов компонентов', () => {
    const world = build();
    const e = world.create();
    const store = world.store('position');

    expect(store.has(e)).toBe(false);
    expect(store.get(e)).toBeUndefined();

    store.add(e, { x: 1, y: 2 });
    expect(store.has(e)).toBe(true);
    expect(store.get(e)).toEqual({ x: 1, y: 2 });

    store.remove(e);
    expect(store.has(e)).toBe(false);
    expect(store.get(e)).toBeUndefined();
  });

  it('store() возвращает тот же стор при повторном обращении по тому же ключу', () => {
    const world = build();
    const e = world.create();
    world.store('position').add(e, { x: 5, y: 5 });

    expect(world.store('position').get(e)).toEqual({ x: 5, y: 5 });
  });

  it('destroy() удаляет сущность из всех её сторов компонентов', () => {
    const world = build();
    const e = world.create();
    world.store('position').add(e, { x: 0, y: 0 });
    world.store('tag').add(e, { name: 'x' });

    world.destroy(e);

    expect(world.store('position').has(e)).toBe(false);
    expect(world.store('tag').has(e)).toBe(false);
  });

  it('query() без ключей — пустой результат', () => {
    const world = build();
    world.create();
    expect(Array.from(world.query())).toEqual([]);
  });

  it('query(key) возвращает только сущности с этим компонентом', () => {
    const world = build();
    const withPos = world.create();
    world.create(); // без компонента
    world.store('position').add(withPos, { x: 1, y: 1 });

    expect(Array.from(world.query('position'))).toEqual([withPos]);
  });

  it('query(a, b) возвращает пересечение — сущности хотя бы с одним недостающим компонентом исключены', () => {
    const world = build();
    const both = world.create();
    const onlyPosition = world.create();
    const onlyTag = world.create();

    world.store('position').add(both, { x: 0, y: 0 });
    world.store('tag').add(both, { name: 'both' });
    world.store('position').add(onlyPosition, { x: 1, y: 1 });
    world.store('tag').add(onlyTag, { name: 'only-tag' });

    expect(Array.from(world.query('position', 'tag'))).toEqual([both]);
  });

  it('query() корректен независимо от того, какой из сторов компонентов меньше', () => {
    const world = build();
    const match = world.create();
    const onlyPosA = world.create();
    const onlyPosB = world.create();
    world.store('position').add(match, { x: 0, y: 0 });
    world.store('position').add(onlyPosA, { x: 1, y: 1 });
    world.store('position').add(onlyPosB, { x: 2, y: 2 });
    world.store('tag').add(match, { name: 'match' }); // tag-стор заметно меньше position-стора

    expect(Array.from(world.query('position', 'tag'))).toEqual([match]);
  });

  it('query() не возвращает уничтоженные сущности, даже если компонент не был явно снят', () => {
    const world = build();
    const e = world.create();
    world.store('position').add(e, { x: 0, y: 0 });
    world.destroy(e);

    expect(Array.from(world.query('position'))).toEqual([]);
  });

  it('advanceTick() (WorldControl) продвигает счётчик тика на 1 за вызов', () => {
    const world = build();
    world.advanceTick();
    expect(world.tick).toBe(1);
    world.advanceTick();
    world.advanceTick();
    expect(world.tick).toBe(3);
  });

  it('rng и events — те объекты, что переданы в createWorld', () => {
    const rng = createSeededRng(7);
    const events = createEventBus();
    const world = createWorld(rng, events);

    expect(world.rng).toBe(rng);
    expect(world.events).toBe(events);
  });
});
