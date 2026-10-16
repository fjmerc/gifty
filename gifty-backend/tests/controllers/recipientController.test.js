// tests/controllers/recipientController.test.js  
const mongoose = require('mongoose');
const recipientController = require('../../controllers/recipientController');
const Recipient = require('../../models/Recipient');
const Tag = require('../../models/Tags');
const { Budget } = require('../../models/Budget');
const Event = require('../../models/Event');
const Gift = require('../../models/Gift');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependencies
jest.mock('../../models/Recipient');
jest.mock('../../models/Tags');
jest.mock('../../models/Budget');
jest.mock('../../models/Event');
jest.mock('../../models/Gift');
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

describe('Recipient Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  describe('addRecipient', () => {
    it('should create a recipient successfully with valid data', async () => {
      // Arrange
      const recipientData = {
        firstName: 'John',
        lastName: 'Doe',
        relation: 'Family',
        birthdate: '1990-01-01',
        tags: ['friend', 'colleague']
      };

      const { req, res } = createMockReqRes({
        body: recipientData,
        user: { id: new mongoose.Types.ObjectId() }
      });

      const mockSavedRecipient = {
        _id: new mongoose.Types.ObjectId(),
        user: req.user.id,
        firstName: recipientData.firstName,
        lastName: recipientData.lastName,
        relation: recipientData.relation,
        relationship: 'family',
        birthdate: recipientData.birthdate,
        giftStatus: 'inactive',
        tags: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
        save: jest.fn().mockResolvedValue(this),
        populate: jest.fn().mockResolvedValue(this)
      };

      const mockBudget = {
        _id: new mongoose.Types.ObjectId(),
        user: req.user.id,
        recipient: mockSavedRecipient._id,
        year: new Date().getFullYear(),
        allocationType: 'fixed',
        minimumAmount: 0,
        maximumAmount: 100,
        save: jest.fn().mockResolvedValue(this)
      };

      // Mock Tag processing
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null) // First tag doesn't exist
        .mockResolvedValueOnce(null); // Second tag doesn't exist
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), name: 'friend' })
        .mockResolvedValueOnce({ _id: new mongoose.Types.ObjectId(), name: 'colleague' });

      // Mock Recipient constructor and save
      const mockRecipientInstance = {
        ...mockSavedRecipient,
        save: jest.fn().mockResolvedValue(mockSavedRecipient)
      };
      Recipient.mockImplementation(() => mockRecipientInstance);

      // Mock Budget constructor and save
      const mockBudgetInstance = {
        ...mockBudget,
        save: jest.fn().mockResolvedValue(mockBudget)
      };
      Budget.mockImplementation(() => mockBudgetInstance);

      // Act
      await recipientController.addRecipient(req, res, mockNext);

      // Assert
      expect(Recipient).toHaveBeenCalledWith(expect.objectContaining({
        user: req.user.id,
        firstName: recipientData.firstName,
        lastName: recipientData.lastName,
        relation: recipientData.relation,
        relationship: 'family',
        birthdate: recipientData.birthdate,
        giftStatus: 'inactive'
      }));
      expect(mockRecipientInstance.save).toHaveBeenCalled();
      // No automatic budget for a new recipient
      expect(Budget).not.toHaveBeenCalled();
      expect(mockBudgetInstance.save).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockSavedRecipient);
    });

    it('should create recipient without tags when tags array is empty', async () => {
      // Arrange
      const recipientData = {
        firstName: 'Jane',
        lastName: 'Smith',
        relation: 'Friend',
        birthdate: '1985-05-15'
      };

      const { req, res } = createMockReqRes({
        body: recipientData,
        user: { id: new mongoose.Types.ObjectId() }
      });

      const mockSavedRecipient = {
        _id: new mongoose.Types.ObjectId(),
        user: req.user.id,
        firstName: recipientData.firstName,
        lastName: recipientData.lastName,
        relation: recipientData.relation,
        relationship: 'friendship',
        birthdate: recipientData.birthdate,
        giftStatus: 'inactive',
        populate: jest.fn().mockResolvedValue(this)
      };

      const mockBudget = {
        _id: new mongoose.Types.ObjectId(),
        user: req.user.id,
        recipient: mockSavedRecipient._id
      };

      // Mock Recipient constructor and save
      const mockRecipientInstance = {
        ...mockSavedRecipient,
        save: jest.fn().mockResolvedValue(mockSavedRecipient)
      };
      Recipient.mockImplementation(() => mockRecipientInstance);

      // Mock Budget constructor and save
      const mockBudgetInstance = {
        ...mockBudget,
        save: jest.fn().mockResolvedValue(mockBudget)
      };
      Budget.mockImplementation(() => mockBudgetInstance);

      // Act
      await recipientController.addRecipient(req, res, mockNext);

      // Assert
      expect(Recipient).toHaveBeenCalledWith(expect.objectContaining({
        user: req.user.id,
        firstName: recipientData.firstName,
        lastName: recipientData.lastName,
        relation: recipientData.relation,
        relationship: 'friendship',
        birthdate: recipientData.birthdate,
        giftStatus: 'inactive'
      }));
      expect(mockRecipientInstance.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockSavedRecipient);
    });

    it('should map relation types correctly', async () => {
      // Arrange
      const relationMappingTests = [
        { relation: 'Family', expectedRelationship: 'family' },
        { relation: 'Friend', expectedRelationship: 'friendship' },
        { relation: 'Colleague', expectedRelationship: 'professional' },
        { relation: 'Other', expectedRelationship: 'acquaintance' },
        { relation: 'Unknown', expectedRelationship: 'acquaintance' } // default case
      ];

      for (const testCase of relationMappingTests) {
        const { req, res } = createMockReqRes({
          body: {
            firstName: 'Test',
            lastName: 'Person',
            relation: testCase.relation
          },
          user: { id: new mongoose.Types.ObjectId() }
        });

        const mockSavedRecipient = {
          _id: new mongoose.Types.ObjectId(),
          user: req.user.id,
          firstName: 'Test',
          lastName: 'Person',
          relation: testCase.relation,
          relationship: testCase.expectedRelationship,
          giftStatus: 'inactive',
          populate: jest.fn().mockResolvedValue(this)
        };

        const mockBudget = {
          _id: new mongoose.Types.ObjectId(),
          user: req.user.id,
          recipient: mockSavedRecipient._id
        };

        // Mock Recipient constructor and save
        const mockRecipientInstance = {
          ...mockSavedRecipient,
          save: jest.fn().mockResolvedValue(mockSavedRecipient)
        };
        Recipient.mockImplementation(() => mockRecipientInstance);

        // Mock Budget constructor and save
        const mockBudgetInstance = {
          ...mockBudget,
          save: jest.fn().mockResolvedValue(mockBudget)
        };
        Budget.mockImplementation(() => mockBudgetInstance);

        // Act
        await recipientController.addRecipient(req, res, mockNext);

        // Assert
        expect(Recipient).toHaveBeenCalledWith(expect.objectContaining({
          relationship: testCase.expectedRelationship
        }));
        
        // Clear mocks for next iteration
        jest.clearAllMocks();
      }
    });
  });

  describe('getAllRecipients', () => {
    beforeEach(() => {
      Gift.aggregate = jest.fn().mockResolvedValue([]);
    });

    it('should return all recipients excluding system accounts', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { id: new mongoose.Types.ObjectId() }
      });

      const mockRecipients = [
        {
          _id: new mongoose.Types.ObjectId(),
          firstName: 'John',
          lastName: 'Doe',
          tags: [
            { _id: new mongoose.Types.ObjectId(), name: 'friend' },
            { _id: new mongoose.Types.ObjectId(), name: 'colleague' }
          ],
          toObject: function() {
            return { ...this };
          }
        },
        {
          _id: new mongoose.Types.ObjectId(),
          firstName: 'Jane',
          lastName: 'Smith',
          tags: [],
          toObject: function() {
            return { ...this };
          }
        }
      ];

      // Mock Recipient.find with chaining
      Recipient.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockRecipients)
      });

      // Act
      await recipientController.getAllRecipients(req, res, mockNext);

      // Assert
      expect(Recipient.find).toHaveBeenCalledWith({
        user: req.user.id,
        isSystemAccount: { $ne: true },
        archived: { $ne: true }
      });
      expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ firstName: 'John', lastName: 'Doe' }),
        expect.objectContaining({ firstName: 'Jane', lastName: 'Smith' })
      ]));
    });

    it('should format tags correctly in response', async () => {
      // Arrange
      const { req, res } = createMockReqRes({
        user: { id: new mongoose.Types.ObjectId() }
      });

      const mockRecipients = [
        {
          _id: new mongoose.Types.ObjectId(),
          firstName: 'John',
          lastName: 'Doe',
          tags: [
            { _id: new mongoose.Types.ObjectId(), name: 'friend' },
            { _id: new mongoose.Types.ObjectId(), name: 'family' }
          ],
          toObject: function() {
            return {
              _id: this._id,
              firstName: this.firstName,
              lastName: this.lastName,
              tags: this.tags
            };
          }
        }
      ];

      // Mock Recipient.find with chaining
      Recipient.find = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockRecipients)
      });

      // Act
      await recipientController.getAllRecipients(req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({
          firstName: 'John',
          tags: expect.arrayContaining([
            expect.objectContaining({ name: 'friend' }),
            expect.objectContaining({ name: 'family' })
          ])
        })
      ]));
    });
  });

  describe('getRecipientById', () => {
    it('should return recipient when found', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        user: { id: new mongoose.Types.ObjectId() }
      });

      const mockRecipient = {
        _id: recipientId,
        firstName: 'John',
        lastName: 'Doe',
        tags: [
          { _id: new mongoose.Types.ObjectId(), name: 'friend' }
        ]
      };

      // Mock Recipient.findOne with chaining
      Recipient.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockRecipient)
      });

      // Act
      await recipientController.getRecipientById(req, res, mockNext);

      // Assert
      expect(Recipient.findOne).toHaveBeenCalledWith({
        _id: recipientId,
        user: req.user.id
      });
      expect(res.json).toHaveBeenCalledWith(mockRecipient);
    });

    it('should return 404 when recipient not found', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const next = jest.fn();
      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        user: { id: new mongoose.Types.ObjectId() }
      });

      // Mock Recipient.findOne with chaining to return null
      Recipient.findOne = jest.fn().mockReturnValue(queryOf(null));

      // Act
      await recipientController.getRecipientById(req, res, next);

      // Assert — missing and foreign recipients are the same 404
      expect(Recipient.findOne).toHaveBeenCalledWith({
        _id: recipientId,
        user: req.user.id
      });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404, message: 'Recipient not found' }));
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('updateRecipient', () => {
    // An owned recipient document as returned by findOwned
    const ownedDoc = (recipientId, extra = {}) => ({
      _id: recipientId,
      set: jest.fn(),
      validate: jest.fn().mockResolvedValue(undefined),
      ...extra
    });

    const mockUpdate = (updatedRecipient) => {
      Recipient.findOneAndUpdate = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(updatedRecipient)
      });
    };

    it('should return 404 if recipient is missing or belongs to another user', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const next = jest.fn();
      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        body: { firstName: 'Updated' },
        user: { id: new mongoose.Types.ObjectId().toString() }
      });

      Recipient.findOne = jest.fn().mockReturnValue(queryOf(null));
      Recipient.findOneAndUpdate = jest.fn();

      // Act
      await recipientController.updateRecipient(req, res, next);

      // Assert — scoped to the caller, 404 (never 401)
      expect(Recipient.findOne).toHaveBeenCalledWith({ _id: recipientId, user: req.user.id });
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(Recipient.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should never pass user, isSystemAccount or isSelf from the body', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId().toString();
      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        body: {
          firstName: 'Renamed',
          user: new mongoose.Types.ObjectId().toString(),
          isSystemAccount: true,
          isSelf: true,
          _id: new mongoose.Types.ObjectId().toString()
        },
        user: { id: userId }
      });

      const doc = ownedDoc(recipientId);
      Recipient.findOne = jest.fn().mockReturnValue(queryOf(doc));
      mockUpdate({ _id: recipientId, firstName: 'Renamed' });

      // Act
      await recipientController.updateRecipient(req, res, jest.fn());

      // Assert
      expect(doc.set).toHaveBeenCalledWith({ firstName: 'Renamed' });
      const [filter, update] = Recipient.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ _id: recipientId, user: userId });
      expect(update.$set).toEqual({ firstName: 'Renamed', updatedAt: expect.any(Date) });
    });

    it('should return a validation error (no write) when the merged document is invalid', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const next = jest.fn();
      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        body: { minimumPriceBudget: 500 },
        user: { id: new mongoose.Types.ObjectId().toString() }
      });

      const validationError = Object.assign(new Error('Minimum price cannot be greater than maximum price'), { name: 'ValidationError' });
      const doc = ownedDoc(recipientId, { validate: jest.fn().mockRejectedValue(validationError) });
      Recipient.findOne = jest.fn().mockReturnValue(queryOf(doc));
      Recipient.findOneAndUpdate = jest.fn();

      // Act
      await recipientController.updateRecipient(req, res, next);

      // Assert
      expect(doc.validate).toHaveBeenCalledWith(['minimumPriceBudget']);
      expect(next).toHaveBeenCalledWith(validationError);
      expect(Recipient.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should successfully update recipient with basic field changes', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        body: {
          firstName: 'UpdatedJohn',
          lastName: 'UpdatedDoe',
          relation: 'Friend'
        },
        user: { id: userId.toString() }
      });

      const updatedRecipient = {
        _id: recipientId,
        firstName: 'UpdatedJohn',
        lastName: 'UpdatedDoe',
        relation: 'Friend',
        tags: []
      };

      const doc = ownedDoc(recipientId);
      Recipient.findOne = jest.fn().mockReturnValue(queryOf(doc));
      mockUpdate(updatedRecipient);

      const testMockNext = jest.fn();

      // Act
      await recipientController.updateRecipient(req, res, testMockNext);

      // Assert
      expect(testMockNext).not.toHaveBeenCalled();
      expect(Recipient.findOne).toHaveBeenCalledWith({ _id: recipientId, user: userId.toString() });
      expect(Recipient.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: recipientId, user: userId.toString() },
        { $set: {
          firstName: 'UpdatedJohn',
          lastName: 'UpdatedDoe',
          relation: 'Friend',
          updatedAt: expect.any(Date)
        }},
        { new: true, runValidators: true }
      );
      expect(res.json).toHaveBeenCalledWith(updatedRecipient);
    });

    it('should successfully parse wishList with priority logic', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        body: {
          wishList: 'iPhone:high, Laptop:medium, Book, Watch:low'
        },
        user: { id: userId.toString() }
      });

      const updatedRecipient = { _id: recipientId, tags: [] };
      Recipient.findOne = jest.fn().mockReturnValue(queryOf(ownedDoc(recipientId)));
      mockUpdate(updatedRecipient);

      // Act
      await recipientController.updateRecipient(req, res, mockNext);

      // Assert
      expect(Recipient.findOneAndUpdate.mock.calls[0][1].$set.wishList).toEqual([
        { item: 'iPhone', priority: 'high' },
        { item: 'Laptop', priority: 'medium' },
        { item: 'Book', priority: 'medium' },
        { item: 'Watch', priority: 'low' }
      ]);
      expect(res.json).toHaveBeenCalledWith(updatedRecipient);
    });

    it('should successfully parse array fields from strings', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        body: {
          interests: 'reading, hiking, cooking',
          hobbies: 'photography,gaming, sports',
          favoriteColors: 'blue, green, red',
          favoriteBooks: 'Book 1, Book 2',
          favoriteMovies: 'Movie 1,Movie 2, Movie 3',
          favoriteMusic: 'Rock, Jazz',
          personalityTraits: 'kind, funny, smart',
          dietaryRestrictions: 'vegetarian, gluten-free'
        },
        user: { id: userId.toString() }
      });

      const updatedRecipient = { _id: recipientId, tags: [] };
      Recipient.findOne = jest.fn().mockReturnValue(queryOf(ownedDoc(recipientId)));
      mockUpdate(updatedRecipient);

      // Act
      await recipientController.updateRecipient(req, res, mockNext);

      // Assert
      expect(Recipient.findOneAndUpdate.mock.calls[0][1].$set).toEqual({
        interests: ['reading', 'hiking', 'cooking'],
        hobbies: ['photography', 'gaming', 'sports'],
        favoriteColors: ['blue', 'green', 'red'],
        favoriteBooks: ['Book 1', 'Book 2'],
        favoriteMovies: ['Movie 1', 'Movie 2', 'Movie 3'],
        favoriteMusic: ['Rock', 'Jazz'],
        personalityTraits: ['kind', 'funny', 'smart'],
        dietaryRestrictions: ['vegetarian', 'gluten-free'],
        updatedAt: expect.any(Date)
      });
      expect(res.json).toHaveBeenCalledWith(updatedRecipient);
    });

    it('should successfully update recipient with tag processing', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const tagId1 = new mongoose.Types.ObjectId();
      const tagId2 = new mongoose.Types.ObjectId();

      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        body: {
          firstName: 'John',
          tags: ['friend', 'colleague']
        },
        user: { id: userId.toString() }
      });

      const updatedRecipient = {
        _id: recipientId,
        firstName: 'John',
        tags: [
          { _id: tagId1, name: 'friend' },
          { _id: tagId2, name: 'colleague' }
        ]
      };

      Recipient.findOne = jest.fn().mockReturnValue(queryOf(ownedDoc(recipientId)));

      // Mock Tag processing - first tag exists, second needs creation
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce({ _id: tagId1, name: 'friend' })
        .mockResolvedValueOnce(null);
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: tagId2, name: 'colleague' });

      mockUpdate(updatedRecipient);

      // Act
      await recipientController.updateRecipient(req, res, mockNext);

      // Assert
      expect(Tag.findOne.mock.calls[0][0]).toStrictEqual({ name: 'friend', user: userId.toString() });
      expect(Tag.findOne.mock.calls[1][0]).toStrictEqual({ name: 'colleague', user: userId.toString() });
      expect(Tag.create.mock.calls[0][0]).toStrictEqual({ name: 'colleague', user: userId.toString() });
      expect(Recipient.findOneAndUpdate.mock.calls[0][1].$set).toEqual({
        firstName: 'John',
        tags: [tagId1, tagId2],
        updatedAt: expect.any(Date)
      });
      expect(res.json).toHaveBeenCalledWith(updatedRecipient);
    });
  });

  describe('deleteRecipient', () => {
    it('should return 404 if recipient is missing or belongs to another user', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const next = jest.fn();
      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        user: { id: new mongoose.Types.ObjectId().toString() }
      });

      Recipient.findOne = jest.fn().mockReturnValue(queryOf(null));
      Budget.deleteMany = jest.fn();
      Recipient.deleteOne = jest.fn();

      // Act
      await recipientController.deleteRecipient(req, res, next);

      // Assert
      expect(Recipient.findOne).toHaveBeenCalledWith({ _id: recipientId, user: req.user.id });
      expect(Budget.deleteMany).not.toHaveBeenCalled();
      expect(Recipient.deleteOne).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  describe('uploadProfilePicture', () => {
    const uploadReq = (recipientId, userId, file, extra = {}) => {
      const { req, res } = createMockReqRes({
        params: { id: recipientId },
        file,
        user: { id: userId.toString() },
        ...extra
      });
      req.get = jest.fn().mockReturnValue('example.com:8080');
      return { req, res };
    };

    it('should store a host-independent path on the caller\'s recipient', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const { req, res } = uploadReq(recipientId, userId, { filename: 'test-image.png' }, { protocol: 'http' });

      Recipient.findOne = jest.fn().mockReturnValue(queryOf({ _id: recipientId }));
      Recipient.findOneAndUpdate = jest.fn().mockResolvedValue({
        _id: recipientId,
        profilePicture: '/uploads/test-image.png'
      });

      // Act
      await recipientController.uploadProfilePicture(req, res, mockNext);

      // Assert — the stored path must not bake in the request host
      expect(Recipient.findOne).toHaveBeenCalledWith({ _id: recipientId, user: userId.toString() });
      expect(Recipient.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: recipientId, user: userId.toString() },
        { profilePicture: '/uploads/test-image.png' },
        { new: true, runValidators: false }
      );
      expect(res.json).toHaveBeenCalledWith({
        message: 'Profile picture uploaded successfully',
        profilePicture: '/uploads/test-image.png'
      });
    });

    it('should return 400 when no file is uploaded', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const { req, res } = uploadReq(recipientId, new mongoose.Types.ObjectId(), null);
      Recipient.findOne = jest.fn();

      // Act
      await recipientController.uploadProfilePicture(req, res, mockNext);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'No file uploaded' });
      expect(Recipient.findOne).not.toHaveBeenCalled();
    });

    it('should return 404 (not 401) when recipient is missing or not the caller\'s', async () => {
      // Arrange
      const recipientId = new mongoose.Types.ObjectId();
      const next = jest.fn();
      const { req, res } = uploadReq(recipientId, new mongoose.Types.ObjectId(), { filename: 'profile-123.jpg' });

      Recipient.findOne = jest.fn().mockReturnValue(queryOf(null));
      Recipient.findOneAndUpdate = jest.fn();

      // Act
      await recipientController.uploadProfilePicture(req, res, next);

      // Assert
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
      expect(Recipient.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getNavigation', () => {
    it('should return null for prevId when current recipient is first', async () => {
      // Arrange
      const currentId = new mongoose.Types.ObjectId();
      const nextId = new mongoose.Types.ObjectId();
      
      const { req, res } = createMockReqRes({
        params: { id: currentId.toString() },
        user: { _id: new mongoose.Types.ObjectId() }
      });

      const mockRecipients = [
        { _id: currentId },
        { _id: nextId }
      ];

      // Mock Recipient.find with chaining
      Recipient.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue(mockRecipients)
        })
      });

      // Act
      await recipientController.getNavigation(req, res, mockNext);

      // Assert
      expect(res.json).toHaveBeenCalledWith({
        prevId: null,
        nextId: expect.any(mongoose.Types.ObjectId)
      });
    });
  });

  describe('processTags Helper Function', () => {
    // Tags are looked up and created per owner
    const tagOwner = new mongoose.Types.ObjectId().toString();

    it("should never fall back to another owner's or a legacy tag", async () => {
      const ownId = new mongoose.Types.ObjectId();
      Tag.findOne = jest.fn().mockResolvedValueOnce(null);
      Tag.create = jest.fn().mockResolvedValueOnce({ _id: ownId, name: 'family', user: tagOwner });

      const result = await recipientController.processTags(['Family'], tagOwner);

      expect(Tag.findOne).toHaveBeenCalledTimes(1);
      expect(Tag.findOne.mock.calls[0][0]).toStrictEqual({ name: 'family', user: tagOwner });
      expect(Tag.create.mock.calls[0][0]).toStrictEqual({ name: 'family', user: tagOwner });
      expect(result).toEqual([ownId]);
    });

    it('should fall back to the read-only legacy tag when the old global name index blocks create', async () => {
      const legacyId = new mongoose.Types.ObjectId();
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null) // no owned tag
        .mockResolvedValueOnce(null) // still none after the duplicate key error
        .mockResolvedValueOnce({ _id: legacyId, name: 'family' }); // legacy un-owned
      Tag.create = jest.fn().mockRejectedValueOnce(Object.assign(new Error('E11000 name_1'), { code: 11000 }));

      const result = await recipientController.processTags(['family'], tagOwner);

      expect(Tag.findOne.mock.calls[2][0]).toStrictEqual({ name: 'family', user: null });
      expect(result).toEqual([legacyId]);
    });

    it('should rethrow non-duplicate create errors', async () => {
      Tag.findOne = jest.fn().mockResolvedValueOnce(null);
      Tag.create = jest.fn().mockRejectedValueOnce(new Error('db down'));

      await expect(recipientController.processTags(['family'], tagOwner)).rejects.toThrow('db down');
      expect(Tag.findOne).toHaveBeenCalledTimes(1);
    });

    it('should re-read the owned tag after losing a create race (duplicate key)', async () => {
      const ownId = new mongoose.Types.ObjectId();
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: ownId, name: 'family', user: tagOwner });
      Tag.create = jest.fn().mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000 }));

      const result = await recipientController.processTags(['family'], tagOwner);

      expect(result).toEqual([ownId]);
    });

    it('should process string tags by converting to lowercase and trimming', async () => {
      // Arrange
      const tags = ['Friend', ' family ', 'COLLEAGUE '];
      const expectedTagIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Mock Tag.findOne to return null (tags don't exist)
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // Mock Tag.create to return new tags
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: expectedTagIds[0], name: 'friend' })
        .mockResolvedValueOnce({ _id: expectedTagIds[1], name: 'family' })
        .mockResolvedValueOnce({ _id: expectedTagIds[2], name: 'colleague' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'friend', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'family', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'colleague', user: tagOwner });
      expect(Tag.create).toHaveBeenCalledWith({ name: 'friend', user: tagOwner });
      expect(Tag.create).toHaveBeenCalledWith({ name: 'family', user: tagOwner });
      expect(Tag.create).toHaveBeenCalledWith({ name: 'colleague', user: tagOwner });
      expect(result).toEqual(expectedTagIds);
    });

    it('should process object tags by extracting name, converting to lowercase and trimming', async () => {
      // Arrange
      const tags = [
        { name: 'Family' },
        { name: ' FRIEND ' },
        { name: 'colleague' }
      ];
      const expectedTagIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Mock Tag.findOne to return null (tags don't exist)
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // Mock Tag.create to return new tags
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: expectedTagIds[0], name: 'family' })
        .mockResolvedValueOnce({ _id: expectedTagIds[1], name: 'friend' })
        .mockResolvedValueOnce({ _id: expectedTagIds[2], name: 'colleague' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'family', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'friend', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'colleague', user: tagOwner });
      expect(result).toEqual(expectedTagIds);
    });

    it('should return existing tag IDs when tags already exist', async () => {
      // Arrange
      const tags = ['friend', 'family'];
      const existingTagIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Mock Tag.findOne to return existing tags
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce({ _id: existingTagIds[0], name: 'friend' })
        .mockResolvedValueOnce({ _id: existingTagIds[1], name: 'family' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'friend', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'family', user: tagOwner });
      expect(Tag.create).not.toHaveBeenCalled();
      expect(result).toEqual(existingTagIds);
    });

    it('should handle mixed scenarios - some tags exist, some need creation', async () => {
      // Arrange
      const tags = ['friend', 'newTag'];
      const existingTagId = new mongoose.Types.ObjectId();
      const newTagId = new mongoose.Types.ObjectId();

      // Mock Tag.findOne - first tag exists, second doesn't
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce({ _id: existingTagId, name: 'friend' })
        .mockResolvedValueOnce(null);

      // Mock Tag.create for new tag
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: newTagId, name: 'newtag' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'friend', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'newtag', user: tagOwner });
      expect(Tag.create).toHaveBeenCalledWith({ name: 'newtag', user: tagOwner });
      expect(result).toEqual([existingTagId, newTagId]);
    });

    it('should filter out invalid tag inputs and return null for them', async () => {
      // Arrange
      const tags = [
        'validTag',
        null,
        undefined,
        '',
        '   ',
        { name: '' },
        { name: '   ' },
        { invalidProperty: 'test' },
        { name: 'validObjectTag' }
      ];
      const validTagIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Mock Tag.findOne to return null for valid tags
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null) // validtag
        .mockResolvedValueOnce(null); // validobjecttag

      // Mock Tag.create for valid tags
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: validTagIds[0], name: 'validtag' })
        .mockResolvedValueOnce({ _id: validTagIds[1], name: 'validobjecttag' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledTimes(2);
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'validtag', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'validobjecttag', user: tagOwner });
      expect(Tag.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual(validTagIds);
    });

    it('should handle mixed array of strings and objects', async () => {
      // Arrange
      const tags = [
        'stringTag',
        { name: 'ObjectTag' },
        'ANOTHER_STRING',
        { name: ' spacedObject ' }
      ];
      const expectedTagIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Mock Tag.findOne to return null (all tags need creation)
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // Mock Tag.create
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: expectedTagIds[0], name: 'stringtag' })
        .mockResolvedValueOnce({ _id: expectedTagIds[1], name: 'objecttag' })
        .mockResolvedValueOnce({ _id: expectedTagIds[2], name: 'another_string' })
        .mockResolvedValueOnce({ _id: expectedTagIds[3], name: 'spacedobject' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'stringtag', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'objecttag', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'another_string', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'spacedobject', user: tagOwner });
      expect(result).toEqual(expectedTagIds);
    });

    it('should handle empty array input', async () => {
      // Arrange
      const tags = [];

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).not.toHaveBeenCalled();
      expect(Tag.create).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should handle duplicate tag names correctly', async () => {
      // Arrange
      const tags = ['friend', 'FRIEND', ' friend ', { name: 'Friend' }];
      const tagId = new mongoose.Types.ObjectId();

      // Mock Tag.findOne - all resolve to the same tag since they're all 'friend' after processing
      Tag.findOne = jest.fn()
        .mockResolvedValue({ _id: tagId, name: 'friend' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledTimes(4);
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'friend', user: tagOwner });
      expect(Tag.create).not.toHaveBeenCalled();
      expect(result).toEqual([tagId, tagId, tagId, tagId]);
    });

    it('should handle malformed object inputs gracefully', async () => {
      // Arrange
      const tags = [
        { name: 'validTag' },
        { notName: 'invalid' },
        { name: null },
        { name: undefined },
        {},
        'validString'
      ];
      const validTagIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Mock Tag.findOne to return null for valid tags
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null) // validtag
        .mockResolvedValueOnce(null); // validstring

      // Mock Tag.create for valid tags
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: validTagIds[0], name: 'validtag' })
        .mockResolvedValueOnce({ _id: validTagIds[1], name: 'validstring' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledTimes(2);
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'validtag', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'validstring', user: tagOwner });
      expect(Tag.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual(validTagIds);
    });

    it('should handle complex whitespace and special characters in tag names', async () => {
      // Arrange
      const tags = [
        '  complex-tag_name  ',
        { name: '\t SPACED\nTAG \r' },
        'emoji-tag-🎁',
        { name: '  Number123Tag  ' }
      ];
      const expectedTagIds = [
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId(),
        new mongoose.Types.ObjectId()
      ];

      // Mock Tag.findOne to return null (all tags need creation)
      Tag.findOne = jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      // Mock Tag.create
      Tag.create = jest.fn()
        .mockResolvedValueOnce({ _id: expectedTagIds[0], name: 'complex-tag_name' })
        .mockResolvedValueOnce({ _id: expectedTagIds[1], name: 'spaced\ntag' })
        .mockResolvedValueOnce({ _id: expectedTagIds[2], name: 'emoji-tag-🎁' })
        .mockResolvedValueOnce({ _id: expectedTagIds[3], name: 'number123tag' });

      // Act
      const result = await recipientController.processTags(tags, tagOwner);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'complex-tag_name', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'spaced\ntag', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'emoji-tag-🎁', user: tagOwner });
      expect(Tag.findOne).toHaveBeenCalledWith({ name: 'number123tag', user: tagOwner });
      expect(result).toEqual(expectedTagIds);
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
