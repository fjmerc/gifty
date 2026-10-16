// tests/routes/notificationRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const notificationRoutes = require('../../routes/notificationRoutes');
const Notification = require('../../models/Notification');
const User = require('../../models/User');
const Event = require('../../models/Event');

// Mock dependencies
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../models/Event');
jest.mock('../../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Notification Routes', () => {
  let app;
  const originalEnv = process.env;

  beforeAll(() => {
    // Setup test environment
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test_jwt_secret'
    };
    
    // Set up Express app for testing
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // Add notification routes to the app
    app.use('/api/notifications', notificationRoutes);
    
    // Error handler - must be after routes
    app.use((err, req, res, next) => {
      // Use statusCode from error, or from response if already set, or default to 500
      const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
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

  afterAll(() => {
    process.env = originalEnv;
  });

  // Helper function to create test user and token
  const createAuthenticatedUser = (customPreferences = {}) => {
    const userId = new mongoose.Types.ObjectId();
    const user = {
      _id: userId,
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      preferences: {
        timezone: 'UTC',
        allowRetroactiveNotifications: true,
        ...customPreferences
      }
    };
    
    const token = jwt.sign(
      { id: userId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    return { user, token, userId };
  };

  // Helper function to setup auth middleware mock
  const setupAuthMiddleware = (user) => {
    User.findById = jest.fn().mockImplementation(() => {
      // Return an object that can be used as both a Promise and has a select method
      const mockReturn = {
        select: jest.fn().mockResolvedValue(user),
        then: function(resolve) {
          resolve(user);
          return this;
        },
        catch: function(reject) {
          return this;
        }
      };
      return mockReturn;
    });
  };

  describe('Route Structure', () => {
    it('should export an Express router', () => {
      expect(notificationRoutes).toBeDefined();
      expect(typeof notificationRoutes).toBe('function');
      expect(notificationRoutes.name).toBe('router');
    });

    it('should have proper route bindings', () => {
      const router = notificationRoutes;
      expect(router.stack).toBeDefined();
      expect(router.stack.length).toBeGreaterThan(0);
      // protect, GET /, GET /stats, PUT /:id/snooze, PUT+DELETE /:id
      expect(router.stack.length).toBe(5);
    });
  });

  describe('Authentication Middleware Integration', () => {
    it('should require authentication for GET /', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for GET /stats', async () => {
      const response = await request(app)
        .get('/api/notifications/stats')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for PUT /:notificationId', async () => {
      const notificationId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .put(`/api/notifications/${notificationId}`)
        .send({ read: true })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for PUT /:notificationId/snooze', async () => {
      const notificationId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .put(`/api/notifications/${notificationId}/snooze`)
        .send({ snoozeDuration: 30 })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for DELETE /:notificationId', async () => {
      const notificationId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .delete(`/api/notifications/${notificationId}`)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', ['access_token=invalid_token'])
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, token validation failed');
    });

    it('should reject expired JWT tokens', async () => {
      const userId = new mongoose.Types.ObjectId();
      const expiredToken = jwt.sign(
        { id: userId, type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '-1h' }
      );
      
      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${expiredToken}`])
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Token expired');
      expect(response.body).toHaveProperty('code', 'TOKEN_EXPIRED');
    });

    it('should reject tokens with incorrect type', async () => {
      const userId = new mongoose.Types.ObjectId();
      const wrongTypeToken = jwt.sign(
        { id: userId, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${wrongTypeToken}`])
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Invalid token type');
    });

    it('should reject tokens for non-existent users', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId();
      const token = jwt.sign(
        { id: nonExistentUserId, type: 'access' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(null)
      }));
      
      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'User not found');
    });

    it('should accept valid tokens from Authorization header', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      // Create a proper chained mock for populate calls  
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
      expect(Array.isArray(response.body.notifications)).toBe(true);
    });
  });

  describe('GET /api/notifications', () => {
    it('should return user notifications with pagination and 200 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const notifications = [
        {
          _id: new mongoose.Types.ObjectId(),
          user: userId,
          notificationType: 'reminder',
          notificationDate: new Date('2024-12-25T10:00:00Z'),
          read: false,
          event: {
            _id: new mongoose.Types.ObjectId(),
            name: 'Birthday Party',
            date: new Date('2024-12-25'),
            recipient: { _id: new mongoose.Types.ObjectId(), firstName: 'John', lastName: 'Doe' }
          },
          toObject: jest.fn().mockReturnValue({
            _id: new mongoose.Types.ObjectId(),
            user: userId,
            notificationType: 'reminder',
            notificationDate: new Date('2024-12-25T10:00:00Z'),
            read: false
          })
        }
      ];
      
      // Create a proper chained mock for populate calls
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue(notifications)
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);
      Notification.countDocuments = jest.fn().mockResolvedValue(1);

      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
      expect(Array.isArray(response.body.notifications)).toBe(true);
      expect(response.body).toHaveProperty('totalPages', 1);
      expect(response.body).toHaveProperty('currentPage', 1);
      expect(response.body).toHaveProperty('userTimezone', 'UTC');
      expect(Notification.find).toHaveBeenCalledWith({ user: userId });
    });

    it('should handle pagination with page and limit query parameters', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
  
      
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);
      Notification.countDocuments = jest.fn().mockResolvedValue(25);

      const response = await request(app)
        .get('/api/notifications?page=2&limit=5')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalPages', 5);
      expect(response.body).toHaveProperty('currentPage', 2);
      
      // Verify skip and limit were called with correct values
      const skipCall = mockQuery.populate().sort().skip;
      const limitCall = mockQuery.populate().sort().skip().limit;
      expect(skipCall).toHaveBeenCalledWith(5); // (page 2 - 1) * limit 5
      expect(limitCall).toHaveBeenCalledWith(5);
    });

    it('should filter retroactive notifications when includeRetroactive=false', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
  
      
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);
      Notification.countDocuments = jest.fn().mockResolvedValue(0);

      const response = await request(app)
        .get('/api/notifications?includeRetroactive=false')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Notification.find).toHaveBeenCalledWith({
        user: userId,
        isRetroactive: false
      });
    });

    it('should include retroactive notifications by default', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
  
      
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);
      Notification.countDocuments = jest.fn().mockResolvedValue(0);

      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Notification.find).toHaveBeenCalledWith({ user: userId });
    });

    it('should populate event and recipient fields correctly', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
  
      
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);
      Notification.countDocuments = jest.fn().mockResolvedValue(0);

      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(mockQuery.populate).toHaveBeenCalledWith({
        path: 'event',
        select: 'name date reminder',
        populate: {
          path: 'recipient',
          select: 'firstName lastName'
        }
      });
    });

    it('should return empty array when no notifications found', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
  
      
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);
      Notification.countDocuments = jest.fn().mockResolvedValue(0);

      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.notifications)).toBe(true);
      expect(response.body.notifications).toHaveLength(0);
      expect(response.body).toHaveProperty('totalPages', 0);
    });

    it('should handle database errors during notification retrieval', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
  
      
      const dbError = new Error('Database query failed');
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockRejectedValue(dbError)
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);

      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Database query failed');
    });

    it('should use default pagination values when not provided', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
  
      
      const mockQuery = {
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([])
            })
          })
        })
      };
      Notification.find = jest.fn().mockReturnValue(mockQuery);
      Notification.countDocuments = jest.fn().mockResolvedValue(0);

      const response = await request(app)
        .get('/api/notifications')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('currentPage', 1);
      
      // Verify default skip (0) and limit (10) were used
      const skipCall = mockQuery.populate().sort().skip;
      const limitCall = mockQuery.populate().sort().skip().limit;
      expect(skipCall).toHaveBeenCalledWith(0);
      expect(limitCall).toHaveBeenCalledWith(10);
    });
  });

  describe('GET /api/notifications/stats', () => {
    it('should return notification statistics and return 200 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      // Mock all the countDocuments calls
      Notification.countDocuments = jest.fn()
        .mockResolvedValueOnce(5) // unreadCount
        .mockResolvedValueOnce(3) // todayCount
        .mockResolvedValueOnce(2) // retroactiveCount
        .mockResolvedValueOnce(1); // snoozedCount
      
      // Mock aggregate calls
      const typeStats = [
        { _id: 'reminder', count: 10 },
        { _id: 'info', count: 5 }
      ];
      const statusStats = [
        { _id: 'pending', count: 8 },
        { _id: 'sent', count: 7 }
      ];
      
      Notification.aggregate = jest.fn()
        .mockResolvedValueOnce(typeStats)
        .mockResolvedValueOnce(statusStats);
      
      // Mock User.findById for preferences
  

      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('unreadCount', 5);
      expect(response.body).toHaveProperty('todayCount', 3);
      expect(response.body).toHaveProperty('retroactiveCount', 2);
      expect(response.body).toHaveProperty('snoozedCount', 1);
      expect(response.body).toHaveProperty('typeStats', typeStats);
      expect(response.body).toHaveProperty('statusStats', statusStats);
      expect(response.body).toHaveProperty('preferences');
      expect(response.body.preferences).toHaveProperty('allowRetroactiveNotifications', true);
      expect(response.body).toHaveProperty('lastUpdated');
    });

    it('should query unread notifications correctly', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      Notification.aggregate = jest.fn().mockResolvedValue([]);
  

      await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`]);

      // Check the first countDocuments call (unread count)
      expect(Notification.countDocuments).toHaveBeenNthCalledWith(1, {
        user: userId,
        read: false,
        notificationDate: { $lte: expect.any(Date) },
        // still-snoozed notices don't count
        $or: [{ snoozedUntil: null }, { snoozedUntil: { $lte: expect.any(Date) } }]
      });
    });

    it('should query today\'s notifications correctly', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      Notification.aggregate = jest.fn().mockResolvedValue([]);
  

      await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`]);

      // Check the second countDocuments call (today's count)
      expect(Notification.countDocuments).toHaveBeenNthCalledWith(2, {
        user: userId,
        notificationDate: {
          $gte: expect.any(Date),
          $lte: expect.any(Date)
        }
      });
    });

    it('should query retroactive notifications correctly', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      Notification.aggregate = jest.fn().mockResolvedValue([]);
  

      await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`]);

      // Check the third countDocuments call (retroactive count)
      expect(Notification.countDocuments).toHaveBeenNthCalledWith(3, {
        user: userId,
        isRetroactive: true
      });
    });

    it('should query snoozed notifications correctly', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      Notification.aggregate = jest.fn().mockResolvedValue([]);
  

      await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`]);

      // Check the fourth countDocuments call (snoozed count)
      expect(Notification.countDocuments).toHaveBeenNthCalledWith(4, {
        user: userId,
        snoozedUntil: { $gt: expect.any(Date) }
      });
    });

    it('should perform type aggregation correctly', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      Notification.aggregate = jest.fn().mockResolvedValue([]);
  

      await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`]);

      // Check the first aggregate call (type stats)
      expect(Notification.aggregate).toHaveBeenNthCalledWith(1, [
        {
          $match: {
            user: userId,
            notificationDate: { $lte: expect.any(Date) }
          }
        },
        {
          $group: {
            _id: '$notificationType',
            count: { $sum: 1 }
          }
        }
      ]);
    });

    it('should perform status aggregation correctly', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      Notification.aggregate = jest.fn().mockResolvedValue([]);
  

      await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`]);

      // Check the second aggregate call (status stats)
      expect(Notification.aggregate).toHaveBeenNthCalledWith(2, [
        {
          $match: {
            user: userId
          }
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);
    });

    it('should handle user preferences correctly', async () => {
      const { user, token, userId } = createAuthenticatedUser({
        allowRetroactiveNotifications: false  // Set specific preference
      }); 
      setupAuthMiddleware(user);
      
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      Notification.aggregate = jest.fn().mockResolvedValue([]);

      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body.preferences).toHaveProperty('allowRetroactiveNotifications', false);
    });

    it('should handle database errors during stats retrieval', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const dbError = new Error('Database aggregation failed');
      Notification.countDocuments = jest.fn().mockRejectedValue(dbError);

      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Database aggregation failed');
    });

    it('should handle user not found during stats retrieval', async () => {
      const { user, token } = createAuthenticatedUser();
      
      // Create a special mock that allows auth to pass but controller findById to fail
      let callCount = 0;
      User.findById = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          // First calls (auth-related) should succeed
          return {
            select: jest.fn().mockResolvedValue(user),
            then: function(resolve) {
              resolve(user);
              return this;
            },
            catch: function(reject) {
              return this;
            }
          };
        } else {
          // Later calls (controller) should return null
          return {
            select: jest.fn().mockResolvedValue(null),
            then: function(resolve) {
              resolve(null);
              return this;
            },
            catch: function(reject) {
              return this;
            }
          };
        }
      });
      
      Notification.countDocuments = jest.fn().mockResolvedValue(0);
      Notification.aggregate = jest.fn().mockResolvedValue([]);

      const response = await request(app)
        .get('/api/notifications/stats')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      // When user is null, the controller gracefully defaults allowRetroactiveNotifications to true
      expect(response.body.preferences).toHaveProperty('allowRetroactiveNotifications', true);
    });
  });
});
