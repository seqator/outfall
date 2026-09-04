/**
 * OF-018: интерпретатор мини-языка условий/эффектов (`src/game/dialogue/interpreter.ts`).
 * Каждый тип условия/эффекта покрыт отдельно, чистые функции — без моков.
 */

import { describe, expect, it } from 'vitest';
import {
  applyEffect,
  applyEffects,
  createGameState,
  createInMemoryInventoryPort,
  evaluateCondition,
  passesCheck,
} from '../../../../src/game/dialogue/interpreter';

describe('interpreter: evaluateCondition — листья', () => {
  it('hasItem — true/false в зависимости от инвентаря', () => {
    const state = createGameState({ inventory: createInMemoryInventoryPort({ 'item.klyuch': 1 }) });
    expect(evaluateCondition({ op: 'hasItem', item: 'item.klyuch', count: 1 }, state)).toBe(true);
    expect(evaluateCondition({ op: 'hasItem', item: 'item.klyuch', count: 2 }, state)).toBe(false);
    expect(evaluateCondition({ op: 'hasItem', item: 'item.otsutstvuet', count: 1 }, state)).toBe(false);
  });

  it('flag — точное совпадение значения (bool/number/string)', () => {
    const state = createGameState({ flags: { 'flag.a': true, 'flag.b': 'spas', 'flag.c': 5 } });
    expect(evaluateCondition({ op: 'flag', key: 'flag.a', eq: true }, state)).toBe(true);
    expect(evaluateCondition({ op: 'flag', key: 'flag.b', eq: 'spas' }, state)).toBe(true);
    expect(evaluateCondition({ op: 'flag', key: 'flag.b', eq: 'klyuch' }, state)).toBe(false);
    expect(evaluateCondition({ op: 'flag', key: 'flag.c', eq: 5 }, state)).toBe(true);
    expect(evaluateCondition({ op: 'flag', key: 'flag.neizvesten', eq: true }, state)).toBe(false);
  });

  it('stat — Характеристика ≥ порога', () => {
    const state = createGameState({ stats: { karkas: 5, ostrota: 5, smekalka: 3, tvyordost: 5, yazyk: 6, kurazh: 5 } });
    expect(evaluateCondition({ op: 'stat', stat: 'yazyk', gte: 5 }, state)).toBe(true);
    expect(evaluateCondition({ op: 'stat', stat: 'yazyk', gte: 7 }, state)).toBe(false);
    expect(evaluateCondition({ op: 'stat', stat: 'smekalka', gte: 4 }, state)).toBe(false);
  });

  it('skill — Навык ≥ порога', () => {
    const state = createGameState({
      skills: { stvoly: 0, tyazhyoloe: 0, luch: 0, kulaki: 0, nozhi: 0, vzryvchatka: 0, vzlom: 0, remont: 6, medicina: 0, rech: 0 },
    });
    expect(evaluateCondition({ op: 'skill', skill: 'remont', gte: 6 }, state)).toBe(true);
    expect(evaluateCondition({ op: 'skill', skill: 'remont', gte: 7 }, state)).toBe(false);
  });

  it('questStage — cmp "eq" сравнивает текущую стадию, "atLeast" — историю', () => {
    const state = applyEffect(createGameState(), { op: 'startQuest', quest: 'quest.svoi_truby' });
    expect(evaluateCondition({ op: 'questStage', quest: 'quest.svoi_truby', stage: 'start', cmp: 'eq' }, state)).toBe(
      true,
    );
    expect(
      evaluateCondition({ op: 'questStage', quest: 'quest.svoi_truby', stage: 'done', cmp: 'eq' }, state),
    ).toBe(false);
    expect(
      evaluateCondition({ op: 'questStage', quest: 'quest.svoi_truby', stage: 'start', cmp: 'atLeast' }, state),
    ).toBe(true);
    expect(
      evaluateCondition({ op: 'questStage', quest: 'quest.neizvesten', stage: 'start', cmp: 'atLeast' }, state),
    ).toBe(false);
  });
});

describe('interpreter: evaluateCondition — all/any/not', () => {
  const state = createGameState({ stats: { karkas: 5, ostrota: 5, smekalka: 3, tvyordost: 5, yazyk: 6, kurazh: 5 } });

  it('all — все условия должны быть true', () => {
    expect(
      evaluateCondition(
        { op: 'all', conditions: [{ op: 'stat', stat: 'yazyk', gte: 5 }, { op: 'stat', stat: 'smekalka', gte: 3 }] },
        state,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { op: 'all', conditions: [{ op: 'stat', stat: 'yazyk', gte: 5 }, { op: 'stat', stat: 'smekalka', gte: 4 }] },
        state,
      ),
    ).toBe(false);
  });

  it('any — хотя бы одно условие true', () => {
    expect(
      evaluateCondition(
        { op: 'any', conditions: [{ op: 'stat', stat: 'smekalka', gte: 9 }, { op: 'stat', stat: 'yazyk', gte: 5 }] },
        state,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { op: 'any', conditions: [{ op: 'stat', stat: 'smekalka', gte: 9 }, { op: 'stat', stat: 'yazyk', gte: 9 }] },
        state,
      ),
    ).toBe(false);
  });

  it('not — инвертирует вложенное условие (пример из prolog-smotritel: «Смекалка ≤ 3»)', () => {
    const tupoyDostupen = { op: 'not' as const, condition: { op: 'stat' as const, stat: 'smekalka' as const, gte: 4 } };
    expect(evaluateCondition(tupoyDostupen, state)).toBe(true); // smekalka=3 < 4
    const umnyy = createGameState({ stats: { ...state.stats, smekalka: 6 } });
    expect(evaluateCondition(tupoyDostupen, umnyy)).toBe(false);
  });
});

