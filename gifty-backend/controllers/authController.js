const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateToken, isTokenCurrent, currentTokenVersion } = require('../utils/generateToken');
const { setAuthCookies } = require('../utils/cookieUtils');

/**
 * @desc    Refresh access token using refresh token
 * @route   POST /api/users/refresh-token
 * @access  Public - but requires refresh token cookie
 */
const refreshToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  
  if (!refreshToken) {
    res.status(401);
    throw new Error('Refresh token not found, please login again');
  }

  try {
    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    // Check if it's actually a refresh token
    if (decoded.type !== 'refresh') {
      res.status(401);
      throw new Error('Invalid token type');
    }

    // Get user from the token
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      res.status(401);
      throw new Error('User not found');
    }

    // Deactivated by an admin
    if (user.active === false) {
      res.status(401);
      throw new Error('This account is deactivated. Ask an admin of this Gifty to reactivate it.');
    }

    // Signed out, or the password or email changed, since it was issued
    if (!isTokenCurrent(decoded, user)) {
      res.status(401);
      throw new Error('Your session has ended. Please sign in again.');
    }

    // Generate new tokens
    const version = currentTokenVersion(user);
    const newAccessToken = generateToken(user._id, 'access', version);
    const newRefreshToken = generateToken(user._id, 'refresh', version);
    
    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

    // Just send success message, no token in the body
    res.json({ 
      success: true,
      message: 'Token refreshed successfully'
    });
    
  } catch (error) {
    res.status(401);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new Error('Invalid or expired token, please login again');
    } else {
      throw error;
    }
  }
});

module.exports = { refreshToken };
