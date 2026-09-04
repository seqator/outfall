/**
 * Восемнадцать перков (`docs/design/rpg-system.md` §3, OF-035): данные —
 * прямое отражение таблицы §3 (архетип/уровень/требование), плюс числовой
 * эффект каждого перка как поле `PerkEffect`. Требования переиспользуют
 * `Requirement`/`StatKey`/`SkillKey` из `src/data/schemas/rpg.ts` (`sim`
 * разрешено читать типы контента, `docs/tech/architecture.md` §1) — не
 * дублируют те же union'ы второй раз.
 *
 * КАКИЕ ПЕРКИ РЕАЛЬНО ВЛИЯЮТ НА ГЕЙМПЛЕЙ СЕЙЧАС (см. докстринг `PerkEffect`
 * по каждому полю): часть эффектов читается существующими системами
 * (`sim/systems/combat.ts`, `ai.ts`, `boss-ai.ts`, `player-damage.ts`) через
 * `aggregatePerkEffects` — reload/разброс на бегу/урон в рукопашной/шок/
 * «последний патрон»/жар «Дуги». Часть эффектов (экономика, взлом, мины,
 * лут, сдача в плен) не имеет в этом кодовом срезе своей подсистемы вообще
 * (нет магазина/торговли, мин, минигры взлома, таблиц дропа — все эти
 * системы вне скоупа OF-035, часть из них — `items-economy.md`/OF-007,
 * часть — будущие задачи Арены/квестов): для них здесь есть формула и тест
 * на число из таблицы §3, но нет вызова из рантайма — тот же принцип, что
 * уже применяет `formulas/heat.ts` к «Дуге», которой тоже нет в срезе.
 */

import type { PerkArchetype, Requirement, SkillKey, StatKey } from '../../data/schemas';

export type PerkId =
  | 'perk.bystrye_ruki'
  | 'perk.tvyordaya_ruka'
  | 'perk.posledniy_patron'
  | 'perk.dublyonaya_shkura'
  | 'perk.krepkiy_khrebet'
  | 'perk.oba_kulaka'
  | 'perk.yazykastyy'
  | 'perk.svoy_v_doske'
  | 'perk.zagovorit_zuby'
  | 'perk.khladnokroviye'
  | 'perk.saper'
  | 'perk.tsepnaya_reaktsiya'
  | 'perk.kholodnyy_stvol'
  | 'perk.bystryy_sbros'
  | 'perk.peregruzka'
  | 'perk.marodyor'
  | 'perk.tikhiye_paltsy'
  | 'perk.karmannik';

/** Уровень, с которого доступен минимальный тир перка — только 2/6/10 (`rpg-system.md` §3). */
export type PerkTierLevel = 2 | 6 | 10;

/**
 * Числовой эффект перка — плоский именованный набор (не generic
 * `target/value`, как в `data/schemas/perk.ts`, у которого нет закрытого
 * реестра целей): каждое поле соответствует ровно одной строке таблицы §3.
 * Поля, оставленные `undefined` — перк их не трогает; `aggregatePerkEffects`
 * сшивает эффекты всех разблокированных перков воедино.
 */
