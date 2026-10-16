// Wrong current passwords typed into a signed-in form (change password,
// change email). A borrowed session must not be a way to guess the
// password: after too many wrong ones, any attempt is refused for the rest
// of the window, right or wrong. Counted per account and per address, in
// process memory like the route rate limits (a restart clears it).
const net = require('net');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT = 5;
// A household shares one address: higher than one account's budget
const MAX_PER_IP = 20;
// Only the address table is capped. Account counters live apart, bounded
// by the number of accounts, so churning addresses can't push them out.
const MAX_ADDRESSES = 10000;

const accounts = new Map(); // user id -> { count, resetAt }
const addresses = new Map(); // address key -> { count, resetAt }
let reservations = 0;

// Expand an IPv6 address to its eight hextets
const hextets = (ip) => {
  const [head, tail = null] = ip.split('::');
  const parse = (part) => (part ? part.split(':') : []);
  const left = parse(head);
  const right = tail === null ? [] : parse(tail);
  const fill = tail === null ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((h) => parseInt(h, 16).toString(16));
};

// One key per IPv4 address and per IPv6 /64 (one client usually holds a
// whole /64, so per-address keys would hand it endless fresh budgets)
const addressKey = (ip) => {
  const value = String(ip || 'unknown').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  if (net.isIPv6(value)) return `${hextets(value.split('%')[0]).slice(0, 4).join(':')}::/64`;
  return value;
};

// The source network: IPv4 /24, IPv6 /64
const networkKey = (ip) => {
  const key = addressKey(ip);
  const v4 = key.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  return v4 ? `${v4[1]}.0/24` : key;
};

const live = (map, key, now) => {
  const entry = map.get(key);
  if (entry && entry.resetAt <= now) {
    map.delete(key);
    return null;
  }
  return entry || null;
};

const take = (map, key, now) => {
  let entry = live(map, key, now);
  if (!entry) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    map.set(key, entry);
  }
  entry.count += 1;
  return entry;
};

const sweep = (map, now) => {
  for (const [key, entry] of map) if (entry.resetAt <= now) map.delete(key);
};

// Takes one attempt from the request's budgets before the password is
// compared, synchronously, so parallel requests can't all pass the check
// before any failure is counted. Returns a release function (a right
// password gives its attempt back), or null when the budget is used up.
const reserveAttempt = (req, now = Date.now()) => {
  const accountKey = String(req.user._id);
  const ipKey = addressKey(req.ip || req.socket?.remoteAddress);
  if ((live(accounts, accountKey, now)?.count || 0) >= MAX_PER_ACCOUNT) return null;
  if ((live(addresses, ipKey, now)?.count || 0) >= MAX_PER_IP) return null;

  reservations += 1;
  if (reservations % 1000 === 0) sweep(accounts, now);
  // Entries are never re-inserted, so the first one is the oldest
  if (!addresses.has(ipKey) && addresses.size >= MAX_ADDRESSES) {
    addresses.delete(addresses.keys().next().value);
  }

  const entries = [take(accounts, accountKey, now), take(addresses, ipKey, now)];
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const entry of entries) entry.count = Math.max(0, entry.count - 1);
  };
};

const resetPasswordAttempts = () => {
  accounts.clear();
  addresses.clear();
};

const TOO_MANY_MESSAGE = 'Too many wrong passwords. Please try again in 15 minutes.';
const WRONG_MESSAGE = 'Current password is incorrect';

module.exports = {
  reserveAttempt, resetPasswordAttempts, addressKey, networkKey,
  TOO_MANY_MESSAGE, WRONG_MESSAGE, MAX_PER_ACCOUNT, MAX_PER_IP, WINDOW_MS
};
