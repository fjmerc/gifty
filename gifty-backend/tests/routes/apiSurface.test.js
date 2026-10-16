// The published API, method and path. A route added or removed shows up
// here: update the list on purpose, together with the screen that uses it.
const { redisClient, publisherClient, subscriberClient } = require('../../config/redis');
const queues = require('../../queues');
const apiRouter = require('../../routes/api');
const databaseRoutes = require('../../routes/databaseRoutes');

const routesOf = (stack, prefix = '') => stack.flatMap((layer) => {
  if (layer.route) {
    return Object.keys(layer.route.methods).filter((m) => m !== '_all')
      .map((method) => `${method.toUpperCase()} ${prefix}${layer.route.path}`.replace(/\/$/, ''));
  }
  if (layer.name === 'router' && layer.handle.stack) {
    const mount = layer.regexp.source.replace('^\\', '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/');
    return routesOf(layer.handle.stack, prefix + mount);
  }
  return [];
});

afterAll(async () => {
  await Promise.all([redisClient, publisherClient, subscriberClient].map((c) => c.quit().catch(() => {})));
  await Promise.all(Object.values(queues).map((q) => q.close().catch(() => {})));
});

it('is exactly the routes the app uses', () => {
  const routes = [...routesOf(apiRouter.stack, '/api'), ...routesOf(databaseRoutes.stack, '/api/database')].sort();
  expect(routes).toMatchSnapshot();
});
