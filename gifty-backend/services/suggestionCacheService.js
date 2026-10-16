/**
 * Redis-backed dedup cache for AI suggestion requests.
 *
 * Why: the AI call is the most expensive piece of the suggestion path.
 * If the same {user, recipient, event, mode, provider, model} is asked
 * twice within a few minutes (frontend retry, page reload, double-
 * click), we shouldn't pay the LLM twice. A short TTL keeps things
 * fresh enough that recently rated gifts still influence the next call.
 *
 * The cache fails open: any Redis error logs a warning and returns null
 * so the caller falls through to a real generation. We never block the
 * user on cache health.
 */

const crypto = require('crypto');
const { redisClient, keyPrefixes } = require('../config/redis');
const logger = require('../utils/logger');

const DEFAULT_TTL_SECONDS = parseInt(process.env.AI_SUGGESTION_CACHE_TTL, 10) || 300;
const CACHE_ENABLED = process.env.AI_SUGGESTION_CACHE_ENABLED !== 'false';
const PREFIX = `${keyPrefixes.suggestions}input:`;

function buildKey({ userId, recipientId, eventId, mode, provider, model, version }) {
  // Stable string → hash. Mode/provider/model are part of the key so a
  // user switching from Basic to Enhanced (or OpenAI to Claude) gets a
  // fresh generation rather than the cached Basic output. The version
  // is bumped by invalidateForRecipient() so post-feedback requests
  // miss the pre-feedback entry.
  const payload = [userId, recipientId, eventId, mode || 'default', provider || 'default', model || 'default', version || '0'].join('|');
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
  return `${PREFIX}${hash}`;
}

async function get(keyParts) {
  if (!CACHE_ENABLED) return null;
  try {
    const cached = await redisClient.get(buildKey(keyParts));
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    logger.info(`[suggestionCache] HIT for user=${keyParts.userId} recipient=${keyParts.recipientId}`);
    return parsed;
  } catch (err) {
    logger.warn('[suggestionCache] Redis read failed, falling through:', err.message);
    return null;
  }
}

async function set(keyParts, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!CACHE_ENABLED) return;
  try {
    await redisClient.setex(buildKey(keyParts), ttlSeconds, JSON.stringify(value));
    logger.debug(`[suggestionCache] STORED user=${keyParts.userId} ttl=${ttlSeconds}s`);
  } catch (err) {
    logger.warn('[suggestionCache] Redis write failed:', err.message);
  }
}

/**
 * Invalidate every cached suggestion for a user-recipient pair. Call
 * this when feedback is recorded — the next cached generation would
 * otherwise still reflect pre-feedback signals.
 */
async function invalidateForRecipient(userId, recipientId) {
  if (!CACHE_ENABLED || !userId || !recipientId) return;
  // We can't scan keys cheaply without SCAN. Simpler approach: store an
  // invalidation version per user+recipient and include it in the key.
  // That keeps writes O(1) and avoids scanning. Implemented via a
  // version key that we bump on invalidation.
  try {
    const versionKey = `${PREFIX}ver:${userId}:${recipientId}`;
    await redisClient.incr(versionKey);
  } catch (err) {
    logger.warn('[suggestionCache] Version bump failed:', err.message);
  }
}

/**
 * Look up the current invalidation version for a user-recipient pair
 * so it can be folded into the cache key. Returns '0' if Redis is
 * unavailable so caching still works (just won't auto-invalidate).
 */
async function getVersion(userId, recipientId) {
  if (!CACHE_ENABLED) return '0';
  try {
    const v = await redisClient.get(`${PREFIX}ver:${userId}:${recipientId}`);
    return v || '0';
  } catch {
    return '0';
  }
}

module.exports = { get, set, invalidateForRecipient, getVersion, buildKey };
