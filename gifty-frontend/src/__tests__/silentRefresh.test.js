// The access cookie lasts an hour; when it is gone the server answers 401
// NO_TOKEN (or TOKEN_EXPIRED), and the client tries its 7-day refresh
// cookie once before giving up. A revoked session is never refreshed.
// Parallel requests share one refresh. The startup profile call goes
// through the same client.
// The real axios (setupTests stubs it): these tests run its interceptors
jest.unmock('axios');

import axiosInstance from '../axiosInstance';
import authUtils from '../utils/authUtils';

const calls = [];
let routes;
let dispatchSpy;

const respond = (config, status, data = {}) => {
  const response = { status, data, config, headers: {}, statusText: String(status) };
  if (status < 400) return Promise.resolve(response);
  const error = new Error(`Request failed with status code ${status}`);
  Object.assign(error, { config, response, isAxiosError: true });
  return Promise.reject(error);
};

beforeEach(() => {
  calls.length = 0;
  routes = {};
  axiosInstance.defaults.adapter = (config) => {
    calls.push(`${config.method.toUpperCase()} ${config.url}`);
    const route = routes[config.url];
    const [status, data] = typeof route === 'function' ? route(config) : route || [404, {}];
    return respond(config, status, data);
  };
  dispatchSpy = jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
});
afterEach(() => {
  dispatchSpy.mockRestore();
});

// 401 with a code until the refresh succeeded, then 200
const signedOutUntilRefresh = (code) => {
  let refreshed = false;
  routes['/users/refresh-token'] = () => { refreshed = true; return [200, { success: true }]; };
  return () => (refreshed ? [200, { ok: true }] : [401, { code }]);
};

test.each(['NO_TOKEN', 'TOKEN_EXPIRED'])('a %s answer is refreshed once and the request retried', async (code) => {
  routes['/gifts'] = signedOutUntilRefresh(code);

  const res = await axiosInstance.get('/gifts');

  expect(res.data).toEqual({ ok: true });
  expect(calls).toEqual(['GET /gifts', 'POST /users/refresh-token', 'GET /gifts']);
});

test('a revoked session is not refreshed', async () => {
  routes['/gifts'] = [401, { code: 'SESSION_REVOKED' }];
  routes['/users/refresh-token'] = [200, {}];

  await expect(axiosInstance.get('/gifts')).rejects.toMatchObject({ response: { status: 401 } });

  expect(calls).toEqual(['GET /gifts']);
  expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth-error' }));
});

test('parallel requests share one refresh', async () => {
  const gifts = signedOutUntilRefresh('NO_TOKEN');
  routes['/gifts'] = gifts;
  routes['/events'] = gifts;
  routes['/recipients'] = gifts;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const refresh = routes['/users/refresh-token'];
  axiosInstance.defaults.adapter = ((inner) => async (config) => {
    if (config.url === '/users/refresh-token') await gate;
    return inner(config);
  })(axiosInstance.defaults.adapter);

  const all = Promise.all(['/gifts', '/events', '/recipients'].map((url) => axiosInstance.get(url)));
  await new Promise((r) => setTimeout(r, 20));
  release();
  const results = await all;

  expect(results.map((r) => r.data)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
  expect(calls.filter((c) => c === 'POST /users/refresh-token')).toHaveLength(1);
  expect(refresh).toBeDefined();
});

test('a failed refresh ends quietly: one attempt, the original 401 rejected, signed out', async () => {
  routes['/gifts'] = [401, { code: 'NO_TOKEN' }];
  routes['/users/refresh-token'] = [401, { message: 'Refresh token not found, please login again' }];

  await expect(axiosInstance.get('/gifts')).rejects.toMatchObject({ response: { status: 401 } });

  expect(calls).toEqual(['GET /gifts', 'POST /users/refresh-token']);
  expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth-error' }));
});

test('a retried request that is refused again is not refreshed a second time', async () => {
  routes['/gifts'] = [401, { code: 'NO_TOKEN' }];
  routes['/users/refresh-token'] = [200, {}];

  await expect(axiosInstance.get('/gifts')).rejects.toMatchObject({ response: { status: 401 } });

  expect(calls).toEqual(['GET /gifts', 'POST /users/refresh-token', 'GET /gifts']);
});

test('the startup profile call uses the same client, so an expired access cookie is refreshed', async () => {
  routes['/users/profile'] = signedOutUntilRefresh('NO_TOKEN');

  await expect(authUtils.getUserProfile()).resolves.toEqual({ ok: true });

  expect(calls).toEqual(['GET /users/profile', 'POST /users/refresh-token', 'GET /users/profile']);
});
