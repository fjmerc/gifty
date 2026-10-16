const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { generateToken, currentTokenVersion } = require('../utils/generateToken');
const { setAuthCookies, clearAuthCookies } = require('../utils/cookieUtils');
const { removeUnreferencedUpload } = require('../utils/uploads');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Gift = require('../models/Gift');
const Event = require('../models/Event');
const { Budget, OverallBudget, UserPreferences } = require('../models/Budget');
const Recipient = require('../models/Recipient');
const Notification = require('../models/Notification');
const Integration = require('../models/Integration');
const Profile = require('../models/Profile');
const EmailConfig = require('../models/EmailConfig');
const SuggestionHistory = require('../models/SuggestionHistory');
const FeedbackLog = require('../models/FeedbackLog');
const Tag = require('../models/Tags');
const EventType = require('../models/EventType');
const Vendor = require('../models/Vendor');
const GiftLibrary = require('../models/GiftLibrary');
const SuggestionMetric = require('../models/SuggestionMetric');
const holidayService = require('../services/holidayService');
const { deleteUserRetiredDocuments } = require('../services/retiredCollections');
const logger = require('../utils/logger');
const { HttpError } = require('../utils/ownership');
const passwordAttempts = require('../utils/passwordAttempts');
const setupCode = require('../services/setupCodeService');
const { loginLookupEmail } = require('../utils/loginEmail');
const { isInstanceOwner } = require('../middleware/instanceOwnerMiddleware');
const { HOLIDAY_COUNTRIES } = require('../utils/dbInitializer');
const { getInstanceDefaults } = require('../config/instanceDefaults');
const { ALLOWED_PREFERENCE_KEYS, HOLIDAY_CATEGORIES } = require('../config/userPreferences');

// Sign this response in with the user's current token version
const issueSession = (res, user) => {
    const version = currentTokenVersion(user);
    setAuthCookies(res, generateToken(user._id, 'access', version), generateToken(user._id, 'refresh', version));
};

// Ends every session issued so far (other devices, copied cookies)
const revokeSessions = (userId) => User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });

// Signing in with an unknown email does the same bcrypt work as a wrong
// password, so the response time doesn't say which emails have accounts
let dummyHash = null;
const dummyPasswordCheck = async (password) => {
    if (!dummyHash) dummyHash = bcrypt.hash('not-a-real-password', User.BCRYPT_COST || 12);
    await bcrypt.compare(String(password), await dummyHash);
};

// One answer for a taken email or username: registration must not tell
// strangers which accounts exist
const TAKEN_MESSAGE = "That email or username can't be used. If you already have an account, sign in instead.";

// The current password typed into a signed-in form: 'blocked' after too
// many wrong ones (see utils/passwordAttempts), else whether it matched
const checkCurrentPassword = async (req, user, password) => {
    const release = passwordAttempts.reserveAttempt(req);
    if (!release) return 'blocked';
    if (typeof password === 'string' && password && await user.matchPassword(password)) {
        release();
        return 'ok';
    }
    return 'wrong';
};

const MIN_REMIND_DAYS = 1;
const MAX_REMIND_DAYS = 30;

// Holiday settings after applying an update, or an error message
const mergeHolidaySettings = (current, update) => {
    const merged = { ...current, ...update };
    if (!HOLIDAY_COUNTRIES.includes(merged.countryCode)) {
        return { error: `Holidays are not available for that country. Choose one of: ${HOLIDAY_COUNTRIES.join(', ')}` };
    }
    if (!Array.isArray(merged.categories) || merged.categories.some((c) => !HOLIDAY_CATEGORIES.includes(c))) {
        return { error: `Unknown holiday category. Choose from: ${HOLIDAY_CATEGORIES.join(', ')}` };
    }
    const days = merged.defaultRemindDaysBefore;
    if (!Number.isInteger(days) || days < MIN_REMIND_DAYS || days > MAX_REMIND_DAYS) {
        return { error: `Reminder days must be a whole number between ${MIN_REMIND_DAYS} and ${MAX_REMIND_DAYS}` };
    }
    if (typeof merged.enabled !== 'boolean') {
        return { error: 'Holiday reminders must be switched on or off' };
    }
    return { settings: { ...merged, categories: [...new Set(merged.categories)] } };
};

const sameHolidaySettings = (a, b) => a.enabled === b.enabled
    && a.countryCode === b.countryCode
    && a.defaultRemindDaysBefore === b.defaultRemindDaysBefore
    && [...a.categories].sort().join() === [...b.categories].sort().join();

