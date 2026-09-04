/**
 * `createAudioEngine` (OF-026) — единственная точка `src/audio/**`, которая
 * подписывается на боевые события шины ядра (`combat.hit`/`combat.death` из
 * `sim/events.ts`, плюс `combat.weapon-fired`/`combat.reload-start`/
 * `combat.fire-empty`/`combat.dash-start`, добавленные этой же задачей в
 * `sim/systems/combat.ts`, и `combat.reload-empty` из OF-057 — «нечем
 * перезаряжаться», тот же звук, что и «сухой щелчок» пустого магазина) и на
 * каждое из них проигрывает подходящий
 * процедурный звук из `synth.ts` — `sim` при этом ничего не знает про
 * `AudioContext` (граница слоёв, `docs/tech/architecture.md` §1).
 *
 * Пул голосов: не больше `maxVoices` (по умолчанию 8, см. допущение ниже)
 * одновременно активных `SynthVoice` — при превышении самый старый обрывается
 * (`stop()`) и голос отдаётся новому звуку; голос также сам покидает пул по
 * естественному завершению через `onEnded`, без опроса на каждый кадр.
 *
 * Разблокировка `AudioContext` (создаётся в `suspended` — иначе браузеры
 * блокируют автовоспроизведение до первого жеста пользователя): движок сам
 * вешает одноразовые `click`/`keydown` на `unlockTarget` (по умолчанию
 * `window`) и снимает их после первого срабатывания; `unlock()` в публичном
 * API — тот же путь, доступный для явного вызова (например, из экрана
 * загрузки/меню).
 *
 * Допущение (расхождение в тексте задачи): аудио-библ (`docs/audio/
 * audio-bible.md` §5) фиксирует лимит одновременных голосов среза как 24 —
 * задача OF-026 явно требует «не более 8» для этого движка. Реализовано по
 * тексту задачи (8, `DEFAULT_MAX_VOICES`) как более специфичному и позднему
 * решению; 24 из аудио-библа — микс-бюджет полного среза (с музыкой и
 * диалоговыми бипами), а не голосовой пул одного `createAudioEngine`.
 */

import type { EventBus } from '../core/events';
import {
  synthClick,
  synthDeath,
  synthHit,
  synthReload,
  synthShot,
  synthUi,
  synthWhoosh,
  type ClickParams,
  type DeathParams,
  type HitParams,
  type ReloadParams,
  type ShotParams,
  type SynthVoice,
  type UiParams,
  type WhooshParams,
} from './synth';
import type { AudioContextLike } from './types';

export interface AudioEngine {
  play(sfx: string, opts?: { wx?: number; wy?: number; volume?: number }): void;
  playMusic(track: string | null, fadeSec: number): void;
  /** Разблокировка WebAudio по первому пользовательскому жесту (нужна для Safari/iOS) — можно вызвать вручную, если жест уже произошёл вне `unlockTarget`. */
  unlock(): Promise<void>;
  destroy(): void;
}

export interface CreateAudioEngineOptions {
  /** Готовый `AudioContext`-совместимый объект (реальный браузерный или мок теста) — по умолчанию создаётся настоящий `AudioContext` в `suspended`. */
  readonly context?: AudioContextLike;
  /** Куда вешать одноразовые `click`/`keydown` для разблокировки — по умолчанию `window`. */
  readonly unlockTarget?: EventTarget;
  readonly maxVoices?: number;
  readonly masterVolume?: number;
  readonly sfxVolume?: number;
}

/** См. допущение в шапке файла — задача OF-026 фиксирует 8, а не 24 из аудио-библа. */
export const DEFAULT_MAX_VOICES = 8;

const PISTOL_SHOT: ShotParams = { durationSec: 0.18, volume: 0.5, brightness: 3200, punch: 0.35 };
const HEAVY_SHOT: ShotParams = { durationSec: 0.32, volume: 0.75, brightness: 900, punch: 0.85 };

const PISTOL_RELOAD: ReloadParams = { durationSec: 1.0, volume: 0.4, toneHz1: 520, toneHz2: 340 };
const HEAVY_RELOAD: ReloadParams = { durationSec: 1.4, volume: 0.45, toneHz1: 300, toneHz2: 180 };

const HIT_NORMAL: HitParams = { durationSec: 0.16, volume: 0.4, toneHz: 260 };
const HIT_CRIT: HitParams = { durationSec: 0.2, volume: 0.6, toneHz: 180 };

