import { describe, expect, it } from 'vitest';
import { createAudioEngine, DEFAULT_MAX_VOICES } from '../../../src/audio/audio-engine';
import { createEventBus } from '../../../src/core/events';
import { createFakeAudioContext } from './support/fake-audio-context';

describe('audio/audio-engine: подписка на боевые события шины', () => {
  it('combat.hit проигрывает синтезированный удар (обычный/крит — разные параметры)', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    events.emit('combat.hit', { targetId: 1, wx: 0, wy: 0, damage: 5, crit: false });
    events.drain();
    expect(ctx.createdBufferSources).toHaveLength(1);

    events.emit('combat.hit', { targetId: 1, wx: 0, wy: 0, damage: 20, crit: true });
    events.drain();
    expect(ctx.createdBufferSources).toHaveLength(2);
    // Крит — более громкий/низкий тон (см. HIT_CRIT в audio-engine.ts), другая частота фильтра.
    expect(ctx.createdFilters[0]?.frequency.value).not.toBe(ctx.createdFilters[1]?.frequency.value);

    engine.destroy();
  });

  it('combat.death различает isEnemy (враг/герой) — разные параметры смерти', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    events.emit('combat.death', { entityId: 1, wx: 0, wy: 0, isEnemy: true });
    events.drain();
    events.emit('combat.death', { entityId: 2, wx: 0, wy: 0, isEnemy: false });
    events.drain();

    expect(ctx.createdOscillators).toHaveLength(2);
    expect(ctx.createdOscillators[0]?.frequency.value).not.toBe(ctx.createdOscillators[1]?.frequency.value);

    engine.destroy();
  });

  it('combat.weapon-fired: guns/heavy — шумовой хлопок, fists — свист взмаха', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    events.emit('combat.weapon-fired', {
      ownerId: 1,
      weaponId: 'item.pistol_ogryzok',
      branch: 'guns',
      wx: 0,
      wy: 0,
    });
    events.drain();
    expect(ctx.createdBufferSources).toHaveLength(1); // выстрел = шумовой буфер

    events.emit('combat.weapon-fired', {
      ownerId: 1,
      weaponId: 'item.wrench_kran',
      branch: 'fists',
      wx: 0,
      wy: 0,
    });
    events.drain();
    expect(ctx.createdBufferSources).toHaveLength(2); // взмах (whoosh) тоже на шумовом буфере
    expect(ctx.createdFilters).toHaveLength(2); // выстрел: lowpass; взмах: bandpass — оба через фильтр

    engine.destroy();
  });

  it('combat.reload-start: пистолет и дробовик — разные тона/длительность', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    events.emit('combat.reload-start', { ownerId: 1, weaponId: 'item.pistol_ogryzok' });
    events.drain();
    events.emit('combat.reload-start', { ownerId: 1, weaponId: 'item.shotgun_duplo' });
    events.drain();

    expect(ctx.createdOscillators).toHaveLength(4); // reload = 2 осциллятора на вызов
    expect(ctx.createdOscillators[0]?.frequency.value).not.toBe(ctx.createdOscillators[2]?.frequency.value);

    engine.destroy();
  });

  it('combat.fire-empty проигрывает сухой щелчок (тот же генератор, что и шаги)', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    events.emit('combat.fire-empty', { ownerId: 1, weaponId: 'item.pistol_ogryzok' });
    events.drain();

    expect(ctx.createdBufferSources).toHaveLength(1);
    engine.destroy();
  });

  it('combat.dash-start проигрывает свист рывка', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    events.emit('combat.dash-start', { ownerId: 1, wx: 3, wy: 4 });
    events.drain();

    expect(ctx.createdBufferSources).toHaveLength(1);
    expect(ctx.createdFilters[0]?.type).toBe('bandpass');
    engine.destroy();
  });
});

