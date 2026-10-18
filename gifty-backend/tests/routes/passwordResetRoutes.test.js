// A reset link is single-use and 256 bits long, so guessing is not the risk;
// a few weak-password tries must not lock it. It shares the link-lookup
// limiter, not the 3-an-hour limiter of signed-in password changes.
const { authLimiters } = require('../../middleware/rateLimitMiddleware');
const router = require('../../routes/passwordResetRoutes');

const handlersOf = (method) => router.stack.find((l) => l.route?.path === '/:token' && l.route.methods[method]).route.stack.map((s) => s.handle);

describe('password reset routes', () => {
  it('using a link is limited like looking one up', () => {
    expect(handlersOf('post')).toContain(authLimiters.links);
    expect(handlersOf('post')).not.toContain(authLimiters.password);
  });
});
