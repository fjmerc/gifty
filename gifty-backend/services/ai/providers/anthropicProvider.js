/**
 * Anthropic Messages API provider (Claude).
 *
 * Anthropic does not have a native JSON mode. When jsonMode=true we
 * append a JSON instruction to the system prompt; the caller's parser
 * already handles JSON-with-surrounding-text via safeExtractJson.
 *
 * API: https://docs.anthropic.com/claude/reference/messages_post
 */

const axios = require('axios');

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function complete(request) {
  const {
    systemPrompt,
    userPrompt,
    model,
    temperature = 0.7,
    maxTokens = 2000,
    jsonMode = true,
    timeout = 60000,
    cacheSystemPrompt = process.env.ANTHROPIC_PROMPT_CACHE !== 'false',
  } = request;

  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY is not configured');
    err.code = 'AUTH';
    throw err;
  }

  // Claude has no JSON mode flag; bake the instruction into the system
  // prompt. The downstream parser tolerates surrounding text via
  // safeExtractJson, so even if Claude adds a brief preamble we recover.
  const jsonInstruction = '\n\nIMPORTANT: Respond with a single valid JSON object only — no markdown fences, no commentary, no preamble. Begin your response with "{" and end with "}".';

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: userPrompt }],
  };

  // Prompt caching: mark the bulk of the system prompt as cacheable so
  // re-calls reuse those input tokens. Anthropic requires a minimum
  // ~1024 token block to be cacheable; the Enhanced system prompt is
  // ~4-6k tokens which comfortably exceeds that. Skips the cache mark
  // for very short prompts where caching offers no benefit.
  // Docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
  if (cacheSystemPrompt && systemPrompt && systemPrompt.length > 2000) {
    body.system = [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ...(jsonMode ? [{ type: 'text', text: jsonInstruction }] : []),
    ];
  } else {
    body.system = jsonMode ? `${systemPrompt}${jsonInstruction}` : systemPrompt;
  }

  try {
    const response = await axios.post(API_URL, body, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      timeout,
    });

    // Anthropic returns content as an array of blocks; concatenate text.
    const blocks = response.data?.content || [];
    const content = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const usage = response.data?.usage || {};
    // Surface cache-related token counts in the usage object so
    // telemetry can show actual savings from prompt caching.
    return {
      content,
      provider: 'anthropic',
      model,
      usage: {
        inputTokens: usage.input_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
        cacheCreationInputTokens: usage.cache_creation_input_tokens || 0,
        cacheReadInputTokens: usage.cache_read_input_tokens || 0,
      },
      raw: response.data,
    };
  } catch (error) {
    throw normalizeError(error, 'anthropic');
  }
}

function normalizeError(error, providerId) {
  const status = error.response?.status;
  const err = new Error(error.response?.data?.error?.message || error.message);
  err.provider = providerId;
  err.status = status;
  if (status === 401 || status === 403) err.code = 'AUTH';
  else if (status === 429) err.code = 'RATE_LIMIT';
  else if (status === 400 || status === 422) err.code = 'BAD_REQUEST';
  else if (status >= 500 || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') err.code = 'UNAVAILABLE';
  else err.code = 'UNKNOWN';
  err.details = error.response?.data;
  return err;
}

module.exports = {
  id: 'anthropic',
  isConfigured,
  complete,
};
