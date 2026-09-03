# Планёрка №1 — Техническое предложение (engine-architect)

> Статус: предложение к обсуждению. После принятия — переносится в `docs/tech/architecture.md` и ADR `docs/tech/adr/001-render.md`, `002-ecs-tick.md`, `003-data-schemas.md`.
> Требования взяты из `docs/00-MASTER-PROMPT.md` и `.claude/agents/engine-architect.md`.

## 0. Вводные и ограничения

- Браузер, «открыл ссылку — играешь». Ноль сетевых запросов в рантайме, всё в бандле/ассетах на том же origin.
- Изометрия, реалтайм-экшен: 200+ спрайтов на экране, частицы (кровь, искры, дым), стабильные 60 FPS на среднем ноутбуке (Intel Iris/UHD, 1080p).
- Контент — JSON-данные с валидацией, русская локализация через словарь, сохранения в localStorage + экспорт файлом.
- Команда — агенты-программисты: архитектура обязана быть «защищённой от дрейфа»: узкие контракты, логика без DOM/рендера, всё тестируется в Node.

## 1. Сравнение вариантов рендера

| Критерий | Canvas 2D | PixiJS 8 (WebGL/WebGPU) | Phaser 3/4 |
|---|---|---|---|
| Производительность на изометрии, 200+ спрайтов + частицы | Каждый `drawImage` — отдельный вызов; при 300–500 объектов + 1–2k частиц с alpha на интегрированной графике 1080p — 40–55 FPS, просадки при overdraw. Требует ручного кэширования тайлов в офскрин-канвасы | Спрайт-батчинг: тысячи спрайтов из одного атласа — единицы draw call. `ParticleContainer` — 10k+ частиц. 60 FPS с запасом 3–5× | Тот же Pixi-подобный WebGL-рендер; запас аналогичный, но выше накладные расходы на GameObject-обвязку (каждый объект — тяжёлый класс с физикой, событиями) |
| Контроль над кадром | Полный, ноль магии | Высокий: своя сцена, свой цикл (`Ticker` можно не использовать), рендер по требованию | Низкий/средний: свой игровой цикл, сцены, загрузчик, физика, ввод — всё «внутри» фреймворка, и он ожидает, что игра живёт в его объектах |
| Размер бандла (min / gzip) | 0 | ~450 KB / ~130 KB (tree-shaking по подпакетам: без `filters`, `mesh`, `text`) | ~1.2 MB / ~330 KB, tree-shaking слабый |
| Тестируемость логики отдельно от рендера | Отличная, но нужна дисциплина — «быстрый путь» рисовать прямо из логики соблазнителен | Отличная: логика вообще не знает о Pixi, адаптер рендера читает компоненты и обновляет `Sprite`-пул. Vitest в Node без DOM | Плохая: логика естественно «прилипает» к `Phaser.Scene`, `Physics.Arcade`, `Sprite`; тесты требуют headless-canvas или мока всего фреймворка |
| Риск для агентной команды | Средний: агенты будут заново изобретать батчинг, атласы, камеру, партиклы — много самописного кода в горячих путях | Низкий: узкий API (Container/Sprite/Texture/Assets), обширная документация, чёткая граница «логика → адаптер» | Высокий: фреймворк диктует структуру; агенты будут смешивать симуляцию и сцены; отход от фиксированного шага и детерминизма; версия 4 меняет API, версия 3 — в поддержке |
| Офлайн / ноль запросов | ✔ | ✔ (Assets грузит с того же origin) | ✔ |

### Рекомендация: **PixiJS 8** за тонким адаптером `IRenderer`

Обоснование:
1. Единственный вариант, который даёт 60 FPS с запасом на интегрированной графике при 200+ спрайтах и частицах **без** самописного батчинга. Запас производительности = свобода для арта и эффектов, которые нужны «дерзости».
2. Pixi — библиотека, а не фреймворк: цикл, сцены, ввод, данные, сохранения — наши. Это критично для детерминированного тика с фиксированным шагом и для тестов в Node.
3. Граница «логика ↔ рендер» формализуется интерфейсом `IRenderer`; в тестах используется `NullRenderer`. Если Pixi 8 создаст проблемы (WebGL недоступен, баги), Canvas 2D-реализация того же интерфейса — запасной путь без переписывания игры.
4. Phaser отвергаем: цена в бандле ×2.5, слабая тестируемость, и главное — конфликт с нашей архитектурой (свой цикл и объектная модель).
5. Чистый Canvas 2D отвергаем как основной: производительность на грани, и «горячий» код пришлось бы писать самим — самый рискованный тип кода для агентов.

