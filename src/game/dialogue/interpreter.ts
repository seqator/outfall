/**
 * Интерпретатор мини-языка условий/эффектов (`src/data/schemas/rules.ts`,
 * OF-009) — один интерпретатор на диалоги (`dialog-runner.ts`), а в будущем
 * и на триггеры карт/квестов, как и задумано в `engine-architect.md` §3.7.
 * Чистые функции над плоским `GameState`: ничего не мутируют, не читают
 * DOM/RNG/время — тем же стилем, что `src/game/inventory/inventory.ts`
 * (см. заголовок того файла).
 *
 * `GameState` — минимум, который нужен диалогам: флаги, характеристики
 * (КОСТЯК), навыки, инвентарь, состояние квестов. Инвентарь **не**
 * привязан к конкретной реализации другого агента (`src/game/inventory`,
 * OF-017) — на входе только `InventoryPort`, минимальный адаптер
 * (`hasItem`/`giveItem`), которым `interpreter.ts` пользуется через
 * интерфейс, не через импорт `src/game/inventory`.
 *
 * TODO(интеграция после OF-018, см. отчёт задачи): когда диалоги
 * подключаются к игровой сцене, `createInMemoryInventoryPort` заменяется
 * адаптером поверх реального `InventoryState`/`ItemRegistry`
 * (`hasItem` → `state.backpack`/`state.equipment` с учётом `registry`,
 * `giveItem` → `addItem` с `uid`, сгенерированным вызывающей стороной) —
 * сам интерпретатор менять не придётся, порт рассчитан именно на такую
 * замену без изменения сигнатур.
 */

import type { CheckKey, SkillKey, StatKey } from '../../data/schemas/rpg';
import { SkillKeySchema } from '../../data/schemas/rpg';
import type { Condition, Effect, LeafCondition } from '../../data/schemas/rules';
import {
  createEmptyQuestsState,
  hasReachedQuestStage,
  startQuest as startQuestState,
  type QuestsState,
} from '../quest/quest-state';

export type FlagValue = boolean | number | string;

/**
 * Минимальный порт инвентаря, нужный интерпретатору для `op: 'hasItem'`
 * (условие) и `op: 'giveItem'` (эффект). Чистый и иммутабельный: `giveItem`
 * возвращает новый порт, а не мутирует текущий — тем же контрактом, что
 * `applyEffect`/`applyEffects` ниже.
 */
export interface InventoryPort {
  hasItem(itemId: string, count: number): boolean;
  giveItem(itemId: string, count: number): InventoryPort;
}

/**
 * Простейшая реализация `InventoryPort` поверх словаря `itemId → count` —
 * достаточно для тестов интерпретатора и для дефолтного `GameState` до
 * готовности реальной интеграции (см. TODO в заголовке файла).
 */
export function createInMemoryInventoryPort(
  initialCounts: Readonly<Record<string, number>> = {},
): InventoryPort {
  const counts = initialCounts;
  return {
    hasItem(itemId, count): boolean {
      return (counts[itemId] ?? 0) >= count;
    },
    giveItem(itemId, count): InventoryPort {
      return createInMemoryInventoryPort({ ...counts, [itemId]: (counts[itemId] ?? 0) + count });
    },
  };
}

/** Плоское игровое состояние, над которым работает интерпретатор (см. заголовок файла). */
export interface GameState {
  readonly flags: Readonly<Record<string, FlagValue>>;
  readonly stats: Readonly<Record<StatKey, number>>;
  readonly skills: Readonly<Record<SkillKey, number>>;
  readonly quests: QuestsState;
  readonly inventory: InventoryPort;
  /**
   * TODO(интеграция с OF-016): реальные ХП считает бой (`src/sim`,
   * `combat.md`) — здесь плоский счётчик исключительно для эффекта
   * `damage` в диалогах (напр. ловушка/самопожертвование в реплике) до
   * готовности той системы. Диалоговый `damage` не обязан быть единственным
   * источником урона персонажа в игре.
   */
  readonly hp: number;
  /** Аналогично `hp` — TODO(интеграция с rpg-system.md уровнями): эффект `xp` копит опыт здесь, реальная прогрессия уровня — отдельная система. */
  readonly xp: number;
}

const DEFAULT_STATS: Readonly<Record<StatKey, number>> = {
  karkas: 5,
  ostrota: 5,
  smekalka: 5,
  tvyordost: 5,
  yazyk: 5,
  kurazh: 5,
};

