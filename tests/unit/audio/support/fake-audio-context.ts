/**
 * Тестовый двойник `AudioContextLike` (`src/audio/types.ts`): не издаёт ни
 * одного реального звука (в Node и не может — `AudioContext` в этой среде
 * не существует рантаймово, только типы `lib.dom`), только записывает граф
 * узлов/вызовы, чтобы тесты могли проверить форму синтеза и поведение пула
 * голосов без настоящего Web Audio API. Тот же приём, что `FakeRaf`
 * (`tests/unit/core/support/fake-raf.ts`) — движок получает управляемое
 * «окружение» вместо реального браузерного API.
 */

import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioContextStateLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from '../../../../src/audio/types';

function createFakeParam(initial: number): AudioParamLike {
  const param: AudioParamLike = {
    value: initial,
    setValueAtTime(value: number): AudioParamLike {
      param.value = value;
      return param;
    },
    linearRampToValueAtTime(value: number): AudioParamLike {
      param.value = value;
      return param;
    },
    exponentialRampToValueAtTime(value: number): AudioParamLike {
      if (value <= 0) throw new RangeError('exponentialRampToValueAtTime: value must be > 0');
      param.value = value;
      return param;
    },
  };
  return param;
}

class FakeAudioNode implements AudioNodeLike {
  readonly connectedTo: AudioNodeLike[] = [];
  disconnected = false;

  connect(destination: AudioNodeLike): AudioNodeLike {
    this.connectedTo.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGainNode extends FakeAudioNode implements GainNodeLike {
  readonly gain = createFakeParam(1);
}

class FakeBiquadFilterNode extends FakeAudioNode implements BiquadFilterNodeLike {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = createFakeParam(350);
  readonly Q = createFakeParam(1);
}

abstract class FakeScheduledNode extends FakeAudioNode {
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  startedAtSec: number | null = null;
  stoppedAtSec: number | null = null;

  start(when = 0): void {
    if (this.started) throw new DOMException('start() called twice', 'InvalidStateError');
    this.started = true;
    this.startedAtSec = when;
  }

  stop(when = 0): void {
    if (!this.started) throw new DOMException('stop() called before start()', 'InvalidStateError');
    this.stopped = true;
    this.stoppedAtSec = when;
  }

  /** Тест вручную «доигрывает» узел до конца — вызывает `onended`, как это делает реальный Web Audio по завершении воспроизведения. */
  fireEnded(): void {
    this.onended?.();
  }
}

class FakeOscillatorNode extends FakeScheduledNode implements OscillatorNodeLike {
  type: OscillatorType = 'sine';
  readonly frequency = createFakeParam(440);
}

class FakeAudioBufferSourceNode extends FakeScheduledNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
}

class FakeAudioBuffer implements AudioBufferLike {
  private readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new RangeError(`channel ${channel} out of range`);
    return data;
  }
}

export interface FakeAudioContext extends AudioContextLike {
  currentTime: number;
  state: AudioContextStateLike;
  resumeCallCount: number;
  closeCallCount: number;
  readonly destination: FakeAudioNode;
  readonly createdBufferSources: FakeAudioBufferSourceNode[];
  readonly createdOscillators: FakeOscillatorNode[];
  readonly createdGains: FakeGainNode[];
  readonly createdFilters: FakeBiquadFilterNode[];
}

export function createFakeAudioContext(
  options: { sampleRate?: number; initialState?: AudioContextStateLike } = {},
): FakeAudioContext {
  const createdBufferSources: FakeAudioBufferSourceNode[] = [];
  const createdOscillators: FakeOscillatorNode[] = [];
  const createdGains: FakeGainNode[] = [];
  const createdFilters: FakeBiquadFilterNode[] = [];

  const ctx: FakeAudioContext = {
    currentTime: 0,
    sampleRate: options.sampleRate ?? 44100,
    state: options.initialState ?? 'suspended',
    resumeCallCount: 0,
    closeCallCount: 0,
    destination: new FakeAudioNode(),
    createdBufferSources,
    createdOscillators,
    createdGains,
    createdFilters,
    createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike {
      return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
    },
    createBufferSource(): AudioBufferSourceNodeLike {
      const node = new FakeAudioBufferSourceNode();
      createdBufferSources.push(node);
      return node;
    },
    createOscillator(): OscillatorNodeLike {
      const node = new FakeOscillatorNode();
      createdOscillators.push(node);
      return node;
    },
    createGain(): GainNodeLike {
      const node = new FakeGainNode();
      createdGains.push(node);
      return node;
    },
    createBiquadFilter(): BiquadFilterNodeLike {
      const node = new FakeBiquadFilterNode();
      createdFilters.push(node);
      return node;
    },
    resume(): Promise<void> {
      ctx.resumeCallCount += 1;
      ctx.state = 'running';
      return Promise.resolve();
    },
    close(): Promise<void> {
      ctx.closeCallCount += 1;
      ctx.state = 'closed';
      return Promise.resolve();
    },
  };

  return ctx;
}
