// tests/controllers/tagController.test.js
const mongoose = require('mongoose');
const tagController = require('../../controllers/tagController');
const Tag = require('../../models/Tags');
const { createMockReqRes, mockNext } = require('../utils/mockUtils');
const { setupTestDB, teardownTestDB, clearDatabase } = require('../utils/testSetup');

// Mock dependencies
// Legacy-tag visibility asks which tags the caller's recipients use
jest.mock('../../models/Recipient', () => ({ distinct: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../../models/Tags');
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

describe('Tag Controller', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  describe('addTag', () => {
    it('should create a new tag successfully', async () => {
      // Arrange
      const tagData = {
        name: 'Birthday Gifts'
      };

      const { req, res } = authedReqRes({
        body: tagData
      });

      const mockNewTag = {
        _id: new mongoose.Types.ObjectId(),
        name: tagData.name,
        save: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          name: tagData.name
        })
      };

      const mockSavedTag = {
        _id: mockNewTag._id,
        name: tagData.name
      };

      // Mock Tag.findOne to return null (tag doesn't exist)
      Tag.findOne = jest.fn().mockResolvedValue(null);

      // Mock Tag constructor and saved tag
      Tag.mockImplementation(() => mockNewTag);
      mockNewTag.save.mockResolvedValue(mockSavedTag);

      // Act
      await tagController.addTag(req, res);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: tagData.name, user: userId });
      expect(Tag).toHaveBeenCalledWith({ name: tagData.name, user: userId });
      expect(mockNewTag.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockSavedTag);
    });

    it('should return existing tag when tag name already exists', async () => {
      // Arrange
      const tagData = {
        name: 'Birthday Gifts'
      };

      const { req, res } = authedReqRes({
        body: tagData
      });

      const existingTag = {
        _id: new mongoose.Types.ObjectId(),
        name: tagData.name
      };

      // Mock Tag.findOne to return existing tag
      Tag.findOne = jest.fn().mockResolvedValue(existingTag);

      // Act
      await tagController.addTag(req, res);

      // Assert
      expect(Tag.findOne).toHaveBeenCalledWith({ name: tagData.name, user: userId });
      expect(res.json).toHaveBeenCalledWith(existingTag);
    });

    it('should handle server error during tag creation', async () => {
      // Arrange
      const tagData = {
        name: 'Birthday Gifts'
      };

      const { req, res } = authedReqRes({
        body: tagData
      });

      // Mock Tag.findOne to throw error
      Tag.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      // Act
      await tagController.addTag(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Server error' });
    });
  });

  describe('getAllTags', () => {
    it('should return all tags successfully', async () => {
      // Arrange
      const { req, res } = authedReqRes({});

      const mockTags = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Birthday Gifts'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Holiday Gifts'
        },
        {
          _id: new mongoose.Types.ObjectId(),
          name: 'Anniversary Gifts'
        }
      ];

      Tag.find = jest.fn().mockResolvedValue(mockTags);

      // Act
      await tagController.getAllTags(req, res);

      // Assert
      expect(Tag.find).toHaveBeenCalledWith({ $or: [{ user: userId }, { user: null, _id: { $in: [] } }] });
      expect(res.json).toHaveBeenCalledWith(mockTags);
    });

    it('should return empty array when no tags found', async () => {
      // Arrange
      const { req, res } = authedReqRes({});

      Tag.find = jest.fn().mockResolvedValue([]);

      // Act
      await tagController.getAllTags(req, res);

      // Assert
      expect(Tag.find).toHaveBeenCalledWith({ $or: [{ user: userId }, { user: null, _id: { $in: [] } }] });
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it('should handle server error during tag retrieval', async () => {
      // Arrange
      const { req, res } = authedReqRes({});

      Tag.find = jest.fn().mockRejectedValue(new Error('Database error'));

      // Act
      await tagController.getAllTags(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Server error' });
    });
  });

  describe('updateTag', () => {
    it('should update a tag successfully', async () => {
      // Arrange
      const tagId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Birthday Gifts'
      };

      const { req, res } = authedReqRes({
        params: { id: tagId.toString() },
        body: updateData
      });

      const mockUpdatedTag = {
        _id: tagId,
        name: updateData.name
      };

      Tag.findOneAndUpdate = jest.fn().mockResolvedValue(mockUpdatedTag);

      // Act
      await tagController.updateTag(req, res);

      // Assert
      expect(Tag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: tagId.toString(), user: userId },
        { name: updateData.name },
        { new: true, runValidators: true }
      );
      expect(res.json).toHaveBeenCalledWith(mockUpdatedTag);
    });

    it('should handle server error during tag update', async () => {
      // Arrange
      const tagId = new mongoose.Types.ObjectId();
      const updateData = {
        name: 'Updated Birthday Gifts'
      };

      const { req, res } = authedReqRes({
        params: { id: tagId.toString() },
        body: updateData
      });

      Tag.findOneAndUpdate = jest.fn().mockRejectedValue(new Error('Database error'));

      // Act
      await tagController.updateTag(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Server error' });
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag successfully', async () => {
      // Arrange
      const tagId = new mongoose.Types.ObjectId();

      const { req, res } = authedReqRes({
        params: { id: tagId.toString() }
      });

      Tag.findOneAndDelete = jest.fn().mockResolvedValue({
        _id: tagId,
        name: 'Deleted Tag'
      });

      // Act
      await tagController.deleteTag(req, res);

      // Assert
      expect(Tag.findOneAndDelete).toHaveBeenCalledWith({ _id: tagId.toString(), user: userId });
      expect(res.json).toHaveBeenCalledWith({ message: 'Tag deleted' });
    });

    it('should handle server error during tag deletion', async () => {
      // Arrange
      const tagId = new mongoose.Types.ObjectId();

      const { req, res } = authedReqRes({
        params: { id: tagId.toString() }
      });

      Tag.findOneAndDelete = jest.fn().mockRejectedValue(new Error('Database error'));

      // Act
      await tagController.deleteTag(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Server error' });
    });
  });

  describe('ownership', () => {
    it('updateTag returns 404 when the tag is not owned by the caller', async () => {
      const tagId = new mongoose.Types.ObjectId();
      const { req, res } = authedReqRes({ params: { id: tagId.toString() }, body: { name: 'x' } });
      Tag.findOneAndUpdate = jest.fn().mockResolvedValue(null);

      await tagController.updateTag(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Tag not found' });
    });

    it('deleteTag returns 404 when the tag is not owned by the caller', async () => {
      const tagId = new mongoose.Types.ObjectId();
      const { req, res } = authedReqRes({ params: { id: tagId.toString() } });
      Tag.findOneAndDelete = jest.fn().mockResolvedValue(null);

      await tagController.deleteTag(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Tag not found' });
    });

    it('updateTag and deleteTag return 404 for malformed ids without querying', async () => {
      Tag.findOneAndUpdate = jest.fn();
      Tag.findOneAndDelete = jest.fn();
      const upd = authedReqRes({ params: { id: 'nope' }, body: { name: 'x' } });
      const del = authedReqRes({ params: { id: 'nope' } });

      await tagController.updateTag(upd.req, upd.res);
      await tagController.deleteTag(del.req, del.res);

      expect(upd.res.status).toHaveBeenCalledWith(404);
      expect(del.res.status).toHaveBeenCalledWith(404);
      expect(Tag.findOneAndUpdate).not.toHaveBeenCalled();
      expect(Tag.findOneAndDelete).not.toHaveBeenCalled();
    });

    it('addTag and updateTag return 400 when the name is missing', async () => {
      const add = authedReqRes({ body: {} });
      const upd = authedReqRes({ params: { id: new mongoose.Types.ObjectId().toString() }, body: {} });

      await tagController.addTag(add.req, add.res);
      await tagController.updateTag(upd.req, upd.res);

      expect(add.res.status).toHaveBeenCalledWith(400);
      expect(upd.res.status).toHaveBeenCalledWith(400);
    });

    it('addTag and updateTag return 409 on a duplicate name', async () => {
      const dup = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      Tag.findOne = jest.fn().mockResolvedValue(null);
      Tag.mockImplementation(() => ({ save: jest.fn().mockRejectedValue(dup) }));
      Tag.findOneAndUpdate = jest.fn().mockRejectedValue(dup);
      const add = authedReqRes({ body: { name: 'dup' } });
      const upd = authedReqRes({ params: { id: new mongoose.Types.ObjectId().toString() }, body: { name: 'dup' } });

      await tagController.addTag(add.req, add.res);
      await tagController.updateTag(upd.req, upd.res);

      expect(add.res.status).toHaveBeenCalledWith(409);
      expect(upd.res.status).toHaveBeenCalledWith(409);
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
