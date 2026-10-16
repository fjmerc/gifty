// tests/controllers/vendorController.test.js
const mongoose = require('mongoose');
const vendorController = require('../../controllers/vendorController');
const Vendor = require('../../models/Vendor');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependencies
jest.mock('../../models/Vendor');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for controller tests
jest.setTimeout(30000);

// Every controller call is made by an authenticated user
const userId = new mongoose.Types.ObjectId();
const authedReqRes = (overrides) => createMockReqRes({ user: { _id: userId }, ...overrides });

describe('Vendor Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  describe('deleteVendorPartnership', () => {
    it('should successfully delete vendor', async () => {
      // Arrange
      const vendorId = new mongoose.Types.ObjectId();
      const { req, res } = authedReqRes({
        params: { vendorId: vendorId.toString() }
      });

      const mockVendor = {
        _id: vendorId,
        vendorName: 'Amazon',
        vendorDetails: 'Partnership to be deleted',
        deleteOne: jest.fn().mockResolvedValue(true)
      };

      // Mock the owner-scoped lookup
      Vendor.findOne = jest.fn().mockResolvedValue(mockVendor);

      // Act
      await vendorController.deleteVendorPartnership(req, res, mockNext);

      // Assert
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(mockVendor.deleteOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.json).toHaveBeenCalledWith();
    });

    it('should throw 404 error when vendor not found for deletion', async () => {
      // Arrange
      const vendorId = new mongoose.Types.ObjectId();
      const { req, res } = authedReqRes({
        params: { vendorId: vendorId.toString() }
      });

      const mockNext = jest.fn();

      // Mock the owner-scoped lookup to return null
      Vendor.findOne = jest.fn().mockResolvedValue(null);

      // Act
      await vendorController.deleteVendorPartnership(req, res, mockNext);

      // Assert
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].statusCode).toBe(404);
      expect(mockNext.mock.calls[0][0].message).toBe('Vendor not found');
    });
  });

  describe('updateVendorPartnership', () => {
    it('should successfully update vendor with full update (both vendorName and vendorDetails)', async () => {
      // Arrange
      const vendorId = new mongoose.Types.ObjectId();
      const updateData = {
        vendorName: 'Updated Amazon',
        vendorDetails: 'Updated partnership details with enhanced features'
      };

      const { req, res } = authedReqRes({
        params: { vendorId: vendorId.toString() },
        body: updateData
      });

      const mockVendor = {
        _id: vendorId,
        vendorName: 'Amazon',
        vendorDetails: 'Original partnership details',
        save: jest.fn().mockResolvedValue({
          _id: vendorId,
          vendorName: updateData.vendorName,
          vendorDetails: updateData.vendorDetails,
          updatedAt: new Date()
        })
      };

      const mockUpdatedVendor = {
        _id: vendorId,
        vendorName: updateData.vendorName,
        vendorDetails: updateData.vendorDetails,
        updatedAt: new Date()
      };

      // Mock the owner-scoped lookup and save
      Vendor.findOne = jest.fn().mockResolvedValue(mockVendor);
      mockVendor.save = jest.fn().mockResolvedValue(mockUpdatedVendor);

      // Act
      await vendorController.updateVendorPartnership(req, res, mockNext);

      // Assert
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(mockVendor.vendorName).toBe(updateData.vendorName);
      expect(mockVendor.vendorDetails).toBe(updateData.vendorDetails);
      expect(mockVendor.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockUpdatedVendor);
    });

    it('should successfully update vendor with partial update (vendorName only)', async () => {
      // Arrange
      const vendorId = new mongoose.Types.ObjectId();
      const updateData = {
        vendorName: 'Updated Amazon'
      };

      const { req, res } = authedReqRes({
        params: { vendorId: vendorId.toString() },
        body: updateData
      });

      const mockVendor = {
        _id: vendorId,
        vendorName: 'Amazon',
        vendorDetails: 'Original partnership details',
        save: jest.fn().mockResolvedValue({
          _id: vendorId,
          vendorName: updateData.vendorName,
          vendorDetails: 'Original partnership details',
          updatedAt: new Date()
        })
      };

      const mockUpdatedVendor = {
        _id: vendorId,
        vendorName: updateData.vendorName,
        vendorDetails: 'Original partnership details',
        updatedAt: new Date()
      };

      // Mock the owner-scoped lookup and save
      Vendor.findOne = jest.fn().mockResolvedValue(mockVendor);
      mockVendor.save = jest.fn().mockResolvedValue(mockUpdatedVendor);

      // Act
      await vendorController.updateVendorPartnership(req, res, mockNext);

      // Assert
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(mockVendor.vendorName).toBe(updateData.vendorName);
      expect(mockVendor.vendorDetails).toBe('Original partnership details'); // Should remain unchanged
      expect(mockVendor.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockUpdatedVendor);
    });

    it('should successfully update vendor with partial update (vendorDetails only)', async () => {
      // Arrange
      const vendorId = new mongoose.Types.ObjectId();
      const updateData = {
        vendorDetails: 'Updated partnership details'
      };

      const { req, res } = authedReqRes({
        params: { vendorId: vendorId.toString() },
        body: updateData
      });

      const mockVendor = {
        _id: vendorId,
        vendorName: 'Amazon',
        vendorDetails: 'Original partnership details',
        save: jest.fn().mockResolvedValue({
          _id: vendorId,
          vendorName: 'Amazon',
          vendorDetails: updateData.vendorDetails,
          updatedAt: new Date()
        })
      };

      const mockUpdatedVendor = {
        _id: vendorId,
        vendorName: 'Amazon',
        vendorDetails: updateData.vendorDetails,
        updatedAt: new Date()
      };

      // Mock the owner-scoped lookup and save
      Vendor.findOne = jest.fn().mockResolvedValue(mockVendor);
      mockVendor.save = jest.fn().mockResolvedValue(mockUpdatedVendor);

      // Act
      await vendorController.updateVendorPartnership(req, res, mockNext);

      // Assert
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(mockVendor.vendorName).toBe('Amazon'); // Should remain unchanged
      expect(mockVendor.vendorDetails).toBe(updateData.vendorDetails);
      expect(mockVendor.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockUpdatedVendor);
    });

    it('should throw 404 error when vendor not found for update', async () => {
      // Arrange
      const vendorId = new mongoose.Types.ObjectId();
      const updateData = {
        vendorName: 'Updated Amazon'
      };

      const { req, res } = authedReqRes({
        params: { vendorId: vendorId.toString() },
        body: updateData
      });

      const mockNext = jest.fn();

      // Mock the owner-scoped lookup to return null
      Vendor.findOne = jest.fn().mockResolvedValue(null);

      // Act
      await vendorController.updateVendorPartnership(req, res, mockNext);

      // Assert
      expect(Vendor.findOne).toHaveBeenCalledWith({ _id: vendorId.toString(), user: userId });
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].statusCode).toBe(404);
      expect(mockNext.mock.calls[0][0].message).toBe('Vendor not found');
    });
  });

  describe('getVendors', () => {
    it('should return all vendor partnerships', async () => {
      // Arrange
      const { req, res } = authedReqRes({});

      const mockVendors = [
        {
          _id: new mongoose.Types.ObjectId(),
          vendorName: 'Amazon',
          vendorDetails: 'E-commerce platform partnership',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: new mongoose.Types.ObjectId(),
          vendorName: 'Target',
          vendorDetails: 'Retail partnership for gift sourcing',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      // Mock Vendor.find
      Vendor.find = jest.fn().mockResolvedValue(mockVendors);

      // Act
      await vendorController.getVendors(req, res, mockNext);

      // Assert
      expect(Vendor.find).toHaveBeenCalledWith({ user: userId });
      expect(res.json).toHaveBeenCalledWith(mockVendors);
    });

    it('should return empty array when no vendors exist', async () => {
      // Arrange
      const { req, res } = authedReqRes({});

      // Mock Vendor.find to return empty array
      Vendor.find = jest.fn().mockResolvedValue([]);

      // Act
      await vendorController.getVendors(req, res, mockNext);

      // Assert
      expect(Vendor.find).toHaveBeenCalledWith({ user: userId });
      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('addVendorPartnership', () => {
    it('should successfully create vendor with all required fields', async () => {
      // Arrange
      const vendorData = {
        vendorName: 'Amazon',
        vendorDetails: 'E-commerce platform partnership for gift recommendations and affiliate marketing'
      };

      const { req, res } = authedReqRes({
        body: vendorData
      });

      const mockCreatedVendor = {
        _id: new mongoose.Types.ObjectId(),
        vendorName: vendorData.vendorName,
        vendorDetails: vendorData.vendorDetails,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Mock Vendor.create
      Vendor.create = jest.fn().mockResolvedValue(mockCreatedVendor);

      // Act
      await vendorController.addVendorPartnership(req, res, mockNext);

      // Assert
      expect(Vendor.create).toHaveBeenCalledWith({
        vendorName: vendorData.vendorName,
        vendorDetails: vendorData.vendorDetails,
        user: userId
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreatedVendor);
    });

    it('should throw 400 error when vendorName is missing', async () => {
      // Arrange
      const vendorData = {
        vendorDetails: 'Partnership details without vendor name'
      };

      const { req, res } = authedReqRes({
        body: vendorData
      });

      const mockNext = jest.fn();

      // Act
      await vendorController.addVendorPartnership(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Vendor name and details are required');
      expect(Vendor.create).not.toHaveBeenCalled();
    });

    it('should throw 400 error when vendorDetails is missing', async () => {
      // Arrange
      const vendorData = {
        vendorName: 'Amazon'
      };

      const { req, res } = authedReqRes({
        body: vendorData
      });

      const mockNext = jest.fn();

      // Act
      await vendorController.addVendorPartnership(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Vendor name and details are required');
      expect(Vendor.create).not.toHaveBeenCalled();
    });

    it('should throw 400 error when both vendorName and vendorDetails are missing', async () => {
      // Arrange
      const { req, res } = authedReqRes({
        body: {}
      });

      const mockNext = jest.fn();

      // Act
      await vendorController.addVendorPartnership(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Vendor name and details are required');
      expect(Vendor.create).not.toHaveBeenCalled();
    });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await clearDatabase();
  });

  afterAll(async () => {
    await teardownTestDB();
  });
});
