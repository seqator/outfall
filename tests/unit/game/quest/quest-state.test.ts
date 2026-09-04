/**
 * OF-018: минимальное runtime-состояние квестов (`src/game/quest/quest-state.ts`).
 */

import { describe, expect, it } from 'vitest';
import {
  createEmptyQuestsState,
  currentQuestStage,
  hasReachedQuestStage,
  setQuestStage,
  startQuest,
} from '../../../../src/game/quest/quest-state';

describe('quest-state: startQuest', () => {
  it('заводит квест со стадией по умолчанию "start"', () => {
    const state = startQuest(createEmptyQuestsState(), 'quest.svoi_truby');
    expect(state['quest.svoi_truby']).toEqual({ stage: 'start', history: ['start'] });
  });

  it('можно указать другую стартовую стадию явно', () => {
    const state = startQuest(createEmptyQuestsState(), 'quest.klyuch', 'intro');
    expect(state['quest.klyuch']).toEqual({ stage: 'intro', history: ['intro'] });
  });

  it('идемпотентен — повторный вызов не откатывает прогресс', () => {
    const started = startQuest(createEmptyQuestsState(), 'quest.x');
    const advanced = setQuestStage(started, 'quest.x', 'done');
    const again = startQuest(advanced, 'quest.x');
    expect(again).toBe(advanced);
  });
});

describe('quest-state: setQuestStage', () => {
  it('двигает текущую стадию и копит историю', () => {
    let state = startQuest(createEmptyQuestsState(), 'quest.x');
    state = setQuestStage(state, 'quest.x', 'middle');
    state = setQuestStage(state, 'quest.x', 'done');
    expect(currentQuestStage(state, 'quest.x')).toBe('done');
    expect(state['quest.x']?.history).toEqual(['start', 'middle', 'done']);
  });

  it('работает и без предварительного startQuest', () => {
    const state = setQuestStage(createEmptyQuestsState(), 'quest.y', 'stage1');
    expect(state['quest.y']).toEqual({ stage: 'stage1', history: ['stage1'] });
  });

  it('не мутирует исходное состояние', () => {
    const before = startQuest(createEmptyQuestsState(), 'quest.x');
    const after = setQuestStage(before, 'quest.x', 'done');
    expect(before['quest.x']?.stage).toBe('start');
    expect(after).not.toBe(before);
  });
});

describe('quest-state: currentQuestStage / hasReachedQuestStage', () => {
  it('currentQuestStage — undefined для ненайденного квеста', () => {
    expect(currentQuestStage(createEmptyQuestsState(), 'quest.neizvesten')).toBeUndefined();
  });

  it('hasReachedQuestStage — true для любой стадии из истории, включая текущую', () => {
    let state = startQuest(createEmptyQuestsState(), 'quest.x');
    state = setQuestStage(state, 'quest.x', 'middle');
    expect(hasReachedQuestStage(state, 'quest.x', 'start')).toBe(true);
    expect(hasReachedQuestStage(state, 'quest.x', 'middle')).toBe(true);
    expect(hasReachedQuestStage(state, 'quest.x', 'done')).toBe(false);
    expect(hasReachedQuestStage(state, 'quest.neizvesten', 'start')).toBe(false);
  });
});
