const { getTimeZone, parseDateOnly, yearInTimeZone } = require('../../utils/dates');

describe('utils/dates', () => {
  const originalTZ = process.env.TZ;

  // Jest gives each test file a copy of process.env, so a runtime TZ change
  // only reaches Node's date handling when it is also applied to the real
  // process (reachable through the main V8 context).
  const realProcess = require('vm').runInThisContext('process');
  const setTZ = (zone) => {
    if (zone === undefined) {
      delete process.env.TZ;
      delete realProcess.env.TZ;
    } else {
      process.env.TZ = zone;
      realProcess.env.TZ = zone;
    }
  };

  afterEach(() => setTZ(originalTZ));

  describe('getTimeZone', () => {
    it('prefers process.env.TZ', () => {
      setTZ('Pacific/Auckland');
      expect(getTimeZone()).toBe('Pacific/Auckland');
    });

    it('falls back to the zone the Node process runs in', () => {
      setTZ(undefined);
      expect(getTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    });
  });

  describe('parseDateOnly', () => {
    it('keeps the calendar day in a negative-offset zone (Dec 31 stays in its year)', () => {
      setTZ('America/New_York');
      const date = parseDateOnly('2031-12-31');
      expect(date.toISOString()).toBe('2031-12-31T17:00:00.000Z');
      expect(yearInTimeZone(date)).toBe(2031);
    });

    it('keeps the calendar day in a positive-offset zone (Jan 1 stays in its year)', () => {
      setTZ('Pacific/Auckland');
      const date = parseDateOnly('2032-01-01');
      expect(date.toISOString()).toBe('2031-12-31T23:00:00.000Z');
      expect(yearInTimeZone(date)).toBe(2032);
    });

    it('returns null for anything that is not a real YYYY-MM-DD date', () => {
      ['2031-02-30', '31-12-2031', '2031-12-31T10:00:00Z', '2031-1-5', '', null, undefined, 20311231]
        .forEach((value) => expect(parseDateOnly(value)).toBeNull());
    });
  });

  describe('yearInTimeZone', () => {
    it('buckets an instant by the instance time zone, not UTC', () => {
      const instant = new Date('2032-01-01T04:30:00Z'); // Dec 31 23:30 in New York
      setTZ('America/New_York');
      expect(yearInTimeZone(instant)).toBe(2031);
      setTZ('UTC');
      expect(yearInTimeZone(instant)).toBe(2032);
    });
  });
});
