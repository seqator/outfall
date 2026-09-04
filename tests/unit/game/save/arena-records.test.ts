/**
 * OF-039: `src/game/save/arena-records.ts` — рекорды Арены в localStorage-порт.
 * Раунд-трип, слияние метрик по `Math.max` («и/или» из критерия задачи),
 * ключ карта×модификаторы, деградация без падения на недоступном/битом
 * хранилище (задача прямо требует «try/catch, деградация без падения»).
 */

import { describe, expect, it } from 'vitest';
import { createArenaRecordsStore, type ArenaRecordEntry } from '../../../../src/game/save/arena-records';
import { createMemoryStorage } from '../../../../src/game/save/memory-storage';
import type { StorageLike } from '../../../../src/game/save/save-store';

/** `StorageLike`, который бросает на каждой операции — имитация недоступного `localStorage` (приватный режим/квота/sandboxed iframe). */
function createThrowingStorage(): StorageLike {
  return {
    getItem(): string | null {
      throw new DOMException('storage unavailable');
    },
    setItem(): void {
      throw new DOMException('QuotaExceededError');
    },
    removeItem(): void {
      throw new DOMException('storage unavailable');
    },
  };
}

describe('arena-records: раунд-трип', () => {
  it('getRecord() без предыдущих забегов — undefined', () => {
    const store = createArenaRecordsStore(createMemoryStorage());
    expect(store.getRecord('map.arena_1', [])).toBeUndefined();
  });

  it('recordRun() → getRecord() возвращает зафиксированный результат', () => {
    const store = createArenaRecordsStore(createMemoryStorage());
    store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 4, survivalMs: 90_000 });
    const record = store.getRecord('map.arena_1', []);
    expect(record?.bestWavesCleared).toBe(4);
    expect(record?.bestSurvivalMs).toBe(90_000);
  });

  it('второй забег лучше первого — обе метрики растут независимо (и/или)', () => {
    const store = createArenaRecordsStore(createMemoryStorage());
    store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 3, survivalMs: 60_000 });
    // Хуже по волнам, но лучше по времени выживания (например, дольше продержался на той же волне).
    store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 2, survivalMs: 120_000 });
    const record = store.getRecord('map.arena_1', []);
    expect(record?.bestWavesCleared).toBe(3); // не откатился назад
    expect(record?.bestSurvivalMs).toBe(120_000); // улучшился
  });

  it('худший забег не перезаписывает уже сохранённый рекорд', () => {
    const store = createArenaRecordsStore(createMemoryStorage());
    store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 6, survivalMs: 200_000 });
    store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 1, survivalMs: 10_000 });
    const record = store.getRecord('map.arena_1', []);
    expect(record?.bestWavesCleared).toBe(6);
    expect(record?.bestSurvivalMs).toBe(200_000);
  });

  it('load() отдаёт все рекорды разом', () => {
    const store = createArenaRecordsStore(createMemoryStorage());
    store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 5, survivalMs: 1000 });
    store.recordRun({ mapId: 'map.arena_2', modifiers: ['arena.mod.no_dash'], wavesCleared: 2, survivalMs: 500 });
    const all = store.load();
    expect(Object.keys(all).sort()).toEqual(['map.arena_1::none', 'map.arena_2::arena.mod.no_dash']);
  });
});

describe('arena-records: карта×модификаторы — отдельные слоты', () => {
  it('одна карта с разными модификаторами — независимые рекорды', () => {
    const store = createArenaRecordsStore(createMemoryStorage());
    store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 5, survivalMs: 1 });
    store.recordRun({
      mapId: 'map.arena_1',
      modifiers: ['arena.mod.knives_only'],
      wavesCleared: 2,
      survivalMs: 1,
    });
    expect(store.getRecord('map.arena_1', [])?.bestWavesCleared).toBe(5);
    expect(store.getRecord('map.arena_1', ['arena.mod.knives_only'])?.bestWavesCleared).toBe(2);
  });

  it('разные карты не делят рекорды', () => {
    const store = createArenaRecordsStore(createMemoryStorage());
    store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 9, survivalMs: 1 });
    expect(store.getRecord('map.arena_2', [])).toBeUndefined();
  });
});

describe('arena-records: персистентность через сериализацию (raw storage)', () => {
  it('рекорд читается новым экземпляром store поверх того же хранилища (имитация перезагрузки страницы)', () => {
    const storage = createMemoryStorage();
    createArenaRecordsStore(storage).recordRun({
      mapId: 'map.arena_3',
      modifiers: [],
      wavesCleared: 10,
      survivalMs: 555_000,
    });
    // Новый `createArenaRecordsStore` поверх того же `storage` — то, что
    // реально происходит при перезагрузке страницы (новый JS-контекст,
    // тот же `window.localStorage`).
    const reloaded = createArenaRecordsStore(storage);
    expect(reloaded.getRecord('map.arena_3', [])?.bestWavesCleared).toBe(10);
  });
});

describe('arena-records: деградация без падения на недоступном/битом storage', () => {
  it('getRecord()/load() на бросающем storage — не бросают, возвращают пусто', () => {
    const store = createArenaRecordsStore(createThrowingStorage());
    expect(() => store.getRecord('map.arena_1', [])).not.toThrow();
    expect(store.getRecord('map.arena_1', [])).toBeUndefined();
    expect(store.load()).toEqual({});
  });

  it('recordRun() на бросающем storage — не бросает, отдаёт посчитанный результат (просто не сохранится)', () => {
    const store = createArenaRecordsStore(createThrowingStorage());
    let result: ArenaRecordEntry | undefined;
    expect(() => {
      result = store.recordRun({ mapId: 'map.arena_1', modifiers: [], wavesCleared: 3, survivalMs: 1000 });
    }).not.toThrow();
    expect(result?.bestWavesCleared).toBe(3);
    expect(result?.bestSurvivalMs).toBe(1000);
    expect(typeof result?.achievedAtMs).toBe('number');
  });

  it('битый JSON под ключом рекордов — деградация до "рекордов нет", не падение', () => {
    const storage = createMemoryStorage();
    storage.setItem('outfall:arena-records:v1', '{ не json');
    const store = createArenaRecordsStore(storage);
    expect(() => store.getRecord('map.arena_1', [])).not.toThrow();
    expect(store.getRecord('map.arena_1', [])).toBeUndefined();
  });

  it('JSON, не проходящий схему (например, отрицательное число волн) — деградация, не падение', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'outfall:arena-records:v1',
      JSON.stringify({ 'map.arena_1::none': { bestWavesCleared: -1, bestSurvivalMs: 0, achievedAtMs: 0 } }),
    );
    const store = createArenaRecordsStore(storage);
    expect(store.getRecord('map.arena_1', [])).toBeUndefined();
  });
});
