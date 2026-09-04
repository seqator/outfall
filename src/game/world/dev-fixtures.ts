/**
 * Тестовая карта для вертикального среза OF-015: комната 64×64 с внешними
 * стенами по периметру и парой внутренних препятствий — достаточно, чтобы
 * доказать загрузчик карты, коллизии по сетке и камеру на живом герое, пока
 * настоящая карта «Труба» (`docs/levels/01-truba.md`, задача OF-025) ещё не
 * переведена в JSON-контент. Строится в коде, а не хранится как JSON в
 * `public/data/maps/` — это не игровой контент, а тестовая фикстура (сама
 * форма совпадает с `GameMap`, но `id`/`tileset` намеренно помечены `dev.*`,
 * чтобы не спутать с настоящими картами при поиске по `public/data`).
 */

import type { GameMap } from '../../data/schemas';

const SIZE = 64;

function buildLayers(): GameMap['layers'] {
  const cells = SIZE * SIZE;
  const ground = new Array<number>(cells).fill(0);
  const collision = new Array<0 | 1>(cells).fill(0);

  const setWall = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    collision[y * SIZE + x] = 1;
  };

  // Периметр.
  for (let x = 0; x < SIZE; x++) {
    setWall(x, 0);
    setWall(x, SIZE - 1);
  }
  for (let y = 0; y < SIZE; y++) {
    setWall(0, y);
    setWall(SIZE - 1, y);
  }

  // Перегородка с проходом посередине карты — проверяет и блокировку, и
  // «скольжение» вдоль стены (движение по одной оси не должно вставать
  // колом, если заблокирована только другая).
  for (let x = 16; x < 48; x++) {
    if (x === 31 || x === 32) continue; // проход
    setWall(x, 32);
  }

  // Небольшой изолированный столб — одиночное препятствие для обхода.
  for (let y = 10; y < 14; y++) {
    setWall(20, y);
    setWall(21, y);
  }

  const walls = collision.map((c) => (c === 1 ? 1 : 0));
  return { ground, walls, collision };
}

/** `GameMap` без прохода через zod (это код, не внешние данные) — форма гарантирована типом. */
export function createDevTestMap(): GameMap {
  return {
    id: 'dev.test-room-64',
    nameKey: 'dev.test-room-64.name',
    width: SIZE,
    height: SIZE,
    tileset: 'dev',
    layers: buildLayers(),
    npcs: [],
    enemySpawns: [],
    itemPickups: [],
    triggers: [],
    exits: [],
  };
}
