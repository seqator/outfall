/**
 * Склейка логики диалога (этот каталог) и DOM-UI (`src/ui/dialogue`) —
 * единственное место, которому разрешено импортировать оба слоя
 * (`docs/tech/architecture.md` §1: `game → ui`, а `ui` не может
 * импортировать `game` — граница `import-x/no-restricted-paths` в
 * `eslint.config.js`). По образцу `src/game/inventory/screen.ts` (OF-017):
 * `ui/dialogue` не знает о существовании этого файла, всё взаимодействие —
 * через колбэки `DialogueHandlers`.
 *
 * Резолвит `speaker`/`textKey` через `I18n` (`src/game/i18n`, OF-019/025) —
 * `t` обязателен, а не опционален: показывать сырые ключи в UI по умолчанию
 * значило бы повторить баг, который поймала рецензия OF-030 (диалоговое
 * окно показывало `NPC.SANITAR`/`dialog.prolog_smotritel.start` вместо
 * текста). `speaker` в `DialogNode` — это id NPC (`npc.sanitar`, тот же, что
 * `dialog.npc`), а не готовый ключ локализации — имя резолвится по
 * конвенции `<npcId>.name` (см. `public/data/i18n/ru.json`, задаётся
 * level-designer вместе с `npcs[].id` карты).
 */

import type { Dialog } from '../../data/schemas/dialog';
import { createDialoguePanel, type DialogueHandlers, type DialogueViewModel } from '../../ui/dialogue';
import type { I18n } from '../i18n';
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

function toViewModel(nodeView: DialogueNodeView, t: I18n['t']): DialogueViewModel {
  return {
    speakerName: t(`${nodeView.speaker}.name`),
    text: t(nodeView.textKey),
    ended: nodeView.ended,
    choices: nodeView.choices.map((choice) => ({
      choiceIndex: choice.choiceIndex,
      text: t(choice.textKey),
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
  t: I18n['t'],
  options: DialogueScreenOptions = {},
): DialogueScreen {
  let state = initialState;
  let nodeId = dialog.start;

  function refresh(): void {
    panel.update(toViewModel(viewNode(dialog, nodeId, state), t));
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
