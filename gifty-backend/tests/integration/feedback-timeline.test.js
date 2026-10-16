// Feedback timeline buckets against real MongoDB: days, ISO weeks and months
// are counted in the instance time zone, and every bucket carries the ISO
// date it starts on (the chart labels them from that).
const realProcess = require('vm').runInThisContext('process');
const { setTimeZone } = require('../utils/timeZone');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'America/Los_Angeles';
realProcess.env.TZ = 'America/Los_Angeles';

const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const FeedbackLog = require('../../models/FeedbackLog');
const trendAnalysisService = require('../../services/trendAnalysisService');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-feedback-timeline-${process.pid}`;

jest.setTimeout(30000);

const log = (timestamp, action = 'saved', explicitRating) => ({
  gift: new mongoose.Types.ObjectId(),
  user: new mongoose.Types.ObjectId(),
  recipient: new mongoose.Types.ObjectId(),
  action,
  timestamp: new Date(timestamp),
  ...(explicitRating ? { explicitRating } : {})
});

const range = { startDate: new Date('2026-12-01T00:00:00Z'), endDate: new Date('2027-02-01T00:00:00Z') };
const buckets = (result) => result.map(({ date, period, total }) => ({ date, period, total }));

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  await FeedbackLog.insertMany([
    // Thu Dec 31 2026, 8 PM in Los Angeles (Jan 1 in UTC)
    log('2027-01-01T04:00:00Z', 'purchased', 4),
    // Fri Jan 1 2027, noon in Los Angeles
    log('2027-01-01T20:00:00Z', 'saved', 2),
    // Mon Jan 4 2027
    log('2027-01-04T20:00:00Z', 'ignored')
  ]);
});

afterAll(async () => {
  await teardownTestDB();
  setTimeZone(originalTZ);
});

describe('getTimeBasedTrends', () => {
  it('counts each day in the instance time zone', async () => {
    const result = await trendAnalysisService.getTimeBasedTrends(range, 'day');
    expect(buckets(result)).toEqual([
      { date: '2026-12-31', period: 'day', total: 1 },
      { date: '2027-01-01', period: 'day', total: 1 },
      { date: '2027-01-04', period: 'day', total: 1 }
    ]);
    expect(result[0]).toMatchObject({ purchased: 1, averageRating: 4, positiveRate: 1 });
  });

  it('groups ISO weeks across New Year under the Monday they start on', async () => {
    const result = await trendAnalysisService.getTimeBasedTrends(range, 'week');
    expect(buckets(result)).toEqual([
      { date: '2026-12-28', period: 'week', total: 2 },
      { date: '2027-01-04', period: 'week', total: 1 }
    ]);
  });

  it('groups months under their first day', async () => {
    const result = await trendAnalysisService.getTimeBasedTrends(range, 'month');
    expect(buckets(result)).toEqual([
      { date: '2026-12-01', period: 'month', total: 1 },
      { date: '2027-01-01', period: 'month', total: 2 }
    ]);
  });

  it('treats an unknown grouping as days', async () => {
    const result = await trendAnalysisService.getTimeBasedTrends(range, 'fortnight');
    expect(result.every((b) => b.period === 'day')).toBe(true);
  });
});
