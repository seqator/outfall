/**
 * Играбельная demo-сцена вертикального среза (OF-015): склеивает `core`
 * (детерминированный тик + ECS, OF-010), загрузчик карты и героя-болванчика
 * (`world/map-loader.ts`, эта же задача), DOM-ввод (`src/input`), рендер
 * (`PixiRenderer`) и FPS-оверлей (`src/ui`) в одну работающую сцену. По
 * умолчанию грузит настоящую локацию «Труба» (`public/data/maps/truba.json`,
 * OF-025) — тестовая комната 64×64 (`world/dev-fixtures.ts`) осталась только
 * как `?devroom=1`: детерминированная, минимальная геометрия, на которой
 * держатся `hero-movement.spec.ts`/`stress.spec.ts` (им важна предсказуемая
 * механика, а не конкретная локация).
 *
 * OF-016 подключает бой: герой получает боевые компоненты поверх
 * `createHero` (здоровье/оружие/атрибуты — GDD не даёт стартовые статы
 * персонажа вне ролевой системы, OF-002/rpg-system.md, поэтому значения
 * ниже — задокументированное допущение уровня «КОСТЯК-база 5», см.
 * комментарии у констант), метки спавна врагов карты (`spawnMarker`,
 * kind: 'enemy') превращаются в боевые сущности врагов (`aiSystem.
 * spawnEnemy`), события `combat.hit`/`combat.death` дают вспышку/смерть
 * через `renderer.emitParticles`. `?stress=1` в URL — режим стресс-теста
 * (300 врагов + залп частиц) для `tests/e2e/stress.spec.ts`.
 *
 * OF-018/025 подключает диалоги: NPC-метки карты (`spawnMarker`,
 * kind: 'npc') открывают диалог по нажатию `interact` (E) в радиусе —
 * событие `input.interact-requested` эмитит `sim` (`interactionSystem`,
 * единственная законная точка чтения `pressed` внутри тика, см. её
 * докстринг), `game` слушает и решает, какой NPC ближе. Пока привязка
 * NPC → файл диалога — простой статический словарь (`NPC_DIALOG_FILES`):
 * полноценный выбор «какой диалог сейчас активен для этого NPC» по стадии
 * квеста — задача после OF-025 (main-quest.md уже описывает переходы,
 * runtime-подключение стадий — не в этой волне).
 *
 * `main.ts` — единственное место, которое трогает DOM напрямую; эта функция
 * получает уже готовые элементы и дальше сама ничего в `document` не ищет.
 *
 * OF-049 подключает сцену выбора в зоне E (Родион): раньше это был обычный
 * диалог на два пункта без давления времени — P1 во всех трёх рецензиях
 * duxa-simulator (`docs/planerka/03-vs/duxa-review-vs.md` → `-vs-2.md` →
 * `-vs-3.md`). Спека — `docs/levels/01-truba.md` §11 (game-designer):
 * реалтайм-оверлей поверх геймплея (не модальный диалог), держать `E` 6с —
 * «вытащить», нажать `F` — «снять ключ», бездействие/таймаут — честный
 * форс-исход «ключ». Реализация ниже — блок «Сцена Родиона».
 *
 * OF-051 обобщает загрузку карты на весь Акт 1 (`map.garazhi`/`map.plotina`/
 * `map.paneli`, OF-033) поверх «Трубы», ничего в поведении «Трубы» не меняя:
 * `loadMapById` подгружает произвольный `map.*` по `id → /data/maps/<slug>
 * .json` (`loadRealTrubaMap` до этой правки грузил только «Трубу» — теперь
 * это тот же самый вызов с параметром); NPC → диалог (`NPC_DIALOG_FILES`)
 * дополнен пятью NPC Акта 1 (`docs/narrative/quests/act1-derzost.md`, файлы
 * `public/data/dialogs/act1-*.json`); переход между картами — по `exits[]`
 * карты (`MapSchema.exits`, OF-009), геометрия — вплотную к точке выхода
 * (`EXIT_RADIUS`), реализация — `switchMap`/`findNearbyExit`/
 * `resolveEntryPoint` ниже. «Труба»-специфика (панорама, `TRUBA_START_POINT`,
 * крючок пролога T6, сцена Родиона T4/T5) остаётся активной только когда
 * загружена именно `map.truba` — карты Акта 1 физически не содержат этих
 * триггеров/NPC в своих JSON, так что реакция по `triggerResult.firedIds`
 * естественным образом не срабатывает на других картах без явных доп.
 * проверок. Прямой заход в конкретную карту — `?map=<slug>` в URL (например
 * `?map=garazhi`); без параметра сцена стартует как раньше — с «Трубы».
 * Полноценного экрана выбора локации в этой волне нет (см. `docs/BACKLOG.md`
 * OF-051) — граф локаций уже полностью проходим через `exits[]` каждой
 * карты, отдельное меню — не критерий готовности задачи.
 *
 * OF-056 (P0-1 баланс-прохода, `docs/qa/balance-report.md`): прицеливание
 * мышью реально работает — раньше `aimWorld` из `dom-input.ts` физически не
 * читался нигде в `sim`/`game` (направление атаки = направление последнего
 * WASD-движения, кайтинг был невозможен). `dom-input.ts` теперь отдаёт
 * только `aimScreen` (сырые `clientX/clientY`); эта сцена — единственный
 * слой, которому разрешено знать одновременно про `render` и `input`
 * (см. `aimInput` ниже) — оборачивает `input.source`, пересчитывая
 * `aimScreen` → `aimWorld` через `renderer.screenToWorld` (обратная
 * изометрическая проекция камеры, `render/screen-to-world.ts`) ДО того, как
 * снимок дойдёт до `loop`/`sim.step()`, тем же приёмом, что уже применяет
 * `applyArenaModifiersToInput`. `sim/systems/combat.ts: handlePlayerFacing`
 * теперь целится в `aimWorld`, а не в направление движения.
 */

import { createAudioEngine, type AudioEngine } from '../audio';
import {
  createEventBus,
  createLoop,
  createSeededRng,
  createWorld,
  type InputSnapshot,
  type InputSource,
} from '../core';
import type { EntityId, World } from '../core/world';
import {
  MapSchema,
  type GameMap,
  type MapExit,
  type Vector2,
  DialogSchema,
  type Dialog,
  type Effect,
  type Item,
} from '../data/schemas';
import { createDomInputSource, type DomInputHandle } from '../input';
import { clampToMapBounds, createCamera, followTarget } from '../render';
import { PixiRenderer } from '../render/pixi';
import {
  WEAPON_DEFS,
  createSimulation,
  createWeaponsComponent,
  spawnEnemy,
  type EnemyDefId,
  type WeaponId,
} from '../sim';
import { createFpsOverlay } from '../ui';
import { createBrowserRaf } from './browser-raf';
import { applyEffects, createDialogueScreen, createGameState, type GameState } from './dialogue';
import { createI18n, loadI18nDictionary, type I18n } from './i18n';
import {
  addItem,
  createEmptyInventory,
  createInventoryScreen,
  createItemRegistry,
  nextDevUid,
  type ArmorSlotTable,
  type InventoryScreen,
  type InventoryState,
} from './inventory';
import {
  applyHeroSave,
  applyWeaponsSave,
  captureHeroSave,
  captureWeaponsSave,
  createArenaRecordsStore,
  createSaveStore,
  CURRENT_SAVE_SCHEMA_VERSION,
  toInventoryState,
  type SaveState,
} from './save';
import {
  applyArenaModifiersToInput,
  ARENA_KNIVES_ONLY_WEAPON_ID,
  ARENA_WAVE_COUNT,
  formatArenaSurvival,
  isArenaMapId,
  selectWaveSpawns,
  type ArenaModifierId,
} from './world/arena';
import { createDevTestMap } from './world/dev-fixtures';
import { resolveEnding, type EndingResult } from './world/endings';
import { collectNearbyItemPickups, itemPickupFlagKey } from './world/item-pickup';
import {
  createHero,
  findSpawnPoint,
  loadMapIntoWorld,
  type LoadedMap,
  toRendererMapData,
} from './world/map-loader';
import { createTriggerRunner } from './world/triggers';

export interface DemoScene {
  destroy(): void;
}

/**
 * Тестовый хук для e2e (`tests/e2e/hero-movement.spec.ts`): читать точную
 * позицию героя через `page.evaluate`, а не судить о ней по скриншоту
 * канваса. Байтовое сравнение WebGL-кадров на софтверном рендерере
 * (SwiftShader — в песочнице/CI нет `/dev/dri`) недетерминировано на уровне
 * отдельных пикселей даже при неизменной сцене, так что скриншот-диффинг
 * годится только для грубой проверки «сцена вообще ожила», не для точного
 * «герой встал». Ничего игрового не меняет и не тянет тестовый код в прод —
 * просто читает уже существующий `world`.
 */
declare global {
  interface Window {
    __outfallDebug?: {
      getHeroPosition(): { x: number; y: number } | null;
      /**
       * Текущее направление взгляда героя (`facing.dirX/dirY`, нормализованный
       * вектор) — для e2e-теста прицеливания мышью (`tests/e2e/aim.spec.ts`,
       * OF-056): `page.mouse.move(x, y)` в разные точки экрана должно реально
       * менять это направление независимо от того, куда/движется ли герой,
       * без парсинга скриншота/HUD.
       */
      getHeroFacing(): { dirX: number; dirY: number } | null;
      /**
       * Мгновенно ставит героя в точку — для e2e-теста диалога
       * (`tests/e2e/dialogue.spec.ts`): реальная геометрия «Трубы» не
       * зафиксирована в тесте как контракт (её меняет level-designer без
       * ведома e2e-теста), а пешая навигация через WASD к конкретному NPC
       * была бы завязана на текущую расстановку препятствий и хрупкой при
       * правках уровня — ровно та же ловушка, что уже была с dev-room в
       * `hero-movement.spec.ts`. Телепорт проверяет именно контракт
       * «рядом с NPC + E → диалог», не пешую навигацию (её отдельно
       * покрывает `hero-movement.spec.ts` на детерминированной dev-room).
       */
      teleportHero(x: number, y: number): void;
      /** Число живых ECS-сущностей врагов — для e2e-теста триггерной волны (`tests/e2e/trigger-chain.spec.ts`). */
      getEnemyCount(): number;
      /** Значение флага `gameState` (диалоги/сцена Родиона) — для e2e-проверки исхода сцены выбора (`tests/e2e/rodion-scene.spec.ts`), не требует парсить текст HUD. */
      getFlag(key: string): boolean | number | string | undefined;
      /** Id текущей загруженной карты (`GameMap.id`, напр. `map.garazhi`) — для e2e-теста перехода между картами (`tests/e2e/act1-transition.spec.ts`, OF-051), подтверждает `switchMap` без парсинга HUD/скриншота. */
      getMapId(): string;
      /**
       * Состояние текущего забега Арены (OF-039) — `null` вне карты Арены.
       * `wavesCleared` — число полностью зачищенных волн, `wave` — номер
       * текущей/незачищенной волны. Для `tests/e2e/arena.spec.ts`, чтобы не
       * парсить HUD-строку.
       */
      getArenaState(): { wave: number; wavesCleared: number; finished: boolean } | null;
      /**
       * Мгновенно убивает всех живых врагов (`hp = 0`, обычная уборка трупов
       * `combatSystem` делает остальное на следующем тике) — тестовый хук
       * для `tests/e2e/arena.spec.ts`, чтобы проверить смену волн без
       * реального боя (симметрично `teleportHero` выше — тот же принцип
       * «не тянуть тестовую логику в прод», ничего игрового не меняет).
       */
      killAllEnemies(): void;
      /** Рекорд карты×модификаторов из `localStorage` (`game/save/arena-records.ts`) — для e2e-теста «рекорд переживает перезагрузку». `undefined`, если забегов ещё не было. */
      getArenaRecord(
        mapId: string,
        modifierIds: readonly string[],
      ): { bestWavesCleared: number; bestSurvivalMs: number } | undefined;
    };
  }
}

/** Seed фиксирован — вертикальный срез детерминирован так же, как реплей-тест ядра (OF-010). */
const DEV_SEED = 20260101;

/**
 * Стартовые боевые статы героя — GDD не описывает создание персонажа вне
 * ролевой системы (`docs/design/rpg-system.md`), которая тоже вне скоупа
 * OF-016. Допущение: КОСТЯК-база «5» без распределения очков (Каркас 5 →
 * ХП = 40 + 8×5 = 80, `rpg-system.md` §1.1), боевые навыки — 50 (тот же
 * «средний» уровень, что GDD берёт для врагов по умолчанию, §4.1
 * combat.md), Кураж/Острота — базовые 5.
 */
const PLAYER_MAX_HP = 80;
const PLAYER_DEFAULT_SKILL = 50;
const PLAYER_DEFAULT_COURAGE = 5;
const PLAYER_DEFAULT_REFLEX = 5;
/** То же допущение «КОСТЯК-база 5» (см. выше), нужное отдельно для лимита переносимого веса (`items-economy.md` §1.1, `weightLimitKg`). */
const PLAYER_KARKAS = 5;
/** То же допущение «КОСТЯК-база 5», нужное для формулы очков навыков за уровень (`rpg-system.md` §1.3/§2, `formulas/progression.ts: skillPointsPerLevel`). */
const PLAYER_DEFAULT_SMEKALKA = 5;

/**
 * Все восемь врагов GDD (`docs/design/combat.md` §2) — OF-035 реализует
 * оставшиеся пять (энергосбытовец/чистый/крыса/автомат НИИ/босс). Ни одна
 * настоящая карта пока не размечает их `spawnMarker`-метками (Акт 1/2 —
 * OF-032/033/036/037, `todo`), но фильтр держим по полному списку заранее —
 * когда level-designer добавит метки, спавн заработает без правки кода.
 */
