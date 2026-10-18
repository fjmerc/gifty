/**
 * Enhanced rate limiting middleware configuration
 */
const { redactUrl } = require('../utils/redactUrl');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { addressKey, networkKey } = require('../utils/passwordAttempts');
const { loginLookupEmail } = require('../utils/loginEmail');

// The client's address as a limit key: IPv6 per /64 (one client usually
// holds a whole /64), IPv4-mapped IPv6 as plain IPv4
const keyByAddress = (req) => `ip:${addressKey(req.ip || req.socket?.remoteAddress)}`;

// Helper to create limiter with consistent options
const createLimiter = (options) => {
  const { 
    windowMs = 15 * 60 * 1000, // 15 minutes by default
    max = 100,                 // 100 requests per window by default
    message = 'Too many requests, please try again later',
    standardHeaders = true,    // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders = false,     // Disable the `X-RateLimit-*` headers
    handler = null,
    skipSuccessfulRequests = false,
    requestPropertyName = 'rateLimit',
    keyGenerator = keyByAddress,
    skip = () => false         // Don't skip any requests by default
  } = options;

  // Custom handler to provide more details about rate limiting
  const defaultHandler = (req, res, next, optionsUsed) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    logger.warn('Rate limit exceeded', {
      ip: clientIP,
      path: redactUrl(req.originalUrl || req.path),
      method: req.method,
      windowMs: optionsUsed.windowMs,
      max: optionsUsed.max,
      headers: req.headers['user-agent'],
    });
    
    res.status(429).json({
      status: 'error',
      message,
      retryAfter: Math.ceil(optionsUsed.windowMs / 1000),
    });
  };

  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders,
    legacyHeaders,
    handler: handler || defaultHandler,
    skipSuccessfulRequests,
    requestPropertyName,
    keyGenerator,
    skip,
    // warnIfProxyHeadersIgnored below gives the clearer message
    validate: { xForwardedForHeader: false }
  });
};

// Authentication rate limiters
const authLimiters = {
  // Strict rate limit for login attempts
  login: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                   // 5 failed attempts per IP in the window
    message: 'Too many login attempts, please try again after 15 minutes',
    // A household shares one IP: logging in successfully uses up nothing
    skipSuccessfulRequests: true,
  }),
  
  // Failed logins for one account from one network (IPv4 /24, IPv6 /64):
  // guessing from one source stops here without locking the account's
  // owner out on their own network. Mounted after the login validation, so
  // it counts the email the login looks up. The count starts with the
  // request, so parallel attempts count too.
  loginPerEmail: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                  // 10 failed attempts per email and network
    message: 'Too many login attempts, please try again after 15 minutes',
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = loginLookupEmail(req);
      const network = networkKey(req.ip || req.socket?.remoteAddress);
      return email ? `email:${email}|net:${network}` : keyByAddress(req);
    },
  }),

  // Limit registration attempts; a household signing up together uses up
  // nothing, failed attempts (e.g. a wrong setup code) do
  register: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,                   // 3 failed registration attempts per hour
    message: 'Too many registration attempts, please try again after 1 hour',
    skipSuccessfulRequests: true,
  }),
  
  // Password related operations
  password: createLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,                   // 3 password change/reset attempts per hour
    message: 'Too many password operations, please try again after 1 hour',
  }),

  // Public invite and reset link lookups: enough for a household, not for guessing
  links: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,
    message: 'Too many requests, please try again after 15 minutes',
  }),
};

// Key generator that prefers the authenticated user id over the IP.
// Falls back to IP for unauthenticated routes. This matters for AI
// suggestion endpoints — without user-keying, multiple users behind
// the same NAT could starve each other.
const keyByUser = (req) => (req.user?._id ? `u:${req.user._id}` : keyByAddress(req));

const expensiveLimiter = () => createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                  // 10 requests per hour
  message: 'Too many requests for this resource, please try again after 1 hour',
  keyGenerator: keyByUser,
});

