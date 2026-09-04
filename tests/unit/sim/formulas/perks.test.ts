import { describe, expect, it } from 'vitest';
import {
  aggregatePerkEffects,
  arePerkRequirementsMet,
  availablePerks,
  computeStealChance,
  computeSurrenderChance,
  isPerkAvailable,
  isRequirementMet,
  PERK_DEFS,
  type CharacterSheet,
  type PerkId,
} from '../../../../src/sim/formulas/perks';

const EMPTY_SHEET: CharacterSheet = { stats: {}, skills: {} };

describe('sim/formulas/perks: PERK_DEFS — все 18 перков присутствуют с числами из §3 rpg-system.md', () => {
  it('ровно 18 перков, по 3 на каждый из 6 архетипов', () => {
    const defs = Object.values(PERK_DEFS);
    expect(defs).toHaveLength(18);
    const byArchetype = new Map<string, number>();
    for (const def of defs) {
      byArchetype.set(def.archetype, (byArchetype.get(def.archetype) ?? 0) + 1);
    }
    expect([...byArchetype.values()]).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('минимальные уровни тиров — только 2/6/10, по одному перку каждого тира на архетип', () => {
    const byArchetype = new Map<string, number[]>();
    for (const def of Object.values(PERK_DEFS)) {
      const levels = byArchetype.get(def.archetype) ?? [];
      levels.push(def.minLevel);
      byArchetype.set(def.archetype, levels);
    }
    for (const levels of byArchetype.values()) {
      expect([...levels].sort((a, b) => a - b)).toEqual([2, 6, 10]);
    }
  });

  it('«Быстрые руки» (Стрелок, ур.2, Острота≥6): перезарядка ×0,75', () => {
    const def = PERK_DEFS['perk.bystrye_ruki'];
    expect(def.minLevel).toBe(2);
    expect(def.requires).toEqual([{ type: 'stat', stat: 'ostrota', gte: 6 }]);
    expect(def.effect.reloadTimeMult).toBe(0.75);
  });

  it('«Твёрдая рука» (Стрелок, ур.6, Стволы≥40): предел КоэфДвижения 1,3', () => {
    const def = PERK_DEFS['perk.tvyordaya_ruka'];
    expect(def.requires).toEqual([{ type: 'skill', skill: 'stvoly', gte: 40 }]);
    expect(def.effect.moveSpreadCoefCap).toBe(1.3);
  });

  it('«Последний патрон» (Стрелок, ур.10, Кураж≥6): страховка + гарантированный крит', () => {
    const def = PERK_DEFS['perk.posledniy_patron'];
    expect(def.requires).toEqual([{ type: 'stat', stat: 'kurazh', gte: 6 }]);
    expect(def.effect.lastStandPerFight).toBe(true);
    expect(def.effect.guaranteedCritOnNextShot).toBe(true);
  });

  it('«Дублёная шкура» (Ломовик, ур.2, Каркас≥6): −2 урона, порог шока 40%', () => {
    const def = PERK_DEFS['perk.dublyonaya_shkura'];
    expect(def.effect.flatDamageReduction).toBe(2);
    expect(def.effect.shockThresholdRatio).toBe(0.4);
  });

  it('«Крепкий хребет» (Ломовик, ур.6, Каркас≥7 И Твёрдость≥6): +25 кг, урон в рукопашной ×1,15', () => {
    const def = PERK_DEFS['perk.krepkiy_khrebet'];
    expect(def.requires).toEqual([
      { type: 'stat', stat: 'karkas', gte: 7 },
      { type: 'stat', stat: 'tvyordost', gte: 6 },
    ]);
    expect(def.effect.weightLimitBonusKg).toBe(25);
    expect(def.effect.meleeDamageMult).toBe(1.15);
  });

  it('«Оба кулака» (Ломовик, ур.10, Кулаки≥70 И Каркас≥8): урон Кулаков ×1,5', () => {
    const def = PERK_DEFS['perk.oba_kulaka'];
    expect(def.requires).toEqual([
      { type: 'skill', skill: 'kulaki', gte: 70 },
      { type: 'stat', stat: 'karkas', gte: 8 },
    ]);
    expect(def.effect.fistsDamageMult).toBe(1.5);
    expect(def.effect.critKnockbackTiles).toBe(2);
  });

  it('«Языкастый» (Болтун, ур.2, Язык≥6): +10 к речевым, сдача 5%×Язык', () => {
    const def = PERK_DEFS['perk.yazykastyy'];
    expect(def.effect.speechCheckBonus).toBe(10);
    expect(def.effect.surrenderChancePerYazyk).toBe(0.05);
  });

  it('«Свой в доску» (Болтун, ур.6, Речь≥40): −15% покупка, +15% продажа', () => {
    const def = PERK_DEFS['perk.svoy_v_doske'];
    expect(def.effect.buyPriceExtraMult).toBe(0.85);
    expect(def.effect.sellPriceExtraMult).toBe(1.15);
  });

  it('«Заговорить зубы» (Болтун, ур.10, Речь≥70 И Язык≥8): 1 авто-успех на локацию', () => {
    const def = PERK_DEFS['perk.zagovorit_zuby'];
    expect(def.effect.freeSpeechAutoSuccessPerLocation).toBe(1);
  });

  it('«Хладнокровие» (Подрывник, ур.2, Твёрдость≥5): предел 1,2, шок 2000 мс', () => {
    const def = PERK_DEFS['perk.khladnokroviye'];
    expect(def.effect.moveSpreadCoefCap).toBe(1.2);
    expect(def.effect.shockDurationMs).toBe(2000);
  });

  it('«Сапёр» (Подрывник, ур.6, Взрывчатка≥40 И Твёрдость≥6): радиус 1, установка ×0,5', () => {
    const def = PERK_DEFS['perk.saper'];
    expect(def.effect.mineSelfDamageRadiusTiles).toBe(1);
    expect(def.effect.mineSetupTimeMult).toBe(0.5);
  });

  it('«Цепная реакция» (Подрывник, ур.10, Взрывчатка≥80 И Смекалка≥7): радиус 3, урон ×0,5', () => {
    const def = PERK_DEFS['perk.tsepnaya_reaktsiya'];
    expect(def.effect.chainExplosionRadiusTiles).toBe(3);
    expect(def.effect.chainDamageMult).toBe(0.5);
  });

  it('«Холодный ствол» (Лучевик, ур.2, Смекалка≥6 И Луч≥20): жар ×0,8', () => {
    const def = PERK_DEFS['perk.kholodnyy_stvol'];
    expect(def.effect.heatGainMult).toBe(0.8);
  });

  it('«Быстрый сброс» (Лучевик, ур.6, Луч≥50): остывание ×1,5', () => {
    const def = PERK_DEFS['perk.bystryy_sbros'];
    expect(def.effect.heatCoolMult).toBe(1.5);
  });

  it('«Перегрузка» (Лучевик, ур.10, Луч≥80 И Кураж≥7): урон ×3, блок 3000 мс', () => {
    const def = PERK_DEFS['perk.peregruzka'];
    expect(def.effect.overheatBurstDamageMult).toBe(3);
    expect(def.effect.overheatBlockMsOverride).toBe(3000);
  });

  it('«Мародёр» (Вор, ур.2, Смекалка≥5): лут ×1,3', () => {
    const def = PERK_DEFS['perk.marodyor'];
    expect(def.effect.lootQuantityMult).toBe(1.3);
  });

  it('«Тихие пальцы» (Вор, ур.6, Взлом≥40): взлом ×0,6, без штрафа за провал', () => {
    const def = PERK_DEFS['perk.tikhiye_paltsy'];
    expect(def.effect.lockpickTimeMult).toBe(0.6);
    expect(def.effect.noFailurePenalty).toBe(true);
  });

  it('«Карманник» (Вор, ур.10, Взлом≥70 И Кураж≥7): кража 10%×Кураж, штраф −10', () => {
    const def = PERK_DEFS['perk.karmannik'];
    expect(def.effect.stealChancePerKurazh).toBe(0.1);
    expect(def.effect.failReputationPenalty).toBe(-10);
  });
});

describe('sim/formulas/perks: computeSurrenderChance/computeStealChance', () => {
  it('сдача врага-человека = 5% × Язык', () => {
    expect(computeSurrenderChance(8)).toBeCloseTo(0.4, 6);
    expect(computeSurrenderChance(0)).toBe(0);
  });

  it('кража у NPC = 10% × Кураж', () => {
    expect(computeStealChance(7)).toBeCloseTo(0.7, 6);
  });
});

describe('sim/formulas/perks: isRequirementMet/arePerkRequirementsMet', () => {
  it('одиночное требование по характеристике', () => {
    expect(isRequirementMet({ type: 'stat', stat: 'ostrota', gte: 6 }, { stats: { ostrota: 6 }, skills: {} })).toBe(
      true,
    );
    expect(isRequirementMet({ type: 'stat', stat: 'ostrota', gte: 6 }, { stats: { ostrota: 5 }, skills: {} })).toBe(
      false,
    );
  });

  it('одиночное требование по навыку', () => {
    expect(
      isRequirementMet({ type: 'skill', skill: 'stvoly', gte: 40 }, { stats: {}, skills: { stvoly: 40 } }),
    ).toBe(true);
  });

  it('незаданная характеристика/навык трактуется как 0 — требование не выполнено', () => {
    expect(isRequirementMet({ type: 'stat', stat: 'karkas', gte: 1 }, EMPTY_SHEET)).toBe(false);
    expect(isRequirementMet({ type: 'skill', skill: 'stvoly', gte: 1 }, EMPTY_SHEET)).toBe(false);
  });

  it('«Крепкий хребет» требует ОБА условия одновременно', () => {
    const def = PERK_DEFS['perk.krepkiy_khrebet'];
    expect(arePerkRequirementsMet(def, { stats: { karkas: 7, tvyordost: 6 }, skills: {} })).toBe(true);
    expect(arePerkRequirementsMet(def, { stats: { karkas: 7, tvyordost: 5 }, skills: {} })).toBe(false);
    expect(arePerkRequirementsMet(def, { stats: { karkas: 6, tvyordost: 6 }, skills: {} })).toBe(false);
  });
});

describe('sim/formulas/perks: isPerkAvailable/availablePerks — «требование не выполнено → перк недоступен»', () => {
  it('перк недоступен ниже своего minLevel, даже если требования выполнены', () => {
    const def = PERK_DEFS['perk.tvyordaya_ruka']; // minLevel 6
    const sheet: CharacterSheet = { stats: {}, skills: { stvoly: 40 } };
    expect(isPerkAvailable(def, 5, sheet)).toBe(false);
    expect(isPerkAvailable(def, 6, sheet)).toBe(true);
  });

  it('перк недоступен на нужном уровне без выполненного требования характеристики', () => {
    const def = PERK_DEFS['perk.bystrye_ruki'];
    expect(isPerkAvailable(def, 10, { stats: { ostrota: 5 }, skills: {} })).toBe(false);
  });

  it('availablePerks на низком уровне с нулевым листом персонажа — пусто', () => {
    expect(availablePerks(1, EMPTY_SHEET)).toEqual([]);
  });

  it('availablePerks на 14 уровне с сильным листом персонажа — доступны все 18', () => {
    const strongSheet: CharacterSheet = {
      stats: { karkas: 10, ostrota: 10, smekalka: 10, tvyordost: 10, yazyk: 10, kurazh: 10 },
      skills: {
        stvoly: 100,
        tyazhyoloe: 100,
        luch: 100,
        kulaki: 100,
        nozhi: 100,
        vzryvchatka: 100,
        vzlom: 100,
        remont: 100,
        medicina: 100,
        rech: 100,
      },
    };
    expect(availablePerks(14, strongSheet)).toHaveLength(18);
  });

  it('пример из GDD §5.1 («Свинец»): ур.2, Острота 8 → доступна «Быстрые руки», недоступна «Твёрдая рука» (Стволы ещё 0)', () => {
    const sheet: CharacterSheet = { stats: { ostrota: 8, kurazh: 9 }, skills: { stvoly: 0 } };
    const ids = availablePerks(2, sheet).map((p) => p.id);
    expect(ids).toContain('perk.bystrye_ruki');
    expect(ids).not.toContain('perk.tvyordaya_ruka');
    expect(ids).not.toContain('perk.posledniy_patron'); // minLevel 10
  });
});

describe('sim/formulas/perks: aggregatePerkEffects', () => {
  it('пустой список — пустой эффект', () => {
    expect(aggregatePerkEffects([])).toEqual({});
  });

  it('несколько перков без пересечения полей — объединяются в один объект', () => {
    const effect = aggregatePerkEffects(['perk.bystrye_ruki', 'perk.dublyonaya_shkura']);
    expect(effect.reloadTimeMult).toBe(0.75);
    expect(effect.flatDamageReduction).toBe(2);
  });

  it('«Твёрдая рука» (1,3) и «Хладнокровие» (1,2) вместе — берётся минимум (1,2)', () => {
    const effect = aggregatePerkEffects(['perk.tvyordaya_ruka', 'perk.khladnokroviye']);
    expect(effect.moveSpreadCoefCap).toBe(1.2);

    const reversedOrder = aggregatePerkEffects(['perk.khladnokroviye', 'perk.tvyordaya_ruka']);
    expect(reversedOrder.moveSpreadCoefCap).toBe(1.2);
  });

  it('неизвестный id в списке молча игнорируется (защита типа, не достижимо через публичный API)', () => {
    const withUnknown = aggregatePerkEffects(['perk.bystrye_ruki', 'perk.does_not_exist' as PerkId]);
    expect(withUnknown.reloadTimeMult).toBe(0.75);
  });
});
