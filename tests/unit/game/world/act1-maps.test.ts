/**
 * OF-033: карты Акта 1 (Гаражи, Плотина, Панели/Оголённая линия) —
 * «маршрут квестов проходим». Полноценного переключения карт в движке ещё
 * нет (`demo-scene.ts` грузит только `map.truba`, см. `docs/BACKLOG.md`
 * OF-033), поэтому критерий проверяется на уровне карты/коллизий — так же,
 * как `tests/unit/game/world/triggers.test.ts` и `hero-movement.spec.ts`
 * проверяют движок без полноценного e2e поверх рендера:
 *
 * 1. Каждый JSON проходит `MapSchema.parse` (форма данных).
 * 2. От точки спавна героя (`findSpawnPoint` — то же BFS, что использует
 *    `game/demo-scene.ts` при загрузке настоящей карты) до каждого NPC,
 *    триггера, спавна врага, точки лута и выхода существует путь по
 *    `layers.collision` (сплошная заливка, без стен) — то есть герой
 *    физически может дойти до всех ключевых точек квеста без разрывов.
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

/** Раунд позиции до ближайшей клетки сетки (входные точки — целые тайлы, но не полагаемся на это). */
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

describe('OF-033: карты Акта 1 — форма и проходимость маршрута квестов', () => {
  it('map.garazhi парсится по MapSchema', () => {
    expect(() => loadMap('garazhi.json')).not.toThrow();
  });

  it('map.plotina парсится по MapSchema', () => {
    expect(() => loadMap('plotina.json')).not.toThrow();
  });

  it('map.paneli парсится по MapSchema', () => {
    expect(() => loadMap('paneli.json')).not.toThrow();
  });

  it('Гаражи: все NPC (Гриня, Пересказчик, Дядя Гена, Палыч), триггер, лут и выход достижимы от спавна', () => {
    assertMapFullyReachable(loadMap('garazhi.json'));
  });

  it('Плотина: все NPC (Зоя, Модест, Клавдия), оба триггера (в т.ч. секрет шлюза), лут и выходы достижимы от спавна', () => {
    assertMapFullyReachable(loadMap('plotina.json'));
  });

  it('Панели/Оголённая линия: все NPC (Тётя Валя, Дядя Толя, Батя Кот, Тимофей Ржавый), спавны подлинейных, оба триггера сцен дерзости, лут и выход достижимы от спавна', () => {
    assertMapFullyReachable(loadMap('paneli.json'));
  });

  it('на всех трёх картах есть путь из спавна и на нелинейный обход, и на прямой маршрут (обе ветки в одной компоненте связности)', () => {
    // Косвенная проверка: раз все именованные точки (включая NPC по обе
    // стороны развилок — Гриня у прямого пути и Дядя Толя за обходной
    // веткой Гаражей; Модест у прямого пути и секрет шлюза за обходной
    // веткой Плотины; засада подлинейных на прямой тропе и Тимофей Ржавый
    // за южным обходом Панелей) лежат в одной компоненте связности из
    // спавна — обе ветки каждой развилки физически проходимы, не только
    // одна из них.
    for (const file of ['garazhi.json', 'plotina.json', 'paneli.json']) {
      assertMapFullyReachable(loadMap(file));
    }
  });
});
