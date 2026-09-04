/**
 * Единственное место, где код напрямую трогает DOM и запускает игру.
 * Всё остальное (рендер, ввод, аудио, UI) получает уже готовые элементы
 * или абстракции — см. `docs/planerka/01-concept/engine-architect.md` §2.
 *
 * Титульный экран (`docs/OUTFALL-CONCEPT.md` §6, 0–3 сек) → клик «Погнали»
 * → демо-сцена вертикального среза создаётся именно в этот момент (не
 * заранее) — простая и честная реализация «загрузка ≤ 3 с»: инициализация
 * Pixi/мира лёгкая, укладывается в бюджет без предзагрузки в фоне.
 *
 * OF-039 («Арена»): вторая кнопка титульника («АРЕНА») ведёт на экран
 * выбора карты/модификаторов (`src/ui/arena-menu.ts`) вместо прямого старта
 * демо-сцены — единственное место в коде, которому разрешено знать и про
 * `ui`, и про `game` (`src/game/world/arena.ts`, `src/game/save/
 * arena-records.ts`), поэтому вся склейка «нажал карту → передать
 * модификаторы в `createDemoScene` → прочитать/записать рекорд в
 * localStorage» живёт здесь, а не в `ui`/`game` по отдельности.
 */

import { createDemoScene } from './game';
import { createArenaRecordsStore, createMemoryStorage, type StorageLike } from './game/save';
import {
  ARENA_MAPS,
  ARENA_MODIFIERS,
  ARENA_WAVE_COUNT,
  formatArenaSurvival,
  type ArenaModifierId,
} from './game/world/arena';
import { createArenaMenu, createTitleScreen } from './ui';

/**
 * `localStorage` может быть недоступен (приватный режим Safari, sandboxed
 * iframe, отключённые cookies/storage политикой браузера) или молча кинуть
 * на `setItem` (квота) — задача прямо требует деградации без падения для
 * рекордов Арены. `createArenaRecordsStore` сам оборачивает `getItem`/
 * `setItem`/`JSON.parse` в try/catch (см. `game/save/arena-records.ts`), но
 * само чтение свойства `window.localStorage` в редких песочницах бросает
 * ДО первого вызова метода — эта проверка ловит именно такой случай один
 * раз при старте, а не на каждом обращении к рекордам.
 */
function resolveArenaStorage(): StorageLike {
  try {
    const probeKey = '__outfall_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return createMemoryStorage();
  }
}

function bootstrap(): void {
  const rootCandidate = document.getElementById('app-root');
  const canvasCandidate = document.getElementById('game-canvas');

  if (!(rootCandidate instanceof HTMLElement) || !(canvasCandidate instanceof HTMLCanvasElement)) {
    throw new Error('main: не найдены #app-root / #game-canvas в index.html');
  }
  // Переприсвоено в новые `const` намеренно: узкий тип из проверки выше не
  // сохраняется внутри именованных `function`-объявлений ниже (в отличие от
  // стрелочных функций, `tsc` не гарантирует, что hoisted-объявление не
  // вызовут раньше самой проверки) — `root`/`canvas` физически неизменны за
  // всю жизнь страницы, поэтому это чисто типовая формальность, не разная
  // сущность.
  const root: HTMLElement = rootCandidate;
  const canvas: HTMLCanvasElement = canvasCandidate;

  const arenaRecordsStore = createArenaRecordsStore(resolveArenaStorage());

  function showTitleScreen(): void {
    const titleScreen = createTitleScreen(root, {
      onStart(): void {
        titleScreen.destroy();
        void launchCampaign();
      },
      onArena(): void {
        titleScreen.destroy();
        showArenaMenu();
      },
    });
  }

  function showArenaMenu(): void {
    const menu = createArenaMenu(root, ARENA_MAPS, ARENA_MODIFIERS, {
      getRecordLabel(mapId, activeModifierIds): string {
        const record = arenaRecordsStore.getRecord(mapId, activeModifierIds as ArenaModifierId[]);
        if (!record) return 'рекорд: нет';
        return `рекорд: волна ${record.bestWavesCleared}/${ARENA_WAVE_COUNT}, ${formatArenaSurvival(record.bestSurvivalMs)}`;
      },
      onLaunch(mapId, activeModifierIds): void {
        menu.destroy();
        void launchArenaRun(mapId, activeModifierIds as ArenaModifierId[]);
      },
      onBack(): void {
        menu.destroy();
        showTitleScreen();
      },
    });
  }

  /** Обычный запуск кампании — как до OF-039, `?map=`/без параметра оба остаются рабочими (`resolveInitialMapId` внутри `createDemoScene`). `Escape` внутри демо-сцены ничего не делает нигде, кроме карт Арены (см. `DemoSceneOptions.onExitToMenu`), — сюда попадает лишь как честная симметрия с `launchArenaRun`, реального пути «дебаг-заход на `?map=arena_1` после клика ПОГНАЛИ» не существует. */
  async function launchCampaign(): Promise<void> {
    // `const`, не `let`: `onExitToMenu` читает `scene` только при реальном
    // нажатии `Escape` на карте Арены — заведомо позже, чем эта строка
    // успевает довыполниться и связать переменную (TDZ не бьёт по замыканию,
    // вызываемому асинхронно уже после `await`).
    const scene = await createDemoScene(root, canvas, {
      onExitToMenu(): void {
        scene.destroy();
        showTitleScreen();
      },
    });
  }

  /** Запуск через меню «АРЕНА» — критерий готовности OF-039 «Арена открывается из меню». `Escape` возвращает не на титульник, а обратно в меню Арены (симметрично тому, откуда пришли). */
  async function launchArenaRun(mapId: string, modifiers: readonly ArenaModifierId[]): Promise<void> {
    const scene = await createDemoScene(root, canvas, {
      initialMapId: mapId,
      arenaModifiers: modifiers,
      onExitToMenu(): void {
        scene.destroy();
        showArenaMenu();
      },
    });
  }

  showTitleScreen();
}

bootstrap();
