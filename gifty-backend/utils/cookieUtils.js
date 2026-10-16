/**
 * Utility functions for handling secure cookies
 */
const { isHttps } = require('../config/runtime');

// Secure when the instance is configured for https, or when this request
// arrived over TLS — directly, or via a proxy's X-Forwarded-Proto. Reading the
// header here (instead of app-wide 'trust proxy') keeps req.ip unspoofable;
// a forged header can only make the sender's own cookies stricter.
const forwardedHttps = (req) => {
  const proto = req && typeof req.get === 'function' ? req.get('x-forwarded-proto') : undefined;
  return typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https';
};
const isSecureRequest = (res) => {
  const req = res && res.req;
  return isHttps() || Boolean(req && req.secure) || forwardedHttps(req);
};

/**
 * Sets secure HTTP-only cookies for authentication
 *
 * @param {Object} res - Express response object
 * @param {String} accessToken - JWT access token
 * @param {String} refreshToken - JWT refresh token
 */
const setAuthCookies = (res, accessToken, refreshToken) => {
  // Set access token cookie - short lived (1 hour)
  res.cookie('access_token', accessToken, {
    httpOnly: true,                            // Prevent JavaScript access
    secure: isSecureRequest(res), // browsers drop Secure cookies on plain http
    sameSite: 'strict',                        // Prevent CSRF
    maxAge: 60 * 60 * 1000,                    // 1 hour in milliseconds
    path: '/'                                  // Available on all paths
  });

  // Set refresh token cookie - longer lived (7 days)
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isSecureRequest(res),
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,           // 7 days in milliseconds
    path: '/api/users/refresh-token'           // Only sent to refresh token endpoint
  });
};

/**
 * Clears authentication cookies
 *
 * @param {Object} res - Express response object
 */
const clearAuthCookies = (res) => {
  res.clearCookie('access_token', {
    httpOnly: true,
    secure: isSecureRequest(res),
    sameSite: 'strict',
    path: '/'
  });

  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: isSecureRequest(res),
    sameSite: 'strict',
    path: '/api/users/refresh-token'
  });
};

module.exports = {
  setAuthCookies,
  clearAuthCookies
};
