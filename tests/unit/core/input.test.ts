import { describe, expect, it } from 'vitest';
import {
  EMPTY_INPUT,
  createInputSnapshot,
  createScriptedInput,
  type Action,
  type InputSnapshot,
} from '../../../src/core/input';

describe('core/input: createInputSnapshot', () => {
  it('без аргументов равносильно EMPTY_INPUT по значению', () => {
    expect(createInputSnapshot()).toEqual(EMPTY_INPUT);
  });

  it('переопределяет только переданные поля, остальное — из EMPTY_INPUT', () => {
    const snapshot = createInputSnapshot({ moveX: 1 });
    expect(snapshot.moveX).toBe(1);
    expect(snapshot.moveY).toBe(EMPTY_INPUT.moveY);
    expect(snapshot.aimWorld).toBe(EMPTY_INPUT.aimWorld);
  });

  it('позволяет задать pressed/held/aimWorld', () => {
    const pressed = new Set<Action>(['dash']);
    const held = new Set<Action>(['attack']);
    const aimWorld = { x: 3, y: 4 };

    const snapshot = createInputSnapshot({ pressed, held, aimWorld });

    expect(snapshot.pressed).toBe(pressed);
    expect(snapshot.held).toBe(held);
    expect(snapshot.aimWorld).toBe(aimWorld);
  });
});

describe('core/input: createScriptedInput', () => {
  it('отдаёт снимки последовательности по порядку', () => {
    const seq: InputSnapshot[] = [
      createInputSnapshot({ moveX: 1 }),
      createInputSnapshot({ moveX: -1 }),
    ];
    const source = createScriptedInput(seq);

    expect(source.snapshot()).toBe(seq[0]);
    expect(source.snapshot()).toBe(seq[1]);
  });

  it('после конца последовательности повторяет последний снимок', () => {
    const seq: InputSnapshot[] = [createInputSnapshot({ moveX: 1 }), createInputSnapshot({ moveY: 1 })];
    const source = createScriptedInput(seq);

    source.snapshot();
    source.snapshot();
    expect(source.snapshot()).toBe(seq[1]);
    expect(source.snapshot()).toBe(seq[1]);
  });

  it('на пустой последовательности всегда отдаёт EMPTY_INPUT', () => {
    const source = createScriptedInput([]);
    expect(source.snapshot()).toBe(EMPTY_INPUT);
    expect(source.snapshot()).toBe(EMPTY_INPUT);
  });

  it('два независимых источника с одной и той же записью не делят курсор', () => {
    const seq: InputSnapshot[] = [createInputSnapshot({ moveX: 1 }), createInputSnapshot({ moveX: 2 })];
    const a = createScriptedInput(seq);
    const b = createScriptedInput(seq);

    a.snapshot();
    a.snapshot();

    expect(b.snapshot()).toBe(seq[0]);
  });
});