Правило проекта: **импорт `pixi.js` разрешён только в `src/render/pixi/**`**. ESLint-правило `no-restricted-imports` это обеспечивает.

## 2. Структура проекта

```
outfall/
├── index.html
├── package.json / vite.config.ts / tsconfig.json / eslint.config.js / vitest.config.ts / playwright.config.ts
├── public/                      # копируется как есть; всё, что грузится в рантайме
│   ├── atlases/<location>/      # <name>.png + <name>.json (формат TexturePacker/pixi)
│   ├── audio/<sfx|music>/       # ogg (+ m4a-фолбэк для Safari)
│   └── data/                    # JSON-контент, грузится по требованию
│       ├── maps/<id>.json
│       ├── dialogs/<id>.json
│       ├── items.json  perks.json  quests.json  enemies.json
│       └── i18n/ru.json  i18n/en.json
├── src/
│   ├── main.ts                  # единственное место, где создаётся DOM/Pixi/Audio и запускается Game
│   ├── core/                    # чистый TS, без DOM. Тик, ECS, события, RNG, математика
│   │   ├── loop.ts  world.ts  events.ts  rng.ts  math/  iso.ts
│   ├── sim/                     # игровая симуляция: системы ECS (движение, бой, ИИ, квесты)
│   │   ├── components/          # типы компонентов (простые объекты)
│   │   ├── systems/             # чистые функции (world, dt) → мутации компонентов
│   │   └── formulas/            # урон, шансы, XP — чистые функции, 100% покрытие тестами
│   ├── data/                    # zod-схемы, загрузчик JSON, типы, валидация на старте
│   │   ├── schemas/  loader.ts  registry.ts
│   ├── save/                    # сериализация мира, версия схемы, миграции, localStorage, экспорт
│   ├── i18n/                    # словарь, интерполяция, плюрализация (ru), fallback en
│   ├── input/                   # маппинг DOM-событий → InputState (снимок на тик)
│   ├── render/                  # IRenderer, камера, сортировка по глубине
│   │   ├── renderer.ts  camera.ts  depth.ts  null-renderer.ts
│   │   └── pixi/                # единственное место с import 'pixi.js'
│   ├── audio/                   # WebAudio, подписка на шину событий, без внешних библиотек
│   ├── assets/                  # манифест, ленивая загрузка по локациям, атласы
│   ├── ui/                      # HUD, диалоги, инвентарь — DOM-оверлей поверх канваса
│   └── game/                    # оркестрация: сцены (меню/локация/диалог), склейка модулей
├── tools/                       # node-скрипты: упаковка атласов, валидация JSON, отчёт о размере билда
├── tests/
│   ├── unit/                    # vitest, зеркалит src/
│   ├── integration/             # сохранения, загрузка карт, диалоговый граф (снапшоты)
│   └── e2e/                     # playwright-смоук
└── docs/
```

Правила зависимостей между слоями (проверяются ESLint `import-x/no-restricted-paths`):
`core` ← `sim` ← `game` → `render`, `audio`, `ui`, `input`, `assets`. `sim` и `core` **не импортируют** `render/ui/audio/input/assets` и не трогают `window/document`.

## 3. Ключевые модули и контракты

### 3.1 Игровой тик с фиксированным шагом

```ts
export const TICK_HZ = 30;                 // симуляция: 30 Гц, рендер — 60+ с интерполяцией
export const TICK_DT = 1 / TICK_HZ;        // секунды
export const MAX_TICKS_PER_FRAME = 5;      // защита от «спирали смерти» после сворачивания вкладки

export interface Simulation {
  step(dt: number, input: InputSnapshot): void;   // ровно один детерминированный тик
}
export interface GameLoop {
  start(): void;  stop(): void;
  /** alpha ∈ [0,1) — доля пройденного тика, для интерполяции в рендере */
  onFrame(cb: (alpha: number, frameDtMs: number) => void): void;
}
export function createLoop(sim: Simulation, input: InputSource, raf: RafLike): GameLoop;
```

Детерминизм: только `SeededRng` (mulberry32/xoshiro), никаких `Math.random`/`Date.now` в `sim`. Один и тот же seed + та же последовательность `InputSnapshot` ⇒ идентичное состояние мира (проверяется тестом-реплеем).

### 3.2 ECS / компонентный мир

