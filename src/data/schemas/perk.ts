/**
 * Схема перков (`perk.*`). Источник: `docs/design/rpg-system.md` §3 —
 * 18 перков, 6 архетипов × 3 тира (уровни доступа 2/6/10). Слот открывается
 * каждые 2 уровня (2,4,6,8,10,12,14); в незакреплённый слот можно взять
 * любой уже доступный перк — это ограничение выбора в UI прокачки
 * (gameplay-programmer, OF-035), а не поле схемы.
 */

import { z } from 'zod';
import { namespacedId } from './common';
import { RequirementSchema } from './rpg';

/** 6 архетипов §3 `rpg-system.md`: Стрелок/Ломовик/Болтун/Подрывник/Лучевик/Вор. */
export const PerkArchetypeSchema = z.enum([
  'strelok',
  'lomovik',
  'boltun',
  'podryvnik',
  'luchevik',
  'vor',
]);
export type PerkArchetype = z.infer<typeof PerkArchetypeSchema>;

/** Минимальный уровень тира архетипа: 2 (тир 1), 6 (тир 2), 10 (тир 3). */
export const PerkTierLevelSchema = z.union([z.literal(2), z.literal(6), z.literal(10)]);

/**
 * Числовой эффект перка — множитель/константа к именованной цели
 * (`reloadTimeMult`, `critDamageMult`, `dashCooldownMs`, …). Единого реестра
 * целей в GDD нет — таблица `rpg-system.md` §3 описывает эффект текстом на
 * перк, поэтому `target` пока свободная строка; сведение к закрытому enum —
 * задача реализации формул перков (OF-035), не схемы контента.
 */
export const PerkModifierSchema = z.object({
  target: z.string().min(1),
  value: z.number(),
});
export type PerkModifier = z.infer<typeof PerkModifierSchema>;

export const PerkSchema = z.object({
  id: namespacedId('perk'),
  nameKey: z.string(),
  descKey: z.string(),
  archetype: PerkArchetypeSchema,
  minLevel: PerkTierLevelSchema,
  /** Все требования должны выполняться одновременно (см. напр. перк «Крепкий хребет» — Каркас ≥ 7 и Твёрдость ≥ 6). */
  requires: z.array(RequirementSchema).min(1),
  modifiers: z.array(PerkModifierSchema).default([]),
});

export type Perk = z.infer<typeof PerkSchema>;
