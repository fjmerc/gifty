// Changing holiday settings (or "Refresh Holidays") used to delete every
// holiday event and generate the next ones again: past holidays, events the
// user filed under the Holiday type themselves, and holidays with gifts were
// lost, and their gifts and reminders pointed at nothing. Holiday events also
// never moved on to the next year. Real MongoDB, instance in Berlin.
const realProcess = require('vm').runInThisContext('process');
process.env.TZ = 'Europe/Berlin';
realProcess.env.TZ = 'Europe/Berlin';

const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-holiday-settings-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const Event = require('../../models/Event');
const EventType = require('../../models/EventType');
const Gift = require('../../models/Gift');
const Holiday = require('../../models/Holiday');
const Notification = require('../../models/Notification');
const Recipient = require('../../models/Recipient');
const User = require('../../models/User');
const {
  generateHolidayEvents, updateUserHolidayEvents, regenerateAllHolidayEvents
} = require('../../services/holidayService');

jest.setTimeout(30000);

const day = (s) => new Date(`${s}T00:00:00.000Z`);
// 09:00 in Berlin, n days before a calendar day
const nineAm = (s, daysBefore) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d - daysBefore, 9, 0, 0, 0);
};
const NOW = new Date('2026-10-15T10:00:00+02:00');

let holidayType;
let user;
let seq = 0;

const holiday = (name, month, dayOfMonth, countryCode, category) => ({
  name, month, day: dayOfMonth, countryCode, category, hasFixedDate: true,
  date: new Date(2026, month - 1, dayOfMonth), eventType: holidayType._id, isActive: true
});

const settings = (overrides = {}) => ({
  enabled: true, countryCode: 'DE', categories: ['national', 'religious'], defaultRemindDaysBefore: 7, ...overrides
});

// Save new settings the way the preferences route does, then sync
const changeSettings = async (overrides, now = NOW) => {
  const before = (await User.findById(user._id).lean()).preferences.holidaySettings;
  await User.updateOne({ _id: user._id }, { $set: { 'preferences.holidaySettings': settings(overrides) } });
  return updateUserHolidayEvents(user._id, { previous: before, now });
};

const eventsNamed = (name) => Event.find({ user: user._id, name }).sort({ date: 1 }).lean();

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  holidayType = await EventType.create({ name: 'Holiday', isCustom: false });
  await Holiday.insertMany([
    holiday('Tag der Deutschen Einheit', 10, 3, 'DE', 'national'),
    holiday('Weihnachten', 12, 25, 'DE', 'national'),
    holiday('Allerheiligen', 11, 1, 'DE', 'religious'),
    holiday('Heilige Drei Koenige', 1, 6, 'DE', 'religious'),
    holiday('Thanksgiving Fixed', 11, 26, 'US', 'national')
  ]);
  seq += 1;
  user = await User.create({
    username: `hs${seq}`, email: `hs${seq}@example.com`, password: 'Passw0rd!x', firstName: 'H', lastName: 'S',
    preferences: { holidaySettings: settings() }
  });
  await generateHolidayEvents(user._id, { now: NOW });
});

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
});

describe('generating holiday events', () => {
  it('creates the next occurrence of each chosen holiday with a 09:00 reminder', async () => {
    const events = await Event.find({ user: user._id }).sort({ date: 1 }).lean();
    expect(events.map((e) => [e.name, e.date.toISOString().slice(0, 10)])).toEqual([
      ['Allerheiligen', '2026-11-01'],
      ['Weihnachten', '2026-12-25'],
      ['Heilige Drei Koenige', '2027-01-06'],
      ['Tag der Deutschen Einheit', '2027-10-03']
    ]);
    const xmas = events.find((e) => e.name === 'Weihnachten');
    expect(xmas.reminder.time).toEqual(nineAm('2026-12-25', 7));
  });
});

