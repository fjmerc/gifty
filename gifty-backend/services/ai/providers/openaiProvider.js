/**
 * OpenAI Chat Completions provider.
 * Native JSON mode via `response_format: { type: "json_object" }`.
 *
 * NOTE: This module intentionally uses axios so the existing aiService
 * test mocks (`axios.post.mock.calls[0][1].model`) keep working.
 */

const axios = require('axios');

const API_URL = 'https://api.openai.com/v1/chat/completions';

function isConfigured() {
  return !!process.env.OPENAI_API_KEY;
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
  } = request;

  if (!process.env.OPENAI_API_KEY) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.code = 'AUTH';
    throw err;
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  try {
    const response = await axios.post(API_URL, body, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout,
    });

    const content = response.data?.choices?.[0]?.message?.content || '';
    const usage = response.data?.usage || {};
    return {
      content,
      provider: 'openai',
      model,
      usage: {
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
      raw: response.data,
    };
  } catch (error) {
    throw normalizeError(error, 'openai');
  }
}

function normalizeError(error, providerId) {
  const status = error.response?.status;
  const err = new Error(error.message);
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
  id: 'openai',
  isConfigured,
  complete,
};
