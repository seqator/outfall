/**
 * Процедурный синтез (OF-026) — чистые функции построения графа Web Audio
 * поверх `AudioContextLike` (`types.ts`). Ни файлов, ни сети: каждый вызов
 * собирает узлы из осцилляторов/шумовых буферов и сразу планирует
 * старт/стоп на `ctx.currentTime`. 30 SFX-срезов аудио-библа (`docs/audio/
 * audio-bible.md` §3) сводятся к 7 параметризуемым генераторам ниже —
 * конкретное событие шины выбирает параметры (частоту/длительность/
 * громкость), не форму графа.
 *
 * Каждый генератор возвращает `SynthVoice`: `stop()` для принудительной
 * остановки (кража голоса в пуле, см. `audio-engine.ts`) и `durationSec`
 * для информации вызывающей стороны. `onEnded` — необязательный колбэк,
 * которым движок убирает голос из активного пула по естественному
 * завершению (без polling в тике рендера).
 */

import type {
  AudioContextLike,
  AudioNodeLike,
  AudioSchedulableNodeLike,
  BiquadFilterNodeLike,
  GainNodeLike,
} from './types';

export interface SynthVoice {
  readonly durationSec: number;
  stop(): void;
}

/** Минимальное неисчезающее значение для `exponentialRampToValueAtTime` — экспоненциальная рампа не может идти в 0 (реальный Web Audio бросает `RangeError`). */
const EXP_FLOOR = 0.0001;

function now(ctx: AudioContextLike): number {
  return ctx.currentTime;
}

function clampPositive(value: number, fallback: number): number {
  return value > 0 ? value : fallback;
}

/** Создаёт шумовой буфер белого шума заданной длительности (моно, под `ctx.sampleRate`) — общий строительный блок для выстрела/попадания/смерти/шага. */
function createNoiseBuffer(ctx: AudioContextLike, durationSec: number): ReturnType<AudioContextLike['createBuffer']> {
  const length = Math.max(1, Math.round(ctx.sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Общая экспоненциально затухающая огибающая громкости — «удар/щелчок», а не плавный пэд. */
function applyDecayEnvelope(gain: GainNodeLike, ctx: AudioContextLike, peak: number, durationSec: number): void {
  const t0 = now(ctx);
  gain.gain.setValueAtTime(Math.max(peak, EXP_FLOOR), t0);
  gain.gain.exponentialRampToValueAtTime(EXP_FLOOR, t0 + durationSec);
}

/**
 * Планирует старт/стоп основного узла голоса и заворачивает его в
 * `SynthVoice`. `extraNodes` — дополнительные осцилляторы/сорсы того же
 * голоса (например, «пинок» отдачи выстрела или шумовой хвост смерти) —
 * они уже сами запланированы вызывающей функцией, но должны оборваться
 * вместе с основным узлом при краже голоса (`stop()` до истечения
 * `durationSec`), иначе звучали бы недослушанным хвостом сами по себе.
 */
function scheduleAndWrap(
  ctx: AudioContextLike,
  source: AudioSchedulableNodeLike,
  durationSec: number,
  onEnded?: () => void,
  extraNodes: readonly AudioSchedulableNodeLike[] = [],
): SynthVoice {
  const t0 = now(ctx);
  let stopped = false;
  source.onended = () => {
    if (onEnded) onEnded();
  };
  source.start(t0);
  source.stop(t0 + durationSec);
  return {
    durationSec,
    stop(): void {
      if (stopped) return;
      stopped = true;
      source.onended = null;
      const stopNode = (node: AudioSchedulableNodeLike): void => {
        try {
          node.stop(now(ctx));
        } catch {
          // Узел уже остановлен/не был запущен — не критично при краже голоса.
        }
        node.disconnect();
      };
      stopNode(source);
      for (const node of extraNodes) stopNode(node);
    },
  };
}

export interface ShotParams {
  readonly durationSec: number;
  readonly volume: number;
  /** Частота среза шума, Гц — выше = звонче/суше (пистолет), ниже = глуше/тяжелее (дробовик). */
  readonly brightness: number;
  /** 0..1 — доля низкочастотного «пинка» отдачи поверх шума. */
  readonly punch: number;
}

/** Выстрел: короткий шумовой хлопок (`sfx.weapon.pistol.fire`/`sfx.weapon.heavy.fire`) + низкочастотный клик отдачи. */
export function synthShot(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  params: ShotParams,
  onEnded?: () => void,
): SynthVoice {
  const durationSec = clampPositive(params.durationSec, 0.2);
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, durationSec);

  const filter: BiquadFilterNodeLike = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.max(params.brightness, 50), now(ctx));
  filter.Q.setValueAtTime(0.7, now(ctx));

  const punchOsc = ctx.createOscillator();
  punchOsc.type = 'sine';
  punchOsc.frequency.setValueAtTime(90, now(ctx));
  const punchGain = ctx.createGain();
  punchGain.gain.setValueAtTime(Math.max(params.punch, EXP_FLOOR) * params.volume, now(ctx));
  punchGain.gain.exponentialRampToValueAtTime(EXP_FLOOR, now(ctx) + durationSec * 0.6);

  const gain = ctx.createGain();
  applyDecayEnvelope(gain, ctx, params.volume, durationSec);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  punchOsc.connect(punchGain);
  punchGain.connect(destination);
  punchOsc.start(now(ctx));
  punchOsc.stop(now(ctx) + durationSec);

  return scheduleAndWrap(ctx, source, durationSec, onEnded, [punchOsc]);
}

export interface ReloadParams {
  readonly durationSec: number;
  readonly volume: number;
  readonly toneHz1: number;
  readonly toneHz2: number;
}

/** Перезарядка: два коротких тона друг за другом — щелчок магазина, лязг затвора (`sfx.weapon.*.reload`). */
export function synthReload(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  params: ReloadParams,
  onEnded?: () => void,
): SynthVoice {
  const durationSec = clampPositive(params.durationSec, 0.9);
  const blipSec = durationSec * 0.35;
  const gapSec = durationSec * 0.3;

  const osc1 = ctx.createOscillator();
  osc1.type = 'square';
  osc1.frequency.setValueAtTime(params.toneHz1, now(ctx));
  const gain1 = ctx.createGain();
  applyDecayEnvelope(gain1, ctx, params.volume, blipSec);
  osc1.connect(gain1);
  gain1.connect(destination);
  osc1.start(now(ctx));
  osc1.stop(now(ctx) + blipSec);

  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.setValueAtTime(params.toneHz2, now(ctx) + blipSec + gapSec);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(EXP_FLOOR, now(ctx));
  gain2.gain.setValueAtTime(Math.max(params.volume, EXP_FLOOR), now(ctx) + blipSec + gapSec);
  gain2.gain.exponentialRampToValueAtTime(EXP_FLOOR, now(ctx) + durationSec);
  osc2.connect(gain2);
  gain2.connect(destination);

  return scheduleAndWrap(ctx, osc2, durationSec, onEnded);
}

export interface HitParams {
  readonly durationSec: number;
  readonly volume: number;
  /** Резонансная частота удара, Гц — глухой стук ниже, звонкий рикошет выше. */
  readonly toneHz: number;
}

/** Попадание: глухой стук — резонансный фильтр по шуму (`combat.hit`, `sfx.hit.*`). */
export function synthHit(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  params: HitParams,
  onEnded?: () => void,
): SynthVoice {
  const durationSec = clampPositive(params.durationSec, 0.18);
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, durationSec);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(Math.max(params.toneHz, 40), now(ctx));
  filter.Q.setValueAtTime(2.2, now(ctx));

  const gain = ctx.createGain();
  applyDecayEnvelope(gain, ctx, params.volume, durationSec);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  return scheduleAndWrap(ctx, source, durationSec, onEnded);
}

