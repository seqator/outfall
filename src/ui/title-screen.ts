/**
 * Титульный экран (первые 0–3 секунды из таблицы `docs/OUTFALL-CONCEPT.md`
 * §6): название, лор-строка, одна кнопка «Погнали». Никаких логотипов,
 * лаунчеров, выбора языка, аккаунта — по «Чего избегать» из мастер-промпта
 * и по правилу №10 `docs/research/tone-limits.md` (никакой самоиронии про
 * нейросети на входе — дисклеймер только в титрах, сюда его не добавляем).
 *
 * DOM-оверлей поверх `#app-root`, часть слоя `ui` — не знает о `sim`/`core`,
 * только вызывает переданный колбэк по клику.
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

export interface TitleScreen {
  readonly element: HTMLElement;
  destroy(): void;
}

export function createTitleScreen(root: HTMLElement, onStart: () => void): TitleScreen {
  const overlay = document.createElement('div');
  overlay.id = 'title-screen';
  Object.assign(overlay.style, {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.5rem',
    background: `radial-gradient(ellipse at center, ${PALETTE.wetAsphalt} 0%, ${PALETTE.soot} 100%)`,
    color: PALETTE.fadedPlaster,
    zIndex: '20',
    userSelect: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  const title = document.createElement('h1');
  title.textContent = 'OUTFALL';
  Object.assign(title.style, {
    margin: '0',
    fontFamily: TITLE_FONT_STACK,
    fontSize: 'clamp(48px, 10vw, 96px)',
    letterSpacing: '0.08em',
    color: PALETTE.ochreLamp,
    textShadow: `0 0 24px ${PALETTE.ochreLamp}55`,
  } satisfies Partial<CSSStyleDeclaration>);

  const subtitle = document.createElement('div');
  subtitle.textContent = 'ПУСТОШЬ ПО ГОСТУ';
  Object.assign(subtitle.style, {
    fontFamily: TITLE_FONT_STACK,
    fontSize: 'clamp(16px, 2.4vw, 22px)',
    letterSpacing: '0.16em',
    color: PALETTE.fadedPlaster,
  } satisfies Partial<CSSStyleDeclaration>);

  const lore = document.createElement('div');
  lore.textContent = 'Куда всё стекает.';
  Object.assign(lore.style, {
    fontFamily: BODY_FONT_STACK,
    fontSize: '14px',
    color: PALETTE.panel,
  } satisfies Partial<CSSStyleDeclaration>);

  const button = document.createElement('button');
  button.textContent = 'ПОГНАЛИ';
  button.type = 'button';
  Object.assign(button.style, {
    marginTop: '1rem',
    padding: '0.75rem 2.5rem',
    fontFamily: TITLE_FONT_STACK,
    fontSize: '18px',
    letterSpacing: '0.1em',
    color: PALETTE.soot,
    background: PALETTE.acid,
    border: 'none',
    cursor: 'pointer',
    boxShadow: `0 0 0 2px ${PALETTE.soot}, 0 0 20px ${PALETTE.acid}55`,
  } satisfies Partial<CSSStyleDeclaration>);
  button.addEventListener('mouseenter', () => {
    button.style.filter = 'brightness(1.15)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.filter = 'none';
  });

  const handleClick = (): void => onStart();
  button.addEventListener('click', handleClick);

  overlay.append(title, subtitle, lore, button);
  root.appendChild(overlay);

  return {
    element: overlay,
    destroy(): void {
      button.removeEventListener('click', handleClick);
      overlay.remove();
    },
  };
}
