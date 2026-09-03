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
