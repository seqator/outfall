/**
 * Экран выбора карты Арены + модификаторов (OF-039, критерий готовности
 * «Арена открывается из меню»). Плейсхолдерный DOM-UI — та же честная
 * простота, что уже принята для `title-screen.ts`/`src/ui/inventory`: ни
 * бизнес-логики, ни доступа к `localStorage`/сети здесь нет, только
 * построение DOM из уже готовых данных и колбэки на клики (`ArenaMenuProps`).
 * Реальная логика (список карт/модификаторов, чтение рекордов, запуск
 * забега) — `src/game/world/arena.ts` + `src/game/save/arena-records.ts`,
 * склейка — `main.ts` (единственное место, которому разрешено знать и про
 * `ui`, и про `game`, см. докстринг `main.ts`).
 */

const PALETTE = {
  soot: '#0F0E0C',
  wetAsphalt: '#3A342C',
  panel: '#6E6656',
  fadedPlaster: '#A89C82',
  ochreLamp: '#C98A3A',
  acid: '#B4F02A',
} as const;

const TITLE_FONT_STACK = "'Oswald', 'Arial Narrow', sans-serif";
const BODY_FONT_STACK = "'PT Mono', 'Consolas', monospace";

export interface ArenaMenuMapOption {
  readonly id: string;
  readonly label: string;
}

export interface ArenaMenuModifierOption {
  readonly id: string;
  readonly label: string;
}

export interface ArenaMenuHandlers {
  /** Человекочитаемый рекорд карты `mapId` при текущем наборе активных модификаторов (пересчитывается вызывающей стороной на каждый тогл — экран сам не знает формат/источник рекорда). */
  getRecordLabel(mapId: string, activeModifierIds: readonly string[]): string;
  onLaunch(mapId: string, activeModifierIds: readonly string[]): void;
  onBack(): void;
}

export interface ArenaMenu {
  readonly element: HTMLElement;
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

export function createArenaMenu(
  root: HTMLElement,
  maps: readonly ArenaMenuMapOption[],
  modifiers: readonly ArenaMenuModifierOption[],
  handlers: ArenaMenuHandlers,
): ArenaMenu {
  const activeModifierIds = new Set<string>();

  const overlay = styled('div', {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
    padding: '2rem',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: `radial-gradient(ellipse at center, ${PALETTE.wetAsphalt} 0%, ${PALETTE.soot} 100%)`,
    color: PALETTE.fadedPlaster,
    fontFamily: BODY_FONT_STACK,
    zIndex: '20',
    userSelect: 'none',
  });
  overlay.id = 'arena-menu';

  const title = styled('h1', {
    margin: '0',
    fontFamily: TITLE_FONT_STACK,
    fontSize: 'clamp(32px, 6vw, 56px)',
    letterSpacing: '0.08em',
    color: PALETTE.ochreLamp,
  });
  title.textContent = 'АРЕНА';

  const modifiersRow = styled('div', { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' });
  const modifierButtons = new Map<string, HTMLButtonElement>();

  const mapsColumn = styled('div', {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    width: 'min(480px, 90vw)',
  });
  const recordLabels = new Map<string, HTMLDivElement>();

  function refreshRecords(): void {
    const active = [...activeModifierIds];
    for (const map of maps) {
      const label = recordLabels.get(map.id);
      if (label) label.textContent = handlers.getRecordLabel(map.id, active);
    }
  }

  function setModifierButtonStyle(button: HTMLButtonElement, active: boolean): void {
    button.style.background = active ? PALETTE.acid : 'transparent';
    button.style.color = active ? PALETTE.soot : PALETTE.fadedPlaster;
    button.style.borderColor = active ? PALETTE.acid : PALETTE.panel;
  }

  for (const modifier of modifiers) {
    const button = styled('button', {
      padding: '0.5rem 1rem',
      fontFamily: BODY_FONT_STACK,
      fontSize: '14px',
      letterSpacing: '0.04em',
      border: `1px solid ${PALETTE.panel}`,
      cursor: 'pointer',
      background: 'transparent',
      color: PALETTE.fadedPlaster,
    });
    button.type = 'button';
    button.textContent = modifier.label;
    setModifierButtonStyle(button, false);
    button.addEventListener('click', () => {
      const next = !activeModifierIds.has(modifier.id);
      if (next) activeModifierIds.add(modifier.id);
      else activeModifierIds.delete(modifier.id);
      setModifierButtonStyle(button, next);
      refreshRecords();
    });
    modifierButtons.set(modifier.id, button);
    modifiersRow.appendChild(button);
  }

  for (const map of maps) {
    const card = styled('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      padding: '0.75rem 1rem',
      border: `1px solid ${PALETTE.panel}`,
      background: 'rgba(15, 14, 12, 0.4)',
    });

    const info = styled('div', { display: 'flex', flexDirection: 'column', gap: '0.25rem' });
    const mapName = styled('div', { fontSize: '16px', color: PALETTE.fadedPlaster });
    mapName.textContent = map.label;
    const recordLine = styled('div', { fontSize: '12px', color: PALETTE.ochreLamp });
    recordLabels.set(map.id, recordLine);
    info.append(mapName, recordLine);

    const launchButton = styled('button', {
      padding: '0.5rem 1.25rem',
      fontFamily: TITLE_FONT_STACK,
      fontSize: '14px',
      letterSpacing: '0.06em',
      color: PALETTE.soot,
      background: PALETTE.acid,
      border: 'none',
      cursor: 'pointer',
    });
    launchButton.type = 'button';
    launchButton.textContent = 'В БОЙ';
    launchButton.addEventListener('click', () => handlers.onLaunch(map.id, [...activeModifierIds]));

    card.append(info, launchButton);
    mapsColumn.appendChild(card);
  }

  const backButton = styled('button', {
    marginTop: '0.5rem',
    padding: '0.5rem 1.5rem',
    fontFamily: TITLE_FONT_STACK,
    fontSize: '14px',
    letterSpacing: '0.06em',
    color: PALETTE.fadedPlaster,
    background: 'transparent',
    border: `1px solid ${PALETTE.panel}`,
    cursor: 'pointer',
  });
  backButton.type = 'button';
  backButton.textContent = 'НАЗАД';
  backButton.addEventListener('click', () => handlers.onBack());

  overlay.append(title, modifiersRow, mapsColumn, backButton);
  root.appendChild(overlay);
  refreshRecords();

  return {
    element: overlay,
    destroy(): void {
      overlay.remove();
    },
  };
}