// @desc Update user preferences including holiday settings
// @route PUT /api/users/preferences
// @access Private
exports.updateUserPreferences = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    let holidays;
    const update = req.body.preferences;
    if (update) {
        let previous = null;
        let holidaySettingsChanged = false;

        if (update.holidaySettings) {
            const current = user.preferences.holidaySettings?.toObject?.() || { ...user.preferences.holidaySettings };
            const { settings, error } = mergeHolidaySettings(current, update.holidaySettings);
            if (error) throw new HttpError(400, error);
            holidaySettingsChanged = !sameHolidaySettings(current, settings);
            previous = current;
            user.preferences.holidaySettings = settings;
        }

        // Other preferences, from the keys clients may set; the AI provider
        // and model change through POST /api/settings/user-preferences,
        // which checks them against the available models
        const elsewhere = new Set(['holidaySettings', 'aiProvider', 'aiModel']);
        Object.keys(update).forEach(key => {
            if (!elsewhere.has(key) && ALLOWED_PREFERENCE_KEYS.has(key)) {
                user.preferences[key] = update[key];
            }
        });

        await user.save();

        // Bring the holiday events in line with the new settings
        if (holidaySettingsChanged) {
            try {
                holidays = await holidayService.updateUserHolidayEvents(user._id, { previous });
            } catch (error) {
                holidays = { success: false, error: error.message };
            }
            // The settings are saved either way; the response says the events were not updated
            if (!holidays.success) logger.error('Updating holiday events after a settings change failed:', holidays.error);
        }
    }

    res.status(200).json({
        message: 'Preferences updated successfully',
        preferences: user.preferences,
        ...(holidays && { holidays })
    });
});

// @desc Change user password
// @route POST /api/users/change-password
// @access Private
exports.changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Verify current password (400, not 401: a 401 signs the app out)
    const check = await checkCurrentPassword(req, user, currentPassword);
    if (check === 'blocked') {
        res.status(429);
        throw new Error(passwordAttempts.TOO_MANY_MESSAGE);
    }
    if (check === 'wrong') {
        res.status(400);
        throw new Error(passwordAttempts.WRONG_MESSAGE);
    }

    // Update password; sessions from before the change end, this one
    // carries on with new tokens
    user.password = newPassword;
    user.tokenVersion = currentTokenVersion(user) + 1;
    await user.save();
    issueSession(res, user);

    res.status(200).json({
        message: 'Password updated successfully'
    });
});

// @desc Delete user account and all associated data
// @route DELETE /api/users/account
// @access Private
exports.deleteAccount = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    try {
        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        // Deleting is final: it needs the current password, counted with
        // the other signed-in password checks
        const { currentPassword } = req.body || {};
        const passwordField = (status, message) => res.status(status).json({ message, errors: [{ field: 'currentPassword', message }] });
        if (typeof currentPassword !== 'string' || !currentPassword) {
            return passwordField(400, 'Enter your current password to delete your account');
        }
        const check = await checkCurrentPassword(req, user, currentPassword);
        if (check === 'blocked') return passwordField(429, passwordAttempts.TOO_MANY_MESSAGE);
        if (check === 'wrong') return passwordField(400, passwordAttempts.WRONG_MESSAGE);

        // The instance owner is the oldest account: deleting it would hand
        // owner rights (instance backups, restore) to the next account
        const owner = await User.findOne({}, { _id: 1 }).sort({ _id: 1 }).lean();
        if (owner && String(owner._id) === String(userId) && await User.exists({ _id: { $ne: userId } })) {
            res.status(409);
            throw new Error('The instance owner can\'t delete their account while other accounts exist.');
        }

        // End every session first, so a half-finished deletion still signs everyone out
        await revokeSessions(userId);

        // Delete all associated data sequentially to maintain consistency
        logger.debug('Starting deletion of associated data...');
        
        // Recipient photos go once their documents are gone
        const recipientPhotos = (await Recipient.find({ user: userId }).select('profilePicture').lean())
            .map((recipient) => recipient.profilePicture).filter(Boolean);

        await Gift.deleteMany({ user: userId });
        await Event.deleteMany({ user: userId });
        await Budget.deleteMany({ user: userId });
        await OverallBudget.deleteMany({ user: userId });
        await UserPreferences.deleteMany({ user: userId });
        await Recipient.deleteMany({ user: userId });
        for (const photo of recipientPhotos) await removeUnreferencedUpload(photo);
        await Notification.deleteMany({ user: userId });
        await Integration.deleteMany({ user: userId });
        await Profile.deleteMany({ user: userId });
        await deleteUserRetiredDocuments(userId);
        // EmailConfig holds SMTP credentials — must not be left behind on account deletion.
        await EmailConfig.deleteMany({ user: userId });
        await SuggestionHistory.deleteMany({ user: userId });
        await FeedbackLog.deleteMany({ user: userId });
        await SuggestionMetric.deleteMany({ user: userId });
        await Tag.deleteMany({ user: userId });
        await Vendor.deleteMany({ user: userId });
        await EventType.deleteMany({ createdBy: userId, isCustom: true });
        // The shared library keeps its popularity, not who reacted
        await GiftLibrary.updateMany({ 'reactions.user': userId }, { $pull: { reactions: { user: userId } } });

        // Delete the user last, then their picture (unless something else uses it)
        await User.findByIdAndDelete(userId);
        if (user.profilePicture) await removeUnreferencedUpload(user.profilePicture);

        // Clear the auth cookies so the now-deleted user isn't left "logged in".
        clearAuthCookies(res);

        logger.debug('Successfully deleted all user data');
        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        logger.error('Delete account error:', error);
        // Keep a refusal's own status (404, 409); anything else is a failure
        if (res.statusCode < 400) res.status(500);
        throw new Error(error.message || 'Failed to delete account');
    }
});

