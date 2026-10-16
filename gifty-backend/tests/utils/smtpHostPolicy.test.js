// Every spelling of a private, loopback or mapped address is private
const { isPrivateAddress } = require('../../utils/smtpHostPolicy');

describe('isPrivateAddress', () => {
  it.each([
    '::ffff:7f00:1', // 127.0.0.1, IPv4-mapped in hex
    '0:0:0:0:0:ffff:7f00:1',
    '0:0:0:0:0:0:0:1', // ::1 in full
    '0::1',
    '0000:0000:0000:0000:0000:0000:0000:0001',
    '::ffff:a00:1', // 10.0.0.1
    '::ffff:10.0.0.1',
    '0:0:0:0:0:ffff:192.168.1.1',
    '::127.0.0.1', // IPv4-compatible
    '::a00:1',
    '::', '0:0:0:0:0:0:0:0',
    '::1',
    'fc00::1', 'fd12:3456::1', 'FD00::25',
    'fe80::1', 'febf::1', 'fe80:0:0:0:0:0:0:1',
    'ff02::1',
    '64:ff9b::a00:1', // NAT64 of 10.0.0.1
    '[::1]',
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0'
  ])('%s is private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    '203.0.113.9', '8.8.8.8',
    '2001:db8::1', '2a00:1450:4001:80b::200e',
    '::ffff:8.8.8.8', '::ffff:808:808',
    '64:ff9b::808:808'
  ])('%s is public', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});
