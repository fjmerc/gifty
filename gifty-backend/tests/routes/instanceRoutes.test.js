const express = require('express');
const request = require('supertest');

jest.mock('../../services/setupCodeService', () => ({ isSetupRequired: jest.fn().mockResolvedValue(false) }));

describe('GET /api/instance', () => {
  it('returns version and feature flags without auth', async () => {
    const saved = process.env;
    process.env = { ...saved, GIFTY_VERSION: '0.9.0', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', SMTP_HOST: '', DEFAULT_EMAIL_HOST: '', BRAVE_SEARCH_API_KEY: '', DEFAULT_COUNTRY: '', DEFAULT_CURRENCY: '' };
    const app = express();
    app.use('/api/instance', require('../../routes/instanceRoutes'));
    const res = await request(app).get('/api/instance');
    process.env = saved;
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: '0.9.0', features: { ai: false, email: false, webSearch: false }, setupRequired: false, defaults: { country: 'US', currency: 'USD' } });
  });
});