describe('changing holiday settings', () => {
  let past;
  let pastGift;
  let ownHoliday;

  beforeEach(async () => {
    const recipient = await Recipient.findOne({ user: user._id, isSystemAccount: true });
    // This year's Easter, already over, with the gift bought for it
    past = await Event.create({
      user: user._id, recipient: recipient._id, name: 'Ostersonntag', date: day('2026-04-05'),
      type: holidayType._id, isSystemGenerated: true
    });
    pastGift = await Gift.create({ user: user._id, recipient: recipient._id, event: past._id, name: 'Eggs', price: 10, status: 'purchased', purchaseDate: day('2026-04-01') });
    // An event the user filed under the Holiday type
    ownHoliday = await Event.create({
      user: user._id, recipient: recipient._id, name: 'Oma Namenstag', date: day('2026-12-01'), type: holidayType._id
    });
  });

  const untouched = async () => {
    expect(await Event.exists({ _id: past._id })).toBeTruthy();
    expect(await Gift.exists({ _id: pastGift._id })).toBeTruthy();
    expect(await Event.exists({ _id: ownHoliday._id })).toBeTruthy();
  };

  it('changing only the reminder days moves the reminders and recreates nothing', async () => {
    const xmas = (await eventsNamed('Weihnachten'))[0];
    // A reminder the user set by hand stays as they set it
    const handSet = new Date('2026-10-30T07:00:00.000Z');
    await Event.updateOne({ name: 'Allerheiligen', user: user._id }, { $set: { 'reminder.time': handSet } });

    const result = await changeSettings({ defaultRemindDaysBefore: 3 });

    expect(result).toMatchObject({ success: true, created: 0, removed: 0, keptWithGifts: 0 });
    const after = (await eventsNamed('Weihnachten'))[0];
    expect(String(after._id)).toBe(String(xmas._id));
    expect(after.reminder.time).toEqual(nineAm('2026-12-25', 3));
    expect((await eventsNamed('Allerheiligen'))[0].reminder.time).toEqual(handSet);
    await untouched();
  });

  it('a reminder that already went out is not moved, so it is not sent again', async () => {
    // Allerheiligen's 7-day reminder (2026-10-25) went out; it is now 2026-10-28
    const later = new Date('2026-10-28T10:00:00+01:00');
    const result = await changeSettings({ defaultRemindDaysBefore: 3 }, later);

    expect(result.success).toBe(true);
    expect((await eventsNamed('Allerheiligen'))[0].reminder.time).toEqual(nineAm('2026-11-01', 7));
    expect((await eventsNamed('Weihnachten'))[0].reminder.time).toEqual(nineAm('2026-12-25', 3));
  });

  it('a longer reminder that would already be past keeps the reminder that still lies ahead', async () => {
    // Dec 20: Weihnachten's reminder at 7 days (Dec 18) would never go out; Dec 22 (3 days) still will
    await changeSettings({ defaultRemindDaysBefore: 3 });
    const dec20 = new Date('2026-12-20T10:00:00+01:00');
    await changeSettings({ defaultRemindDaysBefore: 7 }, dec20);

    expect((await eventsNamed('Weihnachten'))[0].reminder.time).toEqual(nineAm('2026-12-25', 3));
  });

  it('dropping a category removes its upcoming events, but not one with gifts', async () => {
    const allerheiligen = (await eventsNamed('Allerheiligen'))[0];
    const recipient = await Recipient.findOne({ user: user._id, isSystemAccount: true });
    await Gift.create({ user: user._id, recipient: recipient._id, event: allerheiligen._id, name: 'Candle', price: 5, status: 'saved' });
    const koenige = (await eventsNamed('Heilige Drei Koenige'))[0];
    await Notification.create({ user: user._id, event: koenige._id, notificationType: 'alert', notificationDate: NOW });

    const result = await changeSettings({ categories: ['national'] });

    expect(result).toMatchObject({ success: true, created: 0, removed: 1, keptWithGifts: 1 });
    expect(await eventsNamed('Heilige Drei Koenige')).toHaveLength(0);
    expect(await Notification.countDocuments({ event: koenige._id })).toBe(0);
    expect(await eventsNamed('Allerheiligen')).toHaveLength(1);
    expect(await eventsNamed('Weihnachten')).toHaveLength(1);
    await untouched();
  });

  it('switching country replaces upcoming holidays and keeps the past and the user\'s own', async () => {
    const result = await changeSettings({ countryCode: 'US', categories: ['national'] });

    expect(result).toMatchObject({ success: true, created: 1, removed: 4, keptWithGifts: 0 });
    expect(await eventsNamed('Weihnachten')).toHaveLength(0);
    expect((await eventsNamed('Thanksgiving Fixed')).map((e) => e.date)).toEqual([day('2026-11-26')]);
    await untouched();
  });

  it('switching holidays off removes upcoming ones without gifts and keeps the rest', async () => {
    const result = await changeSettings({ enabled: false });

    expect(result).toMatchObject({ success: true, created: 0, removed: 4 });
    await untouched();
  });

  it('a category list in another order changes nothing', async () => {
    const result = await changeSettings({ categories: ['religious', 'national'] });
    expect(result).toMatchObject({ success: true, created: 0, removed: 0 });
  });

  it('refreshing twice changes nothing', async () => {
    const first = await updateUserHolidayEvents(user._id, { now: NOW });
    const second = await updateUserHolidayEvents(user._id, { now: NOW });
    expect(first).toMatchObject({ success: true, created: 0, removed: 0 });
    expect(second).toMatchObject({ success: true, created: 0, removed: 0 });
    await untouched();
  });
});

