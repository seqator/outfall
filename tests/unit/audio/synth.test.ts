import { describe, expect, it } from 'vitest';
import {
  synthClick,
  synthDeath,
  synthHit,
  synthReload,
  synthShot,
  synthUi,
  synthWhoosh,
} from '../../../src/audio/synth';
import { createFakeAudioContext } from './support/fake-audio-context';

describe('audio/synth: генераторы возвращают разумную длительность и не бросают исключений', () => {
  it('synthShot — короткий шумовой хлопок с длительностью из параметров', () => {
    const ctx = createFakeAudioContext();
    const destination = ctx.createGain();

    const voice = synthShot(ctx, destination, {
      durationSec: 0.2,
      volume: 0.5,
      brightness: 3000,
      punch: 0.4,
    });

    expect(voice.durationSec).toBe(0.2);
    expect(ctx.createdBufferSources).toHaveLength(1);
    expect(ctx.createdBufferSources[0]?.buffer?.length).toBe(Math.round(ctx.sampleRate * 0.2));
    expect(() => voice.stop()).not.toThrow();
  });

  it('synthShot — при некорректной (<=0) длительности подставляет разумный дефолт', () => {
    const ctx = createFakeAudioContext();
    const voice = synthShot(ctx, ctx.destination, {
      durationSec: 0,
      volume: 0.5,
      brightness: 1000,
      punch: 0.5,
    });

    expect(voice.durationSec).toBeGreaterThan(0);
  });

  it('synthReload — два тона, суммарная длительность равна параметру', () => {
    const ctx = createFakeAudioContext();

    const voice = synthReload(ctx, ctx.destination, {
      durationSec: 1.0,
      volume: 0.4,
      toneHz1: 500,
      toneHz2: 300,
    });

    expect(voice.durationSec).toBe(1.0);
    expect(ctx.createdOscillators).toHaveLength(2);
    expect(ctx.createdOscillators[0]?.frequency.value).toBe(500);
    expect(ctx.createdOscillators[1]?.frequency.value).toBe(300);
  });

  it('synthHit — глухой стук через полосовой фильтр', () => {
    const ctx = createFakeAudioContext();

    const voice = synthHit(ctx, ctx.destination, { durationSec: 0.16, volume: 0.5, toneHz: 220 });

    expect(voice.durationSec).toBe(0.16);
    expect(ctx.createdFilters).toHaveLength(1);
    expect(ctx.createdFilters[0]?.type).toBe('bandpass');
  });

  it('synthDeath — нисходящий тон плюс шумовой хвост, оба узла запущены', () => {
    const ctx = createFakeAudioContext();

    const voice = synthDeath(ctx, ctx.destination, {
      durationSec: 0.6,
      volume: 0.5,
      startHz: 400,
      endHz: 60,
    });

    expect(voice.durationSec).toBe(0.6);
    expect(ctx.createdOscillators).toHaveLength(1);
    expect(ctx.createdOscillators[0]?.started).toBe(true);
    expect(ctx.createdBufferSources).toHaveLength(1);
    expect(ctx.createdBufferSources[0]?.started).toBe(true);
  });

  it('synthClick — короткий приглушённый клик (шаг/сухой боёк)', () => {
    const ctx = createFakeAudioContext();

    const voice = synthClick(ctx, ctx.destination, { durationSec: 0.1, volume: 0.3, toneHz: 600 });

    expect(voice.durationSec).toBe(0.1);
    expect(ctx.createdBufferSources).toHaveLength(1);
  });

  it('synthUi — короткий синус', () => {
    const ctx = createFakeAudioContext();

    const voice = synthUi(ctx, ctx.destination, { durationSec: 0.08, volume: 0.3, toneHz: 880 });

    expect(voice.durationSec).toBe(0.08);
    expect(ctx.createdOscillators).toHaveLength(1);
    expect(ctx.createdOscillators[0]?.type).toBe('sine');
  });

  it('synthWhoosh — свип частоты по шуму (взмах/рывок)', () => {
    const ctx = createFakeAudioContext();

    const voice = synthWhoosh(ctx, ctx.destination, {
      durationSec: 0.22,
      volume: 0.35,
      startHz: 1200,
      endHz: 400,
    });

    expect(voice.durationSec).toBe(0.22);
    expect(ctx.createdFilters).toHaveLength(1);
    expect(ctx.createdFilters[0]?.frequency.value).toBe(400); // свип уже применён (последнее значение параметра)
  });
});

describe('audio/synth: SynthVoice.stop() — принудительная остановка (кража голоса)', () => {
  it('stop() до onended не бросает исключений и отсоединяет узел', () => {
    const ctx = createFakeAudioContext();

    const voice = synthHit(ctx, ctx.destination, { durationSec: 0.5, volume: 0.5, toneHz: 200 });
    expect(() => voice.stop()).not.toThrow();
    expect(ctx.createdBufferSources[0]?.disconnected).toBe(true);
  });

  it('повторный stop() — идемпотентен, не трогает уже отсоединённый узел дважды', () => {
    const ctx = createFakeAudioContext();

    const voice = synthUi(ctx, ctx.destination, { durationSec: 0.1, volume: 0.3, toneHz: 440 });
    voice.stop();
    expect(() => voice.stop()).not.toThrow();
  });

  it('onEnded вызывается по естественному завершению узла (fireEnded), не при stop()', () => {
    const ctx = createFakeAudioContext();
    let ended = false;

    const voice = synthClick(
      ctx,
      ctx.destination,
      { durationSec: 0.1, volume: 0.3, toneHz: 500 },
      () => {
        ended = true;
      },
    );

    expect(ended).toBe(false);
    ctx.createdBufferSources[0]?.fireEnded();
    expect(ended).toBe(true);
    void voice;
  });

  it('synthShot: кража голоса (stop()) также обрывает дополнительный осциллятор «пинка» отдачи', () => {
    const ctx = createFakeAudioContext();

    const voice = synthShot(ctx, ctx.destination, {
      durationSec: 0.3,
      volume: 0.6,
      brightness: 1500,
      punch: 0.7,
    });
    voice.stop();

    expect(ctx.createdOscillators[0]?.disconnected).toBe(true);
  });

  it('synthDeath: stop() также обрывает шумовой хвост', () => {
    const ctx = createFakeAudioContext();

    const voice = synthDeath(ctx, ctx.destination, {
      durationSec: 0.6,
      volume: 0.5,
      startHz: 400,
      endHz: 60,
    });
    voice.stop();

    expect(ctx.createdBufferSources[0]?.disconnected).toBe(true);
  });
});