describe('audio/audio-engine: лимит одновременных голосов', () => {
  it(`не больше ${DEFAULT_MAX_VOICES} голосов одновременно — превышение обрывает самый старый`, () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    // Ни один голос не «доигрывает» естественно (fireEnded не вызывается) —
    // весь пул заполняется исключительно новыми `combat.hit`.
    for (let i = 0; i < DEFAULT_MAX_VOICES; i++) {
      events.emit('combat.hit', { targetId: i, wx: 0, wy: 0, damage: 1, crit: false });
    }
    events.drain();

    expect(ctx.createdBufferSources).toHaveLength(DEFAULT_MAX_VOICES);
    expect(ctx.createdBufferSources[0]?.disconnected).toBe(false); // ещё в пуле, ничего не украдено

    // Голос №DEFAULT_MAX_VOICES + 1 — пул полон, крадёт голос у самого старого (индекс 0).
    events.emit('combat.hit', { targetId: 999, wx: 0, wy: 0, damage: 1, crit: false });
    events.drain();

    expect(ctx.createdBufferSources).toHaveLength(DEFAULT_MAX_VOICES + 1);
    expect(ctx.createdBufferSources[0]?.disconnected).toBe(true); // самый старый — украден
    expect(ctx.createdBufferSources[0]?.stopped).toBe(true);
    for (let i = 1; i < DEFAULT_MAX_VOICES; i++) {
      expect(ctx.createdBufferSources[i]?.disconnected).toBe(false); // остальные не тронуты
    }

    engine.destroy();
  });

  it('голос, доигравший естественно (fireEnded), сам покидает пул — не крадётся принудительно следующим', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, {
      context: ctx,
      unlockTarget: new EventTarget(),
      maxVoices: 2,
    });

    events.emit('combat.hit', { targetId: 1, wx: 0, wy: 0, damage: 1, crit: false });
    events.drain();
    ctx.createdBufferSources[0]?.fireEnded(); // первый голос закончился сам — сейчас пул пуст

    events.emit('combat.hit', { targetId: 2, wx: 0, wy: 0, damage: 1, crit: false });
    events.emit('combat.hit', { targetId: 3, wx: 0, wy: 0, damage: 1, crit: false });
    events.drain();

    // Пул maxVoices=2 вмещает оба новых голоса без кражи — освобождённое
    // место первого уже учтено.
    expect(ctx.createdBufferSources[1]?.disconnected).toBe(false);
    expect(ctx.createdBufferSources[2]?.disconnected).toBe(false);

    engine.destroy();
  });
});

describe('audio/audio-engine: подписка/отписка от EventBus', () => {
  it('destroy() отписывается от шины — новые события больше не проигрываются', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    events.emit('combat.hit', { targetId: 1, wx: 0, wy: 0, damage: 1, crit: false });
    events.drain();
    expect(ctx.createdBufferSources).toHaveLength(1);

    engine.destroy();

    events.emit('combat.hit', { targetId: 1, wx: 0, wy: 0, damage: 1, crit: false });
    events.drain();
    expect(ctx.createdBufferSources).toHaveLength(1); // новых узлов не появилось
  });

  it('destroy() останавливает все ещё активные голоса и закрывает AudioContext', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    events.emit('combat.hit', { targetId: 1, wx: 0, wy: 0, damage: 1, crit: false });
    events.drain();
    expect(ctx.createdBufferSources[0]?.disconnected).toBe(false);

    engine.destroy();

    expect(ctx.createdBufferSources[0]?.disconnected).toBe(true);
    expect(ctx.closeCallCount).toBe(1);
  });
});

describe('audio/audio-engine: разблокировка AudioContext по первому жесту', () => {
  it('click на unlockTarget вызывает resume() один раз, дальнейшие клики его не повторяют', () => {
    const ctx = createFakeAudioContext({ initialState: 'suspended' });
    const events = createEventBus();
    const target = new EventTarget();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: target });

    expect(ctx.resumeCallCount).toBe(0);
    target.dispatchEvent(new Event('click'));

    expect(ctx.resumeCallCount).toBe(1);
    expect(ctx.state).toBe('running');

    target.dispatchEvent(new Event('click'));
    expect(ctx.resumeCallCount).toBe(1); // слушатель снят после первого жеста

    engine.destroy();
  });

  it('keydown тоже разблокирует контекст', () => {
    const ctx = createFakeAudioContext({ initialState: 'suspended' });
    const events = createEventBus();
    const target = new EventTarget();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: target });

    target.dispatchEvent(new Event('keydown'));

    expect(ctx.resumeCallCount).toBe(1);
    engine.destroy();
  });

  it('явный вызов unlock() тоже резюмирует контекст и идемпотентен, если уже running', async () => {
    const ctx = createFakeAudioContext({ initialState: 'suspended' });
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    await engine.unlock();
    expect(ctx.resumeCallCount).toBe(1);

    await engine.unlock();
    expect(ctx.resumeCallCount).toBe(1); // уже running — повторный resume() не вызывается

    engine.destroy();
  });
});

describe('audio/audio-engine: ручной play()/playMusic()', () => {
  it('play() с известным sfx-id из аудио-библа проигрывает звук', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    engine.play('sfx.ui.click');

    expect(ctx.createdOscillators).toHaveLength(1);
    engine.destroy();
  });

  it('play() с неизвестным id тихо игнорируется, не бросает исключений', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    expect(() => engine.play('sfx.does.not.exist')).not.toThrow();
    expect(ctx.createdOscillators).toHaveLength(0);
    expect(ctx.createdBufferSources).toHaveLength(0);

    engine.destroy();
  });

  it('playMusic() — no-op в этой волне (нет файлов музыки), не бросает исключений', () => {
    const ctx = createFakeAudioContext();
    const events = createEventBus();
    const engine = createAudioEngine(events, { context: ctx, unlockTarget: new EventTarget() });

    expect(() => engine.playMusic('truba-theme', 0.5)).not.toThrow();
    expect(() => engine.playMusic(null, 0.5)).not.toThrow();

    engine.destroy();
  });
});
