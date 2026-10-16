const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const readline = require('readline');
const { once } = require('events');
const mongoose = require('mongoose');
const tar = require('tar');
const { EJSON } = require('bson');
const logger = require('../utils/logger');
const { RETIRED_COLLECTIONS } = require('./retiredCollections');
const { BACKUP_DIR, UPLOADS_DIR, getVersion } = require('../config/runtime');

const NAME_RE = /^gifty-backup-(\d{8}-\d{6})\.tar\.gz$/;
const BATCH = 1000;

// Backup names come from route params; reject anything that could escape the
// backup directory (path traversal) or smuggle shell metacharacters
const resolveBackupPath = (backupDirAbsPath, backupName) => {
  // Only names this service creates are addressable: no traversal, no
  // legacy mongodump directories, no other files that live in BACKUP_DIR
  if (typeof backupName !== 'string' || !NAME_RE.test(backupName)) {
    throw new Error(`Backup '${backupName}' not found.`);
  }
  return path.join(backupDirAbsPath, backupName);
};

const existingBackupFile = (dir, backupName) => {
  const file = resolveBackupPath(dir, backupName);
  let stats;
  try { stats = fs.statSync(file); } catch { stats = null; }
  if (!stats || !stats.isFile()) throw new Error(`Backup '${backupName}' not found.`);
  return file;
};

// Archives contain password hashes: keep the dir and files owner-only
const ensureBackupDirExists = async () => {
  await fsp.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  await fsp.chmod(BACKUP_DIR, 0o700);
  return BACKUP_DIR;
};

const timestamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const userCollections = async (db) =>
  (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'));

const dumpCollection = async (db, name, file) => {
  const out = fs.createWriteStream(file);
  // A write error (e.g. ENOSPC) must fail this backup, not crash the server
  let streamError = null;
  out.on('error', (err) => { streamError = err; });
  const failed = new Promise((resolve, reject) => out.once('error', reject));
  failed.catch(() => {});

  let count = 0;
  for await (const doc of db.collection(name).find()) {
    if (streamError) throw streamError;
    if (!out.write(EJSON.stringify(doc, { relaxed: false }) + '\n')) {
      await Promise.race([once(out, 'drain'), failed]);
    }
    count += 1;
  }
  await Promise.race([new Promise((resolve) => out.end(resolve)), failed]);
  await new Promise((resolve) => setImmediate(resolve));
  if (streamError) throw streamError;
  return count;
};

const createBackup = async () => {
  const dir = await ensureBackupDirExists();
  const db = mongoose.connection.db;
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'gifty-backup-'));
  try {
    const counts = {};
    for (const name of await userCollections(db)) {
      counts[name] = await dumpCollection(db, name, path.join(staging, `${name}.ejson`));
    }
    const entries = Object.keys(counts).map((n) => `${n}.ejson`);
    if (fs.existsSync(UPLOADS_DIR)) {
      await fsp.cp(UPLOADS_DIR, path.join(staging, 'uploads'), { recursive: true });
      entries.push('uploads');
    }
    const manifest = { gifty_version: getVersion(), created_at: new Date().toISOString(), collections: counts };
    await fsp.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2));
    entries.unshift('manifest.json');

    let backupName = `gifty-backup-${timestamp()}.tar.gz`;
    // Two backups in the same second (e.g. manual + scheduled) must not overwrite
    for (let i = 1; fs.existsSync(path.join(dir, backupName)); i += 1) {
      backupName = `gifty-backup-${timestamp(new Date(Date.now() + i * 1000))}.tar.gz`;
    }
    const backupPath = path.join(dir, backupName);
    // Open the archive 0600 from the start so it is never briefly world-readable
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(backupPath, { mode: 0o600, flags: 'wx' });
      out.on('error', reject).on('finish', resolve);
      tar.c({ gzip: true, cwd: staging }, entries).on('error', reject).pipe(out);
    });
    logger.info(`Backup created: ${backupName}`, { collections: counts });
    return { backupName, backupPath };
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
};

const listBackups = async () => {
  const dir = await ensureBackupDirExists();
  const backups = [];
  for (const file of await fsp.readdir(dir)) {
    const match = file.match(NAME_RE);
    if (!match) continue;
    const stats = await fsp.stat(path.join(dir, file));
    if (!stats.isFile()) continue;
    backups.push({ name: file, timestamp: match[1], createdAt: stats.mtime, size: stats.size });
  }
  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return backups;
};

