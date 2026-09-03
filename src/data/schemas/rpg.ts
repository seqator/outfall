/**
 * Общий словарь ролевой системы (`docs/design/rpg-system.md`, OF-002):
 * шесть характеристик КОСТЯК и десять навыков. Переиспользуется схемой
 * перков (`perk.ts`) и проверками в диалогах/квестах (`dialog.ts`,
 * `quest.ts` через `rules.ts`), чтобы не размножать перечни строк по файлам.
 *
 * Идентификаторы латиницей — транслитерация имён из GDD, порядок
 * соответствует таблицам §1 и §2 `rpg-system.md`.
 */

import { z } from 'zod';

/** Шесть характеристик КОСТЯК, диапазон значений 1–10 (`rpg-system.md` §1). */
export const StatKeySchema = z.enum([
  'karkas', // Каркас — тело и вес
  'ostrota', // Острота — реакция
  'smekalka', // Смекалка — ум
  'tvyordost', // Твёрдость — выносливость и нервы
  'yazyk', // Язык — переговоры
  'kurazh', // Кураж — азарт
]);
export type StatKey = z.infer<typeof StatKeySchema>;

/** Десять боевых/прикладных навыков, диапазон значений 0–100 (`rpg-system.md` §2). */
export const SkillKeySchema = z.enum([
  'stvoly', // Стволы
  'tyazhyoloe', // Тяжёлое
  'luch', // Луч
  'kulaki', // Кулаки
  'nozhi', // Ножи
  'vzryvchatka', // Взрывчатка
  'vzlom', // Взлом
  'remont', // Ремонт
  'medicina', // Медицина
  'rech', // Речь
]);
export type SkillKey = z.infer<typeof SkillKeySchema>;

/** Всё, на что можно навесить пороговую проверку — характеристика или навык. */
export const CheckKeySchema = z.union([StatKeySchema, SkillKeySchema]);
export type CheckKey = z.infer<typeof CheckKeySchema>;

/**
 * Требование доступа (к перку, к ветке диалога и т. п.) — прямое сравнение
 * `Характеристика/Навык ≥ Порог`, без бросков (принцип `rpg-system.md` §0).
 */
export const RequirementSchema = z.union([
  z.object({ type: z.literal('stat'), stat: StatKeySchema, gte: z.number().min(1).max(10) }),
  z.object({ type: z.literal('skill'), skill: SkillKeySchema, gte: z.number().min(0).max(100) }),
]);
export type Requirement = z.infer<typeof RequirementSchema>;
