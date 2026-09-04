/**
 * OF-037: карты Актов 2–3 (Санаторий «Волна», НИИ «Биосток», Труба-финал —
 * `map.sanatoriy` / `map.nii` / `map.truba_final`) — форма данных,
 * проходимость маршрута квестов и граф переходов `exits[]` со связью в уже
 * существующую сеть карт Акта 1 (`map.plotina` → Санаторий/Труба-финал,
 * `map.paneli` → НИИ).
 *
 * Метод проверки — тот же, что и `act1-maps.test.ts` (OF-033): полноценного
 * переключения карт в движке ещё нет (`game/demo-scene.ts` грузит только
 * `map.truba`), поэтому «e2e» здесь означает проверку данных — форму
 * (`MapSchema.parse`) и физическую достижимость (BFS по `layers.collision`
 * от точки спавна, та же логика, что `findSpawnPoint`) всех NPC, спавнов
 * врагов, лута, триггеров и выходов.
 *
 * Трактовка «финал проходим всеми 4 сторонами» (`flag.storona` —
 * `progress2` / `energosbyt` / `chistye` / `neytralitet`, `main-quest.md`
 * §0.2/§2 Q5): полноценного переключения NPC по игровому флагу в движке
 * нет (там же ограничение, что и `flag.rodion` в `03-plotina.md` §7).
 * Трактовка level-designer, по прецеденту OF-033: карта `map.truba_final`
 * физически размещает и делает достижимым НPC-представителя каждой из трёх
 * фракционных сторон (`npc.palych_final`/`npc.grinya_final` — Прогресс-2 в
 * двух исходах `flag.palych_ubit`, `npc.zoya_final` — Энергосбыт,
 * `npc.doctor_solomin_final` — Чистые) плюс опционального Веденеева
 * (`npc.vedeneev_final`); исход `neytralitet` не требует отдельного NPC (по
 * `main-quest.md` §2 Q6 герой действует один) и уже покрыт тем, что сама
 * арена и выход достижимы без каких-либо NPC. Реальное условное появление
 * ровно одного NPC по значению `flag.storona` — задача, зависящая от
 * будущей системы диалогов Акта 3 (OF-036) и переключения карт
 * (gameplay-programmer), вне скоупа OF-037.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MapSchema, type GameMap, type Vector2 } from '../../../../src/data/schemas';
import { findSpawnPoint } from '../../../../src/game/world/map-loader';

const MAPS_DIR = join(__dirname, '../../../../public/data/maps');

function loadMap(fileName: string): GameMap {
  const raw: unknown = JSON.parse(readFileSync(join(MAPS_DIR, fileName), 'utf-8'));
  return MapSchema.parse(raw);
}

/** BFS по `layers.collision` (0 — проходимо) — множество клеток, достижимых из `start`. */
function reachableCells(map: GameMap, start: Vector2): Set<string> {
  const isFree = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    return map.layers.collision[y * map.width + x] === 0;
  };
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const visited = new Set<string>();
  if (!isFree(sx, sy)) return visited;
  visited.add(`${sx},${sy}`);
  const queue: Array<[number, number]> = [[sx, sy]];
  const deltas: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (queue.length > 0) {
    const [x, y] = queue.shift() as [number, number];
    for (const [dx, dy] of deltas) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (!isFree(nx, ny)) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return visited;
}

function cellKey(v: Vector2): string {
  return `${Math.floor(v.x)},${Math.floor(v.y)}`;
}

function assertMapFullyReachable(map: GameMap): void {
  const spawn = findSpawnPoint(map);
  const reached = reachableCells(map, spawn);

  const points: Array<{ label: string; pos: Vector2 }> = [
    ...map.npcs.map((n) => ({ label: `npc "${n.id}"`, pos: n.position })),
    ...map.enemySpawns.map((s) => ({ label: `enemySpawn "${s.id}"`, pos: s.position })),
    ...map.itemPickups.map((p) => ({ label: `itemPickup "${p.id}"`, pos: p.position })),
    ...map.triggers.map((t) => ({ label: `trigger "${t.id}"`, pos: t.position })),
    ...map.exits.map((e) => ({ label: `exit "${e.id}"`, pos: e.position })),
  ];

  const unreachable = points.filter((p) => !reached.has(cellKey(p.pos)));
  expect(
    unreachable,
    `недостижимые точки от спавна (${spawn.x},${spawn.y}) на карте "${map.id}": ${unreachable
      .map((p) => `${p.label} @ (${p.pos.x},${p.pos.y})`)
      .join(', ')}`,
  ).toEqual([]);
}

