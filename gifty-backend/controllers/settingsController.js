const asyncHandler = require('express-async-handler');
const AdmZip = require('adm-zip');
const User = require('../models/User');
const hybridSuggestionService = require('../services/hybridSuggestionService');
const modelRegistry = require('../services/ai/modelRegistry');

const { ALLOWED_PREFERENCE_KEYS, SUGGESTION_MODES } = require('../config/userPreferences');
const userBackupService = require('../services/userBackupService');
const exportService = require('../services/exportService');
const { HttpError } = require('../utils/ownership');
const logger = require('../utils/logger');

// Maximum allowed ZIP size in bytes (50MB)
const MAX_ZIP_SIZE = 50 * 1024 * 1024;

// @desc Create a backup of all user data
// @route GET /api/settings/backup
// @access Private
exports.createBackup = asyncHandler(async (req, res) => {
    const backup = await userBackupService.buildUserBackup(req.user._id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=gifty-backup-${new Date().toISOString()}.json`);
    res.json(backup);
});

// The requested export types, or an HttpError for a bad request
const requestedTypes = (dataTypes) => {
    if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
        throw new HttpError(400, 'Please specify data types to export');
    }
    const types = [...new Set(dataTypes)].filter((type) => exportService.EXPORT_TYPES.includes(type));
    if (types.length === 0) throw new HttpError(400, `Choose from: ${exportService.EXPORT_TYPES.join(', ')}`);
    return types;
};

const exportStamp = () => new Date().toISOString().slice(0, 10);

// @desc Export selected data types as ZIP (a CSV and a JSON file per type)
// @route POST /api/settings/export-zip
// @access Private
exports.exportZip = asyncHandler(async (req, res) => {
    const types = requestedTypes(req.body.dataTypes);
    const data = await exportService.buildExport(req.user._id, types);

    const zip = new AdmZip();
    zip.addFile('metadata.json', Buffer.from(JSON.stringify({
        version: process.env.GIFTY_VERSION || process.env.APP_VERSION || 'dev',
        timestamp: new Date().toISOString(),
        exportedDataTypes: types,
        note: 'A readable copy of your data. To move or restore your data, use Settings → Create Backup.'
    }, null, 2)));
    let totalSize = 0;
    for (const [type, rows] of Object.entries(data)) {
        const csv = Buffer.from(exportService.tableToCsv(type, rows));
        const json = Buffer.from(JSON.stringify(rows, null, 2));
        totalSize += csv.length + json.length;
        if (totalSize > MAX_ZIP_SIZE) throw new HttpError(400, 'Export size would exceed maximum allowed size');
        zip.addFile(`${type}.csv`, csv);
        zip.addFile(`${type}.json`, json);
    }

    const zipBuffer = zip.toBuffer();
    if (zipBuffer.length > MAX_ZIP_SIZE) throw new HttpError(400, 'ZIP file size exceeds maximum allowed size');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=gifty-export-${exportStamp()}.zip`);
    res.send(zipBuffer);
});

// @desc Validate backup file
// @route POST /api/settings/validate-backup
// @access Private
exports.validateBackup = asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400);
        throw new Error('No backup file provided');
    }
    const parsed = userBackupService.parseUserBackup(req.file.buffer);
    res.json({
        isValid: true,
        message: 'Backup file is valid',
        backupInfo: userBackupService.describeBackup(parsed)
    });
});

// @desc Restore user data from backup file
// @route POST /api/settings/restore
// @access Private
exports.restoreBackup = asyncHandler(async (req, res) => {
    if (!req.file) {
        res.status(400);
        throw new Error('No backup file provided');
    }
    const parsed = userBackupService.parseUserBackup(req.file.buffer);
    const summary = await userBackupService.restoreUserBackup(req.user._id, parsed);
    res.json({ success: true, message: 'Backup restored successfully', ...summary });
});

// The provider and model a generation would use with these preferences;
// nulls when no provider is configured (the UI then warns)
const resolveActive = (prefs = {}) => {
    try {
        const resolved = modelRegistry.resolveProviderAndModel({
            provider: prefs.aiProvider,
            model: prefs.aiModel,
            mode: !prefs.suggestionMode || prefs.suggestionMode === 'basic' ? 'basic' : 'enhanced',
        });
        return { activeProvider: resolved.provider, activeModel: resolved.model };
    } catch (e) {
        return { activeProvider: null, activeModel: null };
    }
};

