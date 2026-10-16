/**
 * Registry of supported AI providers and the models we expose to users.
 *
 * Adding a model: append to the appropriate provider's `models` array.
 * Adding a provider: also create a provider implementation under
 * `services/ai/providers/` and register it in `aiProviderService.js`.
 *
 * `isConfigured()` should return true only if the env var(s) needed
 * to call the provider are present — used to filter the dropdown so
 * users don't see options they can't actually call.
 */

const aiConfig = require('../../config/aiConfig');

const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o family. Strong general reasoning, fast.',
    envKey: 'OPENAI_API_KEY',
    supportsJsonMode: true,
    isConfigured: () => !!process.env.OPENAI_API_KEY,
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', tier: 'flagship', contextWindow: 128000, recommendedFor: ['enhanced', 'basic', 'hybrid'] },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'efficient', contextWindow: 128000, recommendedFor: ['basic'] },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', tier: 'legacy', contextWindow: 128000, recommendedFor: [] },
    ],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    description: 'Claude 4 family. Excellent at nuanced personalization and instruction-following.',
    envKey: 'ANTHROPIC_API_KEY',
    supportsJsonMode: false, // No native JSON mode; we instruct in prompt
    isConfigured: () => !!process.env.ANTHROPIC_API_KEY,
    models: [
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', tier: 'flagship', contextWindow: 200000, recommendedFor: ['enhanced'] },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'balanced', contextWindow: 200000, recommendedFor: ['enhanced', 'basic'] },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', tier: 'efficient', contextWindow: 200000, recommendedFor: ['basic'] },
    ],
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini 2.5 family. Strong with structured output and long context.',
    envKey: 'GEMINI_API_KEY',
    supportsJsonMode: true,
    isConfigured: () => !!process.env.GEMINI_API_KEY,
    models: [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'flagship', contextWindow: 1000000, recommendedFor: ['enhanced'] },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'efficient', contextWindow: 1000000, recommendedFor: ['basic'] },
    ],
  },
};

const DEFAULT_PROVIDER = process.env.AI_DEFAULT_PROVIDER || 'openai';

function getProvider(providerId) {
  return PROVIDERS[providerId] || null;
}

function getAvailableProviders() {
  return Object.values(PROVIDERS).filter((p) => p.isConfigured());
}

function getAllProviders() {
  return Object.values(PROVIDERS);
}

/**
 * Resolve {provider, model} for a request, with sensible fallbacks:
 *  1. Use explicit args if both provided and configured.
 *  2. Fall back to default provider, picking a model from its list.
 *  3. If default isn't configured, use first available provider.
 *  4. Throw if none configured.
 */
function resolveProviderAndModel({ provider, model, mode = 'enhanced' } = {}) {
  // Try requested provider first
  if (provider && PROVIDERS[provider] && PROVIDERS[provider].isConfigured()) {
    const p = PROVIDERS[provider];
    const m = model && p.models.find((mm) => mm.id === model)
      ? model
      : defaultModelFor(p, mode);
    return { provider: p.id, model: m };
  }

  // Try default provider
  const def = PROVIDERS[DEFAULT_PROVIDER];
  if (def && def.isConfigured()) {
    return { provider: def.id, model: defaultModelFor(def, mode) };
  }

  // Fall back to first available
  const available = getAvailableProviders();
  if (available.length > 0) {
    return { provider: available[0].id, model: pickModelForMode(available[0], mode) };
  }

  throw new Error('No AI provider is configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY.');
}

/**
 * Check a user's provider/model choice against what this server can call.
 * Returns a plain message for an unusable choice, or null when it is fine.
 * A model sent without a provider is checked against the default provider.
 * Operator env models (aiConfig) are not a user choice and are not checked.
 */
function validateChoice({ provider, model } = {}) {
  const providerId = provider || DEFAULT_PROVIDER;
  const p = PROVIDERS[providerId];
  if (!p) return `Unknown AI provider: ${providerId}`;
  if (provider && !p.isConfigured()) {
    return `AI provider ${p.label} is not configured on this server. Choose another provider or the server default.`;
  }
  if (model && !p.models.some((m) => m.id === model)) {
    return `Model ${model} is not available for provider ${p.id}`;
  }
  return null;
}

/**
 * The model a provider runs when no model was chosen. For the server's
 * default provider that is aiConfig's model for the mode (the source of
 * truth): an operator's env override is used as given; the built-in default
 * only when this provider lists it (so an OpenAI default never reaches
 * another provider). Other providers use their recommended listed model.
 */
function defaultModelFor(provider, mode) {
  const configured = aiConfig[mode === 'basic' ? 'basic' : 'enhanced'];
  if (provider.id === DEFAULT_PROVIDER && configured?.model
    && (configured.modelFromEnv || provider.models.some((m) => m.id === configured.model))) {
    return configured.model;
  }
  return pickModelForMode(provider, mode);
}

function pickModelForMode(provider, mode) {
  const preferred = provider.models.find((m) => m.recommendedFor.includes(mode));
  if (preferred) return preferred.id;
  return provider.models[0].id;
}

module.exports = {
  PROVIDERS,
  DEFAULT_PROVIDER,
  getProvider,
  getAvailableProviders,
  getAllProviders,
  resolveProviderAndModel,
  validateChoice,
};