export interface DeathParams {
  readonly durationSec: number;
  readonly volume: number;
  readonly startHz: number;
  readonly endHz: number;
}

/** Смерть: нисходящий тон (осциллятор со свипом вниз) + шумовой хвост (`combat.death`, `sfx.*.death`). */
export function synthDeath(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  params: DeathParams,
  onEnded?: () => void,
): SynthVoice {
  const durationSec = clampPositive(params.durationSec, 0.6);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(Math.max(params.startHz, 20), now(ctx));
  osc.frequency.exponentialRampToValueAtTime(Math.max(params.endHz, 20), now(ctx) + durationSec);
  const oscGain = ctx.createGain();
  applyDecayEnvelope(oscGain, ctx, params.volume, durationSec);
  osc.connect(oscGain);
  oscGain.connect(destination);

  const noise = ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(ctx, durationSec);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(800, now(ctx));
  const noiseGain = ctx.createGain();
  applyDecayEnvelope(noiseGain, ctx, params.volume * 0.5, durationSec);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(destination);
  noise.start(now(ctx));
  noise.stop(now(ctx) + durationSec);

  return scheduleAndWrap(ctx, osc, durationSec, onEnded, [noise]);
}

export interface ClickParams {
  readonly durationSec: number;
  readonly volume: number;
  /** Частота полосового фильтра, Гц — материал/тип поверхности шага или сухой щелчок бойка. */
  readonly toneHz: number;
}

/** Короткий приглушённый клик: шаг по поверхности (`sfx.step.*`) или сухой щелчок бойка по пустому магазину (`sfx.weapon.pistol.empty`). */
export function synthClick(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  params: ClickParams,
  onEnded?: () => void,
): SynthVoice {
  const durationSec = clampPositive(params.durationSec, 0.08);
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, durationSec);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(Math.max(params.toneHz, 100), now(ctx));
  filter.Q.setValueAtTime(1.5, now(ctx));

  const gain = ctx.createGain();
  applyDecayEnvelope(gain, ctx, params.volume, durationSec);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  return scheduleAndWrap(ctx, source, durationSec, onEnded);
}

export interface UiParams {
  readonly durationSec: number;
  readonly volume: number;
  readonly toneHz: number;
}

/** Короткий синус — интерфейс «Щитка» (`sfx.ui.*`). */
export function synthUi(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  params: UiParams,
  onEnded?: () => void,
): SynthVoice {
  const durationSec = clampPositive(params.durationSec, 0.08);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(Math.max(params.toneHz, 20), now(ctx));

  const gain = ctx.createGain();
  applyDecayEnvelope(gain, ctx, params.volume, durationSec);

  osc.connect(gain);
  gain.connect(destination);

  return scheduleAndWrap(ctx, osc, durationSec, onEnded);
}

export interface WhooshParams {
  readonly durationSec: number;
  readonly volume: number;
  readonly startHz: number;
  readonly endHz: number;
}

/** Свист движения — полосовой фильтр по шуму со свипом частоты: взмах в ближнем бою (`sfx.weapon.melee.swing`) или рывок героя. */
export function synthWhoosh(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  params: WhooshParams,
  onEnded?: () => void,
): SynthVoice {
  const durationSec = clampPositive(params.durationSec, 0.25);
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, durationSec);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(Math.max(params.startHz, 50), now(ctx));
  filter.frequency.exponentialRampToValueAtTime(Math.max(params.endHz, 50), now(ctx) + durationSec);
  filter.Q.setValueAtTime(1, now(ctx));

  const gain = ctx.createGain();
  applyDecayEnvelope(gain, ctx, params.volume, durationSec);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  return scheduleAndWrap(ctx, source, durationSec, onEnded);
}