const DEFAULT_SKILLS: Readonly<Record<SkillKey, number>> = {
  stvoly: 0,
  tyazhyoloe: 0,
  luch: 0,
  kulaki: 0,
  nozhi: 0,
  vzryvchatka: 0,
  vzlom: 0,
  remont: 0,
  medicina: 0,
  rech: 0,
};

/** Удобный конструктор `GameState` с разумными дефолтами — для тестов и для дефолтного состояния до реальной интеграции. */
export function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    flags: {},
    stats: DEFAULT_STATS,
    skills: DEFAULT_SKILLS,
    quests: createEmptyQuestsState(),
    inventory: createInMemoryInventoryPort(),
    hp: 100,
    xp: 0,
    ...overrides,
  };
}

const SKILL_KEY_SET = new Set<string>(SkillKeySchema.options);

function isSkillKey(key: CheckKey): key is SkillKey {
  return SKILL_KEY_SET.has(key);
}

function checkKeyValue(key: CheckKey, state: GameState): number {
  return isSkillKey(key) ? state.skills[key] : state.stats[key];
}

function evaluateLeaf(leaf: LeafCondition, state: GameState): boolean {
  switch (leaf.op) {
    case 'hasItem':
      return state.inventory.hasItem(leaf.item, leaf.count);
    case 'flag':
      return state.flags[leaf.key] === leaf.eq;
    case 'stat':
      return state.stats[leaf.stat] >= leaf.gte;
    case 'skill':
      return state.skills[leaf.skill] >= leaf.gte;
    case 'questStage': {
      const quest = state.quests[leaf.quest];
      if (!quest) return false;
      return leaf.cmp === 'eq' ? quest.stage === leaf.stage : hasReachedQuestStage(state.quests, leaf.quest, leaf.stage);
    }
  }
}

/** Обходит дерево `all`/`any`/`not` и вычисляет булево значение условия (`ConditionSchema`, `rules.ts`). */
export function evaluateCondition(condition: Condition, state: GameState): boolean {
  switch (condition.op) {
    case 'all':
      return condition.conditions.every((c) => evaluateCondition(c, state));
    case 'any':
      return condition.conditions.some((c) => evaluateCondition(c, state));
    case 'not':
      return !evaluateCondition(condition.condition, state);
    default:
      return evaluateLeaf(condition, state);
  }
}

/**
 * Пороговая проверка навыка/характеристики в диалоге (`DialogChoice.check`,
 * `dialog.ts`) — прямое сравнение `≥ dc`, без бросков (принцип
 * «честно, без автоприцела», `rpg-system.md` §0/§1).
 */
export function passesCheck(check: { readonly stat: CheckKey; readonly dc: number }, state: GameState): boolean {
  return checkKeyValue(check.stat, state) >= check.dc;
}

/** Применяет один эффект (`EffectSchema`, `rules.ts`) к состоянию, возвращая новое состояние. */
export function applyEffect(state: GameState, effect: Effect): GameState {
  switch (effect.op) {
    case 'setFlag':
      return { ...state, flags: { ...state.flags, [effect.key]: effect.value } };
    case 'incrementFlag': {
      const current = state.flags[effect.key];
      const base = typeof current === 'number' ? current : 0;
      return { ...state, flags: { ...state.flags, [effect.key]: base + effect.amount } };
    }
    case 'giveItem':
      return { ...state, inventory: state.inventory.giveItem(effect.item, effect.count) };
    case 'startQuest':
      return { ...state, quests: startQuestState(state.quests, effect.quest) };
    case 'damage':
      return { ...state, hp: Math.max(0, state.hp - effect.amount) };
    case 'xp':
      return { ...state, xp: state.xp + effect.amount };
    case 'heal':
      // Плоский `GameState.hp` здесь не знает `maxHp` (см. докстринг поля
      // выше) — ровно как `damage` не капается сверху, `heal` не капается
      // снизу за пределы 0. Реальное лечение героя (OF-058) идёт мимо этого
      // интерпретатора, см. `rules.ts` докстринг оператора `heal`.
      return { ...state, hp: state.hp + effect.amount };
  }
}

/** Применяет список эффектов по порядку — так, как они идут в `DialogChoice.effects`/`QuestStage.onEnter`. */
export function applyEffects(state: GameState, effects: readonly Effect[]): GameState {
  return effects.reduce(applyEffect, state);
}