// @desc Register a new user
// @route POST /api/users/register
// @access Public
exports.registerUser = asyncHandler(async (req, res) => {
    const { username, email, password, firstName, lastName, dateOfBirth } = req.body;

    logger.info('Register user request received');

    // Validate required fields
    if (!username || !email || !password || !firstName || !lastName) {
        logger.warn('Registration failed - missing required fields');
        res.status(400);
        throw new Error('Please provide all required fields');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        logger.warn('Registration failed - invalid email format');
        res.status(400);
        throw new Error('Please provide a valid email address');
    }

    // Password strength validation
    if (password.length < 8) {
        logger.warn('Registration failed - password too short');
        res.status(400);
        throw new Error('Password must be at least 8 characters long');
    }

    // The first account owns the instance: it needs the setup code from
    // the server log or the data folder
    const firstAccount = await setupCode.isSetupRequired();
    if (firstAccount && !(await setupCode.verifySetupCode(req.body.setupCode))) {
        const message = `Enter the setup code from the server log or from ${setupCode.FILE_NAME} in the data folder`;
        logger.warn('Registration failed - first account without a valid setup code');
        return res.status(400).json({ message, errors: [{ field: 'setupCode', message }] });
    }

    // An email or username already in use; both get the same answer
    const userExists = await User.findOne({ email });
    const usernameExists = userExists ? null : await User.findOne({ username });
    if (userExists || usernameExists) {
        logger.warn('Registration failed - email or username already in use');
        res.status(400);
        throw new Error(TAKEN_MESSAGE);
    }

    // Create user, with this instance's holiday country and currency
    const defaults = getInstanceDefaults();
    const user = await User.create({
        username,
        email,
        password, // Note: Hashing will be handled in the User model
        firstName,
        lastName,
        dateOfBirth,
        preferences: { currency: defaults.currency, holidaySettings: { countryCode: defaults.country } }
    });

    if (user) {
        logger.info('User created successfully', { userId: user._id });
        if (firstAccount) await setupCode.clearSetupCode();
        
        // HTTP-only cookies with access and refresh tokens
        issueSession(res, user);
        
        // Generate holiday events for the new user
        try {
            const holidayResult = await holidayService.generateHolidayEvents(user._id);
            logger.info('Holiday events generated for new user', { userId: user._id, count: holidayResult?.count });
        } catch (error) {
            logger.error('Error generating holiday events for new user', { 
                userId: user._id, 
                error: error.message 
            });
            // Don't fail registration if holiday generation fails
        }
        
        // Return user data without sending the token in the response body
        res.status(201).json({
            _id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            dateOfBirth: user.dateOfBirth,
            profilePicture: user.profilePicture,
            createdAt: user.createdAt,
            isInstanceOwner: await isInstanceOwner(user._id)
        });
    } else {
        logger.error('Failed to create user');
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// Whether the account holds anything worth a backup (the client's backup
// reminder waits for it); the holidays account doesn't count
const hasRecipients = async (userId) =>
    Boolean(await Recipient.exists({ user: userId, isSystemAccount: { $ne: true } }));

// @desc Authenticate user & get token
// @route POST /api/users/login
// @access Public
exports.loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    logger.info('Login attempt', { email: email ? 'provided' : 'missing' });

    // Validate input
    if (!email || !password) {
        logger.warn('Login failed - missing credentials');
        res.status(400);
        throw new Error('Please provide email and password');
    }

    // Find user by email (the same value the per-email limit counts)
    const user = await User.findOne({ email: loginLookupEmail(req) });

    if (!user) await dummyPasswordCheck(password);

    // Check if user exists and password matches
    if (user && (await user.matchPassword(password))) {
        logger.info('Login successful', { userId: user._id });
        
        // HTTP-only cookies with access and refresh tokens
        issueSession(res, user);

        // Track login attempt - successful
        // You could add additional tracking here like IP address, device info, etc.

        // Return user data without sending the token in the response body
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            dateOfBirth: user.dateOfBirth,
            profilePicture: user.profilePicture,
            createdAt: user.createdAt,
            hasRecipients: await hasRecipients(user._id),
            isInstanceOwner: await isInstanceOwner(user._id)
        });
    } else {
        // Failed login attempt (counted per account for the log)
        if (user) res.locals.loginAccountId = user._id;
        logger.warn('Login failed - invalid credentials');
        
        // Track login attempt - failed
        // You could implement rate limiting or account locking here

        // Use consistent error message to prevent user enumeration
        res.status(401);
        throw new Error('Invalid email or password');
    }
});

