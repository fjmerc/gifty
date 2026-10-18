const express = require('express');
// Instance-wide operations for admins. Restore and deleting a backup are the
// owner's: a restore replaces every account and the owner record
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { requireAdmin, requireOwner } = require('../middleware/roleMiddleware');
const backupService = require('../services/backupService');
const { upgradeData, calendarUpkeep } = require('../services/dataUpgrade');
const { clearAllResponseCaches } = require('../middleware/cacheMiddleware');
const logger = require('../utils/logger');

/**
 * @desc    Create a database backup
 * @route   POST /api/database/backup
 * @access  Private
 */
// A request the server answers with 4xx (a backup that is already gone, an
// archive that isn't one) is expected, not a server fault
const logAtStatus = (statusCode, message) => (statusCode >= 500 ? logger.error(message) : logger.warn(message));

router.post('/backup', protect, requireAdmin, async (req, res) => {
  try {
    logger.info(`User ${req.user.id} requested database backup creation`);
    
    
    // Create the backup
    const result = await backupService.createBackup();
    
    logger.info(`Database backup created successfully by user ${req.user.id}: ${result.backupName}`);
    
    res.status(201).json({
      success: true,
      message: 'Database backup created successfully',
      backupName: result.backupName,
      backupPath: result.backupPath
    });
  } catch (error) {
    logger.error(`Error creating database backup for user ${req.user.id}: ${error.message}`);
    
    // Return a more detailed error response
    const statusCode = error.message.includes('not found') ? 404 : 500;
    
    res.status(statusCode).json({ 
      success: false,
      message: error.message,
      code: 'BACKUP_CREATION_FAILED'
    });
  }
});

/**
 * @desc    List available database backups
 * @route   GET /api/database/backups
 * @access  Private
 */
router.get('/backups', protect, requireAdmin, async (req, res) => {
  try {
    logger.info(`User ${req.user.id} requested list of database backups`);
    
    const backups = await backupService.listBackups();
    
    logger.info(`Retrieved ${backups.length} database backups for user ${req.user.id}`);
    
    res.status(200).json(backups);
  } catch (error) {
    logger.error(`Error listing database backups for user ${req.user.id}: ${error.message}`);
    
    res.status(500).json({ 
      success: false,
      message: error.message,
      code: 'BACKUP_LIST_FAILED'
    });
  }
});

/**
 * @desc    Restore database from a backup
 * @route   POST /api/database/restore/:backupName
 * @access  Private
 */
router.post('/restore/:backupName', protect, requireOwner, async (req, res) => {
  const { backupName } = req.params;
  
  try {
    logger.warn(`User ${req.user.id} is attempting to restore database from backup: ${backupName}`);
    
    
    const { collections, safetyBackup } = await backupService.restoreBackup(backupName);
    logger.info(`Database restore successful for user ${req.user.id} from backup: ${backupName}`);

    // An older archive brings older data: upgrade it as boot would. The data
    // is already restored, so a failure here is reported, not thrown
    let upgrade;
    try {
      upgrade = { ...(await upgradeData()), ...(await calendarUpkeep()) };
    } catch (error) {
      logger.error(`Upgrading restored data failed: ${error.message}`);
      upgrade = { error: `${error.message}. Restart the server to retry.` };
    }
    await clearAllResponseCaches().catch((error) => logger.error(`Clearing cached responses failed: ${error.message}`));

    res.status(200).json({
      success: true,
      message: 'Database restored successfully',
      backupName,
      collections,
      safetyBackup,
      upgrade
    });
  } catch (error) {
    let statusCode = 500;
    let errorCode = 'RESTORE_FAILED';
    
    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'BACKUP_NOT_FOUND';
    } else if (error.message.includes('manifest') || error.message.includes('is missing')) {
      statusCode = 400;
      errorCode = 'INCOMPATIBLE_BACKUP';
    }
    logAtStatus(statusCode, `Error restoring database for user ${req.user.id} from backup ${backupName}: ${error.message}`);
    // The restore may have replaced collections before failing
    await clearAllResponseCaches().catch((clearError) => logger.error(`Clearing cached responses failed: ${clearError.message}`));
    
    res.status(statusCode).json({ 
      success: false,
      message: error.message,
      code: errorCode
    });
  }
});

/**
 * @desc    Delete a database backup
 * @route   DELETE /api/database/backups/:backupName
 * @access  Private
 */
router.delete('/backups/:backupName', protect, requireOwner, async (req, res) => {
  const { backupName } = req.params;
  
  try {
    logger.info(`User ${req.user.id} requested deletion of database backup: ${backupName}`);
    
    // Delete the backup
    const result = await backupService.deleteBackup(backupName);
    
    logger.info(`Database backup '${backupName}' deleted successfully by user ${req.user.id}`);
    
    // Standard success response
    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    let statusCode = 500;
    let errorCode = 'BACKUP_DELETE_FAILED';
    
    if (error.message.includes('not found')) {
      statusCode = 404;
      errorCode = 'BACKUP_NOT_FOUND';
    }
    logAtStatus(statusCode, `Error deleting database backup ${backupName} for user ${req.user.id}: ${error.message}`);
    
    res.status(statusCode).json({ 
      success: false,
      message: error.message,
      code: errorCode
    });
  }
});

/**
 * @desc    Check system requirements for database operations
 * @route   GET /api/database/system-check
 * @access  Private
 */
router.get('/system-check', protect, requireAdmin, async (req, res) => {
  try {
    logger.info(`User ${req.user.id} requested database system check`);
    
    const backups = await backupService.listBackups();
    const systemStatus = {
      mongoConnected: require('mongoose').connection.readyState === 1,
      backupPath: backupService.BACKUP_DIR,
      backupCount: backups.length,
      automaticBackupsKept: parseInt(process.env.BACKUP_KEEP ?? '7', 10)
    };
    
    logger.info(`System check results for user ${req.user.id}: ${JSON.stringify(systemStatus)}`);
    
    res.status(200).json({
      success: true,
      systemStatus
    });
  } catch (error) {
    logger.error(`Error during system check for user ${req.user.id}: ${error.message}`);
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to perform system check',
      error: error.message
    });
  }
});

module.exports = router;
