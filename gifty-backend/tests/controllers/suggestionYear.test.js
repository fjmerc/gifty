// See the describe below.
const realProcess = require('vm').runInThisContext('process');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'America/Los_Angeles';
realProcess.env.TZ = 'America/Los_Angeles';
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
require('../../models/Tags');
const { Budget, OverallBudget } = require('../../models/Budget');
const { getAISuggestions } = require('../../services/aiService');
const { generateGiftSuggestions } = require('../../controllers/giftController');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-suggestion-year-${process.pid}`;

// Event dates are calendar days stored at UTC midnight. On a server west of
// UTC, a New Year's Day event read in local time falls in the previous year.
describe('the price guide year of an event on January 1st (server west of UTC)', () => {
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (originalTZ === undefined) delete realProcess.env.TZ; else realProcess.env.TZ = originalTZ;
  });

  it("uses the event's own year", async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(MONGO_URI);
    getAISuggestions.mockResolvedValue([]);
    const user = await User.create({ username: 'ny-year', firstName: 'N', lastName: 'Y', email: 'ny-year@example.com', password: 'Password123!' });
    const recipient = await Recipient.create({ user: user._id, firstName: 'Ann', lastName: 'Gift', relation: 'Friend', relationship: 'friendship', birthdate: new Date('1985-05-05') });
    const type = await EventType.create({ name: 'NewYear-sugg', isCustom: false });
    const event = await Event.create({ user: user._id, recipient: recipient._id, name: 'New Year', date: new Date('2032-01-01T00:00:00Z'), type: type._id });
    await OverallBudget.collection.insertMany([
      { user: user._id, year: 2031, amount: 1000, isLimited: true, currency: 'USD' },
      { user: user._id, year: 2032, amount: 1000, isLimited: true, currency: 'EUR' }
    ]);
    await Budget.collection.insertMany([
      { user: user._id, recipient: recipient._id, year: 2031, allocationType: 'fixed', maximumAmount: 40, minimumAmount: 0, isLimited: true },
      { user: user._id, recipient: recipient._id, year: 2032, allocationType: 'fixed', maximumAmount: 80, minimumAmount: 0, isLimited: true }
    ]);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    await generateGiftSuggestions({ user: { _id: user._id }, query: {}, body: { recipientId: String(recipient._id), eventId: String(event._id) } }, res, jest.fn());
    const prompt = getAISuggestions.mock.calls[0][0];
    expect(prompt).toContain('€80.00');
    expect(prompt).toContain('1/1/2032');
  });
});
