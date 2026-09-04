/**
 * DOM-реализация `InputSource` (OF-015): клавиатура → `InputSnapshot`
 * (§3.4 доклада engine-architect). Единственный файл слоя `input`, который
 * трогает `window` — `sim`/`core` читают только чистые данные, см.
 * `core/input.ts`.
 *
 * WASD и стрелки — движение (`moveX`/`moveY`, нормализовано по диагонали,
 * уже в мировых осях: X — восток/запад, Y — юг/север). Остальные действия
 * (`Action`) мапятся на клавиши/кнопку мыши.
 *
 * OF-016: `Mouse0` (ЛКМ → `attack`) уже был объявлен в `ACTION_KEYS`
 * (задел OF-015), но ни разу не подключался к событию мыши — `heldKeys`
 * заполнялась только из `keydown`/`keyup` (`KeyboardEvent.code`), поэтому
 * стрельба мышью физически не работала. Добавлены `mousedown`/`mouseup`,
 * кладущие/убирающие тот же синтетический код `'Mouse0'` в `heldKeys` —
 * без этого «игрок стреляет (ЛКМ или attack)» из боевого среза было бы
 * невозможно проверить руками.
 */

import { EMPTY_INPUT, type Action, type InputSnapshot } from '../core/input';
import type { InputSource } from '../core/loop';

const MOVE_KEYS: Record<string, readonly [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const ACTION_KEYS: Record<string, Action> = {
  Space: 'dash',
  KeyE: 'interact',
  KeyR: 'reload',
  KeyI: 'inventory',
  Escape: 'pause',
  Digit1: 'slot1',
  Digit2: 'slot2',
  Digit3: 'slot3',
  Mouse0: 'attack',
};

export interface DomInputHandle {
  readonly source: InputSource;
  destroy(): void;
}

/**
 * `target` по умолчанию — `window` (реальный запуск); в тестах можно
 * подсунуть `EventTarget`-заглушку, чтобы не трогать глобальный DOM.
 */
export function createDomInputSource(target: EventTarget = window): DomInputHandle {
  const heldKeys = new Set<string>();
  const justPressed = new Set<Action>();
  let aimWorld = { x: 0, y: 0 };

  const handleKeyDown = (e: Event): void => {
    const code = (e as KeyboardEvent).code;
    if (!heldKeys.has(code)) {
      const action = ACTION_KEYS[code];
      if (action) justPressed.add(action);
    }
    heldKeys.add(code);
  };

  const handleKeyUp = (e: Event): void => {
    heldKeys.delete((e as KeyboardEvent).code);
  };

  const handleMouseMove = (e: Event): void => {
    const me = e as MouseEvent;
    aimWorld = { x: me.clientX, y: me.clientY };
  };

  /** Синтетический «код» кнопки мыши — тот же приём, что `KeyboardEvent.code`, только для `ACTION_KEYS['Mouse0']`. */
  const MOUSE_BUTTON_CODES: Record<number, string> = { 0: 'Mouse0' };

  const handleMouseDown = (e: Event): void => {
    const code = MOUSE_BUTTON_CODES[(e as MouseEvent).button];
    if (!code) return;
    if (!heldKeys.has(code)) {
      const action = ACTION_KEYS[code];
      if (action) justPressed.add(action);
    }
    heldKeys.add(code);
  };

  const handleMouseUp = (e: Event): void => {
    const code = MOUSE_BUTTON_CODES[(e as MouseEvent).button];
    if (!code) return;
    heldKeys.delete(code);
  };

  const handleBlur = (): void => {
    // Фокус ушёл со страницы — держащиеся клавиши больше не «зажаты»,
    // иначе герой продолжит бежать после Alt+Tab (keyup не долетит).
    heldKeys.clear();
  };

  target.addEventListener('keydown', handleKeyDown);
  target.addEventListener('keyup', handleKeyUp);
  target.addEventListener('mousemove', handleMouseMove);
  target.addEventListener('mousedown', handleMouseDown);
  target.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('blur', handleBlur);

  return {
    source: {
      snapshot(): InputSnapshot {
        let moveX = 0;
        let moveY = 0;
        for (const [code, [dx, dy]] of Object.entries(MOVE_KEYS)) {
          if (!heldKeys.has(code)) continue;
          moveX += dx;
          moveY += dy;
        }
        const len = Math.hypot(moveX, moveY);
        if (len > 1) {
          moveX /= len;
          moveY /= len;
        }

        const held = new Set<Action>();
        for (const [code, action] of Object.entries(ACTION_KEYS)) {
          if (heldKeys.has(code)) held.add(action);
        }

        const pressed = new Set(justPressed);
        justPressed.clear();

        return { moveX, moveY, aimWorld, pressed, held };
      },
    },
    destroy(): void {
      target.removeEventListener('keydown', handleKeyDown);
      target.removeEventListener('keyup', handleKeyUp);
      target.removeEventListener('mousemove', handleMouseMove);
      target.removeEventListener('mousedown', handleMouseDown);
      target.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleBlur);
      heldKeys.clear();
      justPressed.clear();
    },
  };
}

export { EMPTY_INPUT };
export type { Action, InputSnapshot };
