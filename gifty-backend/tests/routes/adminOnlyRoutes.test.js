jest.mock('../../services/backupService');
// Only the route definitions are read: no real job queue (its Redis connection would keep Jest from exiting)
jest.mock('../../queues', () => ({ cleanupQueue: {} }));
jest.mock('../../controllers/giftLibraryController', () => new Proxy({}, { get: () => (req, res) => res.end() }));

const handlerNames = (router, path, method) => {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  return layer ? layer.route.stack.map((s) => s.handle.name) : null;
};

describe('instance-wide routes need an admin', () => {
  const databaseRoutes = require('../../routes/databaseRoutes');
  const giftLibraryRoutes = require('../../routes/giftLibraryRoutes');
  const healthRoutes = require('../../routes/healthRoutes');

  it.each([['/backup', 'post'], ['/backups', 'get'], ['/system-check', 'get']])('database %s (%s) requires an admin', (path, method) => {
    expect(handlerNames(databaseRoutes, path, method)).toContain('requireAdmin');
  });

  // A restore replaces every account and the owner record, and deleting the
  // safety backup would make that permanent: only the owner may do either
  it.each([['/restore/:backupName', 'post'], ['/backups/:backupName', 'delete']])('database %s (%s) requires the owner', (path, method) => {
    expect(handlerNames(databaseRoutes, path, method)).toContain('requireOwner');
  });

  it.each([['/discover/trigger', 'post'], ['/gifts/:giftId', 'delete']])('gift library %s (%s) requires an admin', (path, method) => {
    expect(handlerNames(giftLibraryRoutes, path, method)).toContain('requireAdmin');
  });

  it('detailed health requires an admin', () => {
    expect(handlerNames(healthRoutes, '/detailed', 'get')).toContain('requireAdmin');
  });

  const adminRoutes = require('../../routes/adminRoutes');
  it.each([
    ['/users', 'get', 'requireAdmin'], ['/invites', 'get', 'requireAdmin'], ['/invites', 'post', 'requireAdmin'],
    ['/invites/:id', 'delete', 'requireAdmin'], ['/users/:id/reset-link', 'post', 'requireAdmin'],
    ['/users/:id/active', 'patch', 'requireAdmin'], ['/settings', 'get', 'requireAdmin'], ['/settings', 'patch', 'requireAdmin'],
    ['/users/:id/role', 'patch', 'requireOwner'], ['/owner', 'post', 'requireOwner'], ['/setup-complete', 'post', 'requireOwner']
  ])('admin %s (%s) uses %s', (path, method, guard) => {
    expect(handlerNames(adminRoutes, path, method)).toContain(guard);
  });
});