describe('interpreter: passesCheck', () => {
  it('характеристика: Язык ≥ dc', () => {
    const proshёl = createGameState({ stats: { karkas: 5, ostrota: 5, smekalka: 5, tvyordost: 5, yazyk: 5, kurazh: 5 } });
    const provalil = createGameState({ stats: { ...proshёl.stats, yazyk: 4 } });
    expect(passesCheck({ stat: 'yazyk', dc: 5 }, proshёl)).toBe(true);
    expect(passesCheck({ stat: 'yazyk', dc: 5 }, provalil)).toBe(false);
  });

  it('навык: Речь ≥ dc', () => {
    const state = createGameState({
      skills: { stvoly: 0, tyazhyoloe: 0, luch: 0, kulaki: 0, nozhi: 0, vzryvchatka: 0, vzlom: 0, remont: 0, medicina: 0, rech: 6 },
    });
    expect(passesCheck({ stat: 'rech', dc: 5 }, state)).toBe(true);
    expect(passesCheck({ stat: 'rech', dc: 7 }, state)).toBe(false);
  });
});

describe('interpreter: applyEffect — по одному на каждый тип', () => {
  it('setFlag — записывает значение флага', () => {
    const state = applyEffect(createGameState(), { op: 'setFlag', key: 'flag.prolog_vybor', value: 'spas' });
    expect(state.flags['flag.prolog_vybor']).toBe('spas');
  });

  it('incrementFlag — прибавляет к текущему числовому флагу, а не перезаписывает', () => {
    const started = applyEffect(createGameState(), { op: 'incrementFlag', key: 'rep.progress2', amount: 15 });
    expect(started.flags['rep.progress2']).toBe(15);
    const again = applyEffect(started, { op: 'incrementFlag', key: 'rep.progress2', amount: -10 });
    expect(again.flags['rep.progress2']).toBe(5);
  });

  it('incrementFlag — амаунт может быть отрицательным, флаг без предыдущего значения стартует с 0', () => {
    const state = applyEffect(createGameState(), { op: 'incrementFlag', key: 'rep.chistye', amount: -10 });
    expect(state.flags['rep.chistye']).toBe(-10);
  });

  it('giveItem — кладёт предмет в инвентарь через InventoryPort', () => {
    const state = applyEffect(createGameState(), { op: 'giveItem', item: 'item.klyuch', count: 1 });
    expect(state.inventory.hasItem('item.klyuch', 1)).toBe(true);
    expect(state.inventory.hasItem('item.klyuch', 2)).toBe(false);
  });

  it('startQuest — заводит квест со стадией по умолчанию "start"', () => {
    const state = applyEffect(createGameState(), { op: 'startQuest', quest: 'quest.klyuch_tarifnitsy' });
    expect(state.quests['quest.klyuch_tarifnitsy']).toEqual({ stage: 'start', history: ['start'] });
  });

  it('startQuest — идемпотентен, повторный вызов не сбрасывает прогресс', () => {
    const started = applyEffect(createGameState(), { op: 'startQuest', quest: 'quest.x' });
    const advanced = { ...started, quests: { 'quest.x': { stage: 'done', history: ['start', 'done'] } } };
    const again = applyEffect(advanced, { op: 'startQuest', quest: 'quest.x' });
    expect(again.quests['quest.x']).toEqual({ stage: 'done', history: ['start', 'done'] });
  });

  it('damage — уменьшает hp, не уходит ниже нуля', () => {
    const state = applyEffect(createGameState({ hp: 10 }), { op: 'damage', amount: 25 });
    expect(state.hp).toBe(0);
    const partial = applyEffect(createGameState({ hp: 100 }), { op: 'damage', amount: 30 });
    expect(partial.hp).toBe(70);
  });

  it('xp — прибавляет опыт', () => {
    const state = applyEffect(createGameState({ xp: 5 }), { op: 'xp', amount: 15 });
    expect(state.xp).toBe(20);
  });

  it('applyEffects — применяет список по порядку', () => {
    const state = applyEffects(createGameState(), [
      { op: 'setFlag', key: 'flag.a', value: true },
      { op: 'xp', amount: 10 },
      { op: 'giveItem', item: 'item.bolt', count: 3 },
    ]);
    expect(state.flags['flag.a']).toBe(true);
    expect(state.xp).toBe(10);
    expect(state.inventory.hasItem('item.bolt', 3)).toBe(true);
  });

  it('эффекты не мутируют исходное состояние (чистая функция)', () => {
    const original = createGameState();
    const changed = applyEffect(original, { op: 'setFlag', key: 'flag.a', value: true });
    expect(original.flags['flag.a']).toBeUndefined();
    expect(changed).not.toBe(original);
  });
});
