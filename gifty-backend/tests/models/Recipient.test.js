const mongoose = require('mongoose');
const Recipient = require('../../models/Recipient');
const User = require('../../models/User');
const Gift = require('../../models/Gift');
const Event = require('../../models/Event');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');
const logger = require('../../utils/logger');

// Mock logger.debug to test logging middleware
const originalLog = logger.debug;
const mockLog = jest.fn();

// Mock logger.error for error logging
const originalError = logger.error;
const mockError = jest.fn();

// Set timeout for database operations
jest.setTimeout(30000);

describe('Recipient Model Tests', () => {
  let testUser;

  beforeAll(async () => {
    await setupTestDB();
    logger.debug = mockLog;
    logger.error = mockError;
  });

  afterAll(async () => {
    logger.debug = originalLog;
    logger.error = originalError;
    await teardownTestDB();
  });

  beforeEach(async () => {
    await clearDatabase();
    mockLog.mockClear();
    mockError.mockClear();
    
    // Create test user
    testUser = new User({
      username: 'testuser',
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User'
    });
    await testUser.save();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  // Helper function to create valid recipient data
  const createValidRecipientData = (overrides = {}) => ({
    user: testUser._id,
    firstName: 'John',
    lastName: 'Doe',
    relation: 'Brother',
    relationship: 'family',
    birthdate: new Date('1990-05-15'),
    giftStatus: 'active',
    address: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      country: 'USA'
    },
    ...overrides
  });

  describe('Schema Validation - Required Fields', () => {
    test('should create recipient with all required fields', async () => {
      const recipientData = createValidRecipientData();
      const recipient = await Recipient.create(recipientData);

      expect(recipient).toBeDefined();
      expect(recipient.user).toEqual(testUser._id);
      expect(recipient.firstName).toBe('John');
      expect(recipient.lastName).toBe('Doe');
      expect(recipient.relation).toBe('Brother');
      expect(recipient.relationship).toBe('family');
      expect(recipient.birthdate).toEqual(new Date('1990-05-15'));
    });

    test('should fail validation when user is missing', async () => {
      const recipientData = createValidRecipientData();
      delete recipientData.user;

      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should fail validation when firstName is missing', async () => {
      const recipientData = createValidRecipientData();
      delete recipientData.firstName;

      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should fail validation when lastName is missing', async () => {
      const recipientData = createValidRecipientData();
      delete recipientData.lastName;

      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should fail validation when relation is missing', async () => {
      const recipientData = createValidRecipientData();
      delete recipientData.relation;

      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should use default relationship when missing', async () => {
      const recipientData = createValidRecipientData();
      delete recipientData.relationship;

      const recipient = await Recipient.create(recipientData);
      expect(recipient.relationship).toBe('acquaintance'); // Default value
    });

    test('should fail validation when birthdate is missing', async () => {
      const recipientData = createValidRecipientData();
      delete recipientData.birthdate;

      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });
  });

  describe('Schema Validation - Enum Fields', () => {
    test('should accept valid relationship values', async () => {
      const validValues = ['family', 'romantic', 'friendship', 'professional', 'community', 'online', 'situational', 'service', 'acquaintance', 'rival', 'platonic'];
      
      for (const value of validValues) {
        const recipientData = createValidRecipientData({ relationship: value });
        const recipient = await Recipient.create(recipientData);
        expect(recipient.relationship).toBe(value);
        await recipient.deleteOne();
      }
    });

    test('should reject invalid relationship values', async () => {
      const recipientData = createValidRecipientData({ relationship: 'invalid' });
      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should accept valid giftStatus values', async () => {
      const validValues = ['active', 'inactive', 'paused', 'seasonal'];
      
      for (const value of validValues) {
        const recipientData = createValidRecipientData({ giftStatus: value });
        const recipient = await Recipient.create(recipientData);
        expect(recipient.giftStatus).toBe(value);
        await recipient.deleteOne();
      }
    });

    test('should reject invalid giftStatus values', async () => {
      const recipientData = createValidRecipientData({ giftStatus: 'invalid' });
      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should accept valid relationshipCloseness values', async () => {
      const validValues = ['very close', 'close', 'neutral', 'distant', 'very distant'];
      
      for (const value of validValues) {
        const recipientData = createValidRecipientData({ relationshipCloseness: value });
        const recipient = await Recipient.create(recipientData);
        expect(recipient.relationshipCloseness).toBe(value);
        await recipient.deleteOne();
      }
    });

    test('should accept valid giftPreferences values', async () => {
      const validValues = ['practical', 'sentimental', 'experiential', 'luxury', 'handmade'];
      
      for (const value of validValues) {
        const recipientData = createValidRecipientData({ giftPreferences: value });
        const recipient = await Recipient.create(recipientData);
        expect(recipient.giftPreferences).toBe(value);
        await recipient.deleteOne();
      }
    });

    test('should accept valid personalityTraits values', async () => {
      const validValues = ['introverted', 'extroverted', 'analytical', 'creative', 'adventurous', 'cautious', 'organized', 'spontaneous'];
      
      const recipientData = createValidRecipientData({ personalityTraits: validValues });
      const recipient = await Recipient.create(recipientData);
      expect(recipient.personalityTraits).toEqual(validValues);
    });

    test('should reject invalid personalityTraits values', async () => {
      const recipientData = createValidRecipientData({ personalityTraits: ['invalid'] });
      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });
  });

  describe('Schema Validation - Default Values', () => {
    test('should set default values correctly', async () => {
      const recipientData = {
        user: testUser._id,
        firstName: 'Jane',
        lastName: 'Smith',
        relation: 'Sister',
        relationship: 'family',
        birthdate: new Date('1985-08-20')
      };

      const recipient = await Recipient.create(recipientData);

      expect(recipient.isSelf).toBe(false);
      expect(recipient.isSystemAccount).toBe(false);
      expect(recipient.profilePicture).toBe('');
      expect(recipient.relationship).toBe('family');
      expect(recipient.giftStatus).toBe('inactive');
      expect(recipient.visibility).toBe(true);
      expect(recipient.relationshipCloseness).toBe('neutral');
      expect(recipient.giftPreferences).toBe('practical');
    });
  });

  describe('Schema Validation - Conditional Address Requirements', () => {
    test('should require address fields when giftStatus is active', async () => {
      const recipientData = createValidRecipientData({ giftStatus: 'active' });
      delete recipientData.address;

      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should not require address fields when giftStatus is inactive', async () => {
      const recipientData = createValidRecipientData({ giftStatus: 'inactive' });
      delete recipientData.address;

      const recipient = await Recipient.create(recipientData);
      expect(recipient.giftStatus).toBe('inactive');
      // Address is created as an empty object even when not required
      expect(recipient.address).toBeDefined();
      // The address fields should not be set when giftStatus is inactive
      expect(recipient.address.street).toBeUndefined();
      expect(recipient.address.city).toBeUndefined();
    });

    test('should not require address fields when giftStatus is paused', async () => {
      const recipientData = createValidRecipientData({ giftStatus: 'paused' });
      delete recipientData.address;

      const recipient = await Recipient.create(recipientData);
      expect(recipient.giftStatus).toBe('paused');
    });

    test('should not require address fields when giftStatus is seasonal', async () => {
      const recipientData = createValidRecipientData({ giftStatus: 'seasonal' });
      delete recipientData.address;

      const recipient = await Recipient.create(recipientData);
      expect(recipient.giftStatus).toBe('seasonal');
    });
  });

  describe('Virtual Properties - Age Calculation', () => {
    test('should calculate age correctly before birthday this year', async () => {
      // Set birthdate to future date this year
      const today = new Date();
      const futureDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
      const recipientData = createValidRecipientData({ birthdate: new Date(futureDate.getFullYear() - 25, futureDate.getMonth(), futureDate.getDate()) });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.age).toBe(24); // Should be 24 because birthday hasn't occurred yet this year
    });

    test('should calculate age correctly after birthday this year', async () => {
      // Set birthdate to past date this year
      const today = new Date();
      const pastDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
      const recipientData = createValidRecipientData({ birthdate: new Date(pastDate.getFullYear() - 30, pastDate.getMonth(), pastDate.getDate()) });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.age).toBe(30); // Should be 30 because birthday has already occurred this year
    });

    test('should calculate age correctly on exact birthday', async () => {
      const today = new Date();
      const recipientData = createValidRecipientData({ birthdate: new Date(today.getFullYear() - 35, today.getMonth(), today.getDate()) });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.age).toBe(35);
    });

    test('should handle leap year birthdate', async () => {
      const recipientData = createValidRecipientData({ birthdate: new Date('1992-02-29') }); // Leap year
      const recipient = await Recipient.create(recipientData);
      
      expect(typeof recipient.age).toBe('number');
      expect(recipient.age).toBeGreaterThan(0);
    });

    test('should return null for missing birthdate', async () => {
      const recipientData = createValidRecipientData();
      const recipient = new Recipient(recipientData);
      recipient.birthdate = null;
      
      expect(recipient.age).toBeNull();
    });
  });

  describe('Pre-validation Middleware - Budget Validation', () => {
    test('should pass validation when minimum <= maximum budget', async () => {
      const recipientData = createValidRecipientData({
        minimumPriceBudget: 50,
        maximumPriceBudget: 200
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.minimumPriceBudget).toBe(50);
      expect(recipient.maximumPriceBudget).toBe(200);
    });

    test('should pass validation when budgets are equal', async () => {
      const recipientData = createValidRecipientData({
        minimumPriceBudget: 100,
        maximumPriceBudget: 100
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.minimumPriceBudget).toBe(100);
      expect(recipient.maximumPriceBudget).toBe(100);
    });

    test('should fail validation when minimum > maximum budget', async () => {
      const recipientData = createValidRecipientData({
        minimumPriceBudget: 200,
        maximumPriceBudget: 100
      });

      await expect(Recipient.create(recipientData)).rejects.toThrow('Minimum price cannot be greater than maximum price');
    });

    test('should pass validation when budget fields are undefined', async () => {
      const recipientData = createValidRecipientData();
      delete recipientData.minimumPriceBudget;
      delete recipientData.maximumPriceBudget;

      const recipient = await Recipient.create(recipientData);
      expect(recipient.minimumPriceBudget).toBeUndefined();
      expect(recipient.maximumPriceBudget).toBeUndefined();
    });
  });

  describe('Pre-save Middleware - Timestamp Update', () => {
    test('should update updatedAt timestamp on save', async () => {
      const recipientData = createValidRecipientData();
      const recipient = await Recipient.create(recipientData);
      const initialTimestamp = recipient.updatedAt;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      recipient.firstName = 'UpdatedName';
      await recipient.save();

      expect(recipient.updatedAt.getTime()).toBeGreaterThan(initialTimestamp.getTime());
    });

    test('should set updatedAt on new document creation', async () => {
      const recipientData = createValidRecipientData();
      const recipient = await Recipient.create(recipientData);

      expect(recipient.updatedAt).toBeDefined();
      expect(recipient.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Pre-save Middleware - Data Sanitization', () => {
    test('should trim whitespace from firstName and lastName', async () => {
      const recipientData = createValidRecipientData({
        firstName: '  John  ',
        lastName: '  Doe  '
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.firstName).toBe('John');
      expect(recipient.lastName).toBe('Doe');
    });

    test('should trim whitespace from address fields and keep the typed city and state', async () => {
      const recipientData = createValidRecipientData({
        address: {
          street: '  456 Oak Ave  ',
          city: '  Los Angeles  ',
          state: '  CA  ',
          zipCode: '  90210  ',
          country: '  USA  '
        }
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.address.street).toBe('456 Oak Ave');
      expect(recipient.address.zipCode).toBe('90210');
      expect(recipient.address.country).toBe('USA');
      expect(recipient.address.city).toBe('Los Angeles');
      expect(recipient.address.state).toBe('CA');
    });

    test('should handle missing address fields gracefully', async () => {
      const recipientData = createValidRecipientData({ giftStatus: 'inactive' });
      delete recipientData.address;

      const recipient = await Recipient.create(recipientData);
      expect(recipient).toBeDefined();
    });

    test('should handle null values in name fields', async () => {
      const recipientData = createValidRecipientData();
      const recipient = new Recipient(recipientData);
      recipient.firstName = null;
      recipient.lastName = null;
      
      // This should not throw an error during the trim operation
      await expect(recipient.save()).rejects.toThrow(); // Will fail validation, but not due to trim
    });
  });

  describe('Post-save Middleware - Logging', () => {
    test('should log recipient save', async () => {
      const recipientData = createValidRecipientData();
      const recipient = await Recipient.create(recipientData);

      expect(mockLog).toHaveBeenCalledWith(`Recipient ${recipient._id} was saved`);
    });

    test('should log on recipient update', async () => {
      const recipient = await Recipient.create(createValidRecipientData());
      mockLog.mockClear();
      
      recipient.firstName = 'Updated';
      await recipient.save();

      expect(mockLog).toHaveBeenCalledWith(`Recipient ${recipient._id} was saved`);
    });
  });

  describe('Array Field Validation', () => {
    test('should accept valid array fields', async () => {
      const recipientData = createValidRecipientData({
        tags: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
        interests: ['reading', 'gaming', 'cooking'],
        hobbies: ['photography', 'hiking'],
        favoriteColors: ['blue', 'green'],
        favoriteBooks: ['Book 1', 'Book 2'],
        favoriteMovies: ['Movie 1', 'Movie 2'],
        favoriteMusic: ['Artist 1', 'Artist 2'],
        dietaryRestrictions: ['vegetarian', 'gluten-free']
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.interests).toEqual(['reading', 'gaming', 'cooking']);
      expect(recipient.hobbies).toEqual(['photography', 'hiking']);
      expect(recipient.favoriteColors).toEqual(['blue', 'green']);
      expect(recipient.dietaryRestrictions).toEqual(['vegetarian', 'gluten-free']);
    });

    test('should handle empty arrays', async () => {
      const recipientData = createValidRecipientData({
        interests: [],
        hobbies: [],
        favoriteColors: []
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.interests).toEqual([]);
      expect(recipient.hobbies).toEqual([]);
      expect(recipient.favoriteColors).toEqual([]);
    });
  });

  describe('Nested Object Validation', () => {
    test('should validate clothingSizes object', async () => {
      const recipientData = createValidRecipientData({
        clothingSizes: {
          shirt: 'M',
          pants: '32',
          shoe: '10'
        }
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.clothingSizes.shirt).toBe('M');
      expect(recipient.clothingSizes.pants).toBe('32');
      expect(recipient.clothingSizes.shoe).toBe('10');
    });

    test('should validate wishList with priority', async () => {
      const recipientData = createValidRecipientData({
        wishList: [
          { item: 'New laptop', priority: 'high' },
          { item: 'Books', priority: 'medium' },
          { item: 'Gift card', priority: 'low' }
        ]
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.wishList).toHaveLength(3);
      expect(recipient.wishList[0].item).toBe('New laptop');
      expect(recipient.wishList[0].priority).toBe('high');
    });

    test('should use default priority for wishList items', async () => {
      const recipientData = createValidRecipientData({
        wishList: [{ item: 'Something nice' }]
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.wishList[0].priority).toBe('medium');
    });

    test('should reject invalid wishList priority', async () => {
      const recipientData = createValidRecipientData({
        wishList: [{ item: 'Something', priority: 'invalid' }]
      });

      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });
  });

  describe('Data Type Validation', () => {
    test('should validate ObjectId references', async () => {
      const validUserId = new mongoose.Types.ObjectId();
      // Create a test user with the valid ID
      const newUser = new User({
        _id: validUserId,
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'password123',
        firstName: 'Test2',
        lastName: 'User2'
      });
      await newUser.save();

      const recipientData = createValidRecipientData({ user: validUserId });
      const recipient = await Recipient.create(recipientData);
      expect(recipient.user).toEqual(validUserId);
    });

    test('should reject invalid ObjectId', async () => {
      const recipientData = createValidRecipientData({ user: 'invalid-objectid' });
      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should validate Date fields', async () => {
      const birthdate = new Date('1990-05-15');
      const recipientData = createValidRecipientData({ birthdate });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.birthdate).toEqual(birthdate);
    });

    test('should reject invalid Date', async () => {
      const recipientData = createValidRecipientData({ birthdate: 'invalid-date' });
      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should validate Number fields', async () => {
      const recipientData = createValidRecipientData({
        minimumPriceBudget: 50,
        maximumPriceBudget: 200,
        relationshipLength: 5
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.minimumPriceBudget).toBe(50);
      expect(recipient.maximumPriceBudget).toBe(200);
      expect(recipient.relationshipLength).toBe(5);
    });

    test('should reject negative relationshipLength', async () => {
      const recipientData = createValidRecipientData({ relationshipLength: -1 });
      await expect(Recipient.create(recipientData)).rejects.toThrow();
    });

    test('should validate Boolean fields', async () => {
      // Create unique user for this test
      const uniqueUser = new User({
        username: 'testuser_bool',
        email: 'testbool@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      });
      await uniqueUser.save();

      const recipientData = createValidRecipientData({
        user: uniqueUser._id,
        isSelf: true,
        isSystemAccount: true,
        visibility: false
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.isSelf).toBe(true);
      expect(recipient.isSystemAccount).toBe(true);
      expect(recipient.visibility).toBe(false);
    });
  });

  describe('Edge Cases and Integration Tests', () => {
    test('should handle very long strings', async () => {
      // Create unique user for this test
      const uniqueUser = new User({
        username: 'testuser_long',
        email: 'testlong@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      });
      await uniqueUser.save();

      const longString = 'A'.repeat(500);
      const recipientData = createValidRecipientData({
        user: uniqueUser._id,
        firstName: longString,
        relation: longString
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.firstName).toBe(longString);
      expect(recipient.relation).toBe(longString);
    });

    test('should handle maximum array lengths', async () => {
      const largeArray = Array(50).fill('interest');
      const recipientData = createValidRecipientData({
        interests: largeArray
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.interests).toHaveLength(50);
    });

    test('should handle very old and very young ages', async () => {
      // Very old person (100 years)
      const veryOldDate = new Date();
      veryOldDate.setFullYear(veryOldDate.getFullYear() - 100);
      
      const oldRecipientData = createValidRecipientData({ birthdate: veryOldDate });
      const oldRecipient = await Recipient.create(oldRecipientData);
      expect(oldRecipient.age).toBe(100);

      // Very young person (0 years - born today)
      const today = new Date();
      const youngRecipientData = createValidRecipientData({ birthdate: today });
      const youngRecipient = await Recipient.create(youngRecipientData);
      expect(youngRecipient.age).toBe(0);
    });

    test('should handle leap year edge cases', async () => {
      // Create unique user for this test
      const uniqueUser = new User({
        username: 'testuser_leap',
        email: 'testleap@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      });
      await uniqueUser.save();

      // Born on Feb 29, 2000 (leap year)
      const leapYearBirth = new Date('2000-02-29');
      const recipientData = createValidRecipientData({ 
        user: uniqueUser._id,
        birthdate: leapYearBirth 
      });

      const recipient = await Recipient.create(recipientData);
      expect(typeof recipient.age).toBe('number');
      expect(recipient.age).toBeGreaterThanOrEqual(0);
    });

    test('should handle extreme budget values', async () => {
      const recipientData = createValidRecipientData({
        minimumPriceBudget: 0,
        maximumPriceBudget: 999999
      });

      const recipient = await Recipient.create(recipientData);
      expect(recipient.minimumPriceBudget).toBe(0);
      expect(recipient.maximumPriceBudget).toBe(999999);
    });

    test('should work with actual User model population', async () => {
      const recipientData = createValidRecipientData();
      const recipient = await Recipient.create(recipientData);

      // Test population
      const populatedRecipient = await Recipient.findById(recipient._id).populate('user');
      expect(populatedRecipient.user.email).toBe('test@example.com');
    });

    test('should maintain referential integrity', async () => {
      const recipient = await Recipient.create(createValidRecipientData());
      
      // Delete the user
      await testUser.deleteOne();
      
      // Recipient should still exist but reference should be broken
      const foundRecipient = await Recipient.findById(recipient._id);
      expect(foundRecipient).toBeDefined();
      expect(foundRecipient.user).toEqual(testUser._id);
    });

    test('should handle concurrent saves', async () => {
      // Create unique users for this test
      const users = [];
      for (let i = 0; i < 3; i++) {
        const user = new User({
          username: `testuser_concurrent${i}`,
          email: `testconcurrent${i}@example.com`,
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        });
        await user.save();
        users.push(user);
      }
      
      // Create multiple recipients concurrently
      const promises = users.map((user, index) => 
        Recipient.create({
          ...createValidRecipientData({ user: user._id }),
          firstName: `User${index}`,
          relation: `Relation${index}`
        })
      );
      
      const recipients = await Promise.all(promises);
      expect(recipients).toHaveLength(3);
      recipients.forEach((recipient, index) => {
        expect(recipient.firstName).toBe(`User${index}`);
      });
    });
  });
});
