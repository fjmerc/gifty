const jwt = require('jsonwebtoken');

// The session generation a token belongs to; tokens issued before versions
// existed carry none and count as 0, like accounts without a stored version
const tokenVersionOf = (decoded) => (Number.isInteger(decoded?.tv) ? decoded.tv : 0);
const currentTokenVersion = (user) => (Number.isInteger(user?.tokenVersion) ? user.tokenVersion : 0);
const isTokenCurrent = (decoded, user) => tokenVersionOf(decoded) === currentTokenVersion(user);

/**
 * Generates a JWT token with the user ID as payload
 *
 * @param {String} id - User ID to include in the token payload
 * @param {String} type - Token type: 'access' or 'refresh'
 * @param {Number} version - The user's tokenVersion (see models/User)
 * @returns {String} Generated JWT token
 */
const generateToken = (id, type = 'access', version = 0) => {
    // Different expiration times based on token type
    const expiresIn = type === 'refresh' ? '7d' : '1h';

    return jwt.sign(
        { id, type, tv: version },
        process.env.JWT_SECRET,
        { expiresIn }
    );
};

module.exports = { generateToken, tokenVersionOf, currentTokenVersion, isTokenCurrent };
