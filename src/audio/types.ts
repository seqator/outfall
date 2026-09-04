/**
 * Собственный узкий срез Web Audio API (не переиспользует `lib.dom`
 * `AudioContext`/`AudioNode` типы напрямую) — специально, чтобы юнит-тесты
 * могли подставить лёгкий мок без наследования от полноценных DOM-классов
 * (в Node их и не существует, `AudioContext` тут — только типы `lib.dom`,
 * без рантайм-реализации). Настоящий браузерный `AudioContext`/
 * `OfflineAudioContext` структурно satisfы этому интерфейсу «as is» —
 * приведение типа нужно только один раз, на границе `createAudioEngine`
 * (см. `audio-engine.ts`).
 *
 * Синтез (`synth.ts`) и движок (`audio-engine.ts`) работают только через эти
 * `*Like`-интерфейсы — ни один файл `src/audio/**` не пишет `new
 * AudioContext()` напрямую, кроме точки создания реального контекста в
 * `audio-engine.ts`.
 */

export type AudioContextStateLike = 'suspended' | 'running' | 'closed';

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): AudioParamLike;
  linearRampToValueAtTime(value: number, endTime: number): AudioParamLike;
  exponentialRampToValueAtTime(value: number, endTime: number): AudioParamLike;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

export interface AudioBufferLike {
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioSchedulableNodeLike extends AudioNodeLike {
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface OscillatorNodeLike extends AudioSchedulableNodeLike {
  type: OscillatorType;
  readonly frequency: AudioParamLike;
}

export interface AudioBufferSourceNodeLike extends AudioSchedulableNodeLike {
  buffer: AudioBufferLike | null;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: AudioContextStateLike;
  readonly destination: AudioNodeLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}
