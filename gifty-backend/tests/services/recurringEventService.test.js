// Occurrence dates are calendar days (stored as UTC midnight, like the event
// form sends them); reminders keep their wall-clock time in the instance zone.
// Node only follows a TZ set on the real process (see tests/utils/dates.test.js).
const realProcess = require('vm').runInThisContext('process');
const originalTZ = realProcess.env.TZ;
process.env.TZ = 'America/New_York';
realProcess.env.TZ = 'America/New_York';

const { occurrenceDates, reminderFor } = require('../../services/recurringEventService');

afterAll(() => {
  process.env.TZ = originalTZ;
  realProcess.env.TZ = originalTZ;
});

const NOW = new Date('2030-01-01T12:00:00Z');
const days = (dates) => dates.map((d) => d.toISOString());
const master = (date, recurring, reminder) => ({ date: new Date(date), recurring, reminder });

describe('occurrenceDates', () => {
  it('keeps weekly occurrences on their day across a DST change', () => {
    const dates = occurrenceDates(master('2030-03-04', { frequency: 'Weekly', until: new Date('2030-03-25') }), NOW);
    expect(days(dates)).toEqual([
      '2030-03-11T00:00:00.000Z', '2030-03-18T00:00:00.000Z', '2030-03-25T00:00:00.000Z'
    ]);
  });

  it('keeps a month-end date at the end of each month instead of drifting', () => {
    const dates = occurrenceDates(master('2030-01-31', { frequency: 'Monthly', until: new Date('2030-05-31') }), NOW);
    expect(days(dates)).toEqual([
      '2030-02-28T00:00:00.000Z', '2030-03-31T00:00:00.000Z', '2030-04-30T00:00:00.000Z', '2030-05-31T00:00:00.000Z'
    ]);
  });

  it('puts a Feb 29 yearly event on Feb 28 in common years', () => {
    const dates = occurrenceDates(master('2028-02-29', { frequency: 'Yearly', until: new Date('2032-03-01') }), NOW);
    expect(days(dates)).toEqual([
      '2029-02-28T00:00:00.000Z', '2030-02-28T00:00:00.000Z', '2031-02-28T00:00:00.000Z', '2032-02-29T00:00:00.000Z'
    ]);
  });

  it('skips exception days, given as form strings or dates', () => {
    const dates = occurrenceDates(master('2030-03-01', {
      frequency: 'Daily', until: new Date('2030-03-05'), exceptions: ['2030-03-02', new Date('2030-03-04')]
    }), NOW);
    expect(days(dates)).toEqual(['2030-03-03T00:00:00.000Z', '2030-03-05T00:00:00.000Z']);
  });

  it('stops three years ahead when there is no end date', () => {
    const dates = occurrenceDates(master('2030-01-01', { frequency: 'Yearly' }), NOW);
    expect(days(dates)).toEqual([
      '2031-01-01T00:00:00.000Z', '2032-01-01T00:00:00.000Z', '2033-01-01T00:00:00.000Z'
    ]);
  });

  it('has no occurrences for a one-off event or an end date before the next one', () => {
    expect(occurrenceDates(master('2030-01-01', { frequency: 'None' }), NOW)).toEqual([]);
    expect(occurrenceDates(master('2030-01-01', { frequency: 'Monthly', until: new Date('2030-01-15') }), NOW)).toEqual([]);
  });
});

describe('reminderFor', () => {
  it('moves the reminder with the occurrence and keeps its local time across DST', () => {
    // 9:00 AM EST the day before the first event
    const m = master('2030-03-04', { frequency: 'Weekly' }, { isSet: true, time: new Date('2030-03-03T14:00:00Z'), method: 'Email' });
    const reminder = reminderFor(m, new Date('2030-03-11T00:00:00Z'));
    // 9:00 AM EDT the day before the occurrence
    expect(reminder).toEqual({ isSet: true, time: new Date('2030-03-10T13:00:00Z'), method: 'Email' });
  });

  it('gives occurrences no reminder when the event has none', () => {
    const m = master('2030-03-04', { frequency: 'Weekly' }, { isSet: false });
    expect(reminderFor(m, new Date('2030-03-11T00:00:00Z'))).toEqual({ isSet: false, time: null, method: null });
  });
});
