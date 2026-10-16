// tests/routes/tagRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const tagRoutes = require('../../routes/tagRoutes');
const Tag = require('../../models/Tags');
const User = require('../../models/User');

// Mock dependencies
// Legacy-tag visibility asks which tags the caller's recipients use
jest.mock('../../models/Recipient', () => ({ distinct: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../../models/Tags');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Tag Routes', () => {
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
    
    // Add tag routes to the app
    app.use('/api/tags', tagRoutes);
    
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
  }); // Missing closing brace for beforeAll

  describe('GET /api/tags', () => {
    it('should return all tags with 200 status', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tags = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Electronics'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Books'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Toys'
        }
      ];
      
      Tag.find = jest.fn().mockResolvedValue(tags);

      const response = await request(app)
        .get('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(3);
      expect(response.body[0]).toHaveProperty('name', 'Electronics');
      expect(response.body[1]).toHaveProperty('name', 'Books');
      expect(response.body[2]).toHaveProperty('name', 'Toys');
      expect(Tag.find).toHaveBeenCalledWith({ $or: [{ user: user._id }, { user: null, _id: { $in: [] } }] });
    });

    it('should return empty array when no tags exist', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Tag.find = jest.fn().mockResolvedValue([]);

      const response = await request(app)
        .get('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
      expect(Tag.find).toHaveBeenCalledWith({ $or: [{ user: user._id }, { user: null, _id: { $in: [] } }] });
    });

    it('should return tags using Authorization header', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tags = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Home & Garden'
        }
      ];
      
      Tag.find = jest.fn().mockResolvedValue(tags);

      const response = await request(app)
        .get('/api/tags')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('name', 'Home & Garden');
      expect(Tag.find).toHaveBeenCalledWith({ $or: [{ user: user._id }, { user: null, _id: { $in: [] } }] });
    });

    it('should handle database errors during tag retrieval', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const dbError = new Error('Database connection failed');
      Tag.find = jest.fn().mockRejectedValue(dbError);

      const response = await request(app)
        .get('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Server error');
    });

    it('should handle mongoose query errors', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const queryError = new Error('Query execution failed');
      Tag.find = jest.fn().mockRejectedValue(queryError);

      const response = await request(app)
        .get('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Server error');
    });
  });

  describe('POST /api/tags', () => {
    it('should create a new tag and return 200 status', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagData = { name: 'Sports' };
      const createdTag = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Sports'
      };
      
      Tag.findOne = jest.fn().mockResolvedValue(null); // Tag doesn't exist
      
      // Mock Tag constructor and save method
      const mockSave = jest.fn().mockResolvedValue(createdTag);
      Tag.mockImplementation(() => ({
        name: tagData.name,
        save: mockSave
      }));

      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .send(tagData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Sports');
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'Sports', user: user._id });
      expect(mockSave).toHaveBeenCalled();
    });

    it('should return existing tag if duplicate name provided', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagData = { name: 'Electronics' };
      const existingTag = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Electronics'
      };
      
      Tag.findOne = jest.fn().mockResolvedValue(existingTag); // Tag already exists

      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .send(tagData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Electronics');
      expect(response.body).toHaveProperty('_id', existingTag._id.toString());
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'Electronics', user: user._id });
    });

    it('should create tag using Authorization header', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagData = { name: 'Fashion' };
      const createdTag = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Fashion'
      };
      
      Tag.findOne = jest.fn().mockResolvedValue(null);
      
      const mockSave = jest.fn().mockResolvedValue(createdTag);
      Tag.mockImplementation(() => ({
        name: tagData.name,
        save: mockSave
      }));

      const response = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${token}`)
        .send(tagData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Fashion');
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'Fashion', user: user._id });
      expect(mockSave).toHaveBeenCalled();
    });

    it('should handle missing name field', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .send({})
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Tag name is required');
    });

    it('should handle database errors during tag creation', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagData = { name: 'TestTag' };
      const dbError = new Error('Database save failed');
      
      Tag.findOne = jest.fn().mockResolvedValue(null);
      
      const mockSave = jest.fn().mockRejectedValue(dbError);
      Tag.mockImplementation(() => ({
        name: tagData.name,
        save: mockSave
      }));

      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .send(tagData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Server error');
    });

    it('should handle database errors during duplicate check', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagData = { name: 'TestTag' };
      const dbError = new Error('Database query failed');
      
      Tag.findOne = jest.fn().mockRejectedValue(dbError);

      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .send(tagData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Server error');
    });
  });

  describe('PUT /api/tags/:id', () => {
    it('should update tag and return 200 status', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagId = new mongoose.Types.ObjectId();
      const updateData = { name: 'Updated Electronics' };
      const updatedTag = {
        _id: tagId,
        name: 'Updated Electronics'
      };
      
      Tag.findOneAndUpdate = jest.fn().mockResolvedValue(updatedTag);

      const response = await request(app)
        .put(`/api/tags/${tagId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Updated Electronics');
      expect(response.body).toHaveProperty('_id', tagId.toString());
      expect(Tag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: tagId.toString(), user: user._id },
        { name: 'Updated Electronics' },
        { new: true, runValidators: true }
      );
    });

    it('should update tag using Authorization header', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagId = new mongoose.Types.ObjectId();
      const updateData = { name: 'Updated Books' };
      const updatedTag = {
        _id: tagId,
        name: 'Updated Books'
      };
      
      Tag.findOneAndUpdate = jest.fn().mockResolvedValue(updatedTag);

      const response = await request(app)
        .put(`/api/tags/${tagId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Updated Books');
      expect(Tag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: tagId.toString(), user: user._id },
        { name: 'Updated Books' },
        { new: true, runValidators: true }
      );
    });

    it('should return 404 for a tag that does not exist or is not owned', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagId = new mongoose.Types.ObjectId();
      const updateData = { name: 'Non-existent Tag' };
      
      Tag.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .put(`/api/tags/${tagId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Tag not found');
      expect(Tag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: tagId.toString(), user: user._id },
        { name: 'Non-existent Tag' },
        { new: true, runValidators: true }
      );
    });

    it('should handle invalid ObjectId in URL parameter', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const invalidId = 'invalid-id';
      const updateData = { name: 'Test Name' };
      
      Tag.findOneAndUpdate = jest.fn();

      const response = await request(app)
        .put(`/api/tags/${invalidId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Tag not found');
      expect(Tag.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should handle database errors during tag update', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagId = new mongoose.Types.ObjectId();
      const updateData = { name: 'Updated Name' };
      const dbError = new Error('Database update failed');
      
      Tag.findOneAndUpdate = jest.fn().mockRejectedValue(dbError);

      const response = await request(app)
        .put(`/api/tags/${tagId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Server error');
    });
  });

  describe('DELETE /api/tags/:id', () => {
    it('should delete tag and return success message with 200 status', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagId = new mongoose.Types.ObjectId();
      
      Tag.findOneAndDelete = jest.fn().mockResolvedValue({
        _id: tagId,
        name: 'Deleted Tag'
      });

      const response = await request(app)
        .delete(`/api/tags/${tagId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Tag deleted');
      expect(Tag.findOneAndDelete).toHaveBeenCalledWith({ _id: tagId.toString(), user: user._id });
    });

    it('should delete tag using Authorization header', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagId = new mongoose.Types.ObjectId();
      
      Tag.findOneAndDelete = jest.fn().mockResolvedValue({
        _id: tagId,
        name: 'Another Deleted Tag'
      });

      const response = await request(app)
        .delete(`/api/tags/${tagId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Tag deleted');
      expect(Tag.findOneAndDelete).toHaveBeenCalledWith({ _id: tagId.toString(), user: user._id });
    });

    it('should return 404 when deleting a tag that does not exist or is not owned', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagId = new mongoose.Types.ObjectId();
      
      Tag.findOneAndDelete = jest.fn().mockResolvedValue(null);

      const response = await request(app)
        .delete(`/api/tags/${tagId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Tag not found');
      expect(Tag.findOneAndDelete).toHaveBeenCalledWith({ _id: tagId.toString(), user: user._id });
    });

    it('should handle invalid ObjectId in URL parameter', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const invalidId = 'invalid-id';
      
      Tag.findOneAndDelete = jest.fn();

      const response = await request(app)
        .delete(`/api/tags/${invalidId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('message', 'Tag not found');
      expect(Tag.findOneAndDelete).not.toHaveBeenCalled();
    });

    it('should handle database errors during tag deletion', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagId = new mongoose.Types.ObjectId();
      const dbError = new Error('Database deletion failed');
      
      Tag.findOneAndDelete = jest.fn().mockRejectedValue(dbError);

      const response = await request(app)
        .delete(`/api/tags/${tagId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Server error');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON in request body', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
    });

    it('should handle very long tag names', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const longName = 'a'.repeat(1000);
      const tagData = { name: longName };
      
      Tag.findOne = jest.fn().mockResolvedValue(null);
      
      const mockSave = jest.fn().mockRejectedValue(new Error('Tag name too long'));
      Tag.mockImplementation(() => ({
        name: tagData.name,
        save: mockSave
      }));

      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .send(tagData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Server error');
    });

    it('should reject empty string tag names with 400', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);

      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .send({ name: '' })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message', 'Tag name is required');
    });

    it('should handle special characters in tag names', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      const tagData = { name: 'Test & Special <Characters>' };
      const createdTag = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Test & Special <Characters>'
      };
      
      Tag.findOne = jest.fn().mockResolvedValue(null);
      
      const mockSave = jest.fn().mockResolvedValue(createdTag);
      Tag.mockImplementation(() => ({
        name: tagData.name,
        save: mockSave
      }));

      const response = await request(app)
        .post('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .send(tagData)
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Test & Special <Characters>');
    });

    it('should handle concurrent requests gracefully', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Tag.find = jest.fn().mockResolvedValue([]);

      const requests = Array(5).fill().map(() => 
        request(app)
          .get('/api/tags')
          .set('Cookie', [`access_token=${token}`])
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
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
      expect(tagRoutes).toBeDefined();
      expect(typeof tagRoutes).toBe('function');
      expect(tagRoutes.name).toBe('router');
    });

    it('should have proper route bindings', () => {
      const router = tagRoutes;
      expect(router.stack).toBeDefined();
      expect(router.stack.length).toBeGreaterThan(0);
      expect(router.stack.length).toBe(4); // GET, POST, PUT, DELETE
    });

    it('should have correct HTTP method bindings', () => {
      const router = tagRoutes;
      const routes = router.stack.map(layer => ({
        method: Object.keys(layer.route.methods)[0].toUpperCase(),
        path: layer.route.path
      }));

      expect(routes).toContainEqual({ method: 'GET', path: '/' });
      expect(routes).toContainEqual({ method: 'POST', path: '/' });
      expect(routes).toContainEqual({ method: 'PUT', path: '/:id' });
      expect(routes).toContainEqual({ method: 'DELETE', path: '/:id' });
    });
  });

  describe('Authentication Middleware Integration', () => {
    it('should require authentication for GET /', async () => {
      const response = await request(app)
        .get('/api/tags')
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for POST /', async () => {
      const tagData = { name: 'Test Tag' };

      const response = await request(app)
        .post('/api/tags')
        .send(tagData)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for PUT /:id', async () => {
      const tagId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .put(`/api/tags/${tagId}`)
        .send({ name: 'Updated Tag' })
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should require authentication for DELETE /:id', async () => {
      const tagId = new mongoose.Types.ObjectId();
      
      const response = await request(app)
        .delete(`/api/tags/${tagId}`)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/tags')
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
        .get('/api/tags')
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
        .get('/api/tags')
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
        .get('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message', 'User not found');
    });

    it('should accept valid tokens from Authorization header', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Tag.find = jest.fn().mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/tags')
        .set('Authorization', `Bearer ${token}`)
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should accept valid tokens from cookies', async () => {
      const { user, token } = createAuthenticatedUser();
      setupAuthMiddleware(user);
      
      Tag.find = jest.fn().mockResolvedValue([]);
      
      const response = await request(app)
        .get('/api/tags')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });
}); // Missing closing parenthesis for describe('Tag Routes', ...)
