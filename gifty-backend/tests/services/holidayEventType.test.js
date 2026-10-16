// Holiday logic must use the SYSTEM Holiday event type (createdBy null), never a
// user's custom type that happens to be named "Holiday" (names are unique per creator).
process.env.TZ = 'UTC';
const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const EventType = require('../../models/EventType');
const Event = require('../../models/Event');
const Holiday = require('../../models/Holiday');
const User = require('../../models/User');
require('../../models/Recipient');
require('../../models/Gift');
require('../../models/Notification');
const holidayService = require('../../services/holidayService');

const MONGO_URI = `mongodb://localhost:27017/gifty-test-holiday-type-${process.pid}`;
const oid = () => new mongoose.Types.ObjectId();

describe('holidayService uses the system Holiday event type', () => {
  let userA, userB, customHoliday, systemHoliday;

  beforeAll(async () => {
    await mongoose.connect(MONGO_URI);
    await EventType.syncIndexes();
  });
  afterAll(async () => { await teardownTestDB(); });

  beforeEach(async () => {
    await Promise.all([EventType, Event, Holiday, User].map((M) => M.deleteMany({})));
    userA = oid();
    userB = oid();
    // Custom type created FIRST so an unscoped findOne({name}) returns it
    customHoliday = await EventType.create({ name: 'Holiday', isCustom: true, createdBy: userA });
    systemHoliday = await EventType.create({ name: 'Holiday' });
  });

  const mkEvent = (user, type, name) => Event.collection.insertOne({
    user, type, name, recipient: oid(), date: new Date('2030-01-01'), isSystemGenerated: true
  });
  // Holidays switched off: every upcoming generated holiday event goes
  const holidaysOff = (id) => User.collection.insertOne({
    _id: id, email: `${id}@example.com`, preferences: { holidaySettings: { enabled: false } }
  });

  it('removes the caller\'s system-Holiday events', async () => {
    await holidaysOff(userB);
    await mkEvent(userB, systemHoliday._id, 'New Year');
    const result = await holidayService.updateUserHolidayEvents(userB);
    expect(result).toMatchObject({ success: true, removed: 1 });
    expect(await Event.collection.countDocuments({ user: userB })).toBe(0);
  });

  it('does not delete events of the user\'s own custom "Holiday" type', async () => {
    await holidaysOff(userA);
    await mkEvent(userA, customHoliday._id, 'My own thing');
    await mkEvent(userA, systemHoliday._id, 'Christmas');
    const result = await holidayService.updateUserHolidayEvents(userA);
    expect(result.removed).toBe(1);
    const left = await Event.collection.find({ user: userA }).toArray();
    expect(left.map((e) => e.name)).toEqual(['My own thing']);
  });

  it('generated holiday events get the system type _id', async () => {
    const user = await User.collection.insertOne({
      email: 'h@example.com', preferences: { holidaySettings: { enabled: true, countryCode: 'US', categories: ['national'] } }
    });
    await Holiday.collection.insertOne({
      name: 'Test Day', month: 12, day: 25, date: new Date('2030-12-25'), hasFixedDate: true,
      eventType: systemHoliday._id, countryCode: 'US', category: 'national', isActive: true
    });
    const result = await holidayService.generateHolidayEvents(user.insertedId);
    expect(result.success).toBe(true);
    const ev = await Event.collection.find({ user: user.insertedId }).toArray();
    expect(ev).toHaveLength(1);
    expect(String(ev[0].type)).toBe(String(systemHoliday._id));
  });
});
