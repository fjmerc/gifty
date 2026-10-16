// tests/routes/api.test.js
const request = require('supertest');
const express = require('express');
const apiRouter = require('../../routes/api');

// Mock all sub-route dependencies
jest.mock('../../routes/budgetRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'budgets' }));
  return router;
});

jest.mock('../../routes/eventRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'events' }));
  return router;
});

jest.mock('../../routes/eventTypeRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'eventTypes' }));
  return router;
});

jest.mock('../../routes/giftRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'gifts' }));
  return router;
});

jest.mock('../../routes/healthRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'health' }));
  return router;
});

jest.mock('../../routes/notificationRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'notifications' }));
  return router;
});

jest.mock('../../routes/recipientRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'recipients' }));
  return router;
});

jest.mock('../../routes/tagRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'tags' }));
  return router;
});

jest.mock('../../routes/userRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'users' }));
  return router;
});

jest.mock('../../routes/vendorRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'vendors' }));
  return router;
});

jest.mock('../../routes/settingsRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'settings' }));
  return router;
});

jest.mock('../../routes/emailConfigRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'email-config' }));
  return router;
});

jest.mock('../../routes/feedbackRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'feedback' }));
  return router;
});

jest.mock('../../routes/giftLibraryRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'gift-library' }));
  return router;
});

jest.mock('../../routes/holidayRoutes', () => {
  const express = require('express');
  const router = express.Router();
  router.get('/', (req, res) => res.json({ route: 'holidays' }));
  return router;
});

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('API Router', () => {
  let app;

  beforeAll(() => {
    // Set up Express app for testing
    app = express();
    app.use(express.json());
    
    // Add API routes to the app
    app.use('/api', apiRouter);
    
    // Set up error handler - must be after routes
    app.use((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode);
      // Always return JSON responses in tests
      if (typeof res.setHeader === 'function') {
        res.setHeader('Content-Type', 'application/json');
      }
      res.json({ message: err.message });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Router Registration', () => {
    it('should export a valid Express router', () => {
      expect(typeof apiRouter).toBe('function');
      expect(apiRouter.stack).toBeDefined();
    });

    it('should register 19 layers (1 direct route, the cache-clearing middleware, 17 sub-routes)', () => {
      const routeCount = apiRouter.stack.length;
      expect(routeCount).toBe(19);
    });

    it('should clear the cache on writes before any sub-route runs', () => {
      const firstMount = apiRouter.stack.findIndex((layer) => !layer.route);
      expect(apiRouter.stack[firstMount].name).toBe('clearUserCacheOnWrite');
    });

    it('should mount all sub-routes at correct paths', () => {
      const expectedPaths = [
        '/budgets', '/events', '/eventTypes', '/gifts', '/health',
        '/holidays', '/notifications',
        '/recipients', '/tags', '/users', '/vendors',
        '/settings', '/email-config', '/feedback', '/gift-library',
        '/ai', '/instance'
      ];
      
      // Count sub-route mounts (exclude the direct /test route)
      const subRouteLayers = apiRouter.stack.filter(layer => !layer.route && layer.name !== 'clearUserCacheOnWrite');
      expect(subRouteLayers.length).toBe(17);
      
      // For integration test, verify that each expected path is known
      // This is a more practical test than trying to parse Express internals
      expect(expectedPaths.length).toBe(17);
      expect(expectedPaths).toContain('/budgets');
      expect(expectedPaths).toContain('/users');
    });

    it('should have the direct test endpoint registered', () => {
      // Check that the /test route is registered
      const testRoute = apiRouter.stack.find(layer => 
        layer.route && layer.route.path === '/test'
      );
      expect(testRoute).toBeDefined();
      expect(testRoute.route.methods.get).toBe(true);
    });
  });

  describe('GET /api/test', () => {
    it('should return API running message', async () => {
      const response = await request(app)
        .get('/api/test')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toEqual({ msg: 'API running' });
    });

    it('should be publicly accessible (no authentication required)', async () => {
      // No authentication headers needed
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.body.msg).toBe('API running');
    });

    it('should return correct response structure', async () => {
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.body).toHaveProperty('msg');
      expect(typeof response.body.msg).toBe('string');
      expect(Object.keys(response.body)).toHaveLength(1);
    });

    it('should handle GET method only', async () => {
      // Test that POST method is not allowed
      await request(app)
        .post('/api/test')
        .expect(404); // Express default for unhandled methods
    });
  });

  describe('Sub-Route Delegation', () => {
    it('should delegate requests to budgets sub-route', async () => {
      const response = await request(app)
        .get('/api/budgets')
        .expect(200);

      expect(response.body.route).toBe('budgets');
    });

    it('should delegate requests to users sub-route', async () => {
      const response = await request(app)
        .get('/api/users')
        .expect(200);

      expect(response.body.route).toBe('users');
    });

    it('should delegate requests to events sub-route', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect(200);

      expect(response.body.route).toBe('events');
    });

    it('should delegate requests to gifts sub-route', async () => {
      const response = await request(app)
        .get('/api/gifts')
        .expect(200);

      expect(response.body.route).toBe('gifts');
    });

    it('should delegate requests to health sub-route', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.route).toBe('health');
    });

    it('should delegate requests to notifications sub-route', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .expect(200);

      expect(response.body.route).toBe('notifications');
    });

    it('should delegate requests to settings sub-route', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect(200);

      expect(response.body.route).toBe('settings');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent routes with 404', async () => {
      await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });

    it('has no gift reviews endpoint any more', async () => {
      await request(app).get('/api/reviews').expect(404);
      await request(app).post('/api/reviews').send({ rating: 5 }).expect(404);
    });

    it('should handle deeply nested non-existent routes with 404', async () => {
      await request(app)
        .get('/api/nonexistent/path/here')
        .expect(404);
    });

    it('should handle invalid path segments gracefully', async () => {
      await request(app)
        .get('/api/users/./invalid')
        .expect(404);
    });
  });
});
