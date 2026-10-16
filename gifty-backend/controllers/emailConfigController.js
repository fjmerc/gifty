const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const EmailConfig = require('../models/EmailConfig');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { HttpError } = require('../utils/ownership');
const { checkSmtpDestination } = require('../utils/smtpHostPolicy');
const { encryptSecret, decryptSecret } = require('../utils/secretBox');

// The config as the client sees it: never the password. passwordNeedsReentry:
// the stored one can't be read on this server (another ENCRYPTION_KEY)
const publicView = (config) => {
    const { rawPassword, password, ...rest } = config.toObject ? config.toObject() : config;
    let passwordNeedsReentry = !rawPassword;
    try {
        if (rawPassword) decryptSecret(rawPassword);
    } catch (err) {
        passwordNeedsReentry = true;
    }
    return { ...rest, passwordNeedsReentry };
};

const { defaultRequireTLS, effectiveRequireTLS } = require('../utils/smtpHostPolicy');

// Whether saving these settings would send mail (and the saved password)
// somewhere else. Host, port and TLS only matter for a custom server.
const sendsElsewhere = (current, next) => {
    const text = (value) => String(value ?? '').trim().toLowerCase();
    if (text(next.service) !== text(current.service)) return true;
    if (text(next.username) !== text(current.username)) return true;
    if (next.service !== 'custom') return false;
    if (text(next.host) !== text(current.host)) return true;
    if (Number(next.port) !== Number(current.port)) return true;
    if (typeof next.secure !== 'undefined' && Boolean(next.secure) !== Boolean(current.secure)) return true;
    // Dropping the STARTTLS requirement could send the password in clear text
    return next.requireTLS === false && effectiveRequireTLS(current);
};

/**
 * @desc    Get email configuration for the authenticated user
 * @route   GET /api/email-config
 * @access  Private
 */
const getUserEmailConfig = asyncHandler(async (req, res) => {
    const emailConfig = await EmailConfig.findOne({ user: req.user._id }).select('+rawPassword');

    if (!emailConfig) {
        res.status(404);
        throw new Error('Email configuration not found');
    }

    res.json(publicView(emailConfig));
});

/**
 * @desc    Create or update email configuration
 * @route   POST /api/email-config
 * @access  Private
 */
