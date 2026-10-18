// Invite and reset tokens are in the URL; logs must never hold them
const { redactUrl } = require('../../utils/redactUrl');

describe('redactUrl', () => {
  it.each([
    ['/api/invites/abcDEF_123-x', '/api/invites/[redacted]'],
    ['/api/password-reset/abcDEF_123-x?x=1', '/api/password-reset/[redacted]?x=1'],
    ['/invite/abcDEF_123-x', '/invite/[redacted]'],
    ['/reset/abcDEF_123-x', '/reset/[redacted]']
  ])('hides the token in %s', (url, expected) => {
    expect(redactUrl(url)).toBe(expected);
  });

  it('leaves other URLs alone', () => {
    expect(redactUrl('/api/admin/invites/64b7f0c2a1b2c3d4e5f60718')).toBe('/api/admin/invites/64b7f0c2a1b2c3d4e5f60718');
    expect(redactUrl('/api/gifts?page=2')).toBe('/api/gifts?page=2');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
