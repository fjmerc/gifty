// Installs from before 2026-10 seeded every holiday with a fixed month/day,
// so floating holidays (Thanksgiving, Mother's Day, Easter-relative days)
// were generated on the wrong day, and seeding never ran again once any
// holiday existed. Upgrading must correct the definitions and the holiday
// events already generated from them. Real MongoDB.
const realProcess = require('vm').runInThisContext('process');
process.env.TZ = 'Europe/Berlin';
realProcess.env.TZ = 'Europe/Berlin';

const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-holiday-upgrade-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
const Gift = require('../../models/Gift');
const Holiday = require('../../models/Holiday');
const User = require('../../models/User');
const { seedHolidays } = require('../../utils/dbInitializer');
const { realignHolidayEvents } = require('../../services/eventDateRepair');

jest.setTimeout(30000);

const day = (s) => new Date(`${s}T00:00:00.000Z`);
let holidayType;
let us;
let de;

// A holiday event as the old generator wrote it
const holidayEvent = (user, name, date, extra = {}) => Event.collection.insertOne({
  _id: new mongoose.Types.ObjectId(), user: user._id, recipient: new mongoose.Types.ObjectId(), name,
  date: day(date), type: holidayType._id, isSystemGenerated: true,
  recurring: { frequency: 'None', exceptions: [] },
  reminder: { isSet: true, time: new Date(day(date).getTime() - 7 * 86400000 + 8 * 3600000), method: 'Email' },
  createdAt: new Date('2025-05-12'), ...extra
}).then((r) => r.insertedId);

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
  await mongoose.connection.db.dropDatabase();
  holidayType = await EventType.create({ name: 'Holiday', isCustom: false });
  const old = (name, month, dayOfMonth, countryCode) => ({
    name, month, day: dayOfMonth, countryCode, hasFixedDate: true, category: 'national',
    date: new Date(2025, month - 1, dayOfMonth), eventType: holidayType._id, isActive: true
  });
  await Holiday.collection.insertMany([
    old('Thanksgiving', 11, 27, 'US'), old('Christmas Day', 12, 25, 'US'), old('Vatertag', 5, 21, 'DE')
  ]);
  const settings = (countryCode) => ({ holidaySettings: { enabled: true, countryCode, categories: ['national', 'cultural'] } });
  us = await User.create({ username: 'us', email: 'us@example.com', password: 'Passw0rd!x', firstName: 'U', lastName: 'S', preferences: settings('US') });
  de = await User.create({ username: 'de', email: 'de@example.com', password: 'Passw0rd!x', firstName: 'D', lastName: 'E', preferences: settings('DE') });
});

afterAll(async () => {
  await teardownTestDB();
});

describe('upgrading holidays seeded with fixed dates', () => {
  let thanksgiving;
  let christmas;
  let ownThanksgiving;
  let vatertag;
  let vatertagCopy;
  let vatertagWithGift;

  beforeAll(async () => {
    thanksgiving = await holidayEvent(us, 'Thanksgiving', '2026-11-27');
    christmas = await holidayEvent(us, 'Christmas Day', '2026-12-25');
    // The user's own event of the same name is not the generator's to move
    ownThanksgiving = await holidayEvent(us, 'Thanksgiving', '2026-11-27', { isSystemGenerated: false });
    // Generated twice on the same wrong day; one copy holds a gift
    vatertag = await holidayEvent(de, 'Vatertag', '2026-05-21');
    vatertagCopy = await holidayEvent(de, 'Vatertag', '2026-05-21', { createdAt: new Date('2025-08-16') });
    vatertagWithGift = await holidayEvent(de, 'Vatertag', '2027-05-21');
    await Gift.collection.insertOne({ user: de._id, event: vatertagWithGift, name: 'Tie', price: 20, status: 'saved' });
  });

  it('gives the stored definitions their formulas', async () => {
    await seedHolidays();

    const stored = await Holiday.findOne({ name: 'Thanksgiving', countryCode: 'US' }).lean();
    expect(stored).toMatchObject({ hasFixedDate: false, formula: 'nth-weekday:11:4:4' });
    expect(await Holiday.findOne({ name: 'Christmas Day' }).lean()).toMatchObject({ hasFixedDate: true, month: 12, day: 25 });
    // The holidays the old seed never had are added
    expect(await Holiday.exists({ name: 'Karfreitag', countryCode: 'DE' })).toBeTruthy();
  });

  it('moves generated holiday events onto their real day, with their reminders', async () => {
    const moved = await realignHolidayEvents();

    const get = (id) => Event.collection.findOne({ _id: id });
    const t = await get(thanksgiving);
    expect(t.date).toEqual(day('2026-11-26'));
    expect(t.reminder.time).toEqual(new Date(day('2026-11-26').getTime() - 7 * 86400000 + 8 * 3600000));
    expect((await get(christmas)).date).toEqual(day('2026-12-25'));
    expect((await get(ownThanksgiving)).date).toEqual(day('2026-11-27'));
    expect((await get(vatertagWithGift)).date).toEqual(day('2027-05-06'));
    expect(moved).toBe(3);
  });

  it('keeps one event when two copies land on the same day', async () => {
    const left = await Event.collection.find({ user: de._id, name: 'Vatertag', date: day('2026-05-14') }).toArray();
    expect(left.map((e) => String(e._id))).toEqual([String(vatertag)]);
    expect(await Event.collection.countDocuments({ _id: vatertagCopy })).toBe(0);
  });

  it('changes nothing when run again', async () => {
    expect(await seedHolidays()).toMatchObject({ created: 0, updated: 0 });
    expect(await realignHolidayEvents()).toBe(0);
  });
});
