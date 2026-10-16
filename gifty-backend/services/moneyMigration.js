// One-off migration to the derived money model (Phase 2). Idempotent: every
// step only touches documents/indexes that still need it, so re-running is
// safe. Dry run by default; apply mode takes a backup first.
const mongoose = require('mongoose');
const Gift = require('../models/Gift');
const Tag = require('../models/Tags');
const Event = require('../models/Event');
const EventType = require('../models/EventType');
const { Budget, OverallBudget } = require('../models/Budget');
const moneyService = require('./moneyService');
const backupService = require('./backupService');
const { dropLegacyTagNameIndex } = require('../migrations/dropLegacyTagNameIndex');
const { toCents, fromCents, formatMoney } = require('../utils/money');
const { yearInTimeZone } = require('../utils/dates');
const logger = require('../utils/logger');

const MIGRATION_ID = 'money-model-2026-10';
const BUDGET_LEGACY_FIELDS = { spentAmount: '', remainingAmount: '', budgetStatus: '', lastAnalysis: '' };
const OVERALL_LEGACY_FIELDS = { allocatedAmount: '', remainingAmount: '' };
const GIFT_LEGACY_FIELDS = { budget: '', budgetStatus: '' };

// The date the backfill gives a purchased gift that has none (ruling R13a)
const backfillDate = (gift) => gift.updatedAt || gift.createdAt || gift._id.getTimestamp();
const utcDay = (date) => new Date(date).toISOString().slice(0, 10);

const indexNames = async (collection) => {
  try {
    return (await collection.indexes()).map((index) => index.name);
  } catch (error) {
    if (error.codeName === 'NamespaceNotFound' || error.code === 26) return [];
    throw error;
  }
};

const anyFieldExists = (fields) => ({ $or: Object.keys(fields).map((field) => ({ [field]: { $exists: true } })) });

const describeReport = (report) => [
  `[money-migration] ${report.apply ? `APPLIED (backup: ${report.backup})` : 'DRY RUN, nothing was written'}`,
  `  prices rounded to cents: ${report.pricesRounded}`,
  `  negative prices (reported, not changed): ${report.negativePrices.map((p) => `${p.giftId}=${p.price}`).join(', ') || 'none'}`,
  `  purchased gifts given a purchaseDate: ${report.purchaseDatesBackfilled}`,
  `  removed fields: budgets ${report.legacyFieldsRemoved.budgets}, overall budgets ${report.legacyFieldsRemoved.overallBudgets}, gifts ${report.legacyFieldsRemoved.gifts}`,
  `  pre-filled purchaseDate cleared on non-purchased gifts: ${report.purchaseDatesCleared}`,
  `  legacy indexes: gifts.budget_price ${report.indexes.giftsBudgetPrice}, tags.name_1 ${report.indexes.tagsName}, eventtypes.name_1 ${report.indexes.eventTypesName}`,
  `  budget drift (stored spentAmount vs derived Spent): ${report.drift.length ? '' : 'none'}`,
  ...(report.driftUndatedCounted
    ? [`    (undated purchased gifts counted as they will be dated: ${report.driftUndatedCounted})`]
    : []),
  ...report.drift.map((d) => `    budget ${d.budgetId} (recipient ${d.recipient}, ${d.year}): stored ${formatMoney(d.stored)}, derived ${formatMoney(d.derived)}, difference ${formatMoney(d.difference)}`),
  `  purchased gifts dated on their event's day (review in Purchase History): ${report.purchasedOnEventDate.length || 'none'}`,
  ...report.purchasedOnEventDate.map((g) => `    gift ${g.giftId} "${g.name}" (${g.event}, ${utcDay(g.purchaseDate)})`)
];

