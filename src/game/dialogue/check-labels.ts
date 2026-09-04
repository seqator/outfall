/**
 * Русские подписи характеристик КОСТЯК и навыков для пометки проверки в
 * диалоге, напр. `[Язык 5]` (`docs/art/ui-shchitok.md` §6). Список названий —
 * те же, что в комментариях `src/data/schemas/rpg.ts` (единственный
 * источник правды для рус. названий до готовности `I18n`, OF-019).
 */

import type { CheckKey } from '../../data/schemas/rpg';

const CHECK_KEY_LABELS: Readonly<Record<CheckKey, string>> = {
  karkas: 'Каркас',
  ostrota: 'Острота',
  smekalka: 'Смекалка',
  tvyordost: 'Твёрдость',
  yazyk: 'Язык',
  kurazh: 'Кураж',
  stvoly: 'Стволы',
  tyazhyoloe: 'Тяжёлое',
  luch: 'Луч',
  kulaki: 'Кулаки',
  nozhi: 'Ножи',
  vzryvchatka: 'Взрывчатка',
  vzlom: 'Взлом',
  remont: 'Ремонт',
  medicina: 'Медицина',
  rech: 'Речь',
};

/** `[Язык 5]` — подпись проверки для варианта ответа (`ui-shchitok.md` §6). */
export function formatCheckLabel(check: { readonly stat: CheckKey; readonly dc: number }): string {
  return `[${CHECK_KEY_LABELS[check.stat]} ${check.dc}]`;
}
