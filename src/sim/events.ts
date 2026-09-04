/**
 * Боевые события шины (`core/events.ts`), доставляются после тика
 * (ADR-002 §5) — `game` подписывается на них, чтобы дёрнуть VFX/аудио
 * (`renderer.emitParticles`), не заглядывая внутрь `sim`/ECS напрямую.
 * Расширяет `GameEvents` тем же приёмом declaration merging, что и
 * `Components` в `sim/components/index.ts`.
 */

import type { EntityId } from '../core/world';
import type { WeaponBranch, WeaponId } from './formulas/weapons';

export interface CombatHitEvent {
  readonly targetId: EntityId;
  readonly wx: number;
  readonly wy: number;
  readonly damage: number;
  readonly crit: boolean;
}

export interface CombatDeathEvent {
  readonly entityId: EntityId;
  readonly wx: number;
  readonly wy: number;
  readonly isEnemy: boolean;
}

/**
 * Выстрел/удар героя состоялся (снаряд создан либо ближний удар нанесён —
 * не путать с `combat.hit`, который эмитит *попадание*, а не сам факт
 * атаки). Единственный потребитель на сегодня — аудио-слой (OF-026):
 * подбирает `sfx.weapon.<branch>.fire`/`sfx.weapon.melee.swing` по `branch`.
 */
export interface CombatWeaponFiredEvent {
  readonly ownerId: EntityId;
  readonly weaponId: WeaponId;
  readonly branch: WeaponBranch;
  readonly wx: number;
  readonly wy: number;
}

/** Перезарядка запущена (не завершена — заполнение магазина не эмитит отдельное событие для аудио, слушатель звука ждёт `def.reloadMs` сам; завершение перезарядки — отдельное `combat.reload-finish` ниже, нужное игровому слою для списания патронов из инвентаря). */
export interface CombatReloadStartEvent {
  readonly ownerId: EntityId;
  readonly weaponId: WeaponId;
}

/** Попытка выстрела с пустым магазином — GDD не штрафует за это игрока (§1 combat.md), но звук бойка по пустому месту всё равно нужен (`sfx.weapon.pistol.empty`). */
export interface CombatFireEmptyEvent {
  readonly ownerId: EntityId;
  readonly weaponId: WeaponId;
}

/**
 * OF-057: попытка перезарядки при `WeaponRuntimeState.reserveAmmo <= 0` —
 * симметрично `combat.fire-empty` (тот же «сухой щелчок», §1 combat.md: GDD
 * не штрафует игрока, только звуковая обратная связь), но для `R`, а не для
 * выстрела. Перезарядка в этом случае не запускается вовсе (`reloadRemainingMs`
 * не выставляется).
 */
export interface CombatReloadEmptyEvent {
  readonly ownerId: EntityId;
  readonly weaponId: WeaponId;
}

/**
 * OF-057: перезарядка реально завершилась — магазин пополнен на `ammoLoaded`
 * патронов (может быть меньше, чем не хватало до полного магазина, если
 * `reserveAmmo` не покрывал всю разницу — частичная перезарядка). Единственный
 * потребитель — `demo-scene.ts`: реально списывает `ammoLoaded` патронов из
 * `InventoryState` (`removeItemQuantity`, `game/inventory/inventory.ts`) —
 * `sim` сам не трогает инвентарь, только сообщает случившийся факт.
 */
export interface CombatReloadFinishEvent {
  readonly ownerId: EntityId;
  readonly weaponId: WeaponId;
  readonly ammoLoaded: number;
}

/** Рывок фактически запущен (i-frames выставлены) — не каждое нажатие `dash` (на откате событие не эмитится). */
export interface CombatDashStartEvent {
  readonly ownerId: EntityId;
  readonly wx: number;
  readonly wy: number;
}

declare module '../core/events' {
  interface GameEvents {
    'combat.hit': CombatHitEvent;
    'combat.death': CombatDeathEvent;
    'combat.weapon-fired': CombatWeaponFiredEvent;
    'combat.reload-start': CombatReloadStartEvent;
    'combat.fire-empty': CombatFireEmptyEvent;
    'combat.reload-empty': CombatReloadEmptyEvent;
    'combat.reload-finish': CombatReloadFinishEvent;
    'combat.dash-start': CombatDashStartEvent;
  }
}
