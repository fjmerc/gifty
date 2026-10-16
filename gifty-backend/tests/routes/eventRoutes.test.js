// tests/routes/eventRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const eventRoutes = require('../../routes/eventRoutes');
const Event = require('../../models/Event');
const User = require('../../models/User');
const Recipient = require('../../models/Recipient');
const EventType = require('../../models/EventType');

// Mock dependencies
jest.mock('../../models/Event');
// Series sync runs against real MongoDB in tests/integration/event-workflows.test.js
jest.mock('../../services/recurringEventService', () => ({
  isRecurring: (e) => Boolean(e.recurring?.frequency) && e.recurring.frequency !== 'None',
  syncSeries: jest.fn().mockResolvedValue({ created: 0, updated: 0, removed: 0 }),
  removeSeries: jest.fn().mockResolvedValue(),
  adoptLegacyOccurrences: jest.fn().mockResolvedValue(),
  generateRecurringEvents: jest.fn().mockResolvedValue({ success: true, created: 0 })
}));
jest.mock('../../models/Recipient');
jest.mock('../../models/EventType');
jest.mock('../../models/Gift');
jest.mock('../../models/Notification');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

// Thenable stand-ins for the owner-scoped Event.findOne query
const queryOf = (value) => {
  const q = {
    populate: jest.fn(() => q),
    select: jest.fn(() => q),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return q;
};
const failingQuery = (err) => ({
  populate() { return this; },
  select() { return this; },
  then: (resolve, reject) => Promise.reject(err).then(resolve, reject)
});
const asDoc = (obj) => (obj ? Object.assign(obj, {
  set: jest.fn(function set(fields) { Object.assign(this, fields); })
}) : obj);

describe('Event Routes', () => {
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
    
    // Add event routes to the app
    app.use('/api/events', eventRoutes);
    
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
    // Referenced recipients/types belong to the caller unless a test says otherwise
    Recipient.exists = jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    EventType.exists = jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
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
      expect(eventRoutes).toBeDefined();
      expect(typeof eventRoutes).toBe('function');
      expect(eventRoutes.name).toBe('router');
    });

    it('should have proper route bindings', () => {
      const router = eventRoutes;
      expect(router.stack).toBeDefined();
      expect(router.stack.length).toBeGreaterThan(0);
      const bindings = router.stack
        .filter((layer) => layer.route)
        .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`)
        .sort();
      expect(bindings).toEqual([
        'DELETE /:eventId',
        'GET /',
        'POST /',
        'PUT /:eventId'
      ]);
    });
  });

  describe('Authentication Middleware Integration', () => {
    it('should require authentication for POST /', async () => {
      const eventData = {
        name: 'Test Event',
        date: new Date(),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };

      const response = await request(app)
        .post('/api/events')
        .send(eventData)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for GET /', async () => {
      const response = await request(app)
        .get('/api/events')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for PUT /:eventId', async () => {
      const eventId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .send({ name: 'Updated Event' })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for DELETE /:eventId', async () => {
      const eventId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .delete(`/api/events/${eventId}`)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/events')
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
        .get('/api/events')
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
        .get('/api/events')
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
        .get('/api/events')
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
        populate: jest.fn().mockImplementation((field, select) => {
          if (field === 'type') {
            return {
              populate: jest.fn().mockResolvedValue([])
            };
          }
          return mockQuery;
        })
      };
      Event.find = jest.fn().mockReturnValue(mockQuery);
      
      const response = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /api/events', () => {
    it('should create a new event and return 201 status', async () => {
      // Arrange
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventData = {
        name: 'Test Birthday',
        date: new Date('2024-12-25'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        recurring: { frequency: 'Yearly' },
        reminder: {
          isSet: true,
          time: new Date('2024-12-24T10:00:00Z'),
          method: 'Email'
        }
      };
      
      const createdEvent = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        ...eventData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      Event.create = jest.fn().mockResolvedValue(createdEvent);

      // Act
      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(eventData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('name', eventData.name);
      expect(response.body).toHaveProperty('user', userId.toString());
      expect(Event.create).toHaveBeenCalledWith({
        user: userId,
        name: eventData.name,
        date: eventData.date.toISOString(),
        type: eventData.type.toString(),
        recipient: eventData.recipient.toString(),
        recurring: eventData.recurring,
        seriesLinked: true,
        reminder: {
          isSet: true,
          time: eventData.reminder.time.toISOString(),
          method: eventData.reminder.method
        }
      });
    });

    it('should create event with reminder disabled when reminder.isSet is false', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventData = {
        name: 'Test Event',
        date: new Date('2024-12-25'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        reminder: {
          isSet: false,
          time: new Date('2024-12-24T10:00:00Z'),
          method: 'Email'
        }
      };
      
      const createdEvent = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        ...eventData,
        reminder: { isSet: false, time: null, method: null }
      };
      
      Event.create = jest.fn().mockResolvedValue(createdEvent);

      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(eventData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(201);
      expect(Event.create).toHaveBeenCalledWith({
        user: userId,
        name: eventData.name,
        date: eventData.date.toISOString(),
        type: eventData.type.toString(),
        recipient: eventData.recipient.toString(),
        recurring: undefined,
        reminder: { isSet: false, time: null, method: null }
      });
    });

    it('should create event with no reminder when reminder is not provided', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventData = {
        name: 'Test Event',
        date: new Date('2024-12-25'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };
      
      const createdEvent = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        ...eventData,
        reminder: { isSet: false, time: null, method: null }
      };
      
      Event.create = jest.fn().mockResolvedValue(createdEvent);

      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(eventData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(201);
      expect(Event.create).toHaveBeenCalledWith({
        user: userId,
        name: eventData.name,
        date: eventData.date.toISOString(),
        type: eventData.type.toString(),
        recipient: eventData.recipient.toString(),
        recurring: undefined,
        reminder: { isSet: false, time: null, method: null }
      });
    });

    it('should return 400 for missing name field', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const incompleteEventData = {
        date: new Date(),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
        // Missing name
      };

      // No need to mock Event.create since controller validation happens first
      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(incompleteEventData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Please include all required fields');
    });

    it('should return 400 for missing date field', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const incompleteEventData = {
        name: 'Test Event',
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
        // Missing date
      };

      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(incompleteEventData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Please include all required fields');
    });

    it('should return 400 for missing type field', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const incompleteEventData = {
        name: 'Test Event',
        date: new Date(),
        recipient: new mongoose.Types.ObjectId()
        // Missing type
      };

      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(incompleteEventData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Please include all required fields');
    });

    it('should return 400 for missing recipient field', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const incompleteEventData = {
        name: 'Test Event',
        date: new Date(),
        type: new mongoose.Types.ObjectId()
        // Missing recipient
      };

      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(incompleteEventData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Please include all required fields');
    });

    it('should handle database errors during event creation', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventData = {
        name: 'Test Event',
        date: new Date(),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };
      
      const dbError = new Error('Database connection failed');
      Event.create = jest.fn().mockRejectedValue(dbError);

      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(eventData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Database connection failed');
    });
  });

  describe('GET /api/events', () => {
    it('should return user events with 200 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const events = [
        {
          _id: new mongoose.Types.ObjectId(),
          user: userId,
          name: 'Birthday Party',
          date: new Date('2024-12-25'),
          type: { _id: new mongoose.Types.ObjectId(), name: 'Birthday' },
          recipient: { _id: new mongoose.Types.ObjectId(), firstName: 'John', lastName: 'Doe' }
        }
      ];
      
      // Create a proper chained mock for populate calls
      const mockQuery = {
        populate: jest.fn().mockImplementation((field, select) => {
          if (field === 'type') {
            return {
              populate: jest.fn().mockResolvedValue(events)
            };
          }
          return mockQuery;
        })
      };
      Event.find = jest.fn().mockReturnValue(mockQuery);

      const response = await request(app)
        .get('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('name', 'Birthday Party');
      expect(Event.find).toHaveBeenCalledWith({ user: userId });
    });

    it('should filter events by recipient when provided', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const recipientId = new mongoose.Types.ObjectId();
      const filteredEvents = [
        {
          _id: new mongoose.Types.ObjectId(),
          user: userId,
          name: 'Birthday for John',
          recipient: { _id: recipientId, firstName: 'John', lastName: 'Doe' }
        }
      ];
      
      // Create a proper chained mock for populate calls
      const mockQuery = {
        populate: jest.fn().mockImplementation((field, select) => {
          if (field === 'type') {
            return {
              populate: jest.fn().mockResolvedValue(filteredEvents)
            };
          }
          return mockQuery;
        })
      };
      Event.find = jest.fn().mockReturnValue(mockQuery);

      const response = await request(app)
        .get(`/api/events?recipient=${recipientId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(Event.find).toHaveBeenCalledWith({
        user: userId,
        recipient: recipientId.toString()
      });
    });

    it('should return empty array when no events found', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      // Create a proper chained mock for populate calls
      const mockQuery = {
        populate: jest.fn().mockImplementation((field, select) => {
          if (field === 'type') {
            return {
              populate: jest.fn().mockResolvedValue([])
            };
          }
          return mockQuery;
        })
      };
      Event.find = jest.fn().mockReturnValue(mockQuery);

      const response = await request(app)
        .get('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it('should populate type and recipient fields', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const events = [
        {
          _id: new mongoose.Types.ObjectId(),
          user: userId,
          name: 'Anniversary',
          type: { _id: new mongoose.Types.ObjectId(), name: 'Anniversary' },
          recipient: { _id: new mongoose.Types.ObjectId(), firstName: 'Jane', lastName: 'Smith' }
        }
      ];
      
      // Create a proper chained mock for populate calls
      let secondPopulateMock;
      const mockQuery = {
        populate: jest.fn().mockImplementation((field, select) => {
          if (field === 'type') {
            secondPopulateMock = jest.fn().mockResolvedValue(events);
            return {
              populate: secondPopulateMock
            };
          }
          return mockQuery;
        })
      };
      Event.find = jest.fn().mockReturnValue(mockQuery);

      const response = await request(app)
        .get('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(mockQuery.populate).toHaveBeenCalledWith('type', 'name _id');
      expect(secondPopulateMock).toHaveBeenCalledWith('recipient', 'firstName lastName _id');
      expect(response.body[0].type).toHaveProperty('name', 'Anniversary');
      expect(response.body[0].recipient).toHaveProperty('firstName', 'Jane');
    });

    it('should handle database errors during event retrieval', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const dbError = new Error('Database query failed');
      // Create a proper chained mock for populate calls that fails
      const mockQuery = {
        populate: jest.fn().mockImplementation((field, select) => {
          if (field === 'type') {
            return {
              populate: jest.fn().mockRejectedValue(dbError)
            };
          }
          return mockQuery;
        })
      };
      Event.find = jest.fn().mockReturnValue(mockQuery);

      const response = await request(app)
        .get('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Database query failed');
    });
  });

  describe('PUT /api/events/:eventId', () => {
    it('should update event by owner and return 200 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: userId,
        name: 'Old Event',
        date: new Date('2024-12-25'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        save: jest.fn().mockResolvedValue({
          _id: eventId,
          user: userId,
          name: 'Updated Event',
          date: new Date('2024-12-26'),
          type: new mongoose.Types.ObjectId(),
          recipient: new mongoose.Types.ObjectId()
        })
      };
      
      const updateData = {
        name: 'Updated Event',
        date: new Date('2024-12-26'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        recurring: { frequency: 'Monthly' },
        reminder: {
          isSet: true,
          time: new Date('2024-12-25T09:00:00Z'),
          method: 'Push Notification'
        }
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(existingEvent)));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Updated Event');
      expect(existingEvent.save).toHaveBeenCalled();
      expect(existingEvent.name).toBe(updateData.name);
      expect(existingEvent.date).toEqual(updateData.date.toISOString());
      expect(existingEvent.type).toEqual(updateData.type.toString());
      expect(existingEvent.recipient).toEqual(updateData.recipient.toString());
      expect(existingEvent.recurring).toEqual(updateData.recurring);
      expect(existingEvent.reminder).toEqual({
        isSet: true,
        time: updateData.reminder.time.toISOString(),
        method: updateData.reminder.method
      });
    });

    it('should update event with reminder disabled', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: userId,
        name: 'Event with Reminder',
        save: jest.fn().mockResolvedValue({
          _id: eventId,
          user: userId,
          name: 'Event without Reminder'
        })
      };
      
      const updateData = {
        name: 'Event without Reminder',
        date: new Date('2024-12-26'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        reminder: {
          isSet: false,
          time: new Date('2024-12-25T09:00:00Z'),
          method: 'Email'
        }
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(existingEvent)));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(existingEvent.reminder).toEqual({
        isSet: false,
        time: null,
        method: null
      });
    });

    it('should update event with no reminder specified', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: userId,
        name: 'Old Event',
        save: jest.fn().mockResolvedValue({
          _id: eventId,
          user: userId,
          name: 'Updated Event'
        })
      };
      
      const updateData = {
        name: 'Updated Event',
        date: new Date('2024-12-26'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
        // No reminder specified
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(existingEvent)));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      // Partial update: an omitted reminder is left as it was
      expect(existingEvent.reminder).toBeUndefined();
      expect(existingEvent.name).toBe('Updated Event');
    });

    it('should return 404 if event not found', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Event',
        date: new Date('2024-12-26'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(null));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Event not found');
    });

    it('should return 404 (not 401) for a user trying to update another user\'s event', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const anotherUserId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: anotherUserId, // Different user
        name: 'Other User Event'
      };
      
      const updateData = {
        name: 'Trying to steal event',
        date: new Date('2024-12-26'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };
      
      // The owner-scoped query does not match another user's event
      void existingEvent;
      Event.findOne = jest.fn().mockReturnValue(queryOf(null));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Event not found');
    });

    it('should handle database errors during event update', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: userId,
        name: 'Event to Update',
        save: jest.fn().mockRejectedValue(new Error('Database save failed'))
      };
      
      const updateData = {
        name: 'Updated Event',
        date: new Date('2024-12-26'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(existingEvent)));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Database save failed');
    });

    it('should handle findById database errors', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Event',
        date: new Date('2024-12-26'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };
      
      Event.findOne = jest.fn().mockReturnValue(failingQuery(new Error('Database connection failed')));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Database connection failed');
    });
  });

  describe('DELETE /api/events/:eventId', () => {
    it('should delete event by owner and return 204 status', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: userId,
        name: 'Event to Delete',
        deleteOne: jest.fn().mockResolvedValue({})
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(existingEvent)));

      const response = await request(app)
        .delete(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`]);

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      expect(existingEvent.deleteOne).toHaveBeenCalled();
    });

    it('should return 404 if event not found for deletion', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(null));

      const response = await request(app)
        .delete(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Event not found');
    });

    it('should return 404 (not 401) for a user trying to delete another user\'s event', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const anotherUserId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: anotherUserId, // Different user
        name: 'Other User Event'
      };
      
      // The owner-scoped query does not match another user's event
      void existingEvent;
      Event.findOne = jest.fn().mockReturnValue(queryOf(null));

      const response = await request(app)
        .delete(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Event not found');
    });

    it('should handle database errors during event deletion', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: userId,
        name: 'Event to Delete',
        deleteOne: jest.fn().mockRejectedValue(new Error('Database deletion failed'))
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(existingEvent)));

      const response = await request(app)
        .delete(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Database deletion failed');
    });

    it('should handle findById database errors during deletion', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      
      Event.findOne = jest.fn().mockReturnValue(failingQuery(new Error('Database connection failed')));

      const response = await request(app)
        .delete(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Database connection failed');
    });
  });

  describe('Business Logic and Edge Cases', () => {
    it('should handle complex recurring event data in POST', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventData = {
        name: 'Weekly Meeting',
        date: new Date('2024-12-25'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        recurring: {
          frequency: 'Weekly',
          until: new Date('2025-12-25'),
          exceptions: [new Date('2024-12-30'), new Date('2025-01-06')]
        },
        reminder: {
          isSet: true,
          time: new Date('2024-12-24T18:00:00Z'),
          method: 'SMS'
        }
      };
      
      const createdEvent = {
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        ...eventData
      };
      
      Event.create = jest.fn().mockResolvedValue(createdEvent);

      const response = await request(app)
        .post('/api/events')
        .set('Cookie', [`access_token=${token}`])
        .send(eventData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('recurring');
      expect(response.body.recurring).toHaveProperty('frequency', 'Weekly');
      expect(response.body.reminder).toHaveProperty('method', 'SMS');
    });

    it('should handle multiple recipient filtering in GET', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const recipientId1 = new mongoose.Types.ObjectId();
      const recipientId2 = new mongoose.Types.ObjectId();
      
      // Create a proper chained mock for populate calls
      const mockQuery = {
        populate: jest.fn().mockImplementation((field, select) => {
          if (field === 'type') {
            return {
              populate: jest.fn().mockResolvedValue([])
            };
          }
          return mockQuery;
        })
      };
      Event.find = jest.fn().mockReturnValue(mockQuery);

      // Test filtering by first recipient
      await request(app)
        .get(`/api/events?recipient=${recipientId1}`)
        .set('Cookie', [`access_token=${token}`]);

      expect(Event.find).toHaveBeenCalledWith({
        user: userId,
        recipient: recipientId1.toString()
      });

      // Test filtering by second recipient
      await request(app)
        .get(`/api/events?recipient=${recipientId2}`)
        .set('Cookie', [`access_token=${token}`]);

      expect(Event.find).toHaveBeenCalledWith({
        user: userId,
        recipient: recipientId2.toString()
      });
    });

    it('should validate ObjectId format in route parameters', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const invalidEventId = 'invalid-object-id';
      
      Event.findOne = jest.fn();

      const response = await request(app)
        .put(`/api/events/${invalidEventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send({ name: 'Updated Event' })
        .expect('Content-Type', /json/);

      // Malformed ids are a 404 without touching the database
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Event not found');
      expect(Event.findOne).not.toHaveBeenCalled();
    });

    it('should handle user ID comparison edge cases', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: userId, // Same ObjectId but different reference
        name: 'User Event',
        save: jest.fn().mockResolvedValue({
          _id: eventId,
          user: userId,
          name: 'Updated Event'
        })
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(existingEvent)));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send({ name: 'Updated Event' })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Updated Event');
    });

    it('should handle empty request body in PUT request', async () => {
      const { user, token, userId } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const eventId = new mongoose.Types.ObjectId();
      const existingEvent = {
        _id: eventId,
        user: userId,
        name: 'Original Event',
        save: jest.fn().mockResolvedValue({
          _id: eventId,
          user: userId,
          name: 'Original Event'
        })
      };
      
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(existingEvent)));

      const response = await request(app)
        .put(`/api/events/${eventId}`)
        .set('Cookie', [`access_token=${token}`])
        .send({})
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      // An empty body changes nothing (previously it wiped every field)
      expect(existingEvent.name).toBe('Original Event');
      expect(existingEvent.reminder).toBeUndefined();
    });
  });
});
