import { describe, expect, it } from 'vitest';
import type { GameMap } from '../../../../src/data/schemas';
import { createGameState } from '../../../../src/game/dialogue/interpreter';
import { createTriggerRunner } from '../../../../src/game/world/triggers';

function buildMap(triggers: GameMap['triggers']): GameMap {
  return {
    id: 'map.test',
    nameKey: 'map.test.name',
    width: 4,
    height: 4,
    tileset: 'dev',
    layers: {
      ground: new Array<number>(16).fill(0),
      walls: new Array<number>(16).fill(0),
      collision: new Array<0 | 1>(16).fill(0),
    },
    npcs: [],
    enemySpawns: [],
    itemPickups: [],
    triggers,
    exits: [],
  };
}

describe('game/world: createTriggerRunner', () => {
  it('вне радиуса — не срабатывает, состояние не меняется', () => {
    const map = buildMap([
      { id: 't1', position: { x: 10, y: 10 }, radius: 2, once: true, effects: [{ op: 'setFlag', key: 'flag.hit', value: true }] },
    ]);
    const runner = createTriggerRunner(map);
    const { state, firedIds } = runner.update(0, 0, createGameState());
    expect(firedIds).toEqual([]);
    expect(state.flags['flag.hit']).toBeUndefined();
  });

  it('в радиусе — срабатывает и применяет эффект', () => {
    const map = buildMap([
      { id: 't1', position: { x: 5, y: 5 }, radius: 3, once: true, effects: [{ op: 'setFlag', key: 'flag.hit', value: true }] },
    ]);
    const runner = createTriggerRunner(map);
    const { state, firedIds } = runner.update(6, 5, createGameState());
    expect(firedIds).toEqual(['t1']);
    expect(state.flags['flag.hit']).toBe(true);
  });

  it('once: true — срабатывает ровно один раз, даже если герой остаётся в радиусе', () => {
    const map = buildMap([
      { id: 't1', position: { x: 0, y: 0 }, radius: 5, once: true, effects: [{ op: 'setFlag', key: 'flag.count', value: 1 }] },
    ]);
    const runner = createTriggerRunner(map);
    const first = runner.update(1, 1, createGameState());
    expect(first.firedIds).toEqual(['t1']);
    const second = runner.update(1, 1, first.state);
    expect(second.firedIds).toEqual([]);
  });

  it('once: false — срабатывает повторно на каждом входе в радиусе', () => {
    const map = buildMap([
      { id: 't1', position: { x: 0, y: 0 }, radius: 5, once: false, effects: [{ op: 'setFlag', key: 'flag.pinged', value: true }] },
    ]);
    const runner = createTriggerRunner(map);
    const first = runner.update(1, 1, createGameState());
    const second = runner.update(1, 1, first.state);
    expect(first.firedIds).toEqual(['t1']);
    expect(second.firedIds).toEqual(['t1']);
  });

  it('condition не выполнено — не срабатывает, даже в радиусе', () => {
    const map = buildMap([
      {
        id: 't1',
        position: { x: 0, y: 0 },
        radius: 5,
        once: true,
        condition: { op: 'flag', key: 'flag.gate', eq: true },
        effects: [{ op: 'setFlag', key: 'flag.hit', value: true }],
      },
    ]);
    const runner = createTriggerRunner(map);
    const { state, firedIds } = runner.update(1, 1, createGameState());
    expect(firedIds).toEqual([]);
    expect(state.flags['flag.hit']).toBeUndefined();
  });

  it('condition выполнено (флаг уже стоит) — срабатывает', () => {
    const map = buildMap([
      {
        id: 't1',
        position: { x: 0, y: 0 },
        radius: 5,
        once: true,
        condition: { op: 'flag', key: 'flag.gate', eq: true },
        effects: [{ op: 'setFlag', key: 'flag.hit', value: true }],
      },
    ]);
    const runner = createTriggerRunner(map);
    const state = createGameState({ flags: { 'flag.gate': true } });
    const result = runner.update(1, 1, state);
    expect(result.firedIds).toEqual(['t1']);
    expect(result.state.flags['flag.hit']).toBe(true);
  });

  it('несколько триггеров в одном вызове срабатывают все подходящие, по порядку в массиве', () => {
    const map = buildMap([
      { id: 'a', position: { x: 0, y: 0 }, radius: 5, once: true, effects: [{ op: 'setFlag', key: 'flag.a', value: true }] },
      { id: 'b', position: { x: 0, y: 0 }, radius: 5, once: true, effects: [{ op: 'setFlag', key: 'flag.b', value: true }] },
    ]);
    const runner = createTriggerRunner(map);
    const { state, firedIds } = runner.update(1, 1, createGameState());
    expect(firedIds).toEqual(['a', 'b']);
    expect(state.flags['flag.a']).toBe(true);
    expect(state.flags['flag.b']).toBe(true);
  });
});
