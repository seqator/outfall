import { describe, expect, it, vi } from 'vitest';
import type { InputSnapshot } from '../../../src/core/input';
import { EMPTY_INPUT } from '../../../src/core/input';
import { MAX_TICKS_PER_FRAME, TICK_DT, createLoop } from '../../../src/core/loop';
import type { InputSource, Simulation } from '../../../src/core/loop';
import { createFakeRaf } from './support/fake-raf';

const TICK_MS = TICK_DT * 1000;

function createSimStub(): { sim: Simulation; step: ReturnType<typeof vi.fn> } {
  const step = vi.fn();
  return { sim: { step }, step };
}

function createInputStub(snapshot: InputSnapshot = EMPTY_INPUT): InputSource {
  return { snapshot: () => snapshot };
}

describe('core/loop: createLoop', () => {
  it('не тикает и не рисует до start()', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    createLoop(sim, createInputStub(), raf);

    expect(raf.requestCount).toBe(0);
    expect(step).not.toHaveBeenCalled();
  });

  it('start() планирует первый кадр через raf.request', () => {
    const { sim } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);

    loop.start();

    expect(raf.requestCount).toBe(1);
    expect(raf.isScheduled).toBe(true);
  });

  it('start() идемпотентен: повторный вызов не планирует второй кадр', () => {
    const { sim } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);

    loop.start();
    loop.start();

    expect(raf.requestCount).toBe(1);
  });

  it('первый кадр не тикает (нет предыдущего времени) и сам планирует следующий', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);

    loop.start();
    raf.fire(0);

    expect(step).not.toHaveBeenCalled();
    expect(raf.requestCount).toBe(2);
  });

  it('ровно один тик на кадр при кадре длиной ровно TICK_DT', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);

    loop.start();
    raf.fire(0);
    raf.fire(TICK_MS);
    expect(step).toHaveBeenCalledTimes(1);
    expect(step).toHaveBeenNthCalledWith(1, TICK_DT, EMPTY_INPUT);

    raf.fire(TICK_MS * 2);
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('передаёт в sim.step снимок текущего InputSource', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    let current: InputSnapshot = EMPTY_INPUT;
    const input: InputSource = { snapshot: () => current };
    const loop = createLoop(sim, input, raf);
    const custom: InputSnapshot = { ...EMPTY_INPUT, moveX: 1 };

    loop.start();
    raf.fire(0);
    current = custom;
    raf.fire(TICK_MS);

    expect(step).toHaveBeenCalledWith(TICK_DT, custom);
  });

  it('копит дробное время между кадрами и не теряет тики', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);

    loop.start();
    raf.fire(0);
    // Два кадра по половине тика в сумме дают ровно один тик.
    raf.fire(TICK_MS * 0.5);
    expect(step).not.toHaveBeenCalled();
    raf.fire(TICK_MS * 1.0);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('один длинный кадр досчитывает несколько тиков подряд', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);

    loop.start();
    raf.fire(0);
    raf.fire(TICK_MS * 3.2);

    expect(step).toHaveBeenCalledTimes(3);
  });

  it('спираль смерти: досчитывает не больше MAX_TICKS_PER_FRAME и сбрасывает остаток долга', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);
    const alphas: number[] = [];
    loop.onFrame((alpha) => alphas.push(alpha));

    loop.start();
    raf.fire(0);
    // Огромный долг: намного больше, чем можно погасить за MAX_TICKS_PER_FRAME тиков.
    raf.fire(TICK_MS * 100);

    expect(step).toHaveBeenCalledTimes(MAX_TICKS_PER_FRAME);
    // Остаток долга сброшен, а не перенесён на следующий кадр — alpha этого кадра ~0.
    expect(alphas.at(-1)).toBeCloseTo(0, 5);

    raf.fire(TICK_MS * 101);
    // Если бы долг не сбросился, следующий кадр досчитал бы ещё пачку тиков.
    expect(step).toHaveBeenCalledTimes(MAX_TICKS_PER_FRAME + 1);
  });

  it('ровно MAX_TICKS_PER_FRAME тиков без лишнего остатка не сбрасывает alpha принудительно', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);
    const alphas: number[] = [];
    loop.onFrame((alpha) => alphas.push(alpha));

    loop.start();
    raf.fire(0);
    // MAX_TICKS_PER_FRAME + половина тика: ровно на границе, остаток < TICK_DT — сбрасывать нечего.
    raf.fire(TICK_MS * (MAX_TICKS_PER_FRAME + 0.5));

    expect(step).toHaveBeenCalledTimes(MAX_TICKS_PER_FRAME);
    expect(alphas.at(-1)).toBeCloseTo(0.5, 5);
  });

  it('onFrame сообщает alpha — долю пройденного тика', () => {
    const { sim } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);
    const alphas: number[] = [];
    loop.onFrame((alpha) => alphas.push(alpha));

    loop.start();
    raf.fire(0);
    raf.fire(TICK_MS * 1.5);

    expect(alphas.at(-1)).toBeCloseTo(0.5, 5);
  });

  it('onFrame передаёт frameDtMs — длительность кадра в мс', () => {
    const { sim } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);
    const dts: number[] = [];
    loop.onFrame((_alpha, frameDtMs) => dts.push(frameDtMs));

    loop.start();
    raf.fire(100);
    raf.fire(150);

    expect(dts).toEqual([0, 50]);
  });

  it('несколько подписчиков onFrame получают один и тот же кадр', () => {
    const { sim } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);
    const a = vi.fn();
    const b = vi.fn();
    loop.onFrame(a);
    loop.onFrame(b);

    loop.start();
    raf.fire(0);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('onFrame() возвращает функцию отписки', () => {
    const { sim } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);
    const cb = vi.fn();
    const unsubscribe = loop.onFrame(cb);

    loop.start();
    raf.fire(0);
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    raf.fire(TICK_MS);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stop() отменяет запланированный кадр и останавливает тики', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);

    loop.start();
    expect(raf.isScheduled).toBe(true);

    loop.stop();
    expect(raf.cancelCount).toBe(1);
    expect(raf.isScheduled).toBe(false);

    // Отменённый кадр не должен ничего тикать, даже если бы «выстрелил».
    raf.fire(TICK_MS);
    expect(step).not.toHaveBeenCalled();
  });

  it('stop() без предшествующего start() не бросает исключение и не отменяет ничего лишнего', () => {
    const { sim } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);

    expect(() => loop.stop()).not.toThrow();
    expect(raf.cancelCount).toBe(0);
  });

  it('после stop() повторный start() планирует кадр заново и сбрасывает накопленное время', () => {
    const { sim, step } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);
    const dts: number[] = [];
    loop.onFrame((_alpha, frameDtMs) => dts.push(frameDtMs));

    loop.start();
    raf.fire(0);
    raf.fire(1000);
    loop.stop();

    loop.start();
    raf.fire(2000); // новое «первое» время после рестарта — не должно посчитаться гигантским кадром

    expect(dts.at(-1)).toBe(0);
    expect(step).toHaveBeenCalledTimes(MAX_TICKS_PER_FRAME); // из кадра в 1000мс до stop()
  });

  it('игнорирует кадр, который всё же выстрелил после stop() (защита от ненадёжного raf.cancel)', () => {
    // Реальный `cancelAnimationFrame` надёжен, но контракт `RafLike` этого не
    // гарантирует — `frame()` обязан сам проверять `running`, а не полагаться
    // только на `raf.cancel()`.
    const { sim, step } = createSimStub();
    const raf = createFakeRaf({ unreliableCancel: true });
    const loop = createLoop(sim, createInputStub(), raf);

    loop.start();
    raf.fire(0);
    loop.stop();
    raf.fire(TICK_MS); // «утёкший» кадр после stop()

    expect(step).not.toHaveBeenCalled();
  });

  it('остановка изнутри onFrame-подписчика не планирует следующий кадр', () => {
    const { sim } = createSimStub();
    const raf = createFakeRaf();
    const loop = createLoop(sim, createInputStub(), raf);
    loop.onFrame(() => loop.stop());

    loop.start();
    raf.fire(0);

    expect(raf.isScheduled).toBe(false);
  });
});
