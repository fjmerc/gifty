// The current-password budgets: an account's own counter can't be pushed
// out by address churn, and IPv6 clients are counted per /64 network.
const attempts = require('../../utils/passwordAttempts');

const req = (user, ip) => ({ user: { _id: user }, ip });

beforeEach(() => attempts.resetPasswordAttempts());

describe('passwordAttempts', () => {
  it("keeps an account's count however many addresses come and go", () => {
    for (let i = 0; i < attempts.MAX_PER_ACCOUNT; i += 1) expect(attempts.reserveAttempt(req('victim', '10.0.0.1'))).toBeTruthy();
    expect(attempts.reserveAttempt(req('victim', '10.0.0.1'))).toBeNull();

    // An attacker fills the address table from fresh addresses (other sessions)
    for (let i = 0; i < 30000; i += 1) attempts.reserveAttempt(req(`other${i}`, `2001:db8:${(i >> 16) & 0xffff}:${i & 0xffff}::1`));

    expect(attempts.reserveAttempt(req('victim', '192.0.2.77'))).toBeNull();
  });

  it('counts every address in one IPv6 /64 as one address', () => {
    for (let i = 0; i < attempts.MAX_PER_IP; i += 1) {
      expect(attempts.reserveAttempt(req(`user${i}`, `2001:db8:1:2::${(i + 1).toString(16)}`))).toBeTruthy();
    }
    expect(attempts.reserveAttempt(req('fresh', '2001:db8:1:2:ffff:ffff:ffff:ffff'))).toBeNull();
    // Another /64 has its own budget
    expect(attempts.reserveAttempt(req('fresh', '2001:db8:1:3::1'))).toBeTruthy();
  });

  it('normalises addresses: IPv4-mapped IPv6 is the IPv4 address, short and long IPv6 forms are the same network', () => {
    expect(attempts.addressKey('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(attempts.addressKey('192.0.2.1')).toBe('192.0.2.1');
    expect(attempts.addressKey('2001:db8::1')).toBe(attempts.addressKey('2001:0db8:0000:0000:abcd::9'));
    expect(attempts.addressKey('2001:db8:0:1::1')).not.toBe(attempts.addressKey('2001:db8::1'));
  });
});
