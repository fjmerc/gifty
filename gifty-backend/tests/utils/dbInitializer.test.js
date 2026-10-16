const dbInitializer = require('../../utils/dbInitializer');

// Mock dependencies
const EventType = require('../../models/EventType');
const Holiday = require('../../models/Holiday');
const logger = require('../../utils/logger');

jest.mock('../../models/EventType');
jest.mock('../../models/Holiday');
jest.mock('../../utils/logger');

describe('Database Initializer Utility', () => {
  beforeEach(() => {
    // Reset all mocks to clear both call history AND mock implementations
    jest.resetAllMocks();
  });

  afterEach(() => {
    // Restore all mocks after each test
    jest.restoreAllMocks();
  });

  describe('Utility Structure', () => {
    it('should export all required database initialization functions', () => {
      // Arrange & Act & Assert
      expect(typeof dbInitializer.seedEventTypes).toBe('function');
      expect(typeof dbInitializer.seedHolidays).toBe('function');
      expect(typeof dbInitializer.initializeDatabase).toBe('function');
    });

    it('should have seedEventTypes with correct signature', () => {
      // Arrange & Act & Assert
      expect(dbInitializer.seedEventTypes).toBeDefined();
      expect(dbInitializer.seedEventTypes.length).toBe(0); // no parameters
    });

    it('should have seedHolidays with correct signature', () => {
      // Arrange & Act & Assert
      expect(dbInitializer.seedHolidays).toBeDefined();
      expect(dbInitializer.seedHolidays.length).toBe(0); // no parameters
    });

    it('should have initializeDatabase with correct signature', () => {
      // Arrange & Act & Assert
      expect(dbInitializer.initializeDatabase).toBeDefined();
      expect(dbInitializer.initializeDatabase.length).toBe(0); // no parameters
    });

    it('should export an object with the expected structure', () => {
      // Arrange & Act & Assert
      expect(typeof dbInitializer).toBe('object');
      expect(Object.keys(dbInitializer).sort()).toEqual(['HOLIDAY_COUNTRIES', 'initializeDatabase', 'seedEventTypes', 'seedHolidays']);
    });
  });

  describe('seedEventTypes Function', () => {
    describe('Happy Path - No Existing Event Types (Seeding Scenario)', () => {
      it('should seed 27 event types when none exist', async () => {
        // Arrange
        EventType.countDocuments.mockResolvedValue(0);
        EventType.insertMany.mockResolvedValue([]);
        logger.info.mockImplementation(() => {});

        // Act
        const result = await dbInitializer.seedEventTypes();

        // Assert
        expect(EventType.countDocuments).toHaveBeenCalledTimes(1);
        expect(EventType.insertMany).toHaveBeenCalledTimes(1);
        expect(EventType.insertMany).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'Birthday',
              description: expect.any(String),
              isCustom: false
            }),
            expect.objectContaining({
              name: 'Anniversary',
              description: expect.any(String),
              isCustom: false
            })
          ])
        );
        expect(result).toBe(27);
      });

      it('should log appropriate messages when seeding event types', async () => {
        // Arrange
        EventType.countDocuments.mockResolvedValue(0);
        EventType.insertMany.mockResolvedValue([]);
        logger.info.mockImplementation(() => {});

        // Act
        await dbInitializer.seedEventTypes();

        // Assert
        expect(logger.info).toHaveBeenCalledWith('No event types found, seeding default event types...');
        expect(logger.info).toHaveBeenCalledWith('Successfully seeded 27 event types');
      });

      it('should seed all 27 required event types with correct structure', async () => {
        // Arrange
        EventType.countDocuments.mockResolvedValue(0);
        EventType.insertMany.mockResolvedValue([]);
        logger.info.mockImplementation(() => {});

        // Act
        await dbInitializer.seedEventTypes();

        // Assert
        const insertedEventTypes = EventType.insertMany.mock.calls[0][0];
        expect(insertedEventTypes).toHaveLength(27);
        
        // Check specific event types are included
        const eventTypeNames = insertedEventTypes.map(et => et.name);
        expect(eventTypeNames).toContain('Birthday');
        expect(eventTypeNames).toContain('Wedding');
        expect(eventTypeNames).toContain('Christmas');
        expect(eventTypeNames).toContain('Graduation');
        expect(eventTypeNames).toContain('Friendship Day');
        
        // Check all have correct structure
        insertedEventTypes.forEach(eventType => {
          expect(eventType).toHaveProperty('name');
          expect(eventType).toHaveProperty('description');
          expect(eventType).toHaveProperty('isCustom', false);
          expect(typeof eventType.name).toBe('string');
          expect(typeof eventType.description).toBe('string');
        });
      });
    });

    describe('Existing Event Types Scenario (Update Logic)', () => {
      it('should not seed when event types already exist', async () => {
        // Arrange
        EventType.countDocuments.mockResolvedValue(5);
        EventType.updateMany.mockResolvedValue({ modifiedCount: 3 });
        logger.info.mockImplementation(() => {});

        // Act
        const result = await dbInitializer.seedEventTypes();

        // Assert
        expect(EventType.countDocuments).toHaveBeenCalledTimes(1);
        expect(EventType.insertMany).not.toHaveBeenCalled();
        expect(result).toBe(0);
      });

      it('should update existing system event types with isCustom flag', async () => {
        // Arrange
        EventType.countDocuments.mockResolvedValue(10);
        EventType.updateMany.mockResolvedValue({ modifiedCount: 8 });
        logger.info.mockImplementation(() => {});

        // Act
        await dbInitializer.seedEventTypes();

        // Assert
        expect(EventType.updateMany).toHaveBeenCalledTimes(1);
        expect(EventType.updateMany).toHaveBeenCalledWith(
          { 
            name: { 
              $in: expect.arrayContaining([
                'Birthday', 'Anniversary', 'Wedding', 'Christmas'
              ])
            },
            createdBy: null
          },
          { $set: { isCustom: false } }
        );
      });

      it('should log appropriate messages when updating existing event types', async () => {
        // Arrange
        EventType.countDocuments.mockResolvedValue(15);
        EventType.updateMany.mockResolvedValue({ modifiedCount: 12 });
        logger.info.mockImplementation(() => {});

        // Act
        await dbInitializer.seedEventTypes();

        // Assert
        expect(logger.info).toHaveBeenCalledWith('Event types already exist (15 found). No seeding needed.');
        expect(logger.info).toHaveBeenCalledWith('Updated existing system event types with isCustom flag.');
      });
    });

    describe('Error Handling', () => {
      it('should handle countDocuments errors gracefully', async () => {
        // Arrange
        const error = new Error('Database connection failed');
        EventType.countDocuments.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.seedEventTypes()).rejects.toThrow('Database connection failed');
        expect(logger.error).toHaveBeenCalledWith('Error seeding event types:', error);
      });

      it('should handle insertMany errors gracefully', async () => {
        // Arrange
        const error = new Error('Insert operation failed');
        EventType.countDocuments.mockResolvedValue(0);
        EventType.insertMany.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.seedEventTypes()).rejects.toThrow('Insert operation failed');
        expect(logger.error).toHaveBeenCalledWith('Error seeding event types:', error);
      });

      it('should handle updateMany errors gracefully', async () => {
        // Arrange
        const error = new Error('Update operation failed');
        EventType.countDocuments.mockResolvedValue(5);
        EventType.updateMany.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.seedEventTypes()).rejects.toThrow('Update operation failed');
        expect(logger.error).toHaveBeenCalledWith('Error seeding event types:', error);
      });
    });
  });

  describe('seedHolidays Function', () => {
    // Mock data factory for Holiday event type
    const mockHolidayEventType = {
      _id: 'holiday-event-type-id-123',
      name: 'Holiday',
      description: 'Official holidays and observances',
      isCustom: false
    };

    describe('Happy Path - No Existing Holidays (Seeding Scenario)', () => {
      it('should seed 26 holidays when none exist and Holiday event type exists', async () => {
        // Arrange
        Holiday.countDocuments.mockResolvedValue(0);
        EventType.findOne.mockResolvedValue(mockHolidayEventType);
        Holiday.insertMany.mockResolvedValue([]);
        logger.info.mockImplementation(() => {});

        // Act
        const result = await dbInitializer.seedHolidays();

        // Assert
        expect(Holiday.countDocuments).toHaveBeenCalledTimes(1);
        expect(EventType.findOne).toHaveBeenCalledWith({ name: 'Holiday', createdBy: null });
        expect(Holiday.insertMany).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ created: 26, skipped: 0 });
      });

      it('should create Holiday event type when it does not exist', async () => {
        // Arrange
        Holiday.countDocuments.mockResolvedValue(0);
        EventType.findOne.mockResolvedValue(null);
        EventType.create.mockResolvedValue(mockHolidayEventType);
        Holiday.insertMany.mockResolvedValue([]);
        logger.info.mockImplementation(() => {});

        // Act
        await dbInitializer.seedHolidays();

        // Assert
        expect(EventType.findOne).toHaveBeenCalledWith({ name: 'Holiday', createdBy: null });
        expect(EventType.create).toHaveBeenCalledWith({
          name: 'Holiday',
          description: 'Official holidays and observances',
          isCustom: false
        });
        expect(logger.info).toHaveBeenCalledWith('Created Holiday event type');
      });

      it('should process holidays with current year date calculations', async () => {
        // Arrange
        Holiday.countDocuments.mockResolvedValue(0);
        EventType.findOne.mockResolvedValue(mockHolidayEventType);
        Holiday.insertMany.mockResolvedValue([]);
        logger.info.mockImplementation(() => {});
        
        const currentYear = new Date().getFullYear();

        // Act
        await dbInitializer.seedHolidays();

        // Assert
        const insertedHolidays = Holiday.insertMany.mock.calls[0][0];
        expect(insertedHolidays).toHaveLength(26);
        
        // Check date processing
        insertedHolidays.forEach(holiday => {
          expect(holiday).toHaveProperty('date');
          expect(holiday.date).toBeInstanceOf(Date);
          expect(holiday.date.getFullYear()).toBe(currentYear);
          expect(holiday.eventType).toBe(mockHolidayEventType._id);
        });
      });

      it('should include both US and German holidays with correct country codes', async () => {
        // Arrange
        Holiday.countDocuments.mockResolvedValue(0);
        EventType.findOne.mockResolvedValue(mockHolidayEventType);
        Holiday.insertMany.mockResolvedValue([]);
        logger.info.mockImplementation(() => {});

        // Act
        await dbInitializer.seedHolidays();

        // Assert
        const insertedHolidays = Holiday.insertMany.mock.calls[0][0];
        
        // Check for US holidays
        const usHolidays = insertedHolidays.filter(h => h.countryCode === 'US');
        const deHolidays = insertedHolidays.filter(h => h.countryCode === 'DE');
        
        expect(usHolidays.length).toBeGreaterThan(0);
        expect(deHolidays.length).toBeGreaterThan(0);
        
        // Check specific holidays exist
        const holidayNames = insertedHolidays.map(h => h.name);
        expect(holidayNames).toContain("New Year's Day");
        expect(holidayNames).toContain('Independence Day');
        expect(holidayNames).toContain('Christmas Day');
        expect(holidayNames).toContain('Neujahrstag');
        expect(holidayNames).toContain('Tag der Deutschen Einheit');
        expect(holidayNames).toContain('Weihnachten');
      });

      it('should log appropriate messages when seeding holidays', async () => {
        // Arrange
        Holiday.countDocuments.mockResolvedValue(0);
        EventType.findOne.mockResolvedValue(mockHolidayEventType);
        Holiday.insertMany.mockResolvedValue([]);
        logger.info.mockImplementation(() => {});

        // Act
        await dbInitializer.seedHolidays();

        // Assert
        expect(logger.info).toHaveBeenCalledWith('No holidays found, seeding default holidays...');
        expect(logger.info).toHaveBeenCalledWith('Successfully seeded 26 holidays');
      });
    });

    describe('Existing Holidays Scenario (Definitions Update)', () => {
      it('updates stored definitions instead of inserting a second set', async () => {
        Holiday.countDocuments.mockResolvedValue(26);
        EventType.findOne.mockResolvedValue(mockHolidayEventType);
        Holiday.bulkWrite.mockResolvedValue({ upsertedCount: 0, modifiedCount: 11 });

        const result = await dbInitializer.seedHolidays();

        expect(Holiday.insertMany).not.toHaveBeenCalled();
        expect(result).toEqual({ created: 0, updated: 11, skipped: 15 });
        const ops = Holiday.bulkWrite.mock.calls[0][0];
        expect(ops).toHaveLength(26);
        const thanksgiving = ops.find((op) => op.updateOne.filter.name === 'Thanksgiving').updateOne;
        expect(thanksgiving).toMatchObject({
          filter: { name: 'Thanksgiving', countryCode: 'US' },
          update: { $set: { hasFixedDate: false, formula: 'nth-weekday:11:4:4' } },
          upsert: true
        });
        const christmas = ops.find((op) => op.updateOne.filter.name === 'Christmas Day').updateOne;
        // The list also sets each stored category (DE public holidays moved in 2026-10)
        expect(christmas.update.$set).toEqual({ hasFixedDate: true, formula: null, category: 'religious' });
      });

      it('logs only when something changed', async () => {
        Holiday.countDocuments.mockResolvedValue(26);
        EventType.findOne.mockResolvedValue(mockHolidayEventType);
        Holiday.bulkWrite.mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 });

        await dbInitializer.seedHolidays();
        expect(logger.info).not.toHaveBeenCalled();

        Holiday.bulkWrite.mockResolvedValue({ upsertedCount: 2, modifiedCount: 11 });
        await dbInitializer.seedHolidays();
        expect(logger.info).toHaveBeenCalledWith('Holidays: 2 added, 11 definitions updated');
      });
    });

    describe('Error Handling', () => {
      it('should handle countDocuments errors gracefully', async () => {
        // Arrange
        const error = new Error('Database connection failed');
        Holiday.countDocuments.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.seedHolidays()).rejects.toThrow('Database connection failed');
        expect(logger.error).toHaveBeenCalledWith('Error seeding holidays:', error);
      });

      it('should handle EventType.findOne errors gracefully', async () => {
        // Arrange
        const error = new Error('EventType query failed');
        Holiday.countDocuments.mockResolvedValue(0);
        EventType.findOne.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.seedHolidays()).rejects.toThrow('EventType query failed');
        expect(logger.error).toHaveBeenCalledWith('Error seeding holidays:', error);
      });

      it('should handle EventType.create errors gracefully', async () => {
        // Arrange
        const error = new Error('EventType creation failed');
        Holiday.countDocuments.mockResolvedValue(0);
        EventType.findOne.mockResolvedValue(null);
        EventType.create.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.seedHolidays()).rejects.toThrow('EventType creation failed');
        expect(logger.error).toHaveBeenCalledWith('Error seeding holidays:', error);
      });

      it('should handle Holiday.insertMany errors gracefully', async () => {
        // Arrange
        const error = new Error('Holiday insert failed');
        Holiday.countDocuments.mockResolvedValue(0);
        EventType.findOne.mockResolvedValue(mockHolidayEventType);
        Holiday.insertMany.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.seedHolidays()).rejects.toThrow('Holiday insert failed');
        expect(logger.error).toHaveBeenCalledWith('Error seeding holidays:', error);
      });
    });
  });

  describe('initializeDatabase Function', () => {
    const mockEventTypesResult = 27;
    const mockHolidaysResult = { created: 26, skipped: 0 };

    // Use spies to mock the internal function calls
    let seedEventTypesSpy;
    let seedHolidaysSpy;

    beforeEach(() => {
      // Create spies on the actual module exports
      seedEventTypesSpy = jest.spyOn(dbInitializer, 'seedEventTypes');
      seedHolidaysSpy = jest.spyOn(dbInitializer, 'seedHolidays');
    });

    afterEach(() => {
      // Restore the spies after each test
      seedEventTypesSpy.mockRestore();
      seedHolidaysSpy.mockRestore();
    });

    describe('Successful Initialization', () => {
      it('should successfully initialize both event types and holidays', async () => {
        // Arrange
        seedEventTypesSpy.mockResolvedValue(mockEventTypesResult);
        seedHolidaysSpy.mockResolvedValue(mockHolidaysResult);
        logger.info.mockImplementation(() => {});

        // Act
        const result = await dbInitializer.initializeDatabase();

        // Assert
        expect(seedEventTypesSpy).toHaveBeenCalledTimes(1);
        expect(seedHolidaysSpy).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
          eventTypesSeeded: mockEventTypesResult,
          holidaysSeeded: mockHolidaysResult
        });
        expect(logger.info).toHaveBeenCalledWith('Database initialization completed successfully');
      });

      it('should call functions in correct sequence', async () => {
        // Arrange
        const callOrder = [];
        seedEventTypesSpy.mockImplementation(async () => {
          callOrder.push('seedEventTypes');
          return mockEventTypesResult;
        });
        seedHolidaysSpy.mockImplementation(async () => {
          callOrder.push('seedHolidays');
          return mockHolidaysResult;
        });
        logger.info.mockImplementation(() => {});

        // Act
        await dbInitializer.initializeDatabase();

        // Assert
        expect(callOrder).toEqual(['seedEventTypes', 'seedHolidays']);
      });

      it('should handle mixed success scenarios correctly', async () => {
        // Arrange
        const zeroEventTypes = 0; // No event types seeded (already exist)
        const holidaysSeeded = { created: 26, skipped: 0 };
        
        seedEventTypesSpy.mockResolvedValue(zeroEventTypes);
        seedHolidaysSpy.mockResolvedValue(holidaysSeeded);
        logger.info.mockImplementation(() => {});

        // Act
        const result = await dbInitializer.initializeDatabase();

        // Assert
        expect(result).toEqual({
          eventTypesSeeded: zeroEventTypes,
          holidaysSeeded: holidaysSeeded
        });
      });
    });

    describe('Error Handling and Propagation', () => {
      it('should handle seedEventTypes errors gracefully', async () => {
        // Arrange
        const error = new Error('Event types seeding failed');
        seedEventTypesSpy.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.initializeDatabase()).rejects.toThrow('Event types seeding failed');
        expect(logger.error).toHaveBeenCalledWith('Database initialization failed:', error);
      });

      it('should handle seedHolidays errors gracefully', async () => {
        // Arrange
        const error = new Error('Holidays seeding failed');
        seedEventTypesSpy.mockResolvedValue(mockEventTypesResult);
        seedHolidaysSpy.mockRejectedValue(error);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.initializeDatabase()).rejects.toThrow('Holidays seeding failed');
        expect(logger.error).toHaveBeenCalledWith('Database initialization failed:', error);
      });

      it('should not call seedHolidays if seedEventTypes fails', async () => {
        // Arrange
        const error = new Error('Event types failed');
        seedEventTypesSpy.mockRejectedValue(error);
        seedHolidaysSpy.mockResolvedValue(mockHolidaysResult);
        logger.error.mockImplementation(() => {});

        // Act & Assert
        await expect(dbInitializer.initializeDatabase()).rejects.toThrow('Event types failed');
        expect(seedEventTypesSpy).toHaveBeenCalledTimes(1);
        expect(seedHolidaysSpy).not.toHaveBeenCalled();
      });
    });

    describe('Result Aggregation', () => {
      it('should correctly aggregate results from both seeding functions', async () => {
        // Arrange
        const eventTypesCount = 15;
        const holidaysResult = { created: 20, skipped: 6 };
        
        seedEventTypesSpy.mockResolvedValue(eventTypesCount);
        seedHolidaysSpy.mockResolvedValue(holidaysResult);
        logger.info.mockImplementation(() => {});

        // Act
        const result = await dbInitializer.initializeDatabase();

        // Assert
        expect(result).toEqual({
          eventTypesSeeded: eventTypesCount,
          holidaysSeeded: holidaysResult
        });
        expect(typeof result.eventTypesSeeded).toBe('number');
        expect(typeof result.holidaysSeeded).toBe('object');
        expect(result.holidaysSeeded).toHaveProperty('created');
        expect(result.holidaysSeeded).toHaveProperty('skipped');
      });

      it('should handle zero results correctly', async () => {
        // Arrange
        const noEventTypes = 0;
        const noHolidays = { created: 0, skipped: 10 };
        
        seedEventTypesSpy.mockResolvedValue(noEventTypes);
        seedHolidaysSpy.mockResolvedValue(noHolidays);
        logger.info.mockImplementation(() => {});

        // Act
        const result = await dbInitializer.initializeDatabase();

        // Assert
        expect(result).toEqual({
          eventTypesSeeded: 0,
          holidaysSeeded: { created: 0, skipped: 10 }
        });
      });
    });
  });
});