// @desc Get user profile
// @route GET /api/users/profile
// @access Private
exports.getUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    logger.info('Get user profile request', { userId: req.user._id });

    if (user) {
        res.json({
            _id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            dateOfBirth: user.dateOfBirth,
            profilePicture: user.profilePicture,
            createdAt: user.createdAt,
            hasRecipients: await hasRecipients(user._id),
            // Instance-wide tools (database backups) are shown only to the owner
            isInstanceOwner: await isInstanceOwner(user._id)
        });
    } else {
        logger.warn('User not found during profile fetch', { userId: req.user._id });
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc Logout user
// @route POST /api/users/logout
// @access Private
exports.logoutUser = asyncHandler(async (req, res) => {
    // Signing out ends the session everywhere: a copied refresh token
    // must not keep working
    await revokeSessions(req.user._id);
    clearAuthCookies(res);
    
    logger.info('User logged out', { userId: req.user?._id });
    
    res.json({ message: 'Logged out successfully' });
});

// @desc Update user profile
// @route PUT /api/users/profile
// @access Private
exports.updateUserProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    logger.debug('Update User Profile API called. User ID:', req.user._id);

    if (user) {
        // The email is the login: changing it needs the current password,
        // and ends the sessions issued for the old one
        const requestedEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const emailChanges = Boolean(requestedEmail) && requestedEmail !== user.email;
        if (emailChanges) {
            const { currentPassword } = req.body;
            const fieldError = (message) => res.status(400).json({ message, errors: [{ field: 'currentPassword', message }] });
            if (typeof currentPassword !== 'string' || !currentPassword) {
                return fieldError('Enter your current password to change your email');
            }
            const check = await checkCurrentPassword(req, user, currentPassword);
            if (check === 'blocked') {
                return res.status(429).json({ message: passwordAttempts.TOO_MANY_MESSAGE, errors: [{ field: 'currentPassword', message: passwordAttempts.TOO_MANY_MESSAGE }] });
            }
            if (check === 'wrong') return fieldError(passwordAttempts.WRONG_MESSAGE);
            user.tokenVersion = currentTokenVersion(user) + 1;
        }

        user.username = req.body.username || user.username;
        user.email = req.body.email || user.email;
        user.firstName = req.body.firstName || user.firstName;
        user.lastName = req.body.lastName || user.lastName;
        // An emptied date of birth clears it; leaving it out keeps it
        if (req.body.dateOfBirth !== undefined) {
            user.dateOfBirth = req.body.dateOfBirth || undefined;
        }
        // The password changes only through /change-password, which asks
        // for the current one

        const updatedUser = await user.save();

        // HTTP-only cookies with access and refresh tokens
        issueSession(res, updatedUser);
        
        res.json({
            _id: updatedUser._id,
            username: updatedUser.username,
            email: updatedUser.email,
            firstName: updatedUser.firstName,
            lastName: updatedUser.lastName,
            dateOfBirth: updatedUser.dateOfBirth,
            profilePicture: updatedUser.profilePicture
        });
        
    } else {
        logger.debug('User not found with ID:', req.user._id);
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc Upload profile picture
// @route POST /api/users/profile/picture
// @access Private
exports.uploadProfilePicture = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (!req.file) {
        res.status(400);
        throw new Error('Please upload a file');
    }

    // Create URL for the uploaded file
    const profilePicture = `/uploads/${req.file.filename}`;
    
    // Update user's profile picture
    const previousPicture = user.profilePicture;
    user.profilePicture = profilePicture;
    await user.save();
    if (previousPicture && previousPicture !== profilePicture) {
        await removeUnreferencedUpload(previousPicture);
    }

    res.json({
        message: 'Profile picture uploaded successfully',
        profilePicture: user.profilePicture
    });
});