const createUpdateEmailConfig = asyncHandler(async (req, res) => {
    const { service, host, port, username, password, fromName, enabled } = req.body;

    // secure and requireTLS as Mongoose will store them ('false' is false),
    // so the checks below compare what is actually saved; else refused
    const asBoolean = (name) => {
        const value = req.body[name];
        if (typeof value === 'undefined') return undefined;
        const { convertToTrue, convertToFalse } = mongoose.Schema.Types.Boolean;
        if (convertToTrue.has(value)) return true;
        if (convertToFalse.has(value)) return false;
        throw new HttpError(400, `${name} must be true or false`);
    };
    const secure = asBoolean('secure');
    const requireTLS = asBoolean('requireTLS');

    // Basic validation; the password may be left out to keep the saved one
    if (!service || !username) {
        res.status(400);
        throw new Error('Please provide all required fields');
    }

    // For custom SMTP, validate host and port
    if (service === 'custom' && (!host || !port)) {
        res.status(400);
        throw new Error('Host and port are required for custom SMTP');
    }

    // A custom server: mail ports only, and private addresses when the owner blocks them
    const { error: destinationError } = await checkSmtpDestination({ service, host, port });
    if (destinationError) {
        res.status(400);
        throw new Error(destinationError);
    }

    try {
        // Check if config already exists
        const existingConfig = await EmailConfig.findOne({ user: req.user._id });

        if (existingConfig) {
            // Where mail goes (service, account, and for a custom server its
            // address and TLS) changes only with the password in the same
            // request: otherwise a borrowed session could send the saved
            // password to a server it controls
            if (!password && sendsElsewhere(existingConfig, { service, host, port, secure, requireTLS, username })) {
                const message = 'Enter the mail password again to change the server or username';
                return res.status(400).json({ message, errors: [{ field: 'password', message }] });
            }

            // Update existing configuration
            existingConfig.service = service;
            
            // Only update these for custom service or if provided
            if (service === 'custom' || host) existingConfig.host = typeof host === 'string' ? host.trim() : host;
            if (service === 'custom' || port) existingConfig.port = port;
            if (typeof secure !== 'undefined') existingConfig.secure = secure;
            if (typeof requireTLS !== 'undefined') existingConfig.requireTLS = requireTLS;
            else if (existingConfig.requireTLS == null) existingConfig.requireTLS = defaultRequireTLS(existingConfig.port);
            
            existingConfig.username = username;
            
            // Only update password if provided (to avoid overwriting it)
            if (password) existingConfig.rawPassword = encryptSecret(password);
            
            if (fromName) existingConfig.fromName = fromName;
            if (typeof enabled !== 'undefined') existingConfig.enabled = enabled;

            await existingConfig.save();
            
            // Return the config without the password
            const updatedConfig = await EmailConfig.findById(existingConfig._id).select('+rawPassword');

            logger.info(`Email configuration updated for user: ${req.user._id}`);
            res.json(publicView(updatedConfig));
        } else {
            if (!password) throw new HttpError(400, 'Please provide all required fields');
            // Create new configuration
            const newEmailConfig = await EmailConfig.create({
                user: req.user._id,
                service,
                host: service === 'custom' ? host : undefined,
                port: service === 'custom' ? port : undefined,
                secure: typeof secure !== 'undefined' ? secure : true,
                requireTLS: typeof requireTLS !== 'undefined' ? requireTLS : defaultRequireTLS(port),
                username,
                rawPassword: encryptSecret(password),
                fromName: fromName || 'Gifty Notifications',
                enabled: typeof enabled !== 'undefined' ? enabled : true
            });

            // Return the config without the password
            const savedConfig = await EmailConfig.findById(newEmailConfig._id).select('+rawPassword');

            logger.info(`Email configuration created for user: ${req.user._id}`);
            res.status(201).json(publicView(savedConfig));
        }
    } catch (error) {
        logger.error('Error creating/updating email config:', {
            error: error.message,
            stack: error.stack,
            userId: req.user._id
        });
        
        // A refusal keeps its own status; only an unexpected failure is a 500
        if (error.statusCode) throw error;
        res.status(500);
        throw new Error('Failed to create/update email configuration: ' + error.message);
    }
});

/**
 * @desc    Test email configuration
 * @route   POST /api/email-config/test
 * @access  Private
 */
const testEmailConfig = asyncHandler(async (req, res) => {
    try {
        // Send a test email
        const result = await emailService.sendTestEmail(req.user._id);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Test email sent successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message
            });
        }
    } catch (error) {
        logger.error('Error testing email config:', {
            error: error.message,
            stack: error.stack,
            userId: req.user._id
        });
        
        // A refusal keeps its own status; only an unexpected failure is a 500
        if (error.statusCode) throw error;
        res.status(500);
        throw new Error('Failed to test email configuration: ' + error.message);
    }
});

/**
 * @desc    Delete email configuration
 * @route   DELETE /api/email-config
 * @access  Private
 */
const deleteEmailConfig = asyncHandler(async (req, res) => {
    const emailConfig = await EmailConfig.findOne({ user: req.user._id });
    
    if (!emailConfig) {
        res.status(404);
        throw new Error('Email configuration not found');
    }
    
    await emailConfig.deleteOne();
    
    logger.info(`Email configuration deleted for user: ${req.user._id}`);
    res.json({ message: 'Email configuration removed' });
});

module.exports = {
    getUserEmailConfig,
    createUpdateEmailConfig,
    testEmailConfig,
    deleteEmailConfig
};