describe('the yearly roll-forward', () => {
  const after = new Date('2026-12-27T10:00:00+01:00');

  it('adds next year\'s holiday once this year\'s has passed, and keeps this year\'s', async () => {
    const result = await regenerateAllHolidayEvents({ now: after });

    expect(result.totalCreated).toBeGreaterThanOrEqual(1);
    const xmas = await eventsNamed('Weihnachten');
    expect(xmas.map((e) => e.date)).toEqual([day('2026-12-25'), day('2027-12-25')]);
    expect(xmas[1].reminder.time).toEqual(nineAm('2027-12-25', 7));
  });

  it('does it once: a next-year holiday the user deletes stays deleted', async () => {
    await regenerateAllHolidayEvents({ now: after });
    await Event.deleteOne({ user: user._id, name: 'Weihnachten', date: day('2027-12-25') });

    await regenerateAllHolidayEvents({ now: new Date('2027-01-01T10:00:00+01:00') });

    expect((await eventsNamed('Weihnachten')).map((e) => e.date)).toEqual([day('2026-12-25')]);
  });

  it('does not bring back an upcoming holiday the user deleted', async () => {
    await Event.deleteOne({ user: user._id, name: 'Allerheiligen' });

    const result = await regenerateAllHolidayEvents({ now: NOW });

    expect(result.totalCreated).toBe(0);
    expect(await eventsNamed('Allerheiligen')).toHaveLength(0);
  });

  it('does not add holidays the user never had', async () => {
    await Holiday.create(holiday('Neu Feiertag', 12, 1, 'DE', 'national'));
    await regenerateAllHolidayEvents({ now: after });
    expect(await eventsNamed('Neu Feiertag')).toHaveLength(0);
  });

  it('is part of the monthly calendar job', async () => {
    const { calendarUpkeep } = require('../../services/dataUpgrade');
    // This year's Weihnachten is over (moved into the past for the test)
    await Event.updateOne({ user: user._id, name: 'Weihnachten' }, { $set: { date: day('2025-12-25') } });

    const result = await calendarUpkeep();

    expect(result.holidaysCreated).toBeGreaterThanOrEqual(1);
    expect((await eventsNamed('Weihnachten')).map((e) => e.date)).toEqual([day('2025-12-25'), day('2026-12-25')]);
  });

  it('skips users who switched holidays off', async () => {
    await User.updateOne({ _id: user._id }, { $set: { 'preferences.holidaySettings.enabled': false } });
    const result = await regenerateAllHolidayEvents({ now: after });
    expect(result.totalCreated).toBe(0);
  });
});

describe('an account that never saved holiday settings', () => {
  it('Refresh Holidays keeps its holidays instead of removing and recreating them', async () => {
    await User.updateOne({ _id: user._id }, { $unset: { 'preferences.holidaySettings': 1 } });
    // The defaults (US, national and cultural) apply
    const first = await updateUserHolidayEvents(user._id, { now: NOW });
    const ids = (await Event.find({ user: user._id, isSystemGenerated: true }).lean()).map((e) => String(e._id)).sort();

    const second = await updateUserHolidayEvents(user._id, { now: NOW });

    expect(first.success).toBe(true);
    expect(second).toMatchObject({ success: true, created: 0, removed: 0 });
    expect((await Event.find({ user: user._id, isSystemGenerated: true }).lean()).map((e) => String(e._id)).sort()).toEqual(ids);
  });
});

