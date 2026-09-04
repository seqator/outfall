/**
 * Миграции формата сейва (OF-019). Сохранения — первая версия формата в этой
 * игре (задача OF-019 сама заводит `SaveStore`), поэтому у неё нет реальной
 * истории релизов. Чтобы механизм миграции был реально работающим (а не
 * заглушкой «на будущее»), версия 1 здесь — задокументированный исторический
 * формат раннего прототипа (до появления боевого продолжения сейва): без
 * брони/боевых статов героя, без независимого состояния оружия, стадии
 * квестов — просто `questId → строка` без истории. Версия 2 (текущая,
 * `save-schema.ts`) добавляет всё это. `migrateToLatestSave` умеет довести
 * любой известный `schemaVersion` до `CURRENT_SAVE_SCHEMA_VERSION`, а тест
 * `tests/unit/game/save/migrations.test.ts` гоняет фикстуру версии 1 —
 * буквально критерий задачи «сейв старой версии грузится».
 */

import { z } from 'zod';
import { createWeaponsComponent } from '../../sim';
import { CURRENT_SAVE_SCHEMA_VERSION, SaveStateSchema, type SaveState } from './save-schema';

/** КОСТЯК-база/боевые навыки по умолчанию — те же допущения, что `demo-scene.ts` берёт для героя без ролевой системы (см. комментарий там); используются только чтобы «долепить» данные, которых не было в старом формате сейва. */
const MIGRATION_DEFAULT_COMBAT_SKILL = 50;
const MIGRATION_DEFAULT_COURAGE = 5;
const MIGRATION_DEFAULT_REFLEX = 5;

// ---------------------------------------------------------------------------
// Версия 1 (исторический формат, только для миграции/тестов — см. заголовок).
// ---------------------------------------------------------------------------

const InventoryStackV1Schema = z.object({
  uid: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  decayRemainingMs: z.number().nonnegative().optional(),
});

const InventoryV1Schema = z.object({
  backpack: z.array(InventoryStackV1Schema),
  equipment: z.record(z.string(), InventoryStackV1Schema),
  wallet: z.number().nonnegative(),
});

const SaveStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  hero: z.object({
    x: z.number(),
    y: z.number(),
    hp: z.number().nonnegative(),
    maxHp: z.number().positive(),
  }),
  inventory: InventoryV1Schema,
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  /** v1: только текущая стадия, без истории (`questId → stage`). */
  quests: z.record(z.string(), z.string().min(1)),
  rngSeed: z.number(),
  worldTick: z.number().int().nonnegative(),
});
export type SaveStateV1 = z.infer<typeof SaveStateV1Schema>;

/** v1 → v2: добавляет броню/боевые статы героя, независимое состояние оружия и историю стадий квестов, которых v1 не знал. */
function migrateV1ToV2(v1: SaveStateV1): unknown {
  return {
    schemaVersion: 2,
    savedAtMs: 0,
    hero: {
      x: v1.hero.x,
      y: v1.hero.y,
      hp: v1.hero.hp,
      maxHp: v1.hero.maxHp,
      armor: 0,
      facing: { dirX: 1, dirY: 0 },
      attributes: { courage: MIGRATION_DEFAULT_COURAGE, reflex: MIGRATION_DEFAULT_REFLEX },
      combatSkills: {
        guns: MIGRATION_DEFAULT_COMBAT_SKILL,
        heavy: MIGRATION_DEFAULT_COMBAT_SKILL,
        fists: MIGRATION_DEFAULT_COMBAT_SKILL,
      },
      dashState: { iframesRemainingMs: 0, cooldownRemainingMs: 0 },
    },
    weapons: createWeaponsComponent(),
    inventory: v1.inventory,
    flags: v1.flags,
    quests: Object.fromEntries(
      Object.entries(v1.quests).map(([questId, stage]) => [questId, { stage, history: [stage] }]),
    ),
    rngSeed: v1.rngSeed,
    worldTick: v1.worldTick,
  };
}

// ---------------------------------------------------------------------------
// Реестр версий/миграций.
// ---------------------------------------------------------------------------

/** Схема, по которой проверяется сырой сейв каждой известной версии, до применения миграции к следующей версии. */
const SCHEMA_BY_VERSION: Readonly<Record<number, z.ZodType>> = {
  1: SaveStateV1Schema,
  [CURRENT_SAVE_SCHEMA_VERSION]: SaveStateSchema,
};

/** `version N → шаг миграции к N+1` (сырые данные, ещё не провалидированные схемой `N+1`). */
const MIGRATIONS: Readonly<Record<number, (data: never) => unknown>> = {
  1: migrateV1ToV2,
};

const SchemaVersionEnvelopeSchema = z.object({ schemaVersion: z.number().int().positive() });

export class SaveDataError extends Error {}

/**
 * Доводит сырые данные сейва (уже распарсенный JSON) до текущей версии
 * формата, валидируя каждый промежуточный шаг соответствующей схемой.
 * Бросает `SaveDataError` на действительно битом/неизвестном формате —
 * `SaveStore` не должен ронять игру на плохом файле, но обязан отличить
 * «файл не сейв» от «сейв, который можно загрузить».
 */
export function migrateToLatestSave(raw: unknown): SaveState {
  const envelope = SchemaVersionEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new SaveDataError('Сейв повреждён: не удалось прочитать schemaVersion');
  }

  let version = envelope.data.schemaVersion;
  if (version > CURRENT_SAVE_SCHEMA_VERSION) {
    throw new SaveDataError(
      `Сейв версии ${version} новее, чем поддерживает игра (${CURRENT_SAVE_SCHEMA_VERSION})`,
    );
  }

  const initialSchema = SCHEMA_BY_VERSION[version];
  if (!initialSchema) {
    throw new SaveDataError(`Неизвестная версия сейва: ${version}`);
  }
  const initialParsed = initialSchema.safeParse(raw);
  if (!initialParsed.success) {
    throw new SaveDataError(
      `Сейв версии ${version} не прошёл валидацию: ${initialParsed.error.message}`,
    );
  }

  let data: unknown = initialParsed.data;
  while (version < CURRENT_SAVE_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      throw new SaveDataError(`Нет миграции с версии сейва ${version} на следующую`);
    }
    data = migrate(data as never);
    version += 1;
    const schema = SCHEMA_BY_VERSION[version];
    if (!schema) {
      throw new SaveDataError(`Нет схемы для версии сейва ${version} после миграции`);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new SaveDataError(
        `Миграция сейва до версии ${version} дала невалидные данные: ${parsed.error.message}`,
      );
    }
    data = parsed.data;
  }

  return data as SaveState;
}
