/**
 * The budget handed to the hybrid suggestion service must be the budget's
 * derived limit in major units (money model): percentage budgets store no
 * maximumAmount, so reading it would silently drop their budget.
 *
 * Real models and database (its own DB); the AI/hybrid services, Redis and
 * the queue are mocked.
 */
const mongoose = require('mongoose');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));
jest.mock('../../config/redis', () => ({
  redisClient: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
  keyPrefixes: { suggestions: 'suggestions:' },
  ttl: {}
}));
jest.mock('../../queues/index', () => ({
  cleanupQueue: { process: jest.fn(), add: jest.fn(), getJobs: jest.fn() }
}));
jest.mock('../../services/aiService');
jest.mock('../../services/enhancedAiService');
jest.mock('../../services/webSearchAiService');
jest.mock('../../services/hybridSuggestionService');
jest.mock('../../services/suggestionCacheService', () => ({
  getVersion: jest.fn(async () => 0),
  get: jest.fn(async () => null),
  set: jest.fn(async () => undefined)
}));
jest.mock('../../utils/suggestionUtilsEnhanced');

const User = require('../../models/User');
const Recipient = require('../../models/Recipient');
const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
require('../../models/Tags'); // registers the Tag model the recipient populate needs
const { Budget, OverallBudget } = require('../../models/Budget');
const hybridSuggestionService = require('../../services/hybridSuggestionService');
const { getAISuggestions } = require('../../services/aiService');
const { getEnhancedGiftSuggestions } = require('../../services/enhancedAiService');
const { getWebEnhancedGiftSuggestions } = require('../../services/webSearchAiService');
const Gift = require('../../models/Gift');
const { generateGiftSuggestions } = require('../../controllers/giftController');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-suggestion-budget-${process.pid}`;
const YEAR = 2031;

describe('hybrid suggestions receive the derived budget limit', () => {
  let user;
  let recipient;
  let event;

  const insertBudget = (extra) => Budget.collection.insertOne({
    user: user._id, recipient: recipient._id, year: YEAR, minimumAmount: 0, isLimited: true, ...extra
  });

  const runController = async () => {
    const req = {
      user: { _id: user._id },
      query: {},
      body: { recipientId: String(recipient._id), eventId: String(event._id), hybrid: true }
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await generateGiftSuggestions(req, res, jest.fn());
  };

  const expectBudgetPassed = (expected) => {
    expect(hybridSuggestionService.generateHybridSuggestions).toHaveBeenCalledTimes(1);
    const [profile, options] = hybridSuggestionService.generateHybridSuggestions.mock.calls[0];
    expect(profile.budget).toBe(expected);
    expect(options.budget).toBe(expected);
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
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
    jest.clearAllMocks();
    hybridSuggestionService.isHybridSystemHealthy.mockResolvedValue({ isHealthy: true });
    hybridSuggestionService.generateHybridSuggestions.mockResolvedValue([]);

    user = await User.create({
      username: 'budget-sugg', firstName: 'B', lastName: 'S', email: 'budget-sugg@example.com', password: 'Password123!'
    });
    recipient = await Recipient.create({
      user: user._id, firstName: 'Ann', lastName: 'Gift', relation: 'Friend',
      relationship: 'friendship', birthdate: new Date('1985-05-05')
    });
    const type = await EventType.create({ name: 'Birthday-sugg', isCustom: false });
    event = await Event.create({
      user: user._id, recipient: recipient._id, name: 'Birthday', date: new Date(`${YEAR}-06-15T12:00:00Z`), type: type._id
    });
    await OverallBudget.collection.insertOne({
      user: user._id, year: YEAR, amount: 1000, isLimited: true, currency: 'USD'
    });
  });

  describe.each([
    ['generateGiftSuggestions', runController]
  ])('%s', (_name, run) => {
    it('passes 100 for a 10% budget of a $1000 overall', async () => {
      await insertBudget({ allocationType: 'percentage', percentageAllocation: 10 });
      await run();
      expectBudgetPassed(100);
    });

    it('passes 50 for a fixed $50 budget', async () => {
      await insertBudget({ allocationType: 'fixed', maximumAmount: 50 });
      await run();
      expectBudgetPassed(50);
    });

    it('passes null when the recipient has no budget', async () => {
      await run();
      expectBudgetPassed(null);
    });
  });

  // Every AI mode is told what is left of the recipient's budget for the
  // event's year, in the budget's currency (not a default $0-$100)
  describe('the AI modes', () => {
    const runMode = async (mode) => {
      const req = {
        user: { _id: user._id },
        query: {},
        body: { recipientId: String(recipient._id), eventId: String(event._id), [mode]: true }
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), headersSent: false };
      await generateGiftSuggestions(req, res, jest.fn());
    };
    const spend = (price) => Gift.collection.insertOne({
      user: user._id, recipient: recipient._id, event: event._id, name: 'Bought', price,
      status: 'purchased', purchaseDate: new Date(`${YEAR}-03-01T12:00:00Z`)
    });

    beforeEach(async () => {
      await OverallBudget.collection.updateOne({ user: user._id, year: YEAR }, { $set: { currency: 'EUR' } });
      getAISuggestions.mockResolvedValue([]);
      getEnhancedGiftSuggestions.mockResolvedValue([]);
      getWebEnhancedGiftSuggestions.mockResolvedValue([]);
    });

    it("basic mode's prompt asks for gifts within what is left, in euros", async () => {
      await insertBudget({ allocationType: 'fixed', maximumAmount: 150 });
      await spend(40);
      await runMode('basic');
      const prompt = getAISuggestions.mock.calls[0][0];
      expect(prompt).toContain('€110.00');
      expect(prompt).not.toMatch(/\$\d/);
    });

    it('basic mode does not invent a $100 limit when there is no budget', async () => {
      await runMode('basic');
      const prompt = getAISuggestions.mock.calls[0][0];
      expect(prompt).not.toContain('100.00');
      expect(prompt).toMatch(/no fixed budget/i);
    });

    it.each([
      ['enhanced', () => getEnhancedGiftSuggestions],
      ['webEnhanced', () => getWebEnhancedGiftSuggestions]
    ])('%s mode receives the same price guide', async (mode, service) => {
      await insertBudget({ allocationType: 'fixed', maximumAmount: 150 });
      await spend(40);
      await runMode(mode);
      const opts = service().mock.calls[0][3];
      expect(opts.priceGuide).toEqual({ min: 0, max: 110, currency: 'EUR' });
    });
  });
});