export interface PerkEffect {
  /** «Быстрые руки» — множитель времени перезарядки (`combat.ts: handlePlayerWeapons`). Смена оружия и так мгновенна (в срезе нет отдельного КД смены) — «0 с» перка не требует отдельного поля. */
  readonly reloadTimeMult?: number;
  /** «Твёрдая рука»/«Хладнокровие» — верхняя граница `КоэфДвижения` разброса на бегу (§4.3); при нескольких активных перках `aggregatePerkEffects` берёт минимум (`combat.ts: performRangedAttack`). */
  readonly moveSpreadCoefCap?: number;
  /** «Последний патрон» — доступна ли раз-в-бой страховка от смертельного удара (`player-damage.ts`). */
  readonly lastStandPerFight?: boolean;
  /** «Последний патрон» — после срабатывания страховки следующий выстрел героя гарантированно крит (`combat.ts: performRangedAttack`). */
  readonly guaranteedCritOnNextShot?: boolean;
  /** «Дублёная шкура» — плоское снижение входящего урона после брони (`player-damage.ts`). */
  readonly flatDamageReduction?: number;
  /** «Дублёная шкура» — порог триггера шока (доля МаксХП) вместо стандартных 30% (§4.6, `player-damage.ts`). */
  readonly shockThresholdRatio?: number;
  /** «Хладнокровие» — длительность шока в мс вместо стандартных 4000 (§4.6, `player-damage.ts`). */
  readonly shockDurationMs?: number;
  /** «Крепкий хребет» — бонус к лимиту переносимого веса, кг (`items-economy.md` §1.2). Формула-константа, не подключена к `game/inventory` в этом срезе — см. докстринг файла. */
  readonly weightLimitBonusKg?: number;
  /** «Крепкий хребет» — общий множитель урона в рукопашной (и Кулаки, и Ножи), поверх базовой формулы §5 (`combat.ts: performMeleeAttack`). */
  readonly meleeDamageMult?: number;
  /** «Оба кулака» — дополнительный множитель урона именно Кулаков (`combat.ts: performMeleeAttack`), умножается вместе с `meleeDamageMult`. */
  readonly fistsDamageMult?: number;
  /** «Оба кулака» — откидывание цели критом Кулаков, клетки. Физического нокбэка в срезе нет вообще (даже базовые 0,3 м от крита §4.2 не реализованы) — формула-константа без вызова, тот же класс допущения, что и «weightLimitBonusKg». */
  readonly critKnockbackTiles?: number;
  /** «Языкастый» — бонус к порогу речевых проверок. Диалоговых числовых бонусов (не да/нет-проверок) в `interpreter.ts` нет — формула-константа. */
  readonly speechCheckBonus?: number;
  /** «Языкастый» — коэффициент шанса сдачи врага-человека на единицу Языка (`computeSurrenderChance`). Сдачи в бою как механики нет — формула протестирована отдельно. */
  readonly surrenderChancePerYazyk?: number;
  /** «Свой в доску» — дополнительный множитель цены покупки сверх модификатора Языка. Торговли/магазина нет в кодовой базе — формула-константа. */
  readonly buyPriceExtraMult?: number;
  /** «Свой в доску» — дополнительный множитель цены продажи. */
  readonly sellPriceExtraMult?: number;
  /** «Заговорить зубы» — сколько раз на локацию доступен гарантированный успех проверки `[Речь]`. */
  readonly freeSpeechAutoSuccessPerLocation?: number;
  /** «Сапёр» — за пределами скольких клеток от места установки собственная мина/граната не наносит урон. Мин/гранат нет в кодовой базе — формула-константа. */
  readonly mineSelfDamageRadiusTiles?: number;
  /** «Сапёр» — множитель времени установки мины. */
  readonly mineSetupTimeMult?: number;
  /** «Цепная реакция» — радиус вторичного взрыва при убийстве миной/гранатой, клетки. */
  readonly chainExplosionRadiusTiles?: number;
  /** «Цепная реакция» — множитель урона вторичного взрыва от базового. */
  readonly chainDamageMult?: number;
  /** «Холодный ствол» — множитель накопления жара «Дуги» (`heat.ts: advanceHeat`). Оружие «Дуга» вне среза, формула уже отдельно тестируется по прецеденту `heat.ts`. */
  readonly heatGainMult?: number;
  /** «Быстрый сброс» — множитель скорости остывания жара в простое (`heat.ts: advanceHeat`). */
  readonly heatCoolMult?: number;
  /** «Перегрузка» — множитель урона аварийного выстрела при 100 жара вместо блока. Логики урона выстрела «Дуги» нет в кодовой базе (оружия нет) — формула-константа. */
  readonly overheatBurstDamageMult?: number;
  /** «Перегрузка» — новая длительность блока жара после аварийного выстрела, мс (`heat.ts: advanceHeat`). */
  readonly overheatBlockMsOverride?: number;
  /** «Мародёр» — множитель количества добычи из контейнеров/трупов. Таблиц дропа нет — формула-константа. */
  readonly lootQuantityMult?: number;
  /** «Тихие пальцы» — множитель времени минигры взлома. Минигры взлома нет — формула-константа. */
  readonly lockpickTimeMult?: number;
  /** «Тихие пальцы» — неудачная попытка взлома не портит замок (без отката). */
  readonly noFailurePenalty?: boolean;
  /** «Карманник» — коэффициент шанса кражи у NPC на единицу Куража (`computeStealChance`). Карманной кражи как механики нет — формула протестирована отдельно. */
  readonly stealChancePerKurazh?: number;
  /** «Карманник» — штраф к отношению фракции NPC при провале кражи (пункты, отрицательное число). */
  readonly failReputationPenalty?: number;
}