// @desc Get user preferences
// @route GET /api/settings/user-preferences
// @access Private
exports.getUserPreferences = asyncHandler(async (req, res) => {
    logger.debug('[getUserPreferences] Fetching user preferences...');
    
    const userId = req.user._id;
    
    try {
        const user = await User.findById(userId).select('preferences');
        
        // If user has no preferences yet, return defaults
        if (!user.preferences) {
            user.preferences = { theme: 'light', notifications: true };
            await user.save();
        }
        
        // Get system health status for hybrid suggestions
        const systemHealth = await hybridSuggestionService.isHybridSystemHealthy();

        // Pre-resolve which provider+model will actually be used so the
        // UI can show what's active without needing extra calls.
        const userPrefs = user.preferences.toObject ? user.preferences.toObject() : { ...user.preferences };
        const { activeProvider, activeModel } = resolveActive(userPrefs);

        res.json({
            ...userPrefs,
            activeProvider,
            activeModel,
            systemHealth: {
                isHealthy: systemHealth.isHealthy,
                giftCount: systemHealth.totalGifts || 0
            }
        });
    } catch (error) {
        // A refusal keeps its own status; only an unexpected failure is a 500
        if (error.statusCode) throw error;
        logger.error('Error fetching user preferences:', error);
        throw new HttpError(500, 'Failed to fetch user preferences', { expose: true });
    }
});

// @desc Update user preferences
// @route POST /api/settings/user-preferences
// @access Private
exports.updateUserPreferences = asyncHandler(async (req, res) => {
    logger.debug('[updateUserPreferences] Updating user preferences...');

    const userId = req.user._id;
    const updates = req.body;

    try {
        const user = await User.findById(userId);

        if (!user.preferences) {
            user.preferences = {};
        }

        // Validate the AI provider/model this change leaves in place before
        // persisting: an unknown model or a provider without a key here
        // would otherwise run silently as another model.
        if ('aiProvider' in updates || 'aiModel' in updates) {
            const problem = modelRegistry.validateChoice({
                provider: 'aiProvider' in updates ? updates.aiProvider : user.preferences.aiProvider,
                model: 'aiModel' in updates ? updates.aiModel : user.preferences.aiModel
            });
            if (problem) throw new HttpError(400, problem);
        }
        if ('suggestionMode' in updates && !SUGGESTION_MODES.includes(updates.suggestionMode)) {
            throw new HttpError(400, `Suggestion mode must be one of: ${SUGGESTION_MODES.join(', ')}`);
        }

        // Update only the fields that were provided AND are on the
        // allowlist. Unknown keys are skipped (and logged) so client
        // bugs or hostile requests can't pollute the user document.
        // Holiday settings change through PUT /api/users/preferences, which
        // checks them and brings the holiday events in line
        const rejected = [];
        Object.keys(updates).forEach(key => {
            if (key === 'holidaySettings') return;
            if (ALLOWED_PREFERENCE_KEYS.has(key)) {
                user.preferences[key] = updates[key];
            } else {
                rejected.push(key);
            }
        });
        if (rejected.length > 0) {
            logger.warn(`[updateUserPreferences] Ignored unknown preference keys: ${rejected.join(', ')}`);
        }
        
        await user.save();
        
        logger.debug(`[updateUserPreferences] Updated preferences for user ${userId}`);
        
        // The provider/model now in use, so the page's "Active" label is
        // right without another request
        const saved = user.preferences.toObject ? user.preferences.toObject() : { ...user.preferences };
        res.json({
            message: 'Preferences updated successfully',
            preferences: user.preferences,
            ...resolveActive(saved)
        });
    } catch (error) {
        // A refusal keeps its own status; only an unexpected failure is a 500
        if (error.statusCode) throw error;
        logger.error('Error updating user preferences:', error);
        throw new HttpError(500, 'Failed to update user preferences', { expose: true });
    }
});

// @desc Export specific data types in JSON/CSV format
// @route POST /api/settings/export
// @access Private
exports.exportData = asyncHandler(async (req, res) => {
    const { format } = req.body;
    if (!format || !['json', 'csv'].includes(String(format).toLowerCase())) {
        throw new HttpError(400, 'Invalid format specified');
    }
    const types = requestedTypes(req.body.dataTypes);
    const data = await exportService.buildExport(req.user._id, types);
    const filename = `gifty-export-${types.join('-')}-${exportStamp()}`;

    if (String(format).toLowerCase() === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
        return res.send(exportService.toCsv(data));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.json`);
    res.json(data);
});
