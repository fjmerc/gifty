const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const logger = require('../utils/logger');
const { isTokenCurrent } = require('../utils/generateToken');

/**
 * Middleware to protect routes - requires valid access token cookie
 */
const protect = asyncHandler(async (req, res, next) => {
  let token = req.cookies.access_token;
  
  // Backward compatibility - check Authorization header if no cookie
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
    logger.info('Using Authorization header for authentication (legacy mode)');
  }

  if (!token) {
    logger.warn('No authentication token found');
    res.status(401);
    // Check if res.setHeader is available (real response) or not (test mock)
    if (typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json');
    }
    // NO_TOKEN: the client may still hold a refresh cookie (the browser
    // drops an expired access cookie), so it tries one refresh
    return res.json({ message: 'Not authorized, no token', code: 'NO_TOKEN' });
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // For access tokens, verify the token type
    if (decoded.type && decoded.type !== 'access') {
      logger.warn(`Invalid token type: ${decoded.type}`);
      res.status(401);
      // Check if res.setHeader is available (real response) or not (test mock)
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
      }
      return res.json({ message: 'Invalid token type' });
    }

    // Get user from the token
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      logger.warn(`User not found for token ID: ${decoded.id}`);
      res.status(401);
      // Check if res.setHeader is available (real response) or not (test mock)
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
      }
      return res.json({ message: 'User not found' });
    }
    
    // Signed out, or the password or email changed, since this token was issued
    if (!isTokenCurrent(decoded, user)) {
      logger.warn(`Revoked token used for user: ${user._id}`);
      res.status(401);
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
      }
      return res.json({ message: 'Your session has ended. Please sign in again.', code: 'SESSION_REVOKED' });
    }

    // Set user in request object
    req.user = user;
    logger.debug(`User authenticated: ${user._id}`); // every request: debug only
    next();
  } catch (error) {
    logger.error('Token validation error:', { error: error.message });
    
    // Handle specific token errors
    if (error.name === 'TokenExpiredError') {
      res.status(401);
      // Check if res.setHeader is available (real response) or not (test mock)
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
      }
      return res.json({ 
        message: 'Token expired', 
        code: 'TOKEN_EXPIRED'
      });
    }
    
    res.status(401);
    // Check if res.setHeader is available (real response) or not (test mock)
    if (typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json');
    }
    res.json({ message: 'Not authorized, token validation failed' });
  }
});

/**
 * Middleware to ensure user has admin role
 * Must be used after the protect middleware
 */
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    logger.warn(`Admin access denied for user: ${req.user?._id}`);
    res.status(403);
    // Check if res.setHeader is available (real response) or not (test mock)
    if (typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'application/json');
    }
    res.json({ message: 'Not authorized as an admin' });
  }
};

module.exports = { protect, admin };