export interface PerkDef {
  readonly id: PerkId;
  readonly nameKey: string;
  readonly archetype: PerkArchetype;
  readonly minLevel: PerkTierLevel;
  /** Все требования должны выполняться одновременно (`rpg-system.md` §3, напр. «Крепкий хребет» — Каркас ≥ 7 И Твёрдость ≥ 6). */
  readonly requires: readonly Requirement[];
  readonly effect: PerkEffect;
}

export const PERK_DEFS: Readonly<Record<PerkId, PerkDef>> = {
  'perk.bystrye_ruki': {
    id: 'perk.bystrye_ruki',
    nameKey: 'perk.bystrye_ruki.name',
    archetype: 'strelok',
    minLevel: 2,
    requires: [{ type: 'stat', stat: 'ostrota', gte: 6 }],
    effect: { reloadTimeMult: 0.75 },
  },
  'perk.tvyordaya_ruka': {
    id: 'perk.tvyordaya_ruka',
    nameKey: 'perk.tvyordaya_ruka.name',
    archetype: 'strelok',
    minLevel: 6,
    requires: [{ type: 'skill', skill: 'stvoly', gte: 40 }],
    effect: { moveSpreadCoefCap: 1.3 },
  },
  'perk.posledniy_patron': {
    id: 'perk.posledniy_patron',
    nameKey: 'perk.posledniy_patron.name',
    archetype: 'strelok',
    minLevel: 10,
    requires: [{ type: 'stat', stat: 'kurazh', gte: 6 }],
    effect: { lastStandPerFight: true, guaranteedCritOnNextShot: true },
  },
  'perk.dublyonaya_shkura': {
    id: 'perk.dublyonaya_shkura',
    nameKey: 'perk.dublyonaya_shkura.name',
    archetype: 'lomovik',
    minLevel: 2,
    requires: [{ type: 'stat', stat: 'karkas', gte: 6 }],
    effect: { flatDamageReduction: 2, shockThresholdRatio: 0.4 },
  },
  'perk.krepkiy_khrebet': {
    id: 'perk.krepkiy_khrebet',
    nameKey: 'perk.krepkiy_khrebet.name',
    archetype: 'lomovik',
    minLevel: 6,
    requires: [
      { type: 'stat', stat: 'karkas', gte: 7 },
      { type: 'stat', stat: 'tvyordost', gte: 6 },
    ],
    effect: { weightLimitBonusKg: 25, meleeDamageMult: 1.15 },
  },
  'perk.oba_kulaka': {
    id: 'perk.oba_kulaka',
    nameKey: 'perk.oba_kulaka.name',
    archetype: 'lomovik',
    minLevel: 10,
    requires: [
      { type: 'skill', skill: 'kulaki', gte: 70 },
      { type: 'stat', stat: 'karkas', gte: 8 },
    ],
    effect: { fistsDamageMult: 1.5, critKnockbackTiles: 2 },
  },
  'perk.yazykastyy': {
    id: 'perk.yazykastyy',
    nameKey: 'perk.yazykastyy.name',
    archetype: 'boltun',
    minLevel: 2,
    requires: [{ type: 'stat', stat: 'yazyk', gte: 6 }],
    effect: { speechCheckBonus: 10, surrenderChancePerYazyk: 0.05 },
  },
  'perk.svoy_v_doske': {
    id: 'perk.svoy_v_doske',
    nameKey: 'perk.svoy_v_doske.name',
    archetype: 'boltun',
    minLevel: 6,
    requires: [{ type: 'skill', skill: 'rech', gte: 40 }],
    effect: { buyPriceExtraMult: 0.85, sellPriceExtraMult: 1.15 },
  },
  'perk.zagovorit_zuby': {
    id: 'perk.zagovorit_zuby',
    nameKey: 'perk.zagovorit_zuby.name',
    archetype: 'boltun',
    minLevel: 10,
    requires: [
      { type: 'skill', skill: 'rech', gte: 70 },
      { type: 'stat', stat: 'yazyk', gte: 8 },
    ],
    effect: { freeSpeechAutoSuccessPerLocation: 1 },
  },
  'perk.khladnokroviye': {
    id: 'perk.khladnokroviye',
    nameKey: 'perk.khladnokroviye.name',
    archetype: 'podryvnik',
    minLevel: 2,
    requires: [{ type: 'stat', stat: 'tvyordost', gte: 5 }],
    effect: { moveSpreadCoefCap: 1.2, shockDurationMs: 2000 },
  },
  'perk.saper': {
    id: 'perk.saper',
    nameKey: 'perk.saper.name',
    archetype: 'podryvnik',
    minLevel: 6,
    requires: [
      { type: 'skill', skill: 'vzryvchatka', gte: 40 },
      { type: 'stat', stat: 'tvyordost', gte: 6 },
    ],
    effect: { mineSelfDamageRadiusTiles: 1, mineSetupTimeMult: 0.5 },
  },
  'perk.tsepnaya_reaktsiya': {
    id: 'perk.tsepnaya_reaktsiya',
    nameKey: 'perk.tsepnaya_reaktsiya.name',
    archetype: 'podryvnik',
    minLevel: 10,
    requires: [
      { type: 'skill', skill: 'vzryvchatka', gte: 80 },
      { type: 'stat', stat: 'smekalka', gte: 7 },
    ],
    effect: { chainExplosionRadiusTiles: 3, chainDamageMult: 0.5 },
  },
  'perk.kholodnyy_stvol': {
    id: 'perk.kholodnyy_stvol',
    nameKey: 'perk.kholodnyy_stvol.name',
    archetype: 'luchevik',
    minLevel: 2,
    requires: [
      { type: 'stat', stat: 'smekalka', gte: 6 },
      { type: 'skill', skill: 'luch', gte: 20 },
    ],
    effect: { heatGainMult: 0.8 },
  },
  'perk.bystryy_sbros': {
    id: 'perk.bystryy_sbros',
    nameKey: 'perk.bystryy_sbros.name',
    archetype: 'luchevik',
    minLevel: 6,
    requires: [{ type: 'skill', skill: 'luch', gte: 50 }],
    effect: { heatCoolMult: 1.5 },
  },
  'perk.peregruzka': {
    id: 'perk.peregruzka',
    nameKey: 'perk.peregruzka.name',
    archetype: 'luchevik',
    minLevel: 10,
    requires: [
      { type: 'skill', skill: 'luch', gte: 80 },
      { type: 'stat', stat: 'kurazh', gte: 7 },
    ],
    effect: { overheatBurstDamageMult: 3, overheatBlockMsOverride: 3000 },
  },
  'perk.marodyor': {
    id: 'perk.marodyor',
    nameKey: 'perk.marodyor.name',
    archetype: 'vor',
    minLevel: 2,
    requires: [{ type: 'stat', stat: 'smekalka', gte: 5 }],
    effect: { lootQuantityMult: 1.3 },
  },
  'perk.tikhiye_paltsy': {
    id: 'perk.tikhiye_paltsy',
    nameKey: 'perk.tikhiye_paltsy.name',
    archetype: 'vor',
    minLevel: 6,
    requires: [{ type: 'skill', skill: 'vzlom', gte: 40 }],
    effect: { lockpickTimeMult: 0.6, noFailurePenalty: true },
  },
  'perk.karmannik': {
    id: 'perk.karmannik',
    nameKey: 'perk.karmannik.name',
    archetype: 'vor',
    minLevel: 10,
    requires: [
      { type: 'skill', skill: 'vzlom', gte: 70 },
      { type: 'stat', stat: 'kurazh', gte: 7 },
    ],
    effect: { stealChancePerKurazh: 0.1, failReputationPenalty: -10 },
  },
};

