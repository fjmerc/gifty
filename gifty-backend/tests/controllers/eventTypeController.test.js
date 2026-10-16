// tests/controllers/eventTypeController.test.js
const mongoose = require('mongoose');
const eventTypeController = require('../../controllers/eventTypeController');
const EventType = require('../../models/EventType');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependencies
jest.mock('../../models/EventType');
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for controller tests
jest.setTimeout(30000);

describe('EventType Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  describe('createEventType', () => {
    it('should always create a custom type owned by the caller, even if isCustom=false is sent', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Birthday',
        description: 'Birthday celebration event',
        isCustom: false
      };

      const { req, res } = createMockReqRes({
        body: eventTypeData,
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockCreatedEventType = {
        _id: new mongoose.Types.ObjectId(),
        name: eventTypeData.name,
        description: eventTypeData.description,
        isCustom: false,
        save: jest.fn().mockResolvedValue(true)
      };

      // Mock EventType constructor and save method
      EventType.mockImplementation(() => mockCreatedEventType);

      // Act
      await eventTypeController.createEventType(req, res, mockNext);

      // Assert
      expect(EventType).toHaveBeenCalledWith({
        name: eventTypeData.name,
        description: eventTypeData.description,
        isCustom: true,
        createdBy: req.user._id
      });
      expect(mockCreatedEventType.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreatedEventType);
    });

    it('should create a custom event type successfully (with user association)', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const eventTypeData = {
        name: 'Company Meeting',
        description: 'Regular company meeting event',
        isCustom: true
      };

      const { req, res } = createMockReqRes({
        body: eventTypeData,
        user: { _id: userId }
      });

      const mockCreatedEventType = {
        _id: new mongoose.Types.ObjectId(),
        name: eventTypeData.name,
        description: eventTypeData.description,
        isCustom: true,
        createdBy: userId,
        save: jest.fn().mockResolvedValue(true)
      };

      // Mock EventType constructor and save method
      EventType.mockImplementation(() => mockCreatedEventType);

      // Act
      await eventTypeController.createEventType(req, res, mockNext);

      // Assert
      expect(EventType).toHaveBeenCalledWith({
        name: eventTypeData.name,
        description: eventTypeData.description,
        isCustom: true,
        createdBy: userId
      });
      expect(mockCreatedEventType.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreatedEventType);
    });

    it('should return 400 error when save fails with validation error', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Invalid Event Type',
        description: 'Event type that will fail validation',
        isCustom: true
      };

      const { req, res } = createMockReqRes({
        body: eventTypeData,
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockEventType = {
        save: jest.fn().mockRejectedValue(new Error('Validation failed: name already exists'))
      };

      // Mock EventType constructor to return object that fails on save
      EventType.mockImplementation(() => mockEventType);

      // Act
      await eventTypeController.createEventType(req, res, mockNext);

      // Assert
      expect(mockEventType.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      // Internal error text stays in the server log
      expect(res.json).toHaveBeenCalledWith({ message: 'Error creating event type' });
    });
  });

  describe('getAllEventTypes', () => {
    it('should return all event types when no filters applied', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: {},
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockEventTypes = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Birthday',
          description: 'Birthday celebration',
          isCustom: false
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Company Meeting',
          description: 'Regular company meeting',
          isCustom: true,
          createdBy: req.user._id
        }
      ];

      EventType.find = jest.fn().mockResolvedValue(mockEventTypes);

      // Act
      await eventTypeController.getAllEventTypes(req, res, mockNext);

      // Assert
      expect(EventType.find).toHaveBeenCalledWith({ $or: [{ isCustom: { $ne: true } }, { createdBy: req.user._id }] });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockEventTypes);
    });

    it('should filter by custom types when isCustom=true', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: { isCustom: 'true' },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockCustomEventTypes = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Company Meeting',
          description: 'Regular company meeting',
          isCustom: true,
          createdBy: req.user._id
        }
      ];

      EventType.find = jest.fn().mockResolvedValue(mockCustomEventTypes);

      // Act
      await eventTypeController.getAllEventTypes(req, res, mockNext);

      // Assert
      expect(EventType.find).toHaveBeenCalledWith({ $or: [{ isCustom: { $ne: true } }, { createdBy: req.user._id }], isCustom: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockCustomEventTypes);
    });

    it('should return 200 with an empty array when no event types found', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: { isCustom: 'true', userOnly: 'true' },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      EventType.find = jest.fn().mockResolvedValue([]);

      // Act
      await eventTypeController.getAllEventTypes(req, res, mockNext);

      // Assert
      expect(EventType.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('should return 500 error when database query fails', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: {},
        user: { _id: new mongoose.Types.ObjectId() }
      });

      EventType.find = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      // Act
      await eventTypeController.getAllEventTypes(req, res, mockNext);

      // Assert
      expect(EventType.find).toHaveBeenCalledWith({ $or: [{ isCustom: { $ne: true } }, { createdBy: req.user._id }] });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Error fetching event types' });
    });
  });

  describe('updateEventType', () => {
    it('should successfully update a custom event type by owner', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const eventTypeId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Custom Event',
        description: 'Updated description'
      };

      const { req, res } = createMockReqRes({
        params: { eventTypeID: eventTypeId.toString() },
        body: updateData,
        user: { _id: userId }
      });

      const mockEventType = {
        _id: eventTypeId,
        name: 'Original Custom Event',
        description: 'Original description',
        isCustom: true,
        createdBy: userId,
        save: jest.fn().mockResolvedValue(undefined)
      };

      EventType.findById = jest.fn().mockResolvedValue(mockEventType);

      // Act
      await eventTypeController.updateEventType(req, res, mockNext);

      // Assert: the name is checked by save(), as on create
      expect(EventType.findById).toHaveBeenCalledWith(eventTypeId.toString());
      expect(mockEventType.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        name: updateData.name,
        description: updateData.description
      }));
    });

    it('should return 403 when trying to update system event type', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const eventTypeId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated System Event',
        description: 'Updated description'
      };

      const { req, res } = createMockReqRes({
        params: { eventTypeID: eventTypeId.toString() },
        body: updateData,
        user: { _id: userId }
      });

      const mockSystemEventType = {
        _id: eventTypeId,
        name: 'Birthday',
        description: 'Birthday celebration',
        isCustom: false
      };

      EventType.findById = jest.fn().mockResolvedValue(mockSystemEventType);

      // Act
      await eventTypeController.updateEventType(req, res, mockNext);

      // Assert
      expect(EventType.findById).toHaveBeenCalledWith(eventTypeId.toString());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'System event types cannot be modified' });
      expect(EventType.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should return 404 when event type not found', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const eventTypeId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Event Type',
        description: 'Updated description'
      };

      const { req, res } = createMockReqRes({
        params: { eventTypeID: eventTypeId.toString() },
        body: updateData,
        user: { _id: userId }
      });

      EventType.findById = jest.fn().mockResolvedValue(null);

      // Act
      await eventTypeController.updateEventType(req, res, mockNext);

      // Assert
      expect(EventType.findById).toHaveBeenCalledWith(eventTypeId.toString());
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'EventType not found' });
      expect(EventType.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('deleteEventType', () => {
    it('should successfully delete a custom event type by owner', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const eventTypeId = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { eventTypeID: eventTypeId.toString() },
        user: { _id: userId }
      });

      const mockEventType = {
        _id: eventTypeId,
        name: 'Custom Event to Delete',
        description: 'Custom event description',
        isCustom: true,
        createdBy: userId
      };

      EventType.findById = jest.fn().mockResolvedValue(mockEventType);
      EventType.findByIdAndDelete = jest.fn().mockResolvedValue(mockEventType);

      // Act
      await eventTypeController.deleteEventType(req, res, mockNext);

      // Assert
      expect(EventType.findById).toHaveBeenCalledWith(eventTypeId.toString());
      expect(EventType.findByIdAndDelete).toHaveBeenCalledWith(eventTypeId.toString());
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 403 when trying to delete system event type', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const eventTypeId = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { eventTypeID: eventTypeId.toString() },
        user: { _id: userId }
      });

      const mockSystemEventType = {
        _id: eventTypeId,
        name: 'Birthday',
        description: 'Birthday celebration',
        isCustom: false
      };

      EventType.findById = jest.fn().mockResolvedValue(mockSystemEventType);

      // Act
      await eventTypeController.deleteEventType(req, res, mockNext);

      // Assert
      expect(EventType.findById).toHaveBeenCalledWith(eventTypeId.toString());
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'System event types cannot be deleted' });
      expect(EventType.findByIdAndDelete).not.toHaveBeenCalled();
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
