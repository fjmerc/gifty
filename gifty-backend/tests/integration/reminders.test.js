// Event reminders against real MongoDB: the minute job sends a reminder once
// it is due (not before), once, and the email names the event's calendar day.
// Only the mail transport is stubbed.
const realProcess = require('vm').runInThisContext('process');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'America/New_York';
realProcess.env.TZ = 'America/New_York';

const mongoose = require('mongoose');
const { teardownTestDB } = require('../utils/testSetup');

const TEST_DB_URI = `mongodb://localhost:27017/gifty-test-reminders-${process.pid}`;

jest.mock('../../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const emailService = require('../../services/emailService');
const { processReminders } = require('../../services/notificationService');
const { processMissedNotifications } = require('../../services/catchupService');
const Event = require('../../models/Event');
const Notification = require('../../models/Notification');
const Recipient = require('../../models/Recipient');
const User = require('../../models/User');

jest.setTimeout(30000);

const MINUTE = 60000;
let user;
let recipient;

const eventWithReminder = (name, inMinutes) => Event.create({
  user: user._id, recipient: recipient._id, name, date: new Date('2030-10-16T00:00:00Z'), type: new mongoose.Types.ObjectId(),
  reminder: { isSet: true, time: new Date(Date.now() + inMinutes * MINUTE), method: 'Email' }
});

beforeAll(async () => {
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await teardownTestDB();
  process.env.TZ = originalTZ;
  realProcess.env.TZ = originalTZ;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  user = await User.create({
    username: 'remi', email: 'remi@example.com', password: 'Passw0rd!x', firstName: 'Remi', lastName: 'D',
    preferences: { timezone: 'America/New_York', notificationSettings: { email: { enabled: true } } }
  });
  recipient = await Recipient.create({
    user: user._id, firstName: 'Ann', lastName: 'Lee', relation: 'Friend', relationship: 'friendship', birthdate: new Date('1990-01-01')
  });
  jest.spyOn(emailService, 'sendEmail').mockResolvedValue({ success: true });
});

afterEach(() => jest.restoreAllMocks());

describe('processReminders', () => {
  it('waits until a reminder is due', async () => {
    await eventWithReminder('Later', 5);

    await processReminders();

    expect(await Notification.countDocuments()).toBe(0);
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('sends a reminder that came due since the last run, once', async () => {
    await eventWithReminder('Dinner', -0.5);

    await processReminders();
    await processReminders();

    expect(await Notification.countDocuments()).toBe(1);
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendEmail.mock.calls[0][3]).toContain('Event: Dinner');
  });

  it('leaves long-missed reminders to the startup catch-up (no email burst)', async () => {
    await eventWithReminder('Old', -120);

    await processReminders();

    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });
});

describe('restart around a due reminder', () => {
  it('still emails a reminder that came due just before the restart', async () => {
    await eventWithReminder('Dinner', -0.3);

    // Boot: the catch-up runs first, then the minute job
    await processMissedNotifications();
    await processReminders();

    expect(emailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(await Notification.countDocuments()).toBe(1);
  });

  it('shows reminders missed for longer in the app only', async () => {
    await eventWithReminder('Old', -120);

    await processMissedNotifications();
    await processReminders();

    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(await Notification.countDocuments({ isRetroactive: true })).toBe(1);
  });
});

describe('the reminder email', () => {
  it("names the event's calendar day, whatever the user's time zone, without a made-up time", () => {
    const event = { name: 'Dinner', date: new Date('2030-10-16T00:00:00Z') };
    const { text } = emailService.formatEventReminderEmail(
      { firstName: 'Remi', preferences: { timezone: 'America/Los_Angeles' } }, event, { firstName: 'Ann', lastName: 'Lee' }
    );
    expect(text).toContain('Date: Wednesday, October 16, 2030\n');
  });
});
