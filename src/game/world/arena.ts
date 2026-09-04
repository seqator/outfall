/**
 * Режим «Арена» (OF-039, вторая половина — код; карты/пул спавнов уже
 * готовы, `public/data/maps/arena_{1,2,3}.json`, `docs/levels/08-arena.md`).
 * Чистая логика без ECS/DOM (тот же стиль, что `world/endings.ts`/
 * `world/triggers.ts`) — волновая кривая и фильтр ввода модификаторов;
 * привязка к живому `World`/циклу — `game/demo-scene.ts`.
 *
 * ## Волновая кривая (§0.2 `08-arena.md`)
 *
 * `MapSchema.enemySpawns[]` — плоский пул точек, размеченный суффиксом id на
 * 4 яруса сложности (T1 `_t1_*` → волны 1–3, T2 `_t2_*` → 4–6, T3 `_t3_*` →
 * 7–9, T4 `_t4_*`/`_boss` → волна 10, капстоун). Документ прямо оставляет
 * точную кривую 10 волн на усмотрение gameplay-programmer («будущая система
 * волн вольна брать из яруса не всё сразу»). Решение здесь:
 *  - Волны 1–9: тир волны = `waveTier(wave)`, число врагов растёт внутри
 *    тира (`2 + позиция`, волна 1/4/7 → 2 врага, волна 3/6/9 → 4), точки
 *    берутся с начала пула тира в порядке `enemySpawns[]` карты
 *    (детерминированно — тот же забег даёт тот же порядок спавна).
 *  - Волна 10: весь пул T4 разом — «капстоун», буквально формулировка
 *    документа для всех трёх карт («самая плотная волна или босс»,
 *    `spawn_razliv_boss` + оба эскорта на «Разливе», 6 точек на «Яме», 5 на
 *    «Дворе»). Не примешивает T1–T3 намеренно — на «Разливе» это финальный
 *    бой с Боссом-задвижкой, документ описывает его как расчищенную арену
 *    для читаемого AoE, не свалку из турелей прошлых ярусов.
 *
 * ## Модификаторы (§0.4 `08-arena.md`, `docs/OUTFALL-CONCEPT.md` §5)
 *
 * Ровно два, канонически названные в концепте — не изобретаются заново:
 * «без рывка» и «только ножи». Оба — «правила, применяемые к самому игроку
 * (блокировка ввода/оружия), не к геометрии карты» (`08-arena.md` §0.4)
 * — реализованы здесь как чистая трансформация `InputSnapshot` до того, как
 * он попадёт в `sim` (`applyArenaModifiersToInput`), без единой правки
 * `sim/**`: `sim` не знает о существовании Арены вообще.
 *
 * ДОПУЩЕНИЕ: «только ножи» маппится на «Кран» (`item.wrench_kran`,
 * `WeaponBranch: 'fists'`) — единственное оружие ветки ближнего боя в этом
 * срезе (`sim/formulas/weapons.ts`: нож «Стропорез» из `combat.md` §3 ещё не
 * реализован, докстринг файла помечает его «позже», OF-035/OF-016 report).
 * Блокируется переключение на дальнобойное оружие (`slot1`/`slot2`), герой
 * стартует забег уже с экипированным «Краном» (`demo-scene.ts`).
 */

import type { InputSnapshot } from '../../core/input';
import type { EnemySpawn } from '../../data/schemas';

// ---------------------------------------------------------------------------
// Карты.
// ---------------------------------------------------------------------------

/** Канонические id трёх карт Арены (`docs/levels/08-arena.md`). Список фиксирован — «3 карты» из критерия задачи, не расширяется динамически. */
export const ARENA_MAP_IDS = ['map.arena_1', 'map.arena_2', 'map.arena_3'] as const;
export type ArenaMapId = (typeof ARENA_MAP_IDS)[number];

export function isArenaMapId(mapId: string): mapId is ArenaMapId {
  return (ARENA_MAP_IDS as readonly string[]).includes(mapId);
}

export interface ArenaMapDef {
  readonly id: ArenaMapId;
  /**
   * Человекочитаемое имя — дублирует `map.arena_N.name` из
   * `public/data/i18n/ru.json` буквально (level-designer, §5 `08-arena.md`).
   * Экран выбора карты (`src/ui/arena-menu.ts`) рисуется ДО того, как
   * демо-сцена вообще создана (клик «АРЕНА» на титульнике, `main.ts`) — тот
   * же принцип, что уже применяет `title-screen.ts`: ни один экран до старта
   * геймплея не тянет асинхронный `fetch` словаря локализации, только
   * литеральные строки. Если имя карты в `ru.json` когда-нибудь изменится —
   * поменять и здесь (то же дублирование level-designer уже принял в §0.3
   * документа для временного `exit → map.garazhi`).
   */
  readonly label: string;
}

export const ARENA_MAPS: readonly ArenaMapDef[] = [
  { id: 'map.arena_1', label: 'Арена: Яма' },
  { id: 'map.arena_2', label: 'Арена: Двор' },
  { id: 'map.arena_3', label: 'Арена: Разлив' },
];

// ---------------------------------------------------------------------------
// Волновая кривая.
// ---------------------------------------------------------------------------

export const ARENA_WAVE_COUNT = 10;

export type ArenaTier = 1 | 2 | 3 | 4;

const TIER_SUFFIX_RE = /_t([1-4])_/;

/**
 * Ярус точки спавна по суффиксу её `id` (§0.2 `08-arena.md`): `_t1_*` …
 * `_t4_*`. Единственное исключение из шаблона — `spawn_razliv_boss` (без
 * числа в id), явно отнесённое документом к T4 («капстоун … Босс-задвижка
 * … §0.1»); любой id без `_tN_`-суффикса трактуется так же (тир 4) —
 * безопасный дефолт, а не потерянная точка.
 */
