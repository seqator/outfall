/**
 * Чисто презентационное форматирование (OF-017) — не бизнес-логика: не
 * читает `InventoryState`, не знает про `ItemRegistry`, только форматирует
 * уже готовые числа для DOM. Курс `1 Талон = 100 Гаек` (`items-economy.md`
 * §2.1) сознательно продублирован здесь как форматирование вывода, а не
 * вынесен в `game/inventory` — там курс никому не нужен: слой `game` уже
 * отдаёт сюда сырые Гайки, счёт «в Талонах при сумме ≥ 100» — исключительно
 * вопрос того, как подписать число на экране.
 */

const GAIKI_PER_TALON = 100;

export function formatWeight(currentKg: number, limitKg: number): string {
  return `ВЕС: ${currentKg.toFixed(1)} / ${limitKg.toFixed(1)} КГ`;
}

/** `items-economy.md` §2.1: «UI показывает Талоны при сумме ≥ 100». */
export function formatWallet(gaiki: number): string {
  if (gaiki < GAIKI_PER_TALON) return `${gaiki} ГАЕК`;
  const talony = Math.floor(gaiki / GAIKI_PER_TALON);
  const rest = gaiki % GAIKI_PER_TALON;
  return rest === 0 ? `${talony} ТАЛ.` : `${talony} ТАЛ. ${rest} ГАЕК`;
}

/** `items-economy.md` §3: обратный отсчёт `мм:сс` герметичной находки. */
export function formatDecay(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}