const registerAllModels = () => {
  const modelsDir = path.join(__dirname, '..', 'models');
  for (const f of fs.readdirSync(modelsDir)) {
    if (f.endsWith('.js')) require(path.join(modelsDir, f));
  }
};

// Parse every line up front so a corrupt archive is rejected before anything
// in the live database is dropped.
const validateCollectionFile = async (name, file) => {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo += 1;
    if (!line.trim()) continue;
    try {
      EJSON.parse(line, { relaxed: false });
    } catch (err) {
      rl.close();
      throw new Error(`Backup file ${name}.ejson is corrupt at line ${lineNo}; nothing was restored.`);
    }
  }
};

const restoreCollection = async (db, name, file) => {
  const coll = db.collection(name);
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let batch = [];
  let count = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(EJSON.parse(line, { relaxed: false }));
    if (batch.length >= BATCH) {
      await coll.insertMany(batch, { ordered: false });
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await coll.insertMany(batch, { ordered: false });
    count += batch.length;
  }
  return count;
};

const restoreBackup = async (backupName) => {
  const dir = await ensureBackupDirExists();
  const file = existingBackupFile(dir, backupName);

  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'gifty-restore-'));
  try {
    await tar.x({ file, cwd: staging });
    let manifest;
    try {
      manifest = JSON.parse(await fsp.readFile(path.join(staging, 'manifest.json'), 'utf8'));
    } catch {
      throw new Error(`Backup '${backupName}' has a missing or unreadable manifest; refusing to restore.`);
    }
    if (!manifest || typeof manifest.collections !== 'object') {
      throw new Error(`Backup '${backupName}' manifest is invalid; refusing to restore.`);
    }

    const retired = Object.keys(manifest.collections).filter((name) => RETIRED_COLLECTIONS.has(name));
    if (retired.length) logger.info(`Backup '${backupName}' holds retired collections, left out: ${retired.join(', ')}`);
    const collectionNames = Object.keys(manifest.collections).filter((name) => !RETIRED_COLLECTIONS.has(name));
    for (const name of collectionNames) {
      const ejsonFile = path.join(staging, `${name}.ejson`);
      if (!fs.existsSync(ejsonFile)) throw new Error(`Backup '${backupName}' is missing ${name}.ejson; nothing was restored.`);
      await validateCollectionFile(name, ejsonFile);
    }

    // Safety net: if inserting fails part-way, the pre-restore state survives
    const { backupName: safetyBackup } = await createBackup();
    logger.warn(`Pre-restore safety backup created: ${safetyBackup}`);

    const db = mongoose.connection.db;
    // Full restore: anything not in the archive goes away
    for (const name of await userCollections(db)) {
      await db.collection(name).drop();
    }
    const restored = {};
    for (const name of collectionNames) {
      restored[name] = await restoreCollection(db, name, path.join(staging, `${name}.ejson`));
    }

    const uploads = path.join(staging, 'uploads');
    if (fs.existsSync(uploads)) {
      await fsp.rm(UPLOADS_DIR, { recursive: true, force: true });
      await fsp.cp(uploads, UPLOADS_DIR, { recursive: true });
    }

    // Dropping collections dropped their indexes; inserts don't recreate them
    registerAllModels();
    for (const modelName of mongoose.modelNames()) {
      await mongoose.model(modelName).syncIndexes();
    }

    logger.warn(`Database restored from ${backupName}`, { collections: restored });
    return { collections: restored, safetyBackup };
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
};

const deleteBackup = async (backupName) => {
  const dir = await ensureBackupDirExists();
  const file = existingBackupFile(dir, backupName);
  await fsp.rm(file, { force: true });
  logger.info(`Backup deleted: ${backupName}`);
  return { message: `Backup '${backupName}' deleted successfully` };
};

const pruneBackups = async (keep) => {
  const backups = await listBackups();
  const doomed = backups.slice(keep).map((b) => b.name);
  for (const name of doomed) await deleteBackup(name);
  return doomed;
};

const runScheduledBackup = async () => {
  const keep = parseInt(process.env.BACKUP_KEEP ?? '7', 10);
  if (!Number.isFinite(keep) || keep <= 0) return;
  await createBackup();
  await pruneBackups(keep);
};

module.exports = {
  BACKUP_DIR,
  resolveBackupPath,
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  pruneBackups,
  runScheduledBackup
};
