const { HttpError } = require('./ownership');

/**
 * A failure of the AI step itself, answered as a 502 with a message meant
 * for the user. `code` tells callers which part failed, so a web-mode
 * fallback never asks a failed AI a second time.
 */
class AiError extends HttpError {
  constructor(code, message) {
    super(502, message, { expose: true });
    this.name = 'AiError';
    this.code = code;
  }
}

// The model answered, but not in a form we can read
const badOutput = (detail) => {
  const error = new AiError('AI_BAD_OUTPUT', 'The AI answered in a form Gifty could not read. Please try again.');
  error.detail = detail;
  return error;
};

// Every provider failed (outage, auth, rate limit, timeout)
const providerFailed = (cause) => {
  const error = new AiError('AI_PROVIDER_FAILED', 'The AI service did not answer. Please try again in a moment.');
  error.cause = cause;
  return error;
};

const isAiError = (error) => error instanceof AiError;

/**
 * A suggestion worth saving: a name and a usable price (a finite number,
 * 0 or more). Anything else is skipped, never saved with a made-up price.
 */
const isUsableSuggestion = (suggestion) => Boolean(suggestion)
  && typeof suggestion.name === 'string' && suggestion.name.trim().length > 0
  && typeof suggestion.estimatedPrice === 'number' && Number.isFinite(suggestion.estimatedPrice)
  && suggestion.estimatedPrice >= 0;

module.exports = { AiError, badOutput, providerFailed, isAiError, isUsableSuggestion };
