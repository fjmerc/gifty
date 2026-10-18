jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));
jest.mock('../../services/recurringEventService', () => ({ generateRecurringEvents: jest.fn().mockResolvedValue({ created: 0, skipped: 0 }) }));
jest.mock('../../services/birthdayEventService', () => ({ ensureUpcomingBirthdays: jest.fn().mockResolvedValue({ synced: 0 }) }));
jest.mock('../../services/holidayService', () => ({ regenerateAllHolidayEvents: jest.fn().mockResolvedValue({ success: true, totalCreated: 0 }) }));
jest.mock('../../services/giftDiscoveryService', () => ({ discoverGifts: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/discoveryMaintenanceService', () => ({ runDailyMaintenance: jest.fn() }));
jest.mock('../../services/backupService', () => ({ runScheduledBackup: jest.fn() }));
jest.mock('../../utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const cron = require('node-cron');
const { initializeSchedulers, stopSchedulers } = require('../../services/schedulerService');
const { generateRecurringEvents } = require('../../services/recurringEventService');
const { ensureUpcomingBirthdays } = require('../../services/birthdayEventService');
const { regenerateAllHolidayEvents } = require('../../services/holidayService');

describe('schedulerService', () => {
  beforeEach(() => { jest.useFakeTimers(); cron.schedule.mockClear(); });
  afterEach(() => { stopSchedulers(); jest.useRealTimers(); });

  it('schedules each job once, all in the given timezone, with no hourly job', () => {
    initializeSchedulers({ timezone: 'Europe/Madrid' });
    const exprs = cron.schedule.mock.calls.map((c) => c[0]);
    expect(exprs.sort()).toEqual(['0 0 * * *', '0 2 1 * *', '0 3 * * 0', '30 2 * * *'].sort());
    expect(exprs).not.toContain('0 * * * *');
    cron.schedule.mock.calls.forEach((c) => expect(c[2]).toEqual({ timezone: 'Europe/Madrid', missedExecutionTolerance: 60 * 60 * 1000 }));
  });

  it('the monthly calendar job extends series and rolls birthdays and holidays forward', async () => {
    initializeSchedulers({ timezone: 'UTC' });
    const [, monthly] = cron.schedule.mock.calls.find((c) => c[0] === '0 2 1 * *');
    await monthly();
    expect(generateRecurringEvents).toHaveBeenCalled();
    expect(ensureUpcomingBirthdays).toHaveBeenCalled();
    expect(regenerateAllHolidayEvents).toHaveBeenCalled();
  });

  it('stopSchedulers stops every task', () => {
    const tasks = initializeSchedulers({ timezone: 'UTC' });
    stopSchedulers();
    tasks.forEach((t) => expect(t.stop).toHaveBeenCalled());
  });
});