describe('OF-037: карты Актов 2–3 — форма и проходимость маршрута квестов', () => {
  it('map.sanatoriy парсится по MapSchema', () => {
    expect(() => loadMap('sanatoriy.json')).not.toThrow();
  });

  it('map.nii парсится по MapSchema', () => {
    expect(() => loadMap('nii.json')).not.toThrow();
  });

  it('map.truba_final парсится по MapSchema', () => {
    expect(() => loadMap('truba_final.json')).not.toThrow();
  });

  it('Санаторий: Доктор Соломин, Сестра Люба, Дед Фрол, спавны крыс, оба чекпойнт-триггера, секрет колодцев, лут и выход достижимы от спавна', () => {
    assertMapFullyReachable(loadMap('sanatoriy.json'));
  });

  it('НИИ: Веденеев, Юрий Слепцов, оба спавна автоматов НИИ, триггеры архива/пасхалки-плоттера, лут и выход достижимы от спавна', () => {
    assertMapFullyReachable(loadMap('nii.json'));
  });

  it('Труба-финал: все 5 NPC финальной сцены (Палыч/Гриня/Зоя/Соломин/Веденеев), босс-задвижка, лут, оба триггера и выход достижимы от спавна', () => {
    assertMapFullyReachable(loadMap('truba_final.json'));
  });

  it('на Санатории и НИИ есть путь и на прямой чекпойнт-маршрут, и на обходную ветку (сад/дюкт) — обе стороны развилки в одной компоненте связности', () => {
    // Санаторий: Сестра Люба (чекпойнт КПП) и Дед Фрол/секрет колодцев (садовый
    // обход) лежат по разные стороны развилки; НИИ: оба автомата в
    // охраняемом коридоре A и Веденеев/Юрий за обходным дюктом E — все они
    // уже проверены выше через assertMapFullyReachable, здесь фиксируем
    // намерение теста явно (как в act1-maps.test.ts).
    assertMapFullyReachable(loadMap('sanatoriy.json'));
    assertMapFullyReachable(loadMap('nii.json'));
  });

  it('Труба-финал: физически размещены и достижимы NPC для всех 4 исходов flag.storona (Прогресс-2 — Палыч живой ИЛИ Гриня; Энергосбыт — Зоя; Чистые — Соломин; нейтралитет — не требует NPC, площадка и босс достижимы и без них)', () => {
    const map = loadMap('truba_final.json');
    const spawn = findSpawnPoint(map);
    const reached = reachableCells(map, spawn);
    const npcById = new Map(map.npcs.map((n) => [n.id, n]));

    const progress2Candidates = ['npc.palych_final', 'npc.grinya_final'];
    const hasProgress2Rep = progress2Candidates.some((id) => {
      const npc = npcById.get(id);
      return npc !== undefined && reached.has(cellKey(npc.position));
    });
    expect(hasProgress2Rep, 'ни Палыч, ни Гриня не размещены/не достижимы для storona=progress2').toBe(true);

    const energosbytNpc = npcById.get('npc.zoya_final');
    expect(energosbytNpc, 'npc.zoya_final не размещён на карте').toBeDefined();
    expect(reached.has(cellKey(energosbytNpc!.position)), 'npc.zoya_final недостижим для storona=energosbyt').toBe(
      true,
    );

    const chistyeNpc = npcById.get('npc.doctor_solomin_final');
    expect(chistyeNpc, 'npc.doctor_solomin_final не размещён на карте').toBeDefined();
    expect(
      reached.has(cellKey(chistyeNpc!.position)),
      'npc.doctor_solomin_final недостижим для storona=chistye',
    ).toBe(true);

    // neytralitet: герой действует один (main-quest.md §2 Q6) — критерий
    // здесь просто в том, что сама арена (спавн босса) и выход достижимы
    // без каких-либо условных NPC — уже гарантировано assertMapFullyReachable
    // выше, но проверим явно для этого теста.
    const boss = map.enemySpawns.find((s) => s.id === 'spawn_boss_zadvizhka');
    expect(boss, 'spawn_boss_zadvizhka не размещён на карте').toBeDefined();
    expect(reached.has(cellKey(boss!.position)), 'арена босса недостижима — неверно и для neytralitet').toBe(true);
  });
});

describe('OF-037: граф переходов — Санаторий/НИИ/Труба-финал не острова', () => {
  it('map.plotina получил рёбра на map.sanatoriy и map.truba_final, не потеряв старые рёбра Акта 1', () => {
    const plotina = loadMap('plotina.json');
    const toMaps = plotina.exits.map((e) => e.toMap);
    expect(toMaps).toEqual(
      expect.arrayContaining(['map.garazhi', 'map.paneli', 'map.truba', 'map.sanatoriy', 'map.truba_final']),
    );
  });

  it('map.paneli получил ребро на map.nii, не потеряв старое ребро на map.plotina', () => {
    const paneli = loadMap('paneli.json');
    const toMaps = paneli.exits.map((e) => e.toMap);
    expect(toMaps).toEqual(expect.arrayContaining(['map.plotina', 'map.nii']));
  });

  it('map.sanatoriy/map.nii/map.truba_final ведут обратно в связанную сеть (не тупиковые острова)', () => {
    expect(loadMap('sanatoriy.json').exits.map((e) => e.toMap)).toContain('map.plotina');
    expect(loadMap('nii.json').exits.map((e) => e.toMap)).toContain('map.paneli');
    expect(loadMap('truba_final.json').exits.map((e) => e.toMap)).toContain('map.plotina');
  });
});
