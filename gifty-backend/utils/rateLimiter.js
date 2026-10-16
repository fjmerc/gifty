const logger = require('../utils/logger');
class RateLimiter {
  constructor(maxRequests, timeWindow, maxWaitTime = null) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow; // in milliseconds
    this.maxWaitTime = maxWaitTime || timeWindow * 2; // Default max wait is 2x the time window
    this.requests = [];
  }

  async wait() {
    const now = Date.now();

    // Remove requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);

    // If we've exceeded the limit, wait
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      let waitTime = this.timeWindow - (now - oldestRequest);

      // Cap the wait time to prevent indefinite waiting
      if (waitTime > this.maxWaitTime) {
        logger.warn(`[RateLimiter] Wait time ${waitTime}ms exceeds max ${this.maxWaitTime}ms, capping`);
        waitTime = this.maxWaitTime;
      }

      if (waitTime > 0) {
        logger.debug(`[RateLimiter] Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Clean up again after waiting
      this.requests = this.requests.filter(time => Date.now() - time < this.timeWindow);
    }

    // Add the current request
    this.requests.push(Date.now());
  }

  /**
   * Check if we're at the rate limit without waiting
   * @returns {boolean} True if at limit
   */
  isAtLimit() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    return this.requests.length >= this.maxRequests;
  }

  /**
   * Get current rate limit status
   * @returns {Object} Status object with remaining requests and reset time
   */
  getStatus() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    const oldestRequest = this.requests[0];

    return {
      remaining: Math.max(0, this.maxRequests - this.requests.length),
      total: this.maxRequests,
      resetIn: oldestRequest ? Math.max(0, this.timeWindow - (now - oldestRequest)) : 0
    };
  }
}

module.exports = RateLimiter;
