import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../../src/core/events';

declare module '../../../src/core/events' {
  interface GameEvents {
    'test:a': { value: number };
    'test:b': { value: string };
  }
}

describe('core/events: createEventBus', () => {
  it('emit() не вызывает обработчик синхронно — только после drain()', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('test:a', handler);

    bus.emit('test:a', { value: 1 });
    expect(handler).not.toHaveBeenCalled();

    bus.drain();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 1 });
  });

  it('несколько событий за тик доставляются в порядке emit() при одном drain()', () => {
    const bus = createEventBus();
    const seen: number[] = [];
    bus.on('test:a', (p) => seen.push(p.value));

    bus.emit('test:a', { value: 1 });
    bus.emit('test:a', { value: 2 });
    bus.emit('test:a', { value: 3 });
    bus.drain();

    expect(seen).toEqual([1, 2, 3]);
  });

  it('drain() без накопленных событий не бросает исключение и ничего не вызывает', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('test:a', handler);

    expect(() => bus.drain()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('drain() очищает очередь: повторный drain() без новых emit() ничего не доставляет', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('test:a', handler);

    bus.emit('test:a', { value: 1 });
    bus.drain();
    bus.drain();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('несколько подписчиков одного события получают его все', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('test:a', a);
    bus.on('test:a', b);

    bus.emit('test:a', { value: 1 });
    bus.drain();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('обработчик одного вида события не получает события другого вида', () => {
    const bus = createEventBus();
    const onA = vi.fn();
    const onB = vi.fn();
    bus.on('test:a', onA);
    bus.on('test:b', onB);

    bus.emit('test:b', { value: 'x' });
    bus.drain();

    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it('on() возвращает функцию отписки; после неё обработчик больше не вызывается', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('test:a', handler);

    unsubscribe();
    bus.emit('test:a', { value: 1 });
    bus.drain();

    expect(handler).not.toHaveBeenCalled();
  });

  it('emit() для события без подписчиков не бросает исключение', () => {
    const bus = createEventBus();
    bus.emit('test:a', { value: 1 });
    expect(() => bus.drain()).not.toThrow();
  });

  it('событие, вызванное обработчиком во время drain(), доставляется только на следующем drain()', () => {
    const bus = createEventBus();
    const secondary = vi.fn();
    bus.on('test:b', secondary);
    bus.on('test:a', () => {
      bus.emit('test:b', { value: 'from-a' });
    });

    bus.emit('test:a', { value: 1 });
    bus.drain();
    expect(secondary).not.toHaveBeenCalled();

    bus.drain();
    expect(secondary).toHaveBeenCalledTimes(1);
    expect(secondary).toHaveBeenCalledWith({ value: 'from-a' });
  });
});
