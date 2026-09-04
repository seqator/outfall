/**
 * Минимальное runtime-состояние квестов (OF-018). `docs/narrative/main-quest.md`
 * и `src/data/schemas/quest.ts` описывают квест как контент (список стадий
 * `QuestStage` с условием `complete` и эффектами `onEnter`) — сам «квест-раннер»,
 * который следит за условиями стадий и переключает их автоматически, не в
 * скоупе этой задачи (см. `docs/BACKLOG.md` OF-018: «quest runtime — не в
 * исходном скоупе документа, но нужен для сквозного примера»). Здесь —
 * только хранилище: текущая стадия квеста + история пройденных стадий,
 * и переходы `startQuest`/`setQuestStage`, которыми такой раннер (или, пока
 * его нет, эффект `startQuest` из `rules.ts` через `interpreter.ts`) двигает
 * прогресс. Чистые данные + чистые функции, без DOM/времени/RNG.
 *
 * Допущение (см. отчёт задачи): `questStage`-условие (`rules.ts`,
 * `op: 'questStage'`) сравнивает либо точное совпадение текущей стадии
 * (`cmp: 'eq'`), либо факт «стадия когда-либо была достигнута»
 * (`cmp: 'atLeast'`, через `history.includes`). Формально `main-quest.md`
 * не описывает точный алгоритм сравнения «≥» для стадий с произвольными
 * (не обязательно линейно упорядоченными) id — использовать порядковый
 * номер стадии из `QuestSchema.stages` здесь нельзя, потому что плоское
 * `GameState` не обязано знать полное определение квеста (интерпретатор
 * условий не должен зависеть от контента квестов). `history.includes` —
 * консервативная и корректная трактовка для линейных квестов (все квесты
 * `main-quest.md` §2 линейны по стадиям); если появится нелинейный квест,
 * где `atLeast` должен учитывать порядок, а не факт посещения — довести
 * вместе с самим квест-раннером.
 */

export interface QuestRuntimeState {
  /** Id текущей стадии (локальный, `QuestStage.id` в терминах `quest.ts`). */
  readonly stage: string;
  /** Все стадии, через которые квест уже прошёл, включая текущую, в порядке достижения. */
  readonly history: readonly string[];
}

/** Квест → его runtime-состояние. Квест, которого нет в этом словаре, ещё не начат. */
export type QuestsState = Readonly<Record<string, QuestRuntimeState>>;

export function createEmptyQuestsState(): QuestsState {
  return {};
}

/** Стадия по умолчанию для только что начатого квеста — конвенция контента (`quest.ts`/фикстуры), первая стадия обычно называется `start`. */
export const DEFAULT_QUEST_START_STAGE = 'start';

/**
 * Запускает квест (эффект `startQuest`, `rules.ts`). Идемпотентно: повторный
 * `startQuest` уже начатого квеста не откатывает и не перезаписывает прогресс —
 * тем же способом, каким `addItem`/`equipItem` в `src/game/inventory`
 * не переигрывают уже случившееся состояние без явного намерения.
 */
export function startQuest(
  state: QuestsState,
  questId: string,
  initialStage: string = DEFAULT_QUEST_START_STAGE,
): QuestsState {
  if (state[questId]) return state;
  return { ...state, [questId]: { stage: initialStage, history: [initialStage] } };
}

/**
 * Переводит квест на стадию `stage`, добавляя её в историю. Пока не вызывается
 * ниоткуда автоматически (нет квест-раннера, см. заголовок файла) — готовый
 * примитив для будущей интеграции и для тестов интерпретатора условий.
 */
export function setQuestStage(state: QuestsState, questId: string, stage: string): QuestsState {
  const previous = state[questId];
  const history = previous ? [...previous.history, stage] : [stage];
  return { ...state, [questId]: { stage, history } };
}

export function currentQuestStage(state: QuestsState, questId: string): string | undefined {
  return state[questId]?.stage;
}

export function hasReachedQuestStage(state: QuestsState, questId: string, stage: string): boolean {
  return state[questId]?.history.includes(stage) ?? false;
}