const SPAWNABLE_ENEMY_DEF_IDS: ReadonlySet<EnemyDefId> = new Set<EnemyDefId>([
  'enemy.raki',
  'enemy.podlineiny',
  'enemy.ohrana_progress2',
  'enemy.energosbytovets',
  'enemy.chisty',
  'enemy.krysa_plastikovaya',
  'enemy.avtomat_nii',
  'enemy.boss_zadvizhka',
]);

/**
 * `initialWeapon` — OF-039, модификатор Арены «только ножи»: герой стартует
 * забег уже с экипированным «Краном» (`ARENA_KNIVES_ONLY_WEAPON_ID`), а не
 * с дефолтным пистолетом — переключение на стволы дальше заблокировано
 * фильтром ввода (`applyArenaModifiersToInput`, `world/arena.ts`), но
 * стартовое оружие фильтр не трогает (он видит только `pressed`/`held`
 * тика, не начальное состояние `weapons`-компонента).
 */
function attachCombatComponents(world: World, hero: EntityId, initialWeapon?: WeaponId): void {
  world.store('health').add(hero, { hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, armor: 0 });
  world.store('weapons').add(hero, createWeaponsComponent(initialWeapon));
  world.store('facing').add(hero, { dirX: 1, dirY: 0 });
  world
    .store('attributes')
    .add(hero, { courage: PLAYER_DEFAULT_COURAGE, reflex: PLAYER_DEFAULT_REFLEX });
  world.store('combatSkills').add(hero, {
    guns: PLAYER_DEFAULT_SKILL,
    heavy: PLAYER_DEFAULT_SKILL,
    fists: PLAYER_DEFAULT_SKILL,
  });
  world.store('dashState').add(hero, { iframesRemainingMs: 0, cooldownRemainingMs: 0 });
  // OF-035: прогрессия/перки — герой стартует без единого разблокированного
  // перка (нет экрана выбора перков в этой волне, см. отчёт задачи), но
  // компоненты нужны заранее, чтобы `combatSystem`/`ai.ts`/`player-damage.ts`
  // могли их читать без дополнительных проверок «а есть ли компонент вообще»
  // на каждый новый сейв/тест.
  world.store('progression').add(hero, { xp: 0, level: 1, skillPoints: 0, smekalka: PLAYER_DEFAULT_SMEKALKA });
  world.store('perks').add(hero, { unlockedPerkIds: [], lastStandAvailable: true, guaranteedCritPending: false });
}

/** Превращает `spawnMarker`-метки карты (kind: 'enemy') в боевые сущности врагов и убирает отработанные метки. */
function spawnEnemiesFromMarkers(world: World, enemySpawnEntities: readonly EntityId[]): void {
  for (const marker of enemySpawnEntities) {
    const spawnMarker = world.store('spawnMarker').get(marker);
    const transform = world.store('transform').get(marker);
    if (!spawnMarker || !transform) continue;
    if (!SPAWNABLE_ENEMY_DEF_IDS.has(spawnMarker.refId as EnemyDefId)) continue;
    spawnEnemy(world, spawnMarker.refId as EnemyDefId, { x: transform.x, y: transform.y });
    world.destroy(marker);
  }
}

/**
 * `map.itemPickups[i]` ↔ `loadedMap.itemPickupEntities[i]` — построены
 * `.map()` в паре, тем же порядком (`world/map-loader.ts:
 * loadMapIntoWorld`), поэтому zip по индексу безопасен и не требует менять
 * `map-loader.ts` (вне зоны OF-058) под новое поле в `spawnMarker`. Ключ
 * результата — `ItemPickup.id` (уникален в пределах одной карты, не
 * `EntityId`, который меняется при каждой пересборке `loadMapIntoWorld`
 * внутри `switchMap`) — нужен, чтобы `collectNearbyItemPickups` (чистая
 * функция, `world/item-pickup.ts`) могла адресовать конкретную точку лута,
 * не зная о `World`/`EntityId` вовсе.
 */
function buildItemPickupEntityMap(gameMap: GameMap, loaded: LoadedMap): Map<string, EntityId> {
  const byId = new Map<string, EntityId>();
  gameMap.itemPickups.forEach((pickup, i) => {
    const entity = loaded.itemPickupEntities[i];
    if (entity !== undefined) byId.set(pickup.id, entity);
  });
  return byId;
}

function collectFreeTiles(map: GameMap): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.layers.collision[y * map.width + x] === 0) tiles.push({ x, y });
    }
  }
  return tiles;
}

/** `?stress=1`: спавнит `count` врагов на случайных свободных клетках — для FPS-нагрузочного теста (§8 задачи, `tests/e2e/stress.spec.ts`). */
function spawnStressEnemies(world: World, map: GameMap, count: number): void {
  const freeTiles = collectFreeTiles(map);
  const defIds: readonly EnemyDefId[] = [...SPAWNABLE_ENEMY_DEF_IDS];
  for (let i = 0; i < count && freeTiles.length > 0; i++) {
    const index = world.rng.int(0, freeTiles.length - 1);
    const tile = freeTiles[index];
    freeTiles.splice(index, 1);
    if (!tile) break;
    const defId = defIds[i % defIds.length];
    /* v8 ignore next */
    if (!defId) continue;
    spawnEnemy(world, defId, { x: tile.x + 0.5, y: tile.y + 0.5 });
  }
}

function isStressMode(): boolean {
  return new URLSearchParams(window.location.search).get('stress') === '1';
}

/** `?devroom=1` — тестовая комната вместо настоящей «Трубы», см. докстринг файла. */
function isDevRoomMode(): boolean {
  return new URLSearchParams(window.location.search).get('devroom') === '1';
}

/**
 * Реальная локация грузится как статические данные (`public/data`), не
 * бандлится — `MapSchema.parse` не доверяет содержимому файла вслепую.
 * `mapId` — полный намespaced id (`map.truba`, `map.garazhi`, …), файл —
 * `<id без "map.">.json` (level-designer, OF-014/025/033: слаг файла всегда
 * равен хвосту id).
 */
async function loadMapById(mapId: string): Promise<GameMap> {
  const slug = mapId.startsWith('map.') ? mapId.slice('map.'.length) : mapId;
  const res = await fetch(`/data/maps/${slug}.json`);
  if (!res.ok) throw new Error(`demo-scene: не удалось загрузить карту «${mapId}» (${String(res.status)})`);
  return MapSchema.parse(await res.json());
}

/**
 * `?map=<slug|map.slug>` — прямой заход на конкретную карту, без пешего
 * прохождения графа `exits[]` от «Трубы» (например, `?map=garazhi` для
 * ручной проверки Акта 1 без прогона всего пролога). Без параметра — как и
 * до OF-051, сцена стартует с «Трубы» (`map.truba`).
 */
function resolveInitialMapId(): string {
  const raw = new URLSearchParams(window.location.search).get('map');
  if (!raw) return 'map.truba';
  return raw.startsWith('map.') ? raw : `map.${raw}`;
}

/**
 * NPC (`npcs[].id` любой карты) → файл диалога в `public/data/dialogs/`.
 * `npc.serega_sachok` задокументирован в `docs/levels/01-truba.md` §1 как
 * «первая шутка игры», но диалога не имел (`duxa-review-vs.md`, кринж-лист
 * №5: «первая шутка игры — отсутствует физически») — `prolog-serega.json`
 * закрывает это одной репликой в его голосе из `world-bible.md` §2.1
 * («балагур, называет раков крупными и мелкими, как на рынке»).
 *
 * `npc.rodion` сюда намеренно не входит: раньше `E` открывал обычный
 * диалог `prolog-vybor.json` (модальное меню на два пункта без давления
 * времени — сам P1 из всех трёх рецензий). OF-049 заменяет его реалтайм-
 * сценой «Сцена Родиона» ниже (`docs/levels/01-truba.md` §11); файл
 * `prolog-vybor.json` остаётся на диске нетронутым — это фикстура
 * регрессионного снапшот-теста `dialog-runner.test.ts` на обход графа
 * диалога, просто больше не используется рантаймом демо-сцены.
 *
 * OF-051 (Акт 1, `public/data/dialogs/act1-*.json`, сверено с `.npc` полем
 * каждого файла и расстановкой NPC на картах `public/data/maps/{garazhi,
 * plotina,paneli}.json`): пять NPC c диалогом — `npc.grinya`/`npc.tolya`
 * («Отработка»), `npc.emissary_chistyh` («Для колодца»), `npc.modest_
 * busygin` («Рубильник»), `npc.palych` («Я кран»). Пятая рецензия
 * duxa-simulator (`duxa-review-vs-5.md`, P2) добавила ещё двух — `npc.zoya`
 * («Судьба ключа/Родиона», `docs/narrative/main-quest.md` §2 — заглавный
 * NPC квеста Q2 «Ключ Тарифницы», до этой правки физически немой) и
 * `npc.pereskazchik` (decor-реплика «Кратко про — банка. Подробно — две»,
 * одобренная ещё на этапе тон-ревью, `tone-limits.md` правило №8, но так и
 * не звучавшая в игре). Остальные NPC карт Акта 1 (`npc.klavdiya_busygina`,
 * `npc.batya_kot`, `npc.dyadya_gena`, `npc.timofey_rzhavyy`, `npc.tetya_
 * valya`) названы в `docs/narrative/main-quest.md`/`world-bible.md`, но
 * диалоговых сцен под них ещё не написано (`quest.med_dlya_semyorki`/
 * `quest.tolya_chto_dalshe`/`quest.schetchik_i_sovest` в `quests.json` пока
 * без диалогов, только эффекты стадий) — они сознательно «немые»: видны на
 * карте, `E` рядом с ними не находит запись в этом словаре и просто не
 * открывает диалог (см. `findNearestInteractableNpc` ниже —
 * `dialogsByNpcId.get` вернёт `undefined` и кандидат пропускается). Это
 * честная граница контента этой волны, не баг OF-051.
 *
 * OF-036/037 (Акты 2–3, `public/data/dialogs/act2-*.json`/`act3-final-*.json`,
 * сверено с `.npc` каждого файла и NPC карт `sanatoriy.json`/`nii.json`/
 * `truba_final.json`): Санаторий — `npc.doctor_solomin` («Святая вода»,
 * хаб с двумя темами — про сад и предложение помочь лечебнице),
 * `npc.sestra_lyuba` (продолжение травли колодцев, доступно только если
 * `flag.dlya_kolodtsa = privel`), `npc.ded_frol` (альтернативный путь к
 * той же улике сада, безопасен для повтора — не необратимый выбор).
 * НИИ — `npc.vedeneev` («Шесть пальцев», поворот: вторая половина правды +
 * судьба самого Веденеева), `npc.yuriy_sleptsov` (без последствий, decor).
 * Финал в Трубе — пять NPC с суффиксом `_final` (отдельные id от Акта 1 —
 * `npc.palych`/`npc.zoya`/`npc.doctor_solomin` уже могут быть «немыми»
 * после Акта 1/2, движок пока не умеет условно прятать NPC по флагу,
 * поэтому у финала свои, всегда видимые копии, см. отчёт OF-037):
 * `npc.palych_final`/`npc.grinya_final`/`npc.zoya_final`/`npc.doctor_
 * solomin_final` — присяга фракции (`flag.storona`), `npc.vedeneev_final`
 * — судьба Веденеева, если сбежал в Акте 2 (запись ниже в
 * `ONE_SHOT_DIALOG_RESOLVED_FLAG` даёт побочный эффект: если он уже
 * `mertv`/`zhiv` с Акта 2, разговор в финале тоже недоступен — честное
 * приближение к «спрятать NPC по флагу» без самой этой фичи).
 */
const NPC_DIALOG_FILES: Readonly<Record<string, string>> = {
  'npc.sanitar': 'prolog-smotritel',
  'npc.serega_sachok': 'prolog-serega',
  'npc.grinya': 'act1-otrabotka-grinya',
  'npc.tolya': 'act1-otrabotka-tolya',
  'npc.emissary_chistyh': 'act1-dlya-kolodtsa',
  'npc.modest_busygin': 'act1-rubilnik',
  'npc.palych': 'act1-ya-kran',
  'npc.zoya': 'act1-klyuch-zoi',
  'npc.pereskazchik': 'act1-pereskazchik',
  'npc.doctor_solomin': 'act2-sanatoriy-solomin',
  'npc.sestra_lyuba': 'act2-sanatoriy-lyuba',
  'npc.ded_frol': 'act2-sanatoriy-frol',
  'npc.vedeneev': 'act2-nii-vedeneev',
  'npc.yuriy_sleptsov': 'act2-nii-sleptsov',
  'npc.palych_final': 'act3-final-palych',
  'npc.grinya_final': 'act3-final-grinya',
  'npc.zoya_final': 'act3-final-zoya',
  'npc.doctor_solomin_final': 'act3-final-solomin',
  'npc.vedeneev_final': 'act3-final-vedeneev',
};

/**
 * NPC → флаг, которым помечен уже сделанный необратимый выбор его диалога
 * (OF-046/051). Найдено пятой рецензией duxa-simulator (`duxa-review-vs-5.md`,
 * P0): без этой границы `E` рядом с уже пройденным NPC каждый раз заново
 * открывал тот же диалог и повторно применял `incrementFlag`/`giveItem` —
 * трижды «Отвести на отработку» утраивало `rep.progress2`, а «Я кран»
 * предлагал убить/пощадить Палыча заново после того, как игрок уже решил.
 * `findNearestInteractableNpc` ниже исключает NPC из этого словаря, если
 * состояние уже содержит его флаг — тот же принцип, что уже применяет сцена
 * Родиона («Труба» глушит интеракцию после исхода, `docs/levels/01-truba.md`
 * §11.5) и `once: true` у триггеров карты, просто для диалогов, у которых
 * нет отдельного триггера. `npc.grinya`/`npc.sanitar`/`npc.serega_sachok`
 * сюда не входят: их эффекты (`startQuest`, либо вовсе без эффектов)
 * идемпотентны, повторный разговор безопасен и не портит экономику/сюжет.
 */
