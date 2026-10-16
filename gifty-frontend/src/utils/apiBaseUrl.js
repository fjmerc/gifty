/**
 * Resolve the backend API base URL.
 *
 * REACT_APP_API_BASE_URL wins when it is usable, but a localhost URL
 * only works when the browser itself runs on the host machine. When the
 * page is reached via a LAN IP (e.g. http://192.168.x.x:3000) a
 * localhost API target points at the *visitor's* machine, so in that
 * case derive the API origin from the page's own host instead.
 */
const API_PORT = 5000;

export function getApiBaseUrl() {
  const envUrl = process.env.REACT_APP_API_BASE_URL;
  const { protocol, hostname } = window.location;
  const pageIsLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const envIsLocal = envUrl && /\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(envUrl);

  if (envUrl && (pageIsLocal || !envIsLocal)) {
    return envUrl;
  }
  return `${protocol}//${hostname}:${API_PORT}/api`;
}

/**
 * Backend origin without the /api suffix, for static assets such as
 * uploaded profile pictures.
 */
export function getServerBaseUrl() {
  return getApiBaseUrl().replace(/\/api\/?$/, '');
}

/**
 * Resolve an uploaded-asset URL against the current backend origin.
 *
 * Historical uploads stored absolute URLs with the host baked in at
 * upload time (e.g. http://localhost:5000/uploads/x.jpg), which break
 * when the app is reached from another machine. Rebase anything under
 * /uploads/ onto the origin the app is actually talking to; leave
 * external URLs untouched.
 */
export function resolveAssetUrl(url) {
  if (!url) return url;
  const match = url.match(/\/uploads\/.*$/);
  return match ? `${getServerBaseUrl()}${match[0]}` : url;
}
