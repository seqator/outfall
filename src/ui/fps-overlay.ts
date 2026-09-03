/**
 * Минимальный DOM-оверлей FPS. Часть слоя `ui` (DOM поверх канваса, §7 доклада
 * — «UI: DOM-оверлей»). Не знает ни о `sim`, ни о Pixi: просто рисует число,
 * которое ему передают.
 */

export interface FpsOverlay {
  readonly element: HTMLElement;
  update(fps: number): void;
  destroy(): void;
}

export function createFpsOverlay(root: HTMLElement): FpsOverlay {
  const el = document.createElement('div');
  el.id = 'fps-overlay';
  Object.assign(el.style, {
    position: 'absolute',
    top: '8px',
    left: '8px',
    padding: '2px 6px',
    background: 'rgba(0, 0, 0, 0.5)',
    color: '#7CFC00',
    fontFamily: 'monospace',
    fontSize: '12px',
    lineHeight: '1.4',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: '10',
  } satisfies Partial<CSSStyleDeclaration>);
  el.textContent = 'FPS: --';
  root.appendChild(el);

  return {
    element: el,
    update(fps: number): void {
      el.textContent = `FPS: ${fps.toFixed(0)}`;
    },
    destroy(): void {
      el.remove();
    },
  };
}