const runMoneyModelMigration = async ({
  apply = false,
  createBackup = backupService.createBackup,
  log = (line) => logger.info(line)
} = {}) => {
  const gifts = Gift.collection;
  const report = {
    apply,
    backup: null,
    pricesRounded: 0,
    negativePrices: [],
    purchaseDatesBackfilled: 0,
    drift: [],
    driftUndatedCounted: 0,
    purchasedOnEventDate: [],
    legacyFieldsRemoved: { budgets: 0, overallBudgets: 0, gifts: 0 },
    purchaseDatesCleared: 0,
    indexes: { giftsBudgetPrice: false, tagsName: false, eventTypesName: false }
  };

  // 0. Pre-migration backup (apply only), before any write
  if (apply) {
    report.backup = (await createBackup()).backupName;
  }

  // 1. Round every gift price to cents
  const priceFixes = [];
  for await (const gift of gifts.find({ price: { $type: 'number' } }, { projection: { price: 1 } })) {
    if (gift.price < 0) report.negativePrices.push({ giftId: String(gift._id), price: gift.price });
    const rounded = fromCents(toCents(gift.price));
    if (rounded !== gift.price) {
      priceFixes.push({ updateOne: { filter: { _id: gift._id }, update: { $set: { price: rounded } } } });
    }
  }
  report.pricesRounded = priceFixes.length;
  if (apply && priceFixes.length) await gifts.bulkWrite(priceFixes);

  // 2. Purchased gifts without a purchaseDate would drop out of every year:
  //    date them by their last update (ruling R13a)
  const undated = await gifts
    .find(
      { status: 'purchased', purchaseDate: { $not: { $type: 'date' } } },
      { projection: { updatedAt: 1, createdAt: 1, user: 1, recipient: 1, price: 1 } }
    )
    .toArray();
  report.purchaseDatesBackfilled = undated.length;
  if (apply) {
    for (const gift of undated) {
      await gifts.updateOne(
        { _id: gift._id },
        { $set: { purchaseDate: backfillDate(gift) } }
      );
    }
  }

  // 3. Drift report: what the old counter said vs what was actually bought.
  //    A dry run has not dated the undated purchases yet: count them in the
  //    year the backfill will give them, so dry run and apply agree.
  const pendingCents = new Map();
  if (!apply) {
    for (const gift of undated) {
      const cents = typeof gift.price === 'number' ? toCents(gift.price) : NaN;
      if (!gift.user || !gift.recipient || !Number.isFinite(cents)) continue;
      const key = `${gift.user}|${gift.recipient}|${yearInTimeZone(backfillDate(gift))}`;
      pendingCents.set(key, (pendingCents.get(key) || 0) + cents);
      report.driftUndatedCounted += 1;
    }
  }
  const countedBudgets = await Budget.collection.find({ spentAmount: { $exists: true } }).toArray();
  for (const budget of countedBudgets) {
    if (!budget.user || !budget.recipient || !Number.isInteger(budget.year)) continue;
    const datedTotal = (await moneyService.getRecipientSpend(budget.user, budget.recipient, { year: budget.year })).total;
    const pending = pendingCents.get(`${budget.user}|${budget.recipient}|${budget.year}`) || 0;
    const derived = fromCents(toCents(datedTotal) + pending);
    const stored = Number(budget.spentAmount) || 0;
    if (toCents(stored) !== toCents(derived)) {
      report.drift.push({
        budgetId: String(budget._id),
        user: String(budget.user),
        recipient: String(budget.recipient),
        year: budget.year,
        stored,
        derived,
        difference: fromCents(toCents(derived) - toCents(stored))
      });
    }
  }

  // 3b. Purchased gifts dated on their event's day: likely legacy AI
  //     suggestions whose purchaseDate was pre-filled with the event date.
  //     Reported for the owner to review in Purchase History; never changed.
  //     Event dates are date-only (UTC midnight), so compare UTC days.
  const datedWithEvent = await gifts
    .find(
      { status: 'purchased', purchaseDate: { $type: 'date' }, event: { $exists: true, $ne: null } },
      { projection: { name: 1, event: 1, purchaseDate: 1 } }
    )
    .toArray();
  if (datedWithEvent.length) {
    const eventIds = [...new Set(datedWithEvent.map((g) => String(g.event)))]
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const events = await Event.collection
      .find({ _id: { $in: eventIds } }, { projection: { name: 1, date: 1 } })
      .toArray();
    const eventsById = new Map(events.map((e) => [String(e._id), e]));
    for (const gift of datedWithEvent) {
      const event = eventsById.get(String(gift.event));
      if (event && event.date instanceof Date && utcDay(event.date) === utcDay(gift.purchaseDate)) {
        report.purchasedOnEventDate.push({
          giftId: String(gift._id), name: gift.name, event: event.name, purchaseDate: gift.purchaseDate
        });
      }
    }
  }

  // 4. Unset the removed fields
  const unsetLegacy = async (collection, fields, key) => {
    const filter = anyFieldExists(fields);
    report.legacyFieldsRemoved[key] = await collection.countDocuments(filter);
    if (apply && report.legacyFieldsRemoved[key]) await collection.updateMany(filter, { $unset: fields });
  };
  await unsetLegacy(Budget.collection, BUDGET_LEGACY_FIELDS, 'budgets');
  await unsetLegacy(OverallBudget.collection, OVERALL_LEGACY_FIELDS, 'overallBudgets');
  await unsetLegacy(gifts, GIFT_LEGACY_FIELDS, 'gifts');

  // 5. Non-purchased gifts never keep a purchaseDate (suggestions were
  //    pre-filled with the event date)
  const prefilled = { status: { $ne: 'purchased' }, purchaseDate: { $exists: true } };
  report.purchaseDatesCleared = await gifts.countDocuments(prefilled);
  if (apply && report.purchaseDatesCleared) await gifts.updateMany(prefilled, { $unset: { purchaseDate: '' } });

  // 6. Indexes: drop the counter-era gift index and the instance-wide unique
  //    name indexes (Phase-1 follow-ups), then build the current ones
  // Let Mongoose's background index builds finish: index commands on a
  // collection fail while one runs
  await Promise.allSettled([Gift.init(), EventType.init()]);
  report.indexes.giftsBudgetPrice = (await indexNames(gifts)).includes('budget_price');
  report.indexes.tagsName = (await indexNames(Tag.collection)).includes('name_1');
  report.indexes.eventTypesName = (await indexNames(EventType.collection)).includes('name_1');
  if (apply) {
    if (report.indexes.giftsBudgetPrice) await gifts.dropIndex('budget_price');
    if (report.indexes.eventTypesName) await EventType.collection.dropIndex('name_1');
    await dropLegacyTagNameIndex(); // drops tags.name_1 if present, then Tag.syncIndexes()
    // syncIndexes, not createIndexes: it matches indexes by keys, so one
    // MongoDB named automatically (recipient_1_event_1_isAISuggested_1) stays
    // as the model's ai_suggestions under its old name, and indexes on removed
    // fields (budgetStatus) go
    await Gift.syncIndexes();
    await EventType.syncIndexes();
  }

  // Every line carries the tag, so `grep money-migration` on the container log shows the whole report
  describeReport(report).forEach((line) => log(line.startsWith('[money-migration]') ? line : `[money-migration]${line}`));
  return report;
};

