const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const originOf = (url) => {
  try { return new URL(url).origin; } catch { return null; }
};

// The combined image serves the UI and API from one origin, but browsers
// still send an Origin header on same-origin POSTs, so same-origin must be
// accepted for whatever host/IP the instance is reached on.
const corsOptionsDelegate = (req, callback) => {
  const origin = req.header('Origin');
  if (!origin) return callback(null, { origin: true, credentials: true });

  let sameHost = false;
  try { sameHost = new URL(origin).host === req.get('host'); } catch { sameHost = false; }

  const configured = originOf(process.env.GIFTY_URL || '');
  const devAllowed = process.env.NODE_ENV !== 'production' && DEV_ORIGIN.test(origin);

  const allowed = sameHost || (configured && origin === configured) || devAllowed;
  if (!allowed) {
    // An error (not origin:false) stops the request before any route runs, so
    // cross-origin POSTs from e.g. another app on the same host:other-port
    // (same-site, so SameSite cookies are still sent) can't act as the user.
    return callback(new Error('Not allowed by CORS'));
  }
  callback(null, { origin: true, credentials: true, optionsSuccessStatus: 200 });
};

module.exports = { corsOptionsDelegate };
