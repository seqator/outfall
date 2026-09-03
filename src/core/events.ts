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
