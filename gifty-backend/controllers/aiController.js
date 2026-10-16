const asyncHandler = require('express-async-handler');
const modelRegistry = require('../services/ai/modelRegistry');

/**
 * GET /api/ai/models
 *
 * Returns the catalog of AI providers and models that the user can
 * choose from. Each provider has an `available` flag set to true only
 * if the relevant API key is configured on the server — so the UI can
 * gray out (or hide) unavailable options without making extra calls.
 */
exports.listModels = asyncHandler(async (req, res) => {
  const all = modelRegistry.getAllProviders();
  const payload = {
    defaultProvider: modelRegistry.DEFAULT_PROVIDER,
    providers: all.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      available: p.isConfigured(),
      supportsJsonMode: p.supportsJsonMode,
      models: p.models,
    })),
  };
  res.json(payload);
});
