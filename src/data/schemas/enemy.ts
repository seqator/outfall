/**
 * Схема врагов (`enemy.*`). Источник: `docs/design/combat.md` §2 — 8 типов
 * врагов, у каждого одна атака (телеграф 300–500 мс) и одна слабость
 * (числовой множитель, опционально игнорирующий броню).
 */

import { z } from 'zod';
import { namespacedId } from './common';

/** Роль врага — §2 `combat.md` (заголовки таблицы «Роль»). */
export const EnemyRoleSchema = z.enum([
  'rusher', // рашер ближнего боя (Раки, Крыса-«пластиковая»)
  'controller', // контролёр (Подлинейный)
  'shooter', // стрелок (Охрана «Прогресс-2»)
  'elite', // элита (Энергосбытовец)
  'thrower', // метатель (Чистый)
  'turret', // турель (Автомат НИИ)
  'boss', // босс (Босс-задвижка)
]);
export type EnemyRole = z.infer<typeof EnemyRoleSchema>;

export const EnemyAttackSchema = z.object({
  nameKey: z.string(),
  /** Мс от начала телеграфа до применения урона — 300–500 мс по принципу §1 `combat.md`. */
  telegraphMs: z.number().int().min(300).max(500),
  damage: z.number().nonnegative(),
  cooldownMs: z.number().nonnegative(),
});
export type EnemyAttack = z.infer<typeof EnemyAttackSchema>;

export const EnemyWeaknessSchema = z.object({
  nameKey: z.string(),
  /** Множитель к формуле §4.1 `combat.md`; >1, т.к. это гарантированный бонус, не штраф. */
  multiplier: z.number().gt(1),
  /** Если true — член `−Броня` не применяется (напр. радиатор Автомата НИИ, шток Босса-задвижки). */
  ignoresArmor: z.boolean().default(false),
});
export type EnemyWeakness = z.infer<typeof EnemyWeaknessSchema>;

export const EnemySchema = z.object({
  id: namespacedId('enemy'),
  nameKey: z.string(),
  role: EnemyRoleSchema,
  hp: z.number().int().positive(),
  armor: z.number().int().nonnegative(),
  attack: EnemyAttackSchema,
  weakness: EnemyWeaknessSchema,
  /** Помечен ли враг «для среза» в `combat.md` §2 (раки/подлинейный/охрана — да, остальные пять — позже). */
  sliceReady: z.boolean().default(false),
});

export type Enemy = z.infer<typeof EnemySchema>;
