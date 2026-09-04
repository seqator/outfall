/**
 * Рекорды Арены (OF-039): лучшая пройденная волна и лучшее время выживания
 * на карту × комбинацию модификаторов, персистентно в `localStorage` — тот
 * же приём, что `SaveStore` (`save-store.ts`, `StorageLike`-порт вместо
 * прямой зависимости от глобала, чтобы модуль тестировался в Node без DOM,
 * `vitest.config.ts`: `environment: 'node'`).
 *
 * Отдельный ключ/формат от `SaveState` (не то же самое, что прогресс
 * кампании — рекорды Арены не привязаны к герою одного забега кампании и не
 * должны сбрасываться вместе с ним) — собственная маленькая zod-схема и
 * собственный ключ `outfall:arena-records:v1`.
 *
 * Требование задачи «обработай кейс недоступности storage (try/catch,
 * деградация без падения)»: в отличие от `SaveStore` (бросает
 * `SaveSlotTooLargeError`/парсит и даёт вызывающей стороне решать), здесь
 * методы `load()`/`recordRun()` не бросают вообще — рекорды строго
 * вспомогательная фича экрана меню Арены, потеря записи из-за недоступного
 * `localStorage` (приватный режим браузера, квота, битый JSON) не должна
 * ронять ни экран меню, ни сам забег. `getItem`/`setItem`/`JSON.parse` —
 * единственные точки, где `StorageLike` реально может бросить.
 */

import { z } from 'zod';
import type { ArenaModifierId } from '../world/arena';
import { arenaRecordKey } from '../world/arena';
import type { StorageLike } from './save-store';

const ARENA_RECORDS_KEY = 'outfall:arena-records:v1';

const ArenaRecordEntrySchema = z.object({
  bestWavesCleared: z.number().int().nonnegative(),
  bestSurvivalMs: z.number().nonnegative(),
  /** `Date.now()` последнего забега, улучшившего хотя бы одну из метрик — только для будущего UI, не участвует в сравнении. */
  achievedAtMs: z.number().nonnegative(),
});
export type ArenaRecordEntry = z.infer<typeof ArenaRecordEntrySchema>;

const ArenaRecordsStateSchema = z.record(z.string(), ArenaRecordEntrySchema);
export type ArenaRecordsState = Readonly<Record<string, ArenaRecordEntry>>;

export interface ArenaRunResult {
  readonly mapId: string;
  readonly modifiers: readonly ArenaModifierId[];
  /** Число волн, зачищенных полностью (все заспавненные враги мертвы) — не номер текущей/незачищенной волны. */
  readonly wavesCleared: number;
  readonly survivalMs: number;
}

export interface ArenaRecordsStore {
  /** Все рекорды разом — `{}` на пустом/недоступном хранилище, никогда не бросает. */
  load(): ArenaRecordsState;
  /** Рекорд для конкретной карты×модификаторов, `undefined` если забегов ещё не было. */
  getRecord(mapId: string, modifiers: readonly ArenaModifierId[]): ArenaRecordEntry | undefined;
  /** Фиксирует результат забега: каждая метрика (волны/время) обновляется независимо, только если результат лучше уже сохранённого (`Math.max`) — «и/или» из критерия задачи. Возвращает актуальную запись после слияния. */
  recordRun(result: ArenaRunResult): ArenaRecordEntry;
}

function safeLoad(storage: StorageLike): ArenaRecordsState {
  try {
    const raw = storage.getItem(ARENA_RECORDS_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    const result = ArenaRecordsStateSchema.safeParse(parsed);
    return result.success ? result.data : {};
  } catch {
    // `localStorage` недоступен (приватный режим Safari, sandboxed iframe,
    // квота) или сохранённый JSON битый — деградация до «рекордов нет»,
    // не падение экрана/забега.
    return {};
  }
}

function safeSave(storage: StorageLike, state: ArenaRecordsState): void {
  try {
    storage.setItem(ARENA_RECORDS_KEY, JSON.stringify(state));
  } catch {
    // Запись не удалась (квота/недоступность) — забег всё равно должен
    // продолжаться, рекорд просто не сохранится в этот раз.
  }
}

export function createArenaRecordsStore(storage: StorageLike): ArenaRecordsStore {
  return {
    load(): ArenaRecordsState {
      return safeLoad(storage);
    },

    getRecord(mapId, modifiers): ArenaRecordEntry | undefined {
      return safeLoad(storage)[arenaRecordKey(mapId, modifiers)];
    },

    recordRun(result): ArenaRecordEntry {
      const state = safeLoad(storage);
      const key = arenaRecordKey(result.mapId, result.modifiers);
      const previous = state[key];
      const next: ArenaRecordEntry = {
        bestWavesCleared: Math.max(previous?.bestWavesCleared ?? 0, result.wavesCleared),
        bestSurvivalMs: Math.max(previous?.bestSurvivalMs ?? 0, result.survivalMs),
        achievedAtMs: Date.now(),
      };
      safeSave(storage, { ...state, [key]: next });
      return next;
    },
  };
}
