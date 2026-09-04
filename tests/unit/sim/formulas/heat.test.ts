import { describe, expect, it } from 'vitest';
import { advanceHeat, canFireHeat, HEAT_BLOCK_MS, HEAT_MAX, INITIAL_HEAT_STATE } from '../../../../src/sim/formulas/heat';

describe('sim/formulas/heat: advanceHeat (§4.5)', () => {
  it('2 с непрерывной стрельбы «Дугой» → жар 100, блокируется на 2,000 с', () => {
    let state = INITIAL_HEAT_STATE;
    // 2 с одним шагом — правило непрерывно по скорости (+50/с), не зависит от дискретизации тика.
    state = advanceHeat(state, true, 2);

    expect(state.heat).toBe(0); // сброшен в момент срабатывания блока
    expect(state.blockRemainingMs).toBe(HEAT_BLOCK_MS);
    expect(canFireHeat(state)).toBe(false);
  });

  it('накопление жара по тикам 10/с (+5 за тик) — тот же итог 100 за 2 с', () => {
    let state = INITIAL_HEAT_STATE;
    for (let i = 0; i < 20; i += 1) {
      state = advanceHeat(state, true, 0.1);
    }
    expect(state.heat).toBe(0);
    expect(state.blockRemainingMs).toBe(HEAT_BLOCK_MS);
  });

  it('остывание: не стрелять 1 с при жаре 80 → жар 60', () => {
    const state = advanceHeat({ heat: 80, blockRemainingMs: 0 }, false, 1);
    expect(state.heat).toBeCloseTo(60, 6);
  });

  it('остывание не уходит ниже 0', () => {
    const state = advanceHeat({ heat: 5, blockRemainingMs: 0 }, false, 1);
    expect(state.heat).toBe(0);
  });

  it('блок отсчитывается независимо от стрельбы — держит жар на 0 до истечения блока', () => {
    let state: ReturnType<typeof advanceHeat> = { heat: 0, blockRemainingMs: HEAT_BLOCK_MS };
    state = advanceHeat(state, true, 1);
    expect(state.heat).toBe(0);
    expect(state.blockRemainingMs).toBe(HEAT_BLOCK_MS - 1000);
    expect(canFireHeat(state)).toBe(false);
  });

  it('после истечения блока стрельба снова доступна с жаром 0', () => {
    let state = { heat: 0, blockRemainingMs: 500 };
    state = advanceHeat(state, false, 0.5);
    expect(state.blockRemainingMs).toBe(0);
    expect(canFireHeat(state)).toBe(true);

    state = advanceHeat(state, true, 0.1);
    expect(state.heat).toBeCloseTo(5, 6);
  });

  it('жар не превышает HEAT_MAX до срабатывания блока (проверка константы)', () => {
    expect(HEAT_MAX).toBe(100);
  });
});

describe('sim/formulas/heat: OF-035 — перки Лучевика (rpg-system.md §3)', () => {
  it('«Холодный ствол» (heatGainMult 0,8) — за 1 с стрельбы жар 40 вместо 50', () => {
    const state = advanceHeat(INITIAL_HEAT_STATE, true, 1, { gainMult: 0.8 });
    expect(state.heat).toBeCloseTo(40, 6);
  });

  it('«Быстрый сброс» (heatCoolMult 1,5) — за 1 с простоя при жаре 60 остывание на 30 вместо 20', () => {
    const state = advanceHeat({ heat: 60, blockRemainingMs: 0 }, false, 1, { coolMult: 1.5 });
    expect(state.heat).toBeCloseTo(30, 6);
  });

  it('«Перегрузка» (overheatBlockMsOverride 3000) — блок при переполнении длится 3000 мс вместо HEAT_BLOCK_MS', () => {
    const state = advanceHeat(INITIAL_HEAT_STATE, true, 2, { blockMsOverride: 3000 });
    expect(state.heat).toBe(0);
    expect(state.blockRemainingMs).toBe(3000);
  });

  it('без перков (perks не передан) — поведение идентично базовому', () => {
    const withDefaults = advanceHeat(INITIAL_HEAT_STATE, true, 1, {});
    const withoutArg = advanceHeat(INITIAL_HEAT_STATE, true, 1);
    expect(withDefaults).toEqual(withoutArg);
  });
});