```ts
export type EntityId = number;                      // индекс + поколение упакованы в число
export interface ComponentStore<T> {
  add(e: EntityId, c: T): void; get(e: EntityId): T | undefined;
  has(e: EntityId): boolean; remove(e: EntityId): void;
  entities(): Iterable<EntityId>;
}
export interface World {
  readonly tick: number;
  readonly rng: SeededRng;
  readonly events: EventBus;
  create(): EntityId; destroy(e: EntityId): void; alive(e: EntityId): boolean;
  store<K extends keyof Components>(key: K): ComponentStore<Components[K]>;
  query<K extends keyof Components>(...keys: K[]): Iterable<EntityId>;
}
export interface Components {                       // расширяется через declaration merging
  transform: { x: number; y: number; z: number; prevX: number; prevY: number };  // мировые (тайловые) координаты
  velocity:  { vx: number; vy: number };
  sprite:    { atlas: string; frame: string; anim?: string; flipX: boolean; layer: RenderLayer };
  health:    { hp: number; max: number };
  collider:  { radius: number; solid: boolean };
  ai:        { brain: string; state: string; target?: EntityId; timer: number };
  // combat, inventory, dialogueActor, questFlags, ...
}
export type System = (world: World, dt: number, input: InputSnapshot) => void;
export const SYSTEM_ORDER: readonly System[]; // порядок фиксирован: input → ai → movement → collision → combat → effects → quest → cleanup
```

Компоненты — plain-объекты (JSON-сериализуемы), без методов и классов: это одновременно основа сохранений и снапшот-тестов.

### 3.3 Изометрия и сортировка по глубине

```ts
export const TILE_W = 64, TILE_H = 32;               // ромб 2:1; половины — 32/16
export interface IsoProjection {
  toScreen(wx: number, wy: number, z?: number): { sx: number; sy: number };
  toWorld(sx: number, sy: number): { wx: number; wy: number };
}
/** Ключ глубины для sortableChildren: чем «ниже по экрану», тем позже рисуем */
export function depthKey(wx: number, wy: number, z: number, layer: RenderLayer): number;
export type RenderLayer = 'ground' | 'decal' | 'object' | 'fx' | 'overhead';
```

Земля рисуется тайл-картой (`Container` с кэшем чанков 16×16 тайлов), объекты — одним слоем с `depthKey = (wx + wy) * 1024 + z + layerBias`. Стены/большие объекты — по «якорной точке» (anchor) в основании спрайта.

### 3.4 Ввод

```ts
export interface InputSnapshot {                     // неизменяемый снимок на тик
  readonly moveX: number; readonly moveY: number;   // -1..1, уже в мировых осях
  readonly aimWorld: { x: number; y: number };
  readonly pressed: ReadonlySet<Action>;             // в этом тике
  readonly held: ReadonlySet<Action>;
}
export type Action = 'attack' | 'interact' | 'dash' | 'reload' | 'inventory' | 'pause' | 'slot1' | ... ;
export interface InputSource { snapshot(): InputSnapshot; }  // DOM-реализация + ScriptedInput для тестов
```

### 3.5 Рендер

```ts
export interface IRenderer {
  init(canvas: HTMLCanvasElement, opts: { width: number; height: number; pixelArt: true }): Promise<void>;
  loadAtlas(id: string, url: string): Promise<void>;  unloadAtlas(id: string): void;
  setMap(map: MapData): void;                         // строит тайловые чанки
  /** Читает компоненты и обновляет пул спрайтов. alpha — интерполяция transform.prev→cur */
  draw(world: World, camera: Camera, alpha: number): void;
  emitParticles(fx: ParticleBurst): void;              // fx-система живёт в рендере, не в sim
  resize(w: number, h: number): void;  destroy(): void;
  stats(): { drawCalls: number; sprites: number; frameMs: number };
}
export class NullRenderer implements IRenderer { /* для тестов и headless-реплеев */ }
```

Частицы — чисто визуальные: `sim` публикует событие `fx:burst`, рендер его отрисовывает. Так симуляция не зависит от количества частиц.

### 3.6 Ресурсы и атласы

```ts
export interface AssetManifest {
  version: number;
  locations: Record<LocationId, { atlases: string[]; audio: string[]; maps: string[]; data: string[] }>;
  shared: { atlases: string[]; audio: string[] };     // UI, герой, общие эффекты — грузятся один раз
}
export interface AssetLoader {
  loadShared(onProgress: (p: number) => void): Promise<void>;
  loadLocation(id: LocationId, onProgress: (p: number) => void): Promise<void>;
  unloadLocation(id: LocationId): void;
}
```

