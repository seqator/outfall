/**
 * DOM-рендер экрана «Инвентарь» (OF-017, `docs/art/ui-shchitok.md` §5).
 * Ничего не решает сам: только строит DOM из `InventoryViewModel` и зовёт
 * колбэки `InventoryHandlers` на клики — вся бизнес-логика (что можно
 * экипировать, как считается вес) живёт в `src/game/inventory` и приходит
 * сюда уже посчитанной, тем же способом, что `createFpsOverlay` получает
 * готовое число `fps` (см. `src/ui/fps-overlay.ts`).
 *
 * Взаимодействие — клик (не drag-and-drop): выбрать предмет в сетке →
 * кнопки «Экипировать»/«Выбросить» в панели описания, клик по занятому
 * слоту силуэта — снять. Спека `ui-shchitok.md` допускает drag-and-drop,
 * но явно отмечает, что для инвентаря-«весового пула» (без сетки/тетриса,
 * `items-economy.md` §0) важен сам факт выбора, не форма — клик проще для
 * ручной проверки и не требует эмуляции HTML5 DnD в тестах.
 */

import { formatDecay, formatWallet, formatWeight } from './format';
import { INVENTORY_SLOT_IDS, INVENTORY_SLOT_LABELS } from './types';
import type { InventoryHandlers, InventoryItemView, InventoryViewModel } from './types';

/** `docs/art/ui-shchitok.md` §3 — 14 цветов палитры, назначенные ролям UI. */
const PALETTE = {
  soot: '#0F0E0C',
  wetAsphalt: '#3A342C',
  panel: '#6E6656',
  fadedPlaster: '#A89C82',
  rust: '#7A3F22',
  terminalPhosphor: '#2FE0A0',
  terminalAmber: '#FFB13D',
  hostileRed: '#FF3B2F',
  flashWhite: '#F4F1E8',
} as const;

const GRID_CELL_COUNT = 8 * 6; // `ui-shchitok.md` §5: сетка 8×6 ячеек.

export interface InventoryPanel {
  readonly element: HTMLElement;
  update(vm: InventoryViewModel): void;
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

export function createInventoryPanel(root: HTMLElement, handlers: InventoryHandlers): InventoryPanel {
  const overlay = styled('div', {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(15, 14, 12, 0.85)',
    color: PALETTE.terminalPhosphor,
    fontFamily: "'PT Mono', 'Consolas', monospace",
    fontSize: '16px',
    padding: '16px',
    boxSizing: 'border-box',
    border: `4px solid ${PALETTE.rust}`,
    zIndex: '20',
  });

  const header = styled('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderBottom: `1px solid ${PALETTE.panel}`,
    paddingBottom: '8px',
    marginBottom: '8px',
  });
  const title = styled('h1', {
    fontSize: '20px',
    letterSpacing: '0.08em',
    margin: '0',
    textTransform: 'uppercase',
  });
  title.textContent = 'ЛИЧНЫЕ ВЕЩИ';
  const weightLabel = styled('div', { color: PALETTE.terminalAmber, fontSize: '16px' });
  const closeButton = styled('button', {
    background: 'transparent',
    color: PALETTE.terminalPhosphor,
    border: `1px solid ${PALETTE.panel}`,
    cursor: 'pointer',
  });
  closeButton.textContent = 'ЗАКРЫТЬ [I]';
  closeButton.addEventListener('click', () => handlers.onClose());
  header.append(title, weightLabel, closeButton);

  const body = styled('div', { display: 'flex', flex: '1', gap: '16px', minHeight: '0' });

  const silhouette = styled('div', {
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  });