/**
 * «Языкастый» (Болтун, ур.2): шанс сдачи врага-человека с ХП < 25% =
 * `5% × Язык` (`rpg-system.md` §3, перк 7). `?? 0` защищает тип (поле
 * опционально в `PerkEffect`), но `PERK_DEFS['perk.yazykastyy']` всегда
 * задаёт `surrenderChancePerYazyk` — недостижимо через публичный API.
 */
export function computeSurrenderChance(yazyk: number): number {
  /* v8 ignore next */
  return (PERK_DEFS['perk.yazykastyy'].effect.surrenderChancePerYazyk ?? 0) * yazyk;
}

/** «Карманник» (Вор, ур.10): шанс украсть предмет у NPC = `10% × Кураж` (перк 18) — та же защита типа, что и выше. */
export function computeStealChance(kurazh: number): number {
  /* v8 ignore next */
  return (PERK_DEFS['perk.karmannik'].effect.stealChancePerKurazh ?? 0) * kurazh;
}

export interface CharacterSheet {
  readonly stats: Readonly<Partial<Record<StatKey, number>>>;
  readonly skills: Readonly<Partial<Record<SkillKey, number>>>;
}

export function isRequirementMet(req: Requirement, sheet: CharacterSheet): boolean {
  if (req.type === 'stat') return (sheet.stats[req.stat] ?? 0) >= req.gte;
  return (sheet.skills[req.skill] ?? 0) >= req.gte;
}

