// routes/tagRoute.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const tagController = require('../controllers/tagController');

// Get all tags
router.get('/', protect, tagController.getAllTags);

// Add a new tag or get existing
router.post('/', protect, tagController.addTag);

// Update a tag
router.put('/:id', protect, tagController.updateTag);

// Delete a tag
router.delete('/:id', protect, tagController.deleteTag);

module.exports = router;