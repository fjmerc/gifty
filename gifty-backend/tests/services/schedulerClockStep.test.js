// The real node-cron on fake timers. A daily job waits on one 24-hour timer;
// timers follow the monotonic clock, so a step of the wall clock (time sync,
// a paused VM) makes them wake late by the step. node-cron 4 skips a run
// more than its tolerance late (1 s by default): on 2026-10-18 the live
// server woke 74 s late and lost that night's backup.
jest.mock('../../services/dataUpgrade', () => ({ calendarUpkeep: jest.fn().mockResolvedValue() }));
jest.mock('../../services/giftDiscoveryService', () => ({ discoverGifts: jest.fn().mockResolvedValue([]) }));
jest.mock('../../services/discoveryMaintenanceService', () => ({ runDailyMaintenance: jest.fn().mockResolvedValue() }));
jest.mock('../../services/backupService', () => ({ runScheduledBackup: jest.fn().mockResolvedValue() }));
jest.mock('../../utils/logger', () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { initializeSchedulers, stopSchedulers } = require('../../services/schedulerService');
const { runScheduledBackup } = require('../../services/backupService');
const logger = require('../../utils/logger');

const START = new Date('2026-10-17T02:30:30Z');
const UNTIL_NEXT_BACKUP = new Date('2026-10-18T02:30:00Z') - START;

describe('scheduled jobs when the wall clock steps', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: START });
    jest.clearAllMocks();
    initializeSchedulers({ timezone: 'UTC' });
  });
  afterEach(() => { stopSchedulers(); jest.useRealTimers(); });

  it('still runs the nightly backup when its timer wakes 74 seconds late', async () => {
    jest.setSystemTime(Date.now() + 74000);
    await jest.advanceTimersByTimeAsync(UNTIL_NEXT_BACKUP);
    expect(runScheduledBackup).toHaveBeenCalledTimes(1);
  });

  it('says so in the log when a run is skipped after all', async () => {
    jest.setSystemTime(Date.now() + 2 * 60 * 60 * 1000);
    await jest.advanceTimersByTimeAsync(UNTIL_NEXT_BACKUP);
    expect(runScheduledBackup).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Scheduled job missed: automatic backup'));
  });
});
