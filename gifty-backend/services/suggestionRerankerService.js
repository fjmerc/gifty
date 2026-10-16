/**
 * Re-ranks AI-generated gift candidates using feedback signals and MMR
 * diversity. The AI generates more candidates than we need; this picks
 * the best subset based on (a) feedback-derived preference signals and
 * (b) diversity across category, price tier, and tag space.
 *
 * Inputs:
 *  - candidates: array of AI suggestions (shape from aiService /
 *    enhancedAiService — name, description, category, tags, estimatedPrice,
 *    priceRange, relevanceScore, etc.)
 *  - context: {
 *      recipient,                  // mongoose doc or POJO
 *      recipientPreferences,       // from trendAnalysisService.analyzeRecipientPreferences
 *      categoryTrends,             // from trendAnalysisService.analyzeCategorySuccess
 *      tagTrends,                  // from trendAnalysisService.analyzeTagEffectiveness
 *      negativeFeedback,           // array of {name, category, tags}
 *      finalCount,                 // target output size
 *    }
 *
 * Output: top-N suggestions, each tagged with .rerankScore and a
 * .rerankBreakdown explaining the score (great for debugging quality).
 */

const aiConfig = require('../config/aiConfig');

const tokenize = (text) => {
  if (!text) return new Set();
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
  );
};

const jaccard = (a, b) => {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
};

const priceTier = (price) => {
  if (!price || price <= 0) return 'unknown';
  if (price < 25) return 'budget';
  if (price < 75) return 'moderate';
  if (price < 150) return 'premium';
  return 'luxury';
};

/**
 * Score a single candidate against context. Higher is better. Score is
 * unbounded but typically lands in [0, 200].
 */
function scoreCandidate(candidate, ctx) {
  const w = aiConfig.reranker.weights;
  const breakdown = {};
  let score = 0;

  // 1) Trust the model's own relevance score (it has the most context
  // about why this gift fits this recipient). Normalized to ~0-100.
  const modelRel = candidate.relevanceScore || candidate.matchScore || 50;
  const modelComponent = modelRel * w.modelRelevance;
  score += modelComponent;
  breakdown.modelRelevance = +modelComponent.toFixed(1);

  // 2) Budget fit: peaks when price is inside [min, max] budget,
  // falls off as it deviates. Without a budget, this component is zero.
  const recipient = ctx.recipient || {};
  const minB = recipient.minimumPriceBudget;
  const maxB = recipient.maximumPriceBudget;
  const price = candidate.estimatedPrice;
  let budgetComponent = 0;
  if (price && maxB) {
    if (minB && price >= minB && price <= maxB) {
      budgetComponent = 20 * w.budgetFit; // inside ideal band
    } else if (price <= maxB) {
      budgetComponent = 10 * w.budgetFit; // under max but below min
    } else if (price <= maxB * 1.25) {
      budgetComponent = -5 * w.budgetFit; // slightly over
    } else {
      budgetComponent = -25 * w.budgetFit; // way over budget
    }
  }
  score += budgetComponent;
  breakdown.budgetFit = +budgetComponent.toFixed(1);

  // 3) Recipient-specific preference alignment (what THIS recipient
  // has previously engaged with positively, from feedback history).
  const candCat = (candidate.category || '').toLowerCase();
  const candTags = (candidate.tags || []).map((t) => String(t).toLowerCase());
  let prefComponent = 0;
  const catPrefs = ctx.recipientPreferences?.categoryPreferences || [];
  const tagPrefs = ctx.recipientPreferences?.tagPreferences || [];

  for (const p of catPrefs) {
    if ((p.category || '').toLowerCase() === candCat) {
      // Weight by how often AND how highly rated past gifts in this
      // category were. Rating-aware preference is stronger signal than
      // raw counts.
      const ratingMult = p.averageRating ? p.averageRating / 5 : 0.6;
      prefComponent += 15 * ratingMult;
    }
  }
  for (const p of tagPrefs) {
    if (candTags.includes((p.tag || '').toLowerCase())) {
      const ratingMult = p.averageRating ? p.averageRating / 5 : 0.6;
      prefComponent += 5 * ratingMult;
    }
  }
  // Global market trends: if a category/tag has a high cross-user
  // success rate, give a small boost. Less influential than recipient-
  // specific signal, but helps cold-start cases.
  const catTrends = ctx.categoryTrends || [];
  const tagTrends = ctx.tagTrends || [];
  const catTrend = catTrends.find((c) => (c.category || '').toLowerCase() === candCat);
  if (catTrend && catTrend.successRate > 0.4) {
    prefComponent += 5 * catTrend.successRate;
  }
  for (const t of tagTrends) {
    if (candTags.includes((t.tag || '').toLowerCase()) && t.successRate > 0.4) {
      prefComponent += 2 * t.successRate;
    }
  }
  prefComponent *= w.recipientPreference;
  score += prefComponent;
  breakdown.recipientPreference = +prefComponent.toFixed(1);

  // 4) Personalization signal — custom/engraved/handmade items typically
  // outperform generic ones. The base relevance score already partially
  // captures this; here we double-down because it's a strong signal.
  const personalKeywords = ['custom', 'personalized', 'monogram', 'engraved', 'bespoke', 'handmade', 'handcrafted'];
  const text = `${candidate.name || ''} ${candidate.description || ''} ${candidate.whyPerfectForRecipient || ''}`.toLowerCase();
  let personalComponent = 0;
  for (const kw of personalKeywords) {
    if (text.includes(kw)) {
      personalComponent += 8;
      break; // single boost, not stackable
    }
  }
  // Interest/hobby keyword overlap — text mentions of the recipient's
  // interests are a quick proxy for "the AI actually used the profile."
  const interests = [
    ...(recipient.interests || []),
    ...(recipient.hobbies || []),
    ...(recipient.favoriteBooks || []),
    ...(recipient.favoriteMovies || []),
    ...(recipient.favoriteMusic || []),
  ].map((i) => String(i).toLowerCase());
  const candText = tokenize(`${candidate.name} ${candidate.description} ${candidate.whyPerfectForRecipient || ''} ${candTags.join(' ')}`);
  let interestHits = 0;
  for (const interest of interests) {
    if (interest && candText.has(interest.split(/\s+/)[0])) interestHits++;
  }
  personalComponent += Math.min(interestHits * 4, 20);
  personalComponent *= w.personalization;
  score += personalComponent;
  breakdown.personalization = +personalComponent.toFixed(1);

  // 5) Negative feedback penalty — actively avoid recommending items
  // similar to ones the recipient rejected. The prompt asks the model
  // to avoid these, but we belt-and-suspenders here.
  let negComponent = 0;
  const negFeedback = ctx.negativeFeedback || [];
  for (const neg of negFeedback) {
    const negTags = new Set((neg.tags || []).map((t) => String(t).toLowerCase()));
    const candTagSet = new Set(candTags);
    const tagOverlap = jaccard(negTags, candTagSet);
    const catMatch = (neg.category || '').toLowerCase() === candCat ? 1 : 0;
    if (catMatch && tagOverlap > 0.3) {
      negComponent -= 15;
    } else if (tagOverlap > 0.5) {
      negComponent -= 8;
    }
  }
  negComponent *= w.negativeFeedbackPenalty;
  score += negComponent;
  breakdown.negativeFeedback = +negComponent.toFixed(1);

  // 6) Novelty bonus — slight boost when a candidate hits a category or
  // tag the recipient hasn't been recommended in. Cold start uses this
  // (no preferences → bonus is zero, so no harm done).
  if (catPrefs.length > 0) {
    const knownCats = new Set(catPrefs.map((p) => (p.category || '').toLowerCase()));
    if (!knownCats.has(candCat)) {
      const novelty = 6 * w.noveltyBonus;
      score += novelty;
      breakdown.novelty = +novelty.toFixed(1);
    }
  }

  return { score, breakdown };
}

