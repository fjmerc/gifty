// tests/routes/vendorRoutes.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const { createMockUser, generateTestToken } = require('../utils/mockUtils');
const vendorRoutes = require('../../routes/vendorRoutes');
const Vendor = require('../../models/Vendor');
const User = require('../../models/User');

// Mock dependencies
jest.mock('../../models/Vendor');
jest.mock('../../models/User');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for route tests
jest.setTimeout(30000);

describe('Vendor Routes', () => {
  let app;
  const originalEnv = process.env;

  beforeAll(async () => {
    await setupTestDB();
    
    // Setup test environment
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'test_jwt_secret'
    };
    
    // Set up Express app for testing
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    
    // Add vendor routes to the app
    app.use('/api/vendors', vendorRoutes);
    
    // Set up error handler - must be after routes
    app.use((err, req, res, next) => {
      // Use the status code that was already set on the response, or fall back to err.statusCode, or 500
      const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : (err.statusCode || 500);
      res.status(statusCode);
      res.json({ message: err.message });
    });
  });

  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDB();
    process.env = originalEnv;
  });

  describe('Authentication Middleware Tests', () => {
    it('should return 401 for POST /api/vendors without authentication', async () => {
      // Act (no authentication token provided)
      const response = await request(app)
        .post('/api/vendors')
        .send({ vendorName: 'Test Vendor', vendorDetails: 'Test Details' })
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should return 401 for GET /api/vendors without authentication', async () => {
      // Act (no authentication token provided)
      const response = await request(app)
        .get('/api/vendors')
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should return 401 for PUT /api/vendors/:vendorId without authentication', async () => {
      const vendorId = new mongoose.Types.ObjectId();

      // Act (no authentication token provided)
      const response = await request(app)
        .put(`/api/vendors/${vendorId}`)
        .send({ vendorName: 'Updated Vendor' })
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });

    it('should return 401 for DELETE /api/vendors/:vendorId without authentication', async () => {
      const vendorId = new mongoose.Types.ObjectId();

      // Act (no authentication token provided)
      const response = await request(app)
        .delete(`/api/vendors/${vendorId}`)
        .expect('Content-Type', /json/);
      
      // Assert
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Not authorized, no token');
    });
  });

  describe('POST /api/vendors - Add Vendor Partnership', () => {
    it('should successfully create vendor and return 201 status', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      const vendorData = {
        vendorName: 'Test Vendor',
        vendorDetails: 'Test vendor details for partnership'
      };

      const createdVendor = {
        _id: new mongoose.Types.ObjectId(),
        vendorName: vendorData.vendorName,
        vendorDetails: vendorData.vendorDetails,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock Vendor.create
      Vendor.create = jest.fn().mockResolvedValue(createdVendor);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .post('/api/vendors')
        .set('Cookie', [`access_token=${token}`])
        .send(vendorData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('_id');
      expect(response.body).toHaveProperty('vendorName', vendorData.vendorName);
      expect(response.body).toHaveProperty('vendorDetails', vendorData.vendorDetails);
      expect(Vendor.create).toHaveBeenCalledWith({
        vendorName: vendorData.vendorName,
        vendorDetails: vendorData.vendorDetails,
        user: userId
      });
    });

    it('should return 400 if vendorName is missing', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      const vendorData = {
        vendorDetails: 'Test vendor details'
        // vendorName is missing
      };

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .post('/api/vendors')
        .set('Cookie', [`access_token=${token}`])
        .send(vendorData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('message', 'Vendor name and details are required');
    });

    it('should return 400 if vendorDetails is missing', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      const vendorData = {
        vendorName: 'Test Vendor'
        // vendorDetails is missing
      };

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .post('/api/vendors')
        .set('Cookie', [`access_token=${token}`])
        .send(vendorData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('message', 'Vendor name and details are required');
    });

    it('should return 400 if both vendorName and vendorDetails are missing', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      const vendorData = {};

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .post('/api/vendors')
        .set('Cookie', [`access_token=${token}`])
        .send(vendorData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('message', 'Vendor name and details are required');
    });
  });

  describe('GET /api/vendors - Get All Vendors', () => {
    it('should return all vendors with 200 status', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });
      
      const allVendors = [
        {
          _id: new mongoose.Types.ObjectId(),
          vendorName: 'Vendor One',
          vendorDetails: 'First vendor details',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: new mongoose.Types.ObjectId(),
          vendorName: 'Vendor Two',
          vendorDetails: 'Second vendor details',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      // Mock Vendor.find
      Vendor.find = jest.fn().mockResolvedValue(allVendors);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .get('/api/vendors')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('vendorName', 'Vendor One');
      expect(response.body[1]).toHaveProperty('vendorName', 'Vendor Two');
      expect(Vendor.find).toHaveBeenCalledWith({ user: userId });
    });

    it('should return empty array when no vendors exist', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });

      // Mock Vendor.find to return empty array
      Vendor.find = jest.fn().mockResolvedValue([]);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .get('/api/vendors')
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
      expect(Vendor.find).toHaveBeenCalledWith({ user: userId });
    });
  });

  describe('PUT /api/vendors/:vendorId - Update Vendor Partnership', () => {
    it('should successfully update vendor and return 200 status', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const vendorId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });

      const updateData = {
        vendorName: 'Updated Vendor Name',
        vendorDetails: 'Updated vendor details'
      };

      const existingVendor = {
        _id: vendorId,
        vendorName: 'Original Vendor',
        vendorDetails: 'Original details',
        save: jest.fn().mockResolvedValue({
          _id: vendorId,
          vendorName: updateData.vendorName,
          vendorDetails: updateData.vendorDetails,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      };

      // Mock the owner-scoped lookup
      Vendor.findOne = jest.fn().mockResolvedValue(existingVendor);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .put(`/api/vendors/${vendorId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('vendorName', updateData.vendorName);
      expect(response.body).toHaveProperty('vendorDetails', updateData.vendorDetails);
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(existingVendor.save).toHaveBeenCalled();
    });

    it('should update only vendorName when vendorDetails not provided', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const vendorId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });

      const updateData = {
        vendorName: 'Updated Vendor Name'
        // vendorDetails not provided - should keep original
      };

      const existingVendor = {
        _id: vendorId,
        vendorName: 'Original Vendor',
        vendorDetails: 'Original details',
        save: jest.fn().mockResolvedValue({
          _id: vendorId,
          vendorName: updateData.vendorName,
          vendorDetails: 'Original details', // Should remain unchanged
          createdAt: new Date(),
          updatedAt: new Date()
        })
      };

      // Mock the owner-scoped lookup
      Vendor.findOne = jest.fn().mockResolvedValue(existingVendor);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .put(`/api/vendors/${vendorId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('vendorName', updateData.vendorName);
      expect(response.body).toHaveProperty('vendorDetails', 'Original details');
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(existingVendor.save).toHaveBeenCalled();
    });

    it('should update only vendorDetails when vendorName not provided', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const vendorId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });

      const updateData = {
        vendorDetails: 'Updated vendor details'
        // vendorName not provided - should keep original
      };

      const existingVendor = {
        _id: vendorId,
        vendorName: 'Original Vendor',
        vendorDetails: 'Original details',
        save: jest.fn().mockResolvedValue({
          _id: vendorId,
          vendorName: 'Original Vendor', // Should remain unchanged
          vendorDetails: updateData.vendorDetails,
          createdAt: new Date(),
          updatedAt: new Date()
        })
      };

      // Mock the owner-scoped lookup
      Vendor.findOne = jest.fn().mockResolvedValue(existingVendor);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .put(`/api/vendors/${vendorId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('vendorName', 'Original Vendor');
      expect(response.body).toHaveProperty('vendorDetails', updateData.vendorDetails);
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(existingVendor.save).toHaveBeenCalled();
    });

    it('should return 404 if vendor not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const vendorId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });

      const updateData = {
        vendorName: 'Updated Vendor'
      };

      // Mock the owner-scoped lookup to return null
      Vendor.findOne = jest.fn().mockResolvedValue(null);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .put(`/api/vendors/${vendorId}`)
        .set('Cookie', [`access_token=${token}`])
        .send(updateData)
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(response.body).toHaveProperty('message', 'Vendor not found');
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
    });
  });

  describe('DELETE /api/vendors/:vendorId - Delete Vendor Partnership', () => {
    it('should successfully delete vendor and return 204 status', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const vendorId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });

      const vendor = {
        _id: vendorId,
        vendorName: 'Test Vendor',
        vendorDetails: 'Test details',
        deleteOne: jest.fn().mockResolvedValue()
      };

      // Mock the owner-scoped lookup
      Vendor.findOne = jest.fn().mockResolvedValue(vendor);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .delete(`/api/vendors/${vendorId}`)
        .set('Cookie', [`access_token=${token}`]);

      // Assert
      expect(response.statusCode).toBe(204);
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(vendor.deleteOne).toHaveBeenCalled();
    });

    it('should return 404 if vendor not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const vendorId = new mongoose.Types.ObjectId();
      const user = createMockUser({ _id: userId });

      // Mock the owner-scoped lookup to return null
      Vendor.findOne = jest.fn().mockResolvedValue(null);

      // Generate token for authenticated request
      const token = generateTestToken(userId);

      // Mock User.findById for auth middleware
      User.findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockResolvedValue(user)
      }));

      // Act
      const response = await request(app)
        .delete(`/api/vendors/${vendorId}`)
        .set('Cookie', [`access_token=${token}`])
        .expect('Content-Type', /json/);

      // Assert
      expect(response.statusCode).toBe(404);
      expect(response.body).toHaveProperty('message', 'Vendor not found');
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
    });
  });
});
