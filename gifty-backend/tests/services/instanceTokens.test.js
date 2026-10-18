const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-instance-tokens-${process.pid}`;
jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const tokens = require('../../services/instanceTokens');
const InstanceToken = require('../../models/InstanceToken');

jest.setTimeout(30000);
beforeAll(async () => { await mongoose.connect(TEST_DB_URI); await InstanceToken.syncIndexes(); });
afterAll(async () => { await teardownTestDB(); });
beforeEach(async () => { await InstanceToken.deleteMany({}); });

const admin = new mongoose.Types.ObjectId();

describe('instance tokens', () => {
  it('stores only a hash and builds the link from GIFTY_URL', async () => {
    process.env.GIFTY_URL = 'https://gifty.example.org/';
    const { token, invite } = await tokens.createInvite({ createdBy: admin });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await InstanceToken.findById(invite._id).lean();
    expect(stored.hash).toBe(tokens.hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(tokens.linkFor('invite', token)).toBe(`https://gifty.example.org/invite/${token}`);
    delete process.env.GIFTY_URL;
  });

  it('an invite lasts 7 days by default and 1 or 30 on request; anything else is refused', async () => {
    const day = 24 * 60 * 60 * 1000;
    const { invite } = await tokens.createInvite({ createdBy: admin });
    expect(invite.expiresAt - Date.now()).toBeGreaterThan(7 * day - 60000);
    await expect(tokens.createInvite({ createdBy: admin, days: 3 })).rejects.toThrow(/1, 7 or 30/);
  });

  it('inspect tells valid, used, expired and unknown apart', async () => {
    const { token } = await tokens.createInvite({ createdBy: admin });
    expect((await tokens.inspectToken('invite', token)).status).toBe('valid');
    expect((await tokens.inspectToken('reset', token)).status).toBe('unknown');
    await tokens.consumeToken('invite', token);
    expect((await tokens.inspectToken('invite', token)).status).toBe('used');
    const { token: old } = await tokens.createInvite({ createdBy: admin });
    await InstanceToken.updateOne({ hash: tokens.hashToken(old) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await tokens.inspectToken('invite', old)).status).toBe('expired');
    expect((await tokens.inspectToken('invite', 'nope')).status).toBe('unknown');
  });

  it('two people using one link at once: exactly one gets it', async () => {
    const { token } = await tokens.createInvite({ createdBy: admin });
    const results = await Promise.all([1, 2, 3].map(() => tokens.consumeToken('invite', token)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('release makes a consumed token usable again', async () => {
    const { token } = await tokens.createInvite({ createdBy: admin });
    const doc = await tokens.consumeToken('invite', token);
    await tokens.releaseToken(doc._id);
    expect((await tokens.inspectToken('invite', token)).status).toBe('valid');
  });

  it('a new reset link replaces the earlier ones for that account', async () => {
    const user = new mongoose.Types.ObjectId();
    const first = await tokens.createResetLink({ userId: user, createdBy: admin });
    const second = await tokens.createResetLink({ userId: user, createdBy: admin });
    expect((await tokens.inspectToken('reset', first.token)).status).toBe('unknown');
    expect((await tokens.inspectToken('reset', second.token)).status).toBe('valid');
    expect(second.expiresAt - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    await tokens.deleteResetLinksFor(user);
    expect((await tokens.inspectToken('reset', second.token)).status).toBe('unknown');
  });

  it('lists pending invites without their hash, and revokes only pending ones', async () => {
    const { invite } = await tokens.createInvite({ createdBy: admin, email: 'a@example.com' });
    const { token: usedToken } = await tokens.createInvite({ createdBy: admin });
    await tokens.consumeToken('invite', usedToken);
    const pending = await tokens.listPendingInvites();
    expect(pending).toHaveLength(1);
    expect(pending[0]).not.toHaveProperty('hash');
    expect(pending[0].email).toBe('a@example.com');
    expect(await tokens.revokeInvite(invite._id)).toBe(true);
    expect(await tokens.revokeInvite(invite._id)).toBe(false);
  });

  it('the model declares the unique hash and TTL indexes (a restore recreates them from it)', async () => {
    const indexes = InstanceToken.schema.indexes();
    expect(indexes).toEqual(expect.arrayContaining([
      [{ hash: 1 }, expect.objectContaining({ unique: true })],
      [{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 30 * 24 * 60 * 60 })]
    ]));
  });
});