const ONE_SHOT_DIALOG_RESOLVED_FLAG: Readonly<Record<string, string>> = {
  'npc.tolya': 'flag.otrabotka_tolya',
  'npc.emissary_chistyh': 'flag.dlya_kolodtsa',
  'npc.modest_busygin': 'flag.rubilnik',
  'npc.palych': 'flag.palych_ubit',
  // `flag.zoya_rodion_talk` — выставляется на всех терминальных узлах
  // `act1-klyuch-zoi.json` независимо от исхода (в отличие от остальных
  // записей выше, не совпадает по имени с флагом какого-то другого эффекта
  // — разговор про Родиона не завязан на отдельный сюжетный выбор с
  // собственным флагом, только на уже существующий `flag.prolog_vybor`).
  'npc.zoya': 'flag.zoya_rodion_talk',
  'npc.sestra_lyuba': 'flag.lyuba_ochishchenie',
  // `npc.vedeneev`/`npc.vedeneev_final` намеренно делят один и тот же флаг:
  // «убить/пощадить» в Акте 2 (`act2-nii-vedeneev.json`) — то же самое
  // необратимое решение, что и «Я кран» у Палыча, а не отдельная сцена.
  // Побочный эффект (документирован в отчёте OF-037): если игрок уже решил
  // судьбу Веденеева в Акте 2, финальная копия NPC в Трубе тоже становится
  // недоступной — приближение к «прятать NPC по флагу» (движок пока не умеет
  // это буквально), но здесь оно случайно даёт верное поведение: мёртвый
  // Веденеев не может появиться в финале.
  'npc.vedeneev': 'flag.vedeneev_sudba',
  'npc.vedeneev_final': 'flag.vedeneev_sudba',
  // Присяга фракции (`main-quest.md` §2, Q5 «Кому качать») — один флаг на
  // четырёх NPC-лидеров намеренно: `flag.storona` может быть присвоен только
  // ОДИН раз за игру (герой выбирает одну сторону или нейтралитет в
  // финальном разговоре с ОДНИМ лидером), поэтому как только флаг стоит —
  // остальные три лидера тоже перестают предлагать присягу, а не только тот,
  // с кем уже говорили. Без этого игрок мог бы обойти всех четверых подряд и
  // менять решение до последнего — main-quest.md описывает разовый выбор, не
  // раунд переговоров.
  'npc.palych_final': 'flag.storona',
  'npc.grinya_final': 'flag.storona',
  'npc.zoya_final': 'flag.storona',
  'npc.doctor_solomin_final': 'flag.storona',
};

async function loadDialog(fileName: string): Promise<Dialog> {
  const res = await fetch(`/data/dialogs/${fileName}.json`);
  if (!res.ok) throw new Error(`demo-scene: не удалось загрузить диалог «${fileName}» (${String(res.status)})`);
  return DialogSchema.parse(await res.json());
}

/**
 * Подгружает (и кэширует в `cache`, общий на всю сессию — id NPC уникальны
 * по всем картам, `NpcSpawnSchema` докстринг) диалоги только тех NPC, что
 * реально стоят на переданной карте и имеют запись в `NPC_DIALOG_FILES` —
 * не весь словарь целиком: карта Акта 1 не должна тянуть диалог «Трубы» и
 * наоборот.
 */
async function loadDialogsForMap(map: GameMap, cache: Map<string, Dialog>): Promise<void> {
  // Параллельно (`Promise.all`), не по одному файлу за раз: карта Акта 1
  // может завести сразу несколько NPC с диалогом (например «Панели» —
  // Дядя Толя и Эмиссар Чистых), а последовательные `await` в цикле
  // складывали бы задержки round-trip'ов друг на друга — заметно на
  // переходе между картами (`switchMap`), где игрок ждёт прямо во время
  // геймплея, а не на загрузке экрана.
  const toLoad = map.npcs
    .filter((npc) => !cache.has(npc.id) && NPC_DIALOG_FILES[npc.id] !== undefined)
    .map((npc) => ({ npcId: npc.id, fileName: NPC_DIALOG_FILES[npc.id] as string }));
  const dialogs = await Promise.all(toLoad.map((entry) => loadDialog(entry.fileName)));
  toLoad.forEach((entry, i) => cache.set(entry.npcId, dialogs[i] as Dialog));
}

/** `createItemRegistry` сам валидирует каждую запись по `ItemSchema` — здесь только сырой JSON. */
async function loadRawItems(): Promise<readonly unknown[]> {
  const res = await fetch('/data/items.json');
  if (!res.ok) throw new Error(`demo-scene: не удалось загрузить предметы (${String(res.status)})`);
  return (await res.json()) as readonly unknown[];
}

/** Радиус, в котором `interact` (E) открывает диалог с NPC, в тайлах. */
const INTERACT_RADIUS = 2;

/**
 * Радиус, в котором герой автоматически подбирает `itemPickup` карты
 * (OF-058, `world/item-pickup.ts`) — без отдельной клавиши: `E` уже занята
 * диалогами/интеракцией NPC (`INTERACT_RADIUS` выше), а лут не требует
 * подтверждения/диалога, герою достаточно физически дойти (тот же принцип,
 * что уже применяет переход через `exits[]`, см. `EXIT_RADIUS` ниже).
 * Значение — тот же порядок величины, что `EXIT_RADIUS`: точки лута на
 * картах Акта 1/«Трубы» (`public/data/maps/*.json`) стоят на отдельных
 * клетках, не в открытых залах, более широкий радиус рисковал бы подбирать
 * предмет раньше, чем игрок вообще увидел бы, что там что-то есть.
 */
const ITEM_PICKUP_RADIUS = 0.9;

/**
 * Точка старта игрока `S` и точка панорамной камеры `P` из
 * `docs/levels/01-truba.md` §2 (зона A, "3–8 сек" в таблице первых 60 секунд
 * концепта). `findSpawnPoint` (геометрический центр карты) — не то же самое:
 * до этой правки герой стартовал в центре Трубы, в зоне боя, минуя весь
 * задуманный пролог (см. `docs/qa/vs-report.md`, P0 «hero spawn point»).
 */
const TRUBA_START_POINT = { x: 30, y: 6 };
const TRUBA_PANORAMA_POINT = { x: 30, y: 2 };
/** Сколько реального времени камера стоит на `P`, не следуя за героем — установочный план перед тем, как отдать управление камерой игроку. */
const PANORAMA_DURATION_MS = 4000;
const PANORAMA_ZOOM = 1.1;
const GAMEPLAY_ZOOM = 1.5;

/**
 * Радиус, в котором герой у `MapExit.position` запускает переход на другую
 * карту (`switchMap`, OF-051) — без отдельного `[E]`, так же, как дверь.
 * `MapExit` не несёт своего `radius` (`src/data/schemas/map.ts`), поэтому
 * берём фиксированное значение чуть меньше `INTERACT_RADIUS`: выходы стоят
 * на одиночных проходимых клетках коридоров (не открытых залах), более
 * широкий радиус рисковал бы срабатывать раньше, чем герой физически дошёл
 * до двери.
 */
const EXIT_RADIUS = 0.9;

/**
 * Точка появления героя на целевой карте после перехода через `exit`
 * (OF-051). `MapExit.toSpawnId` — опциональное поле, «соответствие точке
 * спавна там не проверяется» (докстринг `MapExitSchema`), ни у одного
 * реального `exit` в контенте Акта 1 оно не выставлено — решение по
 * дефолту:
 *  1. Если `toSpawnId` задан — трактуем его как id другого `exit` этой же
 *     целевой карты (единственный вид «именованной точки» в схеме сегодня)
 *     и высаживаем героя там.
 *  2. Иначе ищем на целевой карте свой `exit`, ведущий обратно на карту, с
 *     которой мы уходим (`toMap === fromMapId`) — «зеркало» входа: герой
 *     выходит из тех же дверей, через которые вошёл бы, если бы шёл
 *     навстречу. Ровно так level-designer и связал граф (`garazhi.
 *     exit_to_plotina(33,15)` ↔ `plotina.exit_to_garazhi(8,16)` и т.д.).
 *  3. Иначе (на «Трубу» ведущих `exit`'ов обратно нет — там единственный
 *     `exit_to_river` замкнут сам на себя) — `TRUBA_START_POINT` для
 *     «Трубы» или геометрический центр карты (`findSpawnPoint`) для прочих.
 */
function resolveEntryPoint(targetMap: GameMap, exit: MapExit, fromMapId: string): Vector2 {
  if (exit.toSpawnId !== undefined) {
    const named = targetMap.exits.find((candidate) => candidate.id === exit.toSpawnId);
    if (named) return named.position;
  }
  const reciprocal = targetMap.exits.find((candidate) => candidate.toMap === fromMapId);
  if (reciprocal) return reciprocal.position;
  if (targetMap.id === 'map.truba') return TRUBA_START_POINT;
  return findSpawnPoint(targetMap);
}

/** Через сколько игрок возрождается после смерти — `docs/qa/vs-report.md` P0 «смерть без обратной связи»: без этого герой замирает навсегда. */
const RESPAWN_DELAY_MS = 2500;

/**
 * Числа сцены Родиона (зона E, `trigger_t4`/`trigger_t5`) — из
 * `docs/levels/01-truba.md` §11 (game-designer, аддендум, закрывает P1 всех
 * трёх рецензий duxa-simulator). Спека фиксирует именно эти значения, менять
 * их без обновления §11 нельзя — числа завязаны на баланс «6с держать при
 * таймере 15с», подробности выбора см. в самом документе.
 */
const RODION_NPC_ID = 'npc.rodion';
/** `T_scene` — общий таймер сцены от момента `trigger_t4`. */
const RODION_SCENE_DURATION_MS = 15_000;
/** `T_hold` — сколько секунд подряд держать `E`, чтобы вытащить Родиона (исход `spas`). */
const RODION_HOLD_THRESHOLD_SEC = 6;
/** `T_snap` — фиксированная, уже необратимая длительность «снять ключ» (`F`, исход `klyuch`). */
const RODION_SNAP_DURATION_MS = 1_500;
/** Как долго после сорвавшегося удержания показывать «Не удержал!», пока HUD не вернётся к обычной строке таймера. */
const RODION_RELEASE_MESSAGE_MS = 1_000;
/** Как долго после исхода (`spas`/`klyuch`/таймаут) держать финальную строку на HUD. */
const RODION_OUTCOME_MESSAGE_MS = 4_000;

/**
 * Числа финальной сцены задвижки (`map.truba_final`, `trigger_final_valve`)
 * — из `docs/narrative/quests/act2-act3.md` §4.1/§4.2 (narrative-writer,
 * по образцу сцены Родиона выше — единственная сцена волны Актов 2-3,
 * объявленная сюжетно срочной, поэтому реалтайм-оверлей, а не диалог).
 */
const FINAL_VALVE_POSITION: Vector2 = { x: 21, y: 5 };
/** Радиус, в котором держатся `E`/`F`/`G` — тот же принцип, что `INTERACT_RADIUS`, но своя константа: это не NPC-интеракция, а точка на карте. */
const FINAL_VALVE_RADIUS = 3;
/** `T_scene` — общий таймер сцены от момента `trigger_final_valve`. Крупнее, чем у Родиона (18 не 15 с) — до трёх клавиш действия вместо двух, финал игры, после сцены больше нет сюжета. */
const FINAL_VALVE_SCENE_DURATION_MS = 18_000;
/** `T_hold` — сколько секунд подряд держать `E`, чтобы исполнить решение (ветка зависит от `flag.storona`). */
const FINAL_VALVE_HOLD_THRESHOLD_SEC = 7;
/** `T_snap` — «довести дозирующий вентиль до метки» (`F`, только `flag.storona === 'energosbyt'`). */
const FINAL_VALVE_SNAP_DURATION_MS = 2_000;
/** `T_drink` — «выпить пузырёк со штаммом-0» (`G`, скрытая опция, только `Смекалка ≤ 3`, §5.5 концовки «Очень чистый»). */
const FINAL_VALVE_DRINK_DURATION_MS = 3_000;
const FINAL_VALVE_RELEASE_MESSAGE_MS = 1_000;
const FINAL_VALVE_OUTCOME_MESSAGE_MS = 4_000;
/** Порог `Смекалка`, при котором в UI сцены видна (и физически доступна) опция `G` — единственный способ показать игроку скрытую концовку, не отдельный секретный триггер (`act2-act3.md` §4.1). */
const FINAL_VALVE_SMEKALKA_THRESHOLD = 3;

/**
 * OF-039 («Арена», см. блок «Арена» ниже): пауза между зачисткой волны N и
 * спавном волны N+1 — HUD-сигнал «волна пройдена», игрок физически успевает
 * перевести дух/подобрать лут перед следующей волной (задача просит именно
 * «спавн следующей волны — с паузой/сигналом»).
 */
const ARENA_INTERMISSION_MS = 3_000;