const DEATH_ENEMY: DeathParams = { durationSec: 0.6, volume: 0.5, startHz: 400, endHz: 60 };
const DEATH_PLAYER: DeathParams = { durationSec: 0.9, volume: 0.6, startHz: 300, endHz: 40 };

const EMPTY_CLICK: ClickParams = { durationSec: 0.08, volume: 0.3, toneHz: 1800 };
const STEP_CONCRETE: ClickParams = { durationSec: 0.1, volume: 0.25, toneHz: 600 };

const MELEE_SWING: WhooshParams = { durationSec: 0.22, volume: 0.35, startHz: 1200, endHz: 400 };
const DASH_WHOOSH: WhooshParams = { durationSec: 0.2, volume: 0.3, startHz: 900, endHz: 300 };

const UI_CLICK: UiParams = { durationSec: 0.08, volume: 0.3, toneHz: 880 };
const UI_CONFIRM: UiParams = { durationSec: 0.2, volume: 0.35, toneHz: 1200 };
const UI_ERROR: UiParams = { durationSec: 0.25, volume: 0.35, toneHz: 160 };

/** Создаёт настоящий браузерный `AudioContext` в `suspended` (спецификация Web Audio — так всегда, до первого resume). Единственное место в `src/audio/**`, которое трогает глобальный `AudioContext`. */
function createRealAudioContext(): AudioContextLike {
  // Реальный `AudioContext` структурно шире `AudioContextLike` (см. `types.ts`)
  // — приведение типа безопасно на этой единственной границе; весь
  // остальной код `src/audio/**` работает только через `*Like`-интерфейсы и
  // тестируется моками без настоящего Web Audio.
  return new AudioContext() as unknown as AudioContextLike;
}

