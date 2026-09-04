/**
 * Обход графа `DialogSchema` (`src/data/schemas/dialog.ts`, OF-009/OF-024):
 * текущий узел → видимые варианты ответа (с учётом `condition`/`check`) →
 * выбор → эффекты → следующий узел. Чистая логика поверх `interpreter.ts`,
 * без DOM — рендер и клики живут в `src/ui/dialogue` + `dialogue-screen.ts`
 * (склейка, по образцу `src/game/inventory/screen.ts`).
 *
 * Два разных механизма скрытия/пометки варианта ответа, оба из `dialog.ts`,
 * и здесь трактуются буквально по докстрингам схемы:
 *  - `choice.condition` — «скрывает реплику из списка выбора, если условие
 *    не выполнено»: такие варианты вообще не попадают в `DialogueNodeView`,
 *    если условие ложно.
 *  - `choice.check` — «реплика видна всегда, но помечена как проходящая
 *    проверку»: вариант всегда в списке, `check.passed` говорит UI,
 *    рисовать его как проходимый (`warning-yellow`) или как провальный
 *    (серый, зачёркнутый) — `docs/art/ui-shchitok.md` §6.
 */

import type { Dialog, DialogNode } from '../../data/schemas/dialog';
import type { CheckKey } from '../../data/schemas/rpg';
import { applyEffects, evaluateCondition, passesCheck, type GameState } from './interpreter';

export interface DialogueChoiceView {
  /** Индекс в `node.choices` исходного узла — передаётся обратно в `choose()`. */
  readonly choiceIndex: number;
  readonly textKey: string;
  /** Есть только если у варианта задан `check` — пороговая проверка навыка/характеристики, всегда видимая (см. заголовок файла). */
  readonly check?: { readonly stat: CheckKey; readonly dc: number; readonly passed: boolean };
}

export interface DialogueNodeView {
  readonly dialogId: string;
  readonly nodeId: string;
  readonly speaker: string;
  readonly textKey: string;
  readonly choices: readonly DialogueChoiceView[];
  /** `true`, если после фильтрации по `condition` не осталось ни одного варианта — терминальная реплика, дальше только закрыть диалог. */
  readonly ended: boolean;
}

function requireNode(dialog: Dialog, nodeId: string): DialogNode {
  const node = dialog.nodes[nodeId];
  if (!node) {
    throw new Error(`dialog-runner: диалог "${dialog.id}" не содержит узел "${nodeId}"`);
  }
  return node;
}

function toChoiceView(
  choice: DialogNode['choices'][number],
  choiceIndex: number,
  state: GameState,
): DialogueChoiceView {
  return {
    choiceIndex,
    textKey: choice.textKey,
    ...(choice.check ? { check: { ...choice.check, passed: passesCheck(choice.check, state) } } : {}),
  };
}

/** Строит вид-модель узла для UI/тестов: применяет видимость по `condition`, считает проверки `check`. */
export function viewNode(dialog: Dialog, nodeId: string, state: GameState): DialogueNodeView {
  const node = requireNode(dialog, nodeId);
  const choices = node.choices
    .map((choice, choiceIndex) => ({ choice, choiceIndex }))
    .filter(({ choice }) => choice.condition === undefined || evaluateCondition(choice.condition, state))
    .map(({ choice, choiceIndex }) => toChoiceView(choice, choiceIndex, state));

  return {
    dialogId: dialog.id,
    nodeId,
    speaker: node.speaker,
    textKey: node.textKey,
    choices,
    ended: choices.length === 0,
  };
}

/** Начинает диалог с `dialog.start`. */
export function startDialog(dialog: Dialog, state: GameState): DialogueNodeView {
  return viewNode(dialog, dialog.start, state);
}

export interface ChooseResult {
  readonly state: GameState;
  /** `null` — эта реплика завершает диалог (нет следующего узла). Иначе — id следующего узла. */
  readonly nextNodeId: string | null;
}

/**
 * Выбирает вариант `choiceIndex` в узле `nodeId`: применяет его эффекты и
 * возвращает id следующего узла (или `null`, если диалог на этом
 * заканчивается). Выбор варианта, скрытого невыполненным `condition`,
 * запрещён — UI не должен был его предложить (см. `viewNode`), поэтому
 * это программная ошибка вызывающей стороны, а не штатный игровой исход.
 */
