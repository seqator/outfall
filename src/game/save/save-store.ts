/**
 * `SaveStore` (OF-019, `docs/tech/architecture.md` §8): localStorage-слот +
 * экспорт/импорт файлом. Ключ слота включает версию схемы
 * (`outfall:save:v<N>`) — так рядом может существовать сейв предыдущего
 * релиза (другой ключ), и `load()` подхватывает его через `migrations.ts`,
 * не перетирая молча более старым/новым форматом.
 *
 * `StorageLike` — минимальный порт над `Storage` (`localStorage`), а не
 * прямая зависимость от глобала: `game` слою можно трогать `localStorage`
 * (граница `no-restricted-globals` в `eslint.config.js` действует только на
 * `core`/`sim`), но инъекция хранилища держит модуль чистым и тестируемым
 * без реального DOM (`vitest.config.ts`: `environment: 'node'`).
 */

import { migrateToLatestSave, SaveDataError } from './migrations';
import { CURRENT_SAVE_SCHEMA_VERSION, SaveStateSchema, type SaveState } from './save-schema';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Слот сохранения ≤ 200 KB (критерий OF-019) — «не сериализовывать весь мир» достаточно, чтобы уложиться с большим запасом. */
export const SAVE_SLOT_MAX_BYTES = 200 * 1024;

const SAVE_KEY_PREFIX = 'outfall:save:v';

function saveKeyForVersion(version: number): string {
  return `${SAVE_KEY_PREFIX}${version}`;
}

/**
 * Версии форматов, под ключами которых `load()` ищет сейв — от новой к
 * старой, чтобы не подхватить случайно совсем древний формат раньше
 * актуального. Включает текущую версию (`CURRENT_SAVE_SCHEMA_VERSION`) саму
 * по себе — иначе `load()` не находил бы только что записанный `save()`
 * сейв под его собственным ключом (напр. OF-059: версия схемы стала 3,
 * список версий обязан расти вместе с ней, а не оставаться зашитым на
 * момент, когда «текущая» версия случайно совпадала с числом в списке).
 */
const KNOWN_SAVE_VERSIONS: readonly number[] = [CURRENT_SAVE_SCHEMA_VERSION, 2, 1];

export class SaveSlotTooLargeError extends Error {
  constructor(
    readonly bytes: number,
    readonly limitBytes: number,
  ) {
    super(`Сейв весит ${bytes} байт — больше лимита слота ${limitBytes} байт`);
  }
}

export interface SaveStore {
  /** Пишет сейв в localStorage под ключом текущей версии схемы. Бросает `SaveSlotTooLargeError`, если сериализованный слот превышает `SAVE_SLOT_MAX_BYTES`. */
  save(state: SaveState): void;
  /** Читает сейв из localStorage (текущая версия, затем — известные более старые ключи) и мигрирует его до актуальной версии. `null`, если сохранений нет вовсе. */
  load(): SaveState | null;
  /** Сериализует `state` в текст для скачивания файлом — не читает localStorage, чистая функция от переданного состояния. */
  exportToFile(state: SaveState): string;
  /** Разбирает текст файла сейва (`exportToFile`/ручной экспорт другой версии), валидирует и мигрирует до актуальной версии. Бросает `SaveDataError` на битом JSON/формате — не пишет в localStorage сама, вызывающая сторона решает, звать ли следом `save()`. */
  importFromFile(text: string): SaveState;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function serialize(state: SaveState): string {
  const validated = SaveStateSchema.parse(state);
  return JSON.stringify(validated);
}

export function createSaveStore(storage: StorageLike): SaveStore {
  return {
    save(state: SaveState): void {
      const text = serialize(state);
      const bytes = byteLength(text);
      if (bytes > SAVE_SLOT_MAX_BYTES) {
        throw new SaveSlotTooLargeError(bytes, SAVE_SLOT_MAX_BYTES);
      }
      storage.setItem(saveKeyForVersion(CURRENT_SAVE_SCHEMA_VERSION), text);
    },

    load(): SaveState | null {
      for (const version of KNOWN_SAVE_VERSIONS) {
        const raw = storage.getItem(saveKeyForVersion(version));
        if (raw === null) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new SaveDataError(`Сейв под ключом "${saveKeyForVersion(version)}" — не JSON`);
        }
        return migrateToLatestSave(parsed);
      }
      return null;
    },

    exportToFile(state: SaveState): string {
      return JSON.stringify(SaveStateSchema.parse(state), null, 2);
    },

    importFromFile(text: string): SaveState {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new SaveDataError('Импорт сейва: файл не является валидным JSON');
      }
      return migrateToLatestSave(raw);
    },
  };
}