Атласы собираются скриптом `tools/pack-atlases.ts` из `art/` в `public/atlases/`, ≤ 2048×2048 каждый (безопасно для любых GPU).

### 3.7 Данные и zod-схемы

```ts
export const ItemSchema = z.object({
  id: z.string().regex(/^item\.[a-z0-9_]+$/), nameKey: z.string(), descKey: z.string(),
  kind: z.enum(['weapon','armor','consumable','junk','key']), weight: z.number().nonnegative(),
  value: z.int().nonnegative(), stack: z.int().positive().default(1),
  weapon: z.object({ damage: z.tuple([z.number(), z.number()]), rate: z.number(), range: z.number(),
                     ammo: z.string().optional(), spread: z.number() }).optional(),
  effects: z.array(EffectSchema).default([]),
});
export const PerkSchema  = z.object({ id, nameKey, descKey, requires: RequirementSchema, modifiers: z.array(ModifierSchema) });
export const DialogSchema = z.object({
  id: z.string(), start: z.string(),
  nodes: z.record(z.string(), z.object({
    speaker: z.string(), textKey: z.string(),
    choices: z.array(z.object({ textKey: z.string(), next: z.string().nullable(),
      condition: ConditionSchema.optional(), effects: z.array(EffectSchema).default([]),
      check: z.object({ stat: z.string(), dc: z.number() }).optional() })),
  })),
});
export const QuestSchema = z.object({ id, titleKey, stages: z.array(z.object({ id, descKey, onEnter: z.array(EffectSchema), complete: ConditionSchema })) });
export const MapSchema = z.object({
  id: z.string(), width: z.int(), height: z.int(), tileset: z.string(),
  layers: z.object({ ground: z.array(z.int()), walls: z.array(z.int()), collision: z.array(z.int()) }),
  entities: z.array(z.object({ type: z.string(), x: z.number(), y: z.number(), props: z.record(z.string(), z.unknown()) })),
  triggers: z.array(TriggerSchema), spawns: z.array(SpawnSchema), exits: z.array(ExitSchema),
});
export type Item = z.infer<typeof ItemSchema>; // и т.д. — типы только из схем, руками не дублируем
```

`ConditionSchema`/`EffectSchema` — общий мини-язык (`{ op: 'hasItem', id }`, `{ op: 'flag', key, eq }`, `{ op: 'stat', key, gte }`; эффекты: `giveItem`, `setFlag`, `startQuest`, `damage`, `xp`). Интерпретатор — чистая функция, один на диалоги, квесты, триггеры карт. Вся папка `public/data` валидируется в `npm run validate` и при старте dev-сборки; в проде — только при загрузке (быстро, схемы небольшие).

### 3.8 Сохранения

```ts
export const SAVE_SCHEMA_VERSION = 1;
export interface SaveFile {
  v: number; createdAt: string; playtimeSec: number; seed: number;
  location: LocationId; world: SerializedWorld;   // компоненты as-is, только живые сущности
  flags: Record<string, boolean | number | string>; quests: Record<string, string>; // questId → stageId
  inventory: SerializedInventory; i18n: 'ru' | 'en';
}
export interface Migration { from: number; to: number; up(save: unknown): unknown; }
export interface SaveStore {
  list(): SaveMeta[]; save(slot: string, s: SaveFile): void; load(slot: string): SaveFile; remove(slot: string): void;
  exportBlob(slot: string): Blob; importText(json: string): SaveFile;   // экспорт/импорт файлом
}
export function serialize(world: World): SerializedWorld; export function deserialize(w: SerializedWorld): World;
```

Инвариант, проверяемый интеграционным тестом: `deserialize(serialize(w))` даёт мир, который на N тиков вперёд совпадает с оригиналом. Миграции — цепочка `1→2→3`, тестируются на зафиксированных фикстурах старых сейвов.

### 3.9 Шина событий

```ts
export interface GameEvents {
  'combat:hit':   { attacker: EntityId; target: EntityId; damage: number; crit: boolean; wx: number; wy: number };
  'entity:died':  { id: EntityId; kind: string; wx: number; wy: number };
  'fx:burst':     ParticleBurst;
  'audio:play':   { sfx: string; wx?: number; wy?: number; volume?: number };
  'audio:music':  { track: string | null; fade: number };
  'quest:stage':  { quest: string; stage: string };
  'dialog:open':  { dialog: string; npc: EntityId };
  'save:request': { slot: string };
  'loc:change':   { to: LocationId; spawn: string };
}
export interface EventBus {
  emit<K extends keyof GameEvents>(k: K, p: GameEvents[K]): void;
  on<K extends keyof GameEvents>(k: K, h: (p: GameEvents[K]) => void): () => void;
  drain(): void;       // события копятся за тик и доставляются в конце тика — порядок детерминирован
}
```

