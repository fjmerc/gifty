// tests/routes/eventTypeRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const eventTypeRoutes = require('../../routes/eventTypeRoutes');
const EventType = require('../../models/EventType');
const Event = require('../../models/Event');
const User = require('../../models/User');

// Mock dependencies
jest.mock('../../models/EventType');
jest.mock('../../models/Event');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Event Type Routes', () => {
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
    
    // Add event type routes to the app
    app.use('/api/event-types', eventTypeRoutes);
    
    // Error handler - must be after routes
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

  afterAll(() => {
    process.env = originalEnv;
  });

  // Helper function to create test user and token
  const createAuthenticatedUser = () => {
    const userId = new mongoose.Types.ObjectId();
    const user = {
      _id: userId,
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User'
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
    User.findById = jest.fn().mockImplementation(() => ({
      select: jest.fn().mockResolvedValue(user)
    }));
  };

  describe('Route Structure', () => {
    it('should export an Express router', () => {
      expect(eventTypeRoutes).toBeDefined();
      expect(typeof eventTypeRoutes).toBe('function');
      expect(eventTypeRoutes.name).toBe('router');
    });

    it('should have proper route bindings', () => {
      const router = eventTypeRoutes;
      expect(router.stack).toBeDefined();
      expect(router.stack.length).toBeGreaterThan(0);
      expect(router.stack.length).toBe(4);
    });
  });

  describe('Authentication Middleware Integration', () => {
    it('should require authentication for POST /', async () => {
      const response = await request(app)
        .post('/api/event-types')
        .send({ name: 'Test Event', description: 'Test Description' })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for GET /', async () => {
      const response = await request(app)
        .get('/api/event-types')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for PUT /:eventTypeID', async () => {
      const eventTypeId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .put(`/api/event-types/${eventTypeId}`)
        .send({ name: 'Updated Event', description: 'Updated Description' })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for DELETE /:eventTypeID', async () => {
      const eventTypeId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .delete(`/api/event-types/${eventTypeId}`)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/event-types')
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
        .get('/api/event-types')
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
        .get('/api/event-types')
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
        .get('/api/event-types')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'User not found');
    });

    it('should accept valid tokens from Authorization header', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      EventType.find = jest.fn().mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/event-types')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/event-types', () => {
    it('should create a custom event type and return 201 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeData = {
        name: 'Custom Birthday Party',
        description: 'Custom birthday celebration',
        isCustom: true
      };
      
      const createdEventType = {
        _id: new mongoose.Types.ObjectId(),
        ...eventTypeData,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      EventType.prototype.save = jest.fn().mockResolvedValue(createdEventType);
      const eventTypeConstructor = jest.fn().mockImplementation((data) => ({
        ...data,
        save: EventType.prototype.save
      }));
      EventType.mockImplementation(eventTypeConstructor);

      const response = await request(app)
        .post('/api/event-types')
        .set('Cookie', [`access_token=${token}`])
        .send(eventTypeData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('name', eventTypeData.name);
      expect(response.body).toHaveProperty('description', eventTypeData.description);
      expect(response.body).toHaveProperty('isCustom', true);
      expect(response.body).toHaveProperty('createdBy', userId.toString());
      expect(eventTypeConstructor).toHaveBeenCalledWith({
        name: eventTypeData.name,
        description: eventTypeData.description,
        isCustom: true,
        createdBy: userId
      });
    });

    it('should create a caller-owned custom type even when isCustom=false is sent', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);

      const eventTypeData = {
        name: 'System Birthday',
        description: 'System birthday event',
        isCustom: false
      };

      EventType.prototype.save = jest.fn().mockResolvedValue(true);
      const eventTypeConstructor = jest.fn().mockImplementation((data) => ({
        ...data,
        save: EventType.prototype.save
      }));
      EventType.mockImplementation(eventTypeConstructor);

      const response = await request(app)
        .post('/api/event-types')
        .set('Cookie', [`access_token=${token}`])
        .send(eventTypeData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('isCustom', true);
      expect(response.body).toHaveProperty('createdBy', userId.toString());
      expect(eventTypeConstructor).toHaveBeenCalledWith({
        name: eventTypeData.name,
        description: eventTypeData.description,
        isCustom: true,
        createdBy: userId
      });
    });

    it('should default to a caller-owned custom type if isCustom is not provided', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);

      const eventTypeData = {
        name: 'Default Event Type',
        description: 'Event type without isCustom specified'
      };

      EventType.prototype.save = jest.fn().mockResolvedValue(true);
      const eventTypeConstructor = jest.fn().mockImplementation((data) => ({
        ...data,
        save: EventType.prototype.save
      }));
      EventType.mockImplementation(eventTypeConstructor);

      const response = await request(app)
        .post('/api/event-types')
        .set('Cookie', [`access_token=${token}`])
        .send(eventTypeData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('isCustom', true);
      expect(eventTypeConstructor).toHaveBeenCalledWith({
        name: eventTypeData.name,
        description: eventTypeData.description,
        isCustom: true,
        createdBy: userId
      });
    });

    it('should return 400 for validation errors', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeData = {
        name: 'Test Event',
        description: 'Test Description',
        isCustom: true
      };
      
      const validationError = new Error('Event type name already exists');
      EventType.prototype.save = jest.fn().mockRejectedValue(validationError);
      const eventTypeConstructor = jest.fn().mockImplementation((data) => ({
        ...data,
        save: EventType.prototype.save
      }));
      EventType.mockImplementation(eventTypeConstructor);

      const response = await request(app)
        .post('/api/event-types')
        .set('Cookie', [`access_token=${token}`])
        .send(eventTypeData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Error creating event type');
      expect(response.body).not.toHaveProperty('error');
    });
  });

  describe('GET /api/event-types', () => {
    it('should return all event types with 200 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypes = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Birthday',
          description: 'Birthday celebrations',
          isCustom: false,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Custom Wedding',
          description: 'User custom wedding event',
          isCustom: true,
          createdBy: userId,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];
      
      EventType.find = jest.fn().mockResolvedValue(eventTypes);

      const response = await request(app)
        .get('/api/event-types')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('name', 'Birthday');
      expect(response.body[1]).toHaveProperty('name', 'Custom Wedding');
      expect(EventType.find).toHaveBeenCalledWith({ $or: [{ isCustom: { $ne: true } }, { createdBy: user._id }] });
    });

    it('should filter by isCustom=true parameter', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const customEventTypes = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Custom Anniversary',
          description: 'Custom anniversary celebration',
          isCustom: true,
          createdBy: userId
        }
      ];
      
      EventType.find = jest.fn().mockResolvedValue(customEventTypes);

      const response = await request(app)
        .get('/api/event-types?isCustom=true')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('isCustom', true);
      expect(EventType.find).toHaveBeenCalledWith({ $or: [{ isCustom: { $ne: true } }, { createdBy: user._id }], isCustom: true });
    });

    it('should filter by isCustom=false parameter', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const systemEventTypes = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'System Birthday',
          description: 'System birthday event',
          isCustom: false
        }
      ];
      
      EventType.find = jest.fn().mockResolvedValue(systemEventTypes);

      const response = await request(app)
        .get('/api/event-types?isCustom=false')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body[0]).toHaveProperty('isCustom', false);
      expect(EventType.find).toHaveBeenCalledWith({ $or: [{ isCustom: { $ne: true } }, { createdBy: user._id }], isCustom: false });
    });

    it('should filter by userOnly=true with isCustom=true', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const userCustomEventTypes = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'My Custom Event',
          description: 'My personal custom event',
          isCustom: true,
          createdBy: userId
        }
      ];
      
      EventType.find = jest.fn().mockResolvedValue(userCustomEventTypes);

      const response = await request(app)
        .get('/api/event-types?isCustom=true&userOnly=true')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('createdBy', userId.toString());
      expect(EventType.find).toHaveBeenCalledWith({ $or: [{ isCustom: { $ne: true } }, { createdBy: user._id }], isCustom: true });
    });

    it('should return 200 with an empty array if no event types found', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);

      EventType.find = jest.fn().mockResolvedValue([]);

      const response = await request(app)
        .get('/api/event-types')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 500 for database errors', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const dbError = new Error('Database connection failed');
      EventType.find = jest.fn().mockRejectedValue(dbError);

      const response = await request(app)
        .get('/api/event-types')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Error fetching event types');
      expect(response.body).not.toHaveProperty('error');
    });
  });

  describe('PUT /api/event-types/:eventTypeID', () => {
    it('should update custom event type by owner and return 200 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeId = new mongoose.Types.ObjectId();
      const existingEventType = {
        _id: eventTypeId,
        name: 'Old Custom Event',
        description: 'Old description',
        isCustom: true,
        createdBy: userId
      };
      
      const updateData = {
        name: 'Updated Custom Event',
        description: 'Updated description'
      };
      
      existingEventType.save = jest.fn().mockResolvedValue(undefined);
      EventType.findById = jest.fn().mockResolvedValue(existingEventType);

      const response = await request(app)
        .put(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', updateData.name);
      expect(response.body).toHaveProperty('description', updateData.description);
      expect(EventType.findById).toHaveBeenCalledWith(eventTypeId.toString());
      expect(existingEventType.save).toHaveBeenCalled();
    });

    it('should return 404 if event type not found', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Event',
        description: 'Updated description'
      };
      
      EventType.findById = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .put(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'EventType not found');
    });

    it('should return 403 for system event type modification attempt', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeId = new mongoose.Types.ObjectId();
      const systemEventType = {
        _id: eventTypeId,
        name: 'System Birthday',
        description: 'System birthday event',
        isCustom: false
      };
      
      const updateData = {
        name: 'Hacked System Event',
        description: 'Trying to modify system event'
      };
      
      EventType.findById = jest.fn().mockResolvedValue(systemEventType);

      const response = await request(app)
        .put(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('message', 'System event types cannot be modified');
    });

    it('should return 404 when trying to update another user\'s custom event type', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const anotherUserId = new mongoose.Types.ObjectId();
      const eventTypeId = new mongoose.Types.ObjectId();
      const otherUserEventType = {
        _id: eventTypeId,
        name: 'Other User Custom Event',
        description: 'Custom event by another user',
        isCustom: true,
        createdBy: anotherUserId
      };
      
      const updateData = {
        name: 'Trying to steal event',
        description: 'Unauthorized modification attempt'
      };
      
      EventType.findById = jest.fn().mockResolvedValue(otherUserEventType);

      const response = await request(app)
        .put(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'EventType not found');
    });

    it('should return 400 for database errors during update', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeId = new mongoose.Types.ObjectId();
      const existingEventType = {
        _id: eventTypeId,
        name: 'Custom Event',
        isCustom: true,
        createdBy: userId
      };
      
      const updateData = { name: 'Updated Event' };
      const dbError = new Error('Database update failed');
      
      existingEventType.save = jest.fn().mockRejectedValue(dbError);
      EventType.findById = jest.fn().mockResolvedValue(existingEventType);

      const response = await request(app)
        .put(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Error updating event type');
      expect(response.body).not.toHaveProperty('error');
    });
  });

  describe('DELETE /api/event-types/:eventTypeID', () => {
    it('should delete custom event type by owner and return 204 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeId = new mongoose.Types.ObjectId();
      const existingEventType = {
        _id: eventTypeId,
        name: 'Custom Event to Delete',
        description: 'This will be deleted',
        isCustom: true,
        createdBy: userId
      };
      
      EventType.findById = jest.fn().mockResolvedValue(existingEventType);
      EventType.findByIdAndDelete = jest.fn().mockResolvedValue(existingEventType);
      Event.countDocuments = jest.fn().mockResolvedValue(0);

      const response = await request(app)
        .delete(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`]);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      expect(EventType.findById).toHaveBeenCalledWith(eventTypeId.toString());
      expect(EventType.findByIdAndDelete).toHaveBeenCalledWith(eventTypeId.toString());
    });

    it('should return 409 when events still reference the event type', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);

      const eventTypeId = new mongoose.Types.ObjectId();
      const existingEventType = {
        _id: eventTypeId,
        name: 'Custom Event in use',
        isCustom: true,
        createdBy: userId
      };

      EventType.findById = jest.fn().mockResolvedValue(existingEventType);
      EventType.findByIdAndDelete = jest.fn().mockResolvedValue(existingEventType);
      Event.countDocuments = jest.fn().mockResolvedValue(2);

      const response = await request(app)
        .delete(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/still use it/);
      expect(EventType.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('should return 404 if event type to delete not found', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);

      const eventTypeId = new mongoose.Types.ObjectId();

      EventType.findById = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .delete(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'EventType not found');
    });

    it('should return 403 for system event type deletion attempt', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeId = new mongoose.Types.ObjectId();
      const systemEventType = {
        _id: eventTypeId,
        name: 'System Anniversary',
        description: 'System anniversary event',
        isCustom: false
      };
      
      EventType.findById = jest.fn().mockResolvedValue(systemEventType);

      const response = await request(app)
        .delete(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('message', 'System event types cannot be deleted');
    });

    it('should return 404 when trying to delete another user\'s custom event type', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const anotherUserId = new mongoose.Types.ObjectId();
      const eventTypeId = new mongoose.Types.ObjectId();
      const otherUserEventType = {
        _id: eventTypeId,
        name: 'Other User Custom Event',
        description: 'Custom event by another user',
        isCustom: true,
        createdBy: anotherUserId
      };
      
      EventType.findById = jest.fn().mockResolvedValue(otherUserEventType);

      const response = await request(app)
        .delete(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'EventType not found');
    });

    it('should return 500 for database errors during deletion', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventTypeId = new mongoose.Types.ObjectId();
      const existingEventType = {
        _id: eventTypeId,
        name: 'Custom Event',
        isCustom: true,
        createdBy: userId
      };
      
      const dbError = new Error('Database deletion failed');
      
      EventType.findById = jest.fn().mockResolvedValue(existingEventType);
      EventType.findByIdAndDelete = jest.fn().mockRejectedValue(dbError);
      Event.countDocuments = jest.fn().mockResolvedValue(0);

      const response = await request(app)
        .delete(`/api/event-types/${eventTypeId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Error deleting event type');
      expect(response.body).not.toHaveProperty('error');
    });
  });
});
