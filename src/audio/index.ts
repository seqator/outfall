/**
 * Публичный вход слоя `audio`: чистый WebAudio (процедурный синтез,
 * `synth.ts`), без файлов и без внешних библиотек. `createAudioEngine`
 * (`audio-engine.ts`, OF-026) подписывается на боевые события шины —
 * `sim`/`game` никогда не вызывают `AudioContext` напрямую (§3.9,
 * `docs/tech/architecture.md` §1).
 */

export { createAudioEngine, DEFAULT_MAX_VOICES, type AudioEngine, type CreateAudioEngineOptions } from './audio-engine';
export * from './synth';
export * from './types';
