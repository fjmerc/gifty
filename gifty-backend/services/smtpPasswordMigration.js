// Startup: SMTP passwords stored in plaintext (rawPassword) before they
// were encrypted get encrypted, and the unused bcrypt copy (password) is
// dropped. Idempotent and safe to interrupt: a row is rewritten only while
// it still holds the plaintext that was read, and encrypted rows are never
// touched (so a database restored from another server, under another key,
// doesn't stop the boot; those rows ask for the password again on use).
const EmailConfig = require('../models/EmailConfig');
const { encryptSecret, PREFIX } = require('../utils/secretBox');
const logger = require('../utils/logger');

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const encryptStoredSmtpPasswords = async () => {
  const coll = EmailConfig.collection;
  let encrypted = 0;
  const plainRows = coll.find(
    { rawPassword: { $type: 'string', $not: new RegExp(`^${escapeRegex(PREFIX)}`) } },
    { projection: { rawPassword: 1 } }
  );
  for await (const row of plainRows) {
    const result = await coll.updateOne(
      { _id: row._id, rawPassword: row.rawPassword },
      { $set: { rawPassword: encryptSecret(row.rawPassword) } }
    );
    encrypted += result.modifiedCount;
  }
  const dropped = (await coll.updateMany({ password: { $exists: true } }, { $unset: { password: '' } })).modifiedCount;
  if (encrypted || dropped) logger.info(`SMTP passwords: encrypted ${encrypted}, removed ${dropped} unused hashed copies`);
  return { encrypted, dropped };
};

module.exports = { encryptStoredSmtpPasswords };