  const grid = styled('div', {
    flex: '1',
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 1fr)',
    gridAutoRows: '48px',
    gap: '4px',
    alignContent: 'start',
    overflowY: 'auto',
  });

  const description = styled('div', {
    width: '240px',
    color: PALETTE.terminalAmber,
    fontSize: '14px',
    whiteSpace: 'pre-wrap',
  });

  body.append(silhouette, grid, description);
  overlay.append(header, body);
  root.appendChild(overlay);

  function renderSlots(vm: InventoryViewModel): void {
    silhouette.replaceChildren();
    for (const slotId of INVENTORY_SLOT_IDS) {
      const view = vm.slots.find((s) => s.slotId === slotId);
      const button = styled('button', {
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px',
        background: view?.item ? PALETTE.panel : PALETTE.soot,
        color: view?.locked ? PALETTE.rust : PALETTE.terminalPhosphor,
        border: `1px solid ${view?.locked ? PALETTE.rust : PALETTE.panel}`,
        cursor: 'pointer',
      });
      button.textContent = `${INVENTORY_SLOT_LABELS[slotId]}\n${view?.item?.name ?? '—'}`;
      button.addEventListener('click', () => {
        if (view?.item) handlers.onUnequip(slotId);
      });
      silhouette.appendChild(button);
    }
  }

  function renderCell(item: InventoryItemView | undefined, selectedUid: string | undefined): HTMLElement {
    const selected = item !== undefined && item.uid === selectedUid;
    const cell = styled('div', {
      background: PALETTE.soot,
      border: `1px solid ${selected ? PALETTE.flashWhite : PALETTE.soot}`,
      color: PALETTE.terminalAmber,
      fontSize: '11px',
      padding: '2px',
      position: 'relative',
      overflow: 'hidden',
      cursor: item ? 'pointer' : 'default',
    });
    if (!item) return cell;

    cell.title = item.name;
    cell.textContent = item.name;
    if (item.quantity > 1) {
      const count = styled('span', {
        position: 'absolute',
        right: '2px',
        bottom: '2px',
        color: PALETTE.terminalAmber,
      });
      count.textContent = String(item.quantity);
      cell.appendChild(count);
    }
    if (item.decay) {
      const clock = styled('span', {
        position: 'absolute',
        left: '2px',
        top: '2px',
        color: item.decay.warning ? PALETTE.hostileRed : PALETTE.terminalPhosphor,
      });
      clock.textContent = `⏳${formatDecay(item.decay.remainingMs)}`;
      cell.appendChild(clock);
    }
    cell.addEventListener('click', () => handlers.onSelect(item.uid));
    return cell;
  }

  function renderGrid(vm: InventoryViewModel): void {
    grid.replaceChildren();
    const count = Math.max(GRID_CELL_COUNT, vm.backpack.length);
    for (let i = 0; i < count; i++) {
      grid.appendChild(renderCell(vm.backpack[i], vm.selectedUid));
    }
  }

  function renderDescription(vm: InventoryViewModel): void {
    description.replaceChildren();
    const item = vm.backpack.find((i) => i.uid === vm.selectedUid);
    if (!item) {
      description.textContent = 'Выберите предмет.';
      return;
    }
    const text = styled('div', {});
    const lines = [
      item.name,
      `Вес: ${item.weightKg.toFixed(2)} кг`,
      `Цена: ${item.priceGaiki} Гаек`,
      item.effectText,
    ];
    if (item.decay) lines.push(`Распад через: ${formatDecay(item.decay.remainingMs)}`);
    text.textContent = lines.join('\n');

    const dropButton = styled('button', {
      display: 'block',
      marginTop: '4px',
      cursor: 'pointer',
      color: PALETTE.hostileRed,
    });
    dropButton.textContent = 'Выбросить';
    dropButton.addEventListener('click', () => handlers.onDrop(item.uid));

    // Расходники (`usable`, OF-058, `items-economy.md` §4) показывают
    // «Использовать» вместо «Экипировать» — предметы этого `kind` никогда
    // не занимают слот экипировки (`equip-slots.ts: resolveEquipmentSlot`
    // возвращает `null` для `consumable`), обе кнопки одновременно не имели
    // бы смысла для одного и того же предмета.
    const primaryButton = styled('button', {
      display: 'block',
      marginTop: '8px',
      cursor: 'pointer',
      ...(item.usable ? { color: PALETTE.terminalPhosphor } : {}),
    });
    if (item.usable) {
      primaryButton.textContent = 'Использовать';
      primaryButton.addEventListener('click', () => handlers.onUse(item.uid));
    } else {
      primaryButton.textContent = 'Экипировать';
      primaryButton.addEventListener('click', () => handlers.onEquip(item.uid));
    }

    description.append(text, primaryButton, dropButton);
  }

  function update(vm: InventoryViewModel): void {
    weightLabel.textContent = formatWeight(vm.weightCurrentKg, vm.weightLimitKg);
    weightLabel.style.color = vm.overloaded ? PALETTE.hostileRed : PALETTE.terminalAmber;
    header.style.background = vm.overloaded ? 'rgba(255, 59, 47, 0.15)' : 'transparent';

    weightLabel.title = `Кошелёк: ${formatWallet(vm.walletGaiki)}`;

    renderSlots(vm);
    renderGrid(vm);
    renderDescription(vm);
  }

  return {
    element: overlay,
    update,
    destroy(): void {
      overlay.remove();
    },
  };
}