export function createAudioEngine(
  events: EventBus,
  options: CreateAudioEngineOptions = {},
): AudioEngine {
  const context = options.context ?? createRealAudioContext();
  const maxVoices = options.maxVoices ?? DEFAULT_MAX_VOICES;
  const unlockTarget = options.unlockTarget ?? window;

  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(options.masterVolume ?? 1, context.currentTime);
  masterGain.connect(context.destination);

  const sfxGain = context.createGain();
  sfxGain.gain.setValueAtTime(options.sfxVolume ?? 1, context.currentTime);
  sfxGain.connect(masterGain);

  // Музыки в этой волне нет (продюсер снял OF-023 в этом цикле) — узел уже
  // подключён к мастер-шине на будущее (OF-041), см. `playMusic` ниже.
  const musicGain = context.createGain();
  musicGain.gain.setValueAtTime(1, context.currentTime);
  musicGain.connect(masterGain);

  const activeVoices: SynthVoice[] = [];

  function removeVoice(voice: SynthVoice): void {
    const index = activeVoices.indexOf(voice);
    if (index !== -1) activeVoices.splice(index, 1);
  }

  function registerVoice(voice: SynthVoice): void {
    if (activeVoices.length >= maxVoices) {
      const oldest = activeVoices.shift();
      oldest?.stop();
    }
    activeVoices.push(voice);
  }

  /** Создаёт голос через `factory` (один из `synth*`), сразу регистрирует его в пуле и снимает по естественному завершению — общая точка входа для всех обработчиков ниже и для `play()`. */
  function spawnVoice(factory: (onEnded: () => void) => SynthVoice): SynthVoice {
    const box: { voice?: SynthVoice } = {};
    const voice = factory(() => {
      if (box.voice) removeVoice(box.voice);
    });
    box.voice = voice;
    registerVoice(voice);
    return voice;
  }

  const unsubscribers: Array<() => void> = [
    events.on('combat.hit', (payload) => {
      spawnVoice((onEnded) => synthHit(context, sfxGain, payload.crit ? HIT_CRIT : HIT_NORMAL, onEnded));
    }),
    events.on('combat.death', (payload) => {
      spawnVoice((onEnded) =>
        synthDeath(context, sfxGain, payload.isEnemy ? DEATH_ENEMY : DEATH_PLAYER, onEnded),
      );
    }),
    events.on('combat.weapon-fired', (payload) => {
      spawnVoice((onEnded) => {
        if (payload.branch === 'fists') return synthWhoosh(context, sfxGain, MELEE_SWING, onEnded);
        if (payload.branch === 'heavy') return synthShot(context, sfxGain, HEAVY_SHOT, onEnded);
        return synthShot(context, sfxGain, PISTOL_SHOT, onEnded);
      });
    }),
    events.on('combat.reload-start', (payload) => {
      const params = payload.weaponId === 'item.shotgun_duplo' ? HEAVY_RELOAD : PISTOL_RELOAD;
      spawnVoice((onEnded) => synthReload(context, sfxGain, params, onEnded));
    }),
    events.on('combat.fire-empty', () => {
      spawnVoice((onEnded) => synthClick(context, sfxGain, EMPTY_CLICK, onEnded));
    }),
    // OF-057: «нечем перезаряжаться» (`R` при пустом резерве патронов) —
    // тот же сухой щелчок, что и попытка выстрела с пустым магазином, оба
    // сообщают одно и то же ощущение «патронов нет физически».
    events.on('combat.reload-empty', () => {
      spawnVoice((onEnded) => synthClick(context, sfxGain, EMPTY_CLICK, onEnded));
    }),
    events.on('combat.dash-start', () => {
      spawnVoice((onEnded) => synthWhoosh(context, sfxGain, DASH_WHOOSH, onEnded));
    }),
  ];

  /** Известный на сегодня подмножество `sfx.*` id аудио-библа (`docs/audio/audio-bible.md` §3) — для ручного `play()` вне боевых событий (UI/шаги). Полный манифест на все 30 срезов — зона OF-023/041 (реальных вариаций/файлов не будет, но таблица id → генератор расширяется по мере появления событий шины UI/движения). */
  const SFX_REGISTRY: Readonly<Record<string, (onEnded?: () => void) => SynthVoice>> = {
    'sfx.weapon.pistol.fire': (onEnded) => synthShot(context, sfxGain, PISTOL_SHOT, onEnded),
    'sfx.weapon.heavy.fire': (onEnded) => synthShot(context, sfxGain, HEAVY_SHOT, onEnded),
    'sfx.weapon.pistol.reload': (onEnded) => synthReload(context, sfxGain, PISTOL_RELOAD, onEnded),
    'sfx.weapon.heavy.reload': (onEnded) => synthReload(context, sfxGain, HEAVY_RELOAD, onEnded),
    'sfx.weapon.pistol.empty': (onEnded) => synthClick(context, sfxGain, EMPTY_CLICK, onEnded),
    'sfx.weapon.melee.swing': (onEnded) => synthWhoosh(context, sfxGain, MELEE_SWING, onEnded),
    'sfx.hit.flesh': (onEnded) => synthHit(context, sfxGain, HIT_NORMAL, onEnded),
    'sfx.hit.metal': (onEnded) => synthHit(context, sfxGain, HIT_NORMAL, onEnded),
    'sfx.hit.concrete': (onEnded) => synthHit(context, sfxGain, HIT_NORMAL, onEnded),
    'sfx.step.concrete': (onEnded) => synthClick(context, sfxGain, STEP_CONCRETE, onEnded),
    'sfx.ui.click': (onEnded) => synthUi(context, sfxGain, UI_CLICK, onEnded),
    'sfx.ui.confirm': (onEnded) => synthUi(context, sfxGain, UI_CONFIRM, onEnded),
    'sfx.ui.error': (onEnded) => synthUi(context, sfxGain, UI_ERROR, onEnded),
  };

  let gestureListenersAttached = true;
  const handleGesture = (): void => {
    unlockTarget.removeEventListener('click', handleGesture);
    unlockTarget.removeEventListener('keydown', handleGesture);
    gestureListenersAttached = false;
    void unlock();
  };
  unlockTarget.addEventListener('click', handleGesture);
  unlockTarget.addEventListener('keydown', handleGesture);

  async function unlock(): Promise<void> {
    if (context.state !== 'suspended') return;
    await context.resume();
  }

  return {
    play(sfx: string, _opts?: { wx?: number; wy?: number; volume?: number }): void {
      const factory = SFX_REGISTRY[sfx];
      if (!factory) return; // неизвестный/ещё не покрытый id — тихо игнорируем, не бросаем
      spawnVoice((onEnded) => factory(onEnded));
    },

    playMusic(_track: string | null, _fadeSec: number): void {
      // Музыки в этой волне нет (см. шапку файла) — `musicGain` уже готов
      // принять реальный трек в OF-041 без изменений публичного контракта.
    },

    unlock,

    destroy(): void {
      for (const unsubscribe of unsubscribers) unsubscribe();
      unsubscribers.length = 0;
      for (const voice of activeVoices) voice.stop();
      activeVoices.length = 0;
      if (gestureListenersAttached) {
        unlockTarget.removeEventListener('click', handleGesture);
        unlockTarget.removeEventListener('keydown', handleGesture);
      }
      void context.close().catch(() => {
        // Контекст уже закрыт/не поддерживает close() в тестовом моке — не критично.
      });
    },
  };
}