/**
 * Compute pairwise similarity between two candidates for MMR.
 * Higher value = more similar = stronger MMR penalty.
 */
function candidateSimilarity(a, b) {
  const catEq = (a.category || '').toLowerCase() === (b.category || '').toLowerCase() ? 0.4 : 0;
  const tierEq = priceTier(a.estimatedPrice) === priceTier(b.estimatedPrice) ? 0.2 : 0;
  const tagSim = jaccard(
    new Set((a.tags || []).map((t) => String(t).toLowerCase())),
    new Set((b.tags || []).map((t) => String(t).toLowerCase()))
  );
  // Name-token overlap catches near-duplicate products like "Wireless
  // Headphones" vs "Bluetooth Wireless Headphones".
  const nameSim = jaccard(tokenize(a.name), tokenize(b.name));
  return catEq + tierEq + 0.3 * tagSim + 0.1 * nameSim;
}

/**
 * Re-rank candidates and select top N with MMR diversity.
 */
function rerank(candidates, context = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const finalCount = Math.max(1, context.finalCount || candidates.length);

  // Disabled = skip scoring/MMR, but still honor finalCount: callers
  // over-generate candidates on purpose, so passing them all through
  // would leak the extra ones to the user.
  if (!aiConfig.reranker.enabled) return candidates.slice(0, finalCount);
  const lambda = aiConfig.reranker.mmrLambda;

  // Score every candidate up-front.
  const scored = candidates.map((c) => {
    const { score, breakdown } = scoreCandidate(c, context);
    return { ...c, rerankScore: +score.toFixed(1), rerankBreakdown: breakdown };
  });

  // If MMR isn't useful (few candidates), just return top-N by score.
  if (scored.length <= finalCount) {
    return scored.sort((a, b) => b.rerankScore - a.rerankScore);
  }

  // MMR selection: at each step, pick the candidate that maximizes
  // (lambda * relevance) - ((1-lambda) * max_similarity_to_selected).
  const selected = [];
  const remaining = [...scored].sort((a, b) => b.rerankScore - a.rerankScore);

  // Always seed with the top-scored candidate.
  selected.push(remaining.shift());

  while (selected.length < finalCount && remaining.length > 0) {
    let bestIdx = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      let maxSim = 0;
      for (const sel of selected) {
        const sim = candidateSimilarity(cand, sel);
        if (sim > maxSim) maxSim = sim;
      }
      // Normalize relevance against the top score so lambda/(1-lambda)
      // are on comparable scales.
      const normalizedRel = cand.rerankScore / Math.max(1, selected[0].rerankScore);
      const mmrValue = lambda * normalizedRel - (1 - lambda) * maxSim;
      if (mmrValue > bestValue) {
        bestValue = mmrValue;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
}

module.exports = {
  rerank,
  scoreCandidate,
  candidateSimilarity,
  _internal: { tokenize, jaccard, priceTier },
};