Аудио, UI, рендер — только подписчики. `sim` никогда не вызывает их напрямую.

### 3.10 Локализация

```ts
export interface I18n {
  t(key: string, params?: Record<string, string | number>): string;   // "{n} патрон|патрона|патронов"
  locale: 'ru' | 'en'; setLocale(l: 'ru' | 'en'): Promise<void>;
}
```

Все тексты — ключи (`dlg.doc.intro.01`), словарь `public/data/i18n/ru.json` — плоский `Record<string, string>`. Скрипт `tools/check-i18n.ts` ищет ключи без перевода и «сырой» русский текст в `src/`.

## 4. Пайплайн и зависимости

Версии проверены через `npm view` 03.09.2026.

| Пакет | Версия | Роль |
|---|---|---|
| `pixi.js` | ^8.20 | рендер (runtime, единственная тяжёлая зависимость) |
| `zod` | ^4.5 | схемы контента и сейвов (runtime) |
| `vite` | ^8.2 | сборка (rolldown), dev-сервер, code-splitting по локациям |
| `typescript` | ^5.9 | strict + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. TS 7.0 (нативный компилятор) — перейти после подтверждения совместимости typescript-eslint |
| `eslint` + `@eslint/js` | ^10.9 / ^10.0 | flat config |
| `typescript-eslint` | ^8.69 | type-checked правила |
| `eslint-plugin-import-x` | ^4.17 | границы слоёв (`no-restricted-paths`) |
| `vitest` + `@vitest/coverage-v8` | ^5.0 | юнит/интеграция в Node, снапшоты |
| `@playwright/test` | ^1.62 | смоук: запуск, загрузка локации, 5 сек без ошибок в консоли, скриншот, проверка FPS ≥ 55 |
| `prettier` | ^3.9 | форматирование |
| `tsx` | ^4.23 | запуск `tools/*.ts` |
| `sharp` | ^0.35 | упаковка атласов в `tools/` (devDependency) |
| `rollup-plugin-visualizer` | ^7.1 | отчёт по бандлу в CI |

Runtime-зависимостей две: `pixi.js`, `zod`. Аудио — нативный WebAudio, без библиотек. Никаких CDN, шрифты — в бандле.

Скрипты: `dev`, `build` (= `typecheck && lint && test && vite build && size-check`), `test`, `test:e2e`, `lint`, `typecheck`, `validate` (JSON по схемам), `atlas` (пересборка атласов), `size` (отчёт).

Ограничения размера билда (проверяются `tools/size-check.ts`, падают сборку):
- JS начальный чанк ≤ 350 KB gzip; весь JS ≤ 600 KB gzip.
- Общие ассеты (UI, герой, эффекты) ≤ 6 MB; одна локация (атласы + карта + звук) ≤ 8 MB; весь билд ≤ 80 MB.
- Атлас ≤ 2048×2048, PNG (`oxipng`/`sharp` палитровая квантизация — пиксель-арт это переживает). Звук — OGG Vorbis q4, музыка ≤ 1.5 MB/трек.
- Первый кадр меню ≤ 2 с на 4G-эквиваленте; локация грузится по требованию с экраном загрузки.

CI (GitHub Actions): `npm ci && npm run build && npm run test:e2e` на каждом PR; артефакт — папка `dist/` + отчёт размера.

## 5. Пять главных технических рисков

