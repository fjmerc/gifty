const nodemailer = require('nodemailer');
const EmailConfig = require('../models/EmailConfig');
const User = require('../models/User');
const logger = require('../utils/logger');
const { getInstanceSmtp } = require('../config/validateEnv');
const runtime = require('../config/runtime');
const { decryptSecret } = require('../utils/secretBox');
const { checkSmtpDestination, effectiveRequireTLS } = require('../utils/smtpHostPolicy');

// What the SMTP test answers for any failure to reach or talk to the server:
// telling refused, timed-out and non-SMTP apart would make it a port scanner
const TEST_CONNECTION_FAILED = 'Could not reach the mail server. Check the server address, port and security setting.';
// Failures whose own message is safe and useful to show
const SPECIFIC_FAILURES = new Set(['EAUTH', 'SMTP_PASSWORD_REENTRY', 'SMTP_DESTINATION_REFUSED', 'NO_CONFIG']);

// The stored SMTP password can't be read on this server (encrypted under
// another ENCRYPTION_KEY, e.g. after restoring another server's backup)
const REENTER_PASSWORD_MESSAGE = 'Your mail password could not be read on this server. Please re-enter your mail password in Settings.';

// The decrypted SMTP password, or null when it has to be entered again
const readSmtpPassword = (emailConfig) => {
    try {
        return decryptSecret(emailConfig.rawPassword) || null;
    } catch (err) {
        return null;
    }
};

// User text is stored as typed; escape it wherever it lands in email HTML
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

