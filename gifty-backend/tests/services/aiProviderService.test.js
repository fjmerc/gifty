// tests/services/aiProviderService.test.js
// Unit tests for the multi-provider AI facade. Mocks axios so no real
// API calls happen.

jest.mock('axios');
// The facade fire-and-forgets SuggestionMetric writes. Unmocked, they queue in
// Mongoose (no DB connection in this unit test) and time out after Jest has
// finished, silently turning the run's exit code to 1.
jest.mock('../../models/SuggestionMetric', () => ({ create: jest.fn().mockResolvedValue({}) }));
const axios = require('axios');
const facade = require('../../services/ai/aiProviderService');

describe('aiProviderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_DEFAULT_PROVIDER;
  });

  const loadFresh = () => facade;

  describe('OpenAI provider routing', () => {
    it('calls OpenAI endpoint when provider=openai', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const facade = loadFresh();
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '{"suggestions":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      });
      const result = await facade.complete({
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user prompt here',
        mode: 'basic',
        failover: false,
      });
      expect(axios.post).toHaveBeenCalledTimes(1);
      const [url, body, config] = axios.post.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toHaveLength(2);
      expect(config.headers.Authorization).toBe('Bearer sk-test');
      expect(result.provider).toBe('openai');
      expect(result.usage.totalTokens).toBe(15);
    });
  });

  describe('Anthropic provider routing', () => {
    it('calls Anthropic endpoint with x-api-key and concatenates text blocks', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const facade = loadFresh();
      axios.post.mockResolvedValue({
        data: {
          content: [
            { type: 'text', text: '{"suggestions":' },
            { type: 'text', text: '[]}' },
          ],
          usage: { input_tokens: 20, output_tokens: 8 },
        },
      });
      const result = await facade.complete({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        systemPrompt: 'sys',
        userPrompt: 'user',
        mode: 'enhanced',
        failover: false,
      });
      const [url, body, config] = axios.post.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(body.model).toBe('claude-sonnet-4-6');
      // Anthropic uses `system` field, not a system message in messages array.
      expect(body.system).toContain('sys');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(config.headers['x-api-key']).toBe('sk-ant-test');
      expect(config.headers['anthropic-version']).toBeDefined();
      expect(result.content).toBe('{"suggestions":[]}');
      expect(result.provider).toBe('anthropic');
      expect(result.usage.totalTokens).toBe(28);
    });

    it('appends JSON instruction to system prompt when jsonMode=true', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const facade = loadFresh();
      axios.post.mockResolvedValue({ data: { content: [{ type: 'text', text: '{}' }], usage: {} } });
      await facade.complete({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        systemPrompt: 'You are a gift expert.',
        userPrompt: 'Suggest a gift.',
        jsonMode: true,
        failover: false,
      });
      const body = axios.post.mock.calls[0][1];
      expect(body.system).toMatch(/single valid JSON object/);
    });
  });

  describe('Gemini provider routing', () => {
    it('calls Gemini endpoint with key in URL and uses systemInstruction', async () => {
      process.env.GEMINI_API_KEY = 'gkey-test';
      const facade = loadFresh();
      axios.post.mockResolvedValue({
        data: {
          candidates: [{ content: { parts: [{ text: '{"suggestions":[]}' }] } }],
          usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 12, totalTokenCount: 42 },
        },
      });
      const result = await facade.complete({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        systemPrompt: 'sys',
        userPrompt: 'user',
        failover: false,
      });
      const [url, body] = axios.post.mock.calls[0];
      expect(url).toMatch(/generativelanguage\.googleapis\.com/);
      expect(url).toContain('gemini-2.5-flash');
      expect(url).toContain('key=gkey-test');
      expect(body.systemInstruction.parts[0].text).toBe('sys');
      expect(body.contents[0].parts[0].text).toBe('user');
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(result.provider).toBe('gemini');
      expect(result.usage.totalTokens).toBe(42);
    });
  });

  describe('failover chain', () => {
    it('cascades to a configured fallback provider when primary errors', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const facade = loadFresh();

      // First call (OpenAI) fails with 503
      axios.post
        .mockRejectedValueOnce({ response: { status: 503 }, message: 'Service unavailable' })
        // Second call (Anthropic) succeeds
        .mockResolvedValueOnce({
          data: { content: [{ type: 'text', text: '{"ok":true}' }], usage: {} },
        });

      const result = await facade.complete({
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
        mode: 'enhanced',
      });
      expect(axios.post).toHaveBeenCalledTimes(2);
      expect(result.provider).toBe('anthropic');
      expect(result.attempts).toHaveLength(1); // 1 failed attempt before this success
    });

    it('throws ALL_FAILED when every provider fails', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const facade = loadFresh();
      axios.post.mockRejectedValue({ response: { status: 503 }, message: 'Down' });
      await expect(facade.complete({
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
        mode: 'basic',
      })).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });

    it('stops cascading on BAD_REQUEST since the prompt itself is malformed', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      const facade = loadFresh();
      axios.post.mockRejectedValueOnce({ response: { status: 400 }, message: 'Bad prompt' });
      await expect(facade.complete({
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'sys',
        userPrompt: 'user',
        mode: 'basic',
      })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      // Only ONE call — failover should not have tried Anthropic.
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('model registry resolution', () => {
    it('falls back to default provider when requested provider lacks a key', async () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      const facade = loadFresh();
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: '{}' } }], usage: {} },
      });
      const result = await facade.complete({
        // Anthropic requested but not configured
        provider: 'anthropic',
        systemPrompt: 'sys',
        userPrompt: 'user',
        mode: 'enhanced',
        failover: true,
      });
      // Should have resolved to OpenAI since Anthropic isn't configured.
      expect(result.provider).toBe('openai');
    });

    it('throws clear error when no provider is configured', async () => {
      const facade = loadFresh();
      await expect(facade.complete({
        provider: 'openai',
        systemPrompt: 'sys',
        userPrompt: 'user',
        mode: 'basic',
      })).rejects.toThrow(/No AI provider is configured/);
    });
  });
});
