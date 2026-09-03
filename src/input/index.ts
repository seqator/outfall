/**
 * Слой `input`: превращает DOM-события в `InputSnapshot` (тип определён в
 * `core/input.ts`, т.к. это данные, которые читает `sim`). Здесь живёт
 * единственная сторона, которая слушает `window`/`document`.
 *
 * Реальная DOM-реализация (`DomInputSource`) — задача OF-010/015. Каркас
 * содержит только контракт источника ввода.
 */

export type { Action, InputSnapshot } from '../core/input';
export { EMPTY_INPUT } from '../core/input';
export type { InputSource } from '../core/loop';
