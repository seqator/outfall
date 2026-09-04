import { describe, expect, it } from 'vitest';
import {
  advanceShock,
  applyForcedShockHit,
  applyShockHit,
  isShocked,
  SHOCK_DURATION_MS,
  SHOCK_SPEED_MULTIPLIER,
  shouldTriggerShock,
} from '../../../../src/sim/formulas/shock';

describe('sim/formulas/shock: shouldTriggerShock (§4.6)', () => {
  it('удар = 30% МаксХП активирует шок', () => {
    expect(shouldTriggerShock(30, 100)).toBe(true);
  });

  it('удар = 29% МаксХП не активирует шок', () => {
    expect(shouldTriggerShock(29, 100)).toBe(false);
  });
});

describe('sim/formulas/shock: applyShockHit', () => {
  it('триггерящий удар выставляет полную длительность 4,000 с', () => {
    const state = applyShockHit(undefined, 30, 100);
    expect(state).toEqual({ remainingMs: SHOCK_DURATION_MS });
  });

  it('нетриггерящий удар не создаёт и не меняет состояние', () => {
    expect(applyShockHit(undefined, 10, 100)).toBeUndefined();
    const existing = { remainingMs: 1500 };
    expect(applyShockHit(existing, 10, 100)).toBe(existing);
  });

  it('без стекания: второй триггерящий удар на активном шоке сбрасывает таймер на 4,000 с, не удваивая', () => {
    const first = applyShockHit(undefined, 30, 100);
    const afterHalfDuration = first ? advanceShock(first, 2) : undefined; // 2-я секунда из 4
    expect(afterHalfDuration?.remainingMs).toBe(2000);

    const second = applyShockHit(afterHalfDuration, 35, 100);
    expect(second).toEqual({ remainingMs: SHOCK_DURATION_MS });
  });
});

describe('sim/formulas/shock: advanceShock/isShocked', () => {
  it('длится ровно 4,000 с, затем снимается', () => {
    let state = { remainingMs: SHOCK_DURATION_MS };
    state = advanceShock(state, 3.999);
    expect(isShocked(state)).toBe(true);
    state = advanceShock(state, 0.001);
    expect(state.remainingMs).toBe(0);
    expect(isShocked(state)).toBe(false);
  });

  it('не уходит в отрицательные значения', () => {
    const state = advanceShock({ remainingMs: 100 }, 5);
    expect(state.remainingMs).toBe(0);
  });

  it('isShocked(undefined) === false', () => {
    expect(isShocked(undefined)).toBe(false);
  });

  it('эффект — фиксированные −15% скорости', () => {
    expect(SHOCK_SPEED_MULTIPLIER).toBe(0.85);
  });
});

describe('sim/formulas/shock: OF-035 — перки «Дублёная шкура»/«Хладнокровие» (rpg-system.md §3)', () => {
  it('shouldTriggerShock с порогом 40% («Дублёная шкура»): 39% не триггерит, 40% триггерит', () => {
    expect(shouldTriggerShock(39, 100, 0.4)).toBe(false);
    expect(shouldTriggerShock(40, 100, 0.4)).toBe(true);
  });

  it('applyShockHit с переопределённой длительностью («Хладнокровие»: 2000 мс вместо 4000)', () => {
    const state = applyShockHit(undefined, 30, 100, 0.3, 2000);
    expect(state).toEqual({ remainingMs: 2000 });
  });

  it('applyShockHit без перков — поведение не изменилось (значения по умолчанию)', () => {
    expect(applyShockHit(undefined, 30, 100)).toEqual({ remainingMs: SHOCK_DURATION_MS });
  });

  it('applyForcedShockHit (Энергосбытовец, §2.4) — всегда триггерит независимо от урона', () => {
    expect(applyForcedShockHit()).toEqual({ remainingMs: SHOCK_DURATION_MS });
    expect(applyForcedShockHit(2000)).toEqual({ remainingMs: 2000 });
  });
});
