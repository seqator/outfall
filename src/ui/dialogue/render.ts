/**
 * DOM-рендер экрана «Диалог» (OF-018, `docs/art/ui-shchitok.md` §6, «нижние
 * 40% экрана»). Ничего не решает сам: только строит DOM из
 * `DialogueViewModel` и зовёт колбэки `DialogueHandlers` на клики — вся
 * бизнес-логика (какие варианты видны, что проходит проверку) живёт в
 * `src/game/dialogue` и приходит сюда уже посчитанной, тем же способом, что
 * `createInventoryPanel` получает готовую `InventoryViewModel`
 * (`src/ui/inventory/render.ts`).
 *
 * Взаимодействие — клик по варианту ответа. Печать текста по символу,
 * анимация короба (200/150 мс) и портрет с 3 эмоциями из макета —
 * визуальная полировка вне скоупа OF-018 (нет ассетов портретов до OF-020),
 * здесь — статичный текст и заглушка портрета с тем же местом в вёрстке,
 * чтобы подключение позже не потребовало переверстки.
 */

import type { DialogueChoiceView, DialogueHandlers, DialogueViewModel } from './types';

/** `docs/art/ui-shchitok.md` §3 — те же роли палитры, что и в `ui/inventory/render.ts`. */
const PALETTE = {
  soot: '#0F0E0C',
  wetAsphalt: '#3A342C',
  panel: '#6E6656',
  terminalPhosphor: '#2FE0A0',
  warningYellow: '#F2C037',
  flashWhite: '#F4F1E8',
} as const;

export interface DialoguePanel {
  readonly element: HTMLElement;
  update(vm: DialogueViewModel): void;
  destroy(): void;
}

function styled<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration>,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el.style, style);
  return el;
}

export function createDialoguePanel(root: HTMLElement, handlers: DialogueHandlers): DialoguePanel {
  const box = styled('div', {
    position: 'absolute',
    left: '0',
    right: '0',
    bottom: '0',
    height: '40%',
    display: 'flex',
    gap: '16px',
    background: PALETTE.wetAsphalt,
    color: PALETTE.terminalPhosphor,
    fontFamily: "'PT Mono', 'Consolas', monospace",
    fontSize: '16px',
    padding: '16px',
    boxSizing: 'border-box',
    border: `1px solid ${PALETTE.soot}`,
    zIndex: '10',
  });

  const portrait = styled('div', {
    width: '192px',
    height: '192px',
    flexShrink: '0',
    background: PALETTE.soot,
    border: `1px solid ${PALETTE.panel}`,
  });

  const content = styled('div', { display: 'flex', flexDirection: 'column', flex: '1', minHeight: '0', gap: '8px' });

  const speaker = styled('div', {
    fontSize: '20px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  });

  const text = styled('div', { flexShrink: '0' });

  const choicesList = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    overflowY: 'auto',
    borderTop: `1px solid ${PALETTE.panel}`,
    paddingTop: '8px',
  });

  content.append(speaker, text, choicesList);
  box.append(portrait, content);
  root.appendChild(box);

  function renderChoice(choice: DialogueChoiceView, order: number): HTMLElement {
    const failed = choice.checkPassed === false;
    const row = styled('button', {
      display: 'block',
      textAlign: 'left',
      background: 'transparent',
      border: 'none',
      color: failed ? PALETTE.panel : PALETTE.terminalPhosphor,
      textDecoration: failed ? 'line-through' : 'none',
      cursor: failed ? 'default' : 'pointer',
      padding: '2px 0',
    });
    const labelPart = choice.checkLabel ? `${choice.checkLabel} ` : '';
    row.textContent = `${order}. ${labelPart}${choice.text}`;
    if (choice.checkLabel && choice.checkPassed) {
      row.style.color = PALETTE.warningYellow;
    }
    if (!failed) {
      row.addEventListener('click', () => handlers.onChoose(choice.choiceIndex));
      row.addEventListener('mouseenter', () => {
        row.style.background = PALETTE.panel;
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = 'transparent';
      });
    }
    return row;
  }

  function update(vm: DialogueViewModel): void {
    speaker.textContent = vm.speakerName;
    text.textContent = vm.text;
    choicesList.replaceChildren();
    if (vm.ended) {
      const closeRow = styled('button', {
        display: 'block',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        color: PALETTE.flashWhite,
        cursor: 'pointer',
        padding: '2px 0',
      });
      closeRow.textContent = 'Продолжить';
      closeRow.addEventListener('click', () => handlers.onClose());
      choicesList.appendChild(closeRow);
      return;
    }
    vm.choices.forEach((choice, i) => choicesList.appendChild(renderChoice(choice, i + 1)));
  }

  return {
    element: box,
    update,
    destroy(): void {
      box.remove();
    },
  };
}