// API endpoint limiters
const apiLimiters = {
  // General API limiter
  standard: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                 // 100 requests per 15 minutes
    message: 'Too many requests, please try again after 15 minutes',
  }),

  // Stricter limit for more resource-intensive operations
  intensive: createLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,                  // 30 requests per 15 minutes
    message: 'Too many requests for this resource, please try again after 15 minutes',
  }),

  // Very strict limit for expensive operations (uploads, SMTP tests): 10
  // an hour per account, each route with its own budget
  expensive: expensiveLimiter(),
  recipientPhoto: expensiveLimiter(),
  smtpTest: expensiveLimiter(),

  // AI suggestion generation — high-cost path (real $ per call). Keyed
  // per-user so abuse is contained. Limits are env-overridable for ops
  // tuning without code changes. Bypassed in test env so suite isn't
  // throttled across runs.
  aiSuggestion: createLimiter({
    windowMs: parseInt(process.env.AI_SUGGESTION_WINDOW_MS, 10) || 60 * 1000, // 1 min
    max: parseInt(process.env.AI_SUGGESTION_MAX_PER_WINDOW, 10) || 10,
    message: 'You are generating suggestions too quickly. Please wait a moment and try again.',
    keyGenerator: keyByUser,
    skip: () => process.env.NODE_ENV === 'test',
  }),
  aiSuggestionHourly: createLimiter({
    windowMs: parseInt(process.env.AI_SUGGESTION_HOUR_WINDOW_MS, 10) || 60 * 60 * 1000, // 1h
    max: parseInt(process.env.AI_SUGGESTION_MAX_PER_HOUR, 10) || 100,
    message: 'Hourly AI suggestion limit reached. Please try again later.',
    keyGenerator: keyByUser,
    skip: () => process.env.NODE_ENV === 'test',
  }),
};

// Failed logins per account across all networks, for the log only: no
// account-wide block, since strangers could use one to lock a member out.
// Counted for existing accounts (loginUser sets res.locals.loginAccountId).
const ACCOUNT_FAILURE_WINDOW_MS = 60 * 60 * 1000;
const ACCOUNT_FAILURE_WARN_AT = 100;
const accountFailures = new Map(); // account id -> { count, networks:Set, resetAt, warned }
const noteAccountLoginFailures = (req, res, next) => {
  res.on('finish', () => {
    const accountId = res.locals.loginAccountId;
    if (res.statusCode !== 401 || !accountId) return;
    const now = Date.now();
    if (accountFailures.size > 10000) {
      for (const [key, entry] of accountFailures) if (entry.resetAt <= now) accountFailures.delete(key);
    }
    let entry = accountFailures.get(String(accountId));
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, networks: new Set(), resetAt: now + ACCOUNT_FAILURE_WINDOW_MS, warned: false };
      accountFailures.set(String(accountId), entry);
    }
    entry.count += 1;
    entry.networks.add(networkKey(req.ip || req.socket?.remoteAddress));
    if (!entry.warned && entry.count >= ACCOUNT_FAILURE_WARN_AT) {
      entry.warned = true;
      logger.warn(`account ${accountId}: ${entry.count} failed logins in the last hour from ${entry.networks.size} networks`);
    }
  });
  next();
};

// Behind a reverse proxy without TRUST_PROXY every client has the proxy's
// address, so one client's failed logins lock everyone out. Say so once.
let proxyWarningGiven = false;
const warnIfProxyHeadersIgnored = (req, res, next) => {
  if (!proxyWarningGiven && req.headers['x-forwarded-for'] && !(process.env.TRUST_PROXY || '').trim()) {
    proxyWarningGiven = true;
    logger.warn('Requests arrive with X-Forwarded-For but TRUST_PROXY is not set: every client is seen as the proxy\'s address, so rate limits (failed logins) are shared by all users. Set TRUST_PROXY to the proxy\'s address or CIDR (see README).');
  }
  next();
};
const resetProxyWarning = () => { proxyWarningGiven = false; };

// With the login limits, so test suites that stub them stub this too
authLimiters.loginFailureLog = noteAccountLoginFailures;

module.exports = {
  authLimiters,
  apiLimiters,
  createLimiter,
  keyByUser,
  keyByAddress,
  warnIfProxyHeadersIgnored,
  resetProxyWarning,
  noteAccountLoginFailures
};