export function choose(dialog: Dialog, nodeId: string, choiceIndex: number, state: GameState): ChooseResult {
  const node = requireNode(dialog, nodeId);
  const choice = node.choices[choiceIndex];
  if (!choice) {
    throw new Error(
      `dialog-runner: в узле "${nodeId}" диалога "${dialog.id}" нет варианта с индексом ${choiceIndex}`,
    );
  }
  if (choice.condition !== undefined && !evaluateCondition(choice.condition, state)) {
    throw new Error(
      `dialog-runner: вариант ${choiceIndex} узла "${nodeId}" скрыт условием и не может быть выбран`,
    );
  }
  return { state: applyEffects(state, choice.effects), nextNodeId: choice.next };
}

// ---------------------------------------------------------------------------
// Достижимость узлов — см. `docs/BACKLOG.md` OF-018 п.6 «недостижимый узел».
// ---------------------------------------------------------------------------

/**
 * Ключ для дедупликации обхода: тот же узел с той же «видимой интерпретатору»
 * частью состояния уже разбирался — дальше ветвиться незачем (иначе обход
 * зациклится на графах с обратными `next`, которые схема формально не
 * запрещает). Сериализуются только поля, которые реально читает
 * `evaluateCondition`/`passesCheck` (`flags`/`stats`/`skills`/`quests`) —
 * `inventory` в это сравнение сознательно не входит: `InventoryPort` — это
 * функции, не сравнимые по значению; обход остаётся корректным для всех
 * диалогов из `public/data/dialogs/**`, ни один из которых не использует
 * `hasItem`/`giveItem` (см. отчёт задачи — открытый вопрос на будущее).
 */
function stateSignature(state: GameState): string {
  return JSON.stringify({ flags: state.flags, stats: state.stats, skills: state.skills, quests: state.quests });
}

/**
 * Все узлы диалога, достижимые хотя бы одной последовательностью выборов из
 * `dialog.start`, начиная с `initialState` (с учётом `condition` и эффектов,
 * применяемых по пути). Узел, которого нет в результате — либо опечатка в
 * `next` (её уже ловит `tools/validate-data.ts`), либо синтаксически
 * валидный, но логически недостижимый узел: все ведущие к нему варианты
 * заблокированы условиями при любой последовательности выборов из этого
 * диалога и этого стартового состояния.
 *
 * Ограничение (см. `stateSignature`): достижимость проверяется только
 * относительно `flags`/`stats`/`skills`/`quests`, без учёта `hasItem` —
 * этого достаточно для всех диалогов среза (OF-024), т.к. ни один не
 * использует инвентарные условия в `choice.condition`.
 */
export function reachableNodeIds(dialog: Dialog, initialState: GameState): ReadonlySet<string> {
  const reached = new Set<string>();
  const visited = new Set<string>();
  const stack: Array<{ nodeId: string; state: GameState }> = [{ nodeId: dialog.start, state: initialState }];

  // Предохранитель от аномально ветвистых/зацикленных графов — обычный
  // диалог среза (≤ десятка узлов) обходится за десятки шагов.
  const MAX_STEPS = 10_000;
  let steps = 0;

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    if (++steps > MAX_STEPS) break;

    reached.add(frame.nodeId);
    const key = `${frame.nodeId}::${stateSignature(frame.state)}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const node = dialog.nodes[frame.nodeId];
    if (!node) continue; // битый next — не забота этой функции, см. `tools/validate-data.ts`

    for (const choice of node.choices) {
      if (choice.condition !== undefined && !evaluateCondition(choice.condition, frame.state)) continue;
      if (choice.next === null) continue;
      stack.push({ nodeId: choice.next, state: applyEffects(frame.state, choice.effects) });
    }
  }

  return reached;
}

/** Узлы диалога, ни разу не встреченные в `reachableNodeIds` — см. её докстринг. */
export function findUnreachableNodeIds(dialog: Dialog, initialState: GameState): readonly string[] {
  const reached = reachableNodeIds(dialog, initialState);
  return Object.keys(dialog.nodes).filter((id) => !reached.has(id));
}
