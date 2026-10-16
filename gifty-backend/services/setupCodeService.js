// First-run setup code. The first account on an instance becomes its owner
// (instance backups and restore), so on an instance with no accounts the
// first registration needs a one-time code that only someone with access to
// the server log or the data folder can read. Only a hash is kept in the
// database; the plaintext goes to the log once and to <DATA_DIR>/setup-code.txt
// (mode 0600), which is deleted once the first account exists.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('../utils/logger');
const runtime = require('../config/runtime');

const DOC_ID = 'setup-code';
const COLLECTION = 'instance';
const FILE_NAME = 'setup-code.txt';
// No 0/O, 1/I/L: the code is read from a log and typed by hand
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const codeFile = () => path.join(runtime.DATA_DIR, FILE_NAME);
const collection = () => mongoose.connection.db.collection(COLLECTION);
const normalise = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashOf = (code) => crypto.createHash('sha256').update(normalise(code)).digest('hex');

// 16 characters from 31 (~79 bits), in groups of four
const newCode = () => Array.from({ length: 4 }, () =>
  Array.from({ length: 4 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')).join('-');

const isSetupRequired = async () => !(await User.exists({}));

const removeFile = () => {
  try {
    fs.unlinkSync(codeFile());
  } catch (err) {
    if (err.code !== 'ENOENT') logger.error(`Could not delete ${codeFile()}: ${err.message}`);
  }
};

// Forget the code (the first account exists)
const clearSetupCode = async () => {
  await collection().deleteOne({ _id: DOC_ID });
  removeFile();
};

// A fresh code: replaces any earlier one, logged once and written to the data folder
const generateSetupCode = async () => {
  const code = newCode();
  await collection().updateOne(
    { _id: DOC_ID },
    { $set: { hash: hashOf(code), createdAt: new Date() } },
    { upsert: true }
  );
  const url = `${runtime.getPublicUrl()}/register`;
  try {
    fs.mkdirSync(runtime.DATA_DIR, { recursive: true });
    fs.writeFileSync(codeFile(), `Setup code: ${code}\n\nOpen ${url} and enter this code to create the first account (the instance owner).\nThis file is deleted once that account exists.\n`, { mode: 0o600 });
    fs.chmodSync(codeFile(), 0o600);
  } catch (err) {
    logger.error(`Could not write ${codeFile()}: ${err.message}`);
  }
  logger.warn(`No accounts yet. Open ${url} and enter setup code ${code} to create the first account (the instance owner). The code is also in ${codeFile()}.`);
  return code;
};

// Boot: a new code while there are no accounts; otherwise no code at all
const ensureSetupCode = async () => {
  if (await isSetupRequired()) {
    await generateSetupCode();
    return { required: true };
  }
  if ((await collection().countDocuments({ _id: DOC_ID })) > 0 || fs.existsSync(codeFile())) {
    await clearSetupCode();
  }
  return { required: false };
};

const verifySetupCode = async (code) => {
  // Test suites register on empty databases with a known code
  if (process.env.NODE_ENV === 'test' && process.env.SETUP_CODE && normalise(code) === normalise(process.env.SETUP_CODE)) {
    return true;
  }
  const stored = await collection().findOne({ _id: DOC_ID });
  if (!stored) {
    // A racing first registration already created the first account (and
    // cleared the code): no new code then
    if (!(await isSetupRequired())) return false;
    // The accounts went away while the server ran (e.g. a database wipe)
    await generateSetupCode();
    return false;
  }
  if (!normalise(code)) return false;
  return crypto.timingSafeEqual(Buffer.from(hashOf(code), 'hex'), Buffer.from(stored.hash, 'hex'));
};

module.exports = { isSetupRequired, ensureSetupCode, generateSetupCode, verifySetupCode, clearSetupCode, FILE_NAME };
