// tests/models/EventType.test.js
const mongoose = require('mongoose');
const EventType = require('../../models/EventType');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependent models
jest.mock('../../models/User', () => ({
  findById: jest.fn()
}));

// Set higher timeout for database tests
jest.setTimeout(30000);

describe('EventType Model', () => {
  let testUser;

  // Connect to test database before all tests
  beforeAll(async () => {
    await setupTestDB();
  });

  // Set up test data before each test
  beforeEach(async () => {
    testUser = new mongoose.Types.ObjectId();
  });

  // Clear all test data after each test
  afterEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
  });

  // Disconnect and stop MongoDB server after all tests
  afterAll(async () => {
    await teardownTestDB();
  });

  describe('Schema Validation', () => {
    it('should create event type with all required fields', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Birthday',
        description: 'Annual birthday celebration',
        isCustom: false
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.name).toBe('Birthday');
      expect(eventType.description).toBe('Annual birthday celebration');
      expect(eventType.isCustom).toBe(false);
      expect(eventType.createdBy).toBeUndefined();
      expect(eventType.createdAt).toBeDefined();
      expect(eventType.updatedAt).toBeDefined();
    });

    it('should create event type with only required fields', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Wedding'
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.name).toBe('Wedding');
      expect(eventType.description).toBeUndefined();
      expect(eventType.isCustom).toBe(false); // Default value
      expect(eventType.createdBy).toBeUndefined();
    });

    it('should create custom event type with createdBy field', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Company Anniversary',
        description: 'Custom company milestone event',
        isCustom: true,
        createdBy: testUser
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.name).toBe('Company Anniversary');
      expect(eventType.description).toBe('Custom company milestone event');
      expect(eventType.isCustom).toBe(true);
      expect(eventType.createdBy).toEqual(testUser);
    });

    it('should fail validation if required name field is missing', async () => {
      // Arrange
      const incompleteData = {
        description: 'Event without name'
      };

      // Act & Assert
      await expect(EventType.create(incompleteData))
        .rejects.toThrow('Event type name is required');
    });

    it('should enforce unique constraint on name field', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Christmas'
      };
      
      await EventType.create(eventTypeData);

      // Act & Assert
      await expect(EventType.create(eventTypeData))
        .rejects.toThrow();
    });

    it('should allow multiple event types with different names', async () => {
      // Arrange
      const eventType1Data = { name: 'Birthday' };
      const eventType2Data = { name: 'Anniversary' };

      // Act
      const eventType1 = await EventType.create(eventType1Data);
      const eventType2 = await EventType.create(eventType2Data);

      // Assert
      expect(eventType1.name).toBe('Birthday');
      expect(eventType2.name).toBe('Anniversary');
      expect(eventType1._id).not.toEqual(eventType2._id);
    });

    it('should set default values correctly', async () => {
      // Arrange
      const eventTypeData = {
        name: 'New Year'
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType.isCustom).toBe(false);
      expect(eventType.createdAt).toBeDefined();
      expect(eventType.updatedAt).toBeDefined();
      expect(eventType.createdAt).toEqual(eventType.updatedAt);
    });

    it('should allow optional description field', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Graduation',
        description: 'Educational milestone celebration'
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType.description).toBe('Educational milestone celebration');
    });

    it('should work without description field', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Holiday'
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType.description).toBeUndefined();
      expect(eventType.name).toBe('Holiday');
    });
  });

  describe('Pre-validate Hook', () => {
    it('should require createdBy when isCustom is true', async () => {
      // Arrange
      const customEventTypeData = {
        name: 'Custom Event',
        isCustom: true
        // Missing createdBy field
      };

      // Act & Assert
      await expect(EventType.create(customEventTypeData))
        .rejects.toThrow('CreatedBy field is required for custom event types');
    });

    it('should not require createdBy when isCustom is false', async () => {
      // Arrange
      const standardEventTypeData = {
        name: 'Standard Event',
        isCustom: false
        // No createdBy field needed
      };

      // Act
      const eventType = await EventType.create(standardEventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.isCustom).toBe(false);
      expect(eventType.createdBy).toBeUndefined();
    });

    it('should not require createdBy when isCustom is not specified (defaults to false)', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Default Event'
        // isCustom defaults to false, no createdBy needed
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.isCustom).toBe(false);
      expect(eventType.createdBy).toBeUndefined();
    });

    it('should allow createdBy when isCustom is true', async () => {
      // Arrange
      const customEventTypeData = {
        name: 'User Custom Event',
        isCustom: true,
        createdBy: testUser
      };

      // Act
      const eventType = await EventType.create(customEventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.isCustom).toBe(true);
      expect(eventType.createdBy).toEqual(testUser);
    });

    it('should validate even when createdBy is provided but isCustom is false', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Standard Event with Creator',
        isCustom: false,
        createdBy: testUser // This should be allowed
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.isCustom).toBe(false);
      expect(eventType.createdBy).toEqual(testUser);
    });

    it('should handle explicit isCustom false with missing createdBy', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Explicit Standard Event',
        isCustom: false
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.isCustom).toBe(false);
      expect(eventType.createdBy).toBeUndefined();
    });
  });

  describe('Timestamps', () => {
    it('should automatically set createdAt and updatedAt on creation', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Timestamp Test Event'
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType.createdAt).toBeDefined();
      expect(eventType.updatedAt).toBeDefined();
      expect(eventType.createdAt).toBeInstanceOf(Date);
      expect(eventType.updatedAt).toBeInstanceOf(Date);
    });

    it('should update updatedAt field when document is modified', async () => {
      // Arrange
      const eventType = await EventType.create({
        name: 'Update Test Event'
      });
      
      const originalUpdatedAt = eventType.updatedAt;
      
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act
      eventType.description = 'Updated description';
      await eventType.save();

      // Assert
      expect(eventType.updatedAt).toBeDefined();
      expect(eventType.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      expect(eventType.createdAt).toEqual(eventType.createdAt); // createdAt should not change
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid ObjectId for createdBy field', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Invalid Creator Event',
        isCustom: true,
        createdBy: 'invalid-object-id'
      };

      // Act & Assert
      await expect(EventType.create(eventTypeData))
        .rejects.toThrow();
    });

    it('should handle empty string for required name field', async () => {
      // Arrange
      const eventTypeData = {
        name: ''
      };

      // Act & Assert
      await expect(EventType.create(eventTypeData))
        .rejects.toThrow('Event type name is required');
    });

    it('should handle null value for name field', async () => {
      // Arrange
      const eventTypeData = {
        name: null
      };

      // Act & Assert
      await expect(EventType.create(eventTypeData))
        .rejects.toThrow('Event type name is required');
    });

    it('should handle duplicate names case-sensitively', async () => {
      // Arrange
      await EventType.create({ name: 'Birthday' });

      const duplicateEventTypeData = {
        name: 'birthday' // Different case - should be allowed
      };

      // Act
      const eventType = await EventType.create(duplicateEventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.name).toBe('birthday');
    });
  });

  describe('Edge Cases', () => {
    it('accepts names up to 50 characters and refuses longer ones', async () => {
      const longest = await EventType.create({ name: 'A'.repeat(50) });
      expect(longest.name).toBe('A'.repeat(50));
      await expect(EventType.create({ name: 'B'.repeat(51) }))
        .rejects.toThrow('Event type names can be at most 50 characters');
    });

    it('should handle very long descriptions', async () => {
      // Arrange
      const longDescription = 'Description '.repeat(1000);
      const eventTypeData = {
        name: 'Long Description Event',
        description: longDescription
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.description).toBe(longDescription);
    });

    it('should handle special characters in name and description', async () => {
      // Arrange
      const eventTypeData = {
        name: 'Special Event!@#$%^&*()',
        description: 'Description with émojis 🎉 and spëcial chärs'
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.name).toBe('Special Event!@#$%^&*()');
      expect(eventType.description).toBe('Description with émojis 🎉 and spëcial chärs');
    });

    it('should maintain data integrity with concurrent creates', async () => {
      // Arrange
      const eventTypeData1 = { name: 'Concurrent Event 1' };
      const eventTypeData2 = { name: 'Concurrent Event 2' };

      // Act
      const [eventType1, eventType2] = await Promise.all([
        EventType.create(eventTypeData1),
        EventType.create(eventTypeData2)
      ]);

      // Assert
      expect(eventType1).toBeDefined();
      expect(eventType2).toBeDefined();
      expect(eventType1.name).toBe('Concurrent Event 1');
      expect(eventType2.name).toBe('Concurrent Event 2');
      expect(eventType1._id).not.toEqual(eventType2._id);
    });
  });

  describe('Model Reference Integrity', () => {
    it('should accept valid ObjectId for createdBy field', async () => {
      // Arrange
      const validObjectId = new mongoose.Types.ObjectId();
      const eventTypeData = {
        name: 'Valid Reference Event',
        isCustom: true,
        createdBy: validObjectId
      };

      // Act
      const eventType = await EventType.create(eventTypeData);

      // Assert
      expect(eventType).toBeDefined();
      expect(eventType.createdBy).toEqual(validObjectId);
      expect(eventType.createdBy).toBeInstanceOf(mongoose.Types.ObjectId);
    });

    it('should store ObjectId reference correctly for createdBy field', async () => {
      // Arrange
      const eventType = await EventType.create({
        name: 'Reference Test Event',
        isCustom: true,
        createdBy: testUser
      });

      // Act
      const foundEventType = await EventType.findById(eventType._id);

      // Assert
      expect(foundEventType).toBeDefined();
      expect(foundEventType.createdBy).toEqual(testUser);
      expect(foundEventType.createdBy.toString()).toBe(testUser.toString());
    });
  });
});
