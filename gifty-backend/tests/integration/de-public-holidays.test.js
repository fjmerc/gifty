// In Germany Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag and
// both Christmas days are nationwide public holidays: they belong with the
// public (national) holidays a new account gets by default, not with the
// religious observances that are off by default. Existing installs get the
// corrected definitions, and their German accounts the missing events, once.
// Real MongoDB.
const realProcess = require('vm').runInThisContext('process');
process.env.TZ = 'Europe/Berlin';
realProcess.env.TZ = 'Europe/Berlin';

const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-de-holidays-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const Event = require('../../models/Event');
const Holiday = require('../../models/Holiday');
const User = require('../../models/User');
const { seedHolidays } = require('../../utils/dbInitializer');
const { generateHolidayEvents } = require('../../services/holidayService');
const { addGermanPublicHolidays } = require('../../services/holidayCategoryUpgrade');

jest.setTimeout(30000);

const PUBLIC_DE = ['Neujahrstag', 'Karfreitag', 'Ostermontag', 'Tag der Arbeit', 'Christi Himmelfahrt',
  'Pfingstmontag', 'Tag der Deutschen Einheit', 'Weihnachten', 'Zweiter Weihnachtsfeiertag'];
const ymd = (d) => d.toISOString().slice(0, 10);
let seq = 0;
const deUser = (holidaySettings = {}) => {
  seq += 1;
  return User.create({
    username: `de${seq}`, email: `de${seq}@example.com`, password: 'Passw0rd!x', firstName: 'D', lastName: 'E',
    preferences: { holidaySettings: { enabled: true, countryCode: 'DE', categories: ['national', 'cultural'], ...holidaySettings } }
  });
};
const eventsOf = async (user) => (await Event.find({ user: user._id }).lean()).map((e) => [e.name, ymd(e.date)]);

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});
beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});
afterAll(async () => {
  await teardownTestDB();
});

describe('German public holidays', () => {
  it('are all in the public (national) category; Muttertag is not', async () => {
    await seedHolidays();
    const national = (await Holiday.find({ countryCode: 'DE', category: 'national' }).lean()).map((h) => h.name).sort();
    expect(national).toEqual([...PUBLIC_DE].sort());
    expect((await Holiday.findOne({ countryCode: 'DE', name: 'Muttertag' }).lean()).category).not.toBe('national');
  });

  it.each([
    [2026, { Karfreitag: '2026-04-03', Ostermontag: '2026-04-06', 'Christi Himmelfahrt': '2026-05-14', Pfingstmontag: '2026-05-25', Weihnachten: '2026-12-25', 'Zweiter Weihnachtsfeiertag': '2026-12-26' }],
    [2027, { Karfreitag: '2027-03-26', Ostermontag: '2027-03-29', 'Christi Himmelfahrt': '2027-05-06', Pfingstmontag: '2027-05-17', Weihnachten: '2027-12-25', 'Zweiter Weihnachtsfeiertag': '2027-12-26' }]
  ])('a new German account gets them by default, on the right days in %i', async (year, expected) => {
    await seedHolidays();
    const user = await deUser();

    await generateHolidayEvents(user._id, { now: new Date(`${year}-01-02T12:00:00Z`) });

    const events = Object.fromEntries(await eventsOf(user));
    for (const [name, date] of Object.entries(expected)) expect([name, events[name]]).toEqual([name, date]);
    expect(Object.keys(events).sort()).toEqual([...PUBLIC_DE, 'Muttertag', 'Vatertag'].sort());
  });
});

describe('upgrading an install seeded with the old categories', () => {
  const oldCategories = async () => {
    await seedHolidays();
    await Holiday.updateMany(
      { countryCode: 'DE', name: { $in: ['Karfreitag', 'Ostermontag', 'Christi Himmelfahrt', 'Pfingstmontag', 'Weihnachten', 'Zweiter Weihnachtsfeiertag'] } },
      { $set: { category: 'religious' } }
    );
  };

  it('corrects the stored definitions on the next start', async () => {
    await oldCategories();
    await seedHolidays();
    expect(await Holiday.countDocuments({ countryCode: 'DE', category: 'national' })).toBe(PUBLIC_DE.length);
  });

  it('adds the missing events to German accounts once, and leaves others alone', async () => {
    await oldCategories();
    const now = new Date('2026-01-02T12:00:00Z');
    const de = await deUser();
    const off = await deUser({ enabled: false });
    const us = await User.create({ username: 'us', email: 'us@example.com', password: 'Passw0rd!x', firstName: 'U', lastName: 'S', preferences: { holidaySettings: { enabled: true, countryCode: 'US', categories: ['national', 'cultural'] } } });
    await generateHolidayEvents(de._id, { now });
    await generateHolidayEvents(us._id, { now });
    expect((await eventsOf(de)).map(([n]) => n)).not.toContain('Karfreitag');
    const usBefore = await Event.countDocuments({ user: us._id });

    await seedHolidays();
    const first = await addGermanPublicHolidays({ now });

    expect(first.usersUpdated).toBe(1);
    const names = (await eventsOf(de)).map(([n]) => n);
    for (const name of PUBLIC_DE) expect(names).toContain(name);
    expect(await Event.countDocuments({ user: off._id })).toBe(0);
    expect(await Event.countDocuments({ user: us._id })).toBe(usBefore);

    // Once only: a holiday the user deleted afterwards is not brought back
    await Event.deleteOne({ user: de._id, name: 'Karfreitag' });
    const second = await addGermanPublicHolidays({ now });
    expect(second.skipped).toBe(true);
    expect((await eventsOf(de)).map(([n]) => n)).not.toContain('Karfreitag');
  });
});
