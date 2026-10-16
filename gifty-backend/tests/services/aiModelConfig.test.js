// aiConfig.js is the source of truth for the models the server uses by
// default: an operator's AI_BASIC_MODEL / AI_ENHANCED_MODEL is honoured even
// when it is not in the registry's list. The list is only what a *user* may
// pick: a user's choice is still checked against it.
const ENV_KEYS = ['AI_BASIC_MODEL', 'AI_ENHANCED_MODEL', 'AI_DEFAULT_PROVIDER', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'];

const saved = {};
ENV_KEYS.forEach((key) => { saved[key] = process.env[key]; });
afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });
});

// Fresh modules under this env (aiConfig reads it when loaded)
const load = (env) => {
  ENV_KEYS.forEach((key) => { delete process.env[key]; });
  Object.assign(process.env, env);
  let modules;
  jest.isolateModules(() => {
    modules = {
      registry: require('../../services/ai/modelRegistry'),
      providerService: require('../../services/ai/aiProviderService')
    };
  });
  return modules;
};

describe('operator model choice (aiConfig)', () => {
  it('uses AI_BASIC_MODEL for basic mode when no provider is chosen, even if unlisted', () => {
    const { registry } = load({ OPENAI_API_KEY: 'k', AI_BASIC_MODEL: 'gpt-4.1-mini' });
    expect(registry.resolveProviderAndModel({ mode: 'basic' })).toEqual({ provider: 'openai', model: 'gpt-4.1-mini' });
  });

  it('uses AI_ENHANCED_MODEL for enhanced mode', () => {
    const { registry } = load({ OPENAI_API_KEY: 'k', AI_ENHANCED_MODEL: 'gpt-4.1' });
    expect(registry.resolveProviderAndModel({ mode: 'enhanced' })).toEqual({ provider: 'openai', model: 'gpt-4.1' });
  });

  it('uses the operator model when the user picked the default provider but no model', () => {
    const { registry } = load({ OPENAI_API_KEY: 'k', AI_ENHANCED_MODEL: 'gpt-4.1' });
    expect(registry.resolveProviderAndModel({ provider: 'openai', mode: 'enhanced' })).toEqual({ provider: 'openai', model: 'gpt-4.1' });
  });

  it("honours a user's listed model over the operator model", () => {
    const { registry } = load({ OPENAI_API_KEY: 'k', AI_BASIC_MODEL: 'gpt-4.1-mini' });
    expect(registry.resolveProviderAndModel({ provider: 'openai', model: 'gpt-4o', mode: 'basic' })).toEqual({ provider: 'openai', model: 'gpt-4o' });
  });

  it("still refuses a user's unlisted model", () => {
    const { registry } = load({ OPENAI_API_KEY: 'k', AI_BASIC_MODEL: 'gpt-4.1-mini' });
    expect(registry.validateChoice({ provider: 'openai', model: 'gpt-4.1-mini' })).toMatch(/not available/);
  });

  it('never sends the openai default model to another default provider', () => {
    const { registry } = load({ ANTHROPIC_API_KEY: 'k', AI_DEFAULT_PROVIDER: 'anthropic' });
    const resolved = registry.resolveProviderAndModel({ mode: 'basic' });
    expect(resolved.provider).toBe('anthropic');
    expect(resolved.model).toMatch(/^claude-/);
  });

  it('a fallback provider gets its own listed model, not the operator model', () => {
    const { providerService } = load({ OPENAI_API_KEY: 'k', ANTHROPIC_API_KEY: 'k', AI_BASIC_MODEL: 'gpt-4.1-mini' });
    const chain = providerService.buildFailoverChain({ mode: 'basic' });
    expect(chain[0]).toEqual({ provider: 'openai', model: 'gpt-4.1-mini' });
    expect(chain[1].provider).toBe('anthropic');
    expect(chain[1].model).toMatch(/^claude-/);
  });
});
