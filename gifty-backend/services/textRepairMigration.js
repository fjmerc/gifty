// One-off repair of text the removed xssMiddleware HTML-encoded before it was
// stored ("O&#39;Brien" back to "O'Brien"). The middleware only touched
// top-level strings and top-level arrays of strings in request bodies, so
// that is all this decodes; nested fields are left as stored.
//
// Unlike the money migration this must not run twice: text typed as "&lt;"
// after the upgrade is stored as typed, and a second run would decode it. A marker in `migrations` records the
// run before its first write, so it runs at most once per database.
const mongoose = require('mongoose');
const backupService = require('./backupService');
const { clearCache, keyPrefixes } = require('../middleware/cacheMiddleware');
const { decodeLegacyEntities } = require('../utils/legacyInputEncoding');
const logger = require('../utils/logger');

const MIGRATION_ID = 'decode-encoded-text-2026-10';
const ENCODED = /&(?:amp|lt|gt|quot|#39);/;
// Hashes and secrets are never decoded
const SKIP_FIELDS = new Set(['_id', 'password', 'appPassword', 'apiKey', 'accessToken', 'refreshToken']);

// Every model whose documents hold text users typed (or server text built from it)
const MODELS = () => [
  require('../models/User'),
  require('../models/Recipient'),
  require('../models/Event'),
  require('../models/EventType'),
  require('../models/Gift'),
  require('../models/GiftLibrary'),
  require('../models/Budget').Budget,
  require('../models/Budget').OverallBudget,
  require('../models/Tags'),
  require('../models/Vendor'),
  require('../models/Profile'),
  require('../models/FeedbackLog'),
  require('../models/Notification'),
  require('../models/EmailConfig'),
  require('../models/Integration')
];

// Edit forms sent stored (already encoded) text back and the filter encoded
// it again, so a value saved N times carries N layers ("O&amp;amp;#39;Brien").
// Decode until nothing changes. Cost (accepted): text typed literally as
// "&lt;" before the upgrade also becomes "<".
const decodeIfEncoded = (value) => {
  if (typeof value !== 'string') return value;
  let decoded = value;
  while (ENCODED.test(decoded)) decoded = decodeLegacyEntities(decoded);
  return decoded;
};

// The $set that repairs one document, or null when nothing in it is encoded
const repairFor = (doc) => {
  const set = {};
  for (const [field, value] of Object.entries(doc)) {
    if (SKIP_FIELDS.has(field)) continue;
    if (typeof value === 'string') {
      const decoded = decodeIfEncoded(value);
      if (decoded !== value) set[field] = decoded;
    } else if (Array.isArray(value) && value.some((item) => decodeIfEncoded(item) !== item)) {
      set[field] = value.map(decodeIfEncoded);
    }
  }
  return Object.keys(set).length ? set : null;
};

const markers = () => mongoose.connection.db.collection('migrations');

const describeReport = (report) => [
  `[text-repair] ${report.apply ? `APPLIED (backup: ${report.backup})` : 'DRY RUN, nothing was written'}`,
  ...Object.entries(report.collections)
    .filter(([, counts]) => counts.documents > 0)
    .map(([name, counts]) => `  ${name}: ${counts.documents} documents, ${counts.fields} fields decoded`),
  ...(report.documents === 0 ? ['  nothing was encoded'] : []),
  `  left as stored (decoding would duplicate a unique name): ${report.conflicts.map((c) => `${c.collection} ${c.id}`).join(', ') || 'none'}`,
  '  note: the old filter also deleted "javascript:", "data:" and "on…=" from text; those characters cannot be restored'
];

const runTextRepair = async ({
  apply = false,
  force = false,
  createBackup = backupService.createBackup,
  log = (line) => logger.info(line)
} = {}) => {
  const report = { apply, backup: null, documents: 0, collections: {}, conflicts: [] };

  if (apply) {
    const marker = await markers().findOne({ _id: MIGRATION_ID });
    if (marker && !force) {
      throw new Error(`The text repair has already run on this database (${marker.status}, backup ${marker.backup}). ` +
        'Running it again would decode text twice. Restore that backup first, then re-run with --apply --force.');
    }
    report.backup = (await createBackup()).backupName;
    await markers().replaceOne(
      { _id: MIGRATION_ID },
      { _id: MIGRATION_ID, status: 'in_progress', startedAt: new Date(), backup: report.backup },
      { upsert: true }
    );
  }

  for (const Model of MODELS()) {
    const collection = Model.collection;
    const counts = { documents: 0, fields: 0 };
    const ops = [];
    for await (const doc of collection.find()) {
      const set = repairFor(doc);
      if (!set) continue;
      counts.documents += 1;
      counts.fields += Object.keys(set).length;
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
    }
    report.collections[collection.collectionName] = counts;
    report.documents += counts.documents;

    if (apply && ops.length) {
      try {
        await collection.bulkWrite(ops, { ordered: false });
      } catch (error) {
        const writeErrors = error.writeErrors ? [].concat(error.writeErrors) : null;
        // Driver and write-concern failures arrive with an empty writeErrors list
        if (!writeErrors?.length || writeErrors.some((e) => e.code !== 11000)) throw error;
        for (const writeError of writeErrors) {
          report.conflicts.push({ collection: collection.collectionName, id: String(ops[writeError.index].updateOne.filter._id) });
        }
      }
    }
  }

  if (apply) {
    await markers().updateOne(
      { _id: MIGRATION_ID },
      { $set: { status: 'done', appliedAt: new Date(), counts: report.collections, conflicts: report.conflicts } }
    );
    // Cached GET responses still hold the encoded text
    await Promise.all(Object.values(keyPrefixes).map((prefix) => clearCache(prefix).catch(() => 0)));
  }

  // Every line carries the tag, so `grep text-repair` on the container log shows the whole report
  describeReport(report).forEach((line) => log(line.startsWith('[text-repair]') ? line : `[text-repair]${line}`));
  return report;
};

// Boot hook: run once per database, after a backup. Never throws. An
// interrupted run is never retried automatically (it could decode twice).
const runPendingTextRepair = async ({
  createBackup = backupService.createBackup,
  log = (line) => logger.info(line)
} = {}) => {
  try {
    const marker = await markers().findOne({ _id: MIGRATION_ID });
    if (marker?.status === 'in_progress') {
      logger.error(`[text-repair] a previous run was interrupted. Restore backup ${marker.backup}, then run ` +
        '`node scripts/repair-encoded-text.js --apply --force`. Until then some text may still show codes like &#39;.');
      return { skipped: true, interrupted: true };
    }
    if (marker) return { skipped: true };

    const preview = await runTextRepair({ apply: false, createBackup, log: () => {} });
    if (preview.documents === 0) {
      await markers().insertOne({ _id: MIGRATION_ID, status: 'done', appliedAt: new Date(), backup: null, counts: preview.collections });
      return { skipped: false, report: preview };
    }
    const report = await runTextRepair({ apply: true, createBackup, log });
    return { skipped: false, report };
  } catch (error) {
    logger.error('[text-repair] failed; the server keeps running', { error: error.message, stack: error.stack });
    return { skipped: false, error };
  }
};

module.exports = { runTextRepair, runPendingTextRepair, decodeIfEncoded, MIGRATION_ID };
