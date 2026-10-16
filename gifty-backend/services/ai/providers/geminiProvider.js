/**
 * Google Gemini provider (generativelanguage.googleapis.com).
 *
 * Native JSON mode via generationConfig.responseMimeType. Uses
 * systemInstruction for the system prompt.
 *
 * API: https://ai.google.dev/api/generate-content
 */

const axios = require('axios');

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function isConfigured() {
  return !!process.env.GEMINI_API_KEY;
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

  if (!process.env.GEMINI_API_KEY) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.code = 'AUTH';
    throw err;
  }

  const url = `${BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  try {
    const response = await axios.post(url, body, {
      headers: { 'content-type': 'application/json' },
      timeout,
    });

    const candidate = response.data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const content = parts.map((p) => p.text || '').join('');
    const usage = response.data?.usageMetadata || {};
    return {
      content,
      provider: 'gemini',
      model,
      usage: {
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0,
      },
      raw: response.data,
    };
  } catch (error) {
    throw normalizeError(error, 'gemini');
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
  id: 'gemini',
  isConfigured,
  complete,
};
