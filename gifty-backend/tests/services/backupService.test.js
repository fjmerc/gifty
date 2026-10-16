const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { setupTestDB, teardownTestDB } = require('../utils/testSetup');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gifty-backup-test-'));
process.env.DATA_DIR = tmp;
process.env.BACKUP_DIR = '';

const backupService = require('../../services/backupService');
const User = require('../../models/User');
const { UPLOADS_DIR, DATA_DIR } = require('../../config/runtime');

describe('backupService (real Mongo)', () => {
  beforeAll(async () => {
    await setupTestDB();
    await User.syncIndexes();
  });
  afterAll(async () => {
    await teardownTestDB();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('round-trips data, types, uploads and unique indexes; drops post-backup changes', async () => {
    const db = mongoose.connection.db;
    const createdAt = new Date('2024-12-24T10:00:00Z');
    const { insertedId } = await db.collection('recipients').insertOne({ firstName: 'Maya', createdAt });
    await User.create({ username: 'alice', email: 'alice@example.com', password: 'Passw0rd!', firstName: 'A', lastName: 'L' });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, 'pic.jpg'), 'img');
    fs.writeFileSync(path.join(DATA_DIR, 'secrets.json'), '{"JWT_SECRET":"x"}');

    const indexKeys = async () => {
      const out = {};
      for (const { name } of await db.listCollections().toArray()) {
        out[name] = (await db.collection(name).indexes()).map((i) => JSON.stringify(i.key)).sort();
      }
      return out;
    };
    const indexesBefore = await indexKeys();

    const { backupName } = await backupService.createBackup();
    expect(backupName).toMatch(/^gifty-backup-\d{8}-\d{6}\.tar\.gz$/);

    // Changes after the backup must not survive restore
    await db.collection('recipients').insertOne({ firstName: 'Later' });
    await db.collection('scratch').insertOne({ x: 1 });
    fs.rmSync(path.join(UPLOADS_DIR, 'pic.jpg'));

    await backupService.restoreBackup(backupName);

    const recipients = await db.collection('recipients').find().toArray();
    expect(recipients).toHaveLength(1);
    expect(recipients[0]._id.equals(insertedId)).toBe(true);
    expect(recipients[0].createdAt).toBeInstanceOf(Date);
    expect(recipients[0].createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(await db.listCollections({ name: 'scratch' }).toArray()).toHaveLength(0);
    expect(fs.readFileSync(path.join(UPLOADS_DIR, 'pic.jpg'), 'utf8')).toBe('img');

    // Every index that existed at backup time exists again after restore
    const indexesAfter = await indexKeys();
    for (const [name, keys] of Object.entries(indexesBefore)) {
      if (name === 'scratch') continue;
      // Superset: restore also (re)creates indexes the Mongoose models define
      expect(indexesAfter[name]).toEqual(expect.arrayContaining(keys));
    }

    // Unique index on email must be enforced again after restore
    await expect(db.collection('users').insertOne({ username: 'dup', email: 'alice@example.com' }))
      .rejects.toThrow(/duplicate key/);
  });

  it('never puts secrets.json in the archive', async () => {
    const tar = require('tar');
    const { backupPath } = await backupService.createBackup();
    const entries = [];
    await tar.t({ file: backupPath, onentry: (e) => entries.push(e.path) });
    expect(entries.some((p) => p.includes('secrets.json'))).toBe(false);
    expect(entries).toContain('manifest.json');
  });

  it('lists only tarball backups (ignores legacy mongodump dirs), newest first', async () => {
    fs.mkdirSync(path.join(backupService.BACKUP_DIR, 'gifty-backup-2024-01-01'), { recursive: true });
    const list = await backupService.listBackups();
    expect(list.every((b) => b.name.endsWith('.tar.gz'))).toBe(true);
    const names = list.map((b) => b.name);
    expect([...names].sort().reverse()).toEqual(names);
  });

  it('prunes to the newest N', async () => {
    for (const ts of ['20200101-000000', '20200102-000000', '20200103-000000']) {
      fs.writeFileSync(path.join(backupService.BACKUP_DIR, `gifty-backup-${ts}.tar.gz`), '');
    }
    await backupService.pruneBackups(2);
    const remaining = (await backupService.listBackups()).map((b) => b.name);
    expect(remaining).toHaveLength(2);
    expect(remaining).not.toContain('gifty-backup-20200101-000000.tar.gz');
  });

  it.each(['../etc/passwd', '..', 'a/b', 'x;rm -rf /', '..%2Fsecrets.json'])('rejects unsafe name %s', (name) => {
    expect(() => backupService.resolveBackupPath(backupService.BACKUP_DIR, name)).toThrow(/not found/);
  });

  it('refuses an archive without a manifest', async () => {
    const tar = require('tar');
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'bad-'));
    fs.writeFileSync(path.join(staging, 'users.ejson'), '');
    const name = 'gifty-backup-20000101-000000.tar.gz';
    await tar.c({ gzip: true, file: path.join(backupService.BACKUP_DIR, name), cwd: staging }, ['users.ejson']);
    await expect(backupService.restoreBackup(name)).rejects.toThrow(/manifest/);
  });

  it('leaves existing data untouched when the archive has a corrupt collection file', async () => {
    const tar = require('tar');
    const db = mongoose.connection.db;
    await db.collection('keepme').insertOne({ precious: true });

    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'corrupt-'));
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({ collections: { users: 1, recipients: 1 } }));
    fs.writeFileSync(path.join(staging, 'users.ejson'), '{"_id":{"$oid":"5f1d7f1d7f1d7f1d7f1d7f1d"},"email":"x@y.z"}\n');
    fs.writeFileSync(path.join(staging, 'recipients.ejson'), '{not json\n');
    const name = 'gifty-backup-20000102-000000.tar.gz';
    await tar.c({ gzip: true, file: path.join(backupService.BACKUP_DIR, name), cwd: staging }, ['manifest.json', 'users.ejson', 'recipients.ejson']);

    await expect(backupService.restoreBackup(name)).rejects.toThrow(/recipients/);
    expect(await db.collection('keepme').countDocuments()).toBe(1);
  });

  it('restores an older archive that still holds gift reviews, leaving the reviews out', async () => {
    const tar = require('tar');
    const db = mongoose.connection.db;
    const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'reviews-'));
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({ collections: { users: 1, reviews: 1 } }));
    fs.writeFileSync(path.join(staging, 'users.ejson'), '{"_id":{"$oid":"5f1d7f1d7f1d7f1d7f1d7f1e"},"email":"old@example.com"}\n');
    fs.writeFileSync(path.join(staging, 'reviews.ejson'), '{"_id":{"$oid":"5f1d7f1d7f1d7f1d7f1d7f1f"},"rating":3,"reviewText":"ok"}\n');
    const name = 'gifty-backup-20000103-000000.tar.gz';
    fs.mkdirSync(backupService.BACKUP_DIR, { recursive: true });
    await tar.c({ gzip: true, file: path.join(backupService.BACKUP_DIR, name), cwd: staging }, ['manifest.json', 'users.ejson', 'reviews.ejson']);

    const result = await backupService.restoreBackup(name);

    expect(result.collections).toEqual({ users: 1 });
    expect(await db.collection('users').countDocuments({ email: 'old@example.com' })).toBe(1);
    expect(await db.listCollections({ name: 'reviews' }).toArray()).toHaveLength(0);
  });

  it('backs up and restores an install that still has gift reviews, leaving the reviews out', async () => {
    const db = mongoose.connection.db;
    await db.collection('reviews').insertOne({ user: new mongoose.Types.ObjectId(), rating: 5 });
    await db.collection('recipients').insertOne({ firstName: 'Kept' });

    const { backupName } = await backupService.createBackup();
    const result = await backupService.restoreBackup(backupName);

    expect(result.collections).not.toHaveProperty('reviews');
    expect(await db.collection('recipients').countDocuments({ firstName: 'Kept' })).toBe(1);
    expect(await db.listCollections({ name: 'reviews' }).toArray()).toHaveLength(0);
  });

  it('takes a safety backup before overwriting the database', async () => {
    const { backupName } = await backupService.createBackup();
    const before = (await backupService.listBackups()).length;
    const result = await backupService.restoreBackup(backupName);
    const after = await backupService.listBackups();
    expect(after.length).toBe(before + 1);
    expect(result.safetyBackup).toMatch(/^gifty-backup-.*\.tar\.gz$/);
    expect(after.map((b) => b.name)).toContain(result.safetyBackup);
  });

  it('keeps the backup dir and archives private to the app user', async () => {
    const { backupPath } = await backupService.createBackup();
    expect(fs.statSync(backupService.BACKUP_DIR).mode & 0o777).toBe(0o700);
    expect(fs.statSync(backupPath).mode & 0o777).toBe(0o600);
  });

  it('treats legacy directories and non-backup files as not found (restore and delete)', async () => {
    fs.mkdirSync(path.join(backupService.BACKUP_DIR, 'gifty-backup-20250101-000000'), { recursive: true });
    fs.writeFileSync(path.join(backupService.BACKUP_DIR, 'notes.txt'), 'keep me');
    await expect(backupService.restoreBackup('gifty-backup-20250101-000000')).rejects.toThrow(/not found/);
    await expect(backupService.deleteBackup('gifty-backup-20250101-000000')).rejects.toThrow(/not found/);
    await expect(backupService.deleteBackup('notes.txt')).rejects.toThrow(/not found/);
    expect(fs.existsSync(path.join(backupService.BACKUP_DIR, 'notes.txt'))).toBe(true);
  });

  it('rejects (instead of crashing the process) when writing a dump fails, e.g. disk full', async () => {
    const { PassThrough } = require('stream');
    const real = fs.createWriteStream;
    const spy = jest.spyOn(fs, 'createWriteStream').mockImplementation((file, opts) => {
      if (String(file).endsWith('.ejson')) {
        const s = new PassThrough();
        s.write = () => { process.nextTick(() => s.emit('error', Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }))); return true; };
        return s;
      }
      return real(file, opts);
    });
    await mongoose.connection.db.collection('recipients').insertOne({ firstName: 'Disk' });
    await expect(backupService.createBackup()).rejects.toThrow(/ENOSPC/);
    spy.mockRestore();
  });
});