export interface DemoSceneOptions {
  /**
   * Переопределяет `?map=` из URL — единственный способ Арены (кнопка на
   * титульнике → `src/ui/arena-menu.ts` → `main.ts`) попасть на конкретную
   * карту без перезагрузки страницы/навигации по адресной строке.
   * `resolveInitialMapId()` (URL) остаётся рабочим путём для прямого захода
   * `?map=arena_1` — оба пути (меню и URL) ведут в один и тот же волновой
   * раннер ниже, различается только источник `mapId`.
   */
  readonly initialMapId?: string;
  /** Активные модификаторы забега Арены (`world/arena.ts`) — `[]`, если сцена не запускалась через меню Арены (прямой `?map=arena_N`) или на не-арена карте (не читается вовсе). */
  readonly arenaModifiers?: readonly ArenaModifierId[];
  /**
   * OF-039 §5 («выход из Арены без перезагрузки страницы»): по `Escape`,
   * пока загружена карта Арены, сцена уничтожает саму себя и зовёт этот
   * колбэк — `main.ts` показывает заново титульник/меню Арены. Честно
   * упрощённая версия «выхода в меню»: работает только на картах Арены (не
   * общий пауза-выход из кампании — такой механики в игре нет и вне скоупа
   * этой задачи), не сохраняет прогресс кампании (Арена и так не пишет
   * `SaveState`). Без колбэка (обычный вход через титульник «ПОГНАЛИ» или
   * прямой `?map=`) `Escape` ничего не делает — поведение остального игрового
   * процесса не меняется.
   */
  readonly onExitToMenu?: () => void;
}

