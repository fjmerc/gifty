/**
 * Central AI configuration for suggestion services.
 * All values are environment-overridable so models, temperatures, and
 * generation budgets can be tuned without code changes.
 *
 * Re-ranker weights determine how heavily different signals influence
 * the final ordering of AI candidates. Tune these to bias the system
 * toward, e.g., budget-fit vs. personalization vs. diversity.
 */

const num = (value, fallback) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const int = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  // `model` is what the server's default provider runs for each mode.
  // `modelFromEnv` marks an operator override: it is used as given, even when
  // the registry (the list a *user* may pick from) does not list it.
  basic: {
    model: process.env.AI_BASIC_MODEL || 'gpt-4o',
    modelFromEnv: Boolean(process.env.AI_BASIC_MODEL),
    temperature: num(process.env.AI_BASIC_TEMPERATURE, 0.7),
    maxTokens: int(process.env.AI_BASIC_MAX_TOKENS, 2000),
    candidateCount: int(process.env.AI_BASIC_CANDIDATE_COUNT, 6),
    finalCount: int(process.env.AI_BASIC_FINAL_COUNT, 4),
  },
  enhanced: {
    // Promoted from gpt-3.5-turbo → gpt-4o: the Enhanced path feeds the
    // model 4-6k tokens of feedback/trend/profile context; 3.5-turbo
    // could not synthesize that signal well.
    model: process.env.AI_ENHANCED_MODEL || 'gpt-4o',
    modelFromEnv: Boolean(process.env.AI_ENHANCED_MODEL),
    temperature: num(process.env.AI_ENHANCED_TEMPERATURE, 0.75),
    maxTokens: int(process.env.AI_ENHANCED_MAX_TOKENS, 3000),
    // Generate more candidates than we return so the re-ranker has
    // something to choose from. Higher → better picks, more cost/latency.
    candidateCount: int(process.env.AI_ENHANCED_CANDIDATE_COUNT, 8),
    finalCount: int(process.env.AI_ENHANCED_FINAL_COUNT, 5),
  },
  reranker: {
    enabled: process.env.AI_RERANKER_ENABLED !== 'false',
    weights: {
      modelRelevance: num(process.env.AI_RERANK_W_MODEL, 1.0),
      budgetFit: num(process.env.AI_RERANK_W_BUDGET, 1.2),
      recipientPreference: num(process.env.AI_RERANK_W_PREF, 1.5),
      personalization: num(process.env.AI_RERANK_W_PERSONAL, 0.8),
      noveltyBonus: num(process.env.AI_RERANK_W_NOVELTY, 0.5),
      negativeFeedbackPenalty: num(process.env.AI_RERANK_W_NEG, 2.0),
    },
    // MMR (Maximal Marginal Relevance) lambda: 1.0 = pure score,
    // 0.0 = pure diversity. 0.7 keeps relevance dominant while still
    // forcing some category/tag diversity in the final set.
    mmrLambda: num(process.env.AI_RERANK_MMR_LAMBDA, 0.7),
  },
};
