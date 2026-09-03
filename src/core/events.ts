/**
 * Шина событий (§3.9). Реализация `createEventBus` — задача OF-010.
 * `GameEvents` расширяется через declaration merging из `sim`/`game` по мере
 * появления систем (бой, квесты, аудио-события и т.д.).
 */

/* eslint-disable @typescript-eslint/no-empty-object-type -- расширяется declaration merging */
export interface GameEvents {}
/* eslint-enable @typescript-eslint/no-empty-object-type */

export interface EventBus {
  emit<K extends keyof GameEvents>(kind: K, payload: GameEvents[K]): void;
  on<K extends keyof GameEvents>(kind: K, handler: (payload: GameEvents[K]) => void): () => void;
  /** События копятся за тик и доставляются в конце тика — порядок детерминирован. */
  drain(): void;
}

interface QueuedEvent<K extends keyof GameEvents = keyof GameEvents> {
  kind: K;
  payload: GameEvents[K];
}

/**
 * `emit` только кладёт событие в очередь — обработчики не вызываются
 * синхронно во время тика (иначе порядок доставки зависел бы от порядка
 * систем, а не был бы детерминированным шагом «после тика»). `drain()`
 * забирает снимок очереди и чистит её *до* вызова обработчиков: если
 * обработчик сам вызовет `emit`, новое событие попадёт в следующий `drain()`,
 * а не зациклит текущий проход.
 */
export function createEventBus(): EventBus {
  const handlers = new Map<keyof GameEvents, Set<(payload: never) => void>>();
  let queue: QueuedEvent[] = [];

  return {
    emit<K extends keyof GameEvents>(kind: K, payload: GameEvents[K]): void {
      queue.push({ kind, payload });
    },
    on<K extends keyof GameEvents>(kind: K, handler: (payload: GameEvents[K]) => void): () => void {
      let set = handlers.get(kind);
      if (!set) {
        set = new Set();
        handlers.set(kind, set);
      }
      const erasedHandler = handler as (payload: never) => void;
      set.add(erasedHandler);
      return () => {
        set.delete(erasedHandler);
      };
    },
    drain(): void {
      if (queue.length === 0) return;
      const batch = queue;
      queue = [];
      for (const { kind, payload } of batch) {
        const set = handlers.get(kind);
        if (!set) continue;
        for (const handler of set) {
          handler(payload as never);
        }
      }
    },
  };
}