export async function createDemoScene(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  options: DemoSceneOptions = {},
): Promise<DemoScene> {
  const renderer = new PixiRenderer();
  await renderer.init(canvas, {
    width: root.clientWidth,
    height: root.clientHeight,
    pixelArt: true,
  });

  const events = createEventBus();
  const rng = createSeededRng(DEV_SEED);
  const world = createWorld(rng, events);

  // Процедурный звук (OF-026): подписывается на боевые события той же шины,
  // что уже слушает `game` для частиц (`combat.hit`/`combat.death` и т.д.,
  // `src/sim/events.ts`) — никаких файлов, только Web Audio синтез. Контекст
  // стартует `suspended`, разблокируется первым кликом/нажатием клавиши
  // (уже реализовано внутри `createAudioEngine`, отдельного вызова не надо).
  const audioEngine: AudioEngine = createAudioEngine(events);

  const devRoom = isDevRoomMode();
  // `let`, не `const`: OF-051 переключает карту рантаймом (`switchMap` ниже,
  // по `exits[]`), поэтому `map`/`loadedMap` — держатели текущей загруженной
  // локации, не разовое значение на всю жизнь сцены.
  const arenaModifiers: readonly ArenaModifierId[] = options.arenaModifiers ?? [];
  let map = devRoom
    ? createDevTestMap()
    : await loadMapById(options.initialMapId ?? resolveInitialMapId());
  let loadedMap = loadMapIntoWorld(world, map);
  // OF-058: `ItemPickup.id` → `EntityId` его `spawnMarker`-метки, для
  // подбора предметов (см. `buildItemPickupEntityMap` выше и `switchMap`
  // ниже, где карта пересобирается заново). На первичной загрузке флагов
  // «уже собрано» ещё нет ни для одной точки лута (`gameState` — новая
  // игра, определяется ниже) — очистка уже-подобранных пропущена здесь
  // намеренно, актуальна только при повторном заходе через `switchMap`.
  let itemPickupEntityById = buildItemPickupEntityMap(map, loadedMap);
  renderer.setMap(toRendererMapData(map));

  // Диалоги подгружаются заранее (не по требованию), чтобы открытие диалога
  // при взаимодействии было мгновенным. Загружаем только диалоги NPC именно
  // ЭТОЙ карты (`loadDialogsForMap`) — при переходе на другую карту `switchMap`
  // дозагружает недостающие в тот же общий `dialogsByNpcId`.
  const dialogsByNpcId = new Map<string, Dialog>();
  let hookDialog: Dialog | null = null;
  if (!devRoom) {
    await loadDialogsForMap(map, dialogsByNpcId);
    // Крючок пролога (T6, «Глава 1. Труба») — не привязан ни к одному NPC,
    // открывается автоматически по триггеру (см. ниже), только на «Трубе» —
    // карты Акта 1 не содержат `trigger_t6`, так что это условие никогда не
    // сработает на них само по себе, но файл всё равно грузим только когда
    // нужен. До этой правки файл существовал, проходил `validate`, но был
    // физически недостижим в игре (`docs/planerka/03-vs/duxa-review-vs.md`,
    // кринж-лист №3).
    if (map.id === 'map.truba') hookDialog = await loadDialog('prolog-kruchok');
  }

  // Локализация (OF-019/025): без неё диалоговый UI и HUD показывают сырые
  // ключи контента вместо текста — ровно баг из рецензии `docs/planerka/
  // 03-vs/duxa-review-vs.md` п.1–2. `t` резолвится один раз на сцену и
  // передаётся всюду, где строится текст для игрока.
  const i18n: I18n = createI18n('ru', await loadI18nDictionary('ru'));
  const t = (key: string): string => i18n.t(key);

  // Инвентарь (OF-017/OF-027): реестр предметов из настоящего контента
  // (`public/data/items.json`), брони в текущей волне нет — таблица слотов
  // брони пуста, это честное состояние, а не заглушка. До этой правки экран
  // инвентаря существовал как модуль, но был физически недостижим в игре —
  // `KeyI` был замаплен во входе (`src/input/dom-input.ts`), но сцена его не
  // слушала (`duxa-review-vs-2.md`, P0 №2).
  const itemRegistry = createItemRegistry(await loadRawItems());
  const armorSlots: ArmorSlotTable = new Map();

  // Точка старта — геометрический центр карты `findSpawnPoint(map)` подходит
  // только для карт без сюжетной постановки (dev-room и любая карта Акта 1
  // при прямом заходе через `?map=`, минуя `exits[]`); настоящая «Труба»
  // начинается в зоне A (`TRUBA_START_POINT`, см. докстринг константы) — это
  // прямое исправление P0 из `docs/qa/vs-report.md` («герой стартует в
  // центре арены боя, минуя весь пролог»). `let`: `switchMap` переставляет
  // героя на точку появления новой карты (`resolveEntryPoint`) — это то же
  // самое поле, что читает автовозрождение на смерть ниже.
  let spawn: Vector2 = devRoom ? findSpawnPoint(map) : map.id === 'map.truba' ? TRUBA_START_POINT : findSpawnPoint(map);
  const hero = createHero(world, spawn);
  attachCombatComponents(
    world,
    hero,
    arenaModifiers.includes('arena.mod.knives_only') ? ARENA_KNIVES_ONLY_WEAPON_ID : undefined,
  );

  // Стартовые расходники в вещмешке (`items-economy.md` §4) — иначе экран
  // инвентаря открывается пустым, что выглядит как ещё один недостижимый
  // экран. Оружие героя сюда намеренно не кладётся: боевой пистолет — это
  // ECS-компонент `weapons` (`attachCombatComponents` выше), отдельная
  // система от вещмешка; класть его копию в инвентарь без синхронизации
  // с боем создало бы фальшивую механику экипировки.
  let inventoryState: InventoryState = createEmptyInventory();
  for (const [itemId, quantity] of [
    ['item.ammo_pistol', 20],
    ['item.cons_bint', 2],
    ['item.mat_detali', 3],
  ] as const) {
    inventoryState = addItem(inventoryState, itemRegistry, { itemId, quantity, uid: nextDevUid() }).state;
  }

  // В dev-room врагов спавнить сразу — там нет ни триггеров, ни сюжета,
  // `hero-movement.spec.ts`/`stress.spec.ts` рассчитаны именно на это. На
  // настоящей «Трубе» волна врагов спавнится по триггеру T3 (см. цикл кадра
  // ниже) — рецензия поймала, что раки стояли на карте с момента загрузки,
  // а не «выходили по сценарию» (`duxa-review-vs.md`, замечание 6). Карты
  // Акта 1 (OF-033, например `enemySpawns` «Панелей» — двое Подлинейных) не
  // размечают собственных сценарных триггеров-волн, как «Труба» — ДОПУЩЕНИЕ
  // OF-051: без выделенного триггера спавн на этих картах происходит сразу
  // по загрузке, тем же путём, что и dev-room.
  //
  // Карты Арены (OF-039, `isArenaMapId`) — исключение из этого допущения:
  // `map.enemySpawns` там читает не «спавни всё сразу», а собственный
  // волновой раннер (см. блок «Арена» ниже, `startArenaRun`) — иначе первая
  // же загрузка карты Арены выпустила бы все 10 волн одним залпом.
  if ((devRoom || map.id !== 'map.truba') && !isArenaMapId(map.id)) {
    spawnEnemiesFromMarkers(world, loadedMap.enemySpawnEntities);
  }

  const stress = isStressMode();
  if (stress) {
    spawnStressEnemies(world, map, 300);
    // Один залп частиц ~2000 штук сразу — нагрузочный сценарий пула частиц (§8 задачи).
    renderer.emitParticles({ kind: 'hit', wx: spawn.x, wy: spawn.y, count: 2000 });
  }

  // Вспышка попадания/смерти — единственная точка, где `game` слушает
  // боевые события `sim` и дёргает VFX рендера (события доставляются после
  // тика, ADR-002 §5; `sim`/`render` друг про друга не знают).
  const unsubscribeHit = world.events.on('combat.hit', (payload) => {
    renderer.emitParticles({
      kind: 'hit',
      wx: payload.wx,
      wy: payload.wy,
      count: payload.crit ? 10 : 5,
    });
  });
  const unsubscribeDeath = world.events.on('combat.death', (payload) => {
    renderer.emitParticles({ kind: 'death', wx: payload.wx, wy: payload.wy, count: 18 });
  });

  // Диалоги (OF-018/025): `gameState` живёт здесь и обновляется по мере
  // выборов игрока (`onStateChange`) — единственный держатель этого
  // состояния в демо-сцене на сегодня (инвентарь/квесты из диалогов пока не
  // синхронизированы с `src/game/inventory`/`src/game/quest` — см. TODO в
  // `interpreter.ts`, это не в скоупе этой волны). Пока открыт диалог, цикл
  // симуляции остановлен (`loop.stop()`/`loop.start()`) — бой не идёт с
  // диалоговым коробом на экране.
  let gameState: GameState = createGameState();
  let activeDialogue: ReturnType<typeof createDialogueScreen> | null = null;
  let activeInventory: InventoryScreen | null = null;

  function findNearestInteractableNpc(
    heroX: number,
    heroY: number,
  ): { npcId: string; dialog: Dialog } | null {
    let best: { npcId: string; dialog: Dialog; distSq: number } | null = null;
    for (const marker of loadedMap.npcEntities) {
      const spawnMarker = world.store('spawnMarker').get(marker);
      const transform = world.store('transform').get(marker);
      if (!spawnMarker || !transform) continue;
      const dialog = dialogsByNpcId.get(spawnMarker.refId);
      if (!dialog) continue;
      const resolvedFlag = ONE_SHOT_DIALOG_RESOLVED_FLAG[spawnMarker.refId];
      if (resolvedFlag !== undefined && gameState.flags[resolvedFlag] !== undefined) continue;
      const dx = transform.x - heroX;
      const dy = transform.y - heroY;
      const distSq = dx * dx + dy * dy;
      if (distSq > INTERACT_RADIUS * INTERACT_RADIUS) continue;
      if (!best || distSq < best.distSq) best = { npcId: spawnMarker.refId, dialog, distSq };
    }
    return best ? { npcId: best.npcId, dialog: best.dialog } : null;
  }

  /**
   * Открывает диалоговый короб поверх сцены — общая точка и для ручного
   * взаимодействия с NPC (`E` в радиусе), и для автоматического крючка
   * пролога (триггер T6, ниже): останавливает `loop` на время диалога,
   * синхронизирует `gameState`, зовёт `onClosed` после закрытия (например,
   * показать титр главы).
   */
  function openDialogue(dialog: Dialog, onClosed?: () => void): void {
    if (activeDialogue) return;
    loop.stop();
    activeDialogue = createDialogueScreen(root, dialog, gameState, t, {
      onStateChange(next): void {
        gameState = next;
      },
      onClose(): void {
        activeDialogue?.destroy();
        activeDialogue = null;
        loop.start();
        onClosed?.();
      },
    });
  }

  const unsubscribeInteract = world.events.on('input.interact-requested', (payload) => {
    if (activeDialogue) return;
    const target = findNearestInteractableNpc(payload.x, payload.y);
    if (!target) return;
    openDialogue(target.dialog);
  });

  /** Закрывает экран инвентаря — общая точка и для `KeyI`, и для клика по кнопке закрытия внутри панели (`onClose`). */
  function closeInventory(): void {
    if (!activeInventory) return;
    activeInventory.destroy();
    activeInventory = null;
    loop.start();
  }

  /**
   * Применяет игровые эффекты использованного расходника (OF-058, закрывает
   * P0-4 баланс-прохода — «лечения не существует физически») к ECS-герою —
   * единственный обработчик `heal` во всей игре: `game/inventory/**` не
   * знает о `World` (граница слоёв, докстринг `inventory.ts`), а общий
   * интерпретатор эффектов (`game/dialogue/interpreter.ts: applyEffect`)
   * тоже не имеет доступа к ECS (см. докстринг оператора `heal`,
   * `data/schemas/rules.ts`) — он умеет прибавлять только к плоскому
   * `GameState.hp`, который эта demo-сцена не использует как реальные ХП
   * героя. `demo-scene.ts` — единственный слой, у которого есть и
   * `ItemRegistry`/`item.effects`, и `world.store('health')`, поэтому здесь.
   * Сумма нескольких `heal`-эффектов одного предмета (гипотетически) —
   * складывается, лечение капается сверху `health.maxHp` (нельзя вылечить
   * «про запас» выше максимума).
   */
  function applyItemUseEffects(item: Item): void {
    const healAmount = item.effects.reduce(
      (sum, effect) => (effect.op === 'heal' ? sum + effect.amount : sum),
      0,
    );
    if (healAmount <= 0) return;
    const health = world.store('health').get(hero);
    if (!health) return;
    health.hp = Math.min(health.maxHp, health.hp + healAmount);
  }

  function openInventory(): void {
    // Сцена Родиона — реалтайм-таймер, который сознательно не ставится на
    // паузу меню (`docs/levels/01-truba.md` §11.2): открыть инвентарь и
    // «поставить игру на паузу» посреди спасения было бы честной дырой в
    // давлении времени, поэтому экран инвентаря здесь просто недоступен,
    // пока сцена не разрешена — так же, как он недоступен во время диалога.
    if (
      activeDialogue ||
      activeInventory ||
      (rodionSceneActive && !rodionResolved) ||
      (finalValveSceneActive && !finalValveResolved)
    ) {
      return;
    }
    loop.stop();
    activeInventory = createInventoryScreen(root, inventoryState, {
      registry: itemRegistry,
      armorSlots,
      karkas: PLAYER_KARKAS,
      t,
      onStateChange(next): void {
        inventoryState = next;
      },
      onUse: applyItemUseEffects,
      onClose: closeInventory,
    });
  }

  const handleInventoryKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyI') return;
    e.preventDefault();
    if (activeInventory) closeInventory();
    else openInventory();
  };
  window.addEventListener('keydown', handleInventoryKey);

  // Сцена Родиона (зона E, OF-049, `docs/levels/01-truba.md` §11): раньше
  // `E` рядом с Родионом открывал обычный диалог `prolog-vybor.json` —
  // модальное меню на два пункта без единого намёка на давление времени,
  // хотя весь пролог концепта построен вокруг «выбор под водой за секунды»
  // (P1 во всех трёх рецензиях duxa-simulator). Теперь это реалтайм-оверлей
  // поверх обычного геймплея: держать `E` `RODION_HOLD_THRESHOLD_SEC` секунд
  // подряд в радиусе Родиона — «вытащить» (`spas`); нажать `F` — «снять ключ
  // и уйти» (`klyuch`, необратимо через `RODION_SNAP_DURATION_MS`); бездействие
  // до истечения `RODION_SCENE_DURATION_MS` — честный форс-исход `klyuch` с
  // флагом `flag.truba.choice_timeout` (§11.5 п.1; про п.2 — форс по входу в
  // `trigger_t5` — см. отдельный комментарий у обработки триггеров ниже, он
  // не реализован буквально из-за геометрии карты). `flag.prolog_vybor` —
  // то же самое поле, которое уже читает `docs/narrative/main-quest.md` §2
  // (Q2), смысл трёх исходов не меняется.
  let rodionSceneActive = false;
  let rodionResolved = false;
  let rodionSceneStartMs = 0;
  let rodionHoldProgressSec = 0;
  let rodionEHeldRaw = false;
  let rodionSnapUntilMs: number | null = null;
  let rodionReleasedUntilMs: number | null = null;
  let rodionOutcomeMessage: string | null = null;
  let rodionOutcomeUntilMs: number | null = null;

  /** Хero в радиусе `npc.rodion` (тот же `INTERACT_RADIUS`, что и обычный диалог с NPC, §11.3). */
  function isHeroNearRodion(): boolean {
    const heroT = world.store('transform').get(hero);
    if (!heroT) return false;
    for (const marker of loadedMap.npcEntities) {
      const spawnMarker = world.store('spawnMarker').get(marker);
      const transform = world.store('transform').get(marker);
      if (!spawnMarker || !transform || spawnMarker.refId !== RODION_NPC_ID) continue;
      const dx = transform.x - heroT.x;
      const dy = transform.y - heroT.y;
      return dx * dx + dy * dy <= INTERACT_RADIUS * INTERACT_RADIUS;
    }
    return false;
  }

  /**
   * Фиксирует исход сцены (один раз — `rodionResolved` защищает от повторного
   * применения эффектов). `klyuch` (осознанный и по таймауту) кладёт латунный
   * ключ и в `gameState.inventory` (для условий диалогов/квестов через
   * `interpreter.ts`), и в настоящий `inventoryState` (чтобы предмет реально
   * появился на экране `I`, а не только в абстрактном порте интерпретатора —
   * та же пара, что уже используется для стартовых расходников выше).
   */
  function resolveRodionOutcome(outcome: 'spas' | 'klyuch', timeout: boolean): void {
    if (rodionResolved) return;
    rodionResolved = true;
    rodionSceneActive = false;
    rodionSnapUntilMs = null;
    rodionHoldProgressSec = 0;
    rodionReleasedUntilMs = null;

    const effects: Effect[] =
      outcome === 'spas'
        ? [{ op: 'setFlag', key: 'flag.prolog_vybor', value: 'spas' }]
        : [
            { op: 'setFlag', key: 'flag.prolog_vybor', value: 'klyuch' },
            { op: 'giveItem', item: 'item.quest_klyuch_shlyuza', count: 1 },
          ];
    if (timeout) effects.push({ op: 'setFlag', key: 'flag.truba.choice_timeout', value: true });
    gameState = applyEffects(gameState, effects);

    if (outcome === 'klyuch') {
      inventoryState = addItem(inventoryState, itemRegistry, {
        itemId: 'item.quest_klyuch_shlyuza',
        quantity: 1,
        uid: nextDevUid(),
      }).state;
      activeInventory?.update(inventoryState);
    }

    rodionOutcomeMessage = timeout
      ? 'Вода сомкнулась над Родионом. Ключ остался зажат у тебя в кулаке.'
      : outcome === 'spas'
        ? 'Родион свободен. Тащишь его наверх, к воздуху.'
        : 'Латунный ключ у тебя. Родион уходит под воду.';
    rodionOutcomeUntilMs = performance.now() + RODION_OUTCOME_MESSAGE_MS;
  }

  /** Раз в кадр, пока сцена активна и не разрешена: прогресс удержания/снятия ключа и таймаут (§11.2–11.5). Вызывается только вне паузы диалога/инвентаря — `loop.onFrame` не тикает во время неё. */
  function updateRodionScene(now: number, frameDtMs: number): void {
    if (rodionSnapUntilMs !== null) {
      if (now >= rodionSnapUntilMs) resolveRodionOutcome('klyuch', false);
    } else if (rodionEHeldRaw && isHeroNearRodion()) {
      rodionHoldProgressSec += frameDtMs / 1000;
      rodionReleasedUntilMs = null;
      if (rodionHoldProgressSec >= RODION_HOLD_THRESHOLD_SEC) {
        resolveRodionOutcome('spas', false);
        return;
      }
    } else if (rodionHoldProgressSec > 0) {
      // Отпустил `E` раньше времени или вышел из радиуса — прогресс
      // сбрасывается в 0, а не затухает (§11.3: «держишь — тащишь, отпустил
      // — начинай заново», осознанно простая модель).
      rodionHoldProgressSec = 0;
      rodionReleasedUntilMs = now + RODION_RELEASE_MESSAGE_MS;
    }

    // `rodionSnapUntilMs === null` — обязательное условие: `F`, нажатая до
    // истечения `T_scene`, гарантированно доигрывает свои `T_snap` до конца
    // (§11.4 — «таймер не обрывает уже начатое действие»). Без этой проверки
    // таймаут мог сработать в середине уже идущего снятия ключа и подменить
    // осознанный `klyuch` (`timeout: false`) форс-исходом `timeout: true` —
    // баг, пойманный живым прогоном `duxa-simulator` (четвёртая рецензия,
    // `docs/planerka/03-vs/duxa-review-vs-4.md`): нажатие `F` на 13,6–14,4с
    // истории сцены давало неверный флаг `flag.truba.choice_timeout = true`
    // и неверный текст исхода, хотя игрок успел осознанно нажать `F`.
    if (!rodionResolved && rodionSnapUntilMs === null && now - rodionSceneStartMs >= RODION_SCENE_DURATION_MS) {
      resolveRodionOutcome('klyuch', true);
    }
  }

  /** Строка HUD текущего состояния сцены (§11.7) — `null`, если сцена не идёт и нет свежего исхода. */
  function computeRodionHud(now: number): string | null {
    if (rodionOutcomeUntilMs !== null) {
      if (now < rodionOutcomeUntilMs) return rodionOutcomeMessage;
      rodionOutcomeUntilMs = null;
      rodionOutcomeMessage = null;
    }
    if (!rodionSceneActive || rodionResolved) return null;
    if (rodionSnapUntilMs !== null) return 'Срываешь цепочку с шеи Родиона…';
    if (rodionReleasedUntilMs !== null && now < rodionReleasedUntilMs) {
      return 'Не удержал! Родион дёрнулся под водой — начни заново.';
    }
    if (rodionHoldProgressSec > 0) {
      return `Тащишь Родиона… ${Math.floor(rodionHoldProgressSec)}/${RODION_HOLD_THRESHOLD_SEC}с. Не отпускай!`;
    }
    const tRemainingSec = Math.ceil(
      Math.max(0, RODION_SCENE_DURATION_MS - (now - rodionSceneStartMs)) / 1000,
    );
    return `Родион тонет: ${tRemainingSec}с — E держать, чтобы вытащить. F — сорвать ключ и уйти.`;
  }

  // `E`/`F` читаются отдельным сырым слушателем, а не через общий
  // `DomInputSource`/ECS `interactionSystem`: тому нужно continuous-состояние
  // «зажата ли клавиша прямо сейчас» (удержание), а не одноразовый `pressed`
  // на тик — повторный вызов `input.snapshot()` отсюда испортил бы
  // одноразовый набор `pressed` для настоящего тика симуляции (см. докстринг
  // `sim/systems/interaction.ts`). Тот же приём, что уже использует
  // `handleSaveLoadKey`/`handleInventoryKey` в этом файле.
  const handleRodionKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE') {
      rodionEHeldRaw = true;
      return;
    }
    if (e.code !== 'KeyF') return;
    if (!rodionSceneActive || rodionResolved || rodionSnapUntilMs !== null) return;
    if (!isHeroNearRodion()) return;
    rodionSnapUntilMs = performance.now() + RODION_SNAP_DURATION_MS;
    rodionHoldProgressSec = 0;
    rodionReleasedUntilMs = null;
  };
  const handleRodionKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE') rodionEHeldRaw = false;
  };
  const handleRodionBlur = (): void => {
    // Фокус ушёл со страницы — та же защита от «залипшей» клавиши, что уже
    // делает `dom-input.ts` для обычного ввода (Alt+Tab не должен оставить
    // удержание вечно активным).
    rodionEHeldRaw = false;
  };
  window.addEventListener('keydown', handleRodionKeyDown);
  window.addEventListener('keyup', handleRodionKeyUp);
  window.addEventListener('blur', handleRodionBlur);

  // Финальная сцена задвижки (`map.truba_final`, `trigger_final_valve`,
  // `docs/narrative/quests/act2-act3.md` §4.1) — та же модель реалтайм-
  // оверлея, что и сцена Родиона выше, с двумя отличиями: (1) исход `E`
  // зависит от `flag.storona` (какому лидеру присягнул игрок в Q5); (2) до
  // трёх клавиш действия вместо двух — `F` доступна только на ветке
  // `energosbyt` («довести вентиль до метки», альтернатива полному сбросу),
  // `G` — скрытая опция «выпить пузырёк со штаммом-0», видна и доступна
  // только при `Смекалка ≤ 3` (`FINAL_VALVE_SMEKALKA_THRESHOLD`) и
  // перекрывает любую ветку — это концовка «Очень чистый» (`main-quest.md`
  // §5.5). Контекстные реплики лидеров перед боем с боссом (`act2-act3.md`
  // §4.0, обычный `DialogSchema` без давления времени) в эту волну не
  // вошли — известный, честно задокументированный пробел (см. отчёт OF-036
  // в `docs/BACKLOG.md`), сама реалтайм-развязка от него не зависит.
  let finalValveSceneActive = false;
  let finalValveResolved = false;
  let finalValveSceneStartMs = 0;
  let finalValveHoldProgressSec = 0;
  let finalValveEHeldRaw = false;
  let finalValveSnapUntilMs: number | null = null;
  let finalValveDrinkUntilMs: number | null = null;
  let finalValveReleasedUntilMs: number | null = null;
  let finalValveOutcomeMessage: string | null = null;
  let finalValveOutcomeUntilMs: number | null = null;
  /** Разрешённая концовка (`world/endings.ts`) — не `null` с момента исхода сцены задвижки до конца сессии; переводит HUD в постоянный экран (см. `loop.onFrame`). */
  let finalEnding: EndingResult | null = null;
  /** Гвард на однократную остановку `loop` после того, как экран концовки реально отрисовался хотя бы один кадр — без него `loop.stop()` замер бы игру на кадре ДО текста концовки. */
  let gameEndedShown = false;

  function isHeroNearFinalValve(): boolean {
    const heroT = world.store('transform').get(hero);
    if (!heroT) return false;
    const dx = FINAL_VALVE_POSITION.x - heroT.x;
    const dy = FINAL_VALVE_POSITION.y - heroT.y;
    return dx * dx + dy * dy <= FINAL_VALVE_RADIUS * FINAL_VALVE_RADIUS;
  }

  /** `flag.storona` → какая из трёх формулировок исхода `E`/HUD активна (§4.1-4.2 источника). `progress2` и `neytralitet` (и любое ещё не решённое состояние) делят одну ветку — обе ведут к `chugunny_vek`. */
  function finalValveBranch(): 'energosbyt' | 'chistye' | 'progress2_neutral' {
    const storona = gameState.flags['flag.storona'];
    if (storona === 'energosbyt') return 'energosbyt';
    if (storona === 'chistye') return 'chistye';
    return 'progress2_neutral';
  }

  function resolveFinalValveOutcome(effects: readonly Effect[], message: string): void {
    if (finalValveResolved) return;
    finalValveResolved = true;
    finalValveSceneActive = false;
    finalValveSnapUntilMs = null;
    finalValveDrinkUntilMs = null;
    finalValveHoldProgressSec = 0;
    gameState = applyEffects(gameState, effects);
    finalValveOutcomeMessage = message;
    finalValveOutcomeUntilMs = performance.now() + FINAL_VALVE_OUTCOME_MESSAGE_MS;

    // Найдено шестой рецензией duxa-simulator (P0, `duxa-review-vs-6.md`):
    // до этой правки `flag.truba_deystviye` фиксировался без проверки
    // репутации, и вообще никакого экрана-итога не было — сцена
    // заканчивалась, игра просто продолжала идти дальше. `resolveEnding`
    // (`world/endings.ts`) — честное разрешение одной из 5 концовок
    // `main-quest.md` §5 по уже применённым выше флагам; `finalEnding`
    // переводит HUD в постоянный текст-экран конца игры (см. композицию
    // HUD в `loop.onFrame`), а не в очередную временную строку, как у
    // остальных исходов этой сцены.
    const deystviye = gameState.flags['flag.truba_deystviye'];
    finalEnding = resolveEnding(typeof deystviye === 'string' ? deystviye : undefined, gameState.flags);
  }

  function resolveFinalValveHoldOutcome(): void {
    const branch = finalValveBranch();
    if (branch === 'energosbyt') {
      resolveFinalValveOutcome(
        [
          { op: 'setFlag', key: 'flag.truba_deystviye', value: 'vtoroy_sbros' },
          { op: 'setFlag', key: 'flag.energosbyt_final', value: 'polny_sbros' },
        ],
        'Задвижка открыта до конца. Вода уходит в Ольху — вся, сразу.',
      );
    } else if (branch === 'chistye') {
      resolveFinalValveOutcome(
        [{ op: 'setFlag', key: 'flag.truba_deystviye', value: 'vzryv_plotiny' }],
        'Плотина вздрагивает и оседает. Ольха свободна.',
      );
    } else {
      resolveFinalValveOutcome(
        [{ op: 'setFlag', key: 'flag.truba_deystviye', value: 'chugunny_vek' }],
        'Шов остывает. Задвижка теперь просто кусок железа — как весь этот город.',
      );
    }
  }

  /** Раз в кадр, пока сцена активна и не разрешена — тот же порядок проверок, что `updateRodionScene` (снятие/питьё сначала, таймаут — последним и только если ни одно фиксированное действие не идёт, см. докстринг про гонку у Родиона). */
  function updateFinalValveScene(now: number, frameDtMs: number): void {
    if (finalValveSnapUntilMs !== null) {
      if (now >= finalValveSnapUntilMs) {
        resolveFinalValveOutcome(
          [
            { op: 'setFlag', key: 'flag.truba_deystviye', value: 'po_schetchiku' },
            { op: 'setFlag', key: 'flag.energosbyt_final', value: 'dozirovka' },
          ],
          'Вентиль встал на метку. Сброс дозирован — как договаривались.',
        );
      }
    } else if (finalValveDrinkUntilMs !== null) {
      if (now >= finalValveDrinkUntilMs) {
        resolveFinalValveOutcome(
          [{ op: 'setFlag', key: 'flag.truba_deystviye', value: 'ochen_chisty' }],
          'Готово. Больше вопросов нет. Очень, очень чисто.',
        );
      }
    } else if (finalValveEHeldRaw && isHeroNearFinalValve()) {
      finalValveHoldProgressSec += frameDtMs / 1000;
      finalValveReleasedUntilMs = null;
      if (finalValveHoldProgressSec >= FINAL_VALVE_HOLD_THRESHOLD_SEC) {
        resolveFinalValveHoldOutcome();
        return;
      }
    } else if (finalValveHoldProgressSec > 0) {
      finalValveHoldProgressSec = 0;
      finalValveReleasedUntilMs = now + FINAL_VALVE_RELEASE_MESSAGE_MS;
    }

    if (
      !finalValveResolved &&
      finalValveSnapUntilMs === null &&
      finalValveDrinkUntilMs === null &&
      now - finalValveSceneStartMs >= FINAL_VALVE_SCENE_DURATION_MS
    ) {
      resolveFinalValveOutcome(
        [
          { op: 'setFlag', key: 'flag.truba_deystviye', value: 'chugunny_vek' },
          { op: 'setFlag', key: 'flag.truba_final.choice_timeout', value: true },
        ],
        'Руки не решились. Задвижка осталась там, где была тридцать лет — ни туда, ни сюда.',
      );
    }
  }

  function computeFinalValveHud(now: number): string | null {
    if (finalValveOutcomeUntilMs !== null) {
      if (now < finalValveOutcomeUntilMs) return finalValveOutcomeMessage;
      finalValveOutcomeUntilMs = null;
      finalValveOutcomeMessage = null;
    }
    if (!finalValveSceneActive || finalValveResolved) return null;
    const branch = finalValveBranch();
    if (finalValveSnapUntilMs !== null) return 'Ставишь дозирующий вентиль на отметку тарифа…';
    if (finalValveDrinkUntilMs !== null) return 'Поднимаешь пузырёк. Пьёшь.';
    if (finalValveReleasedUntilMs !== null && now < finalValveReleasedUntilMs) {
      if (branch === 'energosbyt') return 'Сорвалась рука — маховик провернулся назад. Начни заново.';
      if (branch === 'chistye') return 'Руки дрогнули — цепь разомкнулась. Начни заново.';
      return 'Шов не взялся — металл ещё горячий. Начни заново.';
    }
    if (finalValveHoldProgressSec > 0) {
      const label =
        branch === 'energosbyt'
          ? 'Крутишь маховик'
          : branch === 'chistye'
            ? 'Держишь провода вместе'
            : 'Держишь горелку на шве';
      return `${label}… ${Math.floor(finalValveHoldProgressSec)}/${FINAL_VALVE_HOLD_THRESHOLD_SEC}с. Не отпускай!`;
    }
    const tRemainingSec = Math.ceil(
      Math.max(0, FINAL_VALVE_SCENE_DURATION_MS - (now - finalValveSceneStartMs)) / 1000,
    );
    if (branch === 'energosbyt') {
      return `Задвижка перед тобой: ${tRemainingSec}с. E — открыть до конца. F — довести до метки.`;
    }
    if (branch === 'chistye') return `Заряды заложены: ${tRemainingSec}с. E — замкнуть цепь.`;
    return `Задвижка перед тобой: ${tRemainingSec}с. E — заварить намертво.`;
  }

  const handleFinalValveKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE') {
      finalValveEHeldRaw = true;
      return;
    }
    if (e.code === 'KeyF') {
      if (!finalValveSceneActive || finalValveResolved || finalValveSnapUntilMs !== null || finalValveDrinkUntilMs !== null) return;
      if (finalValveBranch() !== 'energosbyt') return;
      if (!isHeroNearFinalValve()) return;
      finalValveSnapUntilMs = performance.now() + FINAL_VALVE_SNAP_DURATION_MS;
      finalValveHoldProgressSec = 0;
      finalValveReleasedUntilMs = null;
      return;
    }
    if (e.code === 'KeyG') {
      if (!finalValveSceneActive || finalValveResolved || finalValveSnapUntilMs !== null || finalValveDrinkUntilMs !== null) return;
      const smekalka = gameState.stats.smekalka;
      if (smekalka > FINAL_VALVE_SMEKALKA_THRESHOLD) return;
      if (!isHeroNearFinalValve()) return;
      finalValveDrinkUntilMs = performance.now() + FINAL_VALVE_DRINK_DURATION_MS;
      finalValveHoldProgressSec = 0;
      finalValveReleasedUntilMs = null;
    }
  };
  const handleFinalValveKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE') finalValveEHeldRaw = false;
  };
  const handleFinalValveBlur = (): void => {
    finalValveEHeldRaw = false;
  };
  window.addEventListener('keydown', handleFinalValveKeyDown);
  window.addEventListener('keyup', handleFinalValveKeyUp);
  window.addEventListener('blur', handleFinalValveBlur);

  // OF-019: ручное сохранение/загрузка — F5/F9. Полноценный UI слотов не в
  // скоупе этой задачи; здесь минимум, достаточный, чтобы «сейв → загрузка →
  // бой продолжается» можно было проверить руками в демо-сцене. Инвентарь
  // (`inventoryState`, OF-027) — обычные данные, форма `SaveState.inventory`
  // зеркалит `InventoryState` один в один (`save-schema.ts`), поэтому кладём
  // и читаем напрямую без отдельных capture/apply-функций, как для героя/оружия.
  // Флаги/квесты — из `gameState`, который меняют диалоги.
  const saveStore = createSaveStore(window.localStorage);

  function captureDemoSaveState(): SaveState {
    return {
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
      savedAtMs: Date.now(),
      hero: captureHeroSave(world, hero),
      weapons: captureWeaponsSave(world, hero),
      inventory: inventoryState,
      flags: gameState.flags,
      quests: gameState.quests,
      rngSeed: DEV_SEED,
      worldTick: world.tick,
    };
  }

  const handleSaveLoadKey = (e: KeyboardEvent): void => {
    if (e.code === 'F5') {
      e.preventDefault();
      saveStore.save(captureDemoSaveState());
      console.log('[save] сохранено (F9 — загрузить)');
    } else if (e.code === 'F9') {
      e.preventDefault();
      const loaded = saveStore.load();
      if (!loaded) {
        console.warn('[save] сохранений нет — сначала F5');
        return;
      }
      applyHeroSave(world, hero, loaded.hero);
      applyWeaponsSave(world, hero, loaded.weapons);
      gameState = { ...gameState, flags: loaded.flags, quests: loaded.quests };
      inventoryState = toInventoryState(loaded.inventory);
      activeInventory?.update(inventoryState);
      console.log('[save] загружено');
    }
  };
  window.addEventListener('keydown', handleSaveLoadKey);

  // OF-039 §5 («выход из Арены без перезагрузки страницы»): `Escape`, пока
  // загружена карта Арены и вызывающая сторона передала `onExitToMenu`
  // (сцена, запущенная через меню «АРЕНА» на титульнике — `main.ts`),
  // уничтожает саму себя и возвращает игрока в меню. См. докстринг
  // `DemoSceneOptions.onExitToMenu` — сознательно упрощённая версия: не
  // общий пауза-выход из кампании (такой механики нет и не заводится этой
  // задачей), работает только на картах Арены.
  const handleExitToMenuKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape') return;
    if (!options.onExitToMenu || !isArenaMapId(map.id)) return;
    e.preventDefault();
    options.onExitToMenu();
  };
  window.addEventListener('keydown', handleExitToMenuKey);

  const simulation = createSimulation(world);
  const input: DomInputHandle = createDomInputSource(window);
  const raf = createBrowserRaf();
  // OF-056: `input.source` из `dom-input.ts` заполняет только `aimScreen`
  // (сырые `clientX/clientY`, см. докстринг файла) — `sim` физически не
  // читает это поле, ему нужен `aimWorld` (мировые координаты курсора,
  // `sim/systems/combat.ts: handlePlayerFacing`). Пересчёт — здесь, а не в
  // `dom-input.ts`/`core`, по той же причине, по которой `applyArenaModifiersToInput`
  // ниже тоже оборачивает `InputSource`: `demo-scene.ts` — единственный
  // слой, которому разрешено знать одновременно про `render` (нужен
  // `renderer.screenToWorld` — обратная камере проекция) и про `input`.
  // `canvas.getBoundingClientRect()` вычитается здесь (не в `dom-input.ts`,
  // который не должен знать о геометрии конкретного канваса — только о
  // `window`-событиях), `camera` читается по актуальному состоянию на
  // момент КАЖДОГО вызова `snapshot()` (замыкание над `let`-переменной ниже,
  // объявленной по коду позже — безопасно: тело функции выполняется только
  // при первом реальном тике, после того как `camera` уже присвоена).
  const aimInput: InputSource = {
    snapshot(): InputSnapshot {
      const raw = input.source.snapshot();
      const rect = canvas.getBoundingClientRect();
      const { wx, wy } = renderer.screenToWorld(
        raw.aimScreen.x - rect.left,
        raw.aimScreen.y - rect.top,
        camera,
      );
      return { ...raw, aimWorld: { x: wx, y: wy } };
    },
  };
  // Модификаторы Арены (OF-039, «без рывка»/«только ножи») — чистая
  // трансформация снимка ввода ДО того, как он доходит до `sim.step()`;
  // `sim` не знает о существовании Арены (`world/arena.ts`, докстринг
  // `applyArenaModifiersToInput`). Без активных модификаторов (обычная
  // кампания, либо Арена без выбранных модификаторов) — тот же самый
  // `aimInput`, только пересчёт прицела, без лишней обёртки поверх.
  const simulationInput: InputSource =
    arenaModifiers.length > 0
      ? { snapshot: () => applyArenaModifiersToInput(aimInput.snapshot(), arenaModifiers) }
      : aimInput;
  const loop = createLoop(simulation, simulationInput, raf);

  // Панорама (концепт §6, 3–8 сек): камера стоит на `P` и не следует за
  // героем первые `PANORAMA_DURATION_MS` — установочный план перед тем, как
  // отдать камеру игроку. До этой правки её не было вообще: клик «Погнали»
  // сразу ставил камеру на героя в произвольной точке карты
  // (`duxa-review-vs.md` п.1, «угол коробки вместо панорамы», OF-047).
  // OF-051: панорама — часть именно самого первого захода в игру на «Трубе»
  // (сценарий "Погнали" → пролог), не переигрывается при повторном заходе на
  // «Трубу» через `exits[]` (`switchMap` ниже сознательно не трогает
  // `panoramaUntilMs`) — это происходит один раз здесь, при первичной
  // загрузке сцены.
  const isInitialTruba = !devRoom && map.id === 'map.truba';
  const camera = isInitialTruba
    ? createCamera({ x: TRUBA_PANORAMA_POINT.x, y: TRUBA_PANORAMA_POINT.y, zoom: PANORAMA_ZOOM })
    : createCamera({ x: spawn.x, y: spawn.y, zoom: GAMEPLAY_ZOOM });
  let panoramaUntilMs: number | null = isInitialTruba ? performance.now() + PANORAMA_DURATION_MS : null;

  // Триггеры карты (T1–T6 на «Трубе», плюс общие checkpoint/available-флаги
  // на картах Акта 1, `public/data/maps/*.json`) — до OF-049 лежали в данных
  // мёртвым грузом (`duxa-review-vs.md` п.3): ни подсказки управления, ни
  // волны врагов по сценарию, ни крючка пролога. `devRoom` не участвует —
  // там `map.triggers` пуст, раннер там холостой. `let`: `switchMap`
  // пересоздаёт раннер под новую карту — триггеры одной локации не должны
  // проверяться на геометрии другой.
  let triggerRunner = createTriggerRunner(map);
  let hintUntilMs: number | null = null;
  let heroDeadSinceMs: number | null = null;
  /** Идёт ли прямо сейчас переход между картами (`switchMap`) — защита от повторного запуска, пока предыдущий переход ещё грузится. */
  let mapTransitionPending = false;
  /**
   * Пока не `null` — точка на карте, в радиусе которой `exits[]` не
   * проверяются вообще. `resolveEntryPoint` (см. её докстринг выше)
   * намеренно высаживает героя РОВНО на клетке зеркального `exit` целевой
   * карты (`plotina.exit_to_garazhi` и т.п., расстояние 0) — без этой
   * защиты следующий же кадр немедленно нашёл бы этот `exit` в
   * `EXIT_RADIUS` и запустил переход назад, откуда герой только что пришёл,
   * бесконечным пинг-понгом. Позиционная (не временная) защита: снимается,
   * как только герой физически выходит из `EXIT_RADIUS` этой точки — герой
   * волен стоять сколько угодно, не отброшен обратно ни через секунду, ни
   * через десять.
   */
  let suppressedExitPosition: Vector2 | null = null;

  const fpsOverlay = createFpsOverlay(root);

  // -------------------------------------------------------------------
  // Арена (OF-039): волновой раннер поверх `map.arena_1/2/3`
  // (`docs/levels/08-arena.md`) — активен, только пока загружена карта
  // Арены (`isArenaMapId(map.id)`), независимо от того, как игрок туда
  // попал (меню `main.ts` с `options.arenaModifiers`, или прямой
  // отладочный `?map=arena_1` — тогда модификаторы пусты). Волновая кривая
  // (какие точки `enemySpawns[]` брать на волну N) — чистая функция
  // `selectWaveSpawns` (`world/arena.ts`); здесь только оркестрация живого
  // мира: спавн выбранных точек, детект «волна зачищена» (`enemy`-запрос
  // пуст), пауза перед следующей волной, фиксация рекорда на завершении
  // забега (смерть/выход через `exit`/победа на волне 10 — `finishArenaRun`,
  // идемпотентно через `arenaRunFinished`, чтобы забег не засчитался
  // дважды, если оба триггера сработают один за другим).
  const arenaRecordsStore = createArenaRecordsStore(window.localStorage);
  let arenaWave = 0;
  let arenaWavesCleared = 0;
  let arenaRunFinished = false;
  let arenaIntermissionUntilMs: number | null = null;
  let arenaOutcomeMessage: string | null = null;
  let arenaStartMs = 0;

  function spawnArenaWave(wave: number): void {
    for (const point of selectWaveSpawns(map.enemySpawns, wave)) {
      if (!SPAWNABLE_ENEMY_DEF_IDS.has(point.enemyId as EnemyDefId)) continue;
      spawnEnemy(world, point.enemyId as EnemyDefId, point.position);
    }
  }

  function startArenaRun(now: number): void {
    arenaWave = 1;
    arenaWavesCleared = 0;
    arenaRunFinished = false;
    arenaOutcomeMessage = null;
    arenaIntermissionUntilMs = null;
    arenaStartMs = now;
    spawnArenaWave(arenaWave);
  }

  /**
   * `reason`: `'death'` — герой погиб посреди волны; `'left'` — вышел через
   * `exit` карты, не закончив забег; `'victory'` — зачистил волну 10.
   * Идемпотентно (`arenaRunFinished`-гвард, тот же приём, что
   * `resolveRodionOutcome`/`resolveFinalValveOutcome` выше) — рекорд не
   * перезаписывается повторно, если, например, смерть и последующий выход
   * через `exit` сработают в один и тот же уже завершённый забег.
   */
  function finishArenaRun(reason: 'death' | 'left' | 'victory', now: number): void {
    if (arenaRunFinished) return;
    arenaRunFinished = true;
    arenaIntermissionUntilMs = null;
    const survivalMs = Math.max(0, now - arenaStartMs);
    const record = arenaRecordsStore.recordRun({
      mapId: map.id,
      modifiers: arenaModifiers,
      wavesCleared: arenaWavesCleared,
      survivalMs,
    });
    const survivalLabel = formatArenaSurvival(survivalMs);
    const recordLabel = `рекорд карты: волна ${record.bestWavesCleared}/${ARENA_WAVE_COUNT}, ${formatArenaSurvival(record.bestSurvivalMs)}`;
    arenaOutcomeMessage =
      reason === 'victory'
        ? `АРЕНА ПРОЙДЕНА — все ${ARENA_WAVE_COUNT} волн позади за ${survivalLabel}. ${recordLabel}.`
        : reason === 'death'
          ? `Пал на волне ${arenaWave}. Волн зачищено: ${arenaWavesCleared}, время — ${survivalLabel}. ${recordLabel}.`
          : `Забег прерван. Волн зачищено: ${arenaWavesCleared}, время — ${survivalLabel}. ${recordLabel}.`;
  }

  /** Раз в кадр, пока карта — Арена и забег не завершён: пауза между волнами → спавн следующей; иначе — детект «все враги текущей волны мертвы» → пауза (или финал на волне 10). */
  function updateArenaRun(now: number): void {
    if (arenaIntermissionUntilMs !== null) {
      if (now < arenaIntermissionUntilMs) return;
      arenaIntermissionUntilMs = null;
      arenaWave += 1;
      spawnArenaWave(arenaWave);
      return;
    }
    let hasAliveEnemy = false;
    for (const _entity of world.query('enemy')) {
      hasAliveEnemy = true;
      break;
    }
    if (hasAliveEnemy) return;
    arenaWavesCleared = arenaWave;
    if (arenaWave >= ARENA_WAVE_COUNT) {
      finishArenaRun('victory', now);
      return;
    }
    arenaIntermissionUntilMs = now + ARENA_INTERMISSION_MS;
  }

  /** HUD-строка Арены — `null` вне карты Арены (обычный HUD кампании остаётся нетронутым). */
  function computeArenaHud(now: number): string | null {
    if (!isArenaMapId(map.id)) return null;
    if (arenaOutcomeMessage !== null) return arenaOutcomeMessage;
    if (arenaIntermissionUntilMs !== null) {
      const remainSec = Math.max(0, Math.ceil((arenaIntermissionUntilMs - now) / 1000));
      return `Волна ${arenaWave} зачищена. Следующая через ${remainSec}с…`;
    }
    return `Арена: волна ${arenaWave}/${ARENA_WAVE_COUNT}`;
  }

  if (isArenaMapId(map.id)) startArenaRun(performance.now());

  /** Ищет `exit` текущей карты в радиусе героя (`EXIT_RADIUS`) — раз в кадр, тем же приёмом, что и триггеры ниже. */
  function findNearbyExit(heroX: number, heroY: number): MapExit | null {
    for (const exit of map.exits) {
      const dx = exit.position.x - heroX;
      const dy = exit.position.y - heroY;
      if (dx * dx + dy * dy <= EXIT_RADIUS * EXIT_RADIUS) return exit;
    }
    return null;
  }

  /**
   * Переход на другую карту через `exit` (OF-051, `MapSchema.exits`). Сносит
   * сущности старой карты (стены/`spawnMarker`-метки NPC-врагов-предметов/
   * сетку коллизии) и всех живых врагов/снарядов текущей боевой сцены — они
   * принадлежат старой локации и не должны «утекать» на новую вместе с
   * игроком. Герой (health/weapons/perks/progression — всё, что висит на
   * его `EntityId`, плюс инвентарь/флаги квестов в замыкании сцены) не
   * пересоздаётся и не трогается — это тот же самый герой, просто в другом
   * месте.
   *
   * `exit.toMap === map.id` — защита от самоссылающегося `exit` (не
   * встречается сегодня ни на одной карте графа, `truba.exit_to_river`
   * теперь ведёт в `map.garazhi` — седьмая рецензия duxa-simulator нашла,
   * что без реального перехода игрок физически не мог выйти из пролога при
   * обычном запуске игры без `?map=`, см. `OF-053`): без этого условия
   * герой в радиусе `EXIT_RADIUS` от такой гипотетической точки
   * телепортировался бы «на ту же карту» в бесконечном цикле каждый кадр.
   */
  async function switchMap(exit: MapExit): Promise<void> {
    if (exit.toMap === map.id || mapTransitionPending) return;
    mapTransitionPending = true;
    loop.stop();
    try {
      const fromMapId = map.id;
      const nextMap = await loadMapById(exit.toMap);
      // Сетевая часть (карта + диалоги новых NPC) — вся ДО того, как мир
      // вообще тронут: герой в этот момент ещё физически стоит на старой
      // карте, `map`/`loadedMap`/`getMapId()` снаружи всё ещё указывают на
      // неё. Иначе (если грузить диалоги уже ПОСЛЕ переключения `map`)
      // возникало бы рассинхронизированное окно — карта формально уже
      // новая, а диалоги её NPC ещё не пришли, и `[E]` рядом с ними не
      // работает несколько кадров/секунд без видимой причины снаружи.
      let nextHookDialog = hookDialog;
      if (nextMap.id === 'map.truba' && !nextHookDialog) nextHookDialog = await loadDialog('prolog-kruchok');
      await loadDialogsForMap(nextMap, dialogsByNpcId);

      // Арена (OF-039): выход через `exit` карты Арены до победы на волне 10
      // — забег засчитывается как прерванный («left»), с тем прогрессом
      // волн, что уже был зачищен (см. докстринг `finishArenaRun`). Не
      // встречается в графе кампании сегодня (`exits[]` карт Арены ведут
      // только на `map.garazhi`, `08-arena.md` §0.3, обратного ребра нет) —
      // защита на будущее/дебаг-переходы, не мёртвый код: без неё выход из
      // Арены посреди волны молча терял бы прогресс забега.
      if (isArenaMapId(map.id) && !arenaRunFinished) finishArenaRun('left', performance.now());

      for (const entity of loadedMap.wallEntities) world.destroy(entity);
      for (const entity of loadedMap.npcEntities) world.destroy(entity);
      for (const entity of loadedMap.enemySpawnEntities) world.destroy(entity);
      for (const entity of loadedMap.itemPickupEntities) world.destroy(entity);
      world.destroy(loadedMap.mapEntity);
      for (const entity of [...world.query('enemy')]) world.destroy(entity);
      for (const entity of [...world.query('projectile')]) world.destroy(entity);

      map = nextMap;
      hookDialog = nextHookDialog;
      loadedMap = loadMapIntoWorld(world, map);
      itemPickupEntityById = buildItemPickupEntityMap(map, loadedMap);
      // OF-058: если герой уже подбирал точку лута этой карты в прошлый
      // визит (`gameState.flags`, ключ `itemPickupFlagKey`), её свежая
      // `spawnMarker`-метка (только что созданная `loadMapIntoWorld` выше,
      // она ничего не знает про историю визитов) сносится сразу — иначе
      // предмет молча ждал бы следующего прохода героя мимо и подбирался
      // бы второй раз (флаг блокирует повторный `addItem` в
      // `collectNearbyItemPickups`, но не сам факт, что нетронутая метка
      // осталась бы висеть в мире).
      for (const [pickupId, entity] of itemPickupEntityById) {
        if (gameState.flags[itemPickupFlagKey(map.id, pickupId)] === true) world.destroy(entity);
      }
      renderer.setMap(toRendererMapData(map));
      triggerRunner = createTriggerRunner(map);
      // См. ДОПУЩЕНИЕ у начального спавна dev-room/Акта 1 выше: без
      // сценарной волны (как T3 на «Трубе») спавним по факту загрузки карты.
      // Карта Арены — свой волновой раннер (`startArenaRun` ниже), не общий
      // «спавни всё сразу».
      if (map.id !== 'map.truba' && !isArenaMapId(map.id)) {
        spawnEnemiesFromMarkers(world, loadedMap.enemySpawnEntities);
      }
      if (isArenaMapId(map.id)) startArenaRun(performance.now());

      spawn = resolveEntryPoint(map, exit, fromMapId);
      const heroTransform = world.store('transform').get(hero);
      if (heroTransform) {
        heroTransform.x = spawn.x;
        heroTransform.y = spawn.y;
        heroTransform.prevX = spawn.x;
        heroTransform.prevY = spawn.y;
      }
      const heroVelocity = world.store('velocity').get(hero);
      if (heroVelocity) {
        heroVelocity.vx = 0;
        heroVelocity.vy = 0;
      }

      followTarget(camera, spawn.x, spawn.y);
      camera.zoom = GAMEPLAY_ZOOM;
      clampToMapBounds(camera, map.width, map.height);
      // Переходы между картами никогда не показывают панораму заново — она
      // принадлежит только самому первому запуску сцены (см. `isInitialTruba`
      // выше), и HUD-подсказка WASD (T1) тоже не переносится на новую карту.
      panoramaUntilMs = null;
      hintUntilMs = null;
      // См. докстринг `suppressedExitPosition`: подавляем `exits[]` новой
      // карты, если герой высадился в радиусе одного из них (обычно —
      // зеркальный `exit`, найденный `resolveEntryPoint`), пока не отойдёт.
      suppressedExitPosition = map.exits.some((candidate) => {
        const dx = candidate.position.x - spawn.x;
        const dy = candidate.position.y - spawn.y;
        return dx * dx + dy * dy <= EXIT_RADIUS * EXIT_RADIUS;
      })
        ? { x: spawn.x, y: spawn.y }
        : null;
    } finally {
      mapTransitionPending = false;
      loop.start();
    }
  }

  const unsubscribeFrame = loop.onFrame((alpha, frameDtMs) => {
    const now = performance.now();
    const panoramaActive = panoramaUntilMs !== null && now < panoramaUntilMs;
    if (panoramaUntilMs !== null && !panoramaActive) {
      // Панорама только что закончилась — отдаём камеру герою и снимаем зум.
      camera.zoom = GAMEPLAY_ZOOM;
      panoramaUntilMs = null;
    }

    // Камера следует за героем — первая (и пока единственная) `controlled`-
    // сущность мира; интерполяция та же, что использует рендер для отрисовки
    // (§3.1), иначе камера и герой рассинхронизируются на глаз. Во время
    // панорамы камера намеренно не следует — стоит на `P`.
    let heroTransform: { x: number; y: number; prevX: number; prevY: number } | undefined;
    for (const entity of world.query('transform', 'controlled')) {
      const transform = world.store('transform').get(entity);
      if (!transform) continue;
      heroTransform = transform;
      if (!panoramaActive) {
        const ix = transform.prevX + (transform.x - transform.prevX) * alpha;
        const iy = transform.prevY + (transform.y - transform.prevY) * alpha;
        followTarget(camera, ix, iy);
      }
      break;
    }
    if (!panoramaActive) clampToMapBounds(camera, map.width, map.height);

    renderer.draw(world, camera, alpha);

    if (heroTransform && !devRoom && !activeDialogue && !mapTransitionPending) {
      // Подбор предметов (OF-058, `world/item-pickup.ts`, закрывает P0-4/
      // P2-1 баланс-прохода): раньше проверки exit/триггеров — герой может
      // одновременно стоять и рядом с точкой лута, и рядом с дверью/
      // триггером, оба должны сработать в один и тот же кадр (в отличие от
      // exit/триггеров ниже, которые исключают друг друга через `else`).
      const pickupResult = collectNearbyItemPickups({
        pickups: map.itemPickups,
        heroPosition: { x: heroTransform.x, y: heroTransform.y },
        radius: ITEM_PICKUP_RADIUS,
        mapId: map.id,
        flags: gameState.flags,
        inventoryState,
        registry: itemRegistry,
        nextUid: nextDevUid,
      });
      if (pickupResult.collectedIds.length > 0) {
        inventoryState = pickupResult.inventoryState;
        gameState = { ...gameState, flags: pickupResult.flags };
        activeInventory?.update(inventoryState);
        for (const pickupId of pickupResult.collectedIds) {
          const entity = itemPickupEntityById.get(pickupId);
          if (entity !== undefined) world.destroy(entity);
        }
      }

      // Переход между картами (OF-051) проверяется раньше триггеров текущей
      // карты и, если сработал, полностью замещает обработку триггеров на
      // этот кадр — герой стоит у двери, а не одновременно и у двери, и в
      // зоне какого-то другого триггера этой же карты.
      if (suppressedExitPosition) {
        const dx = suppressedExitPosition.x - heroTransform.x;
        const dy = suppressedExitPosition.y - heroTransform.y;
        if (dx * dx + dy * dy > EXIT_RADIUS * EXIT_RADIUS) suppressedExitPosition = null;
      }
      const exit = suppressedExitPosition ? null : findNearbyExit(heroTransform.x, heroTransform.y);
      if (exit) {
        void switchMap(exit);
      } else {
        const triggerResult = triggerRunner.update(heroTransform.x, heroTransform.y, gameState);
        gameState = triggerResult.state;
        if (triggerResult.firedIds.includes('trigger_t1')) hintUntilMs = now + 6000;
        if (triggerResult.firedIds.includes('trigger_t3')) {
          spawnEnemiesFromMarkers(world, loadedMap.enemySpawnEntities);
        }
        if (triggerResult.firedIds.includes('trigger_t4') && !rodionResolved) {
          rodionSceneActive = true;
          rodionSceneStartMs = now;
        }
        if (triggerResult.firedIds.includes('trigger_final_valve') && !finalValveResolved) {
          finalValveSceneActive = true;
          finalValveSceneStartMs = now;
        }
        // `prolog-kruchok.json` сам заканчивается узлом «title» (speaker
        // «narrator», текст — «Глава 1. Труба») — титр главы уже часть
        // диалога, отдельного оверлея поверх сцены не нужно.
        if (triggerResult.firedIds.includes('trigger_t6') && hookDialog) {
          openDialogue(hookDialog);
        }

        if (rodionSceneActive && !rodionResolved) {
          updateRodionScene(now, frameDtMs);
        }
        if (finalValveSceneActive && !finalValveResolved) {
          updateFinalValveScene(now, frameDtMs);
        }
        if (isArenaMapId(map.id) && !arenaRunFinished) {
          updateArenaRun(now);
        }
        // §11.5 п.2 карты (форс-развязка при входе в T5 без разрешённой сцены)
        // сознательно не реализован буквально: `trigger_t5` стоит в (30,54) с
        // радиусом 3, а Родион — в (30,52), то есть его собственная точка уже
        // внутри радиуса T5 (расстояние 2 ≤ 3). Взятая по спеке буквально,
        // форс-развязка срабатывала бы в момент простого подхода к Родиону для
        // интеракции — раньше, чем игрок вообще успевает нажать `E`/`F` (баг,
        // пойманный `tests/e2e/rodion-scene.spec.ts` при реализации). Таймер
        // `RODION_SCENE_DURATION_MS` (15с, §11.5 п.1) — тот же самый честный
        // форс-исход, не зависит от позиции игрока и уже полностью гарантирует
        // «сцена не подвиснет навсегда» без этого дополнительного триггера;
        // `trigger_t5` продолжает штатно ставить `flag.truba.zone_e_closed`
        // через собственный эффект в `truba.json`, это не убрано.
      }
    }

    // Смерть героя (OF-016 останавливает движение на HP≤0, `input-control.ts`,
    // но ничего дальше не происходило — герой замирал навсегда, если игрок
    // не сохранился заранее, `docs/qa/vs-report.md` P0 «смерть без обратной
    // связи»). Автовозрождение на точке старта — простейшая честная починка
    // для вертикального среза, не полноценный экран смерти.
    const health = heroTransform ? world.store('health').get(hero) : undefined;
    if (health) {
      if (health.hp <= 0 && heroDeadSinceMs === null) {
        heroDeadSinceMs = now;
        // Арена (OF-039): смерть посреди забега заканчивает его — рекорд
        // фиксируется по волнам, зачищенным ДО смерти (`arenaWavesCleared`,
        // обновляется только в `updateArenaRun` на полностью зачищенной
        // волне). Автовозрождение ниже всё равно происходит (тот же путь,
        // что и в кампании) — герой не застревает трупом, но новые волны
        // Арены больше не спавнятся (`arenaRunFinished`-гвард в `onFrame`).
        if (isArenaMapId(map.id) && !arenaRunFinished) finishArenaRun('death', now);
      } else if (health.hp <= 0 && heroDeadSinceMs !== null && now - heroDeadSinceMs >= RESPAWN_DELAY_MS) {
        health.hp = health.maxHp;
        const transform = world.store('transform').get(hero);
        if (transform) {
          transform.x = spawn.x;
          transform.y = spawn.y;
          transform.prevX = spawn.x;
          transform.prevY = spawn.y;
        }
        // «Последний патрон» (`rpg-system.md` §3, перк 3) — «раз в бой».
        // Дискретной системы «боевых столкновений» в этой волне нет
        // (см. ДОПУЩЕНИЕ в `formulas/perks.ts`), ближайшая согласованная
        // трактовка — сбрасывать страховку на возрождении, как и остальное
        // боевое состояние героя.
        const perks = world.store('perks').get(hero);
        if (perks) perks.lastStandAvailable = true;
        heroDeadSinceMs = null;
      } else if (health.hp > 0) {
        heroDeadSinceMs = null;
      }
    }

    const fps = frameDtMs > 0 ? 1000 / frameDtMs : 0;
    let hud = `FPS: ${fps.toFixed(0)}`;
    if (heroTransform) {
      const weapons = world.store('weapons').get(hero);
      if (health && weapons) {
        const weaponDef = WEAPON_DEFS[weapons.equipped];
        const weaponState = weapons.states[weapons.equipped];
        const ammo =
          weaponDef.magazineSize !== undefined
            ? `${weaponState.ammo}/${weaponDef.magazineSize}`
            : '—';
        const weaponName = t(`${weapons.equipped}.name`);
        hud += ` | HP ${Math.ceil(health.hp)}/${health.maxHp} | ${weaponName} ${ammo}`;
      }
      if (!activeDialogue && !devRoom) {
        const nearby = findNearestInteractableNpc(heroTransform.x, heroTransform.y);
        hud += nearby ? ` | [E] ${t(`${nearby.npcId}.name`)}` : '';
        if (gameState.flags['flag.truba.water_rising'] === true) hud += ' | Вода поднимается';
      }
    }
    const rodionHud = computeRodionHud(now);
    if (rodionHud !== null) hud = rodionHud + ' | ' + hud;
    const finalValveHud = computeFinalValveHud(now);
    if (finalValveHud !== null) hud = finalValveHud + ' | ' + hud;
    const arenaHud = computeArenaHud(now);
    if (arenaHud !== null) hud = arenaHud + ' | ' + hud;
    if (heroDeadSinceMs !== null) hud = 'ВЫ ПОГИБЛИ… возрождение | ' + hud;
    if (hintUntilMs !== null && performance.now() < hintUntilMs) {
      hud = 'WASD — идти, ЛКМ — стрелять, E — говорить, I — инвентарь | ' + hud;
    }
    // Экран конца игры (`finalEnding`, найдено 6-й рецензией — до этой
    // правки его не было вовсе) — высший приоритет, полностью заменяет
    // обычный HUD, а не дописывается к нему. Показывается, как только
    // временная строка исхода сцены задвижки (`computeFinalValveHud`)
    // истекла (`finalValveOutcomeUntilMs === null` — уже обнулено вызовом
    // `computeFinalValveHud` выше). `loop.stop()` — только ПОСЛЕ того, как
    // этот текст реально попал в DOM хотя бы на одном кадре, иначе игра
    // замерла бы на предыдущем кадре (ещё с временной строкой исхода), а
    // не на экране концовки.
    if (finalEnding !== null && finalValveOutcomeUntilMs === null) {
      hud = `КОНЕЦ ИГРЫ — «${finalEnding.title}». ${finalEnding.summary}`;
      fpsOverlay.update(fps);
      fpsOverlay.element.textContent = hud;
      if (!gameEndedShown) {
        gameEndedShown = true;
        loop.stop();
      }
      return;
    }
    fpsOverlay.update(fps);
    fpsOverlay.element.textContent = hud;
  });

  loop.start();

  const handleResize = (): void => {
    renderer.resize(root.clientWidth, root.clientHeight);
  };
  window.addEventListener('resize', handleResize);

  window.__outfallDebug = {
    getHeroPosition(): { x: number; y: number } | null {
      const transform = world.store('transform').get(hero);
      return transform ? { x: transform.x, y: transform.y } : null;
    },
    getHeroFacing(): { dirX: number; dirY: number } | null {
      const facing = world.store('facing').get(hero);
      return facing ? { dirX: facing.dirX, dirY: facing.dirY } : null;
    },
    teleportHero(x: number, y: number): void {
      const transform = world.store('transform').get(hero);
      if (!transform) return;
      transform.x = x;
      transform.y = y;
      transform.prevX = x;
      transform.prevY = y;
    },
    getEnemyCount(): number {
      let count = 0;
      for (const _entity of world.query('enemy')) count += 1;
      return count;
    },
    getFlag(key: string): boolean | number | string | undefined {
      return gameState.flags[key];
    },
    getMapId(): string {
      return map.id;
    },
    getArenaState(): { wave: number; wavesCleared: number; finished: boolean } | null {
      if (!isArenaMapId(map.id)) return null;
      return { wave: arenaWave, wavesCleared: arenaWavesCleared, finished: arenaRunFinished };
    },
    killAllEnemies(): void {
      for (const entity of world.query('enemy', 'health')) {
        const health = world.store('health').get(entity);
        if (health) health.hp = 0;
      }
    },
    getArenaRecord(
      mapId: string,
      modifierIds: readonly string[],
    ): { bestWavesCleared: number; bestSurvivalMs: number } | undefined {
      return arenaRecordsStore.getRecord(mapId, modifierIds as ArenaModifierId[]);
    },
  };

  return {
    destroy(): void {
      loop.stop();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleSaveLoadKey);
      window.removeEventListener('keydown', handleExitToMenuKey);
      window.removeEventListener('keydown', handleInventoryKey);
      window.removeEventListener('keydown', handleRodionKeyDown);
      window.removeEventListener('keyup', handleRodionKeyUp);
      window.removeEventListener('blur', handleRodionBlur);
      window.removeEventListener('keydown', handleFinalValveKeyDown);
      window.removeEventListener('keyup', handleFinalValveKeyUp);
      window.removeEventListener('blur', handleFinalValveBlur);
      unsubscribeFrame();
      unsubscribeHit();
      unsubscribeDeath();
      unsubscribeInteract();
      activeDialogue?.destroy();
      activeInventory?.destroy();
      input.destroy();
      fpsOverlay.destroy();
      renderer.destroy();
      audioEngine.destroy();
      delete window.__outfallDebug;
    },
  };
}
