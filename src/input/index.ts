/**
 * Слой `input`: превращает DOM-события в `InputSnapshot` (тип определён в
 * `core/input.ts`, т.к. это данные, которые читает `sim`). Здесь живёт
 * единственная сторона, которая слушает `window`/`document`.
 *
 * Реальная DOM-реализация — `createDomInputSource` (OF-015, `dom-input.ts`).
 */

export type { Action, InputSnapshot } from '../core/input';
export { EMPTY_INPUT } from '../core/input';
export type { InputSource } from '../core/loop';
export { createDomInputSource } from './dom-input';
export type { DomInputHandle } from './dom-input';
