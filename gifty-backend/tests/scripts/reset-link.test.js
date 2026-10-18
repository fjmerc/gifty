// The server command prints a reset link for any account, the owner's too.
// Run as a child process against a test database: it must exit by itself.
const { execFile } = require('child_process');
const path = require('path');
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-reset-link-${process.pid}`;
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'reset-link.js');
const User = require('../../models/User');
const InstanceToken = require('../../models/InstanceToken');
const { hashToken } = require('../../services/instanceTokens');

jest.setTimeout(30000);

const run = (args) => new Promise((resolve) => {
  execFile(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, MONGO_URI: TEST_DB_URI, NODE_ENV: 'test', GIFTY_URL: 'https://gifty.example.org' },
    timeout: 20000
  }, (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, killed: Boolean(error?.killed), stdout, stderr }));
});

beforeAll(async () => { await mongoose.connect(TEST_DB_URI); });
afterAll(async () => { await teardownTestDB(); });
beforeEach(async () => {
  await User.deleteMany({});
  await InstanceToken.deleteMany({});
  await User.create({ username: 'boss', email: 'boss@example.com', password: 'x', firstName: 'B', lastName: 'B', role: 'admin' });
});

it('prints a working link and exits', async () => {
  const { code, killed, stdout } = await run(['Boss@Example.com']);
  expect(killed).toBe(false);
  expect(code).toBe(0);
  const link = stdout.match(/https:\/\/gifty\.example\.org\/reset\/(\S+)/);
  expect(link).not.toBeNull();
  expect(await InstanceToken.exists({ type: 'reset', hash: hashToken(link[1]), createdBy: null })).toBeTruthy();
});

it('refuses an unknown email, a missing argument and a deactivated account', async () => {
  expect((await run(['nobody@example.com'])).code).toBe(1);
  expect((await run([])).code).toBe(1);
  await User.updateOne({ username: 'boss' }, { $set: { active: false } });
  const res = await run(['boss@example.com']);
  expect(res.code).toBe(1);
  expect(res.stderr).toMatch(/deactivated/);
});

it('finds a gmail account by the address as typed (stored normalised)', async () => {
  await User.create({ username: 'jane', email: 'janedoe@gmail.com', password: 'x', firstName: 'J', lastName: 'D' });
  const { code, stdout } = await run(['Jane.Doe@gmail.com']);
  expect(code).toBe(0);
  expect(stdout).toMatch(/\/reset\//);
});
