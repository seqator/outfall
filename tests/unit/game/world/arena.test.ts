/**
 * OF-039 («Арена») — чистая волновая логика/модификаторы/форматирование,
 * без ECS/DOM (тот же стиль, что `tests/unit/game/world/endings.test.ts`).
 * Волновая кривая проверяется дважды: синтетическими фикстурами (границы
 * формулы) и реальными данными трёх карт (`public/data/maps/arena_*.json`,
 * тот же приём, что `act1-maps.test.ts`) — так регрессия ловится, даже если
 * level-designer когда-нибудь поменяет размер тира на одной из карт.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInputSnapshot } from '../../../../src/core/input';
import { MapSchema, type EnemySpawn, type GameMap } from '../../../../src/data/schemas';
import {
  applyArenaModifiersToInput,
  ARENA_MAP_IDS,
  ARENA_MAPS,
  ARENA_MODIFIERS,
  ARENA_WAVE_COUNT,
  arenaRecordKey,
  formatArenaSurvival,
  groupSpawnsByTier,
  isArenaMapId,
  selectWaveSpawns,
  tierOfSpawnId,
  waveTier,
} from '../../../../src/game/world/arena';

const MAPS_DIR = join(__dirname, '../../../../public/data/maps');

function loadMap(fileName: string): GameMap {
  const raw: unknown = JSON.parse(readFileSync(join(MAPS_DIR, fileName), 'utf-8'));
  return MapSchema.parse(raw);
}

function spawn(id: string, enemyId = 'enemy.raki'): EnemySpawn {
  return { id, enemyId, position: { x: 0, y: 0 }, count: 1 };
}

describe('world/arena: id карт', () => {
  it('isArenaMapId узнаёт только три канонические карты', () => {
    for (const id of ARENA_MAP_IDS) expect(isArenaMapId(id)).toBe(true);
    expect(isArenaMapId('map.truba')).toBe(false);
    expect(isArenaMapId('map.arena_4')).toBe(false);
  });

  it('ARENA_MAPS содержит ровно 3 карты с теми же id, что ARENA_MAP_IDS', () => {
    expect(ARENA_MAPS.map((m) => m.id).sort()).toEqual([...ARENA_MAP_IDS].sort());
  });
});

describe('world/arena: tierOfSpawnId/waveTier', () => {
  it('парсит суффикс _tN_ из id точки спавна', () => {
    expect(tierOfSpawnId('spawn_yama_t1_a')).toBe(1);
    expect(tierOfSpawnId('spawn_dvor_t2_turret_w')).toBe(2);
    expect(tierOfSpawnId('spawn_razliv_t3_turret_e')).toBe(3);
    expect(tierOfSpawnId('spawn_razliv_t4_escort_a')).toBe(4);
  });

  it('id без числового суффикса (spawn_razliv_boss) — тир 4, капстоун', () => {
    expect(tierOfSpawnId('spawn_razliv_boss')).toBe(4);
  });

  it('waveTier — волны 1-3/4-6/7-9/10 по таблице §0.2 08-arena.md', () => {
    expect([1, 2, 3].map(waveTier)).toEqual([1, 1, 1]);
    expect([4, 5, 6].map(waveTier)).toEqual([2, 2, 2]);
    expect([7, 8, 9].map(waveTier)).toEqual([3, 3, 3]);
    expect(waveTier(10)).toBe(4);
  });

  it('groupSpawnsByTier сохраняет исходный порядок пула внутри тира', () => {
    const spawns = [spawn('spawn_x_t1_b'), spawn('spawn_x_t1_a'), spawn('spawn_x_t2_a')];
    const groups = groupSpawnsByTier(spawns);
    expect(groups[1].map((s) => s.id)).toEqual(['spawn_x_t1_b', 'spawn_x_t1_a']);
    expect(groups[2].map((s) => s.id)).toEqual(['spawn_x_t2_a']);
    expect(groups[3]).toEqual([]);
    expect(groups[4]).toEqual([]);
  });
});

describe('world/arena: selectWaveSpawns — синтетический пул', () => {
  const pool = [
    spawn('spawn_x_t1_a'),
    spawn('spawn_x_t1_b'),
    spawn('spawn_x_t1_c'),
    spawn('spawn_x_t1_d'),
    spawn('spawn_x_t2_a'),
    spawn('spawn_x_t2_b'),
    spawn('spawn_x_t2_c'),
    spawn('spawn_x_t4_a'),
    spawn('spawn_x_t4_b'),
  ];

  it('волна вне диапазона 1-10 — пустой список', () => {
    expect(selectWaveSpawns(pool, 0)).toEqual([]);
    expect(selectWaveSpawns(pool, 11)).toEqual([]);
    expect(selectWaveSpawns(pool, -1)).toEqual([]);
  });

  it('число врагов растёт внутри тира (2 → 3 → 4), первые точки пула по порядку', () => {
    expect(selectWaveSpawns(pool, 1).map((s) => s.id)).toEqual(['spawn_x_t1_a', 'spawn_x_t1_b']);
    expect(selectWaveSpawns(pool, 2).map((s) => s.id)).toEqual([
      'spawn_x_t1_a',
      'spawn_x_t1_b',
      'spawn_x_t1_c',
    ]);
    expect(selectWaveSpawns(pool, 3).map((s) => s.id)).toEqual([
      'spawn_x_t1_a',
      'spawn_x_t1_b',
      'spawn_x_t1_c',
      'spawn_x_t1_d',
    ]);
  });

  it('пул тира меньше желаемого числа — берёт весь пул, не падает и не дублирует', () => {
    // T2-пул этой фикстуры — 3 точки; волна 6 (позиция 2 внутри тира) хочет 4.
    expect(selectWaveSpawns(pool, 6).map((s) => s.id)).toEqual([
      'spawn_x_t2_a',
      'spawn_x_t2_b',
      'spawn_x_t2_c',
    ]);
  });

  it('волна 10 — весь пул T4 разом (капстоун), не подмножество', () => {
    expect(selectWaveSpawns(pool, 10).map((s) => s.id)).toEqual(['spawn_x_t4_a', 'spawn_x_t4_b']);
  });

  it('пустой тир (нет точек) — пустой список, не бросает', () => {
    const onlyT1 = [spawn('spawn_x_t1_a'), spawn('spawn_x_t1_b')];
    expect(selectWaveSpawns(onlyT1, 5)).toEqual([]); // T2 пуст
    expect(selectWaveSpawns(onlyT1, 10)).toEqual([]); // T4 пуст
  });
});

describe('world/arena: selectWaveSpawns — реальные карты (public/data/maps/arena_*.json)', () => {
  const fixtures: ReadonlyArray<{ file: string; t4PoolSize: number }> = [
    { file: 'arena_1.json', t4PoolSize: 6 }, // «Яма» — без босса, плотный рой T4 (§1.5 08-arena.md)
    { file: 'arena_2.json', t4PoolSize: 5 }, // «Двор»
    { file: 'arena_3.json', t4PoolSize: 3 }, // «Разлив» — босс + 2 эскорта
  ];

  for (const { file, t4PoolSize } of fixtures) {
    it(`${file}: все 10 волн дают хотя бы одного врага, волна 10 — весь пул T4 (${t4PoolSize})`, () => {
      const map = loadMap(file);
      for (let wave = 1; wave <= ARENA_WAVE_COUNT; wave++) {
        const picks = selectWaveSpawns(map.enemySpawns, wave);
        expect(picks.length, `волна ${wave}`).toBeGreaterThan(0);
      }
      expect(selectWaveSpawns(map.enemySpawns, 10)).toHaveLength(t4PoolSize);
    });

    it(`${file}: волны внутри одного тира не убывают числом врагов`, () => {
      const map = loadMap(file);
      const counts = Array.from({ length: 9 }, (_, i) => selectWaveSpawns(map.enemySpawns, i + 1).length);
      for (let i = 1; i < counts.length; i++) {
        // Переход между тирами (волна 3→4, 6→7, …) не обязан расти — там уже
        // пул другого тира; внутри одного тира (1-3, 4-6, 7-9) — обязан.
        const sameTier = waveTier(i + 1) === waveTier(i);
        if (sameTier) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1] as number);
      }
    });
  }
});

describe('world/arena: applyArenaModifiersToInput', () => {
  it('без модификаторов возвращает тот же объект (без лишней аллокации)', () => {
    const snapshot = createInputSnapshot({ pressed: new Set(['dash']) });
    expect(applyArenaModifiersToInput(snapshot, [])).toBe(snapshot);
  });

  it('«без рывка» вырезает dash из pressed и held, не трогает остальное', () => {
    const snapshot = createInputSnapshot({
      pressed: new Set(['dash', 'attack']),
      held: new Set(['dash', 'attack']),
    });
    const filtered = applyArenaModifiersToInput(snapshot, ['arena.mod.no_dash']);
    expect([...filtered.pressed]).toEqual(['attack']);
    expect([...filtered.held]).toEqual(['attack']);
  });

  it('«только ножи» вырезает slot1/slot2 из pressed, held не трогает', () => {
    const snapshot = createInputSnapshot({
      pressed: new Set(['slot1', 'slot2', 'slot3', 'attack']),
      held: new Set(['slot1']),
    });
    const filtered = applyArenaModifiersToInput(snapshot, ['arena.mod.knives_only']);
    expect([...filtered.pressed].sort()).toEqual(['attack', 'slot3']);
    expect([...filtered.held]).toEqual(['slot1']);
  });

  it('оба модификатора применяются одновременно', () => {
    const snapshot = createInputSnapshot({ pressed: new Set(['dash', 'slot1', 'attack']) });
    const filtered = applyArenaModifiersToInput(snapshot, ['arena.mod.no_dash', 'arena.mod.knives_only']);
    expect([...filtered.pressed]).toEqual(['attack']);
  });

  it('исходный snapshot не мутируется', () => {
    const original = createInputSnapshot({ pressed: new Set(['dash']) });
    applyArenaModifiersToInput(original, ['arena.mod.no_dash']);
    expect([...original.pressed]).toEqual(['dash']);
  });
});

describe('world/arena: arenaRecordKey/formatArenaSurvival', () => {
  it('ключ не зависит от порядка модификаторов на входе', () => {
    expect(arenaRecordKey('map.arena_1', ['arena.mod.knives_only', 'arena.mod.no_dash'])).toBe(
      arenaRecordKey('map.arena_1', ['arena.mod.no_dash', 'arena.mod.knives_only']),
    );
  });

  it('без модификаторов — суффикс "none", разный от карт с модификаторами', () => {
    const withoutMods = arenaRecordKey('map.arena_1', []);
    const withMods = arenaRecordKey('map.arena_1', ['arena.mod.no_dash']);
    expect(withoutMods).toBe('map.arena_1::none');
    expect(withoutMods).not.toBe(withMods);
  });

  it('formatArenaSurvival — мм:сс с ведущим нулём секунд', () => {
    expect(formatArenaSurvival(0)).toBe('0:00');
    expect(formatArenaSurvival(5_000)).toBe('0:05');
    expect(formatArenaSurvival(65_000)).toBe('1:05');
    expect(formatArenaSurvival(-100)).toBe('0:00'); // защита от отрицательного дрейфа таймеров
  });
});

describe('world/arena: ARENA_MODIFIERS', () => {
  it('ровно два канонических модификатора концепта — «без рывка», «только ножи»', () => {
    expect(ARENA_MODIFIERS.map((m) => m.id)).toEqual(['arena.mod.no_dash', 'arena.mod.knives_only']);
  });
});