const hasWork = (report) =>
  report.pricesRounded > 0 ||
  report.purchaseDatesBackfilled > 0 ||
  report.purchaseDatesCleared > 0 ||
  Object.values(report.legacyFieldsRemoved).some((count) => count > 0) ||
  Object.values(report.indexes).some(Boolean);

// Boot hook: run once per database, after a backup. Never throws; on failure
// the server keeps running on the new code (which ignores legacy fields) and
// the migration is retried on the next boot.
const runPendingMigrations = async ({
  createBackup = backupService.createBackup,
  log = (line) => logger.info(line)
} = {}) => {
  try {
    const markers = mongoose.connection.db.collection('migrations');
    if (await markers.findOne({ _id: MIGRATION_ID })) return { skipped: true };

    const preview = await runMoneyModelMigration({ apply: false, createBackup, log: () => {} });
    const report = hasWork(preview)
      ? await runMoneyModelMigration({ apply: true, createBackup, log })
      : preview;
    await markers.insertOne({
      _id: MIGRATION_ID,
      appliedAt: new Date(),
      backup: report.backup,
      counts: {
        pricesRounded: report.pricesRounded,
        negativePrices: report.negativePrices.length,
        purchaseDatesBackfilled: report.purchaseDatesBackfilled,
        drift: report.drift.length,
        purchasedOnEventDate: report.purchasedOnEventDate.length,
        purchaseDatesCleared: report.purchaseDatesCleared,
        legacyFieldsRemoved: report.legacyFieldsRemoved
      }
    });
    return { skipped: false, report };
  } catch (error) {
    logger.error('[money-migration] failed; the server keeps running and retries on the next boot', {
      error: error.message,
      stack: error.stack
    });
    return { skipped: false, error };
  }
};

module.exports = { runMoneyModelMigration, runPendingMigrations, MIGRATION_ID };
