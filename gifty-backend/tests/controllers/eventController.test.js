// tests/controllers/eventController.test.js
const mongoose = require('mongoose');
const eventController = require('../../controllers/eventController');
const Event = require('../../models/Event');
const Recipient = require('../../models/Recipient');
const EventType = require('../../models/EventType');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

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
jest.mock('../../utils/logger', () => ({ debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Set higher timeout for controller tests
jest.setTimeout(30000);

// A thenable stand-in for a Mongoose query (supports .populate/.select chains)
const queryOf = (value) => {
  const q = {
    populate: jest.fn(() => q),
    select: jest.fn(() => q),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return q;
};

// Minimal Mongoose-document behaviour for findOwned results
const asDoc = (obj) => Object.assign(obj, {
  set: jest.fn(function set(fields) { Object.assign(this, fields); })
});

describe('Event Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  beforeEach(() => {
    // Referenced recipient/type belong to the caller unless a test says otherwise
    Recipient.exists = jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    EventType.exists = jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
  });

  describe('createEvent', () => {
    it('should create a new event successfully with all required fields', async () => {
      // Arrange
      const eventData = {
        name: 'Birthday Party',
        date: '2025-12-25',
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        recurring: {
          frequency: 'Yearly',
          until: '2030-12-25'
        },
        reminder: {
          isSet: true,
          time: '2025-12-24T10:00:00.000Z',
          method: 'Email'
        }
      };

      const { req, res } = createMockReqRes({
        body: eventData,
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockCreatedEvent = {
        _id: new mongoose.Types.ObjectId(),
        user: req.user._id,
        name: eventData.name,
        date: new Date(eventData.date),
        type: eventData.type,
        recipient: eventData.recipient,
        recurring: eventData.recurring,
        reminder: {
          isSet: true,
          time: new Date(eventData.reminder.time),
          method: eventData.reminder.method
        }
      };

      // Mock Event.create
      Event.create = jest.fn().mockResolvedValue(mockCreatedEvent);

      // Act
      await eventController.createEvent(req, res, mockNext);

      // Assert
      expect(Event.create).toHaveBeenCalledWith({
        user: req.user._id,
        name: eventData.name,
        date: eventData.date,
        type: eventData.type,
        recipient: eventData.recipient,
        recurring: eventData.recurring,
        seriesLinked: true,
        reminder: {
          isSet: true,
          time: eventData.reminder.time,
          method: eventData.reminder.method
        }
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreatedEvent);
    });

    it('should create event with reminder set to false when not provided', async () => {
      // Arrange
      const eventData = {
        name: 'Birthday Party',
        date: '2025-12-25',
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };

      const { req, res } = createMockReqRes({
        body: eventData,
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockCreatedEvent = {
        _id: new mongoose.Types.ObjectId(),
        user: req.user._id,
        ...eventData,
        reminder: {
          isSet: false,
          time: null,
          method: null
        }
      };

      Event.create = jest.fn().mockResolvedValue(mockCreatedEvent);

      // Act
      await eventController.createEvent(req, res, mockNext);

      // Assert
      expect(Event.create).toHaveBeenCalledWith({
        user: req.user._id,
        name: eventData.name,
        date: eventData.date,
        type: eventData.type,
        recipient: eventData.recipient,
        recurring: undefined,
        reminder: {
          isSet: false,
          time: null,
          method: null
        }
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockCreatedEvent);
    });

    it("should return 404 and not create when the recipient is another user's", async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const foreignRecipient = new mongoose.Types.ObjectId();
      const next = jest.fn();
      const { req, res } = createMockReqRes({
        body: { name: 'x', date: '2025-12-25', type: new mongoose.Types.ObjectId(), recipient: foreignRecipient },
        user: { _id: userId }
      });
      Recipient.exists = jest.fn().mockResolvedValue(null);
      Event.create = jest.fn();

      // Act
      await eventController.createEvent(req, res, next);

      // Assert
      expect(Recipient.exists).toHaveBeenCalledWith({ _id: foreignRecipient, user: userId });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, message: 'Recipient not found' }));
      expect(Event.create).not.toHaveBeenCalled();
    });

    it("should return 404 when the event type is another user's custom type", async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const typeId = new mongoose.Types.ObjectId();
      const next = jest.fn();
      const { req, res } = createMockReqRes({
        body: { name: 'x', date: '2025-12-25', type: typeId, recipient: new mongoose.Types.ObjectId() },
        user: { _id: userId }
      });
      EventType.exists = jest.fn().mockResolvedValue(null);
      Event.create = jest.fn();

      // Act
      await eventController.createEvent(req, res, next);

      // Assert
      expect(EventType.exists).toHaveBeenCalledWith({
        _id: typeId,
        $or: [{ isCustom: { $ne: true } }, { createdBy: userId }]
      });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, message: 'Event type not found' }));
      expect(Event.create).not.toHaveBeenCalled();
    });

    it('should ignore user and isSystemGenerated from the body', async () => {
      // Arrange
      const userId = new mongoose.Types.ObjectId();
      const body = {
        name: 'x', date: '2025-12-25', type: new mongoose.Types.ObjectId(), recipient: new mongoose.Types.ObjectId(),
        user: new mongoose.Types.ObjectId(), isSystemGenerated: true
      };
      const { req, res } = createMockReqRes({ body, user: { _id: userId } });
      Event.create = jest.fn().mockResolvedValue({});

      // Act
      await eventController.createEvent(req, res, mockNext);

      // Assert
      const created = Event.create.mock.calls[0][0];
      expect(created.user).toBe(userId);
      expect(created).not.toHaveProperty('isSystemGenerated');
    });

    it('should return 400 error when name is missing', async () => {
      // Arrange
      const eventData = {
        date: '2025-12-25',
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };

      const { req, res } = createMockReqRes({
        body: eventData,
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Mock next function to capture thrown error
      const mockNext = jest.fn();

      // Act
      await eventController.createEvent(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(Event.create).not.toHaveBeenCalled();
    });

    it('should return 400 error when date is missing', async () => {
      // Arrange
      const eventData = {
        name: 'Birthday Party',
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };

      const { req, res } = createMockReqRes({
        body: eventData,
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockNext = jest.fn();

      // Act
      await eventController.createEvent(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(Event.create).not.toHaveBeenCalled();
    });

    it('should return 400 error when type is missing', async () => {
      // Arrange
      const eventData = {
        name: 'Birthday Party',
        date: '2025-12-25',
        recipient: new mongoose.Types.ObjectId()
      };

      const { req, res } = createMockReqRes({
        body: eventData,
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockNext = jest.fn();

      // Act
      await eventController.createEvent(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(Event.create).not.toHaveBeenCalled();
    });

    it('should return 400 error when recipient is missing', async () => {
      // Arrange
      const eventData = {
        name: 'Birthday Party',
        date: '2025-12-25',
        type: new mongoose.Types.ObjectId()
      };

      const { req, res } = createMockReqRes({
        body: eventData,
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockNext = jest.fn();

      // Act
      await eventController.createEvent(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(Event.create).not.toHaveBeenCalled();
    });
  });

  describe('getEvents', () => {
    it('should return all events for a user without recipient filter', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: {},
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockEvents = [
        {
          _id: new mongoose.Types.ObjectId(),
          user: req.user._id,
          name: 'Birthday Party',
          date: new Date('2025-12-25'),
          type: { _id: new mongoose.Types.ObjectId(), name: 'Birthday' },
          recipient: { _id: new mongoose.Types.ObjectId(), firstName: 'John', lastName: 'Doe' }
        },
        {
          _id: new mongoose.Types.ObjectId(),
          user: req.user._id,
          name: 'Anniversary',
          date: new Date('2025-06-15'),
          type: { _id: new mongoose.Types.ObjectId(), name: 'Anniversary' },
          recipient: { _id: new mongoose.Types.ObjectId(), firstName: 'Jane', lastName: 'Smith' }
        }
      ];

      // Mock Event.find with method chaining
      const mockSecondPopulate = jest.fn().mockResolvedValue(mockEvents);
      const mockFirstPopulate = jest.fn().mockReturnValue({ populate: mockSecondPopulate });
      Event.find = jest.fn().mockReturnValue({ populate: mockFirstPopulate });

      // Act
      await eventController.getEvents(req, res, mockNext);

      // Assert
      expect(Event.find).toHaveBeenCalledWith({ user: req.user._id });
      expect(mockFirstPopulate).toHaveBeenCalledWith('type', 'name _id');
      expect(mockSecondPopulate).toHaveBeenCalledWith('recipient', 'firstName lastName _id');
      expect(res.json).toHaveBeenCalledWith(mockEvents);
    });

    it('should return events filtered by recipient when recipient query provided', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        query: { recipient: recipientId.toString() },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockEvents = [
        {
          _id: new mongoose.Types.ObjectId(),
          user: req.user._id,
          name: 'Birthday Party',
          date: new Date('2025-12-25'),
          type: { _id: new mongoose.Types.ObjectId(), name: 'Birthday' },
          recipient: { _id: recipientId, firstName: 'John', lastName: 'Doe' }
        }
      ];

      // Mock Event.find with method chaining
      const mockSecondPopulate = jest.fn().mockResolvedValue(mockEvents);
      const mockFirstPopulate = jest.fn().mockReturnValue({ populate: mockSecondPopulate });
      Event.find = jest.fn().mockReturnValue({ populate: mockFirstPopulate });

      // Act
      await eventController.getEvents(req, res, mockNext);

      // Assert
      expect(Event.find).toHaveBeenCalledWith({
        user: req.user._id,
        recipient: recipientId.toString()
      });
      expect(res.json).toHaveBeenCalledWith(mockEvents);
    });

    it('should return empty array when no events found', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        query: {},
        user: { _id: new mongoose.Types.ObjectId() }
      });

      // Mock Event.find with method chaining returning empty array
      const mockSecondPopulate = jest.fn().mockResolvedValue([]);
      const mockFirstPopulate = jest.fn().mockReturnValue({ populate: mockSecondPopulate });
      Event.find = jest.fn().mockReturnValue({ populate: mockFirstPopulate });

      // Act
      await eventController.getEvents(req, res, mockNext);

      // Assert
      expect(Event.find).toHaveBeenCalledWith({ user: req.user._id });
      expect(res.json).toHaveBeenCalledWith([]);
    });
  });

  describe('updateEvent', () => {
    it('should update an event successfully', async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Birthday Party',
        date: '2025-12-26',
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        recurring: {
          frequency: 'Yearly',
          until: '2030-12-26'
        },
        reminder: {
          isSet: true,
          time: '2025-12-25T10:00:00.000Z',
          method: 'Push Notification'
        }
      };

      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        body: updateData,
        user: { _id: userId }
      });

      const updatedEvent = {
        _id: eventId,
        user: userId,
        name: updateData.name,
        date: updateData.date,
        type: updateData.type,
        recipient: updateData.recipient,
        recurring: updateData.recurring,
        reminder: updateData.reminder
      };

      const mockEvent = {
        _id: eventId,
        user: userId,
        name: 'Original Birthday Party',
        date: new Date('2025-12-25'),
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId(),
        recurring: { frequency: 'None' },
        reminder: { isSet: false },
        save: jest.fn().mockResolvedValue(updatedEvent)
      };

      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(mockEvent)));

      // Act
      await eventController.updateEvent(req, res, mockNext);

      // Assert
      expect(Event.findOne).toHaveBeenCalledWith({ _id: eventId.toString(), user: userId });
      expect(mockEvent.save).toHaveBeenCalled();
      expect(mockEvent.name).toBe(updateData.name);
      expect(mockEvent.date).toBe(updateData.date);
      expect(mockEvent.type).toBe(updateData.type);
      expect(mockEvent.recipient).toBe(updateData.recipient);
      expect(mockEvent.recurring).toBe(updateData.recurring);
      expect(mockEvent.reminder).toEqual({
        isSet: true,
        time: updateData.reminder.time,
        method: updateData.reminder.method
      });
      expect(res.json).toHaveBeenCalledWith(updatedEvent);
    });

    it('should leave fields that are not in the body unchanged (partial update)', async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const originalDate = new Date('2025-12-25');
      const originalType = new mongoose.Types.ObjectId();
      const originalRecipient = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        body: { name: 'Renamed', user: new mongoose.Types.ObjectId().toString() },
        user: { _id: userId }
      });

      const mockEvent = {
        _id: eventId,
        user: userId,
        name: 'Original Birthday Party',
        date: originalDate,
        type: originalType,
        recipient: originalRecipient,
        reminder: { isSet: true },
        save: jest.fn().mockImplementation(function save() { return Promise.resolve(this); })
      };

      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(mockEvent)));

      // Act
      await eventController.updateEvent(req, res, mockNext);

      // Assert
      expect(mockEvent.set).toHaveBeenCalledWith({ name: 'Renamed' });
      expect(mockEvent.name).toBe('Renamed');
      expect(mockEvent.user).toBe(userId);
      expect(mockEvent.date).toBe(originalDate);
      expect(mockEvent.type).toBe(originalType);
      expect(mockEvent.recipient).toBe(originalRecipient);
      expect(mockEvent.reminder).toEqual({ isSet: true });
      expect(Recipient.exists).not.toHaveBeenCalled();
      expect(EventType.exists).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockEvent);
    });

    it('should clear the reminder when one is sent with isSet false', async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        body: { reminder: { isSet: false, time: '2025-12-24T10:00:00.000Z' } },
        user: { _id: userId }
      });

      const mockEvent = {
        _id: eventId,
        user: userId,
        reminder: { isSet: true, time: new Date(), method: 'Email' },
        save: jest.fn().mockResolvedValue({})
      };
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(mockEvent)));

      // Act
      await eventController.updateEvent(req, res, mockNext);

      // Assert
      expect(mockEvent.reminder).toEqual({ isSet: false, time: null, method: null });
    });

    it("should return 404 when re-pointing the event at another user's recipient", async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const foreignRecipient = new mongoose.Types.ObjectId();
      const next = jest.fn();
      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        body: { recipient: foreignRecipient.toString() },
        user: { _id: userId }
      });

      const mockEvent = { _id: eventId, user: userId, save: jest.fn() };
      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(mockEvent)));
      Recipient.exists = jest.fn().mockResolvedValue(null);

      // Act
      await eventController.updateEvent(req, res, next);

      // Assert
      expect(Recipient.exists).toHaveBeenCalledWith({ _id: foreignRecipient.toString(), user: userId });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(mockEvent.save).not.toHaveBeenCalled();
    });

    it('should return 404 when event not found', async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Birthday Party',
        date: '2025-12-26',
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };

      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        body: updateData,
        user: { _id: userId }
      });

      const mockNext = jest.fn();
      Event.findOne = jest.fn().mockReturnValue(queryOf(null));

      // Act
      await eventController.updateEvent(req, res, mockNext);

      // Assert
      expect(Event.findOne).toHaveBeenCalledWith({ _id: eventId.toString(), user: userId });
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it('should return 404 (not 401) when the event belongs to another user', async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const differentUserId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Birthday Party',
        date: '2025-12-26',
        type: new mongoose.Types.ObjectId(),
        recipient: new mongoose.Types.ObjectId()
      };

      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        body: updateData,
        user: { _id: userId }
      });

      const mockEvent = {
        _id: eventId,
        user: differentUserId, // Different user - not authorized
        name: 'Original Birthday Party'
      };

      const mockNext = jest.fn();
      // The owner-scoped query does not match another user's event
      Event.findOne = jest.fn().mockReturnValue(queryOf(null));
      void mockEvent;

      // Act
      await eventController.updateEvent(req, res, mockNext);

      // Assert
      expect(Event.findOne).toHaveBeenCalledWith({ _id: eventId.toString(), user: userId });
      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  describe('deleteEvent', () => {
    it('should delete an event successfully', async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        user: { _id: userId }
      });

      const mockEvent = {
        _id: eventId,
        user: userId,
        name: 'Birthday Party',
        deleteOne: jest.fn().mockResolvedValue({})
      };

      Event.findOne = jest.fn().mockReturnValue(queryOf(asDoc(mockEvent)));

      // Act
      await eventController.deleteEvent(req, res, mockNext);

      // Assert
      expect(Event.findOne).toHaveBeenCalledWith({ _id: eventId.toString(), user: userId });
      expect(mockEvent.deleteOne).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.json).toHaveBeenCalledWith();
    });

    it('should return 404 when event not found for deletion', async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        user: { _id: userId }
      });

      const mockNext = jest.fn();
      Event.findOne = jest.fn().mockReturnValue(queryOf(null));

      // Act
      await eventController.deleteEvent(req, res, mockNext);

      // Assert
      expect(Event.findOne).toHaveBeenCalledWith({ _id: eventId.toString(), user: userId });
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it('should return 404 (not 401) when deleting another user\'s event', async () => {
      // Arrange
      const eventId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const differentUserId = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { eventId: eventId.toString() },
        user: { _id: userId }
      });

      const mockEvent = {
        _id: eventId,
        user: differentUserId, // Different user - not authorized
        name: 'Birthday Party'
      };

      const mockNext = jest.fn();
      // The owner-scoped query does not match another user's event
      Event.findOne = jest.fn().mockReturnValue(queryOf(null));
      void mockEvent;

      // Act
      await eventController.deleteEvent(req, res, mockNext);

      // Assert
      expect(Event.findOne).toHaveBeenCalledWith({ _id: eventId.toString(), user: userId });
      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
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
