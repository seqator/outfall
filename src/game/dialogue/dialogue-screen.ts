/**
 * Склейка логики диалога (этот каталог) и DOM-UI (`src/ui/dialogue`) —
 * единственное место, которому разрешено импортировать оба слоя
 * (`docs/tech/architecture.md` §1: `game → ui`, а `ui` не может
 * импортировать `game` — граница `import-x/no-restricted-paths` в
 * `eslint.config.js`). По образцу `src/game/inventory/screen.ts` (OF-017):
 * `ui/dialogue` не знает о существовании этого файла, всё взаимодействие —
 * через колбэки `DialogueHandlers`.
 *
 * Не входит в OF-018 (см. отчёт задачи, «что осталось для интеграции»):
 * привязка к `GameLoop`/сценам (когда открывать короб диалога поверх
 * игрового мира, откуда брать реальный `GameState` игрока/сейва, i18n
 * вместо сырых `textKey`) — эта задача не создаёт сцен, ей ещё неоткуда
 * брать `World` (см. `docs/tech/architecture.md` §3–4, OF-015/019/027).
 * `createDialogueScreen` — уже готовый контракт «дай состояние — получи
 * DOM», который такая обвязка сможет использовать без изменений.
 */

import type { Dialog } from '../../data/schemas/dialog';
import { createDialoguePanel, type DialogueHandlers, type DialogueViewModel } from '../../ui/dialogue';
import { formatCheckLabel } from './check-labels';
import { choose, viewNode, type DialogueNodeView } from './dialog-runner';
import type { GameState } from './interpreter';

export interface DialogueScreenOptions {
  /** Вызывается на каждый переход эффектов (выбор варианта) — обычно записывает состояние в `SaveStore`/ECS вызывающей стороны (будущая интеграция). */
  onStateChange?(state: GameState): void;
  /** Вызывается, когда диалог закрывается (терминальный узел подтверждён, `viewNode(...).ended`). */
  onClose?(): void;
}

export interface DialogueScreen {
  readonly state: GameState;
  readonly nodeId: string;
  destroy(): void;
}

function toViewModel(nodeView: DialogueNodeView): DialogueViewModel {
  return {
    // TODO(OF-019): резолвить speaker/textKey через I18n, когда он появится; пока — сырой ключ контента, как `toItemView` в `game/inventory/screen.ts`.
    speakerName: nodeView.speaker,
    text: nodeView.textKey,
    ended: nodeView.ended,
    choices: nodeView.choices.map((choice) => ({
      choiceIndex: choice.choiceIndex,
      text: choice.textKey,
      ...(choice.check
        ? { checkLabel: formatCheckLabel(choice.check), checkPassed: choice.check.passed }
        : {}),
    })),
  };
}

export function createDialogueScreen(
  root: HTMLElement,
  dialog: Dialog,
  initialState: GameState,
  options: DialogueScreenOptions = {},
): DialogueScreen {
  let state = initialState;
  let nodeId = dialog.start;

  function refresh(): void {
    panel.update(toViewModel(viewNode(dialog, nodeId, state)));
  }

  const handlers: DialogueHandlers = {
    onChoose(choiceIndex): void {
      const result = choose(dialog, nodeId, choiceIndex, state);
      state = result.state;
      options.onStateChange?.(state);
      if (result.nextNodeId === null) {
        options.onClose?.();
        return;
      }
      nodeId = result.nextNodeId;
      refresh();
    },
    onClose(): void {
      options.onClose?.();
    },
  };

  const panel = createDialoguePanel(root, handlers);
  refresh();

  return {
    get state() {
      return state;
    },
    get nodeId() {
      return nodeId;
    },
    destroy(): void {
      panel.destroy();
    },
  };
}
