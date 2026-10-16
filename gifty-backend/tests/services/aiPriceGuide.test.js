// Enhanced and web suggestions ask the AI for gifts within the price guide
// the controller computed (what is left of the budget, in its currency),
// not the recipient's old per-gift fields or a hardcoded dollar sign.
// Real models and MongoDB; the AI provider, trends and web search are stubbed.
const mongoose = require('mongoose');

jest.mock('../../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../services/ai/aiProviderService', () => ({
  complete: jest.fn(async () => ({ content: '{"suggestions": []}', provider: 'openai', model: 'test' }))
}));
jest.mock('../../services/trendAnalysisService', () => ({
  analyzeRecipientPreferences: jest.fn(async () => ({ categoryPreferences: [], tagPreferences: [] })),
  analyzeCategorySuccess: jest.fn(async () => []),
  analyzeTagEffectiveness: jest.fn(async () => [])
}));
const trendAnalysisService = require('../../services/trendAnalysisService');
jest.mock('axios');

const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const Gift = require('../../models/Gift');
const FeedbackLog = require('../../models/FeedbackLog');
require('../../models/Tags');
const aiProviderService = require('../../services/ai/aiProviderService');
const { getEnhancedGiftSuggestions } = require('../../services/enhancedAiService');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-ai-price-guide-${process.pid}`;

describe('enhanced suggestions and the price guide', () => {
  let recipient;
  let event;
  const user = new mongoose.Types.ObjectId();
  const prompts = () => {
    const { systemPrompt, userPrompt } = aiProviderService.complete.mock.calls[0][0];
    return `${systemPrompt}\n${userPrompt}`;
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    // The old per-gift fields say $20-$50; the budget says up to €110
    recipient = await Recipient.create({
      user, firstName: 'Paul', lastName: 'Becker', relation: 'Father', relationship: 'family',
      birthdate: new Date('1958-09-02'), minimumPriceBudget: 20, maximumPriceBudget: 50
    });
    event = await Event.create({ user, recipient: recipient._id, name: 'Anniversary', date: new Date('2099-11-20T00:00:00Z'), type: new mongoose.Types.ObjectId() });
  });

  it('states the guide in its currency', async () => {
    await getEnhancedGiftSuggestions(recipient._id, event._id, user, { priceGuide: { min: 0, max: 110, currency: 'EUR' } });
    const text = prompts();
    expect(text).toContain('€110.00');
    expect(text).not.toMatch(/\$\d/);
  });

  it('says the budget is flexible when the guide has no maximum', async () => {
    await getEnhancedGiftSuggestions(recipient._id, event._id, user, { priceGuide: { min: 0, max: null, currency: 'EUR' } });
    const text = prompts();
    expect(text).not.toContain('50');
    expect(text).toMatch(/Budget: Flexible/);
  });

  it("keeps the recipient's own range when called without a guide", async () => {
    await getEnhancedGiftSuggestions(recipient._id, event._id, user, {});
    expect(prompts()).toContain('$50.00');
  });

  it('never saves the guide onto the recipient', async () => {
    await getEnhancedGiftSuggestions(recipient._id, event._id, user, { priceGuide: { min: 0, max: 110, currency: 'EUR' } });
    const stored = await Recipient.findById(recipient._id).lean();
    expect(stored.maximumPriceBudget).toBe(50);
  });

  // Other accounts' feedback must not shape this account's prompts
  it("reads only the caller's own feedback trends", async () => {
    await getEnhancedGiftSuggestions(recipient._id, event._id, user, { priceGuide: { min: 0, max: 110, currency: 'EUR' } });
    expect(trendAnalysisService.analyzeCategorySuccess).toHaveBeenCalledWith({}, user);
    expect(trendAnalysisService.analyzeTagEffectiveness).toHaveBeenCalledWith({}, user);
    expect(trendAnalysisService.analyzeRecipientPreferences).toHaveBeenCalledWith(recipient._id, {}, user);
  });

  describe('the price of each suggestion', () => {
    const guide = { priceGuide: { min: 0, max: 110, currency: 'EUR' } };
    const answer = (suggestions) => aiProviderService.complete.mockResolvedValueOnce({
      content: JSON.stringify({ suggestions }), provider: 'openai', model: 'test'
    });
    const run = () => getEnhancedGiftSuggestions(recipient._id, event._id, user, guide);
    const base = { description: 'A thoughtful gift for a cyclist', primaryCategory: 'Sports', tags: ['bike'] };

    it('asks the model for an estimatedPrice', async () => {
      await run();
      const { systemPrompt } = aiProviderService.complete.mock.calls[0][0];
      expect(systemPrompt).toMatch(/estimatedPrice/);
    });

    it('takes the estimatedPrice the model gave', async () => {
      answer([{ ...base, name: 'Bike light', estimatedPrice: 42, priceRange: { min: 35, max: 50 } }]);
      const [light] = await run();
      expect(light.estimatedPrice).toBe(42);
    });

    it('uses the middle of the range when only a range is given, never 50', async () => {
      answer([{ ...base, name: 'Saddle bag', priceRange: { min: 60, max: 80 } }]);
      const [bag] = await run();
      expect(bag.estimatedPrice).toBe(70);
    });

    it('reads a numeric string price', async () => {
      answer([{ ...base, name: 'Bell', estimatedPrice: '12.50' }]);
      const [bell] = await run();
      expect(bell.estimatedPrice).toBe(12.5);
    });

    it('drops a suggestion with neither a price nor a range', async () => {
      answer([
        { ...base, name: 'Mystery', priceRange: null },
        { ...base, name: 'Bike light', estimatedPrice: 30 }
      ]);
      const names = (await run()).map((s) => s.name);
      expect(names).toEqual(['Bike light']);
    });

    it('lists well-received gifts at their real price, not 0', async () => {
      const gift = await Gift.create({
        user, recipient: recipient._id, event: event._id, name: 'Cycling cap', price: 35, status: 'purchased', purchaseDate: new Date()
      });
      await FeedbackLog.create({ user, recipient: recipient._id, gift: gift._id, action: 'purchased', timestamp: new Date() });
      await run();
      expect(prompts()).toMatch(/Cycling cap \([^)]*€35\.00\)/);
    });
  });
});
