// Holidays on a server east of UTC (Berlin): every event date is a calendar
// day stored as UTC midnight. Holidays used to be created at the server's
// local midnight (the evening before in UTC), so they showed a day early;
// the startup repair moves such dates onto their day. Real MongoDB.
const realProcess = require('vm').runInThisContext('process');
const { setTimeZone } = require('../utils/timeZone');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'Europe/Berlin';
realProcess.env.TZ = 'Europe/Berlin';

const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-holiday-dates-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const Event = require('../../models/Event');
const User = require('../../models/User');
const { seedEventTypes, seedHolidays } = require('../../utils/dbInitializer');
const { generateHolidayEvents } = require('../../services/holidayService');
const { repairLocalMidnightDates } = require('../../services/eventDateRepair');

jest.setTimeout(30000);

const DAY = 86400000;
let user;

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  setTimeZone(originalTZ);
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await seedEventTypes();
  await seedHolidays();
  user = await User.create({
    username: 'berlin', email: 'b@example.com', password: 'Passw0rd!x', firstName: 'B', lastName: 'E',
    preferences: { holidaySettings: { enabled: true, countryCode: 'DE', categories: ['national', 'religious'], defaultRemindDaysBefore: 7 } }
  });
});

describe('generateHolidayEvents', () => {
  it('puts each holiday on its own day', async () => {
    await generateHolidayEvents(user._id);

    const events = await Event.find({ user: user._id, isSystemGenerated: true }).lean();
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) expect(event.date.getTime() % DAY).toBe(0);
    const day = (name) => events.find((e) => e.name === name).date.toISOString().slice(5, 10);
    expect(day('Tag der Deutschen Einheit')).toBe('10-03');
    expect(day('Weihnachten')).toBe('12-25');
    expect(day('Neujahrstag')).toBe('01-01');
  });

  it('sets the reminder at 9:00 local time, the configured days before', async () => {
    await generateHolidayEvents(user._id);

    const xmas = await Event.findOne({ user: user._id, name: 'Weihnachten' }).lean();
    const reminder = xmas.reminder.time;
    expect(reminder.getHours()).toBe(9);
    expect(reminder.getDate()).toBe(18);
    expect(reminder.getMonth()).toBe(11);
  });

  it('does not add a holiday twice', async () => {
    await generateHolidayEvents(user._id);
    const first = await Event.countDocuments({ user: user._id });

    await generateHolidayEvents(user._id);

    expect(await Event.countDocuments({ user: user._id })).toBe(first);
  });
});

describe('repairLocalMidnightDates', () => {
  const insert = (name, date, recurring) => Event.collection.insertOne({
    user: user._id, recipient: new mongoose.Types.ObjectId(), type: new mongoose.Types.ObjectId(), name, date,
    ...(recurring ? { recurring } : {})
  });
  const dayOf = async (name) => (await Event.findOne({ name }).lean());

  it('moves dates stored at the server\'s local midnight onto their day, and leaves the rest', async () => {
    // Berlin midnight on Oct 3 is Oct 2, 22:00 UTC
    await insert('Unity day', new Date(2027, 9, 3));
    await insert('Form event', new Date('2027-10-03T00:00:00Z'));
    await insert('Timed', new Date('2027-10-03T15:00:00Z'));
    await insert('Club', new Date(2027, 0, 4), {
      frequency: 'Weekly', until: new Date(2027, 0, 25), exceptions: [new Date(2027, 0, 11), new Date('2027-01-18T00:00:00Z')]
    });

    const repaired = await repairLocalMidnightDates();

    expect(repaired).toBe(2);
    expect((await dayOf('Unity day')).date.toISOString()).toBe('2027-10-03T00:00:00.000Z');
    expect((await dayOf('Form event')).date.toISOString()).toBe('2027-10-03T00:00:00.000Z');
    expect((await dayOf('Timed')).date.toISOString()).toBe('2027-10-03T15:00:00.000Z');
    const club = await dayOf('Club');
    expect(club.date.toISOString()).toBe('2027-01-04T00:00:00.000Z');
    expect(club.recurring.until.toISOString()).toBe('2027-01-25T00:00:00.000Z');
    expect(club.recurring.exceptions.map((d) => d.toISOString())).toEqual(['2027-01-11T00:00:00.000Z', '2027-01-18T00:00:00.000Z']);

    expect(await repairLocalMidnightDates()).toBe(0);
  });

  it('moves holidays onto their day even when the data was written under another time zone', async () => {
    // Created at midnight in Tokyo (15:00 UTC the day before), read on a Berlin server
    await Event.collection.insertOne({
      user: user._id, recipient: new mongoose.Types.ObjectId(), type: new mongoose.Types.ObjectId(),
      name: 'Holiday from elsewhere', date: new Date('2027-10-02T15:00:00Z'), isSystemGenerated: true
    });
    await insert('User event at 15:00', new Date('2027-10-02T15:00:00Z'));

    await repairLocalMidnightDates();

    expect((await dayOf('Holiday from elsewhere')).date.toISOString()).toBe('2027-10-03T00:00:00.000Z');
    expect((await dayOf('User event at 15:00')).date.toISOString()).toBe('2027-10-02T15:00:00.000Z');
  });
});
