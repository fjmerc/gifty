const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { backupUpload } = require('../middleware/uploadMiddleware');
const { 
    createBackup, 
    validateBackup, 
    exportData, 
    exportZip, 
    restoreBackup,
    getUserPreferences,
    updateUserPreferences
} = require('../controllers/settingsController');

// User preferences routes
router.get('/user-preferences', protect, getUserPreferences);
router.post('/user-preferences', protect, updateUserPreferences);

// Backup and export routes
router.get('/backup', protect, createBackup);
router.post('/restore', protect, backupUpload.single('backup'), restoreBackup);
router.post('/validate-backup', protect, backupUpload.single('backup'), validateBackup);
router.post('/export', protect, exportData);
router.post('/export-zip', protect, exportZip);

module.exports = router;
