/**
 * Facade for AI completion across multiple providers.
 *
 * Callers (aiService, enhancedAiService) build prompts and invoke
 * `complete()` here without caring which provider runs them. The user
 * preference / explicit request decides which provider+model to use;
 * if that provider fails (auth, rate limit, outage), we cascade to a
 * fallback chain so a single bad key doesn't break the feature.
 */

const modelRegistry = require('./modelRegistry');
const openaiProvider = require('./providers/openaiProvider');
const anthropicProvider = require('./providers/anthropicProvider');
const geminiProvider = require('./providers/geminiProvider');

// Lazy-require so tests that don't touch Mongo don't blow up on connect.
let SuggestionMetric = null;
const getMetricModel = () => {
  if (SuggestionMetric === null) {
    try {
      SuggestionMetric = require('../../models/SuggestionMetric');
    } catch (e) {
      SuggestionMetric = false; // remember the failure
    }
  }
  return SuggestionMetric || null;
};

/**
 * Fire-and-forget telemetry write. Never throws. Caller passes the
 * fully-resolved metric document. If the model can't be loaded (e.g.,
 * pre-Mongo init) or the write fails, we silently drop the metric —
 * losing telemetry is preferable to breaking the user's request.
 */
function recordMetric(metric) {
  const Model = getMetricModel();
  if (!Model) return;
  Model.create(metric).catch(() => {});
}

const PROVIDERS = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
};

/**
 * Build the failover chain for a request. Starts with the requested
 * provider, then walks through other configured providers as backup.
 * Returns at least one entry — the requested provider — even if not
 * configured, so callers see the original failure reason rather than
 * a generic "no provider configured" error.
 */
function buildFailoverChain({ provider, model, mode }) {
  const resolved = modelRegistry.resolveProviderAndModel({ provider, model, mode });
  const chain = [resolved];

  // Add other configured providers as fallbacks. Pick each fallback's
  // recommended model for this mode rather than a hard-coded default.
  const fallbackOrder = ['openai', 'anthropic', 'gemini'];
  for (const fbId of fallbackOrder) {
    if (fbId === resolved.provider) continue;
    const fb = modelRegistry.getProvider(fbId);
    if (!fb || !fb.isConfigured()) continue;
    chain.push(modelRegistry.resolveProviderAndModel({ provider: fbId, mode }));
  }
  return chain;
}

/**
 * Execute a completion request. Returns the first successful response;
 * if every provider in the chain fails, re-throws the most recent error
 * annotated with the chain attempted.
 */
async function complete(request) {
  const { provider, model, mode, failover = true, telemetry = {}, ...rest } = request;

  const chain = failover
    ? buildFailoverChain({ provider, model, mode })
    : [{ provider: provider || modelRegistry.DEFAULT_PROVIDER, model }];

  let lastError = null;
  const attempts = [];
  const start = Date.now();

  for (const step of chain) {
    const impl = PROVIDERS[step.provider];
    if (!impl) {
      lastError = new Error(`Unknown provider: ${step.provider}`);
      attempts.push({ ...step, message: lastError.message });
      continue;
    }
    try {
      const result = await impl.complete({ ...rest, model: step.model });
      result.attempts = attempts;
      // Successful call — record latency + tokens + which provider
      // actually answered (may differ from the requested one if
      // failover kicked in).
      recordMetric({
        user: telemetry.userId,
        recipient: telemetry.recipientId,
        event: telemetry.eventId,
        mode: mode || 'unknown',
        provider: result.provider,
        model: result.model,
        latencyMs: Date.now() - start,
        tokensIn: result.usage?.inputTokens,
        tokensOut: result.usage?.outputTokens,
        success: true,
        failoverAttempts: attempts,
      });
      return result;
    } catch (error) {
      lastError = error;
      attempts.push({
        provider: step.provider,
        model: step.model,
        code: error.code,
        status: error.status,
        message: error.message,
      });
      // BAD_REQUEST usually means our prompt is malformed — retrying
      // on another provider with the same prompt will fail too.
      if (error.code === 'BAD_REQUEST') break;
    }
  }

  // Every provider failed — record one terminal failure metric so
  // outages show up in the dashboard alongside successes.
  recordMetric({
    user: telemetry.userId,
    recipient: telemetry.recipientId,
    event: telemetry.eventId,
    mode: mode || 'unknown',
    provider: chain[0]?.provider,
    model: chain[0]?.model,
    latencyMs: Date.now() - start,
    success: false,
    errorCode: lastError?.code || 'ALL_FAILED',
    errorMessage: lastError?.message,
    failoverAttempts: attempts,
  });

  const err = new Error(`All providers failed. Last: ${lastError?.message || 'unknown'}`);
  err.code = lastError?.code || 'ALL_FAILED';
  err.attempts = attempts;
  throw err;
}

module.exports = {
  complete,
  buildFailoverChain,
  PROVIDERS,
  modelRegistry,
};