// Bound how much mail any one account can push through the admin's SMTP
// server per day (accounts aren't email-verified before 1b's invite flow).
const underInstanceSmtpLimit = async (userId) => {
    const limit = parseInt(process.env.INSTANCE_SMTP_DAILY_LIMIT || '20', 10);
    const { redisClient } = require('../config/redis');
    const key = `gifty:smtp:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, 2 * 24 * 60 * 60);
    return count <= limit;
};

/**
 * Create a nodemailer transport based on user's email configuration
 * @param {Object} emailConfig - The email configuration from the database
 * @returns {Object} - Configured nodemailer transport
 * @modified - Modified to improve Outlook authentication and add better debugging
 */
const createTransport = async (emailConfig, authPassword, checkedAddress = null) => {
    try {
        let config;
        
        // Add debug logging to identify what's available
        logger.debug('Creating email transport', {
            service: emailConfig.service,
            username: emailConfig.username,
            hasPassword: !!authPassword
        });

        // Special configuration for Outlook/Hotmail
        if (emailConfig.service === 'outlook') {
            config = {
                host: 'smtp.office365.com',
                port: 587,
                secure: false,
                auth: {
                    user: emailConfig.username,
                    pass: authPassword
                },
                requireTLS: true,
                tls: {
                    minVersion: 'TLSv1.2',
                    ciphers: 'HIGH:MEDIUM:!aNULL:!MD5',
                    rejectUnauthorized: false // Allow less strict validation for troubleshooting
                }
            };
            logger.info('Using Outlook/Office365 SMTP configuration');
        }
        // Special configuration for Gmail
        else if (emailConfig.service === 'gmail') {
            config = {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                auth: {
                    user: emailConfig.username,
                    pass: authPassword
                },
                requireTLS: true
            };
            logger.info('Using Gmail SMTP configuration');
        }
        // Special configuration for Yahoo
        else if (emailConfig.service === 'yahoo') {
            config = {
                host: 'smtp.mail.yahoo.com',
                port: 587,
                secure: false,
                auth: {
                    user: emailConfig.username,
                    pass: authPassword
                },
                requireTLS: true
            };
            logger.info('Using Yahoo SMTP configuration');
        }
        // Custom SMTP configuration
        else if (emailConfig.service === 'custom') {
            // Special handling for Outlook custom setup
            if (emailConfig.host && (emailConfig.host.includes('outlook') || emailConfig.host.includes('hotmail'))) {
                config = {
                    host: emailConfig.host,
                    port: emailConfig.port || 587,
                    secure: false, // Must be false for port 587
                    auth: {
                        user: emailConfig.username,
                        pass: authPassword
                    },
                    requireTLS: true,
                    tls: {
                        minVersion: 'TLSv1.2',
                        ciphers: 'HIGH:MEDIUM:!aNULL:!MD5:!SEED:!IDEA:!RC4',
                        rejectUnauthorized: false // Allow self-signed certs
                    }
                };
                logger.info(`Using special Outlook custom SMTP configuration: ${emailConfig.host}:${emailConfig.port}`);
            } else {
                config = {
                    host: emailConfig.host,
                    port: emailConfig.port,
                    secure: emailConfig.secure,
                    // STARTTLS required where set (never ignoreTLS)
                    requireTLS: effectiveRequireTLS(emailConfig),
                    auth: {
                        user: emailConfig.username,
                        pass: authPassword
                    }
                };
                logger.info(`Using custom SMTP configuration: ${emailConfig.host}:${emailConfig.port}`);
            }
        }
        // Fallback to service name-based configuration
        else {
            config = {
                service: emailConfig.service,
                auth: {
                    user: emailConfig.username,
                    pass: authPassword
                }
            };
            logger.info(`Using service-based SMTP configuration: ${emailConfig.service}`);
        }

        // Private hosts blocked: connect to the address that was checked
        // (not a second lookup), keeping the name for TLS
        if (checkedAddress && emailConfig.service === 'custom') {
            config = { ...config, host: checkedAddress, tls: { ...(config.tls || {}), servername: emailConfig.host } };
        }

        return nodemailer.createTransport(config);
    } catch (error) {
        logger.error('Error creating email transport:', {
            error: error.message,
            stack: error.stack
        });
        throw new Error('Failed to create email transport: ' + error.message);
    }
};

/**
 * Send an email using the user's configured SMTP settings
 * @param {String} userId - The user's ID
 * @param {String} to - Recipient email address
 * @param {String} subject - Email subject
 * @param {String} text - Plain text content
 * @param {String} html - HTML content (optional)
 * @returns {Object} - Information about the sent message
 */
const sendEmail = async (userId, to, subject, text, html = null) => {
    let emailConfig = null;
    try {
        // Find the user's email configuration
        emailConfig = await EmailConfig.findOne({ user: userId, enabled: true })
            .select('+rawPassword'); // Include the raw password in this query
        
        if (!emailConfig) {
            // Fall back to the instance-wide SMTP server from .env, if any
            const smtp = getInstanceSmtp();
            if (!smtp) {
                logger.warn(`No email configuration found for user ${userId}`);
                return {
                    success: false,
                    message: 'Email configuration not found or disabled'
                };
            }
            // The instance server belongs to the admin: only ever mail the
            // account's own address, never a user-supplied one (no open relay)
            const owner = await User.findById(userId);
            if (!owner || !owner.email || String(to).toLowerCase() !== owner.email.toLowerCase()) {
                logger.warn(`Instance SMTP refused: recipient is not the account email for user ${userId}`);
                return {
                    success: false,
                    message: 'The server email can only send to your account email address. Configure your own email in Settings to use another address.'
                };
            }
            if (!(await underInstanceSmtpLimit(userId))) {
                logger.warn(`Instance SMTP daily limit reached for user ${userId}`);
                return { success: false, message: 'Daily email limit for the server email reached; try again tomorrow.' };
            }
            const { from, ...transportConfig } = smtp;
            const transport = nodemailer.createTransport(transportConfig);
            const info = await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
            // Addresses and subjects (which name recipients) only at debug
            logger.info('Email sent via instance SMTP', { messageId: info.messageId, userId });
            logger.debug('Instance SMTP message details', { messageId: info.messageId, recipient: to, subject });
            return { success: true, messageId: info.messageId, response: info.response };
        }

        // Get user info for potential fallback and context
        const user = await User.findById(userId);
        if (!user) {
            logger.error(`User not found: ${userId}`);
            return {
                success: false,
                message: 'User not found'
            };
        }

        const smtpPassword = readSmtpPassword(emailConfig);
        if (!smtpPassword) {
            logger.warn(`Stored SMTP password unreadable for user ${userId}; asking for it again`);
            return { success: false, message: REENTER_PASSWORD_MESSAGE, code: 'SMTP_PASSWORD_REENTRY' };
        }

        const destination = await checkSmtpDestination(emailConfig);
        if (destination.error) {
            logger.warn(`SMTP destination refused for user ${userId}`);
            return { success: false, message: destination.error, code: 'SMTP_DESTINATION_REFUSED' };
        }

        // Create transport
        const transport = await createTransport(emailConfig, smtpPassword, destination.address);

        // Prepare mail options
        const mailOptions = {
            from: `"${emailConfig.fromName}" <${emailConfig.username}>`,
            to,
            subject,
            text
        };

        // Add HTML content if provided
        if (html) {
            mailOptions.html = html;
        }

        // Send the email
        const info = await transport.sendMail(mailOptions);
        
        logger.info('Email sent successfully', { messageId: info.messageId, userId });
        logger.debug('Email details', { messageId: info.messageId, recipient: to, subject });

        return {
            success: true,
            messageId: info.messageId,
            response: info.response
        };
    } catch (error) {
        logger.error('Error sending email:', {
            error: error.message,
            stack: error.stack,
            userId
        });
        logger.debug('Failed email details', { userId, recipient: to, subject });
        
        let errorMessage = 'Failed to send email: ' + error.message;
        
        // Create safer reference to the emailConfig that might not exist
        const safeEmailConfig = emailConfig || { service: 'unknown' };
        
        // Log detailed error for debugging in all cases
        logger.debug('Email error details:', {
            errorMessage: error.message,
            service: safeEmailConfig.service,
            errorType: 'send_email_error'
        });
        
        // Provide more user-friendly error messages for common issues
        if (error.message.includes('Invalid login') || 
            error.message.includes('authentication failed') || 
            error.message.includes('Authentication unsuccessful')) {
            errorMessage = 'Authentication failed. For Microsoft accounts, basic authentication may be disabled. ' +
                           'Please ensure you have 2FA enabled and are using an app password, or try a different email provider like Gmail.';
        } else if (error.message.includes('certificate')) {
            errorMessage = 'SSL certificate verification failed. Please check your server settings.';
        } else if (error.message.includes('Connection refused') || error.message.includes('connect ETIMEDOUT')) {
            errorMessage = 'Could not connect to email server. Please check your internet connection and server settings.';
        } else if (error.message.includes('Recipients failed')) {
            errorMessage = 'Email address rejected by server. Please check the recipient email address.';
        }
        
        return {
            success: false,
            message: errorMessage,
            code: error.code || 'SEND_FAILED'
        };
    }
};

/**
 * Send a test email to verify configuration
 * @param {String} userId - The user's ID
 * @returns {Object} - Test result
 */
const sendTestEmail = async (userId) => {
    let emailConfig = null;
    try {
        // Find the user's email configuration
        emailConfig = await EmailConfig.findOne({ user: userId })
            .select('+rawPassword'); // Include the raw password in this query
            
        // Add debug logging to help troubleshoot Outlook authentication issues
        logger.debug('Test email configuration retrieved:', {
            service: emailConfig?.service || 'not found',
            username: emailConfig?.username || 'not available',
            hasRawPassword: !!(emailConfig?.rawPassword),
            configFound: !!emailConfig
        });
        
        if (!emailConfig) {
            return { 
                success: false, 
                message: 'Email configuration not found'
            };
        }

        // Get user info for recipient and context
        const user = await User.findById(userId);
        if (!user) {
            return {
                success: false,
                message: 'User not found'
            };
        }

        // Log what we're attempting to do
        logger.info(`Attempting to send test email for user ${userId} using ${emailConfig.service} service`);
        logger.debug(`Test email from ${emailConfig.username} to ${user.email}`);

        // Send test email to the user's own email address
        let result = await sendEmail(
            userId,
            user.email,
            'Gifty: Email Configuration Test',
            'This is a test email to verify your SMTP configuration in Gifty.',
            `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #4a6ee0;">Gifty Email Configuration Test</h2>
                <p>Hello ${escapeHtml(user.firstName)},</p>
                <p>This is a test email to verify that your SMTP configuration in Gifty is working correctly.</p>
                <p>If you're seeing this email, your configuration is valid and you will receive email notifications for your upcoming events.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #888;">This is an automated message, please do not reply.</p>
            </div>`
        );

        // One answer for every failure to reach the server (also what is
        // stored as the last test result, which the settings page shows)
        if (!result.success && result.code && !SPECIFIC_FAILURES.has(result.code)) {
            logger.info(`SMTP test failed for user ${userId}: ${result.code}`);
            result = { ...result, message: TEST_CONNECTION_FAILED };
        }

        // Update the email configuration with the test result
        // A direct write: save() would validate the whole row, and an old
        // row without a stored password must still record why it failed
        await EmailConfig.updateOne({ _id: emailConfig._id }, {
            $set: {
                lastTested: new Date(),
                lastTestResult: {
                    success: result.success,
                    message: result.success ? 'Test email sent successfully' : result.message
                }
            }
        });

        return result;
    } catch (error) {
        logger.error('Error sending test email:', {
            error: error.message,
            stack: error.stack,
            userId
        });
        
        let errorMessage = 'Failed to send test email: ' + error.message;
        
        // Log detailed debug information for test email errors
        logger.debug('Test email error details:', {
            errorMessage: error.message,
            errorType: 'test_email_error',
            userId
        });
        
        // Add more helpful troubleshooting tips
        if (error.message.includes('Authentication')) {
            errorMessage = 'Authentication failed. Please check your email address and password. ' +
                          'For Gmail and Outlook accounts, make sure 2FA is enabled and you are using an app password.';
        }
        
        return {
            success: false,
            message: errorMessage
        };
    }
};

/**
 * Format an event notification email
 * @param {Object} user - User document
 * @param {Object} event - Event document
 * @param {Object} recipient - Recipient document
 * @returns {Object} - Formatted email content (text and html)
 */
const formatEventReminderEmail = (user, event, recipient) => {
    // Recipient model has firstName/lastName, not a 'name' field; recipient may
    // also be null if it was deleted after the event was created
    const recipientName = recipient
        ? [recipient.firstName, recipient.lastName].filter(Boolean).join(' ')
        : 'your recipient';

    // An event date is a calendar day, stored as UTC midnight: read it in
    // UTC (any other zone can show the day before) and without a time
    const eventDate = new Date(event.date).toLocaleDateString('en-US', {
        timeZone: 'UTC',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // There is no per-event page; link to the Events list
    const eventsUrl = `${runtime.getPublicUrl()}/events`;

    // Create plain text version
    const text = `
Hello ${user.firstName},

This is a reminder for an upcoming event:

Event: ${event.name}
Recipient: ${recipientName}
Date: ${eventDate}

Log into Gifty to manage this event and related gifts:
${eventsUrl}

Thank you for using Gifty!
`;

    // Create HTML version with styling
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
    <h2 style="color: #4a6ee0; margin-top: 0;">Gifty Event Reminder</h2>
    
    <p>Hello ${escapeHtml(user.firstName)},</p>
    
    <p>This is a reminder for an upcoming event:</p>
    
    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Event:</strong> ${escapeHtml(event.name)}</p>
        <p style="margin: 5px 0;"><strong>Recipient:</strong> ${escapeHtml(recipientName)}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${eventDate}</p>
    </div>
    
    <p>
        <a href="${escapeHtml(eventsUrl)}" style="display: inline-block; background-color: #4a6ee0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
            View Event Details
        </a>
    </p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    
    <p style="font-size: 12px; color: #888;">
        This is an automated message from Gifty. Please do not reply to this email.
    </p>
</div>
`;

    return { text, html };
};

module.exports = {
    sendEmail,
    sendTestEmail,
    formatEventReminderEmail
};