| # | Риск | Как снимаем |
|---|---|---|
| 1 | **Агенты смешают логику с рендером/DOM** — потеря тестируемости и детерминизма | Слои и ESLint-границы (`no-restricted-paths`, `no-restricted-imports` для `pixi.js`, `no-restricted-globals` для `window/document` в `core/sim`). `NullRenderer` + `ScriptedInput` в тестах; реплей-тест «seed + инпуты ⇒ хэш мира» в CI |
| 2 | **Просадки FPS**: overdraw частиц, сортировка 500 объектов каждый кадр, пересоздание спрайтов | Бюджет кадра 16 мс: sim ≤ 4 мс, render ≤ 6 мс. Пул спрайтов, `ParticleContainer`, кэш тайловых чанков, сортировка только «грязных» объектов. Playwright-смоук с измерением FPS на 300 болванчиках + 2k частиц; `stats()` на F3-оверлее |
| 3 | **Сломанные сохранения** после изменения компонентов/данных | Компоненты — plain JSON; `SAVE_SCHEMA_VERSION` + миграции с фикстурами; интеграционный тест round-trip; сейв хранит только состояние, не контент (контент подтягивается по id) |
| 4 | **Контент-дрейф**: диалоги ссылаются на несуществующие узлы/предметы/ключи локализации | `npm run validate`: zod + кросс-ссылочные проверки (все `next`, `id`, `textKey` существуют, граф диалога без недостижимых узлов). Снапшот-тесты обхода диалогового графа. Запуск в pre-commit и CI |
| 5 | **Новизна инструментов** (Vite 8/rolldown, Vitest 5, Pixi 8 WebGPU-путь) | Pixi принудительно на `preference: 'webgl'` (WebGPU — позже). Lock-файл в репо; `previous`-версии (Vite 7, Vitest 4) — проверенный откат, конфиги совместимы. Ни одной зависимости, специфичной для rolldown |

Дополнительно (вне топ-5): Safari/iOS-аудио (разблокировка по первому клику), localStorage-лимит 5 MB (сейвы сжимаем, ≤ 200 KB на слот), потеря WebGL-контекста (обработчик `contextlost` → пересоздание рендера).

## 6. Вертикальный срез: 8 шагов

1. **Каркас** (engine-architect): `package.json`, конфиги, структура папок, ESLint-границы, CI, `size-check`. Пустая сцена Pixi с FPS-оверлеем. `npm run dev/build` работают. *Готово: зелёный CI, 1 смоук-тест.*
2. **Ядро**: `GameLoop` с фиксированным шагом, `World`/ECS, `EventBus`, `SeededRng`, `InputSnapshot`. *Готово: реплей-тест детерминизма, 100% покрытие `core/`.*
3. **Изометрия и карта**: `MapSchema`, загрузчик, тайловые чанки, камера, `depthKey`, коллизии по сетке. Тестовая карта 64×64 с стенами. *Готово: герой-болванчик ходит по карте, 60 FPS, e2e-скриншот.*
4. **Бой**: движение/дэш, оружие ближнего и дальнего боя, `formulas/` (урон, крит, разброс), хиты, смерть, 3 типа врагов с простым ИИ (стоять/преследовать/стрелять), частицы и `audio:play` через шину. Стресс-сцена: 300 врагов + 2k частиц. *Готово: FPS-тест ≥ 55, формулы покрыты тестами.*
5. **Данные и инвентарь**: `ItemSchema`, `PerkSchema`, реестр, инвентарь/экипировка, DOM-UI инвентаря, `validate`. *Готово: инвентарь-логика 100% тестов, UI без бизнес-логики.*
6. **Диалоги и квесты**: `DialogSchema`, `QuestSchema`, интерпретатор условий/эффектов, DOM-UI диалога, один квест с 2 исходами. *Готово: снапшот-тест графа, кросс-ссылки в `validate`.*
7. **Сохранения и локализация**: `SaveStore` (localStorage + экспорт/импорт), миграции, `I18n` с ru/en, проверка ключей. *Готово: round-trip тест, сейв → перезагрузка → продолжение боя.*
8. **Сборка среза**: одна локация с арт-библом, меню, загрузка по локациям, ленивые атласы, звук/музыка, отчёт размера, e2e-прогон «меню → локация → бой → диалог → сохранение → загрузка». *Готово: билд ≤ лимитов, офлайн-запуск с file:// через `vite preview`, отчёт `qa-playtester`.*

Шаги 1–2 — engine-architect, 3–7 — gameplay-programmer по контрактам выше (по одной задаче на агента), 8 — совместно с art-director/audio-designer/qa.

## 7. Открытые вопросы к планёрке

- Частота тика: 30 Гц (экономия CPU, проще детерминизм) или 60 Гц (точнее хитбоксы в быстром бою)? Предлагаю 30 с интерполяцией; хитсканы считаются с подшагом.
- Размер тайла 64×32 против 128×64 — зависит от разрешения арта (art-director).
- UI: DOM-оверлей (быстро, доступно, тестируется Playwright) или всё в Pixi (единый стиль)? Предлагаю DOM с пиксельным CSS-шрифтом; заменить на Pixi-UI можно позже, контракты не меняются.