export function arePerkRequirementsMet(perk: PerkDef, sheet: CharacterSheet): boolean {
  return perk.requires.every((req) => isRequirementMet(req, sheet));
}

/** Доступен ли перк на уровне `level` с текущим листом персонажа — минимальный уровень тира И все требования (`rpg-system.md` §3: «слот открывается каждые 2 уровня… в незакреплённый слот можно взять любой уже доступный перк»). */
export function isPerkAvailable(perk: PerkDef, level: number, sheet: CharacterSheet): boolean {
  return level >= perk.minLevel && arePerkRequirementsMet(perk, sheet);
}

/** Все перки, доступные персонажу на данном уровне с данным листом — «тест на набор XP → левелап → доступные перки» (см. `progression.test.ts`/`perks.test.ts`). */
export function availablePerks(level: number, sheet: CharacterSheet): readonly PerkDef[] {
  return Object.values(PERK_DEFS).filter((perk) => isPerkAvailable(perk, level, sheet));
}

export const EMPTY_PERK_EFFECT: PerkEffect = {};

/**
 * Сшивает эффекты нескольких разблокированных перков в один `PerkEffect`.
 * На сегодня только одно поле теоретически может прийти от двух перков
 * одновременно (`moveSpreadCoefCap` — «Твёрдая рука» 1,3 и «Хладнокровие»
 * 1,2, оба доступны гибридному билду через свободные слоты §3) — для него
 * берётся минимум (более сильное снижение штрафа на бег); остальные поля
 * просто перезаписываются (в 18 перках у каждого поля, кроме
 * `moveSpreadCoefCap`, ровно один источник).
 */
export function aggregatePerkEffects(unlockedPerkIds: readonly PerkId[]): PerkEffect {
  let result: PerkEffect = EMPTY_PERK_EFFECT;
  for (const id of unlockedPerkIds) {
    const def = PERK_DEFS[id];
    if (!def) continue;
    const merged: PerkEffect = { ...result, ...def.effect };
    if (result.moveSpreadCoefCap !== undefined && def.effect.moveSpreadCoefCap !== undefined) {
      result = { ...merged, moveSpreadCoefCap: Math.min(result.moveSpreadCoefCap, def.effect.moveSpreadCoefCap) };
    } else {
      result = merged;
    }
  }
  return result;
}
