/**
 * Жар лучевого оружия «Дуга» (`docs/design/combat.md` §4.5). Оружие само
 * («Дуга») в срез OF-016 не входит (§3 — «позже»), формула реализована и
 * протестирована отдельно от боевых систем, как явно требует бэклог-задача
 * (§6 таблицы тестируемости не делает исключения для оружия вне среза).
 *
 * ДОПУЩЕНИЕ (противоречие в GDD, см. правило программиста «отметь и
 * реализуй наиболее вероятную трактовку»): основной текст §4.5 однозначен —
 * «При достижении 100 — оружие блокируется на 2 с, жар сбрасывается до 0» —
 * а следующий за ним пример («после отпускания кнопки на 1 с жар падает со
 * 100 до 80») описывает уже другой, несовместимый с основным правилом
 * сценарий (жар не сброшен, блок как будто не наступил). Таблица
 * тестируемости §6 (авторитетный источник для юнит-тестов) проверяет только
 * (1) «2 с стрельбы ⇒ жар 100, блок 2,000 с» и (2) «не стрелять 1 с при жаре
 * 80 ⇒ жар 60» — оба согласуются с основным правилом «сброс до 0 при
 * блоке», поэтому оно и реализовано ниже; иллюстративный пример со
 * значением «80» списан на неточность формулировки, а не на отдельный режим.
 */

export const HEAT_MAX = 100;
/** +5 за тик стрельбы при 10 тиков/с ⇒ +50/с — выражено как непрерывная скорость, не зависящая от частоты тика. */
export const HEAT_GAIN_PER_SEC = 50;
export const HEAT_COOL_PER_SEC = 20;
export const HEAT_BLOCK_MS = 2000;

export interface HeatState {
  readonly heat: number;
  /** > 0, пока оружие заблокировано после переполнения жара. */
  readonly blockRemainingMs: number;
}

export const INITIAL_HEAT_STATE: HeatState = { heat: 0, blockRemainingMs: 0 };

/** Можно ли стрелять сейчас — блока нет. */
export function canFireHeat(state: HeatState): boolean {
  return state.blockRemainingMs <= 0;
}

/**
 * Модификаторы перков Лучевика (`rpg-system.md` §3, OF-035) — «Холодный
 * ствол»/«Быстрый сброс»/«Перегрузка». Как и само оружие «Дуга», не
 * подключены ни к какой боевой системе в этом срезе (оружия «Дуга» нет,
 * §3 combat.md — «позже»), формулы протестированы отдельно тем же приёмом,
 * что и остальной этот файл (см. докстринг в шапке).
 */
export interface HeatPerkModifiers {
  /** «Холодный ствол» — множитель накопления жара за выстрел (0,8 — на 20% медленнее). */
  readonly gainMult?: number;
  /** «Быстрый сброс» — множитель скорости остывания в простое. */
  readonly coolMult?: number;
  /** «Перегрузка» — новая длительность блока после аварийного выстрела вместо `HEAT_BLOCK_MS`. */
  readonly blockMsOverride?: number;
}

/**
 * Один шаг симуляции жара на `dtSec` секунд. `firing` — стреляли ли в этом
 * промежутке. Пока идёт блок — жар остаётся на 0 (сброшен в момент
 * срабатывания), стрельба недоступна, отсчитывается только время блока.
 * `perks` — необязательные модификаторы перков (по умолчанию не меняют
 * поведение относительно базовых констант).
 */
export function advanceHeat(
  state: HeatState,
  firing: boolean,
  dtSec: number,
  perks: HeatPerkModifiers = {},
): HeatState {
  const gainMult = perks.gainMult ?? 1;
  const coolMult = perks.coolMult ?? 1;
  const blockMs = perks.blockMsOverride ?? HEAT_BLOCK_MS;

  if (state.blockRemainingMs > 0) {
    return { heat: 0, blockRemainingMs: Math.max(0, state.blockRemainingMs - dtSec * 1000) };
  }

  if (firing) {
    const heat = state.heat + HEAT_GAIN_PER_SEC * gainMult * dtSec;
    if (heat >= HEAT_MAX) {
      return { heat: 0, blockRemainingMs: blockMs };
    }
    return { heat, blockRemainingMs: 0 };
  }

  return { heat: Math.max(0, state.heat - HEAT_COOL_PER_SEC * coolMult * dtSec), blockRemainingMs: 0 };
}
