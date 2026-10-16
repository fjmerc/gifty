import {
  eventDay,
  todayLocalISO,
  localDateISO,
  dateOnlyISO,
  formatDateOnly,
  formatInstantDate
} from '../dates';

describe('test time zone', () => {
  test('Jest runs in America/Los_Angeles (see jest.global-setup.js)', () => {
    expect(new Date('2026-01-01T03:00:00Z').getDate()).toBe(31);
  });
});

describe('todayLocalISO', () => {
  test('is the local day, not the UTC day (literal expectations)', () => {
    expect(todayLocalISO(new Date('2026-01-01T03:00:00Z'))).toBe('2025-12-31');
    expect(todayLocalISO(new Date('2025-07-04T06:59:00Z'))).toBe('2025-07-03');
    expect(todayLocalISO(new Date('2025-07-04T07:00:00Z'))).toBe('2025-07-04');
  });

  test('uses local calendar fields (late evening Dec 31 stays Dec 31)', () => {
    expect(todayLocalISO(new Date(2025, 11, 31, 23, 30))).toBe('2025-12-31');
    expect(todayLocalISO(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });

  test('pads month and day', () => {
    expect(todayLocalISO(new Date(2025, 0, 5, 12))).toBe('2025-01-05');
  });

  test('defaults to now', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayLocalISO()).toBe(expected);
  });
});

describe('localDateISO', () => {
  test('literal: a UTC instant maps to the previous local day', () => {
    expect(localDateISO('2026-01-01T03:00:00Z')).toBe('2025-12-31');
  });

  test('is the local calendar date of an instant', () => {
    const instant = new Date(2025, 2, 10, 21, 45);
    expect(localDateISO(instant.toISOString())).toBe('2025-03-10');
    expect(localDateISO(instant)).toBe('2025-03-10');
  });

  test('empty for missing or invalid values', () => {
    expect(localDateISO(null)).toBe('');
    expect(localDateISO('')).toBe('');
    expect(localDateISO('invalid-date')).toBe('');
  });
});

describe('dateOnlyISO', () => {
  test('keeps the stored calendar date of a date-only value in any time zone', () => {
    expect(dateOnlyISO('2025-12-25T00:00:00.000Z')).toBe('2025-12-25');
    expect(dateOnlyISO('2025-12-25')).toBe('2025-12-25');
    expect(dateOnlyISO(new Date(Date.UTC(2025, 11, 25)))).toBe('2025-12-25');
  });

  test('empty for missing or invalid values', () => {
    expect(dateOnlyISO(null)).toBe('');
    expect(dateOnlyISO(undefined)).toBe('');
    expect(dateOnlyISO('not a date')).toBe('');
  });
});

describe('eventDay', () => {
  test('is local midnight of the stored calendar day, not the local day before', () => {
    const d = eventDay('2026-03-01T00:00:00.000Z');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 1, 0]);
  });

  test('is an invalid date for missing or unparseable values', () => {
    expect(Number.isNaN(eventDay(null).getTime())).toBe(true);
    expect(Number.isNaN(eventDay('soon').getTime())).toBe(true);
  });
});

describe('formatDateOnly', () => {
  test('literal: UTC-midnight date-only values keep their stored day', () => {
    expect(formatDateOnly('2025-12-25T00:00:00.000Z', 'en-US')).toBe('12/25/2025');
    expect(formatDateOnly('2026-01-01T00:00:00.000Z', 'en-US')).toBe('1/1/2026');
  });

  test('shows the stored day, not the day before in western time zones', () => {
    expect(formatDateOnly('2025-12-25T00:00:00.000Z', 'en-US')).toBe(new Date(2025, 11, 25).toLocaleDateString('en-US'));
    expect(formatDateOnly('1990-01-01T00:00:00.000Z', 'en-US')).toBe('1/1/1990');
  });

  test('dash for missing or invalid values', () => {
    expect(formatDateOnly(null)).toBe('—');
    expect(formatDateOnly('garbage')).toBe('—');
  });
});

describe('formatInstantDate', () => {
  test('literal: an instant shows its local day', () => {
    expect(formatInstantDate('2026-01-01T03:00:00Z', 'en-US')).toBe('12/31/2025');
  });

  test('formats an instant in local time', () => {
    const instant = new Date(2025, 5, 15, 9, 0);
    expect(formatInstantDate(instant.toISOString(), 'en-US')).toBe(instant.toLocaleDateString('en-US'));
  });

  test('dash for missing or invalid values', () => {
    expect(formatInstantDate(null)).toBe('—');
    expect(formatInstantDate('invalid-date')).toBe('—');
  });
});

describe('dateOnlyISO with non-ISO day strings in any zone', () => {
  const originalTZ = process.env.TZ;
  const realProcess = require('vm').runInThisContext('process');
  const setTZ = (zone) => {
    process.env.TZ = zone;
    realProcess.env.TZ = zone;
  };
  afterEach(() => setTZ(originalTZ));

  test.each(['America/Los_Angeles', 'UTC', 'Pacific/Auckland'])(
    "'1/5/2024' is 2024-01-05 in %s",
    (zone) => {
      setTZ(zone);
      expect(dateOnlyISO('1/5/2024')).toBe('2024-01-05');
      expect(formatDateOnly('1/5/2024', 'en-US')).toBe('1/5/2024');
    }
  );

  test('ISO strings still show their stored day in Auckland', () => {
    setTZ('Pacific/Auckland');
    expect(dateOnlyISO('2024-01-05T00:00:00Z')).toBe('2024-01-05');
  });
});

describe("dates follow the browser's language", () => {
  afterEach(() => jest.restoreAllMocks());

  it('formats date-only values and instants with the browser locale (no locale passed)', () => {
    const seen = [];
    jest.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function spy(locale) {
      seen.push(locale);
      return 'formatted';
    });
    formatDateOnly('2025-12-25');
    formatInstantDate('2025-12-25T10:00:00.000Z');
    expect(seen).toEqual([undefined, undefined]);
  });
});
