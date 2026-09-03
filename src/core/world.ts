/**
 * ECS-контракт (§3.2 доклада engine-architect). Полная реализация
 * `World`/`ComponentStore` — задача OF-010. Здесь фиксируются типы, чтобы
 * `sim`/`render` могли ссылаться на них уже сейчас.
 */

import type { EventBus } from './events';
import type { SeededRng } from './rng';

/** Индекс + поколение упакованы в число. */
export type EntityId = number;

export interface ComponentStore<T> {
  add(e: EntityId, c: T): void;
  get(e: EntityId): T | undefined;
  has(e: EntityId): boolean;
  remove(e: EntityId): void;
  entities(): Iterable<EntityId>;
}

/**
 * Реестр типов компонентов. Расширяется через declaration merging из
 * `src/sim/components/*` — сюда игровая логика добавляет свои поля, не трогая
 * этот файл.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- расширяется declaration merging в sim/
export interface Components {}

export interface World {
  readonly tick: number;
  readonly rng: SeededRng;
  readonly events: EventBus;
  create(): EntityId;
  destroy(e: EntityId): void;
  alive(e: EntityId): boolean;
  store<K extends keyof Components>(key: K): ComponentStore<Components[K]>;
  query<K extends keyof Components>(...keys: K[]): Iterable<EntityId>;
}

/**
 * Продвижение тика — обязанность оркестратора симуляции (`sim.createSimulation`),
 * не отдельных систем: системы получают только `World` и не могут случайно
 * подвинуть счётчик тика сами. Возвращается вместе с `World` из `createWorld`.
 */
export interface WorldControl {
  advanceTick(): void;
}

/** Сколько младших бит `EntityId` отведено под поколение слота. */
const GENERATION_BITS = 12;
const GENERATION_MOD = 2 ** GENERATION_BITS;

function packEntityId(index: number, generation: number): EntityId {
  return index * GENERATION_MOD + (generation % GENERATION_MOD);
}

function indexOfEntityId(id: EntityId): number {
  return Math.floor(id / GENERATION_MOD);
}

class ComponentStoreImpl<T> implements ComponentStore<T> {
  private readonly map = new Map<EntityId, T>();

  add(e: EntityId, c: T): void {
    this.map.set(e, c);
  }

  get(e: EntityId): T | undefined {
    return this.map.get(e);
  }

  has(e: EntityId): boolean {
    return this.map.has(e);
  }

  remove(e: EntityId): void {
    this.map.delete(e);
  }

  entities(): Iterable<EntityId> {
    return this.map.keys();
  }

  get size(): number {
    return this.map.size;
  }
}

class WorldImpl implements World, WorldControl {
  tick = 0;

  private nextIndex = 0;
  private readonly generations = new Map<number, number>();
  private readonly freeIndices: number[] = [];
  private readonly aliveIds = new Set<EntityId>();
  private readonly stores = new Map<string, ComponentStoreImpl<unknown>>();

  constructor(
    readonly rng: SeededRng,
    readonly events: EventBus,
  ) {}

  create(): EntityId {
    const reused = this.freeIndices.pop();
    const index = reused !== undefined ? reused : this.nextIndex++;
    const generation = this.generations.get(index) ?? 0;
    this.generations.set(index, generation);
    const id = packEntityId(index, generation);
    this.aliveIds.add(id);
    return id;
  }

  destroy(e: EntityId): void {
    if (!this.aliveIds.has(e)) return;
    this.aliveIds.delete(e);
    for (const store of this.stores.values()) {
      store.remove(e);
    }
    const index = indexOfEntityId(e);
    const nextGeneration = ((this.generations.get(index) ?? 0) + 1) % GENERATION_MOD;
    this.generations.set(index, nextGeneration);
    this.freeIndices.push(index);
  }

  alive(e: EntityId): boolean {
    return this.aliveIds.has(e);
  }

  store<K extends keyof Components>(key: K): ComponentStore<Components[K]> {
    const cacheKey = key as string;
    let existing = this.stores.get(cacheKey);
    if (!existing) {
      existing = new ComponentStoreImpl<unknown>();
      this.stores.set(cacheKey, existing);
    }
    return existing as unknown as ComponentStore<Components[K]>;
  }

  query<K extends keyof Components>(...keys: K[]): Iterable<EntityId> {
    const aliveIds = this.aliveIds;
    const rawStores = keys.map((key) => this.store(key) as unknown as ComponentStoreImpl<unknown>);

    function* run(): Generator<EntityId> {
      const first = rawStores[0];
      if (!first) return; // query() без аргументов — пустой результат, а не «всё»

      let base = first;
      for (const candidate of rawStores) {
        if (candidate.size < base.size) base = candidate;
      }
      const others = rawStores.filter((candidate) => candidate !== base);

      for (const id of base.entities()) {
        if (!aliveIds.has(id)) continue;
        let matches = true;
        for (const other of others) {
          if (!other.has(id)) {
            matches = false;
            break;
          }
        }
        if (matches) yield id;
      }
    }

    return run();
  }

  advanceTick(): void {
    this.tick += 1;
  }
}

/**
 * Создаёт пустой мир: без сущностей, с переданными `rng`/`events`. `rng` и
 * `events` создаются вызывающей стороной (`createSeededRng`/`createEventBus`)
 * — так тесты и `sim` полностью контролируют источники недетерминизма.
 */
export function createWorld(rng: SeededRng, events: EventBus): World & WorldControl {
  return new WorldImpl(rng, events);
}