describe('PUT /api/users/preferences with holiday settings', () => {
  const { updateUserPreferences } = require('../../controllers/userController');

  const put = async (holidaySettings) => {
    const req = { user: { _id: user._id }, body: { preferences: { holidaySettings } } };
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    let error = null;
    await updateUserPreferences(req, res, (e) => { error = e; });
    return { res, error };
  };

  it('returns what happened to the holiday events', async () => {
    const { res, error } = await put(settings({ categories: ['national'] }));
    expect(error).toBeNull();
    expect(res.body.holidays).toMatchObject({ success: true, created: 0, removed: 2 });
  });

  it('moves reminders when only the reminder days change', async () => {
    const { res } = await put(settings({ defaultRemindDaysBefore: 3 }));
    expect(res.body.holidays).toMatchObject({ success: true, removed: 0 });
    expect(res.body.holidays.remindersMoved).toBeGreaterThan(0);
  });

  it('does not touch the holiday events when the same settings come back in another order', async () => {
    const { res } = await put(settings({ categories: ['religious', 'national'] }));
    expect(res.body.holidays).toBeUndefined();
  });

  it.each([
    ['an unknown country', { countryCode: 'XX' }, /country/i],
    ['an unknown category', { categories: ['national', 'party'] }, /categor/i],
    ['zero reminder days', { defaultRemindDaysBefore: 0 }, /between 1 and 30/i],
    ['a fractional reminder day count', { defaultRemindDaysBefore: 2.5 }, /between 1 and 30/i],
    ['a reminder day count as text', { defaultRemindDaysBefore: 'soon' }, /between 1 and 30/i]
  ])('refuses %s and changes nothing', async (label, overrides, message) => {
    const before = await Event.countDocuments({ user: user._id });
    const { error } = await put(settings(overrides));
    expect(error).toMatchObject({ statusCode: 400 });
    expect(error.message).toMatch(message);
    expect((await User.findById(user._id).lean()).preferences.holidaySettings.countryCode).toBe('DE');
    expect(await Event.countDocuments({ user: user._id })).toBe(before);
  });

  it('takes a partial update as a change to only those fields', async () => {
    const { res, error } = await put({ defaultRemindDaysBefore: 5 });
    expect(error).toBeNull();
    const stored = (await User.findById(user._id).lean()).preferences.holidaySettings;
    expect(stored).toMatchObject({ countryCode: 'DE', categories: ['national', 'religious'], defaultRemindDaysBefore: 5, enabled: true });
    expect(res.body.holidays).toMatchObject({ success: true, removed: 0 });
  });
});

describe('POST /api/settings/user-preferences', () => {
  const { updateUserPreferences } = require('../../controllers/settingsController');

  const post = async (body) => {
    const req = { user: { _id: user._id }, body };
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (json) => { res.body = json; return res; };
    let error = null;
    await updateUserPreferences(req, res, (e) => { error = e; });
    return { res, error };
  };

  it('leaves holiday settings to the holiday route, which checks them and updates the events', async () => {
    const before = await Event.countDocuments({ user: user._id });
    const { error } = await post({ theme: 'dark', holidaySettings: { enabled: true, countryCode: 'XX', categories: ['party'], defaultRemindDaysBefore: -5 } });

    expect(error).toBeNull();
    const stored = (await User.findById(user._id).lean()).preferences;
    expect(stored.theme).toBe('dark');
    expect(stored.holidaySettings).toMatchObject({ countryCode: 'DE', categories: ['national', 'religious'], defaultRemindDaysBefore: 7 });
    expect(await Event.countDocuments({ user: user._id })).toBe(before);
  });
});

describe('PUT /api/users/preferences and AI settings', () => {
  const { updateUserPreferences } = require('../../controllers/userController');

  it('leaves the AI provider and model to the settings route, which checks them', async () => {
    const req = { user: { _id: user._id }, body: { preferences: { aiProvider: 'nonsense', aiModel: 'nope', theme: 'dark' } } };
    const res = { status: () => res, json: () => res };
    await updateUserPreferences(req, res, () => {});

    const stored = (await User.findById(user._id).lean()).preferences;
    expect(stored.theme).toBe('dark');
    expect(stored.aiProvider).not.toBe('nonsense');
    expect(stored.aiModel).not.toBe('nope');
  });
});
