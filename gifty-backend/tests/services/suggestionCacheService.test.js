// Unit tests for the Redis-backed suggestion dedup cache. Mocks the
// redis client so no real Redis is needed.

jest.mock('../../config/redis', () => {
  const store = new Map();
  const versionStore = new Map();
  return {
    redisClient: {
      get: jest.fn(async (key) => store.get(key) || null),
      setex: jest.fn(async (key, ttl, value) => { store.set(key, value); return 'OK'; }),
      incr: jest.fn(async (key) => {
        const next = (versionStore.get(key) || 0) + 1;
        versionStore.set(key, next);
        store.set(key, String(next));
        return next;
      }),
    },
    keyPrefixes: { suggestions: 'gifty:suggestions:' },
    // Expose for test-side cleanup
    __mockStore: store,
    __mockVersions: versionStore,
  };
});

const suggestionCache = require('../../services/suggestionCacheService');
const redis = require('../../config/redis');

describe('suggestionCacheService', () => {
  beforeEach(() => {
    redis.__mockStore.clear();
    redis.__mockVersions.clear();
    delete process.env.AI_SUGGESTION_CACHE_ENABLED;
    jest.clearAllMocks();
  });

  const baseKey = {
    userId: 'u1', recipientId: 'r1', eventId: 'e1',
    mode: 'enhanced', provider: 'openai', model: 'gpt-4o',
  };

  it('returns null on a cold cache', async () => {
    const v = await suggestionCache.get(baseKey);
    expect(v).toBeNull();
  });

  it('stores and retrieves the same payload', async () => {
    const payload = { suggestions: [{ name: 'Hiking Daypack' }] };
    await suggestionCache.set(baseKey, payload);
    const fetched = await suggestionCache.get(baseKey);
    expect(fetched).toEqual(payload);
  });

  it('treats different modes as distinct cache entries', async () => {
    await suggestionCache.set({ ...baseKey, mode: 'basic' }, { suggestions: ['basic'] });
    await suggestionCache.set({ ...baseKey, mode: 'enhanced' }, { suggestions: ['enhanced'] });
    const a = await suggestionCache.get({ ...baseKey, mode: 'basic' });
    const b = await suggestionCache.get({ ...baseKey, mode: 'enhanced' });
    expect(a.suggestions[0]).toBe('basic');
    expect(b.suggestions[0]).toBe('enhanced');
  });

  it('treats different providers/models as distinct cache entries', async () => {
    await suggestionCache.set({ ...baseKey, provider: 'openai' }, { suggestions: ['oai'] });
    await suggestionCache.set({ ...baseKey, provider: 'anthropic' }, { suggestions: ['ant'] });
    const a = await suggestionCache.get({ ...baseKey, provider: 'openai' });
    const b = await suggestionCache.get({ ...baseKey, provider: 'anthropic' });
    expect(a.suggestions[0]).toBe('oai');
    expect(b.suggestions[0]).toBe('ant');
  });

  it('treats different versions as distinct cache entries', async () => {
    await suggestionCache.set({ ...baseKey, version: '0' }, { suggestions: ['pre-feedback'] });
    const stale = await suggestionCache.get({ ...baseKey, version: '1' });
    expect(stale).toBeNull();
    const fresh = await suggestionCache.get({ ...baseKey, version: '0' });
    expect(fresh.suggestions[0]).toBe('pre-feedback');
  });

  it('invalidation bumps version so subsequent keys differ', async () => {
    const v0 = await suggestionCache.getVersion('u1', 'r1');
    expect(v0).toBe('0');
    await suggestionCache.invalidateForRecipient('u1', 'r1');
    const v1 = await suggestionCache.getVersion('u1', 'r1');
    expect(parseInt(v1, 10)).toBeGreaterThan(0);
  });

  it('honors AI_SUGGESTION_CACHE_ENABLED=false', async () => {
    jest.resetModules();
    process.env.AI_SUGGESTION_CACHE_ENABLED = 'false';
    const disabledCache = require('../../services/suggestionCacheService');
    await disabledCache.set(baseKey, { suggestions: ['x'] });
    const v = await disabledCache.get(baseKey);
    expect(v).toBeNull();
  });

  it('fails open when redis throws', async () => {
    redis.redisClient.get.mockRejectedValueOnce(new Error('boom'));
    const v = await suggestionCache.get(baseKey);
    expect(v).toBeNull(); // not an exception
  });
});
