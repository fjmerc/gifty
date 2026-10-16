const cron = require('node-cron');
const { calendarUpkeep } = require('./dataUpgrade');
const giftDiscoveryService = require('./giftDiscoveryService');
const discoveryMaintenance = require('./discoveryMaintenanceService');
const logger = require('../utils/logger');

let tasks = [];
let startupTimer = null;

const job = (name, fn) => async () => {
    logger.info(`Scheduled job started: ${name}`);
    try {
        await fn();
        logger.info(`Scheduled job finished: ${name}`);
    } catch (error) {
        logger.error(`Scheduled job failed: ${name}`, error);
    }
};

/**
 * All cron jobs live here so each runs exactly once per process,
 * in the instance's configured timezone.
 */
const initializeSchedulers = ({ timezone = process.env.TZ || 'UTC' } = {}) => {
    const opts = { timezone };
    tasks = [
        cron.schedule('0 2 1 * *', job('recurring events', calendarUpkeep), opts),
        cron.schedule('0 3 * * 0', job('gift discovery', async () => {
            if (!process.env.BRAVE_SEARCH_API_KEY) {
                logger.warn('Skipping gift discovery: BRAVE_SEARCH_API_KEY not configured');
                return;
            }
            const saved = await giftDiscoveryService.discoverGifts();
            logger.info(`Gift discovery saved ${saved.length} new gifts`);
        }), opts),
        cron.schedule('0 0 * * *', job('discovery maintenance', () => discoveryMaintenance.runDailyMaintenance()), opts),
        cron.schedule('30 2 * * *', job('automatic backup', () => require('./backupService').runScheduledBackup()), opts)
    ];

    // Catch up on occurrences and birthdays missed while the server was down
    startupTimer = setTimeout(job('startup recurring events', calendarUpkeep), 5000);
    startupTimer.unref?.();

    logger.info(`Background schedulers initialized (TZ: ${timezone})`);
    return tasks;
};

const stopSchedulers = () => {
    tasks.forEach((t) => t.stop());
    tasks = [];
    if (startupTimer) clearTimeout(startupTimer);
    startupTimer = null;
};

module.exports = { initializeSchedulers, stopSchedulers };