export function tierOfSpawnId(spawnId: string): ArenaTier {
  const match = TIER_SUFFIX_RE.exec(spawnId);
  if (match) return Number(match[1]) as ArenaTier;
  return 4;
}

/** Группирует пул спавнов карты по ярусу — сохраняет исходный порядок `enemySpawns[]` внутри каждой группы (важно для детерминированного выбора подмножества, см. `selectWaveSpawns`). */
export function groupSpawnsByTier(
  spawns: readonly EnemySpawn[],
): Readonly<Record<ArenaTier, readonly EnemySpawn[]>> {
  const groups: Record<ArenaTier, EnemySpawn[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const spawn of spawns) groups[tierOfSpawnId(spawn.id)].push(spawn);
  return groups;
}

/** Волны 1–3 → тир 1, 4–6 → тир 2, 7–9 → тир 3, 10 → тир 4 (§0.2 `08-arena.md`, таблица «Ярус/Условно волны»). */
export function waveTier(wave: number): ArenaTier {
  if (wave <= 3) return 1;
  if (wave <= 6) return 2;
  if (wave <= 9) return 3;
  return 4;
}

/** Первая волна тира, которому принадлежит `wave` (1, 4, 7 или 10) — для вычисления позиции волны внутри своего тира. */
function firstWaveOfTier(tier: ArenaTier): number {
  return tier === 1 ? 1 : tier === 2 ? 4 : tier === 3 ? 7 : 10;
}

/**
 * Точки спавна для конкретной волны 1–10. Волны 1–9: подмножество пула
 * своего тира длиной `min(размер пула, 2 + позиция внутри тира)` — растёт с
 * 2 до 4 врагов внутри каждого 3-волнового блока (первые `count` точек пула
 * в порядке карты, детерминированно). Волна 10: весь пул T4 целиком
 * («капстоун», см. докстринг файла). Вне диапазона 1–10 — пустой список
 * (защита, не должна происходить при вызове из `demo-scene.ts`).
 */
export function selectWaveSpawns(
  enemySpawns: readonly EnemySpawn[],
  wave: number,
): readonly EnemySpawn[] {
  if (wave < 1 || wave > ARENA_WAVE_COUNT) return [];
  const tier = waveTier(wave);
  const pool = groupSpawnsByTier(enemySpawns)[tier];
  if (tier === 4) return pool;
  const position = wave - firstWaveOfTier(tier);
  const count = Math.min(pool.length, 2 + position);
  return pool.slice(0, count);
}

// ---------------------------------------------------------------------------
// Модификаторы.
// ---------------------------------------------------------------------------

export type ArenaModifierId = 'arena.mod.no_dash' | 'arena.mod.knives_only';

export interface ArenaModifierDef {
  readonly id: ArenaModifierId;
  /** См. докстринг `ARENA_MAPS.label` — та же причина не тянуть i18n на экран выбора: литеральная строка. */
  readonly label: string;
}

export const ARENA_MODIFIERS: readonly ArenaModifierDef[] = [
  { id: 'arena.mod.no_dash', label: 'Без рывка' },
  { id: 'arena.mod.knives_only', label: 'Только ножи' },
];

/**
 * Применяет активные модификаторы к снимку ввода одного тика — единственная
 * точка, где Арена трогает `InputSnapshot`, до того как он дойдёт до
 * `sim.step()` (`demo-scene.ts` оборачивает `InputSource.snapshot`).
 * Возвращает тот же объект без изменений, если активных модификаторов нет
 * (без лишней аллокации на каждый тик campaign-сцены/дебаг-захода без
 * модификаторов).
 */
export function applyArenaModifiersToInput(
  snapshot: InputSnapshot,
  modifiers: readonly ArenaModifierId[],
): InputSnapshot {
  if (modifiers.length === 0) return snapshot;
  const blockDash = modifiers.includes('arena.mod.no_dash');
  const blockWeaponSwitch = modifiers.includes('arena.mod.knives_only');
  if (!blockDash && !blockWeaponSwitch) return snapshot;

  const pressed = new Set(snapshot.pressed);
  const held = new Set(snapshot.held);
  if (blockDash) {
    pressed.delete('dash');
    held.delete('dash');
  }
  if (blockWeaponSwitch) {
    pressed.delete('slot1');
    pressed.delete('slot2');
  }
  return { ...snapshot, pressed, held };
}

/** `item.wrench_kran` id как строковый литерал — см. ДОПУЩЕНИЕ в докстринге файла про «только ножи». Не импортирует `WeaponId` из `sim/formulas/weapons.ts` только ради одной константы; `demo-scene.ts` передаёт её в типизированное место (`createWeaponsComponent`), несовпадение поймает `tsc`. */
export const ARENA_KNIVES_ONLY_WEAPON_ID = 'item.wrench_kran';

// ---------------------------------------------------------------------------
// Рекорд — ключ комбинации карта×модификаторы (сама персистентность — `game/save/arena-records.ts`).
// ---------------------------------------------------------------------------

/** Стабильный ключ для комбинации карта+модификаторы — порядок модификаторов на входе не важен (сортируются). */
export function arenaRecordKey(mapId: string, modifiers: readonly ArenaModifierId[]): string {
  const sorted = [...modifiers].sort();
  return `${mapId}::${sorted.length > 0 ? sorted.join('+') : 'none'}`;
}

/** `мм:сс` из миллисекунд выживания — общий формат для HUD забега (`demo-scene.ts`) и экрана меню (`main.ts`), чтобы не дублировать форматирование в двух местах. */
export function formatArenaSurvival(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
