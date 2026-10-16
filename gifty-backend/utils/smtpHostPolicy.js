// Where a custom SMTP server may be. Only mail ports, so the SMTP test
// can't be used to probe other services. With SMTP_BLOCK_PRIVATE_HOSTS=true
// (an instance option, off by default because many self-hosters relay
// through a LAN or compose mail server) also no private, loopback,
// link-local or single-label (compose service) addresses; the connection
// then goes to the address that was checked.
const dns = require('dns');
const net = require('net');

const ALLOWED_PORTS = [25, 465, 587, 2525];
const PORT_MESSAGE = 'Use port 25, 465, 587 or 2525 for the mail server';
const HOST_MESSAGE = 'That mail server address is not allowed on this server';

// STARTTLS required (nodemailer requireTLS): on by default for submission
// port 587, off for 25/2525, which local relays often serve without TLS.
// Rows saved before the setting existed count by their port.
const defaultRequireTLS = (port) => Number(port) === 587;
const effectiveRequireTLS = (config) => (typeof config.requireTLS === 'boolean' ? config.requireTLS : defaultRequireTLS(config.port));

const blockPrivateHosts = (env = process.env) => String(env.SMTP_BLOCK_PRIVATE_HOSTS || '').trim().toLowerCase() === 'true';

const ipv4Private = (ip) => {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19));
};

// An IPv6 literal as eight 16-bit numbers, whatever the spelling (::
// anywhere, leading zeros, an embedded dotted IPv4 tail); null if invalid
const ipv6Words = (ip) => {
  let text = ip;
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!net.isIPv4(dotted[2])) return null;
    const [a, b, c, d] = dotted[2].split('.').map(Number);
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const part = (h) => (h ? h.split(':') : []);
  const left = part(halves[0]);
  const right = halves.length === 2 ? part(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0 || (halves.length === 1 && left.length !== 8)) return null;
  const words = [...left, ...Array(fill).fill('0'), ...right];
  if (words.length !== 8 || words.some((w) => !/^[0-9a-f]{1,4}$/i.test(w))) return null;
  return words.map((w) => parseInt(w, 16));
};

const ipv4FromWords = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

const isPrivateAddress = (address) => {
  const ip = String(address).trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (net.isIPv4(ip)) return ipv4Private(ip);
  if (!net.isIPv6(ip)) return true;
  const w = ipv6Words(ip);
  if (!w) return true;
  const zeroUpTo = (n) => w.slice(0, n).every((x) => x === 0);
  // ::, ::1 and ::a.b.c.d (IPv4-compatible) in any spelling
  if (zeroUpTo(6)) return (w[6] === 0 && w[7] <= 1) || ipv4Private(ipv4FromWords(w[6], w[7]));
  // ::ffff:0:0/96 IPv4-mapped
  if (zeroUpTo(5) && w[5] === 0xffff) return ipv4Private(ipv4FromWords(w[6], w[7]));
  // 64:ff9b::/96 NAT64: the IPv4 address it reaches
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return ipv4Private(ipv4FromWords(w[6], w[7]));
  return (w[0] & 0xfe00) === 0xfc00 // unique local fc00::/7
    || (w[0] & 0xffc0) === 0xfe80 // link-local fe80::/10
    || (w[0] & 0xffc0) === 0xfec0 // site-local fec0::/10 (deprecated)
    || (w[0] & 0xff00) === 0xff00; // multicast
};

/**
 * @returns {Promise<{error?: string, address?: string}>} why the destination
 *   is refused, or (private hosts blocked) the checked address to connect to
 */
const checkSmtpDestination = async ({ service, host, port }) => {
  if (service !== 'custom') return {};
  if (!ALLOWED_PORTS.includes(Number(port))) return { error: PORT_MESSAGE };
  if (!blockPrivateHosts()) return {};

  const name = String(host || '').trim().replace(/^\[|\]$/g, '');
  if (net.isIP(name)) return isPrivateAddress(name) ? { error: HOST_MESSAGE } : { address: name };
  // A name without a dot is a compose service or a LAN host
  if (!name.includes('.') || name.toLowerCase() === 'localhost') return { error: HOST_MESSAGE };
  let addresses;
  try {
    addresses = await dns.promises.lookup(name, { all: true });
  } catch (err) {
    return { error: HOST_MESSAGE };
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) return { error: HOST_MESSAGE };
  return { address: addresses[0].address };
};

module.exports = { defaultRequireTLS, effectiveRequireTLS, checkSmtpDestination, isPrivateAddress, ALLOWED_PORTS, PORT_MESSAGE, HOST_MESSAGE };
