/**
 * Вид-модель экрана «Диалог» для DOM-UI (OF-018, `docs/art/ui-shchitok.md`
 * §6 «Экран 3 — Диалог»). Как и `src/ui/inventory/types.ts` (OF-017), этот
 * файл намеренно не переиспользует типы `src/game/dialogue`
 * (`DialogueNodeView`, `GameState`...) — `ui` не может импортировать
 * `game`/`sim` (граница слоёв, `eslint.config.js` `import-x/no-restricted-paths`).
 * Приведение доменного состояния к этой вид-модели делает
 * `src/game/dialogue/dialogue-screen.ts` — единственный файл, которому
 * разрешено знать оба слоя.
 */

export interface DialogueChoiceView {
  /** Индекс исходного варианта в узле диалога — возвращается в `onChoose`. */
  readonly choiceIndex: number;
  readonly text: string;
  /**
   * Подпись проверки, напр. `[Язык 5]` (`ui-shchitok.md` §6) — есть только у
   * вариантов с `check`. Условные (`condition`) варианты сюда не попадают
   * вовсе, если условие не выполнено — их скрывает `dialog-runner`
   * до вид-модели, здесь `checkLabel`/`checkPassed` относятся только к
   * порогу, который «видно заранее» (`rpg-system.md` §1).
   */
  readonly checkLabel?: string;
  /** `true` — проверка проходит сейчас (`warning-yellow`), `false` — провальная (серый, зачёркнутый), см. `ui-shchitok.md` §6 «Состояния варианта ответа». */
  readonly checkPassed?: boolean;
}

export interface DialogueViewModel {
  readonly speakerName: string;
  readonly text: string;
  readonly choices: readonly DialogueChoiceView[];
  /** Терминальная реплика — нет ни одного видимого варианта, только закрыть диалог. */
  readonly ended: boolean;
}

export interface DialogueHandlers {
  onChoose(choiceIndex: number): void;
  onClose(): void;
}
