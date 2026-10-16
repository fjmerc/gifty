jest.mock('../../services/backupService');
jest.mock('../../controllers/giftLibraryController', () => new Proxy({}, { get: () => (req, res) => res.end() }));

const handlerNames = (router, path, method) => {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  return layer ? layer.route.stack.map((s) => s.handle.name) : null;
};

describe('instance-wide routes are owner-only until 1b roles', () => {
  const databaseRoutes = require('../../routes/databaseRoutes');
  const giftLibraryRoutes = require('../../routes/giftLibraryRoutes');

  it.each([
    ['/backup', 'post'], ['/backups', 'get'], ['/restore/:backupName', 'post'],
    ['/backups/:backupName', 'delete'], ['/system-check', 'get']
  ])('database %s (%s) requires the instance owner', (path, method) => {
    expect(handlerNames(databaseRoutes, path, method)).toContain('requireInstanceOwner');
  });

  it('gift discovery trigger requires the instance owner', () => {
    expect(handlerNames(giftLibraryRoutes, '/discover/trigger', 'post')).toContain('requireInstanceOwner');
  });
});
