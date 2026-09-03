/**
 * Слой `audio`: чистый WebAudio, без внешних библиотек. Подписывается на
 * события шины (`audio:play`, `audio:music`) — `sim` никогда не вызывает
 * аудио напрямую (§3.9). Реализация — задача OF-026.
 */

export interface AudioEngine {
  play(sfx: string, opts?: { wx?: number; wy?: number; volume?: number }): void;
  playMusic(track: string | null, fadeSec: number): void;
  /** Разблокировка WebAudio по первому пользовательскому жесту (нужна для Safari/iOS). */
  unlock(): Promise<void>;
  destroy(): void;
}
